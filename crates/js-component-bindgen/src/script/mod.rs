//! Script engines and script-only components.
//!
//! `jco componentize` normally bakes one script into one JavaScript engine. This module supports
//! the alternative split: an *engine* component, built once from the union of the worlds its
//! scripts target, and *script-only* components that merely package a script's source. At
//! runtime a host instantiates the engine, reads the script out of a script-only component and
//! hands it to the engine through `jco:script-engine/script-loader`.
//!
//! The module does not run a JavaScript engine itself. [`engine_world`] produces the merged WIT
//! and a generated bootstrap module; the caller componentizes that module with ComponentizeJS or
//! componentize-qjs exactly as it would any other script. [`script_component`] packages a
//! bundled ES module as a component without any engine at all.

mod bootstrap;
mod component;

pub use bootstrap::{Backend, EngineWorld, WitInput, engine_world};
pub use component::{ScriptComponent, script_component};

/// WIT for `jco:script-engine`, the loader interface every engine exports.
pub const SCRIPT_ENGINE_WIT: &str = include_str!("script-engine.wit");

/// WIT for `jco:script`, the world script-only components export.
pub const SCRIPT_WIT: &str = include_str!("script.wit");

/// Name of the world [`engine_world`] produces.
pub const ENGINE_WORLD_NAME: &str = "engine";

/// Fully-qualified name of the world [`engine_world`] produces.
pub const ENGINE_WORLD_ID: &str = "jco:script-engine/engine@0.1.0";

/// Name of the world script-only components export.
pub const SCRIPT_ONLY_WORLD_NAME: &str = "script-only";
