;; Synchronous exports and imports of one component instance, for comparing the
;; behavior of generated bindings with and without the sync fast path.
;;
;; The host decides what `notify` and `double` do (return, throw, stop the
;; instance, call back into an export), and the exports say what the guest saw.
(component
  (import "host" (instance $host
    (export "thing" (type $thing (sub resource)))
    (export "double" (func (param "value" u32) (result u32)))
    (export "notify" (func (param "code" u32)))
    (export "fallible" (func (param "value" u32) (result (result u32 (error string)))))
    (export "name" (func (result string)))
    (export "inspect" (func (param "thing" (borrow $thing)) (result u32)))))
  (alias export $host "thing" (type $thing))

  (core module $libc
    (import "host" "notify" (func $notify (param i32)))
    (memory (export "memory") 1)
    (global $next (mut i32) (i32.const 1024))
    (global $notify-on-realloc (export "notify-on-realloc") (mut i32) (i32.const 0))
    ;; A bump allocator, which calls out of the instance when told to.
    (func (export "realloc") (param i32 i32 i32 i32) (result i32)
      (local $ptr i32)
      (if (global.get $notify-on-realloc) (then (call $notify (i32.const 99))))
      (local.set $ptr
        (i32.and
          (i32.add (global.get $next) (i32.sub (local.get 2) (i32.const 1)))
          (i32.xor (i32.sub (local.get 2) (i32.const 1)) (i32.const -1))))
      (global.set $next (i32.add (local.get $ptr) (local.get 3)))
      (local.get $ptr)))

  (core module $m
    (import "libc" "memory" (memory 1))
    (import "libc" "notify-on-realloc" (global $notify-on-realloc (mut i32)))
    (import "host" "double" (func $double (param i32) (result i32)))
    (import "host" "notify" (func $notify (param i32)))
    (import "host" "fallible" (func $fallible (param i32 i32)))
    (import "host" "name" (func $name (param i32)))
    (import "host" "inspect" (func $inspect (param i32) (result i32)))
    (import "host" "drop-thing" (func $drop-thing (param i32)))
    (global $post-returns (mut i32) (i32.const 0))
    (global $trap-in-post-return (mut i32) (i32.const 0))

    (func (export "add") (param i32 i32) (result i32)
      (i32.add (local.get 0) (local.get 1)))
    (func (export "call-double") (param i32) (result i32)
      (call $double (local.get 0)))
    ;; The second call shows whether the guest ran on after the first.
    (func (export "notify-twice") (param i32 i32) (result i32)
      (call $notify (local.get 0))
      (call $notify (local.get 1))
      (i32.const 7))
    (func (export "trap") unreachable)
    (func (export "divide") (param i32 i32) (result i32)
      (i32.div_u (local.get 0) (local.get 1)))
    ;; 0 for ok, 1 for err, with the payload or the length of the message added
    (func (export "call-fallible") (param i32) (result i32)
      (call $fallible (local.get 0) (i32.const 64))
      (i32.add
        (i32.mul (i32.load8_u (i32.const 64)) (i32.const 1000))
        (if (result i32) (i32.load8_u (i32.const 64))
          (then (i32.load (i32.const 72)))
          (else (i32.load (i32.const 68))))))
    ;; Returns the string the host names, as (ptr, len) at offset 96
    (func (export "echo-name") (result i32)
      (call $name (i32.const 96))
      (i32.const 96))
    ;; Returns its argument
    (func (export "echo") (param i32 i32) (result i32)
      (i32.store (i32.const 112) (local.get 0))
      (i32.store (i32.const 116) (local.get 1))
      (i32.const 112))
    (func (export "post-echo") (param i32)
      (global.set $post-returns (i32.add (global.get $post-returns) (i32.const 1)))
      (if (global.get $trap-in-post-return) (then unreachable)))
    (func (export "post-returns") (result i32) (global.get $post-returns))
    (func (export "set-trap-in-post-return") (param i32)
      (global.set $trap-in-post-return (local.get 0)))
    (func (export "set-notify-on-realloc") (param i32)
      (global.set $notify-on-realloc (local.get 0)))
    ;; Returns a string that lies outside of memory
    (func (export "bad-string") (result i32)
      (i32.store (i32.const 112) (i32.const 0x7ffffff0))
      (i32.store (i32.const 116) (i32.const 64))
      (i32.const 112))
    ;; Shows the host a borrow, and drops it before returning as it must
    (func (export "inspect-thing") (param i32) (result i32)
      (call $inspect (local.get 0))
      (call $drop-thing (local.get 0)))
    ;; Returns without dropping the borrow it was given
    (func (export "leak-thing") (param i32) (result i32)
      (call $inspect (local.get 0)))
    ;; Drops the handle it owns, then says so
    (func (export "consume-thing") (param i32) (result i32)
      (call $drop-thing (local.get 0))
      (i32.const 1))
    ;; Drops a handle that does not exist
    (func (export "drop-missing") (call $drop-thing (i32.const 1000))))

  (core func $notify-for-libc (canon lower (func $host "notify")))
  (core instance $libc (instantiate $libc
    (with "host" (instance
      (export "notify" (func $notify-for-libc))))))
  (alias core export $libc "memory" (core memory $memory))
  (alias core export $libc "realloc" (core func $realloc))

  (core func $double (canon lower (func $host "double")))
  (core func $notify (canon lower (func $host "notify")))
  (core func $fallible
    (canon lower (func $host "fallible") (memory $memory) (realloc $realloc)))
  (core func $name (canon lower (func $host "name") (memory $memory) (realloc $realloc)))
  (core func $inspect (canon lower (func $host "inspect")))
  (core func $drop-thing (canon resource.drop $thing))

  (core instance $i (instantiate $m
    (with "libc" (instance $libc))
    (with "host" (instance
      (export "double" (func $double))
      (export "notify" (func $notify))
      (export "fallible" (func $fallible))
      (export "name" (func $name))
      (export "inspect" (func $inspect))
      (export "drop-thing" (func $drop-thing))))))

  (func (export "add") (param "a" u32) (param "b" u32) (result u32)
    (canon lift (core func $i "add")))
  (func (export "call-double") (param "value" u32) (result u32)
    (canon lift (core func $i "call-double")))
  (func (export "notify-twice") (param "first" u32) (param "second" u32) (result u32)
    (canon lift (core func $i "notify-twice")))
  (func (export "trap") (canon lift (core func $i "trap")))
  (func (export "divide") (param "a" u32) (param "b" u32) (result u32)
    (canon lift (core func $i "divide")))
  (func (export "call-fallible") (param "value" u32) (result u32)
    (canon lift (core func $i "call-fallible")))
  (func (export "echo-name") (result string)
    (canon lift (core func $i "echo-name") (memory $memory)))
  (func (export "echo") (param "text" string) (result string)
    (canon lift (core func $i "echo") (memory $memory) (realloc $realloc)
      (post-return (core func $i "post-echo"))))
  (func (export "post-returns") (result u32) (canon lift (core func $i "post-returns")))
  (func (export "set-trap-in-post-return") (param "value" u32)
    (canon lift (core func $i "set-trap-in-post-return")))
  (func (export "set-notify-on-realloc") (param "value" u32)
    (canon lift (core func $i "set-notify-on-realloc")))
  (func (export "bad-string") (result string)
    (canon lift (core func $i "bad-string") (memory $memory)))
  (func (export "inspect-thing") (param "thing" (borrow $thing)) (result u32)
    (canon lift (core func $i "inspect-thing")))
  (func (export "leak-thing") (param "thing" (borrow $thing)) (result u32)
    (canon lift (core func $i "leak-thing")))
  (func (export "consume-thing") (param "thing" (own $thing)) (result u32)
    (canon lift (core func $i "consume-thing")))
  (func (export "drop-missing") (canon lift (core func $i "drop-missing"))))
