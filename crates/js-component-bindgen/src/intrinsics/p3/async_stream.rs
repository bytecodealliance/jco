//! Intrinsics that represent helpers that enable Stream integration

use crate::{
    intrinsics::{component::ComponentIntrinsic, Intrinsic},
    source::Source,
};

use super::async_task::AsyncTaskIntrinsic;

/// This enum contains intrinsics that enable Stream
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum AsyncStreamIntrinsic {
    /// Global that stores streams
    ///
    /// ```ts
    /// type i32 = number;
    /// type StreamEnd = StreamWritableEndClass | StreamReadableEndClass;
    /// type GlobalStreamMap<T> = Map<i32, StreamEnd>;
    /// ```
    GlobalStreamMap,

    /// The definition of the `StreamWritableEnd` JS class
    ///
    /// This class serves as a shared implementation used by writable and readable ends
    StreamEndClass,

    /// The definition of the `StreamWritableEnd` JS class
    StreamWritableEndClass,

    /// The definition of the `StreamReadableEnd` JS class
    StreamReadableEndClass,

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
    ///     componentInstanceID: i32,
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
    ///     componentInstanceID: i32,
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
            Self::StreamWritableEndClass => "StreamWritableEnd",
            Self::StreamReadableEndClass => "StreamReadableEnd",
            Self::StreamNew => "streamNew",
            Self::StreamRead => "streamRead",
            Self::StreamWrite => "streamWrite",
            Self::StreamDropReadable => "streamDropReadable",
            Self::StreamDropWritable => "streamDropWritable",
            Self::StreamCancelRead => "streamCancelRead",
            Self::StreamCancelWrite => "streamCancelWrite",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            // TODO: implement lone waitable usage
            Self::StreamEndClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_end_class = Self::StreamEndClass.name();
                output.push_str(&format!("
                    class {stream_end_class} {{
                        #waitable = null;
                        #elementTypeRep = null;
                        #componentInstanceID = null;
                        #dropped = false;

                        const CopyResult = {{
                            COMPLETED: 0,
                            DROPPED: 1,
                            CANCELLED: 1,
                        }}

                        constructor(args) {{
                            {debug_log_fn}('[{stream_end_class}#constructor()] args', args);
                            if (!args?.elementTypeRep || typeof args.elementTypeRep !== 'number') {{
                                throw new TypeError('missing elementTypeRep [' + args.elementTypeRep + ']');
                            }}
                            if (args.elementTypeRep <= 0 || args.elementTypeRep > 2_147_483_647 ))  {{
                                throw new TypeError('invalid  elementTypeRep [' + args.elementTypeRep + ']');
                            }}
                            this.#elementTypeRep = args.elementTypeRep;
                            this.#componentInstanceID = args.componentInstanceID ??= null;
                        }}

                        elementTypeRep() {{ return this.#elementTypeRep; }}

                        isHostOwned() {{ return this.#componentInstanceID === null; }}

                        setWaitableEvent(fn) {{
                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            this.#waitable.setEvent(fn);
                        }}

                        drop() {{
                            if (this.#dropped) {{ throw new Error('already dropped'); }}

                            if (!this.#waitable) {{ throw new Error('missing/invalid waitable'); }}
                            this.#waitable.drop();
                            this.#waitable = null;

                            this.#dropped = true;
                        }}
                    }}
                "));
            }

            Self::StreamReadableEndClass | Self::StreamWritableEndClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let (class_name, stream_var_name, js_stream_class_name) = match self {
                    Self::StreamReadableEndClass => (self.name(), "readable", "ReadableStream"),
                    Self::StreamWritableEndClass => (self.name(), "writable", "WritableStream"),
                    _ => unreachable!("impossible stream readable end class intrinsic"),
                };
                let stream_end_class = Self::StreamEndClass.name();

                let copy_impl = match self {
                    Self::StreamWritableEndClass => "
                         copy() {
                             if (this.#done) { throw new Error('stream has completed'); }
                             if (!this.#writable) { throw new Error('missing/invalid writable'); }
                             throw new Error('{class_name}#copy() not implemented');
                         }
                    "
                    .to_string(),
                    Self::StreamReadableEndClass => "
                         copy() {
                             if (this.#done) { throw new Error('stream has completed'); }
                             if (!this.#readable) { throw new Error('missing/invalid readable'); }
                             throw new Error('{class_name}#copy() not implemented');
                         }
                    "
                    .to_string(),
                    _ => unreachable!("impossible stream readable end class intrinsic"),
                };

                output.push_str(&format!("
                    class {class_name} extends {stream_end_class} {{
                        #copying = false;
                        #{stream_var_name} = null;
                        #dropped = false;
                        #done = false;

                        constructor(args) {{
                            {debug_log_fn}('[{class_name}#constructor()] args', args);
                            super(args);
                            if (!args.{stream_var_name} || !(args.{stream_var_name} instanceof {js_stream_class_name})) {{
                                throw new TypeError('missing/invalid stream, expected {js_stream_class_name}');
                            }}
                            this.#{stream_var_name} = args.{stream_var_name};
                        }}

                        isCopying() {{ return this.#copying; }}
                        clearCopying() {{
                            if (!this.#copying) {{ throw new Error('attempt to clear while copying not in progress'); }}
                            this.#copying = false;
                        }}

                        isDone() {{ return this.#done; }}
                        markDone() {{
                            this.#done = true;
                        }}

                        {copy_impl}

                        drop() {{
                            if (self.#dropped) {{ throw new Error('already dropped'); }}
                            if (self.#copying) {{ throw new Error('cannot drop while copying'); }}

                            if (!self.#{stream_var_name}) {{ throw new Error('missing/invalid stream'); }}
                            this.#{stream_var_name}.close();

                            super.drop();
                            self.#dropped = true;
                        }}
                    }}
                "));
            }

            Self::GlobalStreamMap => {
                let global_stream_map = Self::GlobalStreamMap.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                output.push_str(&format!(
                    "
                    const {global_stream_map} = new {rep_table_class}();
                "
                ));
            }

            // TODO: allow customizable stream functionality (user should be able to specify a lib/import for a 'stream()' function
            // (this will enable using p3-shim explicitly or any other implementation)
            //
            // TODO: Streams need a class
            Self::StreamNew => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_new_fn = Self::StreamNew.name();
                let stream_readable_end_class = Self::StreamReadableEndClass.name();
                let stream_writable_end_class = Self::StreamWritableEndClass.name();
                let global_stream_map = Self::GlobalStreamMap.name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!("
                    function {stream_new_fn}(componentInstanceID, elementTypeRep) {{
                        {debug_log_fn}('[{stream_new_fn}()] args', {{ componentInstanceID, elementTypeRep }});

                        const task = {current_task_get_fn}(componentInstanceID);
                        if (!task) {{ throw new Error('invalid/missing async task'); }}

                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        let stream = new TransformStream();
                        let writableIdx = {global_stream_map}.insert(new {stream_writable_end_class}({{
                            elementTypeRep,
                            writable: stream.writable,
                            componentInstanceID,
                        }}));
                        let readableIdx = {global_stream_map}.insert(new {stream_readable_end_class}({{
                            elementTypeRep,
                            readable: stream.readable,
                            componentInstanceID,
                        }}));

                        return BigInt(writableIdx) << 32n | BigInt(readableIdx);
                    }}
                "));
            }

            Self::StreamWrite | Self::StreamRead => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let stream_fn = self.name();
                let global_stream_map = Self::GlobalStreamMap.name();
                let stream_end_class = Self::StreamEndClass.name();
                let is_write = matches!(self, Self::StreamWrite);
                // When performing a StreamWrite, we expect to deal with a stream end that is only guest-readable,
                // and when performing a stream read, we expect to deal with a stream end that is guest-writable
                let end_class = if is_write {
                    Self::StreamReadableEndClass.name()
                } else {
                    Self::StreamWritableEndClass.name()
                };
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let is_borrowed_type_fn = Intrinsic::IsBorrowedType.name();
                let global_buffer_manager = Intrinsic::GlobalBufferManager.name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let managed_buffer_class = Intrinsic::ManagedBufferClass.name();
                let async_blocked_const =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncBlockedConstant).name();
                output.push_str(&format!("
                    async function {stream_fn}(
                        componentInstanceID,
                        memoryIdx,
                        reallocIdx,
                        stringEncoding,
                        isAsync,
                        streamEndIdx,
                        typeIdx,
                        ptr,
                        count,
                    ) {{
                        {debug_log_fn}('[{stream_fn}()] args', {{
                            componentInstanceID,
                            memoryIdx,
                            reallocIdx,
                            stringEncoding,
                            isAsync,
                            streamEndIdx,
                            typeIdx,
                            ptr,
                            count,
                        }});

                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        const streamEnd = {global_stream_map}.get(streamEndIdx);
                        if (!streamEnd) {{ throw new Error('missing stream end with idx [' + streamEndIdx + ']'); }}

                        if (!(streamEnd instanceof {end_class})) {{
                            throw new Error('invalid stream type, expected readable stream');
                        }}
                        if (streamEnd.elementTypeRep() !== typeIdx) {{
                            throw new Error('invalid element type rep, expected [' + typeIdx + '], found [' + streamEnd.elementTypeRep() + ']');
                        }}
                        if (streamEnd.isCopying()) {{ throw new Error('stream is currently undergoing a separate copy'); }}

                        if ({is_borrowed_type_fn}(componentInstanceID, typeIdx)) {{
                            throw new Error('borrowed types cannot be used as elements in a stream');
                        }}

                        let bufID = {global_buffer_manager}.createBuffer({{ componentInstanceID, start, len, typeIdx, writable, readable }});

                        const processFn = (result, reclaimBufferFn) => {{
                            if (reclaimBufferFn) {{ reclaimBufferFn(); }}
                            streamEnd.clearCopying();

                            if (result === {stream_end_class}.CopyResult.DROPPED) {{
                                streamEnd.markDone();
                            }}

                            if (result <= 0 || result >= 16) {{ throw new Error('unsupported stream copy result [' + result + ']'); }}
                            if (buf.length >= {managed_buffer_class}.MAX_LENGTH) {{
                                 throw new Error('buffer size [' + buf.length + '] greater than max length [' + {managed_buffer_class}.MAX_LENGTH + ']');
                            }}
                            if (buf.length > 2**28) {{ throw new Error('buffer uses reserved space'); }}

                            let packedResult = result | (buffer.progress << 4);
                            return [eventCode, i, packedResult]; // TODO: event code??
                        }}

                        streamEnd.copy({{
                            bufID,
                            onCopy: (reclaimBufferFn) => {{ processFn({stream_end_class}.CopyResult.COMPLETED, reclaimBufferFn); }}
                            onCopyDone: (result) => {{ processFn(result); }}
                        }});

                        // If sync, wait forever but allow task to do other things
                        if (!isAsync && !streamEnd.hasPendingEvent()) {{
                          const task = {current_task_get_fn}(componentInstanceID);
                          if (!task) {{ throw new Error('invalid/missing async task'); }}
                          await task.blockOn({{ promise: streamEnd.waitable, isAsync }});
                        }}

                        if (streamEnd.hasPendingEvent()) {{
                          const {{ code, index, payload }} = streamEnd.getEvent();
                          if (code !== eventCode && index === 1) {{ throw new Error('event code does not match'); }}
                        }} else {{
                          return [ {async_blocked_const} ]
                        }}

                        throw new Error('{stream_fn}() not implemented');
                    }}
                "));
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
                    function {stream_cancel_fn}(
                        streamIdx,
                        isAsync,
                        streamEndIdx,
                    ) {{
                        {debug_log_fn}('[{stream_cancel_fn}()] args', {{
                            streamIdx,
                            isAsync,
                            streamEndIdx,
                        }});

                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        const streamEnd = {global_stream_map}.get(streamEndIdx);
                        if (!streamEnd) {{ throw new Error('missing stream end with idx [' + streamEndIdx + ']'); }}
                        if (!(streamEnd instanceof {stream_end_class})) {{ throw new Error('invalid stream end, expected value of type [{stream_end_class}]'); }}

                        if (streamEnd.elementTypeRep() !== stream.elementTypeRep()) {{
                          throw new Error('stream type [' + stream.elementTypeRep() + '], does not match stream end type [' + streamEnd.elementTypeRep() + ']');
                        }}

                        if (!streamEnd.isCopying()) {{ throw new Error('stream end is not copying, cannot cancel'); }}

                        if (!streamEnd.hasPendingEvent()) {{
                          // TODO: cancel the shared thing (waitable?)
                          if (!streamEnd.hasPendingEvent()) {{
                            if (!isAsync) {{
                              await task.blockOn({{ promise: streamEnd.waitable, isAsync: false }});
                            }} else {{
                              return {async_blocked_const};
                            }}
                          }}
                        }}

                        const {{ code, index, payload }} = e.getEvent();
                        if (streamEnd.isCopying()) {{ throw new Error('stream end is still in copying state'); }}
                        if (code !== {event_code_enum}) {{ throw new Error('unexpected event code [' + code + '], expected [' + {event_code_enum} + ']'); }}
                        if (index !== 1) {{ throw new Error('unexpected index, should be 1'); }}

                        return payload;
                    }}
                "));
            }

            // TODO: update after stream map is present
            Self::StreamDropReadable | Self::StreamDropWritable => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let global_stream_map = Self::GlobalStreamMap.name();
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
                output.push_str(&format!("
                    function {stream_drop_fn}(
                        streamIdx,
                        streamEndIdx,
                    ) {{
                        {debug_log_fn}('[{stream_drop_fn}()] args', {{
                            streamIdx,
                            streamEndIdx,
                        }});

                        const stream = {global_stream_map}.get(streamIdx);
                        if (!stream) {{ throw new Error('missing stream idx from drop stream'); }}

                        const componentInstanceID = stream.componentInstanceID;
                        if (componentInstanceID === undefined) {{
                            throw new Error('missing/invalid component instance ID on stream');
                        }}

                        const task = {current_task_get_fn}(componentInstanceID);
                        if (!task) {{ throw new Error('invalid/missing async task'); }}

                        const state = {get_or_create_async_state_fn}(task.componentIdx);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        const streamEnd = {global_stream_map}.remove(streamEndIdx);
                        if (!streamEnd) {{ throw new Error('missing stream end with idx [' + streamEndIdx + ']'); }}

                        if (!(streamEnd instanceof {stream_end_class})) {{
                          throw new Error('invalid stream end class, expected [{stream_end_class}]');
                        }}

                        if (streamEnd.elementTypeRep() !== stream.elementTypeRep()) {{
                          throw new Error('stream type [' + stream.elementTypeRep() + '], does not match stream end type [' + streamEnd.elementTypeRep() + ']');
                        }}
                    }}
                "));
            }
        }
    }
}
