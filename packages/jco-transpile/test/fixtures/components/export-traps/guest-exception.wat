;; A guest may catch its own tag after the import returns. If the tag escapes
;; the lifted export, the caller must observe a trap and subsequent entry must fail.
(component
  (import "pause" (func $pause))
  (core func $lower (canon lower (func $pause)))
  (core module $guest
    (import "" "pause" (func $pause))
    (tag $failure (param i32))
    (func (export "run-command") (param $escape i32) (result i32)
      call $pause
      (block $caught (result i32)
        (try_table (catch $failure $caught)
          (if (i32.eqz (local.get $escape)) (then (throw $failure (i32.const 17)))))
        (throw $failure (i32.const 23))))
    (func (export "ok") (result i32) i32.const 7))
  (core instance $guest (instantiate $guest (with "" (instance (export "pause" (func $lower))))))
  (func (export "run-command") (param "escape" bool) (result u32)
    (canon lift (core func $guest "run-command")))
  (func (export "ok") (result u32) (canon lift (core func $guest "ok"))))
