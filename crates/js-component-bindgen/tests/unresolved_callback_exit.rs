mod common;

const ASSERT_TRAP: &str = r#"
async function traps(call) {
    let timer;
    try {
        await assert.rejects(Promise.race([
            Promise.resolve().then(call),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('call stayed pending')), 2000); }),
        ]), (err) => err instanceof WebAssembly.RuntimeError && /without resolution/.test(err.message));
    } finally { clearTimeout(timer); }
}
"#;

#[test]
fn unresolved_callback_exits_reject_and_poison_the_store() {
    common::run_component(
        include_str!("fixtures/unresolved-callback-exit.wat"),
        &format!(
            r#"
{ASSERT_TRAP}
for (const name of ['exitImmediately', 'exitAfterYield']) {{
    const instance = await fresh();
    await traps(() => instance[name]());
    await assert.rejects(() => instance.returnThenExit(),
        (err) => err instanceof WebAssembly.RuntimeError && /cannot enter/.test(err.message));
}}
const valid = await fresh();
assert.equal(await valid.returnThenExit(), 42);
"#
        ),
    );
}

#[test]
fn unresolved_composed_caller_exit_rejects_instead_of_idling() {
    common::run_component(
        include_str!("fixtures/unresolved-composed-exit.wat"),
        &format!(
            r#"
{ASSERT_TRAP}
const instance = await fresh();
await traps(() => instance.run());
"#
        ),
    );
}
