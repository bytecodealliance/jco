//! Directory handles whose path operations cannot resolve outside of them.
//!
//! Every operation is performed relative to an open directory through
//! `cap-std`, which resolves paths beneath that directory: `..`, absolute paths
//! and symlinks that lead outside of it fail instead of being followed. This
//! mirrors how Wasmtime's WASI implementation performs filesystem calls.

use std::io;
use std::path::{Component, Path};
use std::time::{Duration, SystemTime};

use cap_fs_ext::{
    DirExt, FileTypeExt, FollowSymlinks, MetadataExt, OpenOptionsFollowExt, OpenOptionsMaybeDirExt,
    OpenOptionsSyncExt, SystemTimeSpec,
};
use cap_std::ambient_authority;
use cap_std::fs::{Dir, File, FileType, Metadata, OpenOptions};
use napi::bindgen_prelude::{BigInt, Either};
use napi_derive::napi;

use crate::error::{Result, code_error, io_error};

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

/// An open directory.
///
/// This is an internal binding. The JavaScript wrapper validates arguments and
/// adds `syscall` and `path` to errors.
#[napi]
pub struct DirHandle {
    /// `None` once closed.
    dir: Option<Dir>,
}

impl DirHandle {
    fn dir(&self) -> Result<&Dir> {
        self.dir
            .as_ref()
            .ok_or_else(|| code_error("EBADF", "directory handle is closed"))
    }
}

#[napi]
impl DirHandle {
    /// Open a host directory by path, with the authority of the process.
    ///
    /// This is the only binding that is not confined to a directory handle.
    #[napi(factory)]
    pub fn open_ambient(path: String) -> Result<Self> {
        let dir = Dir::open_ambient_dir(path, ambient_authority()).map_err(io_error)?;
        Ok(Self { dir: Some(dir) })
    }

    /// Release the directory. Later calls fail with `EBADF`.
    #[napi]
    pub fn close(&mut self) {
        self.dir = None;
    }

    /// Open a file or directory beneath this directory.
    ///
    /// A directory is returned as a new handle. Anything else is returned as a
    /// file descriptor that Node.js can use, which the caller must close.
    #[napi]
    pub fn open_at(&self, path: String, options: OpenAtOptions) -> Result<Either<DirHandle, i32>> {
        if options.directory && (options.create || options.exclusive || options.truncate) {
            return Err(code_error(
                "EINVAL",
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

        let file = self
            .dir()?
            .open_with(&path, &open_options)
            .map_err(io_error)?;
        if file.metadata().map_err(io_error)?.is_dir() {
            let dir = Dir::from_std_file(file.into_std());
            return Ok(Either::A(DirHandle { dir: Some(dir) }));
        }
        if options.directory {
            return Err(code_error("ENOTDIR", "not a directory"));
        }
        sys::into_node_fd(file).map(Either::B).map_err(io_error)
    }

    /// Return the attributes of this directory.
    #[napi]
    pub fn stat(&self) -> Result<StatRaw> {
        let metadata = self.dir()?.dir_metadata().map_err(io_error)?;
        Ok(stat_raw(&metadata))
    }

    /// Return the attributes of a path beneath this directory.
    #[napi]
    pub fn stat_at(&self, path: String, follow: bool) -> Result<StatRaw> {
        let metadata = sys::stat_at(self.dir()?, path.as_ref(), follow).map_err(io_error)?;
        Ok(stat_raw(&metadata))
    }

    /// Return the target of a symlink, exactly as stored.
    #[napi]
    pub fn readlink_at(&self, path: String) -> Result<String> {
        self.dir()?
            .read_link_contents(path)
            .map_err(io_error)?
            .into_os_string()
            .into_string()
            .map_err(|_| code_error("EILSEQ", "symlink target is not valid Unicode"))
    }

    /// Create a directory.
    #[napi]
    pub fn create_dir_at(&self, path: String) -> Result<()> {
        self.dir()?.create_dir(path).map_err(io_error)
    }

    /// Remove an empty directory.
    #[napi]
    pub fn remove_dir_at(&self, path: String) -> Result<()> {
        self.dir()?.remove_dir(path).map_err(io_error)
    }

    /// Remove a file or symlink. A symlink is removed, not its target.
    #[napi]
    pub fn unlink_at(&self, path: String) -> Result<()> {
        self.dir()?.remove_file_or_symlink(path).map_err(io_error)
    }

    /// Rename a path beneath this directory to a path beneath `new_dir`.
    #[napi]
    pub fn rename_at(&self, old_path: String, new_dir: &DirHandle, new_path: String) -> Result<()> {
        self.dir()?
            .rename(old_path, new_dir.dir()?, new_path)
            .map_err(io_error)
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
        let dir = self.dir()?;
        let old_path = if follow.unwrap_or(false) {
            dir.canonicalize(old_path).map_err(io_error)?
        } else {
            old_path.into()
        };
        dir.hard_link(old_path, new_dir.dir()?, new_path)
            .map_err(io_error)
    }

    /// Create a symlink at `path` that refers to `target`.
    ///
    /// An absolute `target` is refused, as it could not be followed.
    #[napi]
    pub fn symlink_at(&self, target: String, path: String) -> Result<()> {
        DirExt::symlink(self.dir()?, target, path).map_err(io_error)
    }

    /// Set the access and modification times of this directory.
    #[napi]
    pub fn set_times(
        &self,
        atime: Option<Either<BigInt, String>>,
        mtime: Option<Either<BigInt, String>>,
    ) -> Result<()> {
        let (atime, mtime) = (time_spec(atime)?, time_spec(mtime)?);
        DirExt::set_times(self.dir()?, Component::CurDir, atime, mtime).map_err(io_error)
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
        let dir = self.dir()?;
        if follow {
            DirExt::set_times(dir, path, atime, mtime)
        } else {
            dir.set_symlink_times(path, atime, mtime)
        }
        .map_err(io_error)
    }

    /// Flush this directory to its device.
    #[napi]
    pub fn sync(&self) -> Result<()> {
        // The handle itself may lack the access rights that a flush needs.
        self.dir()?
            .open(Component::CurDir)
            .and_then(|directory| directory.sync_all())
            .map_err(io_error)
    }

    /// List this directory, without `.` and `..`.
    #[napi]
    pub fn read_dir(&self) -> Result<Vec<DirEntryRaw>> {
        let mut entries = Vec::new();
        for entry in self.dir()?.entries().map_err(io_error)? {
            let entry = entry.map_err(io_error)?;
            let kind = entry.file_type().map(type_name).map_err(io_error)?;
            let name = entry.file_name().to_string_lossy().into_owned();
            entries.push(DirEntryRaw {
                name,
                kind: kind.to_owned(),
            });
        }
        Ok(entries)
    }
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
            return Err(io::Error::new(
                io::ErrorKind::Other,
                "could not create a file descriptor",
            ));
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
