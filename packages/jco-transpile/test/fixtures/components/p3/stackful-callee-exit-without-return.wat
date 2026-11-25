;; A stackful (async, no callback) callee that returns without `task.return`
;; only exits its implicit thread; the core return does not resolve the task
;; (Canonical ABI `canon_lift`).
;;
;; - `run`: an async-lowered caller sees STARTED (1), not RETURNED (2).
;; - `run-sync`: an async-typed (stackful) caller that sync-lowers the callee
;;   waits for a resolution that never comes, so the store deadlocks instead of
;;   the call returning.
(component
  (component $Callee
    (core module $C
      (func (export "f")))
    (core instance $c (instantiate $C))
    (func (export "f") async (canon lift (core func $c "f") async)))
  (instance $callee (instantiate $Callee))
  (core func $f (canon lower (func $callee "f") async))
  (core func $f-sync (canon lower (func $callee "f")))
  (core func $task-return (canon task.return (result u32)))
  (core module $M
    (import "" "f" (func $f (result i32)))
    (import "" "f-sync" (func $f-sync))
    (import "" "task.return" (func $task-return (param i32)))
    (func (export "run") (result i32)
      (i32.and (call $f) (i32.const 0xf)))
    (func (export "run-sync")
      (call $f-sync)
      (call $task-return (i32.const 42))))
  (core instance $m (instantiate $M (with "" (instance
    (export "f" (func $f))
    (export "f-sync" (func $f-sync))
    (export "task.return" (func $task-return))))))
  (func (export "run") (result u32) (canon lift (core func $m "run")))
  (func (export "run-sync") async (result u32) (canon lift (core func $m "run-sync") async)))
