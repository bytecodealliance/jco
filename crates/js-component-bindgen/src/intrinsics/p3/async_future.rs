//! Intrinsics that represent helpers that enable Stream integration

use crate::intrinsics::Intrinsic;
use crate::intrinsics::component::ComponentIntrinsic;
use crate::source::Source;

use super::async_task::AsyncTaskIntrinsic;

/// This enum contains intrinsics that enable Stream
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum AsyncFutureIntrinsic {
    /// The definition of the `FutureWritableEnd` JS class
    ///
    /// This class serves as a shared implementation used by writable and readable ends
    FutureEndClass,

    /// The definition of the `FutureWritableEnd` JS class
    FutureWritableEndClass,

    /// The definition of the `FutureReadableEnd` JS class
    FutureReadableEndClass,

    /// Global that stores futures by component instance
    ///
    /// ```ts
    /// type i32 = number;
    /// type Future = object; // see FutureClass
    /// type GlobalFutureMap = Map<i32, Future>;
    /// ```
    GlobalFutureMap,

    /// Create a new future
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
    /// function futureNew(typeRep: u32): u64;
    /// ```
    FutureNew,

    /// Read from a future
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-futurefuturereadwrite
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
    /// function futureRead(
    ///     componentInstanceID: i32,
    ///     memory: i32,
    ///     realloc: i32,
    ///     encoding: StringEncoding,
    ///     isAsync: bool,
    ///     typeRep: u32,
    ///     futureRep: u32,
    ///     ptr: u32,
    ///     count:u322
    /// ): i64;
    /// ```
    FutureRead,

    /// Write to a future
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
    /// function futureWrite(
    ///     componentInstanceID: i32,
    ///     memory: i32,
    ///     realloc: i32,
    ///     encoding: StringEncoding,
    ///     isAsync: bool,
    ///     typeRep: u32,
    ///     futureRep: u32,
    ///     ptr: u32,
    ///     count:u322
    /// ): i64;
    /// ```
    FutureWrite,

    /// Cancel a read to a future
    ///
    /// See: https://github.com/WebAssembly/component-model/blob/main/design/mvp/CanonicalABI.md#-canon-streamfuturecancel-readread
    ///
    /// # Intrinsic implementation function
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type u32 = number; // >=0
    /// type u64 = bigint; // >=0
    ///
    /// function futureCancelRead(futureRep: u32, isAsync: boolean, readerRep: u32): u64;
    /// ```
    FutureCancelRead,

    /// Cancel a write to a future
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
    /// function futureCancelWrite(futureRep: u32, isAsync: boolean, writerRep: u32): u64;
    /// ```
    FutureCancelWrite,

    /// Drop a the readable end of a Future
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
    /// function futureDropReadable(futureRep: u32, readerRep: u32): bool;
    /// ```
    FutureDropReadable,

    /// Drop a the writable end of a Future
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
    /// function futureDropWritable(futureRep: u32, writerRep: u32): bool;
    /// ```
    FutureDropWritable,
}

impl AsyncFutureIntrinsic {
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
            Self::GlobalFutureMap => "FUTURES",
            Self::FutureEndClass => "FutureEnd",
            Self::FutureWritableEndClass => "FutureWritableEnd",
            Self::FutureReadableEndClass => "FutureReadableEnd",
            Self::FutureNew => "futureNew",
            Self::FutureRead => "futureRead",
            Self::FutureWrite => "futureWrite",
            Self::FutureDropReadable => "futureDropReadable",
            Self::FutureDropWritable => "futureDropWritable",
            Self::FutureCancelRead => "futureCancelRead",
            Self::FutureCancelWrite => "futureCancelWrite",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::GlobalFutureMap => {
                let global_future_map = Self::GlobalFutureMap.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                output.push_str(&format!(
                    "
                    const {global_future_map} = new {rep_table_class}();
                "
                ));
            }

            Self::FutureEndClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let future_end_class = Self::FutureEndClass.name();
                output.push_str(&format!("
                    class {future_end_class} {{
                        #elementTypeRep = null;
                        #componentInstanceID = null;

                        constructor(args) {{
                            {debug_log_fn}('[{future_end_class}#constructor()] args', args);
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
                    }}
                "));
            }

            Self::FutureReadableEndClass | Self::FutureWritableEndClass => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let (class_name, future_var_name, js_future_var_type) = match self {
                    Self::FutureReadableEndClass => (self.name(), "promise", "Promise"),
                    Self::FutureWritableEndClass => (self.name(), "resolve", "Function"),
                    _ => unreachable!("impossible future readable end class intrinsic"),
                };
                let future_end_class = Self::FutureEndClass.name();
                output.push_str(&format!("
                    class {class_name} extends {future_end_class} {{
                        #copying = false;
                        #{future_var_name} = null;
                        #dropped = false;

                        constructor(args) {{
                            {debug_log_fn}('[{class_name}#constructor()] args', args);
                            super(args);
                            if (!args.{future_var_name} || !(args.{future_var_name} instanceof {js_future_var_type})) {{
                                throw new TypeError('missing/invalid {future_var_name}, expected {js_future_var_type}');
                            }}
                            this.#{future_var_name} = args.{future_var_name};
                        }}

                        isCopying() {{ return this.#copying; }}

                        drop() {{
                            if (self.#dropped) {{ throw new Error('already dropped'); }}
                            if (self.#copying) {{ throw new Error('cannot drop while copying'); }}

                            if (!self.#{future_var_name}) {{ throw new Error('missing/invalid {future_var_name}'); }}
                            this.#{future_var_name}.close();

                            super.drop();
                            self.#dropped = true;
                        }}
                    }}
                "));
            }

            // TODO: Futures need a class
            Self::FutureNew => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let future_new_fn = Self::FutureNew.name();
                let future_readable_end_class = Self::FutureReadableEndClass.name();
                let future_writable_end_class = Self::FutureWritableEndClass.name();
                let global_future_map = Self::GlobalFutureMap.name();
                let current_task_get_fn =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask).name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!("
                    function {future_new_fn}(componentInstanceID, elementTypeRep) {{
                        {debug_log_fn}('[{future_new_fn}()] args', {{ componentInstanceID, elementTypeRep }});

                        const task = {current_task_get_fn}(componentInstanceID);
                        if (!task) {{ throw new Error('invalid/missing async task'); }}

                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        let future = new Promise();
                        let writableIdx = {global_future_map}.insert(new {future_writable_end_class}({{
                            isFuture: true,
                            elementTypeRep,
                        }}));
                        let readableIdx = {global_future_map}.insert(new {future_readable_end_class}({{
                            isFuture: true,
                            elementTypeRep,
                        }}));

                        return BigInt(writableIdx) << 32n | BigInt(readableIdx);
                    }}
                "));
            }

            // TODO: fix return from processFn
            Self::FutureWrite | Self::FutureRead => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let future_write_fn = Self::FutureWrite.name();
                let global_future_map = Self::GlobalFutureMap.name();
                let global_buffer_mgr = Intrinsic::GlobalBufferManager.name();
                let is_write = matches!(self, Self::FutureWrite);
                let future_end_class = if is_write {
                    Self::FutureWritableEndClass.name()
                } else {
                    Self::FutureReadableEndClass.name()
                };
                let is_borrowed_type = Intrinsic::IsBorrowedType.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let async_blocked_constant =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncBlockedConstant).name();
                output.push_str(&format!("
                    function {future_write_fn}(
                        componentInstanceID,
                        memoryIdx,
                        reallocIdx,
                        stringEncoding,
                        isAsync,
                        futureIdx,
                        typeIdx,
                        futureIdx,
                        ptr,
                        count,
                    ) {{
                        {debug_log_fn}('[{future_write_fn}()] args', {{
                            componentInstanceID,
                            memoryIdx,
                            reallocIdx,
                            stringEncoding,
                            isAsync,
                            futureIdx,
                            typeIdx,
                            futureIdx,
                            ptr,
                            count,
                        }});

                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        const future = {global_future_map}.get(futureIdx);
                        if (!future) {{ throw new Error('missing future'); }}

                        const futureEnd = {global_future_map}.get(futureEndIdx);
                        if (!futureEnd) {{ throw new Error('missing future end'); }}
                        if (!(futureEnd instanceof {future_end_class})) {{ new Error('invalid future end, expected [{future_end_class}]'); }}

                        if (future.elementTypeRep() !== futureEnd.elementTypeRep()) {{
                          throw new Error('future type rep [' + future.elementTypeRep() + '] does not match future end [' + futureEnd.elementTypeRep() + ']');
                        }}

                        if (futureEnd.isCopying()) {{ throw new Error('future end is copying'); }}
                        if (futureEnd.isDone()) {{ throw new Error('future end is done'); }}

                        if ({is_borrowed_type}(componentInstanceID, future.elementTypeRep())) {{ throw new Error('borrowed types not supported'); }}

                        const bufID = {global_buffer_mgr}.createBuffer({{ componentInstanceID, start, len, typeIdx, writable, readable }});

                        const processFn = (result) => {{
                          if (.remaining(bufID) !== 0) {{
                          if ({global_buffer_mgr}.remaining(bufID) === 0 && result != CopyResult.COMPLETED) {{
                            throw new Error('incomplete copy with future data remanining');
                          }}
                          if ({global_buffer_mgr}.remaining(bufID) !== 0 && result === CopyResult.COMPLETED) {{
                            throw new Error('remaining data with completed copy');
                          }}

                          futureEnd.clearCopying();

                          if (result === CopyResult.DROPPED || result === CopyResult.FUTURE_WRITE) {{
                            e.markDone();
                          }}

                          return {{ eventCode, index, result }};
                        }};

                        futureEnd.copy({{
                            bufID,
                            onCopyDone: (result) => {{
                              if (result === CopyResult.DROPPED && eventCode === Eventcode.FUTURE_WRITE) {{
                                throw new Error('cannot have a future write when the future is dropped');
                              }}
                              futureEnd.setEvent(processFn(result));
                            }}
                        }});

                        if (!isAsync && !e.hasPendingEvent()) {{
                          // TODO: replace with what block on used to be? wait for?
                          // await task.blockOn({{ promise: e.waitForPendingEvent(), isAsync: false }});
                          throw new Error('not implemented');
                        }}

                        if (futureEnd.hasPendingEvent()) {{
                          const {{ code, index, payload }} = futureEnd.getEvent();
                          if (code !== eventCode || index != 1) {{
                            throw new Error('invalid event, does not match expected event code');
                          }}
                          return payload;
                        }}

                        return {async_blocked_constant};
                    }}
                "));
            }

            Self::FutureCancelRead | Self::FutureCancelWrite => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let is_cancel_write = matches!(self, Self::FutureCancelWrite);
                let future_end_class = if is_cancel_write {
                    Self::FutureWritableEndClass.name()
                } else {
                    Self::FutureReadableEndClass.name()
                };
                let future_cancel_fn = Self::FutureCancelRead.name();
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                let global_future_map = Self::GlobalFutureMap.name();
                let async_blocked_const =
                    Intrinsic::AsyncTask(AsyncTaskIntrinsic::AsyncBlockedConstant).name();
                let async_event_code_enum = Intrinsic::AsyncEventCodeEnum.name();
                output.push_str(&format!("
                    async function {future_cancel_fn}(
                        futureIdx,
                        isAsync,
                        futureEndIdx,
                    ) {{
                        {debug_log_fn}('[{future_cancel_fn}()] args', {{
                            futureIdx,
                            isAsync,
                            futureEndIdx,
                        }});

                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        const futureEnd = {global_future_map}.get(futureEndIdx);
                        if (!futureEnd) {{ throw new Error('missing future end with idx [' + futureEndIdx + ']'); }}
                        if (!(futureEnd instanceof {future_end_class})) {{ throw new Error('invalid future end, expected value of type [{future_end_class}]'); }}

                        if (futureEnd.elementTypeRep() !== future.elementTypeRep()) {{
                          throw new Error('future type [' + future.elementTypeRep() + '], does not match future end type [' + futureEnd.elementTypeRep() + ']');
                        }}

                        if (!futureEnd.isCopying()) {{ throw new Error('future end is not copying, cannot cancel'); }}

                        if (!futureEnd.hasPendingEvent()) {{
                          // TODO: cancel the shared thing (waitable?)
                          if (!futureEnd.hasPendingEvent()) {{
                            if (!isAsync) {{
                              // TODO: repalce with what task.blockOn used to do
                              // await task.blockOn({{ promise: futureEnd.waitable, isAsync: false }});
                              throw new Error('not implemented');
                            }} else {{
                              return {async_blocked_const};
                            }}
                          }}
                        }}

                        const {{ code, index, payload }} = e.getEvent();
                        if (futureEnd.isCopying()) {{ throw new Error('future end is still in copying state'); }}
                        if (code !== {async_event_code_enum}) {{ throw new Error('unexpected event code [' + code + '], expected [' + {async_event_code_enum} + ']'); }}
                        if (index !== 1) {{ throw new Error('unexpected index, should be 1'); }}

                        return payload;
                    }}
                "));
            }

            // TODO: fill in future class impl (check for matching element types)
            Self::FutureDropReadable | Self::FutureDropWritable => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let future_drop_fn = self.name();
                let is_writable = matches!(self, Self::FutureDropWritable);
                let global_future_map = Self::GlobalFutureMap.name();
                let future_end_class = if is_writable {
                    Self::FutureWritableEndClass.name()
                } else {
                    Self::FutureReadableEndClass.name()
                };
                let get_or_create_async_state_fn =
                    Intrinsic::Component(ComponentIntrinsic::GetOrCreateAsyncState).name();
                output.push_str(&format!("
                    function {future_drop_fn}(
                        futureIdx,
                        futureEndIdx,
                    ) {{
                        {debug_log_fn}('[{future_drop_fn}()] args', {{
                            futureIdx,
                            futureEndIdx,
                        }});

                        const state = {get_or_create_async_state_fn}(componentInstanceID);
                        if (!state.mayLeave) {{ throw new Error('component instance is not marked as may leave'); }}

                        const future = {global_future_map}.remove(futureIdx);

                        const futureEnd = {global_future_map}.remove(futureEndIdx);
                        if (!(futureEnd instanceof {future_end_class}) {{ throw new Error('invalid future end, expected [{future_end_class}]'); }}

                        if (futureEnd.elementTypeRep() !== future.elementTypeRep()) {{
                          throw new Error('future type [' + future.elementTypeRep() + '], does not match future end type [' + futureEnd.elementTypeRep() + ']');
                        }}

                        futureEnd.drop();
                    }}
                "));
            }
        }
    }
}
