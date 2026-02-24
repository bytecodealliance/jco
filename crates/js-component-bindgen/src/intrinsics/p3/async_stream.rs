//! Intrinsics that represent helpers that enable Stream integration

use crate::{
    intrinsics::{Intrinsic, component::ComponentIntrinsic, p3::waitable::WaitableIntrinsic},
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
                            CANCELLED: 1,
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
                            this.#componentIdx = args.componentIdx ??= null;
                            this.#waitable = args.waitable;
                            this.#onDrop = args.onDrop;
                            this.target = args.target;
                        }}

                        isHostOwned() {{ return this.#componentIdx === null; }}

                        tableIdx() {{ return this.#tableIdx; }}
                        idx() {{ return this.#idx; }}
                        setIdx(idx) {{ this.#idx = idx; }}

                        setTarget(tgt) {{ this.target = tgt; }}

                        getWaitable() {{ return this.#waitable; }}

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

                        setPendingEventFn(fn) {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            {debug_log_fn}('[{stream_end_class}#setPendingEventFn()]', {{
                                waitable: this.#waitable,
                                waitableinSet: this.#waitable.isInSet(),
                                componentIdx: this.#waitable.componentIdx(),
                            }});
                            this.#waitable.setPendingEventFn(fn);
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
                            if (this.#dropped) {{ throw new Error('already dropped'); }}

                            if (this.#waitable) {{
                                const w = this.#waitable;
                                this.#waitable = null;
                                w.drop();
                            }}

                            this.#dropped = true;

                            if (this.#onDrop) {{ this.#onDrop() }}
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
                        const {{ memory, ptr, count, eventCode }} = args;
                        if (eventCode === undefined) {{ throw new Error("missing/invalid event code"); }}

                        let buffer = args.buffer;
                        let bufferID = args.bufferID;
                        if (this.isCopying()) {{
                            throw new Error('stream is currently undergoing a separate copy');
                        }}
                        if (this.getCopyState() !== {stream_end_class}.CopyState.IDLE) {{
                            throw new Error(`stream [${{streamEndIdx}}] (tableIdx [${{streamTableIdx}}], component [${{componentIdx}}]) is not in idle state`);
                        }}

                        const elemMeta = this.getElemMeta();
                        if (elemMeta.isBorrowed) {{ throw new Error('borrowed types cannot be sent over streams'); }}

                        // If we already have a managed buffer (likely host case), we can use that, otherwise we must
                        // create a buffer (likely in the guest case)
                        if (!buffer) {{
                            const newBuffer = {global_buffer_manager}.createBuffer({{
                                componentIdx: this.#componentIdx,
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
                            bufferID = newBuffer.bufferID;
                            buffer = newBuffer.buffer;
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
                            if (buffer.copied() >= {managed_buffer_class}.MAX_LENGTH) {{
                                 throw new Error(`buffer size [${{buf.length}}] greater than max length`);
                            }}
                            if (buffer.length > 2**28) {{ throw new Error('buffer uses reserved space'); }}

                            const packedResult = (buffer.copied() << 4) | result;
                            return {{ code: eventCode, payload0: streamEnd.waitableIdx(), payload1: packedResult }};
                        }};

                        const onCopy = (reclaimBufferFn) => {{
                            streamEnd.setPendingEventFn(() => {{
                                return processFn({stream_end_class}.CopyResult.COMPLETED, reclaimBufferFn);
                            }});
                        }};

                        const onCopyDone = (result) => {{
                            streamEnd.setPendingEventFn(() => {{
                                return processFn(result);
                            }});
                        }};

                        return {{ bufferID, buffer, onCopy, onCopyDone }};
                    }}
                    "#
                );

                let (inner_rw_fn_name, inner_rw_impl) = match self {
                    // Internal implementation for writing to internal buffer after reading from a provided managed buffers
                    Self::StreamWritableEndClass => (
                        "_write",
                        format!(
                            r#"
                            _write(args) {{
                                const {{ buffer, onCopy, onCopyDone }} = args;
                                if (!buffer) {{ throw new TypeError('missing/invalid buffer'); }}
                                if (!onCopy) {{ throw new TypeError("missing/invalid onCopy handler"); }}
                                if (!onCopyDone) {{ throw new TypeError("missing/invalid onCopyDone handler"); }}

                                if (!this.#pendingBufferMeta.buffer) {{
                                    this.setPendingBufferMeta({{ componentIdx: this.#componentIdx, buffer, onCopy, onCopyDone }});
                                    return;
                                }}

                                const pendingElemMeta = this.#pendingBufferMeta.buffer.getElemMeta();
                                const newBufferElemMeta = buffer.getElemMeta();
                                if (pendingElemMeta.typeIdx !== newBufferElemMeta.typeIdx) {{
                                    throw new Error("trap: stream end type does not match internal buffer");
                                }}

                                // If the buffer came from the same component that is currently doing the operation
                                // we're doing a inter-component write, and only unit or numeric types are allowed
                                if (this.#pendingBufferMeta.componentIdx === this.#componentIdx && !this.#elemMeta.isNoneOrNumeric) {{
                                    throw new Error("trap: cannot stream non-numeric types withing the same component");
                                }}

                                // If original capacities were zero, we're dealing with a unit stream,
                                // a write to the unit stream is instantly copied without any work.
                                if (buffer.capacity() === 0 && this.#pendingBufferMeta.buffer.capacity() === 0) {{
                                    onCopyDone({stream_end_class}.CopyResult.COMPLETED);
                                    return;
                                }}

                                // If the internal buffer has no space left to take writes,
                                // the write is complete, we must reset and wait for another read
                                // to clear up space in the buffer.
                                if (this.#pendingBufferMeta.buffer.remainingCapacity() === 0) {{
                                    this.resetAndNotifyPending({stream_end_class}.CopyResult.COMPLETED);
                                    this.setPendingBufferMeta({{ componentIdx, buffer, onCopy, onCopyDone }});
                                    return;
                                }}

                                // If there is still remaining capacity in the incoming buffer, perform copy of values
                                // to the internal buffer from the incoming buffer
                                if (buffer.remainingCapacity() > 0) {{
                                    const numElements = Math.min(buffer.remainingCapacity(), this.#pendingBufferMeta.buffer.remainingCapacity());
                                    this.#pendingBufferMeta.buffer.write(buffer.read(numElements));
                                    this.#pendingBufferMeta.onCopyFn(() => this.resetPendingBufferMeta());
                                }}

                                onCopyDone({stream_end_class}.CopyResult.COMPLETED);
                            }}
                        "#,
                        ),
                    ),
                    // Internal implementation for reading from an internal buffer and writing to a provided managed buffer
                    Self::StreamReadableEndClass => (
                        "_read",
                        format!(
                            r#"
                            _read(args) {{
                                const {{ buffer, onCopyDone, onCopy }} = args;
                                if (this.isDropped()) {{
                                    onCopyDone({stream_end_class}.CopyResult.DROPPED);
                                    return;
                                }}

                                if (!this.#pendingBufferMeta.buffer) {{
                                    this.setPendingBufferMeta({{
                                        componentIdx: this.#componentIdx,
                                        buffer,
                                        onCopy,
                                        onCopyDone,
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
                                if (this.#pendingBufferMeta.componentIdx === this.#componentIdx && !this.#elemMeta.isNoneOrNumeric) {{
                                    throw new Error("trap: cannot stream non-numeric types withing the same component");
                                }}

                                const pendingRemaining = this.#pendingBufferMeta.buffer.remainingCapacity();
                                if (pendingRemaining > 0) {{
                                    const bufferRemaining = buffer.remainingCapacity();
                                    if (bufferRemaining > 0) {{
                                        const count = Math.min(pendingRemaining, bufferRemaining);
                                        buffer.write(this.#pendingBufferMeta.buffer.read(count))
                                        this.#pendingBufferMeta.onCopyFn(() => this.resetPendingBufferMeta());
                                    }}
                                    onCopyDone({stream_end_class}.CopyResult.COMPLETED);
                                    return;
                                }}

                                this.resetAndNotifyPending({stream_end_class}.CopyResult.COMPLETED);
                                this.setPendingBufferMeta({{ componentIdx: this.#componentIdx, buffer, onCopy, onCopyDone }});
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
                             const {{ isAsync, memory, componentIdx, ptr, count, eventCode }} = args;
                             if (eventCode === undefined) {{ throw new TypeError('missing/invalid event code'); }}

                             if (this.isDropped()) {{
                                 if (this.#pendingBufferMeta?.onCopyDoneFn) {{
                                     const f = this.#pendingBufferMeta.onCopyDoneFn;
                                     this.#pendingBufferMeta.onCopyDoneFn = null;
                                     f({stream_end_class}.CopyResult.DROPPED);
                                 }}
                                 return;
                             }}

                             const {{ buffer, onCopy, onCopyDone }} = this.setupCopy({{
                                 memory,
                                 eventCode,
                                 ptr,
                                 count,
                                 buffer: args.buffer,
                                 bufferID: args.bufferID,
                             }});

                             // Perform the read/write
                             this.{inner_rw_fn_name}({{
                                 buffer,
                                 onCopy,
                                 onCopyDone,
                             }});

                             // If sync, wait forever but allow task to do other things
                             if (!this.hasPendingEvent()) {{
                               if (isAsync) {{
                                   this.setCopyState({stream_end_class}.CopyState.ASYNC_COPYING);
                                   return {async_blocked_const};
                               }} else {{
                                   this.setCopyState({stream_end_class}.CopyState.SYNC_COPYING);

                                   const taskMeta = {current_task_get_fn}(componentIdx);
                                   if (!taskMeta) {{ throw new Error(`missing task meta for component idx [${{componentIdx}}]`); }}

                                   const task = taskMeta.task;
                                   if (!task) {{ throw new Error('missing task task from task meta'); }}

                                   const streamEnd = this;
                                   await task.suspendUntil({{
                                       readyFn: () => {{
                                           return streamEnd.hasPendingEvent();
                                       }}
                                   }});
                               }}
                             }}

                             const event = this.getPendingEvent();
                             if (!event) {{ throw new Error("unexpectedly missing pending event"); }}
                             if (!event.code || !event.payload0 || !event.payload1) {{
                                 throw new Error("unexpectedly malformed event");
                             }}

                             const {{ code, payload0: index, payload1: payload }} = event;

                             if (code !== eventCode  || index !== this.#getEndIdxFn() || payload === {async_blocked_const}) {{
                                 const errMsg = "invalid event code/event during stream operation";
                                 {debug_log_fn}(errMsg, {{
                                     event,
                                     payload,
                                     payloadIsBlockedConst: payload === {async_blocked_const},
                                     code,
                                     eventCode,
                                     codeDoesNotMatchEventCode: code !== eventCode,
                                     index,
                                     internalEndIdx: this.#getEndIdxFn(),
                                     indexDoesNotMatch: index !== this.#getEndIdxFn(),
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

                // NOTE: these action implementations `write()` and `read()` are normally called
                // from the host -- internally components will use the `stream.{write, read}` intrinsics
                // which call the `copy()` function on the stream end class directly.
                let action_impl = match self {
                    Self::StreamWritableEndClass => format!(
                        r#"
                         async write(v) {{
                            {debug_log_fn}('[{end_class_name}#write()] args', {{ v }});

                            const {{ id: bufferID, buffer }} = {global_buffer_manager}.createBuffer({{
                                componentIdx: null, // componentIdx of null indicates the host
                                count: 1,
                                isReadable: true, // we need to read from this buffer later
                                isWritable: false,
                                elemMeta: this.#elemMeta,
                                data: v,
                            }});

                            await this.copy({{
                                isAsync: true,
                                count: 1,
                                bufferID,
                                buffer,
                                eventCode: {async_event_code_enum}.STREAM_WRITE,
                            }});
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

                            const {{ id: bufferID, buffer }} = {global_buffer_manager}.createBuffer({{
                                componentIdx: null, // componentIdx of null indicates the host
                                count: 1,
                                isReadable: false,
                                isWritable: true, // we need to write out the pending buffer (if present)
                                elemMeta: this.#elemMeta,
                                data: [],
                            }});

                            const count = 1;
                            const packedResult = await this.copy({{
                                isAsync: true,
                                count,
                                bufferID,
                                buffer,
                                eventCode: {async_event_code_enum}.STREAM_READ,
                            }});

                            let copied = packedResult >> 4;
                            let result = packedResult & 0x000F;

                            const vs = buffer.read();

                            return count === 1 ? vs[0] : vs;
                         }}
                        "#
                    ),
                    _ => unreachable!("impossible stream readable end class intrinsic"),
                };

                output.push_str(&format!(r#"
                    class {end_class_name} extends {stream_end_class} {{
                        #componentIdx;

                        #copying = false;
                        #done = false;

                        #elemMeta = null;
                        #pendingBufferMeta = null; // held by both write and read ends

                        #getEndIdxFn;

                        #streamRep;
                        #streamTableIdx;

                        constructor(args) {{
                            {debug_log_fn}('[{end_class_name}#constructor()] args', args);
                            super(args);

                            if (!args.elemMeta) {{ throw new Error('missing/invalid element meta'); }}
                            this.#elemMeta = args.elemMeta;

                            if (args.componentIdx === undefined) {{ throw new Error('missing/invalid component idx'); }}
                            this.#componentIdx = args.componentIdx;

                            if (!args.pendingBufferMeta) {{ throw new Error('missing/invalid shared pending buffer meta'); }}
                            this.#pendingBufferMeta = args.pendingBufferMeta;

                            if (!args.getEndIdxFn) {{ throw new Error('missing/invalid fn for getting table idx'); }}
                            this.#getEndIdxFn = args.getEndIdxFn;

                            if (!args.streamRep) {{ throw new Error('missing/invalid rep for stream'); }}
                            this.#streamRep = args.streamRep;

                            if (args.tableIdx === undefined) {{ throw new Error('missing index for stream table idx'); }}
                            this.#streamTableIdx = args.tableIdx;
                        }}

                        streamRep() {{ return this.#streamRep; }}
                        streamTableIdx() {{ return this.#streamTableIdx; }}

                        waitableIdx() {{ return this.#getEndIdxFn(); }}

                        getElemMeta() {{ return {{...this.#elemMeta}}; }}

                        {type_getter_impl}

                        isDone() {{ this.getCopyState() === {stream_end_class}.CopyState.DONE; }}
                        isCompleted() {{ this.getCopyState() === {stream_end_class}.CopyState.COMPLETED; }}

                        {action_impl}
                        {inner_rw_impl}
                        {copy_setup_impl}
                        {copy_impl}

                        setPendingBufferMeta(args) {{
                            const {{ componentIdx, buffer, onCopy, onCopyDone }} = args;
                            this.#pendingBufferMeta.componentIdx = componentIdx;
                            this.#pendingBufferMeta.buffer = buffer;
                            this.#pendingBufferMeta.onCopyFn = onCopy;
                            this.#pendingBufferMeta.onCopyDoneFn = onCopyDone;
                        }}

                        resetPendingBufferMeta() {{
                            this.setPendingBufferMeta({{ componentIdx: null, buffer: null, onCopy: null, onCopyDone: null }});
                        }}

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
                            if (this.#copying) {{ throw new Error('cannot drop while copying'); }}

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
                let internal_stream_class = self.name();
                let read_end_class = Self::StreamReadableEndClass.name();
                let write_end_class = Self::StreamWritableEndClass.name();
                let waitable_class = Intrinsic::Waitable(WaitableIntrinsic::WaitableClass).name();
                output.push_str(&format!(
                    r#"
                    class {internal_stream_class} {{
                        #rep;
                        #idx;
                        #componentIdx;

                        #readEnd;
                        #readEndWaitableIdx;
                        #readEndDropped;

                        #writeEnd;
                        #writeEndWaitableIdx;
                        #writeEndDropped;

                        #pendingBufferMeta = {{}};
                        #elemMeta;

                        #localStreamTable;
                        #globalStreamMap;

                        constructor(args) {{
                            if (typeof args.componentIdx !== 'number') {{ throw new Error('missing/invalid component idx'); }}
                            if (!args.elemMeta) {{ throw new Error('missing/invalid stream element metadata'); }}
                            if (args.tableIdx === undefined) {{ throw new Error('missing/invalid stream table idx'); }}
                            const {{ tableIdx, componentIdx, elemMeta, globalStreamMap, localStreamTable }} = args;

                            this.#componentIdx = args.componentIdx;
                            this.#elemMeta = elemMeta;

                            if (args.globalStreamMap) {{
                                this.#globalStreamMap = args.globalStreamMap;
                                this.#rep = globalStreamMap.insert(this);
                            }}
                            if (args.localStreamTable) {{
                                this.#localStreamTable = args.localStreamTable;
                                this.#idx = localStreamTable.insert(this);
                            }}

                            this.#readEnd = new {read_end_class}({{
                                componentIdx,
                                tableIdx,
                                elemMeta: this.#elemMeta,
                                pendingBufferMeta: this.#pendingBufferMeta,
                                streamRep: this.#rep,
                                getEndIdxFn: () => this.#readEndWaitableIdx,
                                target: `stream read end (global rep [${{this.#rep}}])`,
                                waitable: new {waitable_class}({{
                                    componentIdx,
                                    target: `stream read end (stream local idx [${{this.#idx}}], global rep [${{this.#rep}}])`
                                }}),
                                onDrop: () => {{
                                    this.#readEndDropped = true;
                                    if (this.#readEndDropped && this.#readEndDropped) {{
                                        {debug_log_fn}('[{internal_stream_class}] triggering drop due to end drops', {{
                                            globalRep: this.#rep,
                                            streamTableIdx: this.#idx,
                                            readEndWaitableIdx: this.#readEndWaitableIdx,
                                            writeEndWaitableIdx: this.#writeEndWaitableIdx,
                                        }});
                                        this.drop();
                                    }}
                                }},
                            }});

                            this.#writeEnd = new {write_end_class}({{
                                componentIdx,
                                tableIdx,
                                elemMeta: this.#elemMeta,
                                pendingBufferMeta: this.#pendingBufferMeta,
                                getEndIdxFn: () => this.#writeEndWaitableIdx,
                                streamRep: this.#rep,
                                target: `stream write end (global rep [${{this.#rep}}])`,
                                waitable: new {waitable_class}({{
                                    componentIdx,
                                    target: `stream write end (stream local idx [${{this.#rep}}], global rep [${{this.#rep}}])`
                                }}),
                                onDrop: () => {{
                                    this.#writeEndDropped = true;
                                    // TODO(fix): racy
                                    if (this.#readEndDropped && this.#writeEndDropped) {{
                                        {debug_log_fn}('[{internal_stream_class}] triggering drop due to end drops', {{
                                            globalRep: this.#rep,
                                            streamTableIdx: this.#idx,
                                            readEndWaitableIdx: this.#readEndWaitableIdx,
                                            writeEndWaitableIdx: this.#writeEndWaitableIdx,
                                        }});
                                        this.drop();
                                    }}
                                }},
                            }});
                        }}

                        idx() {{ return this.#idx; }}
                        rep() {{ return this.#rep; }}

                        readEnd() {{ return this.#readEnd; }}
                        setReadEndWaitableIdx(idx) {{ this.#readEndWaitableIdx = idx; }}

                        writeEnd() {{ return this.#writeEnd; }}
                        setWriteEndWaitableIdx(idx) {{ this.#writeEndWaitableIdx = idx; }}

                        drop() {{
                            {debug_log_fn}('[{internal_stream_class}#drop()]');
                            if (this.#globalStreamMap) {{
                                const removed = this.#globalStreamMap.remove(this.#rep);
                                if (!removed) {{
                                     throw new Error(`failed to remove stream [${{this.#rep}}] in global stream map (component [${{this.#componentIdx}}] while removing stream end`);
                                }}
                            }}

                            if (this.#localStreamTable) {{
                                let removed = this.#localStreamTable.remove(this.#idx);
                                if (!removed) {{
                                     throw new Error(`failed to remove stream [${{streamEnd.waitableIdx()}}] in internal table (table [${{tableIdx}}]), component [${{this.#componentIdx}}] while removing stream end`);
                                }}
                            }}
                        }}
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

                        setRep(rep) {{ this.#rep = rep; }}

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
                                hostStreamRep: this.#rep,
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
                        #hostStreamRep = null;
                        #isReadable;
                        #isWritable;
                        #writeFn;
                        #readFn;

                        constructor(args) {{
                            {debug_log_fn}('[{external_stream_class_name}#constructor()] args', args);
                            if (args.hostStreamRep === undefined) {{ throw new TypeError("missing host stream rep"); }}
                            this.#hostStreamRep = args.hostStreamRep;

                            if (args.isReadable === undefined) {{ throw new TypeError("missing readable setting"); }}
                            this.#isReadable = args.isReadable;

                            if (args.isWritable === undefined) {{ throw new TypeError("missing writable setting"); }}
                            this.#isWritable = args.isWritable;

                            if (this.#isWritable && args.writeFn === undefined) {{ throw new TypeError("missing write fn"); }}
                            this.#writeFn = args.writeFn;

                            if (this.#isReadable && args.readFn === undefined) {{ throw new TypeError("missing read fn"); }}
                            this.#readFn = args.readFn;
                        }}

                        isConnectedToHost() {{ return hostStreamRep ===  null; }}

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

                        const {{ writeEndIdx, readEndIdx }} = cstate.createStream({{
                            tableIdx: streamTableIdx,
                            elemMeta,
                        }});

                        return (BigInt(writeEndIdx) << 32n) | BigInt(readEndIdx);
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
                        streamEndIdx,
                        ptr,
                        count,
                    ) {{
                        {debug_log_fn}('[{stream_op_fn}()] args', {{ ctx, streamEndIdx, ptr, count }});
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
                        if (streamEndIdx === undefined) {{ throw new TypeError("missing/invalid stream end idx"); }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        // TODO(fix): check for may block & async

                        const streamEnd = cstate.getStreamEnd({{ tableIdx: streamTableIdx, streamEndIdx }});
                        if (!streamEnd) {{
                            throw new Error(`missing stream end [${{streamEndIdx}}] (table [${{streamTableIdx}}], component [${{componentIdx}}])`);
                        }}
                        if (!(streamEnd instanceof {stream_end_class})) {{
                            throw new Error('invalid stream type, expected {stream_end_class}');
                        }}
                        if (streamEnd.tableIdx() !== streamTableIdx) {{
                            throw new Error(`stream end table idx [${{streamEnd.getStreamTableIdx()}}] != operation table idx [${{streamTableIdx}}]`);
                        }}

                        const res = await streamEnd.copy({{
                            isAsync,
                            memory: getMemoryFn(),
                            ptr,
                            count,
                            eventCode: {event_code},
                        }});

                        return res;
                    }}
                "#));
            }

            Self::StreamCancelRead | Self::StreamCancelWrite => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_cancel_fn = self.name();
                let global_stream_map = Self::GlobalStreamMap.name();
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
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!("
                    async function {stream_cancel_fn}(
                        streamIdx,
                        isAsync,
                        streamEndIdx,
                    ) {{
                        {debug_log_fn}('[{stream_cancel_fn}()] args', {{
                            streamIdx,
                            isAsync,
                            streamEndIdx,
                        }});

                        const state = {get_or_create_async_state_fn}(componentIdx);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        const streamEnd = {global_stream_map}.get(streamEndIdx);
                        if (!streamEnd) {{ throw new Error('missing stream end with idx [' + streamEndIdx + ']'); }}
                        if (!(streamEnd instanceof {stream_end_class})) {{ throw new Error('invalid stream end, expected value of type [{stream_end_class}]'); }}

                        if (streamEnd.elementTypeRep() !== stream.elementTypeRep()) {{
                          throw new Error('stream type [' + stream.elementTypeRep() + '], does not match stream end type [' + streamEnd.elementTypeRep() + ']');
                        }}

                        if (!streamEnd.isCopying()) {{ throw new Error('stream end is not copying, cannot cancel'); }}

                        if (!streamEnd.hasPendingEvent()) {{
                          if (!streamEnd.hasPendingEvent()) {{
                            if (!isAsync) {{
                              await task.blockOn({{ promise: streamEnd.waitable, isAsync: false }});
                            }} else {{
                              return {async_blocked_const};
                            }}
                          }}
                        }}

                        const {{ code, payload0: index, payload1: payload }} = e.getEvent();
                        if (streamEnd.isCopying()) {{ throw new Error('stream end is still in copying state'); }}
                        if (code !== {event_code_enum}) {{ throw new Error('unexpected event code [' + code + '], expected [' + {event_code_enum} + ']'); }}
                        if (index !== 1) {{ throw new Error('unexpected index, should be 1'); }}

                        return payload;
                    }}
                "));
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
                    function {stream_drop_fn}(ctx, streamEndIdx) {{
                        {debug_log_fn}('[{stream_drop_fn}()] args', {{ ctx, streamEndIdx }});
                        const {{ streamTableIdx, componentIdx }} = ctx;

                        const task = {current_task_get_fn}(componentIdx);
                        if (!task) {{ throw new Error('invalid/missing async task'); }}

                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate) {{ throw new Error(`missing component state for component idx [${{componentIdx}}]`); }}

                        const streamEnd = cstate.removeStreamEnd({{ tableIdx: streamTableIdx, streamEndIdx }});
                        if (!streamEnd) {{
                            throw new Error(`missing stream [${{streamEndIdx}}] (table [${{streamTableIdx}}], component [${{componentIdx}}])`);
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
                let current_component_idx_globals =
                    AsyncTaskIntrinsic::GlobalAsyncCurrentComponentIdxs.name();
                let current_async_task_id_globals =
                    AsyncTaskIntrinsic::GlobalAsyncCurrentTaskIds.name();
                let current_task_get_fn = AsyncTaskIntrinsic::GetCurrentTask.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();

                output.push_str(&format!(
                    r#"
                    function {stream_transfer_fn}(
                        srcStreamEndIdx,
                        srcTableIdx,
                        destTableIdx,
                    ) {{
                        {debug_log_fn}('[{stream_transfer_fn}()] args', {{
                            srcStreamEndIdx,
                            srcTableIdx,
                            destTableIdx,
                        }});

                        const taskMeta = {current_task_get_fn}(
                            {current_component_idx_globals}.at(-1),
                            {current_async_task_id_globals}.at(-1)
                        );
                        if (!taskMeta) {{ throw new Error('missing current task metadata while doing stream transfer'); }}

                        const task = taskMeta.task;
                        if (!task) {{ throw new Error('missing task while doing stream transfer'); }}

                        const componentIdx = task.componentIdx();
                        const cstate = {get_or_create_async_state_fn}(componentIdx);
                        if (!cstate) {{ throw new Error(`unexpectedly missing async state for component [${{componentIdx}}]`); }}

                        const streamEnd = cstate.removeStreamEnd({{ tableIdx: srcTableIdx, streamEndIdx: srcStreamEndIdx }});
                        if (!streamEnd.isReadable()) {{ throw new Error("writable stream ends cannot be moved"); }}
                        if (streamEnd.isDone()) {{
                            throw new Error('readable ends cannot be moved once writable ends are dropped');
                        }}

                        const streamEndIdx = cstate.addStreamEnd({{ tableIdx: destTableIdx, streamEnd }});

                        return streamEndIdx;
                      }}
                "#
                ));
            }
        }
    }
}
