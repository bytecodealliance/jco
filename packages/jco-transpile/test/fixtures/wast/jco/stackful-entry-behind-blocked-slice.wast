;; A stackful call enters an instance while another task's first slice is
;; blocked in a synchronously lowered call to another component. In the
;; Canonical ABI that first slice has ended once it blocks (`Store.invoke` runs
;; a call until it first blocks or returns), and the stackful call needs neither
;; the exclusive lock nor the end of backpressure (`Task.enter_implicit_thread`).
;; Here the blocked call waits on the stackful call, so holding the stackful
;; call back until the first slice returns deadlocks.
;;
;; $C calls into $A, with async lowerings:
;; 1. `set-backpressure` makes `hold` wait to enter; `clear-backpressure` then
;;    lets it in.
;; 2. `hold` (sync-lifted, so holding the lock) enters and, in its first slice,
;;    makes a sync-lowered call to $D's `block`, which blocks until `release`.
;; 3. `unblock` (stackful) calls $D's `release`.
(component definition $Test
  (component $D
    (core module $Memory (memory (export "mem") 1))
    (core instance $memory (instantiate $Memory))
    (core module $DM
      (import "" "mem" (memory 1))
      (import "" "task.return" (func $task.return))
      (import "" "future.new" (func $future.new (result i64)))
      (import "" "future.read" (func $future.read (param i32 i32) (result i32)))
      (import "" "future.write" (func $future.write (param i32 i32) (result i32)))
      (import "" "future.drop-readable" (func $future.drop-readable (param i32)))
      (import "" "future.drop-writable" (func $future.drop-writable (param i32)))
      (import "" "waitable.join" (func $waitable.join (param i32 i32)))
      (import "" "waitable-set.new" (func $waitable-set.new (result i32)))
      (import "" "waitable-set.wait" (func $waitable-set.wait (param i32 i32) (result i32)))

      (global $writer (mut i32) (i32.const 0))

      ;; Stackful: blocks until `release` writes the future.
      (func (export "block")
        (local $ret64 i64) (local $reader i32) (local $ws i32)
        (local.set $ret64 (call $future.new))
        (local.set $reader (i32.wrap_i64 (local.get $ret64)))
        (global.set $writer (i32.wrap_i64 (i64.shr_u (local.get $ret64) (i64.const 32))))
        (if (i32.ne (call $future.read (local.get $reader) (i32.const 0)) (i32.const -1 (; BLOCKED ;)))
          (then unreachable))
        (local.set $ws (call $waitable-set.new))
        (call $waitable.join (local.get $reader) (local.get $ws))
        (if (i32.ne (call $waitable-set.wait (local.get $ws) (i32.const 16)) (i32.const 4 (; FUTURE_READ ;)))
          (then unreachable))
        (if (i32.ne (i32.load (i32.const 20)) (i32.const 0 (; COMPLETED ;)))
          (then unreachable))
        (call $waitable.join (local.get $reader) (i32.const 0))
        (call $future.drop-readable (local.get $reader))
        (call $task.return))

      ;; Stackful. The reader is waiting, so the write completes eagerly.
      (func (export "release")
        (if (i32.ne (call $future.write (global.get $writer) (i32.const 0)) (i32.const 0 (; COMPLETED ;)))
          (then unreachable))
        (call $future.drop-writable (global.get $writer))
        (call $task.return))
    )
    (type $FT (future))
    (canon task.return (core func $task.return))
    (canon future.new $FT (core func $future.new))
    (canon future.read $FT async (memory (core memory $memory "mem")) (core func $future.read))
    (canon future.write $FT async (memory (core memory $memory "mem")) (core func $future.write))
    (canon future.drop-readable $FT (core func $future.drop-readable))
    (canon future.drop-writable $FT (core func $future.drop-writable))
    (canon waitable.join (core func $waitable.join))
    (canon waitable-set.new (core func $waitable-set.new))
    (canon waitable-set.wait (memory (core memory $memory "mem")) (core func $waitable-set.wait))
    (core instance $dm (instantiate $DM (with "" (instance
      (export "mem" (memory $memory "mem"))
      (export "task.return" (func $task.return))
      (export "future.new" (func $future.new))
      (export "future.read" (func $future.read))
      (export "future.write" (func $future.write))
      (export "future.drop-readable" (func $future.drop-readable))
      (export "future.drop-writable" (func $future.drop-writable))
      (export "waitable.join" (func $waitable.join))
      (export "waitable-set.new" (func $waitable-set.new))
      (export "waitable-set.wait" (func $waitable-set.wait))
    ))))
    (func (export "block") async
      (canon lift (core func $dm "block") async))
    (func (export "release") async
      (canon lift (core func $dm "release") async))
  )

  (component $A
    (import "block" (func $block async))
    (import "release" (func $release async))
    (core module $AM
      (import "" "block" (func $block))
      (import "" "release" (func $release))
      (import "" "task.return" (func $task.return))
      (import "" "backpressure.inc" (func $backpressure.inc))
      (import "" "backpressure.dec" (func $backpressure.dec))

      (func (export "set-backpressure") (call $backpressure.inc))
      (func (export "clear-backpressure") (call $backpressure.dec))

      ;; Sync-lifted: holds the lock through its first slice, which blocks in
      ;; the call to `block`.
      (func (export "hold") (call $block))

      (func (export "unblock") (call $release) (call $task.return))
    )
    (canon lower (func $block) (core func $block'))
    (canon lower (func $release) (core func $release'))
    (canon task.return (core func $task.return))
    (canon backpressure.inc (core func $backpressure.inc))
    (canon backpressure.dec (core func $backpressure.dec))
    (core instance $am (instantiate $AM (with "" (instance
      (export "block" (func $block'))
      (export "release" (func $release'))
      (export "task.return" (func $task.return))
      (export "backpressure.inc" (func $backpressure.inc))
      (export "backpressure.dec" (func $backpressure.dec))
    ))))
    (func (export "set-backpressure")
      (canon lift (core func $am "set-backpressure")))
    (func (export "clear-backpressure")
      (canon lift (core func $am "clear-backpressure")))
    (func (export "hold") async
      (canon lift (core func $am "hold")))
    (func (export "unblock") async
      (canon lift (core func $am "unblock") async))
  )

  (component $C
    (import "set-backpressure" (func $set-backpressure))
    (import "clear-backpressure" (func $clear-backpressure))
    (import "hold" (func $hold async))
    (import "unblock" (func $unblock async))
    (core module $Memory (memory (export "mem") 1))
    (core instance $memory (instantiate $Memory))
    (core module $CM
      (import "" "mem" (memory 1))
      (import "" "set-backpressure" (func $set-backpressure))
      (import "" "clear-backpressure" (func $clear-backpressure))
      (import "" "hold" (func $hold (result i32)))
      (import "" "unblock" (func $unblock (result i32)))
      (import "" "waitable.join" (func $waitable.join (param i32 i32)))
      (import "" "waitable-set.new" (func $waitable-set.new (result i32)))
      (import "" "waitable-set.wait" (func $waitable-set.wait (param i32 i32) (result i32)))
      (import "" "subtask.drop" (func $subtask.drop (param i32)))

      ;; Wait for an event on `ws` about `subtask` reaching `state`.
      (func $wait-for (param $ws i32) (param $subtask i32) (param $state i32)
        (if (i32.ne (call $waitable-set.wait (local.get $ws) (i32.const 0)) (i32.const 1 (; SUBTASK ;)))
          (then unreachable))
        (if (i32.ne (i32.load (i32.const 0)) (local.get $subtask))
          (then unreachable))
        (if (i32.ne (i32.load (i32.const 4)) (local.get $state))
          (then unreachable)))

      (func (export "run") (result i32)
        (local $ret i32) (local $ws i32) (local $ws2 i32) (local $hold i32) (local $unblock i32)
        (local.set $ws (call $waitable-set.new))

        ;; `hold` waits to enter until the backpressure is cleared.
        (call $set-backpressure)
        (local.set $ret (call $hold))
        (if (i32.ne (i32.and (local.get $ret) (i32.const 0xf)) (i32.const 0 (; STARTING ;)))
          (then unreachable))
        (local.set $hold (i32.shr_u (local.get $ret) (i32.const 4)))
        (call $waitable.join (local.get $hold) (local.get $ws))
        (call $clear-backpressure)
        (call $wait-for (local.get $ws) (local.get $hold) (i32.const 1 (; STARTED ;)))

        ;; Stackful: needs neither the lock nor the end of backpressure. (Its
        ;; own set: whether it or `hold` returns first is up to the scheduler.)
        (local.set $ret (call $unblock))
        (if (i32.ne (local.get $ret) (i32.const 2 (; RETURNED ;)))
          (then
            (local.set $unblock (i32.shr_u (local.get $ret) (i32.const 4)))
            (local.set $ws2 (call $waitable-set.new))
            (call $waitable.join (local.get $unblock) (local.get $ws2))
            (call $wait-for (local.get $ws2) (local.get $unblock) (i32.const 2))
            (call $waitable.join (local.get $unblock) (i32.const 0))
            (call $subtask.drop (local.get $unblock))))
        (call $wait-for (local.get $ws) (local.get $hold) (i32.const 2 (; RETURNED ;)))
        (call $waitable.join (local.get $hold) (i32.const 0))
        (call $subtask.drop (local.get $hold))
        (i32.const 42))
    )
    (canon lower (func $set-backpressure) (core func $set-backpressure'))
    (canon lower (func $clear-backpressure) (core func $clear-backpressure'))
    (canon lower (func $hold) async (memory (core memory $memory "mem")) (core func $hold'))
    (canon lower (func $unblock) async (memory (core memory $memory "mem")) (core func $unblock'))
    (canon waitable.join (core func $waitable.join))
    (canon waitable-set.new (core func $waitable-set.new))
    (canon waitable-set.wait (memory (core memory $memory "mem")) (core func $waitable-set.wait))
    (canon subtask.drop (core func $subtask.drop))
    (core instance $cm (instantiate $CM (with "" (instance
      (export "mem" (memory $memory "mem"))
      (export "set-backpressure" (func $set-backpressure'))
      (export "clear-backpressure" (func $clear-backpressure'))
      (export "hold" (func $hold'))
      (export "unblock" (func $unblock'))
      (export "waitable.join" (func $waitable.join))
      (export "waitable-set.new" (func $waitable-set.new))
      (export "waitable-set.wait" (func $waitable-set.wait))
      (export "subtask.drop" (func $subtask.drop))
    ))))
    (func (export "run") async (result u32)
      (canon lift (core func $cm "run")))
  )

  (instance $d (instantiate $D))
  (instance $a (instantiate $A (with "block" (func $d "block")) (with "release" (func $d "release"))))
  (instance $c (instantiate $C
    (with "set-backpressure" (func $a "set-backpressure"))
    (with "clear-backpressure" (func $a "clear-backpressure"))
    (with "hold" (func $a "hold"))
    (with "unblock" (func $a "unblock"))
  ))
  (func (export "run") (alias export $c "run"))
)

(component instance $test $Test)
(assert_return (invoke "run") (u32.const 42))
