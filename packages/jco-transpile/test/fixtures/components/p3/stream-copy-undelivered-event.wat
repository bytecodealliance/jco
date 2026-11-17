;; An end whose copy was completed by its peer stays busy until the completion
;; event is delivered. Each export blocks a copy on one end, completes it from
;; the other end, and then starts another copy on the first end:
;;
;; - `copy-again` does so straight away, which must trap,
;; - `poll-then-copy` first takes the event from a waitable set,
;; - `cancel-then-copy` first takes it by cancelling the completed copy.
;;
;; The last two return the result of the final copy, which is BLOCKED.
(component
  (core module $memory (memory (export "mem") 1))
  (core instance $memory (instantiate $memory))
  (type $stream (stream u32))
  (core func $new (canon stream.new $stream))
  (core func $read (canon stream.read $stream async (memory (core memory $memory "mem"))))
  (core func $write (canon stream.write $stream async (memory (core memory $memory "mem"))))
  ;; The exports are lifted synchronously, so the cancellations are `async`:
  ;; they report the pending result at once rather than waiting for one.
  (core func $cancel-read (canon stream.cancel-read $stream async))
  (core func $cancel-write (canon stream.cancel-write $stream async))
  (core func $set-new (canon waitable-set.new))
  (core func $join (canon waitable.join))
  (core func $poll (canon waitable-set.poll (memory (core memory $memory "mem"))))
  (core module $m
    (import "" "mem" (memory 1))
    (import "" "new" (func $new (result i64)))
    (import "" "read" (func $read (param i32 i32 i32) (result i32)))
    (import "" "write" (func $write (param i32 i32 i32) (result i32)))
    (import "" "cancel-read" (func $cancel-read (param i32) (result i32)))
    (import "" "cancel-write" (func $cancel-write (param i32) (result i32)))
    (import "" "set-new" (func $set-new (result i32)))
    (import "" "join" (func $join (param i32 i32)))
    (import "" "poll" (func $poll (param i32 i32) (result i32)))

    (global $rx (mut i32) (i32.const 0))
    (global $tx (mut i32) (i32.const 0))

    ;; Copies one element on the end under test: the writable end if `$write-first`.
    (func $copy (param $write-first i32) (param $ptr i32) (result i32)
      (if (result i32) (local.get $write-first)
        (then (call $write (global.get $tx) (local.get $ptr) (i32.const 1)))
        (else (call $read (global.get $rx) (local.get $ptr) (i32.const 1)))))

    ;; Copies one element on the peer of the end under test.
    (func $peer-copy (param $write-first i32) (param $ptr i32) (result i32)
      (call $copy (i32.eqz (local.get $write-first)) (local.get $ptr)))

    ;; Blocks a copy on the end under test, then completes it from its peer.
    (func $complete-blocked-copy (param $write-first i32)
      (local $ends i64)
      (local.set $ends (call $new))
      (global.set $rx (i32.wrap_i64 (local.get $ends)))
      (global.set $tx (i32.wrap_i64 (i64.shr_u (local.get $ends) (i64.const 32))))

      ;; BLOCKED: the peer has not offered a buffer yet.
      (if (i32.ne (call $copy (local.get $write-first) (i32.const 0)) (i32.const -1))
        (then unreachable))

      ;; COMPLETED with one element: (1 << 4) | 0.
      (if (i32.ne (call $peer-copy (local.get $write-first) (i32.const 16)) (i32.const 16))
        (then unreachable)))

    (func (export "copy-again") (param $write-first i32) (result i32)
      (call $complete-blocked-copy (local.get $write-first))
      (call $copy (local.get $write-first) (i32.const 32)))

    (func (export "poll-then-copy") (param $write-first i32) (result i32)
      (local $set i32) (local $end i32)
      (call $complete-blocked-copy (local.get $write-first))
      (local.set $end
        (select (global.get $tx) (global.get $rx) (local.get $write-first)))
      (local.set $set (call $set-new))
      (call $join (local.get $end) (local.get $set))

      ;; The event code is STREAM_READ (2) or STREAM_WRITE (3), and its payload
      ;; is the end's index followed by COMPLETED with one element.
      (if (i32.ne
            (call $poll (local.get $set) (i32.const 64))
            (select (i32.const 3) (i32.const 2) (local.get $write-first)))
        (then unreachable))
      (if (i32.ne (i32.load (i32.const 64)) (local.get $end)) (then unreachable))
      (if (i32.ne (i32.load (i32.const 68)) (i32.const 16)) (then unreachable))

      (call $copy (local.get $write-first) (i32.const 32)))

    (func (export "cancel-then-copy") (param $write-first i32) (result i32)
      (call $complete-blocked-copy (local.get $write-first))

      ;; CANCELLED takes precedence over COMPLETED, keeping the count: (1 << 4) | 2.
      (if (i32.ne
            (if (result i32) (local.get $write-first)
              (then (call $cancel-write (global.get $tx)))
              (else (call $cancel-read (global.get $rx))))
            (i32.const 18))
        (then unreachable))

      (call $copy (local.get $write-first) (i32.const 32)))
  )
  (core instance $m (instantiate $m (with "" (instance
    (export "mem" (memory $memory "mem"))
    (export "new" (func $new))
    (export "read" (func $read))
    (export "write" (func $write))
    (export "cancel-read" (func $cancel-read))
    (export "cancel-write" (func $cancel-write))
    (export "set-new" (func $set-new))
    (export "join" (func $join))
    (export "poll" (func $poll))
  ))))
  (func (export "copy-again") (param "write-first" bool) (result u32)
    (canon lift (core func $m "copy-again")))
  (func (export "poll-then-copy") (param "write-first" bool) (result u32)
    (canon lift (core func $m "poll-then-copy")))
  (func (export "cancel-then-copy") (param "write-first" bool) (result u32)
    (canon lift (core func $m "cancel-then-copy")))
)
