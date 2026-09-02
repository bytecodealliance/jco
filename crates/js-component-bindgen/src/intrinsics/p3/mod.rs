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
