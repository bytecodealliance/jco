pub(crate) mod async_future;
pub(crate) mod async_stream;
pub(crate) mod async_task;
pub(crate) mod error_context;
pub(crate) mod host;
pub(crate) mod waitable;

pub(crate) const CANNOT_LIFT_FUTURE_IN_WAITABLE_SET: &str =
    "cannot lift future while it's in a waitable set";
pub(crate) const CANNOT_LIFT_STREAM_IN_WAITABLE_SET: &str =
    "cannot lift stream while it's in a waitable set";
pub(crate) const CANNOT_START_CONCURRENT_OPERATION: &str =
    "cannot have concurrent operations active on a future/stream";
/// Trap for using a waitable synchronously while it is in a waitable set, or
/// joining it to one while a synchronous built-in waits on it.
pub(crate) const WAITABLE_SYNC_IN_SET: &str =
    "waitable cannot be used synchronously while added to a waitable set";
/// Trap for cancelling a copy that a synchronous built-in is waiting on.
pub(crate) const CANNOT_CANCEL_SYNC_WAITED_COPY: &str =
    "cannot cancel a copy that a synchronous operation is waiting on";
