//! Conversion of host I/O errors into Node.js-style error codes.

use std::io;

/// Result of a binding whose JavaScript error carries a Node.js-style `code`.
pub type Result<T> = napi::Result<T, String>;

/// Build an error whose JavaScript `code` property is `code`.
pub fn code_error(code: &str, message: impl Into<String>) -> napi::Error<String> {
    napi::Error::new(code.to_owned(), message.into())
}

/// Convert an I/O error, keeping the host's error code where it has one.
///
/// `cap-std` reports a path that would resolve outside of its directory as a
/// `PermissionDenied` error without an OS error code. That case maps to `EPERM`,
/// which distinguishes it from a host permission failure (`EACCES`).
pub fn io_error(error: io::Error) -> napi::Error<String> {
    let code = error
        .raw_os_error()
        .and_then(os_error_code)
        .unwrap_or_else(|| match error.kind() {
            io::ErrorKind::NotFound => "ENOENT",
            io::ErrorKind::PermissionDenied => "EPERM",
            io::ErrorKind::AlreadyExists => "EEXIST",
            io::ErrorKind::InvalidInput | io::ErrorKind::InvalidFilename => "EINVAL",
            io::ErrorKind::NotADirectory => "ENOTDIR",
            io::ErrorKind::IsADirectory => "EISDIR",
            io::ErrorKind::DirectoryNotEmpty => "ENOTEMPTY",
            io::ErrorKind::ReadOnlyFilesystem => "EROFS",
            io::ErrorKind::CrossesDevices => "EXDEV",
            io::ErrorKind::StorageFull => "ENOSPC",
            io::ErrorKind::ResourceBusy => "EBUSY",
            io::ErrorKind::Interrupted => "EINTR",
            io::ErrorKind::Unsupported => "ENOTSUP",
            io::ErrorKind::OutOfMemory => "ENOMEM",
            _ => "EIO",
        });
    code_error(code, error.to_string())
}

/// Name the POSIX error number `raw`, if it is one that filesystem calls report.
#[cfg(unix)]
fn os_error_code(raw: i32) -> Option<&'static str> {
    use rustix::io::Errno;

    Some(match Errno::from_raw_os_error(raw) {
        Errno::ACCESS => "EACCES",
        Errno::AGAIN => "EAGAIN",
        Errno::BADF => "EBADF",
        Errno::BUSY => "EBUSY",
        Errno::DQUOT => "EDQUOT",
        Errno::EXIST => "EEXIST",
        Errno::FBIG => "EFBIG",
        Errno::ILSEQ => "EILSEQ",
        Errno::INTR => "EINTR",
        Errno::INVAL => "EINVAL",
        Errno::IO => "EIO",
        Errno::ISDIR => "EISDIR",
        Errno::LOOP => "ELOOP",
        Errno::MFILE => "EMFILE",
        Errno::MLINK => "EMLINK",
        Errno::NAMETOOLONG => "ENAMETOOLONG",
        Errno::NFILE => "ENFILE",
        Errno::NODEV => "ENODEV",
        Errno::NOENT => "ENOENT",
        Errno::NOMEM => "ENOMEM",
        Errno::NOSPC => "ENOSPC",
        Errno::NOTDIR => "ENOTDIR",
        Errno::NOTEMPTY => "ENOTEMPTY",
        Errno::NOTSUP => "ENOTSUP",
        Errno::NXIO => "ENXIO",
        Errno::OVERFLOW => "EOVERFLOW",
        Errno::PERM => "EPERM",
        Errno::ROFS => "EROFS",
        Errno::TXTBSY => "ETXTBSY",
        Errno::XDEV => "EXDEV",
        _ => return None,
    })
}

/// Name the Win32 error `raw` as the POSIX error that Wasmtime's WASI
/// implementation reports for it.
#[cfg(windows)]
fn os_error_code(raw: i32) -> Option<&'static str> {
    const ERROR_FILE_NOT_FOUND: i32 = 2;
    const ERROR_PATH_NOT_FOUND: i32 = 3;
    const ERROR_ACCESS_DENIED: i32 = 5;
    const ERROR_INVALID_HANDLE: i32 = 6;
    const ERROR_NOT_ENOUGH_MEMORY: i32 = 8;
    const ERROR_OUTOFMEMORY: i32 = 14;
    const ERROR_NOT_SAME_DEVICE: i32 = 17;
    const ERROR_NOT_READY: i32 = 21;
    const ERROR_SHARING_VIOLATION: i32 = 32;
    const ERROR_NOT_SUPPORTED: i32 = 50;
    const ERROR_FILE_EXISTS: i32 = 80;
    const ERROR_BROKEN_PIPE: i32 = 109;
    const ERROR_BUFFER_OVERFLOW: i32 = 111;
    const ERROR_INVALID_NAME: i32 = 123;
    const ERROR_NEGATIVE_SEEK: i32 = 131;
    const ERROR_DIR_NOT_EMPTY: i32 = 145;
    const ERROR_BUSY: i32 = 170;
    const ERROR_ALREADY_EXISTS: i32 = 183;
    const ERROR_DIRECTORY: i32 = 267;
    const ERROR_DIRECTORY_NOT_SUPPORTED: i32 = 336;
    const ERROR_STOPPED_ON_SYMLINK: i32 = 681;
    const ERROR_TOO_MANY_LINKS: i32 = 1142;
    const ERROR_PRIVILEGE_NOT_HELD: i32 = 1314;
    const ERROR_NOT_A_REPARSE_POINT: i32 = 4390;

    Some(match raw {
        ERROR_FILE_NOT_FOUND | ERROR_PATH_NOT_FOUND | ERROR_INVALID_NAME => "ENOENT",
        ERROR_ACCESS_DENIED | ERROR_SHARING_VIOLATION => "EACCES",
        ERROR_PRIVILEGE_NOT_HELD => "EPERM",
        ERROR_INVALID_HANDLE => "EBADF",
        ERROR_NOT_ENOUGH_MEMORY | ERROR_OUTOFMEMORY => "ENOMEM",
        ERROR_NOT_SAME_DEVICE => "EXDEV",
        ERROR_DIR_NOT_EMPTY => "ENOTEMPTY",
        ERROR_NOT_READY | ERROR_BUSY => "EBUSY",
        ERROR_NOT_SUPPORTED => "ENOTSUP",
        ERROR_FILE_EXISTS | ERROR_ALREADY_EXISTS => "EEXIST",
        ERROR_BROKEN_PIPE => "EPIPE",
        ERROR_BUFFER_OVERFLOW => "ENAMETOOLONG",
        ERROR_NOT_A_REPARSE_POINT | ERROR_NEGATIVE_SEEK => "EINVAL",
        ERROR_DIRECTORY => "ENOTDIR",
        // `cap-std` reports a symlink that may not be followed with either code.
        ERROR_STOPPED_ON_SYMLINK | ERROR_TOO_MANY_LINKS => "ELOOP",
        ERROR_DIRECTORY_NOT_SUPPORTED => "EISDIR",
        _ => return None,
    })
}
