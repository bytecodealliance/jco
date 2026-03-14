//! Intrinsics that represent helpers that enable Stream integration

use crate::{
    intrinsics::{Intrinsic, component::ComponentIntrinsic},
    source::Source,
};

use super::async_task::AsyncTaskIntrinsic;

/// This enum contains intrinsics that enable Stream
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum AsyncStreamIntrinsic {
    /// Global that stores streams
    ///
    /// ```ts
    /// type i32 = number;
    /// type StreamEnd = StreamWritableEndClass | StreamReadableEndClass;
    /// type GlobalStreamMap<T> = Map<i32, StreamEnd>;
    /// ```
    GlobalStreamMap,

    /// Map of stream tables to component indices
    GlobalStreamTableMap,

    /// The definition of the `StreamEnd` JS superclass
    StreamEndClass,

    /// The definition of the `InternalStream` JS class (which inherits from the `StreamEnd` superclass)
    ///
    /// This class serves as a shared implementation used by writable and readable ends,
    /// that is meant to be used internally to generated code.
    InternalStreamClass,

    /// The definition of the `StreamReadableEnd` JS class
    StreamReadableEndClass,

    /// The definition of the `StreamWritableEnd` JS class
    StreamWritableEndClass,

    /// The definition of the `HostStream` JS class
    ///
    /// This class serves as an implementation for top level host-managed streams,
    /// internal to the bindgen generated logic.
    ///
    /// External code is no expected to work in terms of `HostStream`, but rather deal with `Stream`s
    ///
    HostStreamClass,

    /// The definition of the `Stream` JS class for use with external clients/SDKs
    ///
    /// This class serves as an user-facing implementation of a Preview3 `stream`.
    /// Usually this class is created via `HostStream#createStream()`.
    ///
    ExternalStreamClass,

    /// Create a new stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturenew
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >= 0
    /// type u64 = bigint; // >= 0
    /// function streamNew(typeRep: u32): u64;
    /// ```
    StreamNew,

    /// Create a new stream during a lift (`Instruction::StreamLift`).
    ///
    /// This is distinct from plain stream creation, because we are provided more information,
    /// particularly the relevant types to teh stream and lift/lower fns for the stream.
    ///
    /// ```ts
    /// type params = {
    ///     componentIdx: number,
    ///     streamTypeRep: number,
    ///     payloadLiftFn: Array<Function>,
    ///     payloadLowerFn: Array<Function>,
    ///     isUnitStream: boolean,
    /// }
    /// function streamNewFromLift(p: params);
    /// ```
    ///
    StreamNewFromLift,

    /// Read from a stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturereadwrite
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type u32 = number; // >=0
    /// type i64 = bigint;
    /// type StringEncoding = 'utf8' | 'utf16' | 'compact-utf16'; // see wasmtime_environ::StringEncoding
    ///
    /// function streamRead(
    ///     componentIdx: i32,
    ///     memory: i32,
    ///     realloc: i32,
    ///     encoding: StringEncoding,
    ///     isAsync: bool,
    ///     typeRep: u32,
    ///     streamRep: u32,
    ///     ptr: u32,
    ///     count:u322
    /// ): i64;
    /// ```
    StreamRead,

    /// Write to a stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturereadwrite
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type i32 = number;
    /// type u32 = number; // >=0
    /// type i64 = bigint;
    /// type StringEncoding = 'utf8' | 'utf16' | 'compact-utf16'; // see wasmtime_environ::StringEncoding
    ///
    /// function streamWrite(
    ///     componentIdx: i32,
    ///     memory: i32,
    ///     realloc: i32,
    ///     encoding: StringEncoding,
    ///     isAsync: bool,
    ///     typeRep: u32,
    ///     streamRep: u32,
    ///     ptr: u32,
    ///     count:u322
    /// ): i64;
    /// ```
    StreamWrite,

    /// Cancel a read to a stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturecancel-readread
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    /// type u64 = bigint; // >= 0
    ///
    /// function streamCancelRead(streamRep: u32, isAsync: boolean, readerRep: u32): u64;
    /// ```
    StreamCancelRead,

    /// Cancel a write to a stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturecancel-writewrite
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    /// type u64 = bigint; // >= 0
    ///
    /// function streamCancelWrite(streamRep: u32, isAsync: boolean, writerRep: u32): u64;
    /// ```
    StreamCancelWrite,

    /// Drop a the readable end of a Stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturedrop-readablewritable
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    ///
    /// function streamDropReadable(streamRep: u32, readerRep: u32): bool;
    /// ```
    StreamDropReadable,

    /// Drop a the writable end of a Stream
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturedrop-readablewritable
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    ///
    /// function streamDropWritable(streamRep: u32, writerRep: u32): bool;
    /// ```
    StreamDropWritable,

    /// Transfer a given stream from one component to another
    ///
    /// Note that all arguments for a stream transfer are provided via arguments at runtime,
    /// and is generally called from the *guest* component (or at least the guest component idx is
    /// discernable via the current task).
    ///
    /// ```ts
    /// type u32 = number;
    ///
    /// function streamTransfer(srcComponentIdx: u32, srcTableIdx: u32, destTableIdx: u32): bool;
    /// ```
    StreamTransfer,
}

impl AsyncStreamIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for this intrinsic
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        []
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::GlobalStreamMap => "STREAMS",
            Self::GlobalStreamTableMap => "STREAM_TABLES",
            Self::StreamEndClass => "StreamEnd",
            Self::InternalStreamClass => "InternalStream",
            Self::StreamWritableEndClass => "StreamWritableEnd",
            Self::StreamReadableEndClass => "StreamReadableEnd",
            Self::HostStreamClass => "HostStream",
            Self::ExternalStreamClass => "Stream",
            Self::StreamNew => "streamNew",
            Self::StreamNewFromLift => "streamNewFromLift",
            Self::StreamRead => "streamRead",
            Self::StreamWrite => "streamWrite",
            Self::StreamDropReadable => "streamDropReadable",
            Self::StreamDropWritable => "streamDropWritable",
            Self::StreamTransfer => "streamTransfer",
            Self::StreamCancelRead => "streamCancelRead",
            Self::StreamCancelWrite => "streamCancelWrite",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::StreamEndClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_end_class = Self::StreamEndClass.name();
                output.push_str(&format!(
                    r#"
                    class {stream_end_class} {{
                        static CopyResult = {{
                            COMPLETED: 0,
                            DROPPED: 1,
                            CANCELLED: 2,
                        }};

                        static CopyState = {{
                            IDLE: 1,
                            SYNC_COPYING: 2,
                            ASYNC_COPYING: 3,
                            CANCELLING_COPY: 4,
                            DONE: 5,
                        }};

                        #waitable = null;

                        #tableIdx = null; // stream table that contains the stream end
                        #idx = null; // stream end index in the table

                        #componentIdx = null;
                        #dropped = false;
                        #onDrop;

                        #copyState = {stream_end_class}.CopyState.IDLE;

                        target;

                        constructor(args) {{
                            const {{ tableIdx, componentIdx }} = args;
                            if (tableIdx === undefined || typeof tableIdx !== 'number') {{
                                throw new TypeError(`missing table idx [${{tableIdx}}]`);
                            }}
                            if (tableIdx < 0 || tableIdx > 2_147_483_647) {{
                                throw new TypeError(`invalid  tableIdx [${{tableIdx}}]`);
                            }}
                            if (!args.waitable) {{ throw new Error('missing/invalid waitable'); }}

                            this.#tableIdx = args.tableIdx;
                            this.#waitable = args.waitable;
                            this.#onDrop = args.onDrop;
                            this.target = args.target;
                        }}

                        tableIdx() {{ return this.#tableIdx; }}

                        idx() {{ return this.#idx; }}
                        setIdx(idx) {{ this.#idx = idx; }}

                        setTarget(tgt) {{ this.target = tgt; }}

                        getWaitable() {{ return this.#waitable; }}
                        setWaitable(w) {{ this.#waitable = w; }}

                        setCopyState(state) {{ this.#copyState = state; }}
                        getCopyState() {{ return this.#copyState; }}

                        isCopying() {{
                            switch (this.#copyState) {{
                                case {stream_end_class}.CopyState.IDLE:
                                case {stream_end_class}.CopyState.DONE:
                                    return false;
                                    break;
                                case {stream_end_class}.CopyState.SYNC_COPYING:
                                case {stream_end_class}.CopyState.ASYNC_COPYING:
                                case {stream_end_class}.CopyState.CANCELLING_COPY:
                                    return true;
                                    break;
                                default:
                                    throw new Error('invalid/unknown copying state');
                            }}
                        }}

                        setPendingEvent(fn) {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            {debug_log_fn}('[{stream_end_class}#setPendingEvent()]', {{
                                waitable: this.#waitable,
                                waitableinSet: this.#waitable.isInSet(),
                                componentIdx: this.#waitable.componentIdx(),
                            }});
                            this.#waitable.setPendingEvent(fn);
                        }}

                        hasPendingEvent() {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            return this.#waitable.hasPendingEvent();
                        }}

                        getPendingEvent() {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            {debug_log_fn}('[{stream_end_class}#getPendingEvent()]', {{
                                waitable: this.#waitable,
                                waitableinSet: this.#waitable.isInSet(),
                                componentIdx: this.#waitable.componentIdx(),
                            }});
                            const event = this.#waitable.getPendingEvent();
                            return event;
                        }}

                        isDropped() {{ return this.#dropped; }}

                        drop() {{
                            {debug_log_fn}('[{stream_end_class}#drop()]', {{
                                waitable: this.#waitable,
                                waitableinSet: this.#waitable.isInSet(),
                                componentIdx: this.#waitable.componentIdx(),
                            }});

                            if (this.#dropped) {{
                                {debug_log_fn}('[{stream_end_class}#drop()] already dropped', {{
                                    waitable: this.#waitable,
                                    waitableinSet: this.#waitable.isInSet(),
                                    componentIdx: this.#waitable.componentIdx(),
                                }});
                                return;
                            }}

                            if (this.#waitable) {{
                                const w = this.#waitable;
                                w.drop();
                            }}

                            this.#dropped = true;
                        }}
                    }}
                "#
                ));
            }

            // Stream Write/Read ends hold on to buffer(s) for the component from which the copy is being performed
            // along with buffers for the component being written to.
            //
            // Depending on whether we're doing a write or a read, different parts of the class itself should be filled out,
            // and the output below will have different members/functions available.
            //
            //
            // TODO(fix): the stream class itself is ONE CLASS/need to share data. The classes don't have to be distinct.
            //
            Self::StreamReadableEndClass | Self::StreamWritableEndClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let (end_class_name, _js_stream_class_name) = match self {
                    Self::StreamReadableEndClass => (self.name(), "ReadableStream"),
                    Self::StreamWritableEndClass => (self.name(), "WritableStream"),
                    _ => unreachable!("impossible stream readable end class intrinsic"),
                };

                let stream_end_class = Self::StreamEndClass.name();
                let managed_buffer_class = Intrinsic::ManagedBufferClass.name();
                let global_buffer_manager = Intrinsic::GlobalBufferManager.name();

                // Internal helper fn that sets up for a `copy()` call
                let copy_setup_impl = format!(
                    r#"
                    setupCopy(args) {{
                        const {{ memory, ptr, count, eventCode, componentIdx, skipStateCheck }} = args;
                        if (eventCode === undefined) {{ throw new Error("missing/invalid event code"); }}

                        let buffer = args.buffer;
                        let bufferID = args.bufferID;

                        // Only check invariants if we are *not* doing a follow-up/post-blocked read
                        if (!skipStateCheck) {{
                            if (this.isCopying()) {{
                                throw new Error('stream is currently undergoing a separate copy');
                            }}
                            if (this.getCopyState() !== {stream_end_class}.CopyState.IDLE) {{
                                throw new Error(`stream copy state is not idle`);
                            }}
                        }}

                        const elemMeta = this.getElemMeta();
                        if (elemMeta.isBorrowed) {{ throw new Error('borrowed types cannot be sent over streams'); }}

                        // If we already have a managed buffer (likely host case), we can use that, otherwise we must
                        // create a buffer (likely in the guest case)
                        if (!buffer) {{
                            const newBufferMeta = {global_buffer_manager}.createBuffer({{
                                componentIdx,
                                memory,
                                start: ptr,
                                count,
                                // If creating a buffer for a write operation, the buffer we are encapsulating
                                // is a *readable* buffer from the view of the component (as it has written to that buffer data that)
                                // should be sent out
                                isReadable: this.isWritable(),
                                // If creating a buffer for a read operation, the buffer we are encapsulating
                                // is a *writable* buffer from the view of the component (as it has prepared space to receive data)
                                isWritable: this.isReadable(),
                                elemMeta,
                            }});
                            bufferID = newBufferMeta.id;
                            buffer = newBufferMeta.buffer;
                            buffer.setTarget(`component [${{componentIdx}}] {end_class_name} buffer (id [${{bufferID}}], count [${{count}}], eventCode [${{eventCode}}])`);
                        }}

                        const streamEnd = this;
                        const processFn = (result, reclaimBufferFn) => {{
                            if (reclaimBufferFn) {{ reclaimBufferFn(); }}

                            if (result === {stream_end_class}.CopyResult.DROPPED) {{
                                streamEnd.setCopyState({stream_end_class}.CopyState.DONE);
                            }} else {{
                                streamEnd.setCopyState({stream_end_class}.CopyState.IDLE);
                            }}

                            if (result < 0 || result >= 16) {{
                                throw new Error(`unsupported stream copy result [${{result}}]`);
                            }}
                            if (buffer.processed >= {managed_buffer_class}.MAX_LENGTH) {{
                                 throw new Error(`processed count [${{buf.length}}] greater than max length`);
                            }}
                            if (buffer.length > 2**28) {{ throw new Error('buffer uses reserved space'); }}

                            const packedResult = (Number(buffer.processed) << 4) | result;
                            const event = {{ code: eventCode, payload0: streamEnd.waitableIdx(), payload1: packedResult }};

                            return event;
                        }};

                        const onCopyFn = (reclaimBufferFn) => {{
                            streamEnd.setPendingEvent(() => {{
                                return processFn({stream_end_class}.CopyResult.COMPLETED, reclaimBufferFn);
                            }});
                        }};

                        const onCopyDoneFn = (result) => {{
                            streamEnd.setPendingEvent(() => {{
                                return processFn(result);
                            }});
                        }};

                        return {{ bufferID, buffer, onCopyFn, onCopyDoneFn }};
                    }}
                    "#
                );

                let (rw_fn_name, inner_rw_impl) = match self {
                    // Internal implementation for writing to internal buffer after reading from a provided managed buffers
                    //
                    // This _write() function is primarily called by guests.
                    Self::StreamWritableEndClass => (
                        "write",
                        format!(
                            r#"
                            _write(args) {{
                                const {{ buffer, onCopyFn, onCopyDoneFn, componentIdx }} = args;
                                if (!buffer) {{ throw new TypeError('missing/invalid buffer'); }}
                                if (!onCopyFn) {{ throw new TypeError("missing/invalid onCopy handler"); }}
                                if (!onCopyDoneFn) {{ throw new TypeError("missing/invalid onCopyDone handler"); }}

                                if (!this.#pendingBufferMeta.buffer) {{
                                    this.setPendingBufferMeta({{ componentIdx, buffer, onCopyFn, onCopyDoneFn }});
                                    return;
                                }}

                                const pendingElemMeta = this.#pendingBufferMeta.buffer.getElemMeta();
                                const newBufferElemMeta = buffer.getElemMeta();
                                if (pendingElemMeta.typeIdx !== newBufferElemMeta.typeIdx) {{
                                    throw new Error("trap: stream end type does not match internal buffer");
                                }}

                                // If the buffer came from the same component that is currently doing the operation
                                // we're doing a inter-component write, and only unit or numeric types are allowed
                                const pendingElemIsNoneOrNumeric = pendingElemMeta.isNone || pendingElemMeta.isNumeric;
                                if (this.#pendingBufferMeta.componentIdx === buffer.componentIdx() && !pendingElemIsNoneOrNumeric) {{
                                    throw new Error("trap: cannot stream non-numeric types within the same component (send)");
                                }}

                                // If original capacities were zero, we're dealing with a unit stream,
                                // a write to the unit stream is instantly copied without any work.
                                if (buffer.capacity === 0 && this.#pendingBufferMeta.buffer.capacity === 0) {{
                                    onCopyDoneFn({stream_end_class}.CopyResult.COMPLETED);
                                    return;
                                }}

                                // If the internal buffer has no space left to take writes,
                                // the write is complete, we must reset and wait for another read
                                // to clear up space in the buffer.
                                if (this.#pendingBufferMeta.buffer.remaining() === 0) {{
                                    this.resetAndNotifyPending({stream_end_class}.CopyResult.COMPLETED);
                                    this.setPendingBufferMeta({{ componentIdx, buffer, onCopyFn, onCopyDoneFn }});
                                    return;
                                }}

                                // At this point it is implied that remaining is > 0,
                                // so if there is still remaining capacity in the incoming buffer, perform copy of values
                                // to the internal buffer from the incoming buffer
                                let transferred = false;
                                if (buffer.remaining() > 0) {{
                                    const numElements = Math.min(buffer.remaining(), this.#pendingBufferMeta.buffer.remaining());
                                    this.#pendingBufferMeta.buffer.write(buffer.read(numElements));
                                    this.#pendingBufferMeta.onCopyFn(() => this.resetPendingBufferMeta());
                                    transferred = true;
                                }}

                                onCopyDoneFn({stream_end_class}.CopyResult.COMPLETED);

                                // After successfully doing a guest write, we may need to
                                // notify a blocked/waiting host read that it can continue
                                //
                                // We notify the other end of the stream (likely held by the hsot)
                                //  *after* the transfer (above) and book-keeping is done, if one occurred.
                                if (transferred) {{ this.#otherEndNotify(); }}
                            }}
                        "#,
                        ),
                    ),

                    // Internal implementation for reading from an internal buffer and writing to a provided managed buffer
                    //
                    // This _read() function is primarily called by guests.
                    Self::StreamReadableEndClass => (
                        "read",
                        format!(
                            r#"
                            _read(args) {{
                                const {{ buffer, onCopyDoneFn, onCopyFn, componentIdx }} = args;
                                if (this.isDropped()) {{
                                    onCopyDoneFn({stream_end_class}.CopyResult.DROPPED);
                                    return;
                                }}

                                if (!this.#pendingBufferMeta.buffer) {{
                                    this.setPendingBufferMeta({{
                                        componentIdx,
                                        buffer,
                                        onCopyFn,
                                        onCopyDoneFn,
                                    }});
                                    return;
                                }}

                                const pendingElemMeta = this.#pendingBufferMeta.buffer.getElemMeta();
                                const newBufferElemMeta = buffer.getElemMeta();
                                if (pendingElemMeta.typeIdx !== newBufferElemMeta.typeIdx) {{
                                    throw new Error("trap: stream end type does not match internal buffer");
                                }}

                                // If the buffer came from the same component that is currently doing the operation
                                // we're doing a inter-component read, and only unit or numeric types are allowed
                                const pendingElemIsNoneOrNumeric = pendingElemMeta.isNone || pendingElemMeta.isNumeric;
                                if (this.#pendingBufferMeta.componentIdx === buffer.componentIdx() && !pendingElemIsNoneOrNumeric) {{
                                    throw new Error("trap: cannot stream non-numeric types within the same component (read)");
                                }}

                                const pendingRemaining = this.#pendingBufferMeta.buffer.remaining();
                                let transferred = false;
                                if (pendingRemaining > 0) {{
                                    const bufferRemaining = buffer.remaining();
                                    if (bufferRemaining > 0) {{
                                        const count = Math.min(pendingRemaining, bufferRemaining);
                                        buffer.write(this.#pendingBufferMeta.buffer.read(count))
                                        this.#pendingBufferMeta.onCopyFn(() => this.resetPendingBufferMeta());
                                        transferred = true;
                                    }}

                                    onCopyDoneFn({stream_end_class}.CopyResult.COMPLETED);

                                    // After successfully doing a guest read, we may need to
                                    // notify a blocked/waiting host write that it can continue
                                    //
                                    // We must only notify the other end of the stream (likely held
                                    // by the host) after a transfer (above) and book-keeping is done.
                                    if (transferred) {{ this.#otherEndNotify(); }}

                                    return;
                                }}

                                this.resetAndNotifyPending({stream_end_class}.CopyResult.COMPLETED);
                                this.setPendingBufferMeta({{ componentIdx, buffer, onCopyFn, onCopyDoneFn }});
                            }}
                            "#,
                        ),
                    ),
                    _ => unreachable!("invalid stream end enum"),
                };

                let async_blocked_const =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncBlockedConstant).name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();

                // NOTE: This shared copy impl is meant to be called from *outside* the stream end class in question,
                // but internally to the bindgen-generated code (i.e. from `stream.{read,write}` or from a
                // read on an external stream class)
                let copy_impl = format!(
                    r#"
                         async copy(args) {{
                             const {{ isAsync, memory, componentIdx, ptr, count, eventCode, initial }} = args;
                             if (eventCode === undefined) {{ throw new TypeError('missing/invalid event code'); }}

                             if (this.isDropped()) {{
                                 if (this.#pendingBufferMeta?.onCopyDoneFn) {{
                                     const f = this.#pendingBufferMeta.onCopyDoneFn;
                                     this.#pendingBufferMeta.onCopyDoneFn = null;
                                     f({stream_end_class}.CopyResult.DROPPED);
                                 }}
                                 return;
                             }}

                             const {{ buffer, onCopyFn, onCopyDoneFn }} = this.setupCopy({{
                                 memory,
                                 eventCode,
                                 componentIdx,
                                 ptr,
                                 count,
                                 buffer: args.buffer,
                                 bufferID: args.bufferID,
                                 initial,
                             }});

                             // Perform the read/write
                             this._{rw_fn_name}({{
                                 buffer,
                                 onCopyFn,
                                 onCopyDoneFn,
                                 componentIdx,
                             }});

                             // If sync, wait forever but allow task to do other things
                             if (!this.hasPendingEvent()) {{
                               if (isAsync) {{
                                   this.setCopyState({stream_end_class}.CopyState.ASYNC_COPYING);
                                   {debug_log_fn}('[{stream_end_class}#copy()] blocked');
                                   return {async_blocked_const};
                               }} else {{
                                   this.setCopyState({stream_end_class}.CopyState.SYNC_COPYING);

                                   const taskMeta = {current_task_get_fn}(componentIdx);
                                   if (!taskMeta) {{ throw new Error(`missing task meta for component idx [${{componentIdx}}]`); }}

                                   const task = taskMeta.task;
                                   if (!task) {{ throw new Error('missing task task from task meta'); }}

                                   const streamEnd = this;
                                   await task.suspendUntil({{
                                       readyFn: () => streamEnd.hasPendingEvent(),
                                   }});
                               }}
                             }}

                             const event = this.getPendingEvent();
                             if (!event) {{ throw new Error("unexpectedly missing pending event"); }}
                             if (event.code === undefined || event.payload0 === undefined || event.payload1 === undefined) {{
                                 throw new Error("unexpectedly malformed event");
                             }}

                             const {{ code, payload0: index, payload1: payload }} = event;

                             const waitableIdx = this.getWaitable().idx();
                             if (code !== eventCode  || index !== waitableIdx || payload === {async_blocked_const}) {{
                                 const errMsg = "invalid event code/event during stream operation";
                                 {debug_log_fn}(errMsg, {{
                                     event,
                                     payload,
                                     payloadIsBlockedConst: payload === {async_blocked_const},
                                     code,
                                     eventCode,
                                     codeDoesNotMatchEventCode: code !== eventCode,
                                     index,
                                     internalEndIdx: waitableIdx,
                                     indexDoesNotMatch: index !== waitableIdx,
                                 }});
                                 throw new Error(errMsg);
                             }}

                             return payload;
                         }}
                    "#
                );

                let type_getter_impl = match self {
                    Self::StreamWritableEndClass => "
                         isReadable() { return false; }
                         isWritable() { return true; }
                    "
                    .to_string(),
                    Self::StreamReadableEndClass => "
                         isReadable() { return true; }
                         isWritable() { return false; }
                    "
                    .to_string(),
                    _ => unreachable!("impossible stream readable end class intrinsic"),
                };

                let async_event_code_enum = Intrinsic::AsyncEventCodeEnum.name();
                let promise_with_resolvers_fn = Intrinsic::PromiseWithResolversPonyfill.name();

                // NOTE: these action implementations `write()` and `read()` are normally called
                // from the host -- internally components will use the `stream.{write, read}` intrinsics
                // which call the `copy()` function on the stream end class directly.
                let action_impl = match self {
                    Self::StreamWritableEndClass => format!(
                        r#"
                         async write(v) {{
                            {debug_log_fn}('[{end_class_name}#write()] args', {{ v }});

                            // Wait for an existing write operation to end, if present,
                            // otherwise register this write for any future operations.
                            //
                            // NOTE: this complexity below is an attempt to sequence operations
                            // to ensure consecutive writes only wait on their direct predecessors,
                            // (i.e. write #3 must wait on write #2, *not* write #1)
                            //
                            let newResult = {promise_with_resolvers_fn}();
                            if (this.#result) {{
                                try {{
                                    const p = this.#result.promise;
                                    this.#result = newResult;
                                    await p;
                                }} catch (err) {{
                                    {debug_log_fn}('[{end_class_name}#write()] error waiting for previous write', err);
                                    // If the previous write we were waiting on errors for any reason,
                                    // we can ignore it and attempt to continue with this write
                                    // which may also fail for a similar reason
                                }}
                            }} else {{
                                this.#result = newResult;
                            }}
                            const {{ promise, resolve, reject }} = newResult;

                            const count = 1;
                            try {{
                                const {{ id: bufferID, buffer }} = {global_buffer_manager}.createBuffer({{
                                    componentIdx: -1,
                                    count,
                                    isReadable: true, // we need to read from this buffer later
                                    isWritable: false,
                                    elemMeta: this.#elemMeta,
                                    data: v,
                                }});
                                buffer.setTarget(`host stream write buffer (id [${{bufferID}}], count [${{count}}], data len [${{v.length}}])`);

                                let packedResult;
                                packedResult = await this.copy({{
                                    isAsync: true,
                                    count,
                                    bufferID,
                                    buffer,
                                    eventCode: {async_event_code_enum}.STREAM_WRITE,
                                    componentIdx: -1,
                                }});

                                if (packedResult === {async_blocked_const}) {{
                                    // If the write was blocked, we can only make progress when
                                    // the read side notifies us of a read, then we must attempt the copy again

                                    await this.#otherEndWait();

                                    packedResult = await this.copy({{
                                        isAsync: true,
                                        count,
                                        bufferID,
                                        buffer,
                                        eventCode: {async_event_code_enum}.STREAM_WRITE,
                                        skipStateCheck: true,
                                        componentIdx: -1,
                                    }});

                                    if (packedResult === {async_blocked_const}) {{
                                        throw new Error("unexpected double block during write");
                                    }}
                                }}

                                // If the write was not blocked, we can resolve right away
                                this.#result = null;
                                resolve();

                            }} catch (err) {{
                                {debug_log_fn}('[{end_class_name}#write()] error', err);
                                reject(err);
                            }}

                            return await promise;
                         }}
                        "#
                    ),

                    // NOTE: Host stream reads typically take this path, via `ExternalStream` class's
                    // `read()` function which calls the underlying stream end's `read()`
                    // fn (below) via an anonymous function.
                    Self::StreamReadableEndClass => format!(
                        r#"
                         async read() {{
                            {debug_log_fn}('[{end_class_name}#read()]');

                            // Wait for an existing read operation to end, if present,
                            // otherwise register this read for any future operations.
                            //
                            // NOTE: this complexity below is an attempt to sequence operations
                            // to ensure consecutive reads only wait on their direct predecessors,
                            // (i.e. read #3 must wait on read #2, *not* read #1)
                            //
                            const newResult = {promise_with_resolvers_fn}();
                            if (this.#result) {{
                                try {{
                                    const p = this.#result.promise;
                                    this.#result = newResult;
                                    await p;
                                }} catch (err) {{
                                    {debug_log_fn}('[{end_class_name}#read()] error waiting for previous read', err);
                                    // If the previous write we were waiting on errors for any reason,
                                    // we can ignore it and attempt to continue with this read
                                    // which may also fail for a similar reason
                                }}
                            }} else {{
                                this.#result = newResult;
                            }}
                            const {{ promise, resolve, reject }} = newResult;

                            const count = 1;
                            try {{
                                const {{ id: bufferID, buffer }} = {global_buffer_manager}.createBuffer({{
                                    componentIdx: -1, // componentIdx of -1 indicates the host
                                    count,
                                    isReadable: false,
                                    isWritable: true, // we need to write out the pending buffer (if present)
                                    elemMeta: this.#elemMeta,
                                    data: [],
                                }});
                                buffer.setTarget(`host stream read buffer (id [${{bufferID}}], count [${{count}}])`);

                                let packedResult;
                                packedResult = await this.copy({{
                                    isAsync: true,
                                    count,
                                    bufferID,
                                    buffer,
                                    eventCode: {async_event_code_enum}.STREAM_READ,
                                    componentIdx: -1,
                                }});

                                if (packedResult === {async_blocked_const}) {{
                                    // If the read was blocked, we can only make progress when
                                    // the write side notifies us of a write, then we must attempt the copy again

                                    await this.#otherEndWait();

                                    packedResult = await this.copy({{
                                        isAsync: true,
                                        count,
                                        bufferID,
                                        buffer,
                                        eventCode: {async_event_code_enum}.STREAM_READ,
                                        skipStateCheck: true,
                                        componentIdx: -1,
                                    }});

                                    if (packedResult === {async_blocked_const}) {{
                                        throw new Error("unexpected double block during read");
                                    }}
                                }}

                                let copied = packedResult >> 4;
                                let result = packedResult & 0x000F;

                                // Due to async timing vagaries, it is possible to get to this point
                                // and have an event have come out from the copy despite the writer end
                                // being closed or the reader being otherwise done:
                                //
                                // - The current CopyState is done (indicating a CopyResult.DROPPED being received)
                                // - The current CopyResult is DROPPED
                                //
                                // These two cases often overlap
                                //
                                if (this.isDone() || result === {stream_end_class}.CopyResult.DROPPED) {{
                                    reject(new Error("read end is closed"));
                                }}

                                const vs = buffer.read(count);
                                const res = count === 1 ? vs[0] : vs;
                                this.#result = null;
                                resolve(res);

                            }} catch (err) {{
                                {debug_log_fn}('[{end_class_name}#read()] error', err);
                                reject(err);
                            }}

                            return await promise;
                         }}
                        "#
                    ),
                    _ => unreachable!("impossible stream readable end class intrinsic"),
                };

                output.push_str(&format!(r#"
                    class {end_class_name} extends {stream_end_class} {{
                        #copying = false;
                        #done = false;

                        #elemMeta = null;
                        #pendingBufferMeta = null; // held by both write and read ends

                        #streamTableIdx; // table index that the stream is in (can change after a stream transfer)
                        #handle; // handle (index) inside the given table (can change after a stream transfer)

                        #globalStreamMapRep; // internal stream (which has both ends) rep

                        #result = null;

                        #otherEndWait = null;
                        #otherEndNotify = null;

                        constructor(args) {{
                            {debug_log_fn}('[{end_class_name}#constructor()] args', args);
                            super(args);

                            if (!args.elemMeta) {{ throw new Error('missing/invalid element meta'); }}
                            this.#elemMeta = args.elemMeta;

                            if (!args.pendingBufferMeta) {{ throw new Error('missing/invalid shared pending buffer meta'); }}
                            this.#pendingBufferMeta = args.pendingBufferMeta;

                            if (args.tableIdx === undefined) {{ throw new Error('missing index for stream table idx'); }}
                            this.#streamTableIdx = args.tableIdx;

                            if (args.otherEndNotify === undefined) {{ throw new Error('missing fn for notification'); }}
                            this.#otherEndNotify = args.otherEndNotify;

                            if (args.otherEndWait === undefined) {{ throw new Error('missing fn for awaiting notification'); }}
                            this.#otherEndWait = args.otherEndWait;
                        }}

                        streamTableIdx() {{ return this.#streamTableIdx; }}
                        setStreamTableIdx(idx) {{ this.#streamTableIdx = idx; }}

                        handle() {{ return this.#handle; }}
                        setHandle(h) {{ this.#handle = h; }}

                        globalStreamMapRep() {{ return this.#globalStreamMapRep; }}
                        setGlobalStreamMapRep(rep) {{ this.#globalStreamMapRep = rep; }}

                        waitableIdx() {{ return this.getWaitable().idx(); }}
                        setWaitableIdx(idx) {{
                            const w = this.getWaitable();
                            w.setIdx(idx);
                            w.setTarget(`waitable for {rw_fn_name} end (waitable [${{idx}}])`);
                        }}

                        getElemMeta() {{ return {{...this.#elemMeta}}; }}

                        {type_getter_impl}

                        isDone() {{ this.getCopyState() === {stream_end_class}.CopyState.DONE; }}
                        isCompleted() {{ this.getCopyState() === {stream_end_class}.CopyState.COMPLETED; }}
                        isDropped() {{ this.getCopyState() === {stream_end_class}.CopyState.DROPPED; }}

                        {action_impl}
                        {inner_rw_impl}
                        {copy_setup_impl}
                        {copy_impl}

                        setPendingBufferMeta(args) {{
                            const {{ componentIdx, buffer, onCopyFn, onCopyDoneFn }} = args;
                            this.#pendingBufferMeta.componentIdx = componentIdx;
                            this.#pendingBufferMeta.buffer = buffer;
                            this.#pendingBufferMeta.onCopyFn = onCopyFn;
                            this.#pendingBufferMeta.onCopyDoneFn = onCopyDoneFn;
                        }}

                        resetPendingBufferMeta() {{
                            this.setPendingBufferMeta({{ componentIdx: null, buffer: null, onCopyFn: null, onCopyDoneFn: null }});
                        }}

                        getPendingBufferMeta() {{ return this.#pendingBufferMeta; }}

                        resetAndNotifyPending(result) {{
                            const f = this.#pendingBufferMeta.onCopyDoneFn;
                            this.resetPendingBufferMeta();
                            if (f) {{ f(result); }}
                        }}

                        cancel() {{
                            {debug_log_fn}('[{stream_end_class}#cancel()]');
                            this.resetAndNotifyPending({stream_end_class}.CopyResult.CANCELLED);
                        }}

                        drop() {{
                            {debug_log_fn}('[{stream_end_class}#drop()]');
                            if (this.isDropped()) {{ return; }}
                            if (this.#pendingBufferMeta) {{
                                this.resetAndNotifyPending({stream_end_class}.CopyResult.DROPPED);
                            }}
                            super.drop();
                        }}
                    }}
                "#));
            }

            Self::InternalStreamClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let internal_stream_class_name = self.name();
                let read_end_class = Self::StreamReadableEndClass.name();
                let write_end_class = Self::StreamWritableEndClass.name();
                let promise_with_resolvers_fn = Intrinsic::PromiseWithResolversPonyfill.name();

                output.push_str(&format!(
                    r#"
                    class {internal_stream_class_name} {{
                        #readEnd;
                        #readEndWaitableIdx;
                        #readEndDropped;

                        #writeEnd;
                        #writeEndWaitableIdx;
                        #writeEndDropped;

                        #pendingBufferMeta = {{}}; // shared between read/write ends
                        #elemMeta;

                        #globalStreamMapRep;

                        #readWaitPromise = null;
                        #writeWaitPromise = null;

                        constructor(args) {{
                            {debug_log_fn}('[{internal_stream_class_name}#constructor()] args', args);
                            if (!args.elemMeta) {{ throw new Error('missing/invalid stream element metadata'); }}
                            if (args.tableIdx === undefined) {{ throw new Error('missing/invalid stream table idx'); }}
                            if (!args.readWaitable) {{ throw new Error('missing/invalid read waitable'); }}
                            if (!args.writeWaitable) {{ throw new Error('missing/invalid write waitable'); }}
                            const {{ tableIdx, elemMeta, readWaitable, writeWaitable, }} = args;

                            this.#elemMeta = elemMeta;

                            const writeNotify = () => {{
                                if (this.#writeWaitPromise === null) {{ return; }}
                                const resolve = this.#writeWaitPromise.resolve;
                                this.#writeWaitPromise = null;
                                resolve();
                            }};
                            const writeWait = () => {{
                                if (this.#writeWaitPromise === null) {{
                                    this.#writeWaitPromise = {promise_with_resolvers_fn}();
                                }}
                                return this.#writeWaitPromise.promise;
                            }};

                            this.#readEnd = new {read_end_class}({{
                                tableIdx,
                                elemMeta: this.#elemMeta,
                                pendingBufferMeta: this.#pendingBufferMeta,
                                target: "stream read end (@ init)",
                                waitable: readWaitable,
                                otherEndWait: writeWait,
                                otherEndNotify: writeNotify,
                            }});

                            const readNotify = () => {{
                                if (this.#readWaitPromise === null) {{ return; }}
                                const resolve = this.#readWaitPromise.resolve;
                                this.#readWaitPromise = null;
                                resolve();
                            }};
                            const readWait = () => {{
                                if (this.#readWaitPromise === null) {{
                                    this.#readWaitPromise = {promise_with_resolvers_fn}();
                                }}
                                return this.#readWaitPromise.promise;
                            }};

                            this.#writeEnd = new {write_end_class}({{
                                tableIdx,
                                elemMeta: this.#elemMeta,
                                pendingBufferMeta: this.#pendingBufferMeta,
                                target: "stream write end (@ init)",
                                waitable: writeWaitable,
                                otherEndWait: readWait,
                                otherEndNotify: readNotify,
                            }});
                        }}

                        elemMeta() {{ return this.#elemMeta; }}

                        globalStreamMapRep() {{ return this.#globalStreamMapRep; }}
                        setGlobalStreamMapRep(rep) {{
                            this.#globalStreamMapRep = rep;
                            this.#readEnd.setGlobalStreamMapRep(rep);
                            this.#writeEnd.setGlobalStreamMapRep(rep);
                        }}

                        readEnd() {{ return this.#readEnd; }}
                        writeEnd() {{ return this.#writeEnd; }}
                    }}
                    "#
                ));
            }

            // The host stream class is used exclusively *inside* the host implementation,
            // to represent stream that have been lifted (or originated) external to a given
            // component.
            //
            // For example, after a component-internal stream is lifted from a component (normally
            // by way of returning it from a function), that stream will have been made into a host
            // stream, and *may* give actual end users access via the `createUserStream()` function.
            //
            // At present since streams can only give away the read-end, this usually means that the
            // host stream will be used to often give away the *read* end.
            //
            Self::HostStreamClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let host_stream_class_name = self.name();
                let external_stream_class = Self::ExternalStreamClass.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();

                output.push_str(&format!(
                    r#"
                    class {host_stream_class_name} {{
                        #componentIdx;
                        #streamEndIdx;
                        #streamTableIdx;

                        #payloadLiftFn;
                        #payloadLowerFn;
                        #isUnitStream;

                        #userStream;

                        #rep = null;

                        constructor(args) {{
                            {debug_log_fn}('[{host_stream_class_name}#constructor()] args', args);
                            if (args.componentIdx === undefined) {{ throw new TypeError("missing component idx"); }}
                            this.#componentIdx = args.componentIdx;

                            if (!args.payloadLiftFn) {{ throw new TypeError("missing payload lift fn"); }}
                            this.#payloadLiftFn = args.payloadLiftFn;

                            if (!args.payloadLowerFn) {{ throw new TypeError("missing payload lower fn"); }}
                            this.#payloadLowerFn = args.payloadLowerFn;

                            if (args.streamEndIdx === undefined) {{ throw new Error("missing stream idx"); }}
                            if (args.streamTableIdx === undefined) {{ throw new Error("missing stream table idx"); }}
                            this.#streamEndIdx = args.streamEndIdx;
                            this.#streamTableIdx = args.streamTableIdx;

                            this.#isUnitStream = args.isUnitStream;
                        }}

                        createUserStream(args) {{
                           if (this.#userStream) {{ return this.#userStream; }}
                           if (this.#rep === null) {{ throw new Error("unexpectedly missing rep for host stream"); }}

                           const cstate = {get_or_create_async_state_fn}(this.#componentIdx);
                           if (!cstate) {{ throw new Error(`missing async state for component [${{this.#componentIdx}}]`); }}

                           const streamEnd = cstate.getStreamEnd({{ tableIdx: this.#streamTableIdx, streamEndIdx: this.#streamEndIdx }});
                           if (!streamEnd) {{
                               throw new Error(`missing stream [${{this.#streamEndIdx}}] (table [${{this.#streamTableIdx}}], component [${{this.#componentIdx}}]`);
                           }}

                            return new {external_stream_class}({{
                                isReadable: streamEnd.isReadable(),
                                isWritable: streamEnd.isWritable(),
                                globalRep: this.#rep,
                                readFn: async () => {{
                                    return await streamEnd.read();
                                }},
                                writeFn: async (v) => {{
                                    await streamEnd.write(v);
                                }},
                            }});
                        }}
                    }}
                    "#
                ));
            }

            // NOTE: this stream class is meant to be given to external users and can be passed along
            // to the outside world.
            //
            // Functions that return streams should return *this* stream class, and functions that accept
            // streams should return this stream class.
            //
            // TODO(fix): move this stream class to an external @bytecodealliance/p3-runtime package for
            // reuse from inside and outside.
            //
            // TODO(fix): remove host stream rep tracking, force this on the host to maintain as metadata.
            //
            Self::ExternalStreamClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let external_stream_class_name = self.name();
                output.push_str(&format!(
                    r#"
                    class {external_stream_class_name} {{
                        #globalRep = null;
                        #isReadable;
                        #isWritable;
                        #writeFn;
                        #readFn;

                        constructor(args) {{
                            {debug_log_fn}('[{external_stream_class_name}#constructor()] args', args);
                            if (args.globalRep === undefined) {{ throw new TypeError("missing host stream rep"); }}
                            this.#globalRep = args.globalRep;

                            if (args.isReadable === undefined) {{ throw new TypeError("missing readable setting"); }}
                            this.#isReadable = args.isReadable;

                            if (args.isWritable === undefined) {{ throw new TypeError("missing writable setting"); }}
                            this.#isWritable = args.isWritable;

                            if (this.#isWritable && args.writeFn === undefined) {{ throw new TypeError("missing write fn"); }}
                            this.#writeFn = args.writeFn;

                            if (this.#isReadable && args.readFn === undefined) {{ throw new TypeError("missing read fn"); }}
                            this.#readFn = args.readFn;
                        }}

                        globalRep() {{ return this.#globalRep; }}

                        async next() {{
                            {debug_log_fn}('[{external_stream_class_name}#next()]');
                            if (!this.#isReadable) {{ throw new Error("stream is not marked as readable and cannot be written from"); }}
                            return this.#readFn();
                        }}

                        async write() {{
                            {debug_log_fn}('[{external_stream_class_name}#write()]');
                            if (!this.#isWritable) {{ throw new Error("stream is not marked as writable and cannot be written to"); }}

                            const objects = [...arguments];
                            if (!objects.length !== 1) {{
                                throw new Error("only single object writes are currently supported");
                            }}
                            const obj = objects[0];

                            this.#writeFn(obj);
                        }}
                    }}
                    "#
                ));
            }

            Self::GlobalStreamMap => {
                let global_stream_map = Self::GlobalStreamMap.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                output.push_str(&format!(
                    r#"
                    const {global_stream_map} = new {rep_table_class}({{ target: 'global stream map' }});
                    "#
                ));
            }

            Self::GlobalStreamTableMap => {
                let global_stream_table_map = Self::GlobalStreamTableMap.name();
                output.push_str(&format!(
                    r#"
                    const {global_stream_table_map} = {{}};
                    "#
                ));
            }

            // TODO: allow customizable stream functionality (user should be able to specify a lib/import for a 'stream()' function
            // (this will enable using p3-shim explicitly or any other implementation)
            //
            // NOTE: Unit streams are represented with a streamTypeRep of null
            Self::StreamNew => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_new_fn = Self::StreamNew.name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!(r#"
                    function {stream_new_fn}(ctx) {{
                        {debug_log_fn}('[{stream_new_fn}()] args', {{ ctx }});
                        const {{
                            streamTableIdx,
                            callerComponentIdx,
                            elemMeta,
                        }} = ctx;
                        if (callerComponentIdx === undefined) {{ throw new Error("missing caller component idx during stream.new"); }}

                        const taskMeta = {current_task_get_fn}(callerComponentIdx);
                        if (!taskMeta) {{ throw new Error('missing async task metadata during stream.new'); }}

                        const task = taskMeta.task
                        if (!task) {{ throw new Error('invalid/missing async task during stream.new'); }}

                        if (task.componentIdx() !== callerComponentIdx) {{
                            throw new Error(`task component idx [${{task.componentIdx()}}] does not match stream new intrinsic component idx [${{callerComponentIdx}}]`);
                        }}

                        const cstate = {get_or_create_async_state_fn}(callerComponentIdx);
                        if (!cstate.mayLeave) {{
                            throw new Error('component instance is not marked as may leave during stream.new');
                        }}

                        const {{ writeEndWaitableIdx, readEndWaitableIdx, writeEndHandle, readEndHandle }} = cstate.createStream({{
                            tableIdx: streamTableIdx,
                            elemMeta,
                        }});

                        {debug_log_fn}('[{stream_new_fn}()] created stream ends', {{
                            writeEnd: {{
                                waitableIdx: writeEndWaitableIdx,
                                handle: writeEndHandle,
                            }},
                            readEnd: {{
                                waitableIdx: readEndWaitableIdx,
                                handle: readEndHandle,
                            }},
                            streamTableIdx,
                            callerComponentIdx,
                        }});

                        return (BigInt(writeEndWaitableIdx) << 32n) | BigInt(readEndWaitableIdx);
                    }}
                "#));
            }

            Self::StreamNewFromLift => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_new_from_lift_fn = self.name();
                let global_stream_map =
                    Intrinsic::AsyncStream(AsyncStreamIntrinsic::GlobalStreamMap).name();
                let host_stream_class =
                    Intrinsic::AsyncStream(AsyncStreamIntrinsic::HostStreamClass).name();
                output.push_str(&format!(
                    r#"
                    function {stream_new_from_lift_fn}(ctx) {{
                        {debug_log_fn}('[{stream_new_from_lift_fn}()] args', {{ ctx }});
                        const {{
                            componentIdx,
                            streamEndIdx,
                            streamTableIdx,
                            payloadLiftFn,
                            payloadTypeSize32,
                            payloadLowerFn,
                            isUnitStream,
                        }} = ctx;

                        const stream = new {host_stream_class}({{
                            componentIdx,
                            streamEndIdx,
                            streamTableIdx,
                            payloadLiftFn: payloadLiftFn,
                            payloadLowerFn: payloadLowerFn,
                            isUnitStream,
                        }});

                        const rep = {global_stream_map}.insert(stream);
                        stream.setRep(rep);

                        return stream.createUserStream();
                    }}
                "#
                ));
            }

            // NOTE: reads/writes are rendezvous based for P3, meaning that every write matches with a read.
            //
            // The pending buffer represents waiting write/read buffer.
            //
            Self::StreamWrite | Self::StreamRead => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_op_fn = self.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let async_event_code_enum = Intrinsic::AsyncEventCodeEnum.name();
                let managed_buffer_class = Intrinsic::ManagedBufferClass.name();
                let (event_code, stream_end_class) = match self {
                    Self::StreamWrite => (
                        format!("{async_event_code_enum}.STREAM_WRITE"),
                        &Self::StreamWritableEndClass.name(),
                    ),
                    Self::StreamRead => (
                        format!("{async_event_code_enum}.STREAM_READ"),
                        &Self::StreamReadableEndClass.name(),
                    ),
                    _ => unreachable!("unexpected stream operation"),
                };

                output.push_str(&format!(r#"
                    async function {stream_op_fn}(
                        ctx,
                        streamEndWaitableIdx,
                        ptr,
                        count,
                    ) {{
                        {debug_log_fn}('[{stream_op_fn}()] args', {{ ctx, streamEndWaitableIdx, ptr, count }});
                        const {{
                            componentIdx,
                            memoryIdx,
                            getMemoryFn,
                            reallocIdx,
                            getReallocFn,
                            stringEncoding,
                            isAsync,
                            streamTableIdx,
                        }} = ctx;

                        if (componentIdx === undefined) {{ throw new TypeError("missing/invalid component idx"); }}
                        if (streamTableIdx === undefined) {{ throw new TypeError("missing/invalid stream table idx"); }}
                        if (streamEndWaitableIdx === undefined) {{ throw new TypeError("missing/invalid stream end idx"); }}

                        // count may come in as u32::MAX which is mangled by JS into a negative value
                        count = Math.min(count >>> 0, {managed_buffer_class}.MAX_LENGTH);

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        // TODO(fix): check for may block & async

                        const streamEnd = cstate.getStreamEnd({{ tableIdx: streamTableIdx, streamEndWaitableIdx }});
                        if (!streamEnd) {{
                            throw new Error(`missing stream end [${{streamEndWaitableIdx}}] (table [${{streamTableIdx}}], component [${{componentIdx}}])`);
                        }}
                        if (!(streamEnd instanceof {stream_end_class})) {{
                            throw new Error('invalid stream type, expected {stream_end_class}');
                        }}
                        if (streamEnd.streamTableIdx() !== streamTableIdx) {{
                            throw new Error(`stream end table idx [${{streamEnd.streamTableIdx()}}] != operation table idx [${{streamTableIdx}}]`);
                        }}

                        const result = await streamEnd.copy({{
                            isAsync,
                            memory: getMemoryFn(),
                            ptr,
                            count,
                            eventCode: {event_code},
                            componentIdx,
                        }});

                        return result;
                    }}
                "#));
            }

            Self::StreamCancelRead | Self::StreamCancelWrite => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_cancel_fn = self.name();
                let async_blocked_const =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncBlockedConstant).name();
                let is_cancel_write = matches!(self, Self::StreamCancelWrite);
                let event_code_enum = format!(
                    "{}.STREAM_{}",
                    Intrinsic::AsyncEventCodeEnum.name(),
                    if is_cancel_write { "WRITE" } else { "READ" }
                );
                let stream_end_class = if is_cancel_write {
                    Self::StreamWritableEndClass.name()
                } else {
                    Self::StreamReadableEndClass.name()
                };
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!(r#"
                    async function {stream_cancel_fn}(ctx, streamEndWaitableIdx) {{
                        {debug_log_fn}('[{stream_cancel_fn}()] args', {{ ctx, streamEndWaitableIdx }});
                        const {{ streamTableIdx, isAsync, componentIdx }} = ctx;

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        const streamEnd = cstate.getStreamEnd({{ streamEndWaitableIdx, tableIdx: streamTableIdx }});
                        if (!streamEnd) {{ throw new Error('missing stream end with idx [' + streamEndWaitableIdx + ']'); }}
                        if (!(streamEnd instanceof {stream_end_class})) {{ throw new Error('invalid stream end, expected value of type [{stream_end_class}]'); }}

                        if (!streamEnd.isCopying()) {{ throw new Error('stream end is not copying, cannot cancel'); }}

                        streamEnd.setCopyState({stream_end_class}.CopyState.CANCELLING_COPY);

                        if (!streamEnd.hasPendingEvent()) {{

                            streamEnd.cancel();

                            if (!streamEnd.hasPendingEvent()) {{
                                if (isAsync) {{ return {async_blocked_const}; }}

                                const taskMeta = {current_task_get_fn}(componentIdx);
                                if (!taskMeta) {{ throw new Error('missing current task metadata while doing stream transfer'); }}
                                const task = taskMeta.task;
                                if (!task) {{ throw new Error('missing task while doing stream transfer'); }}
                                await task.suspendUntil({{ readyFn: () => streamEnd.hasPendingEvent() }});
                            }}
                        }}

                        const event = streamEnd.getPendingEvent();
                        const {{ code, payload0: index, payload1: payload }} = event;
                        if (streamEnd.isCopying()) {{
                            throw new Error(`stream end (idx [${{streamEndWaitableIdx}}]) is still in copying state`);
                        }}
                        if (code !== {event_code_enum}) {{
                            throw new Error(`unexpected event code [${{code}}], expected [{event_code_enum}]`);
                        }}
                        if (index !== streamEnd.waitableIdx()) {{ throw new Error('event index does not match stream end'); }}

                        {debug_log_fn}('[{stream_cancel_fn}()] successful cancel', {{ ctx, streamEndWaitableIdx, streamEnd, event }});
                        return payload;
                    }}
                "#));
            }

            // NOTE: as writable drops are called from guests, they may happen *after*
            // a host has tried to read off the end (i.e. getting back the async blocked constant),
            // when running non-deterministrically (the default)
            Self::StreamDropReadable | Self::StreamDropWritable => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_drop_fn = self.name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let is_write = matches!(self, Self::StreamDropWritable);
                let stream_end_class = if is_write {
                    Self::StreamWritableEndClass.name()
                } else {
                    Self::StreamReadableEndClass.name()
                };
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!(r#"
                    function {stream_drop_fn}(ctx, streamEndWaitableIdx) {{
                        {debug_log_fn}('[{stream_drop_fn}()] args', {{ ctx, streamEndWaitableIdx }});
                        const {{ streamTableIdx, componentIdx }} = ctx;

                        const task = {current_task_get_fn}(componentIdx);
                        if (!task) {{ throw new Error('invalid/missing async task'); }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate) {{ throw new Error(`missing component state for component idx [${{componentIdx}}]`); }}

                        const streamEnd = cstate.deleteStreamEnd({{ tableIdx: streamTableIdx, streamEndWaitableIdx }});
                        if (!streamEnd) {{
                            throw new Error(`missing stream (waitable [${{streamEndWaitableIdx}}], table [${{streamTableIdx}}], component [${{componentIdx}}])`);
                        }}

                        if (!(streamEnd instanceof {stream_end_class})) {{
                          throw new Error('invalid stream end class, expected [{stream_end_class}]');
                        }}

                        streamEnd.drop();
                    }}
                "#));
            }

            Self::StreamTransfer => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_transfer_fn = self.name();
                let get_global_current_task_meta_fn = Intrinsic::GetGlobalCurrentTaskMetaFn.name();
                let current_task_get_fn = AsyncTaskIntrinsic::GetCurrentTask.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let global_stream_table_map = AsyncStreamIntrinsic::GlobalStreamTableMap.name();

                output.push_str(&format!(
                    r#"
                    function {stream_transfer_fn}(
                        srcStreamWaitableIdx,
                        srcTableIdx,
                        destTableIdx,
                    ) {{
                        {debug_log_fn}('[{stream_transfer_fn}()] args', {{
                            srcStreamWaitableIdx,
                            srcTableIdx,
                            destTableIdx,
                        }});

                        const streamMeta = {global_stream_table_map}[srcTableIdx];
                        if (!streamMeta) {{ throw new Error('missing stream meta during transfer'); }}
                        const componentIdx = streamMeta.componentIdx;

                        const globalTaskMeta = {get_global_current_task_meta_fn}(componentIdx);
                        if (!globalTaskMeta) {{ throw new Error('missing global current task globalTaskMeta'); }}
                        const taskID = globalTaskMeta.taskID;

                        const taskMeta = {current_task_get_fn}(componentIdx, taskID);
                        if (!taskMeta) {{ throw new Error('missing current task metadata while doing stream transfer'); }}

                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('missing task while doing stream transfer'); }}
                        if (componentIdx !== task.componentIdx()) {{
                            throw new Error("task component ID should match current component ID");
                        }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate) {{ throw new Error(`missing async state for component [${{componentIdx}}]`); }}

                        const streamEnd = cstate.removeStreamEndFromTable({{ tableIdx: srcTableIdx, streamWaitableIdx: srcStreamWaitableIdx }});
                        if (!streamEnd.isReadable()) {{
                            throw new Error("writable stream ends cannot be moved");
                        }}
                        if (streamEnd.isDone()) {{
                            throw new Error('readable ends cannot be moved once writable ends are dropped');
                        }}

                        const {{ handle, waitableIdx }} = cstate.addStreamEndToTable({{ tableIdx: destTableIdx, streamEnd }});
                        streamEnd.setTarget(`stream read end (waitable [${{waitableIdx}}])`);

                        {debug_log_fn}('[{stream_transfer_fn}()] successfully transferred', {{
                            dest: {{
                                streamEndHandle: handle,
                                streamEndWaitableIdx: waitableIdx,
                                tableIdx: destTableIdx,
                            }},
                            src: {{
                                streamEndWaitableIdx: srcStreamWaitableIdx,
                                tableIdx: srcTableIdx,
                            }},
                            componentIdx,
                        }});

                        return waitableIdx;

                      }}
                "#
                ));
            }
        }
    }
}
