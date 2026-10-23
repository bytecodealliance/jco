;; This core export name contains a double quote, backslash, and newline.
;; asm.js rewriting must decode the JS string literal before mangling its name,
;; so the lifted run function finds the same export that wasm2js emits.
(component
  (core module $m
    (func (export "quoted\22slash\5cline\0a") (result i32) (i32.const 42)))
  (core instance $i (instantiate $m))
  (func (export "run") (result u32)
    (canon lift (core func $i "quoted\22slash\5cline\0a"))))
