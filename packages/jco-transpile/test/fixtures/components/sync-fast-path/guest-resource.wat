;; A resource that the guest defines, for comparing generated bindings with and
;; without the sync fast path.
;;
;; The destructor tells the host which representation it was called for. For a
;; representation of 100 or more it swallows what the host function throws.
(component
  (import "host" (instance $host
    (export "notify" (func (param "code" u32)))))
  (alias export $host "notify" (func $host-notify))

  (component $api
    (import "notify" (func $notify (param "code" u32)))
    (core func $notify (canon lower (func $notify)))

    (core module $destructor
      (import "" "notify" (func $notify (param i32)))
      (func (export "dtor") (param i32)
        (if (i32.lt_u (local.get 0) (i32.const 100))
          (then (call $notify (local.get 0)) (return)))
        (block $catch
          (try_table (catch_all $catch)
            (call $notify (local.get 0))))))
    (core instance $destructor (instantiate $destructor
      (with "" (instance (export "notify" (func $notify))))))

    (type $thing (resource (rep i32) (dtor (core func $destructor "dtor"))))
    (core func $new (canon resource.new $thing))
    (core func $rep (canon resource.rep $thing))
    (core func $drop (canon resource.drop $thing))

    (core module $m
      (import "" "new" (func $new (param i32) (result i32)))
      (import "" "rep" (func $rep (param i32) (result i32)))
      (import "" "drop" (func $drop (param i32)))
      (func (export "new") (param i32) (result i32) (call $new (local.get 0)))
      ;; (a borrow of a resource reaches the instance that defines it as its representation)
      (func (export "get") (param i32) (result i32) (local.get 0))
      ;; Drops the handle it is given, and returns what it represented
      (func (export "consume") (param i32) (result i32)
        (local $value i32)
        (local.set $value (call $rep (local.get 0)))
        (call $drop (local.get 0))
        (local.get $value))
      (func (export "ok") (result i32) (i32.const 42)))
    (core instance $i (instantiate $m
      (with "" (instance
        (export "new" (func $new))
        (export "rep" (func $rep))
        (export "drop" (func $drop))))))

    (export $exported "thing" (type $thing))
    (func (export "[constructor]thing") (param "value" u32) (result (own $exported))
      (canon lift (core func $i "new")))
    (func (export "[method]thing.get") (param "self" (borrow $exported)) (result u32)
      (canon lift (core func $i "get")))
    (func (export "[static]thing.consume") (param "thing" (own $exported)) (result u32)
      (canon lift (core func $i "consume")))
    (func (export "ok") (result u32) (canon lift (core func $i "ok"))))

  (instance $api (instantiate $api (with "notify" (func $host-notify))))
  (export "api" (instance $api)))
