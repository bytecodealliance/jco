;; A stackful call enters an instance while another task's first slice is
;; blocked in a synchronously lowered call to an async host import. Once that
;; first slice blocks it has ended (`Store.invoke` runs a call until it first
;; blocks or returns), and the stackful call needs neither the exclusive lock
;; nor the end of backpressure (Canonical ABI `Task.enter_implicit_thread`).
;; Here only the stackful call lets the host import return.
(component
  (import "wait" (func $wait async))
  (import "release" (func $release))

  (core func $wait (canon lower (func $wait)))
  (core func $release (canon lower (func $release)))
  (core func $task-return (canon task.return))

  (core module $m
    (import "" "wait" (func $wait))
    (import "" "release" (func $release))
    (import "" "task.return" (func $task-return))

    ;; Sync-lifted: holds the lock through its first slice, which blocks in
    ;; the call to `wait`.
    (func (export "hold")
      (call $wait))

    ;; Stackful: needs neither the lock nor the end of backpressure.
    (func (export "unblock")
      (call $release)
      (call $task-return))
  )
  (core instance $i (instantiate $m (with "" (instance
    (export "wait" (func $wait))
    (export "release" (func $release))
    (export "task.return" (func $task-return))
  ))))

  (func (export "hold") async
    (canon lift (core func $i "hold")))
  (func (export "unblock") async
    (canon lift (core func $i "unblock") async))
)
