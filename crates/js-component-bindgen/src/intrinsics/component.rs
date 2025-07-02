//! Intrinsics that represent helpers that manage per-component state

use crate::{intrinsics::Intrinsic, source::Source};

/// This enum contains intrinsics that manage per-component state
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum ComponentIntrinsic {
    /// Global that stores backpressure by component instance
    ///
    /// A component instance *not* having a value in this map indicates that
    /// `backpressure.set` has not been called.
    ///
    /// A `true`/`false` in the value corresponding to a component instance indicates that
    /// backpressure.set has been called at least once, with the last call containing the
    /// given value.
    ///
    /// ```ts
    /// type GlobalBackpressureMap = Map<number, bool>;
    /// ```
    GlobalBackpressureMap,

    /// Global that stores async state by component instance
    ///
    /// ```ts
    /// type ComponentAsyncState = {
    ///     mayLeave: boolean,
    /// };
    /// type GlobalAsyncStateMap = Map<number, ComponentAsyncState>;
    /// ```
    GlobalAsyncStateMap,

    /// Function that retrieves or creates async state for a given component instance
    GetOrCreateAsyncState,

    /// Set the backpressure for a given component instance
    ///
    ///
    /// The function that implements this intrinsic has the following definition:
    ///
    /// ```ts
    /// type Value = 0 | 1;
    /// function backpressureSet(componentIdx: number, value: val);
    /// ```
    BackpressureSet,
}

impl ComponentIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        []
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::GlobalAsyncStateMap => "ASYNC_STATE",
            Self::GetOrCreateAsyncState => "getOrCreateAsyncState",
            Self::BackpressureSet => "backpressureSet",
            Self::GlobalBackpressureMap => "BACKPRESSURE",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::GlobalBackpressureMap => {
                let var_name = Self::GlobalBackpressureMap.name();
                output.push_str(&format!("const {var_name} = new Map();\n"));
            }

            Self::GlobalAsyncStateMap => {
                let var_name = Self::GlobalAsyncStateMap.name();
                output.push_str(&format!("const {var_name} = new Map();\n"));
            }

            Self::BackpressureSet => {
                let debug_log_fn = Intrinsic::DebugLog.name();
                let backpressure_set_fn = Self::BackpressureSet.name();
                let bp_map = Self::GlobalBackpressureMap.name();
                output.push_str(&format!("
                    function {backpressure_set_fn}(componentInstanceID, value) {{
                        {debug_log_fn}('[{backpressure_set_fn}()] args', {{ componentInstanceID, value }});
                        if (typeof value !== 'number') {{ throw new TypeError('invalid value for backpressure set'); }}
                        {bp_map}.set(componentInstanceID, value !== 0);
                    }}
                "));
            }

            Self::GetOrCreateAsyncState => {
                let get_state_fn = Self::GetOrCreateAsyncState.name();
                let async_state_map = Self::GlobalAsyncStateMap.name();
                let rep_table_class = Intrinsic::RepTableClass.name();
                output.push_str(&format!(
                    "
                    function {get_state_fn}(componentIdx, init) {{
                        if (!{async_state_map}.has(componentIdx)) {{
                            {async_state_map}.set(componentIdx, {{
                                mayLeave: false,
                                waitableSets: new {rep_table_class}(),
                                waitables: new {rep_table_class}(),
                                ...(init || {{}}),
                            }});
                        }}

                        return {async_state_map}.get(componentIdx);
                    }}
                "
                ));
            }
        }
    }
}
