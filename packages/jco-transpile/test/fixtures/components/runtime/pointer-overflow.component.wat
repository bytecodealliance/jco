;; Reproduces host address wrapping at 4 GiB. The entry at 0xfffffff8 fits,
;; but a second entry starts at 2**32 and must trap instead of accessing zero.
(component
  (type $map (map u32 u32))
  (type $pair (tuple u32 u32))
  (type $list (list $pair))
  (type $fixed (list $pair 2))
  (import "host" (instance $host
    (export "get-fixed" (func (result (list (tuple u32 u32) 2))))
    (type $variant-def (variant (case "signed" s32) (case "text" string)))
    (export "variant" (type $variant (eq $variant-def)))
    (export "echo-variant" (func (param "v" $variant) (result $variant)))))

  (core module $memory
    (memory (export "memory") 65536)
    (data (i32.const 0) "\03\00\00\00\04\00\00\00")
    (data (i32.const 0xfffffff0) "\05\00\00\00\06\00\00\00\01\00\00\00\02\00\00\00")
    (global $allocation (mut i32) (i32.const 0xfffffff8))
    ;; Deliberately permits invalid allocations so host lowering must check them.
    (func (export "realloc") (param i32 i32 i32 i32) (result i32)
      (global.get $allocation))
    (func (export "set-allocation-pointer") (param i32)
      (global.set $allocation (local.get 0))))
  (core instance $memory (instantiate $memory))
  (alias core export $memory "memory" (core memory $mem))
  (alias core export $memory "realloc" (core func $realloc))

  (core func $get-fixed
    (canon lower (func $host "get-fixed") (memory $mem)))
  (core func $echo-variant
    (canon lower (func $host "echo-variant") (memory $mem) (realloc $realloc)))

  (core module $calls
    (import "memory" "memory" (memory 65536))
    (import "host" "get-fixed" (func $get-fixed (param i32)))
    (import "host" "echo-variant" (func $echo-variant (param i32 i32 i32 i32)))
    ;; A return area above 2 GiB also exercises incoming signed core pointers.
    (func (export "read-map") (param $ptr i32) (param $len i32) (result i32)
      (i32.store (i32.const 0x80000010) (local.get $ptr))
      (i32.store offset=4 (i32.const 0x80000010) (local.get $len))
      (i32.const 0x80000010))
    (func (export "write-map") (param $ptr i32) (param $len i32) (result i32)
      (i32.load (local.get $ptr)))
    (func (export "read-fixed") (param $ptr i32) (result i32)
      (local.get $ptr))
    (func (export "write-fixed") (param $ptr i32) (result i32)
      (call $get-fixed (local.get $ptr))
      (i32.load (local.get $ptr)))
    ;; A variant can flatten a signed scalar and a pointer into the same slot.
    (func (export "call-signed") (result i32)
      (call $echo-variant (i32.const 0) (i32.const -7) (i32.const 0) (i32.const 0x80000010))
      (i32.load offset=4 (i32.const 0x80000010))))
  (core instance $calls (instantiate $calls
    (with "memory" (instance $memory))
    (with "host" (instance
      (export "get-fixed" (func $get-fixed))
      (export "echo-variant" (func $echo-variant))))))

  (func (export "set-allocation-pointer") (param "ptr" u32)
    (canon lift (core func $memory "set-allocation-pointer")))
  (func (export "read-map") (param "ptr" u32) (param "len" u32) (result $map)
    (canon lift (core func $calls "read-map") (memory $mem)))
  (func (export "write-map") (param "v" $map) (result u32)
    (canon lift (core func $calls "write-map") (memory $mem) (realloc $realloc)))
  (func (export "write-list") (param "v" $list) (result u32)
    (canon lift (core func $calls "write-map") (memory $mem) (realloc $realloc)))
  (func (export "read-fixed") (param "ptr" u32) (result $fixed)
    (canon lift (core func $calls "read-fixed") (memory $mem)))
  (func (export "write-fixed") (param "ptr" u32) (result u32)
    (canon lift (core func $calls "write-fixed")))
  (func (export "call-signed") (result s32)
    (canon lift (core func $calls "call-signed"))))
