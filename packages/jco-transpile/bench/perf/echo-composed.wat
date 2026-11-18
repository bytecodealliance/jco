;; Two components with separate memories: `caller` exports `run` and `run-list`,
;; which pass a string or a `list<u32>` to `callee` and return what comes back.
;; Every call copies its value across the memories twice, through a fused adapter.
(component
  (component $Callee
    (core module $M
      (memory (export "memory") 1)
      (global $bump (mut i32) (i32.const 1024))
      ;; A ring allocator: enough for a benchmark, where nothing outlives a call.
      (func (export "realloc") (param $old i32) (param $old_size i32) (param $align i32) (param $new_size i32) (result i32)
        (local $p i32)
        (local.set $p
          (i32.and
            (i32.add (global.get $bump) (i32.sub (local.get $align) (i32.const 1)))
            (i32.xor (i32.sub (local.get $align) (i32.const 1)) (i32.const -1))))
        (if (i32.gt_u (i32.add (local.get $p) (local.get $new_size)) (i32.const 60000))
          (then (local.set $p (i32.const 1024))))
        (global.set $bump (i32.add (local.get $p) (local.get $new_size)))
        (local.get $p))
      (func (export "echo") (param i32 i32) (result i32)
        (i32.store (i32.const 8) (local.get 0))
        (i32.store (i32.const 12) (local.get 1))
        (i32.const 8)))
    (core instance $m (instantiate $M))
    (func (export "echo") (param "s" string) (result string)
      (canon lift (core func $m "echo") (memory (core memory $m "memory")) (realloc (core func $m "realloc"))))
    (func (export "echo-list") (param "l" (list u32)) (result (list u32))
      (canon lift (core func $m "echo") (memory (core memory $m "memory")) (realloc (core func $m "realloc")))))

  (component $Caller
    (import "echo" (func $echo (param "s" string) (result string)))
    (import "echo-list" (func $echo_list (param "l" (list u32)) (result (list u32))))
    (core module $Libc
      (memory (export "memory") 1)
      (global $bump (mut i32) (i32.const 1024))
      (func (export "realloc") (param $old i32) (param $old_size i32) (param $align i32) (param $new_size i32) (result i32)
        (local $p i32)
        (local.set $p
          (i32.and
            (i32.add (global.get $bump) (i32.sub (local.get $align) (i32.const 1)))
            (i32.xor (i32.sub (local.get $align) (i32.const 1)) (i32.const -1))))
        (if (i32.gt_u (i32.add (local.get $p) (local.get $new_size)) (i32.const 60000))
          (then (local.set $p (i32.const 1024))))
        (global.set $bump (i32.add (local.get $p) (local.get $new_size)))
        (local.get $p)))
    (core instance $libc (instantiate $Libc))
    (core func $echo_lowered
      (canon lower (func $echo) (memory (core memory $libc "memory")) (realloc (core func $libc "realloc"))))
    (core func $echo_list_lowered
      (canon lower (func $echo_list) (memory (core memory $libc "memory")) (realloc (core func $libc "realloc"))))
    (core module $M
      (import "host" "echo" (func $echo (param i32 i32 i32)))
      (import "host" "echo-list" (func $echo_list (param i32 i32 i32)))
      (func (export "run-list") (param i32 i32) (result i32)
        (call $echo_list (local.get 0) (local.get 1) (i32.const 16))
        (i32.const 16))
      (func (export "run") (param i32 i32) (result i32)
        (call $echo (local.get 0) (local.get 1) (i32.const 16))
        (i32.const 16)))
    (core instance $m (instantiate $M
      (with "host" (instance (export "echo" (func $echo_lowered)) (export "echo-list" (func $echo_list_lowered))))))
    (func (export "run") (param "s" string) (result string)
      (canon lift (core func $m "run") (memory (core memory $libc "memory")) (realloc (core func $libc "realloc"))))
    (func (export "run-list") (param "l" (list u32)) (result (list u32))
      (canon lift (core func $m "run-list") (memory (core memory $libc "memory")) (realloc (core func $libc "realloc")))))

  (instance $callee (instantiate $Callee))
  (instance $caller (instantiate $Caller (with "echo" (func $callee "echo")) (with "echo-list" (func $callee "echo-list"))))
  (export "run" (func $caller "run"))
  (export "run-list" (func $caller "run-list")))
