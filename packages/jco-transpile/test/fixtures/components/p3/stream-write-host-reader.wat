;; A task blocked writing to a stream whose readable end the host holds is not
;; deadlocked: the host may read from it at any later time.
(component
  (type $s (stream u8))
  (import "consume" (func $consume (param "s" $s)))

  (core module $mem (memory (export "memory") 1))
  (core instance $mem_i (instantiate $mem))
  (alias core export $mem_i "memory" (core memory $memory))

  (core func $consume_l (canon lower (func $consume)))
  (core func $stream_new (canon stream.new $s))
  (core func $stream_write (canon stream.write $s async (memory $memory)))
  (core func $drop_writable (canon stream.drop-writable $s))
  (core func $task_return (canon task.return (result u32)))
  (core func $set_new (canon waitable-set.new))
  (core func $join (canon waitable.join))

  (core module $m
    (import "" "memory" (memory 1))
    (import "" "consume" (func $consume (param i32)))
    (import "" "stream.new" (func $stream_new (result i64)))
    (import "" "stream.write" (func $write (param i32 i32 i32) (result i32)))
    (import "" "stream.drop-writable" (func $drop_writable (param i32)))
    (import "" "task.return" (func $ret (param i32)))
    (import "" "waitable-set.new" (func $set_new (result i32)))
    (import "" "waitable.join" (func $join (param i32 i32)))

    (global $writer (mut i32) (i32.const 0))

    ;; Hands the readable end to the host, then writes one byte, which stays
    ;; pending until the host reads it, and waits for that.
    (func (export "run") (result i32)
      (local $ends i64)
      (local $set i32)
      (local.set $ends (call $stream_new))
      (global.set $writer (i32.wrap_i64 (i64.shr_u (local.get $ends) (i64.const 32))))
      (call $consume (i32.wrap_i64 (local.get $ends)))
      (i32.store8 (i32.const 16) (i32.const 7))
      (if (i32.ne (call $write (global.get $writer) (i32.const 16) (i32.const 1)) (i32.const -1 (; BLOCKED ;)))
        (then unreachable))
      (local.set $set (call $set_new))
      (call $join (global.get $writer) (local.get $set))
      ;; WAIT on the set
      (i32.or (i32.const 2) (i32.shl (local.get $set) (i32.const 4))))

    ;; The write completed: returns how many items were written.
    (func (export "cb") (param $event i32) (param $index i32) (param $result i32) (result i32)
      (call $join (global.get $writer) (i32.const 0))
      (call $drop_writable (global.get $writer))
      (call $ret (i32.shr_u (local.get $result) (i32.const 4)))
      (i32.const 0))
  )

  (core instance $i (instantiate $m (with "" (instance
    (export "memory" (memory $memory))
    (export "consume" (func $consume_l))
    (export "stream.new" (func $stream_new))
    (export "stream.write" (func $stream_write))
    (export "stream.drop-writable" (func $drop_writable))
    (export "task.return" (func $task_return))
    (export "waitable-set.new" (func $set_new))
    (export "waitable.join" (func $join))
  ))))

  (func (export "run") async (result u32)
    (canon lift (core func $i "run") async (callback (core func $i "cb"))))
)
