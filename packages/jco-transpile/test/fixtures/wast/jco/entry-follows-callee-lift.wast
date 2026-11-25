;; Whether a call into an instance needs the exclusive lock depends on the
;; callee's lift options, and whether it is subject to backpressure on the
;; callee's function type, not on how the caller lowered the call (Canonical
;; ABI `Task.needs_exclusive`, `Task.enter_implicit_thread`). Both calls below
;; are sync-lowered calls into a stackful, async-typed export.
(component definition $Test
  (component $A
    (core module $Memory (memory (export "mem") 1))
    (core instance $memory (instantiate $Memory))
    (core module $AM
      (import "" "mem" (memory 1))
      (import "" "task.return" (func $task.return))
      (import "" "task.return-u32" (func $task.return-u32 (param i32)))
      (import "" "backpressure.inc" (func $backpressure.inc))
      (import "" "backpressure.dec" (func $backpressure.dec))
      (import "" "future.new" (func $future.new (result i64)))
      (import "" "future.read" (func $future.read (param i32 i32) (result i32)))
      (import "" "future.write" (func $future.write (param i32 i32) (result i32)))
      (import "" "future.drop-readable" (func $future.drop-readable (param i32)))
      (import "" "future.drop-writable" (func $future.drop-writable (param i32)))
      (import "" "waitable.join" (func $waitable.join (param i32 i32)))
      (import "" "waitable-set.new" (func $waitable-set.new (result i32)))
      (import "" "waitable-set.wait" (func $waitable-set.wait (param i32 i32) (result i32)))

      (global $writer (mut i32) (i32.const 0))
      (global $released (mut i32) (i32.const 0))

      ;; Blocks inside its core function, holding the lock, until `release`
      ;; writes the future.
      (func (export "hold") (result i32)
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
        (call $task.return)
        (i32.const 0 (; EXIT ;)))

      ;; Stackful. The reader is waiting, so the write completes eagerly.
      (func (export "release")
        (if (i32.ne (call $future.write (global.get $writer) (i32.const 0)) (i32.const 0 (; COMPLETED ;)))
          (then unreachable))
        (call $future.drop-writable (global.get $writer))
        (call $task.return))

      ;; Sets backpressure and yields; its callback clears it.
      (func (export "set-backpressure") (result i32)
        (call $backpressure.inc)
        (call $task.return)
        (i32.const 1 (; YIELD ;)))
      (func (export "set-backpressure-callback") (param i32 i32 i32) (result i32)
        (call $backpressure.dec)
        (global.set $released (i32.const 1))
        (i32.const 0 (; EXIT ;)))

      ;; Stackful: reports whether the backpressure was cleared when it entered.
      (func (export "probe")
        (call $task.return-u32 (global.get $released)))

      (func (export "unreachable-callback") (param i32 i32 i32) (result i32)
        unreachable)
    )
    (type $FT (future))
    (canon task.return (core func $task.return))
    (canon task.return (result u32) (core func $task.return-u32))
    (canon backpressure.inc (core func $backpressure.inc))
    (canon backpressure.dec (core func $backpressure.dec))
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
      (export "task.return-u32" (func $task.return-u32))
      (export "backpressure.inc" (func $backpressure.inc))
      (export "backpressure.dec" (func $backpressure.dec))
      (export "future.new" (func $future.new))
      (export "future.read" (func $future.read))
      (export "future.write" (func $future.write))
      (export "future.drop-readable" (func $future.drop-readable))
      (export "future.drop-writable" (func $future.drop-writable))
      (export "waitable.join" (func $waitable.join))
      (export "waitable-set.new" (func $waitable-set.new))
      (export "waitable-set.wait" (func $waitable-set.wait))
    ))))
    (func (export "hold") async
      (canon lift (core func $am "hold") async (callback (core func $am "unreachable-callback"))))
    (func (export "release") async
      (canon lift (core func $am "release") async))
    (func (export "set-backpressure") async
      (canon lift (core func $am "set-backpressure") async (callback (core func $am "set-backpressure-callback"))))
    (func (export "probe") async (result u32)
      (canon lift (core func $am "probe") async))
  )

  (component $C
    (import "hold" (func $hold async))
    (import "release" (func $release async))
    (import "set-backpressure" (func $set-backpressure async))
    (import "probe" (func $probe async (result u32)))
    (core module $Memory (memory (export "mem") 1))
    (core instance $memory (instantiate $Memory))
    (core module $CM
      (import "" "mem" (memory 1))
      (import "" "hold" (func $hold (result i32)))
      (import "" "release" (func $release))
      (import "" "set-backpressure" (func $set-backpressure (result i32)))
      (import "" "probe" (func $probe (result i32)))
      (import "" "waitable.join" (func $waitable.join (param i32 i32)))
      (import "" "waitable-set.new" (func $waitable-set.new (result i32)))
      (import "" "waitable-set.wait" (func $waitable-set.wait (param i32 i32) (result i32)))
      (import "" "subtask.drop" (func $subtask.drop (param i32)))

      ;; Wait for the async-lowered call that returned `ret` to return.
      (func $wait-returned (param $ret i32)
        (local $ws i32)
        (if (i32.eq (local.get $ret) (i32.const 2 (; RETURNED ;)))
          (then return))
        (local.set $ws (call $waitable-set.new))
        (call $waitable.join (i32.shr_u (local.get $ret) (i32.const 4)) (local.get $ws))
        (loop $loop
          (if (i32.ne (call $waitable-set.wait (local.get $ws) (i32.const 0)) (i32.const 1 (; SUBTASK ;)))
            (then unreachable))
          (br_if $loop (i32.ne (i32.load (i32.const 4)) (i32.const 2 (; RETURNED ;)))))
        (call $waitable.join (i32.load (i32.const 0)) (i32.const 0))
        (call $subtask.drop (i32.load (i32.const 0))))

      ;; A sync-lowered call into a stackful export does not take the lock,
      ;; so it enters while `hold` holds the lock waiting for it.
      (func (export "sync-call-ignores-lock") (result i32)
        (local $ret i32)
        (local.set $ret (call $hold))
        (if (i32.ne (i32.and (local.get $ret) (i32.const 0xf)) (i32.const 1 (; STARTED ;)))
          (then unreachable))
        (call $release)
        (call $wait-returned (local.get $ret))
        (i32.const 42))

      ;; A sync-lowered call into an async-typed export is subject to
      ;; backpressure, so it enters only once `set-backpressure` cleared it.
      (func (export "sync-call-waits-for-backpressure") (result i32)
        (local $ret i32)
        (local.set $ret (call $set-backpressure))
        (if (i32.ne (call $probe) (i32.const 1))
          (then unreachable))
        (call $wait-returned (local.get $ret))
        (i32.const 42))
    )
    (canon lower (func $hold) async (memory (core memory $memory "mem")) (core func $hold'))
    (canon lower (func $release) (core func $release'))
    (canon lower (func $set-backpressure) async (memory (core memory $memory "mem")) (core func $set-backpressure'))
    (canon lower (func $probe) (core func $probe'))
    (canon waitable.join (core func $waitable.join))
    (canon waitable-set.new (core func $waitable-set.new))
    (canon waitable-set.wait (memory (core memory $memory "mem")) (core func $waitable-set.wait))
    (canon subtask.drop (core func $subtask.drop))
    (core instance $cm (instantiate $CM (with "" (instance
      (export "mem" (memory $memory "mem"))
      (export "hold" (func $hold'))
      (export "release" (func $release'))
      (export "set-backpressure" (func $set-backpressure'))
      (export "probe" (func $probe'))
      (export "waitable.join" (func $waitable.join))
      (export "waitable-set.new" (func $waitable-set.new))
      (export "waitable-set.wait" (func $waitable-set.wait))
      (export "subtask.drop" (func $subtask.drop))
    ))))
    (func (export "sync-call-ignores-lock") async (result u32)
      (canon lift (core func $cm "sync-call-ignores-lock")))
    (func (export "sync-call-waits-for-backpressure") async (result u32)
      (canon lift (core func $cm "sync-call-waits-for-backpressure")))
  )

  (instance $a (instantiate $A))
  (instance $c (instantiate $C
    (with "hold" (func $a "hold"))
    (with "release" (func $a "release"))
    (with "set-backpressure" (func $a "set-backpressure"))
    (with "probe" (func $a "probe"))
  ))
  (func (export "sync-call-ignores-lock") (alias export $c "sync-call-ignores-lock"))
  (func (export "sync-call-waits-for-backpressure") (alias export $c "sync-call-waits-for-backpressure"))
)

(component instance $ignores-lock $Test)
(assert_return (invoke "sync-call-ignores-lock") (u32.const 42))

(component instance $waits-for-backpressure $Test)
(assert_return (invoke "sync-call-waits-for-backpressure") (u32.const 42))
