;; A guest that catches what its imports throw (as C++ `catch (...)` does), for
;; comparing generated bindings with and without the sync fast path.
;;
;; A host function that throws has failed the call of the export that called
;; it, whether or not the guest lets the exception unwind.
(component
  (import "host" (instance $host
    (export "notify" (func (param "code" u32)))
    (export "fallible" (func (param "value" u32) (result (result u32 (error string)))))
    (export "name" (func (result string)))))

  (core module $libc
    (memory (export "memory") 1)
    (global $next (mut i32) (i32.const 1024))
    (func (export "realloc") (param i32 i32 i32 i32) (result i32)
      (local $ptr i32)
      (local.set $ptr
        (i32.and
          (i32.add (global.get $next) (i32.sub (local.get 2) (i32.const 1)))
          (i32.xor (i32.sub (local.get 2) (i32.const 1)) (i32.const -1))))
      (global.set $next (i32.add (local.get $ptr) (local.get 3)))
      (local.get $ptr)))

  (core module $m
    (import "libc" "memory" (memory 1))
    (import "host" "notify" (func $notify (param i32)))
    (import "host" "fallible" (func $fallible (param i32 i32)))
    (import "host" "name" (func $name (param i32)))
    (global $post-returns (mut i32) (i32.const 0))

    ;; 1 if the import threw, 0 if it returned
    (func $caught (param i32) (result i32)
      (block $catch
        (try_table (catch_all $catch)
          (call $notify (local.get 0)))
        (return (i32.const 0)))
      (i32.const 1))

    (func (export "add") (param i32 i32) (result i32)
      (i32.add (local.get 0) (local.get 1)))
    ;; Calls the import and swallows what it throws
    (func (export "catch-one") (param i32) (result i32)
      (call $caught (local.get 0)))
    ;; Calls the import twice, swallowing what either call throws:
    ;; the sum of 1 if the first threw and 2 if the second threw
    (func (export "catch-two") (param i32 i32) (result i32)
      (i32.add
        (call $caught (local.get 0))
        (i32.mul (call $caught (local.get 1)) (i32.const 2))))
    ;; As `catch-one`, with a post-return function
    (func (export "catch-with-post-return") (param i32) (result i32)
      (call $caught (local.get 0)))
    (func (export "post") (param i32)
      (global.set $post-returns (i32.add (global.get $post-returns) (i32.const 1))))
    (func (export "post-returns") (result i32) (global.get $post-returns))
    ;; Swallows what an import of a result type throws; 1 if it threw
    (func (export "catch-fallible") (param i32) (result i32)
      (block $catch
        (try_table (catch_all $catch)
          (call $fallible (local.get 0) (i32.const 64)))
        (return (i32.const 0)))
      (i32.const 1))
    ;; Swallows what an import fails with while its result is lowered; 1 if it failed
    (func (export "catch-name") (result i32)
      (block $catch
        (try_table (catch_all $catch)
          (call $name (i32.const 96)))
        (return (i32.const 0)))
      (i32.const 1)))

  (core instance $libc (instantiate $libc))
  (alias core export $libc "memory" (core memory $memory))
  (alias core export $libc "realloc" (core func $realloc))
  (core func $notify (canon lower (func $host "notify")))
  (core func $fallible
    (canon lower (func $host "fallible") (memory $memory) (realloc $realloc)))
  (core func $name (canon lower (func $host "name") (memory $memory) (realloc $realloc)))
  (core instance $i (instantiate $m
    (with "libc" (instance $libc))
    (with "host" (instance
      (export "notify" (func $notify))
      (export "fallible" (func $fallible))
      (export "name" (func $name))))))

  (func (export "add") (param "a" u32) (param "b" u32) (result u32)
    (canon lift (core func $i "add")))
  (func (export "catch-one") (param "code" u32) (result u32)
    (canon lift (core func $i "catch-one")))
  (func (export "catch-two") (param "first" u32) (param "second" u32) (result u32)
    (canon lift (core func $i "catch-two")))
  (func (export "catch-with-post-return") (param "code" u32) (result u32)
    (canon lift (core func $i "catch-with-post-return") (post-return (core func $i "post"))))
  (func (export "post-returns") (result u32) (canon lift (core func $i "post-returns")))
  (func (export "catch-fallible") (param "value" u32) (result u32)
    (canon lift (core func $i "catch-fallible")))
  (func (export "catch-name") (result u32) (canon lift (core func $i "catch-name"))))
