;; `task.return` must name the memory of the lift it returns from (Canonical
;; ABI `canon_task_return`, `LiftOptions.equal`), compared as a memory
;; instance, not by the index naming it.
;;
;; $C's exports each call a `task.return` built differently:
;; - `alias` names the lift's memory through a second export of it;
;; - `lower-then-return` first calls the host import `ping`, lowered with
;;   another memory, then names the lift's memory;
;; - `unlifted-memory` names a memory where the lift names none;
;; - `omitted-memory` names no memory where the lift names one, which the
;;   component-model tests (`async/big-interleaving-test.wast`) accept.
;;
;; $D calls each of them from another instance.
(component
  (import "ping" (func $ping (param "s" string)))

  (component $C
    (import "ping" (func $ping (param "s" string)))

    (core module $Libc
      (memory (export "mem") 1)
      (export "mem-alias" (memory 0)))
    (core instance $libc (instantiate $Libc))
    (core module $Other (memory (export "mem") 1))
    (core instance $other (instantiate $Other))

    (core func $ping (canon lower (func $ping) (memory (core memory $other "mem"))))
    (core func $task-return-alias
      (canon task.return (result u32) (memory (core memory $libc "mem-alias"))))
    (core func $task-return-memory
      (canon task.return (result u32) (memory (core memory $libc "mem"))))
    (core func $task-return-no-memory
      (canon task.return (result u32)))

    (core module $m
      (import "" "ping" (func $ping (param i32 i32)))
      (import "" "task.return-alias" (func $task-return-alias (param i32)))
      (import "" "task.return-memory" (func $task-return-memory (param i32)))
      (import "" "task.return-no-memory" (func $task-return-no-memory (param i32)))
      (func (export "alias") (result i32)
        (call $task-return-alias (i32.const 42))
        (i32.const 0 (; EXIT ;)))
      (func (export "lower-then-return") (result i32)
        (call $ping (i32.const 0) (i32.const 0))
        (call $task-return-memory (i32.const 42))
        (i32.const 0 (; EXIT ;)))
      (func (export "unlifted-memory") (result i32)
        (call $task-return-memory (i32.const 42))
        (i32.const 0 (; EXIT ;)))
      (func (export "omitted-memory") (result i32)
        (call $task-return-no-memory (i32.const 42))
        (i32.const 0 (; EXIT ;)))
      (func (export "callback") (param i32 i32 i32) (result i32)
        unreachable)
    )
    (core instance $i (instantiate $m (with "" (instance
      (export "ping" (func $ping))
      (export "task.return-alias" (func $task-return-alias))
      (export "task.return-memory" (func $task-return-memory))
      (export "task.return-no-memory" (func $task-return-no-memory))
    ))))

    (func (export "alias") async (result u32)
      (canon lift (core func $i "alias") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem"))))
    (func (export "lower-then-return") async (result u32)
      (canon lift (core func $i "lower-then-return") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem"))))
    (func (export "unlifted-memory") async (result u32)
      (canon lift (core func $i "unlifted-memory") async (callback (core func $i "callback"))))
    (func (export "omitted-memory") async (result u32)
      (canon lift (core func $i "omitted-memory") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem"))))
  )

  (component $D
    (import "alias" (func $alias async (result u32)))
    (import "lower-then-return" (func $lower-then-return async (result u32)))
    (import "unlifted-memory" (func $unlifted-memory async (result u32)))
    (import "omitted-memory" (func $omitted-memory async (result u32)))

    (core func $alias (canon lower (func $alias)))
    (core func $lower-then-return (canon lower (func $lower-then-return)))
    (core func $unlifted-memory (canon lower (func $unlifted-memory)))
    (core func $omitted-memory (canon lower (func $omitted-memory)))

    (core module $m
      (import "" "alias" (func $alias (result i32)))
      (import "" "lower-then-return" (func $lower-then-return (result i32)))
      (import "" "unlifted-memory" (func $unlifted-memory (result i32)))
      (import "" "omitted-memory" (func $omitted-memory (result i32)))
      (func (export "call-alias") (result i32) (call $alias))
      (func (export "call-lower-then-return") (result i32) (call $lower-then-return))
      (func (export "call-unlifted-memory") (result i32) (call $unlifted-memory))
      (func (export "call-omitted-memory") (result i32) (call $omitted-memory))
    )
    (core instance $i (instantiate $m (with "" (instance
      (export "alias" (func $alias))
      (export "lower-then-return" (func $lower-then-return))
      (export "unlifted-memory" (func $unlifted-memory))
      (export "omitted-memory" (func $omitted-memory))
    ))))

    (func (export "call-alias") async (result u32)
      (canon lift (core func $i "call-alias")))
    (func (export "call-lower-then-return") async (result u32)
      (canon lift (core func $i "call-lower-then-return")))
    (func (export "call-unlifted-memory") async (result u32)
      (canon lift (core func $i "call-unlifted-memory")))
    (func (export "call-omitted-memory") async (result u32)
      (canon lift (core func $i "call-omitted-memory")))
  )

  (instance $c (instantiate $C (with "ping" (func $ping))))
  (instance $d (instantiate $D
    (with "alias" (func $c "alias"))
    (with "lower-then-return" (func $c "lower-then-return"))
    (with "unlifted-memory" (func $c "unlifted-memory"))
    (with "omitted-memory" (func $c "omitted-memory"))
  ))
  (export "alias" (func $c "alias"))
  (export "lower-then-return" (func $c "lower-then-return"))
  (export "unlifted-memory" (func $c "unlifted-memory"))
  (export "omitted-memory" (func $c "omitted-memory"))
  (export "call-alias" (func $d "call-alias"))
  (export "call-lower-then-return" (func $d "call-lower-then-return"))
  (export "call-unlifted-memory" (func $d "call-unlifted-memory"))
  (export "call-omitted-memory" (func $d "call-omitted-memory"))
)
