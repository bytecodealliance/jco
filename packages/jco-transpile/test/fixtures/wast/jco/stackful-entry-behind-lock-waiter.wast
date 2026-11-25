;; A stackful call waiting to enter an instance behind a call that needs the
;; exclusive lock enters as soon as there is no backpressure: it does not need
;; the lock, and after waiting once it waits only for its own condition
;; (Canonical ABI `Task.enter_implicit_thread`). Here the lock holder waits for
;; the stackful call, so admitting entries strictly in order deadlocks.
;;
;; $C calls into $A, with async lowerings:
;; 1. `hold` enters, takes the lock, and blocks in `waitable-set.wait` (inside
;;    its core function, keeping the lock) until `release` writes a future.
;; 2. `locking` (callback-lifted) waits for the lock.
;; 3. `release` (stackful) waits behind `locking`, then enters.
;; `run-callback-holder` lifts `hold` with a callback, `run-sync-holder`
;; lifts it synchronously.
(component definition $Test
  (component $A
    (core module $Memory (memory (export "mem") 1))
    (core instance $memory (instantiate $Memory))
    (core module $AM
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

      ;; Block, holding the lock, until `release` writes the future.
      (func $hold
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
        (call $future.drop-readable (local.get $reader)))

      (func (export "hold-callback") (result i32)
        (call $hold)
        (call $task.return)
        (i32.const 0 (; EXIT ;)))
      (func (export "hold-sync")
        (call $hold))
      (func (export "callback") (param i32 i32 i32) (result i32)
        unreachable)

      (func (export "locking") (result i32)
        (call $task.return)
        (i32.const 0 (; EXIT ;)))

      ;; The reader is waiting, so the write completes eagerly.
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
    (core instance $am (instantiate $AM (with "" (instance
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
    (func (export "hold-callback") async
      (canon lift (core func $am "hold-callback") async (callback (core func $am "callback"))))
    (func (export "hold-sync") async
      (canon lift (core func $am "hold-sync")))
    (func (export "locking") async
      (canon lift (core func $am "locking") async (callback (core func $am "callback"))))
    (func (export "release") async
      (canon lift (core func $am "release") async))
  )

  (component $C
    (import "hold-callback" (func $hold-callback async))
    (import "hold-sync" (func $hold-sync async))
    (import "locking" (func $locking async))
    (import "release" (func $release async))
    (core module $Memory (memory (export "mem") 1))
    (core instance $memory (instantiate $Memory))
    (core module $CM
      (import "" "mem" (memory 1))
      (import "" "hold-callback" (func $hold-callback (result i32)))
      (import "" "hold-sync" (func $hold-sync (result i32)))
      (import "" "locking" (func $locking (result i32)))
      (import "" "release" (func $release (result i32)))
      (import "" "waitable.join" (func $waitable.join (param i32 i32)))
      (import "" "waitable-set.new" (func $waitable-set.new (result i32)))
      (import "" "waitable-set.wait" (func $waitable-set.wait (param i32 i32) (result i32)))
      (import "" "subtask.drop" (func $subtask.drop (param i32)))

      ;; Wait for `count` subtasks in `ws` to return.
      (func $wait-returned (param $ws i32) (param $count i32)
        (loop $loop
          (if (i32.ne (call $waitable-set.wait (local.get $ws) (i32.const 0)) (i32.const 1 (; SUBTASK ;)))
            (then unreachable))
          (if (i32.eq (i32.load (i32.const 4)) (i32.const 2 (; RETURNED ;)))
            (then
              (call $waitable.join (i32.load (i32.const 0)) (i32.const 0))
              (call $subtask.drop (i32.load (i32.const 0)))
              (local.set $count (i32.sub (local.get $count) (i32.const 1)))))
          (br_if $loop (local.get $count))))

      (func $run (param $hold-sync i32) (result i32)
        (local $ret i32) (local $ws i32) (local $pending i32)
        (local.set $ws (call $waitable-set.new))

        ;; `hold` enters and blocks, holding the lock.
        (local.set $ret
          (if (result i32) (local.get $hold-sync)
            (then (call $hold-sync))
            (else (call $hold-callback))))
        (if (i32.ne (i32.and (local.get $ret) (i32.const 0xf)) (i32.const 1 (; STARTED ;)))
          (then unreachable))
        (call $waitable.join (i32.shr_u (local.get $ret) (i32.const 4)) (local.get $ws))

        ;; `locking` needs the lock, so it waits to enter.
        (local.set $ret (call $locking))
        (if (i32.ne (i32.and (local.get $ret) (i32.const 0xf)) (i32.const 0 (; STARTING ;)))
          (then unreachable))
        (call $waitable.join (i32.shr_u (local.get $ret) (i32.const 4)) (local.get $ws))
        (local.set $pending (i32.const 2))

        ;; `release` may wait once because `locking` is waiting, but not for the lock.
        (local.set $ret (call $release))
        (if (i32.ne (local.get $ret) (i32.const 2 (; RETURNED ;)))
          (then
            (call $waitable.join (i32.shr_u (local.get $ret) (i32.const 4)) (local.get $ws))
            (local.set $pending (i32.const 3))))

        (call $wait-returned (local.get $ws) (local.get $pending))
        (i32.const 42))

      (func (export "run-callback-holder") (result i32) (call $run (i32.const 0)))
      (func (export "run-sync-holder") (result i32) (call $run (i32.const 1)))
    )
    (canon lower (func $hold-callback) async (memory (core memory $memory "mem")) (core func $hold-callback'))
    (canon lower (func $hold-sync) async (memory (core memory $memory "mem")) (core func $hold-sync'))
    (canon lower (func $locking) async (memory (core memory $memory "mem")) (core func $locking'))
    (canon lower (func $release) async (memory (core memory $memory "mem")) (core func $release'))
    (canon waitable.join (core func $waitable.join))
    (canon waitable-set.new (core func $waitable-set.new))
    (canon waitable-set.wait (memory (core memory $memory "mem")) (core func $waitable-set.wait))
    (canon subtask.drop (core func $subtask.drop))
    (core instance $cm (instantiate $CM (with "" (instance
      (export "mem" (memory $memory "mem"))
      (export "hold-callback" (func $hold-callback'))
      (export "hold-sync" (func $hold-sync'))
      (export "locking" (func $locking'))
      (export "release" (func $release'))
      (export "waitable.join" (func $waitable.join))
      (export "waitable-set.new" (func $waitable-set.new))
      (export "waitable-set.wait" (func $waitable-set.wait))
      (export "subtask.drop" (func $subtask.drop))
    ))))
    (func (export "run-callback-holder") async (result u32)
      (canon lift (core func $cm "run-callback-holder")))
    (func (export "run-sync-holder") async (result u32)
      (canon lift (core func $cm "run-sync-holder")))
  )

  (instance $a (instantiate $A))
  (instance $c (instantiate $C
    (with "hold-callback" (func $a "hold-callback"))
    (with "hold-sync" (func $a "hold-sync"))
    (with "locking" (func $a "locking"))
    (with "release" (func $a "release"))
  ))
  (func (export "run-callback-holder") (alias export $c "run-callback-holder"))
  (func (export "run-sync-holder") (alias export $c "run-sync-holder"))
)

(component instance $callback-holder $Test)
(assert_return (invoke "run-callback-holder") (u32.const 42))

(component instance $sync-holder $Test)
(assert_return (invoke "run-sync-holder") (u32.const 42))
