//! Intrinsics that represent helpers that should be used from JS code

use std::fmt::Write;

use crate::intrinsics::p3::async_task::AsyncTaskIntrinsic;
use crate::{
    intrinsics::{Intrinsic, RenderIntrinsicsArgs},
    source::Source,
    uwriteln,
};

/// This enum contains intrinsics that function as JS helpers
///
/// For example, intrinsics in this enum may create global JS variables,
/// polyfills, or perform commonly used JS functionality.
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum JsHelperIntrinsic {
    /// A Helper function that is simply an empty function
    EmptyFunc,

    /// A helper function that creates a JS `DataView` from a given memory index
    DataView,

    /// Run a generator function synchronously until it yields a promise.
    MaybeSyncGeneratorFn,

    /// Bypass the JSPI boundary when a host import's caller cannot block.
    ConditionalSuspendingHostImportFn,
}

impl JsHelperIntrinsic {
    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            "emptyFunc",
            "dataView",
            "_maybeSyncGenerator",
            "_conditionalSuspendingHostImport",
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::EmptyFunc => "emptyFunc",
            Self::DataView => "dataView",
            Self::MaybeSyncGeneratorFn => "_maybeSyncGenerator",
            Self::ConditionalSuspendingHostImportFn => "_conditionalSuspendingHostImport",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source, args: &RenderIntrinsicsArgs) {
        match self {
            Self::EmptyFunc => output.push_str("
                const emptyFunc = () => {};
            "),
            Self::DataView => output.push_str("
                let dv = new DataView(new ArrayBuffer());
                const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
            "),
            // Wrap a generator function, which yields where an async function would await,
            // so that it runs synchronously until it yields a promise. A host import that
            // answers synchronously then returns synchronously, which a task that cannot
            // block (e.g. a resource destructor) requires.
            Self::MaybeSyncGeneratorFn => {
                let maybe_sync_generator_fn = args.require_intrinsic(Self::MaybeSyncGeneratorFn);

                output.push_str(&format!(
                    r#"
                      function {maybe_sync_generator_fn}(genFn) {{
                          return function (...args) {{
                              const gen = genFn.apply(this, args);
                              const step = (method, value) => {{
                                  while (true) {{
                                      const {{ value: yielded, done }} = gen[method](value);
                                      if (done) {{ return yielded; }}
                                      if (yielded === null ||
                                          (typeof yielded !== 'object' && typeof yielded !== 'function') ||
                                          typeof yielded.then !== 'function') {{
                                          method = 'next';
                                          value = yielded;
                                          continue;
                                      }}
                                      return Promise.resolve(yielded).then(
                                          res => step('next', res),
                                          err => step('throw', err),
                                      );
                                  }}
                              }};
                              return step('next', undefined);
                          }};
                      }}
                    "#,
                ));
            }

            Self::ConditionalSuspendingHostImportFn => {
                let wrapper = args.require_intrinsic(*self);
                let current_meta = args.require_intrinsic(Intrinsic::GlobalCurrentThreadMeta);
                let get_thread = args.require_intrinsic(AsyncTaskIntrinsic::GetCurrentThread);
                uwriteln!(
                    output,
                    r#"
                    function {wrapper}(module, componentIdx, fn) {{
                        return new WebAssembly.Instance(module, {{ '': {{
                            mayBlock: () => {{
                                const saved = {current_meta}[componentIdx];
                                const thread = saved
                                    ? {get_thread}(saved.componentIdx, saved.threadID)
                                    : null;
                                return thread?.task.mayBlock() ?? false;
                            }},
                            fast: fn,
                            slow: new WebAssembly.Suspending(fn),
                        }} }}).exports.run;
                    }}
                    "#,
                );
            }

        }
    }
}
