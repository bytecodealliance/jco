mod common;

#[test]
fn guest_selected_invalid_handle_kinds_trap() {
    common::run_component(
        include_str!("fixtures/invalid-handle-kinds.wat"),
        r#"
const failures = [];
for (const name of ["subtaskDropStream","subtaskDropSet","subtaskCancelSet","subtaskCancelZero","joinSetSource","joinMissingSource","joinStreamDestination","dropSetStream","dropSetZero","dropSetNonempty","streamReadFuture","futureReadStream","streamReadOtherType","futureReadOtherType","streamDropFuture","futureDropStream","errorDropStream","errorDropZero"]) {
    const instance = await fresh();
    try {
        await assert.rejects(Promise.resolve().then(() => instance[name]()), WebAssembly.RuntimeError);
    } catch (err) { failures.push(name + ': ' + err.message); }
}
assert.deepEqual(failures, []);
const valid = await fresh();
assert.equal(await valid.validJoin(), undefined);
"#,
    );
}

#[test]
fn unknown_handles_and_invalid_callback_codes_still_trap() {
    common::run_component(
        include_str!(
            "../../../packages/jco-transpile/test/fixtures/components/p3/invalid-handle-traps.wat"
        ),
        r#"
for (const name of ['waitUnknown', 'dropSetUnknown', 'streamReadUnknown', 'futureReadUnknown', 'badCallbackCode']) {
    const instance = await fresh();
    await assert.rejects(Promise.resolve().then(() => instance[name]()), WebAssembly.RuntimeError);
}
"#,
    );
}

#[test]
fn out_of_bounds_builtin_pointer_still_traps() {
    common::run_component(
        include_str!("../../../packages/jco-transpile/test/fixtures/components/p3/oob-pointer.wat"),
        r#"
const instance = await fresh();
await assert.rejects(Promise.resolve().then(() => instance.pollOutOfBounds()), WebAssembly.RuntimeError);
"#,
    );
}

#[test]
fn host_exceptions_keep_their_identity_and_type() {
    common::run_component(
        include_str!("fixtures/host-error.wat"),
        r#"
for (const error of [new Error('host failure'), new RangeError('host range failure')]) {
    const instance = await fresh({ fail: { default: () => { throw error; } } });
    await assert.rejects(Promise.resolve().then(() => instance.run()), (actual) => actual === error);
}
"#,
    );
}
