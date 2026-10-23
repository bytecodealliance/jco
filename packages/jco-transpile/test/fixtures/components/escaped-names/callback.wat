;; The async export completes with 42 and has a non-suspending callback.
;; Its callback name contains both quote characters, a backslash, and a newline.
;; The generated callback diagnostic name must remain a valid JS string literal
;; when the callback is attached without a WebAssembly.promising wrapper.
(component
  (core func $return (canon task.return (result u32)))
  (core func $yield (canon thread.yield))
  (core module $m
    (import "" "return" (func $return (param i32)))
    (import "" "yield" (func $yield (result i32)))
    (memory (export "memory") 1)
    (func (export "run") (result i32)
      (call $return (i32.const 42))
      (i32.const 0))
    (func (export "callback\22\27\5c\0a") (param i32 i32 i32) (result i32)
      (i32.const 0)))
  (core instance $i (instantiate $m
    (with "" (instance
      (export "return" (func $return))
      (export "yield" (func $yield))))))
  (func (export "run") async (result u32)
    (canon lift (core func $i "run") async
      (callback (core func $i "callback\22\27\5c\0a"))
      (memory (core memory $i "memory")))))
