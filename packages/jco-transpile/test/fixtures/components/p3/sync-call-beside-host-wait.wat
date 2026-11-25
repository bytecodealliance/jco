;; A call of a non-async-typed function runs only its own instance until it
;; returns (Canonical ABI `canon_lift`, `not ft.async_`), so a host call of
;; another instance that settles during the call resumes only afterwards.
;;
;; $P's `start` waits on the async host import `pending`. $Q's sync-typed
;; `wait-host` then waits on the async host import `tick`, during which the
;; host settles `pending`. $P's stack resumes only once `wait-host` has
;; returned.
(component
  (import "pending" (func $pending async))
  (import "tick" (func $tick async))
  (import "log" (func $log (param "step" u32)))

  (component $P
    (import "pending" (func $pending async))
    (import "log" (func $log (param "step" u32)))
    (core func $pending (canon lower (func $pending)))
    (core func $log (canon lower (func $log)))
    (core module $m
      (import "" "pending" (func $pending))
      (import "" "log" (func $log (param i32)))
      (func (export "start")
        (call $pending)
        (call $log (i32.const 1)))
    )
    (core instance $i (instantiate $m (with "" (instance
      (export "pending" (func $pending))
      (export "log" (func $log))
    ))))
    (func (export "start") async
      (canon lift (core func $i "start")))
  )

  (component $Q
    (import "tick" (func $tick async))
    (import "log" (func $log (param "step" u32)))
    (core func $tick (canon lower (func $tick)))
    (core func $log (canon lower (func $log)))
    (core module $m
      (import "" "tick" (func $tick))
      (import "" "log" (func $log (param i32)))
      (func (export "wait-host")
        (call $tick)
        (call $log (i32.const 2)))
    )
    (core instance $i (instantiate $m (with "" (instance
      (export "tick" (func $tick))
      (export "log" (func $log))
    ))))
    (func (export "wait-host")
      (canon lift (core func $i "wait-host")))
  )

  (instance $p (instantiate $P (with "pending" (func $pending)) (with "log" (func $log))))
  (instance $q (instantiate $Q (with "tick" (func $tick)) (with "log" (func $log))))
  (export "start" (func $p "start"))
  (export "wait-host" (func $q "wait-host"))
)
