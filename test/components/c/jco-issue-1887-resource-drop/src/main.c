#include "../gen/biz.h"
#include <stdlib.h>

exports_foo_bar_api_own_thing_t exports_foo_bar_api_constructor_thing(void) {
    return exports_foo_bar_api_thing_new(malloc(1));
}

void exports_foo_bar_api_thing_destructor(exports_foo_bar_api_thing_t *rep) {
    // This exercises the host-to-guest path taken after construction has
    // finished. Before the fix, the call stack ended like this:
    //
    // Thing[Symbol.dispose]()
    //   → guest resource destructor
    //   → free()
    //   → __wasm_get_stack_pointer
    //   → context.get(0)
    //   → CURRENT_TASK_META[0] is empty
    //
    // Using context intrinsics in this core export is a Clang/WASI SDK
    // implementation detail, not a component-model requirement; another
    // toolchain might not do so, but any toolchain is allowed to.
    free(rep);
}

uint32_t exports_biz_check(void) {
    exports_foo_bar_api_thing_drop_own(exports_foo_bar_api_constructor_thing());
    return 3;
}
