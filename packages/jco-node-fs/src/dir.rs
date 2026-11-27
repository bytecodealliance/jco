//! Directory handles whose path operations cannot resolve outside of them.
//!
//! Every operation is performed relative to an open directory through
//! `cap-std`, which resolves paths beneath that directory: `..`, absolute paths
//! and symlinks that lead outside of it fail instead of being followed. This
//! mirrors how Wasmtime's WASI implementation performs filesystem calls.
//!
//! Each operation has a synchronous binding, which runs on the calling thread,
//! and an asynchronous one, which runs on libuv's thread pool.

use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, SystemTime};

use cap_fs_ext::{
    DirExt, FileTypeExt, FollowSymlinks, MetadataExt, OpenOptionsFollowExt, OpenOptionsMaybeDirExt,
    OpenOptionsSyncExt, SystemTimeSpec,
};
use cap_std::ambient_authority;
use cap_std::fs::{Dir, File, FileType, Metadata, OpenOptions};
use napi::bindgen_prelude::{AsyncTask, BigInt, Either, ToNapiValue, TypeName};
use napi::{Env, Task};
use napi_derive::napi;

use crate::error::{Result, code_error, error_code, io_error};

const NANOSECONDS_PER_SECOND: i128 = 1_000_000_000;

/// How `DirHandle::open_at` opens a path.
#[napi(object)]
pub struct OpenAtOptions {
    /// Open for reading. A handle that is not opened for writing is always readable.
    pub read: bool,
    /// Open for writing.
    pub write: bool,
    /// Create the file if it does not exist.
    pub create: bool,
    /// Together with `create`, fail if the path exists.
    pub exclusive: bool,
    /// Truncate the file to zero length.
    pub truncate: bool,
    /// Fail unless the path is a directory.
    pub directory: bool,
    /// Follow a symlink in the final path component.
    pub follow: bool,
    /// Complete each write only once data and metadata reach the device.
    pub sync: bool,
    /// Complete each write only once data reaches the device.
    pub dsync: bool,
}

/// Attributes of a filesystem object.
#[napi(object)]
pub struct StatRaw {
    /// One of `directory`, `regular-file`, `symbolic-link`, `block-device`,
    /// `character-device`, `fifo`, `socket` or `unknown`.
    #[napi(js_name = "type")]
    pub kind: String,
    pub dev: BigInt,
    pub ino: BigInt,
    pub nlink: BigInt,
    pub size: BigInt,
    /// Nanoseconds since the Unix epoch.
    pub atime_ns: BigInt,
    pub mtime_ns: BigInt,
    pub ctime_ns: BigInt,
}

/// An entry of a directory listing.
#[napi(object)]
pub struct DirEntryRaw {
    pub name: String,
    /// See `StatRaw::kind`.
    #[napi(js_name = "type")]
    pub kind: String,
}

/// Why an asynchronous operation failed.
///
/// An asynchronous binding resolves with this instead of rejecting, as a
/// rejection could not carry the error code. The JavaScript wrapper turns it
/// into the same error that the synchronous binding throws.
#[napi(object)]
pub struct FailureRaw {
    /// Node.js-style error code, such as `ENOENT`.
    pub failure_code: String,
    pub failure_message: String,
}

/// A directory operation that runs on libuv's thread pool.
///
/// The operation owns what it needs, in particular a reference to its
/// directory, which therefore stays open until the operation has finished.
pub struct DirTask<T> {
    /// `None` once run.
    operation: Option<Box<dyn FnOnce() -> io::Result<T> + Send>>,
}

impl<T> DirTask<T>
where
    T: Send + ToNapiValue + TypeName + 'static,
{
    fn spawn(operation: impl FnOnce() -> io::Result<T> + Send + 'static) -> AsyncTask<Self> {
        AsyncTask::new(Self {
            operation: Some(Box::new(operation)),
        })
    }
}

impl<T> Task for DirTask<T>
where
    T: Send + ToNapiValue + TypeName + 'static,
{
    type Output = std::result::Result<T, FailureRaw>;
    type JsValue = Either<T, FailureRaw>;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let operation = self
            .operation
            .take()
            .ok_or_else(|| napi::Error::from_reason("directory operation ran twice"))?;
        Ok(operation().map_err(|error| FailureRaw {
            failure_code: error_code(&error).to_owned(),
            failure_message: error.to_string(),
        }))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(match output {
            Ok(value) => Either::A(value),
            Err(failure) => Either::B(failure),
        })
    }
}

/// An open directory.
///
/// This is an internal binding. The JavaScript wrapper validates arguments,
/// adds `syscall` and `path` to errors, and rejects with the failure that an
/// asynchronous binding resolves with.
#[napi]
pub struct DirHandle {
    /// `None` once closed. Shared with the asynchronous operations in flight,
    /// which keep the directory open until they finish.
    ///
    /// Closing must work while such an operation is in flight, during which the
    /// handle cannot be borrowed mutably, hence the interior mutability.
    dir: Mutex<Option<Arc<Dir>>>,
}

impl DirHandle {
    fn new(dir: Dir) -> Self {
        Self {
            dir: Mutex::new(Some(Arc::new(dir))),
        }
    }

    /// The directory, which stays open for as long as the returned reference lives.
    fn dir(&self) -> Result<Arc<Dir>> {
        self.dir
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
            .ok_or_else(|| code_error("EBADF", "directory handle is closed"))
    }
}

#[napi]
impl DirHandle {
    /// Open a host directory by path, with the authority of the process.
    ///
    /// This and its asynchronous form are the only bindings that are not
    /// confined to a directory handle.
    #[napi(factory)]
    pub fn open_ambient(path: String) -> Result<Self> {
        open_ambient(path).map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<DirHandle | FailureRaw>")]
    pub fn open_ambient_async(path: String) -> AsyncTask<DirTask<DirHandle>> {
        DirTask::spawn(move || open_ambient(path))
    }

    /// Release the directory. Later calls fail with `EBADF`, while asynchronous
    /// operations that are in flight finish on the directory.
    #[napi]
    pub fn close(&self) {
        *self.dir.lock().unwrap_or_else(PoisonError::into_inner) = None;
    }

    /// Open a file or directory beneath this directory.
    ///
    /// A directory is returned as a new handle. Anything else is returned as a
    /// file descriptor that Node.js can use, which the caller must close.
    #[napi]
    pub fn open_at(&self, path: String, options: OpenAtOptions) -> Result<Either<DirHandle, i32>> {
        open_at(self.dir()?.as_ref(), path.as_ref(), &options).map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<DirHandle | number | FailureRaw>")]
    pub fn open_at_async(
        &self,
        path: String,
        options: OpenAtOptions,
    ) -> Result<AsyncTask<DirTask<Either<DirHandle, i32>>>> {
        let dir = self.dir()?;
        Ok(DirTask::spawn(move || {
            open_at(&dir, path.as_ref(), &options)
        }))
    }

    /// Return the attributes of this directory.
    #[napi]
    pub fn stat(&self) -> Result<StatRaw> {
        stat(self.dir()?.as_ref()).map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<StatRaw | FailureRaw>")]
    pub fn stat_async(&self) -> Result<AsyncTask<DirTask<StatRaw>>> {
        let dir = self.dir()?;
        Ok(DirTask::spawn(move || stat(&dir)))
    }

    /// Return the attributes of a path beneath this directory.
    #[napi]
    pub fn stat_at(&self, path: String, follow: bool) -> Result<StatRaw> {
        stat_at(self.dir()?.as_ref(), path.as_ref(), follow).map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<StatRaw | FailureRaw>")]
    pub fn stat_at_async(&self, path: String, follow: bool) -> Result<AsyncTask<DirTask<StatRaw>>> {
        let dir = self.dir()?;
        Ok(DirTask::spawn(move || stat_at(&dir, path.as_ref(), follow)))
    }

    /// Return the target of a symlink, exactly as stored.
    #[napi]
    pub fn readlink_at(&self, path: String) -> Result<String> {
        readlink_at(self.dir()?.as_ref(), path.as_ref()).map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<string | FailureRaw>")]
    pub fn readlink_at_async(&self, path: String) -> Result<AsyncTask<DirTask<String>>> {
        let dir = self.dir()?;
        Ok(DirTask::spawn(move || readlink_at(&dir, path.as_ref())))
    }

    /// Create a directory.
    #[napi]
    pub fn create_dir_at(&self, path: String) -> Result<()> {
        self.dir()?.create_dir(path).map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<void | FailureRaw>")]
    pub fn create_dir_at_async(&self, path: String) -> Result<AsyncTask<DirTask<()>>> {
        let dir = self.dir()?;
        Ok(DirTask::spawn(move || dir.create_dir(path)))
    }

    /// Remove an empty directory.
    #[napi]
    pub fn remove_dir_at(&self, path: String) -> Result<()> {
        self.dir()?.remove_dir(path).map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<void | FailureRaw>")]
    pub fn remove_dir_at_async(&self, path: String) -> Result<AsyncTask<DirTask<()>>> {
        let dir = self.dir()?;
        Ok(DirTask::spawn(move || dir.remove_dir(path)))
    }

    /// Remove a file or symlink. A symlink is removed, not its target.
    #[napi]
    pub fn unlink_at(&self, path: String) -> Result<()> {
        self.dir()?.remove_file_or_symlink(path).map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<void | FailureRaw>")]
    pub fn unlink_at_async(&self, path: String) -> Result<AsyncTask<DirTask<()>>> {
        let dir = self.dir()?;
        Ok(DirTask::spawn(move || dir.remove_file_or_symlink(path)))
    }

    /// Rename a path beneath this directory to a path beneath `new_dir`.
    #[napi]
    pub fn rename_at(&self, old_path: String, new_dir: &DirHandle, new_path: String) -> Result<()> {
        self.dir()?
            .rename(old_path, new_dir.dir()?.as_ref(), new_path)
            .map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<void | FailureRaw>")]
    pub fn rename_at_async(
        &self,
        old_path: String,
        new_dir: &DirHandle,
        new_path: String,
    ) -> Result<AsyncTask<DirTask<()>>> {
        let (dir, new_dir) = (self.dir()?, new_dir.dir()?);
        Ok(DirTask::spawn(move || {
            dir.rename(old_path, &new_dir, new_path)
        }))
    }

    /// Create a hard link beneath `new_dir`.
    ///
    /// A symlink at `old_path` is linked itself unless `follow` is set. The host
    /// cannot follow it while linking, so with `follow` the path is resolved
    /// beneath this directory first and the result is linked.
    #[napi]
    pub fn link_at(
        &self,
        old_path: String,
        new_dir: &DirHandle,
        new_path: String,
        follow: Option<bool>,
    ) -> Result<()> {
        let follow = follow.unwrap_or(false);
        link_at(
            self.dir()?.as_ref(),
            old_path,
            new_dir.dir()?.as_ref(),
            new_path,
            follow,
        )
        .map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<void | FailureRaw>")]
    pub fn link_at_async(
        &self,
        old_path: String,
        new_dir: &DirHandle,
        new_path: String,
        follow: Option<bool>,
    ) -> Result<AsyncTask<DirTask<()>>> {
        let (dir, new_dir) = (self.dir()?, new_dir.dir()?);
        let follow = follow.unwrap_or(false);
        Ok(DirTask::spawn(move || {
            link_at(&dir, old_path, &new_dir, new_path, follow)
        }))
    }

    /// Create a symlink at `path` that refers to `target`.
    ///
    /// An absolute `target` is refused, as it could not be followed.
    #[napi]
    pub fn symlink_at(&self, target: String, path: String) -> Result<()> {
        DirExt::symlink(self.dir()?.as_ref(), target, path).map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<void | FailureRaw>")]
    pub fn symlink_at_async(&self, target: String, path: String) -> Result<AsyncTask<DirTask<()>>> {
        let dir = self.dir()?;
        Ok(DirTask::spawn(move || {
            DirExt::symlink(dir.as_ref(), target, path)
        }))
    }

    /// Set the access and modification times of this directory.
    #[napi]
    pub fn set_times(
        &self,
        atime: Option<Either<BigInt, String>>,
        mtime: Option<Either<BigInt, String>>,
    ) -> Result<()> {
        let (atime, mtime) = (time_spec(atime)?, time_spec(mtime)?);
        set_times_at(
            self.dir()?.as_ref(),
            Component::CurDir.as_ref(),
            atime,
            mtime,
            true,
        )
        .map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<void | FailureRaw>")]
    pub fn set_times_async(
        &self,
        atime: Option<Either<BigInt, String>>,
        mtime: Option<Either<BigInt, String>>,
    ) -> Result<AsyncTask<DirTask<()>>> {
        let (atime, mtime) = (time_spec(atime)?, time_spec(mtime)?);
        let dir = self.dir()?;
        Ok(DirTask::spawn(move || {
            set_times_at(&dir, Component::CurDir.as_ref(), atime, mtime, true)
        }))
    }

    /// Set the access and modification times of a path beneath this directory.
    #[napi]
    pub fn set_times_at(
        &self,
        path: String,
        atime: Option<Either<BigInt, String>>,
        mtime: Option<Either<BigInt, String>>,
        follow: bool,
    ) -> Result<()> {
        let (atime, mtime) = (time_spec(atime)?, time_spec(mtime)?);
        set_times_at(self.dir()?.as_ref(), path.as_ref(), atime, mtime, follow).map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<void | FailureRaw>")]
    pub fn set_times_at_async(
        &self,
        path: String,
        atime: Option<Either<BigInt, String>>,
        mtime: Option<Either<BigInt, String>>,
        follow: bool,
    ) -> Result<AsyncTask<DirTask<()>>> {
        let (atime, mtime) = (time_spec(atime)?, time_spec(mtime)?);
        let dir = self.dir()?;
        Ok(DirTask::spawn(move || {
            set_times_at(&dir, path.as_ref(), atime, mtime, follow)
        }))
    }

    /// Flush this directory to its device.
    #[napi]
    pub fn sync(&self) -> Result<()> {
        sync(self.dir()?.as_ref()).map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<void | FailureRaw>")]
    pub fn sync_async(&self) -> Result<AsyncTask<DirTask<()>>> {
        let dir = self.dir()?;
        Ok(DirTask::spawn(move || sync(&dir)))
    }

    /// List this directory, without `.` and `..`.
    #[napi]
    pub fn read_dir(&self) -> Result<Vec<DirEntryRaw>> {
        read_dir(self.dir()?.as_ref()).map_err(io_error)
    }

    #[napi(ts_return_type = "Promise<Array<DirEntryRaw> | FailureRaw>")]
    pub fn read_dir_async(&self) -> Result<AsyncTask<DirTask<Vec<DirEntryRaw>>>> {
        let dir = self.dir()?;
        Ok(DirTask::spawn(move || read_dir(&dir)))
    }
}

fn open_ambient(path: String) -> io::Result<DirHandle> {
    Dir::open_ambient_dir(path, ambient_authority()).map(DirHandle::new)
}

fn open_at(dir: &Dir, path: &Path, options: &OpenAtOptions) -> io::Result<Either<DirHandle, i32>> {
    if options.directory && (options.create || options.exclusive || options.truncate) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "cannot create or truncate a directory",
        ));
    }

    let mut open_options = OpenOptions::new();
    // A file that is not opened for writing is opened for reading, as an
    // open file must have some access mode.
    open_options.read(options.read || !options.write);
    open_options.write(options.write || options.create || options.truncate);
    if options.create && options.exclusive {
        open_options.create_new(true);
    } else {
        open_options.create(options.create);
    }
    open_options.truncate(options.truncate);
    open_options.follow(follow_symlinks(options.follow));
    open_options.maybe_dir(true);
    if options.sync {
        open_options.sync(true);
    }
    if options.dsync {
        open_options.dsync(true);
    }
    if options.directory {
        sys::require_directory(&mut open_options);
    }

    let file = dir.open_with(path, &open_options)?;
    if file.metadata()?.is_dir() {
        let dir = Dir::from_std_file(file.into_std());
        return Ok(Either::A(DirHandle::new(dir)));
    }
    if options.directory {
        return Err(io::Error::new(
            io::ErrorKind::NotADirectory,
            "not a directory",
        ));
    }
    sys::into_node_fd(file).map(Either::B)
}

fn stat(dir: &Dir) -> io::Result<StatRaw> {
    dir.dir_metadata().map(|metadata| stat_raw(&metadata))
}

fn stat_at(dir: &Dir, path: &Path, follow: bool) -> io::Result<StatRaw> {
    sys::stat_at(dir, path, follow).map(|metadata| stat_raw(&metadata))
}

fn readlink_at(dir: &Dir, path: &Path) -> io::Result<String> {
    dir.read_link_contents(path)?
        .into_os_string()
        .into_string()
        .map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "symlink target is not valid Unicode",
            )
        })
}

fn link_at(
    dir: &Dir,
    old_path: String,
    new_dir: &Dir,
    new_path: String,
    follow: bool,
) -> io::Result<()> {
    let old_path = if follow {
        dir.canonicalize(old_path)?
    } else {
        PathBuf::from(old_path)
    };
    dir.hard_link(old_path, new_dir, new_path)
}

/// Set the times of a path, or of a final symlink itself without `follow`.
fn set_times_at(
    dir: &Dir,
    path: &Path,
    atime: Option<SystemTimeSpec>,
    mtime: Option<SystemTimeSpec>,
    follow: bool,
) -> io::Result<()> {
    if follow {
        DirExt::set_times(dir, path, atime, mtime)
    } else {
        dir.set_symlink_times(path, atime, mtime)
    }
}

fn sync(dir: &Dir) -> io::Result<()> {
    // The handle itself may lack the access rights that a flush needs.
    dir.open(Component::CurDir)?.sync_all()
}

fn read_dir(dir: &Dir) -> io::Result<Vec<DirEntryRaw>> {
    let mut entries = Vec::new();
    for entry in dir.entries()? {
        let entry = entry?;
        entries.push(DirEntryRaw {
            name: entry.file_name().to_string_lossy().into_owned(),
            kind: type_name(entry.file_type()?).to_owned(),
        });
    }
    Ok(entries)
}

/// Convert a time to set: nanoseconds since the Unix epoch, or `"now"`. `None`
/// leaves the time unchanged.
fn time_spec(time: Option<Either<BigInt, String>>) -> Result<Option<SystemTimeSpec>> {
    let invalid = || code_error("EINVAL", "invalid timestamp");
    let nanoseconds = match time {
        None => return Ok(None),
        Some(Either::B(symbolic)) if symbolic == "now" => {
            return Ok(Some(SystemTimeSpec::SymbolicNow));
        }
        Some(Either::B(_)) => return Err(invalid()),
        Some(Either::A(nanoseconds)) => match nanoseconds.get_i128() {
            (nanoseconds, true) => nanoseconds,
            (_, false) => return Err(invalid()),
        },
    };

    let magnitude = nanoseconds.unsigned_abs();
    let seconds =
        u64::try_from(magnitude / NANOSECONDS_PER_SECOND.unsigned_abs()).map_err(|_| invalid())?;
    let subsecond_nanoseconds = (magnitude % NANOSECONDS_PER_SECOND.unsigned_abs()) as u32;
    let offset = Duration::new(seconds, subsecond_nanoseconds);
    let time = if nanoseconds < 0 {
        SystemTime::UNIX_EPOCH.checked_sub(offset)
    } else {
        SystemTime::UNIX_EPOCH.checked_add(offset)
    };
    let time = cap_std::time::SystemTime::from_std(time.ok_or_else(invalid)?);
    Ok(Some(SystemTimeSpec::Absolute(time)))
}

fn follow_symlinks(follow: bool) -> FollowSymlinks {
    if follow {
        FollowSymlinks::Yes
    } else {
        FollowSymlinks::No
    }
}

/// Nanoseconds between the Unix epoch and `time`, zero if the host has no such time.
fn nanoseconds_since_epoch(time: io::Result<cap_std::time::SystemTime>) -> i128 {
    let Ok(time) = time.map(cap_std::time::SystemTime::into_std) else {
        return 0;
    };
    match time.duration_since(SystemTime::UNIX_EPOCH) {
        Ok(after) => after.as_nanos() as i128,
        Err(before) => -(before.duration().as_nanos() as i128),
    }
}

fn stat_raw(metadata: &Metadata) -> StatRaw {
    StatRaw {
        kind: type_name(metadata.file_type()).to_owned(),
        dev: metadata.dev().into(),
        ino: metadata.ino().into(),
        nlink: metadata.nlink().into(),
        size: metadata.len().into(),
        atime_ns: nanoseconds_since_epoch(metadata.accessed()).into(),
        mtime_ns: nanoseconds_since_epoch(metadata.modified()).into(),
        ctime_ns: sys::status_change_nanoseconds(metadata).into(),
    }
}

fn type_name(file_type: FileType) -> &'static str {
    if file_type.is_dir() {
        "directory"
    } else if file_type.is_file() {
        "regular-file"
    } else if file_type.is_symlink() {
        "symbolic-link"
    } else if file_type.is_block_device() {
        "block-device"
    } else if file_type.is_char_device() {
        "character-device"
    } else if file_type.is_fifo() {
        "fifo"
    } else if file_type.is_socket() {
        "socket"
    } else {
        "unknown"
    }
}

#[cfg(unix)]
mod sys {
    use std::os::fd::IntoRawFd;

    use cap_std::fs::{MetadataExt, OpenOptionsExt};

    use super::*;

    /// Make the open fail on anything but a directory, with the host's own errors.
    pub fn require_directory(options: &mut OpenOptions) {
        options.custom_flags(rustix::fs::OFlags::DIRECTORY.bits() as i32);
    }

    /// Hand the file to Node.js, whose file descriptors are the host's.
    pub fn into_node_fd(file: File) -> io::Result<i32> {
        Ok(file.into_std().into_raw_fd())
    }

    pub fn stat_at(dir: &Dir, path: &Path, follow: bool) -> io::Result<Metadata> {
        if follow {
            dir.metadata(path)
        } else {
            dir.symlink_metadata(path)
        }
    }

    pub fn status_change_nanoseconds(metadata: &Metadata) -> i128 {
        i128::from(metadata.ctime()) * NANOSECONDS_PER_SECOND + i128::from(metadata.ctime_nsec())
    }
}

#[cfg(windows)]
mod sys {
    use std::ffi::{c_int, c_void};
    use std::os::windows::io::{FromRawHandle, IntoRawHandle, OwnedHandle};
    use std::sync::OnceLock;

    use cap_std::fs::OpenOptionsExt;

    use super::*;

    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;

    /// `uv_open_osfhandle`, which wraps a handle in a C runtime file descriptor.
    type OpenOsHandle = unsafe extern "C" fn(*mut c_void) -> c_int;

    /// The open is checked afterwards, as Windows has no `O_DIRECTORY`.
    pub fn require_directory(_options: &mut OpenOptions) {}

    /// Hand the file to Node.js, whose file descriptors belong to its C runtime.
    ///
    /// Node.js links its own copy of the C runtime, so a descriptor made by this
    /// library's `_open_osfhandle` would be unknown to it. libuv exports the
    /// same operation from the Node.js executable, which uses the right copy.
    pub fn into_node_fd(file: File) -> io::Result<i32> {
        static OPEN_OS_HANDLE: OnceLock<Option<OpenOsHandle>> = OnceLock::new();

        let open_os_handle = OPEN_OS_HANDLE.get_or_init(|| {
            let host = libloading::os::windows::Library::this().ok()?;
            // SAFETY: The signature is that of libuv's `uv_open_osfhandle`.
            let symbol = unsafe { host.get::<OpenOsHandle>("uv_open_osfhandle") }.ok()?;
            Some(*symbol)
        });
        let Some(open_os_handle) = open_os_handle else {
            return Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "this runtime does not export uv_open_osfhandle",
            ));
        };

        let handle = file.into_std().into_raw_handle();
        // SAFETY: The handle is open and owned here. On success the descriptor
        // owns it, so it is only closed here on failure.
        let fd = unsafe { open_os_handle(handle.cast()) };
        if fd < 0 {
            drop(unsafe { OwnedHandle::from_raw_handle(handle) });
            return Err(io::Error::other("could not create a file descriptor"));
        }
        Ok(fd)
    }

    /// Stat through an open handle, which is what provides the link count and
    /// file identity on Windows. No access rights are requested, and without
    /// `follow` a final symlink is opened itself rather than followed.
    pub fn stat_at(dir: &Dir, path: &Path, follow: bool) -> io::Result<Metadata> {
        let mut options = OpenOptions::new();
        options.access_mode(0);
        options.custom_flags(if follow {
            FILE_FLAG_BACKUP_SEMANTICS
        } else {
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT
        });
        dir.open_with(path, &options)?.metadata()
    }

    /// Windows does not expose a change time, so the creation time stands in.
    pub fn status_change_nanoseconds(metadata: &Metadata) -> i128 {
        nanoseconds_since_epoch(metadata.created())
    }
}
