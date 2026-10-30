mod common;

#[test]
fn returned_owned_resources_share_the_callers_handle_index_space() {
    common::run_component(
        include_str!("fixtures/returned-resource-handles.wat"),
        r#"
const instance = await fresh();
// Each returned resource occupies an index in the caller even though that
// caller never invokes resource.new/drop/rep itself.
assert.equal(instance.run(), 0x0102);
assert.equal(instance.run(), 0x0304);
"#,
    );
}

#[test]
fn resource_creation_removal_and_cross_kind_reuse_still_work() {
    common::run_component(
        include_str!(
            "../../../packages/jco-transpile/test/fixtures/components/p3/shared-handle-table.wat"
        ),
        r#"
const created = await fresh();
assert.equal(created.resourceAfterFuture(), 3);
const reused = await fresh();
assert.equal(reused.reuseAcrossKinds(), (1 << 16) | (1 << 8) | 1);
"#,
    );
    common::run_component(
        include_str!(
            "../../../packages/jco-transpile/test/fixtures/components/p3/resource-handle-out-of-range.wat"
        ),
        r#"
const instance = await fresh();
assert.equal(instance.roundtrip(), 7);
assert.throws(() => instance.dropMissing(), WebAssembly.RuntimeError);
"#,
    );
}
