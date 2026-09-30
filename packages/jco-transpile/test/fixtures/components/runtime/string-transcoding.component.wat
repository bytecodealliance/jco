;; Exercises the string transcoders used by fused adapters between components
;; that use different string encodings.
;;
;; $Leaf (latin1+utf16) reports exactly what it received, and is called either
;; directly or through a chain of forwarding components, so that every string
;; crosses at least one encoding boundary in each direction.
;;
;; Every component takes the address its allocator starts at (the "base" core
;; module), so that the same chains can also be run with allocations that sit
;; above 2GiB, where pointers are negative when read as signed 32-bit integers.
(component $Root
  (core module $LowBase
    (global (export "base") i32 (i32.const 1024)))
  (core module $HighBase
    (global (export "base") i32 (i32.const 0x80000400)))

  ;; Allocator that always moves on `realloc`, so that transcoders which depend
  ;; on stale pointers or on bytes past the old allocation are caught.
  (core module $Libc
    (import "config" "base" (global $base i32))
    (memory (export "memory") 1)
    (global $next (mut i32) (global.get $base))

    (func $realloc (export "realloc")
      (param $old i32) (param $old-size i32) (param $align i32) (param $new-size i32)
      (result i32)
      (local $ret i32)
      (local $pages i32)

      (local.set $ret
        (i32.and
          (i32.add (global.get $next) (i32.sub (local.get $align) (i32.const 1)))
          (i32.sub (i32.const 0) (local.get $align))))
      (global.set $next (i32.add (local.get $ret) (local.get $new-size)))

      (local.set $pages
        (i32.sub
          (i32.shr_u (i32.add (global.get $next) (i32.const 0xffff)) (i32.const 16))
          (memory.size)))
      (if (i32.gt_s (local.get $pages) (i32.const 0))
        (then
          (if (i32.eq (memory.grow (local.get $pages)) (i32.const -1))
            (then (unreachable)))))

      (memory.copy
        (local.get $ret)
        (local.get $old)
        (select
          (local.get $old-size)
          (local.get $new-size)
          (i32.lt_u (local.get $old-size) (local.get $new-size))))
      (local.get $ret))

    ;; latin1+utf16 strings must always be (re)allocated with an alignment of 2,
    ;; even when the contents end up as latin1
    (func (export "realloc-align2") (param i32 i32 i32 i32) (result i32)
      (if (i32.ne (local.get 2) (i32.const 2)) (then (unreachable)))
      (call $realloc (local.get 0) (local.get 1) (local.get 2) (local.get 3))))

  ;; Reports the latin1+utf16 string it was given
  (core module $LeafImpl
    (import "libc" "memory" (memory 1))

    (func (export "echo") (param $ptr i32) (param $len i32) (result i32)
      (i32.store (i32.const 16) (local.get $ptr))
      (i32.store (i32.const 20) (local.get $len))
      (i32.const 16))

    (func (export "tagged-len") (param $ptr i32) (param $len i32) (result i32)
      (local.get $len))

    (func (export "raw") (param $ptr i32) (param $len i32) (result i32)
      (i32.store (i32.const 16) (local.get $ptr))
      (i32.store (i32.const 20)
        (select
          (i32.shl (i32.xor (local.get $len) (i32.const 0x80000000)) (i32.const 1))
          (local.get $len)
          (i32.and (local.get $len) (i32.const 0x80000000))))
      (i32.const 16)))

  ;; Passes strings through to the callee untouched. The `inflated-*` exports
  ;; are only meaningful for latin1+utf16: they first re-encode latin1 strings
  ;; as (tagged) UTF-16, which is valid but not the most compact encoding.
  (core module $ForwardImpl
    (import "libc" "memory" (memory 1))
    (import "libc" "realloc" (func $realloc (param i32 i32 i32 i32) (result i32)))
    (import "callee" "echo" (func $echo (param i32 i32 i32)))
    (import "callee" "tagged-len" (func $tagged-len (param i32 i32) (result i32)))
    (import "callee" "raw" (func $raw (param i32 i32 i32)))

    (func $inflate (param $ptr i32) (param $len i32) (result i32 i32)
      (local $out i32)
      (local $i i32)

      (if (i32.and (local.get $len) (i32.const 0x80000000))
        (then (return (local.get $ptr) (local.get $len))))

      (local.set $out
        (call $realloc
          (i32.const 0) (i32.const 0) (i32.const 2)
          (i32.shl (local.get $len) (i32.const 1))))
      (block $done
        (loop $next
          (br_if $done (i32.eq (local.get $i) (local.get $len)))
          (i32.store16
            (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 1)))
            (i32.load8_u (i32.add (local.get $ptr) (local.get $i))))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $next)))

      (local.get $out)
      (i32.or (local.get $len) (i32.const 0x80000000)))

    (func (export "echo") (param i32 i32) (result i32)
      (call $echo (local.get 0) (local.get 1) (i32.const 16))
      (i32.const 16))
    (func (export "tagged-len") (param i32 i32) (result i32)
      (call $tagged-len (local.get 0) (local.get 1)))
    (func (export "raw") (param i32 i32) (result i32)
      (call $raw (local.get 0) (local.get 1) (i32.const 16))
      (i32.const 16))

    ;; Drops the last byte of the string. For utf8 this leaves an invalid
    ;; (truncated) sequence when the string ends in a multi-byte character.
    (func (export "truncated-raw") (param i32 i32) (result i32)
      (call $raw (local.get 0) (i32.sub (local.get 1) (i32.const 1)) (i32.const 16))
      (i32.const 16))

    (func (export "inflated-echo") (param i32 i32) (result i32)
      (call $echo (call $inflate (local.get 0) (local.get 1)) (i32.const 16))
      (i32.const 16))
    (func (export "inflated-tagged-len") (param i32 i32) (result i32)
      (call $tagged-len (call $inflate (local.get 0) (local.get 1))))
    (func (export "inflated-raw") (param i32 i32) (result i32)
      (call $raw (call $inflate (local.get 0) (local.get 1)) (i32.const 16))
      (i32.const 16)))

  (component $Leaf
    (import "base" (core module $Base (export "base" (global i32))))
    (alias outer $Root $Libc (core module $Libc))
    (alias outer $Root $LeafImpl (core module $LeafImpl))

    (core instance $base (instantiate $Base))
    (core instance $libc (instantiate $Libc (with "config" (instance $base))))
    (alias core export $libc "memory" (core memory $mem))
    (alias core export $libc "realloc-align2" (core func $realloc))
    (core instance $i (instantiate $LeafImpl (with "libc" (instance $libc))))

    (func (export "echo") (param "s" string) (result string)
      (canon lift (core func $i "echo")
        string-encoding=latin1+utf16 (memory $mem) (realloc (core func $realloc))))
    (func (export "tagged-len") (param "s" string) (result u32)
      (canon lift (core func $i "tagged-len")
        string-encoding=latin1+utf16 (memory $mem) (realloc (core func $realloc))))
    (func (export "raw") (param "s" string) (result (list u8))
      (canon lift (core func $i "raw")
        string-encoding=latin1+utf16 (memory $mem) (realloc (core func $realloc)))))

  ;; Reports the utf8 string it was given, as `$Leaf` does for latin1+utf16
  (component $Utf8Leaf
    (import "base" (core module $Base (export "base" (global i32))))
    (alias outer $Root $Libc (core module $Libc))
    (alias outer $Root $LeafImpl (core module $LeafImpl))

    (core instance $base (instantiate $Base))
    (core instance $libc (instantiate $Libc (with "config" (instance $base))))
    (alias core export $libc "memory" (core memory $mem))
    (alias core export $libc "realloc" (core func $realloc))
    (core instance $i (instantiate $LeafImpl (with "libc" (instance $libc))))

    (func (export "echo") (param "s" string) (result string)
      (canon lift (core func $i "echo")
        string-encoding=utf8 (memory $mem) (realloc (core func $realloc))))
    (func (export "tagged-len") (param "s" string) (result u32)
      (canon lift (core func $i "tagged-len")
        string-encoding=utf8 (memory $mem) (realloc (core func $realloc))))
    (func (export "raw") (param "s" string) (result (list u8))
      (canon lift (core func $i "raw")
        string-encoding=utf8 (memory $mem) (realloc (core func $realloc)))))

  ;; Reports the utf16 string it was given
  ;;
  ;; NOTE: `raw` is of no use here, as it takes the length to be a number of bytes
  (component $Utf16Leaf
    (import "base" (core module $Base (export "base" (global i32))))
    (alias outer $Root $Libc (core module $Libc))
    (alias outer $Root $LeafImpl (core module $LeafImpl))

    (core instance $base (instantiate $Base))
    (core instance $libc (instantiate $Libc (with "config" (instance $base))))
    (alias core export $libc "memory" (core memory $mem))
    (alias core export $libc "realloc" (core func $realloc))
    (core instance $i (instantiate $LeafImpl (with "libc" (instance $libc))))

    (func (export "echo") (param "s" string) (result string)
      (canon lift (core func $i "echo")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
    (func (export "tagged-len") (param "s" string) (result u32)
      (canon lift (core func $i "tagged-len")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
    (func (export "raw") (param "s" string) (result (list u8))
      (canon lift (core func $i "raw")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc)))))

  (component $Utf8Forwarder
    (import "base" (core module $Base (export "base" (global i32))))
    (import "callee" (instance $callee
      (export "echo" (func (param "s" string) (result string)))
      (export "tagged-len" (func (param "s" string) (result u32)))
      (export "raw" (func (param "s" string) (result (list u8))))))
    (alias outer $Root $Libc (core module $Libc))
    (alias outer $Root $ForwardImpl (core module $ForwardImpl))

    (core instance $base (instantiate $Base))
    (core instance $libc (instantiate $Libc (with "config" (instance $base))))
    (alias core export $libc "memory" (core memory $mem))
    (alias core export $libc "realloc" (core func $realloc))

    (core func $echo
      (canon lower (func $callee "echo")
        string-encoding=utf8 (memory $mem) (realloc (core func $realloc))))
    (core func $tagged-len
      (canon lower (func $callee "tagged-len")
        string-encoding=utf8 (memory $mem) (realloc (core func $realloc))))
    (core func $raw
      (canon lower (func $callee "raw")
        string-encoding=utf8 (memory $mem) (realloc (core func $realloc))))

    (core instance $i (instantiate $ForwardImpl
      (with "libc" (instance $libc))
      (with "callee" (instance
        (export "echo" (func $echo))
        (export "tagged-len" (func $tagged-len))
        (export "raw" (func $raw))))))

    (func (export "echo") (param "s" string) (result string)
      (canon lift (core func $i "echo")
        string-encoding=utf8 (memory $mem) (realloc (core func $realloc))))
    (func (export "tagged-len") (param "s" string) (result u32)
      (canon lift (core func $i "tagged-len")
        string-encoding=utf8 (memory $mem) (realloc (core func $realloc))))
    (func (export "raw") (param "s" string) (result (list u8))
      (canon lift (core func $i "raw")
        string-encoding=utf8 (memory $mem) (realloc (core func $realloc))))
    (func (export "truncated-raw") (param "s" string) (result (list u8))
      (canon lift (core func $i "truncated-raw")
        string-encoding=utf8 (memory $mem) (realloc (core func $realloc)))))

  (component $Utf16Forwarder
    (import "base" (core module $Base (export "base" (global i32))))
    (import "callee" (instance $callee
      (export "echo" (func (param "s" string) (result string)))
      (export "tagged-len" (func (param "s" string) (result u32)))
      (export "raw" (func (param "s" string) (result (list u8))))))
    (alias outer $Root $Libc (core module $Libc))

    (core instance $base (instantiate $Base))
    (core instance $libc (instantiate $Libc (with "config" (instance $base))))
    (alias core export $libc "memory" (core memory $mem))
    (alias core export $libc "realloc" (core func $realloc))

    (core func $echo
      (canon lower (func $callee "echo")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
    (core func $tagged-len
      (canon lower (func $callee "tagged-len")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
    (core func $raw
      (canon lower (func $callee "raw")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))

    (core module $Impl
      (import "libc" "memory" (memory 1))
      (import "callee" "echo" (func $echo (param i32 i32 i32)))
      (import "callee" "tagged-len" (func $tagged-len (param i32 i32) (result i32)))
      (import "callee" "raw" (func $raw (param i32 i32 i32)))

      (func (export "echo") (param i32 i32) (result i32)
        (call $echo (local.get 0) (local.get 1) (i32.const 16))
        (i32.const 16))
      (func (export "tagged-len") (param i32 i32) (result i32)
        (call $tagged-len (local.get 0) (local.get 1)))
      (func (export "raw") (param i32 i32) (result i32)
        (call $raw (local.get 0) (local.get 1) (i32.const 16))
        (i32.const 16))

      ;; As `raw`, after writing a byte into the string
      (func (export "poked-raw")
        (param $ptr i32) (param $len i32) (param $at i32) (param $byte i32)
        (result i32)
        (i32.store8 (i32.add (local.get $ptr) (local.get $at)) (local.get $byte))
        (call $raw (local.get $ptr) (local.get $len) (i32.const 16))
        (i32.const 16)))
    (core instance $i (instantiate $Impl
      (with "libc" (instance $libc))
      (with "callee" (instance
        (export "echo" (func $echo))
        (export "tagged-len" (func $tagged-len))
        (export "raw" (func $raw))))))

    (func (export "echo") (param "s" string) (result string)
      (canon lift (core func $i "echo")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
    (func (export "tagged-len") (param "s" string) (result u32)
      (canon lift (core func $i "tagged-len")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
    (func (export "raw") (param "s" string) (result (list u8))
      (canon lift (core func $i "raw")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
    (func (export "poked-raw")
      (param "s" string) (param "at" u32) (param "byte" u8) (result (list u8))
      (canon lift (core func $i "poked-raw")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc)))))

  ;; Forwards latin1+utf16 strings, either untouched (`plain`) or after
  ;; re-encoding latin1 strings as UTF-16 (`inflated`)
  (component $CompactForwarder
    (import "base" (core module $Base (export "base" (global i32))))
    (import "callee" (instance $callee
      (export "echo" (func (param "s" string) (result string)))
      (export "tagged-len" (func (param "s" string) (result u32)))
      (export "raw" (func (param "s" string) (result (list u8))))))
    (alias outer $Root $Libc (core module $Libc))
    (alias outer $Root $ForwardImpl (core module $ForwardImpl))

    (core instance $base (instantiate $Base))
    (core instance $libc (instantiate $Libc (with "config" (instance $base))))
    (alias core export $libc "memory" (core memory $mem))
    (alias core export $libc "realloc" (core func $realloc))
    (alias core export $libc "realloc-align2" (core func $realloc-align2))

    (core func $echo
      (canon lower (func $callee "echo")
        string-encoding=latin1+utf16 (memory $mem) (realloc (core func $realloc-align2))))
    (core func $tagged-len
      (canon lower (func $callee "tagged-len")
        string-encoding=latin1+utf16 (memory $mem) (realloc (core func $realloc-align2))))
    ;; The `list<u8>` result is allocated with an alignment of 1
    (core func $raw
      (canon lower (func $callee "raw")
        string-encoding=latin1+utf16 (memory $mem) (realloc (core func $realloc))))

    (core instance $i (instantiate $ForwardImpl
      (with "libc" (instance $libc))
      (with "callee" (instance
        (export "echo" (func $echo))
        (export "tagged-len" (func $tagged-len))
        (export "raw" (func $raw))))))

    (func $echo (param "s" string) (result string)
      (canon lift (core func $i "echo")
        string-encoding=latin1+utf16 (memory $mem) (realloc (core func $realloc-align2))))
    (func $tagged-len (param "s" string) (result u32)
      (canon lift (core func $i "tagged-len")
        string-encoding=latin1+utf16 (memory $mem) (realloc (core func $realloc-align2))))
    (func $raw (param "s" string) (result (list u8))
      (canon lift (core func $i "raw")
        string-encoding=latin1+utf16 (memory $mem) (realloc (core func $realloc-align2))))
    (func $inflated-echo (param "s" string) (result string)
      (canon lift (core func $i "inflated-echo")
        string-encoding=latin1+utf16 (memory $mem) (realloc (core func $realloc-align2))))
    (func $inflated-tagged-len (param "s" string) (result u32)
      (canon lift (core func $i "inflated-tagged-len")
        string-encoding=latin1+utf16 (memory $mem) (realloc (core func $realloc-align2))))
    (func $inflated-raw (param "s" string) (result (list u8))
      (canon lift (core func $i "inflated-raw")
        string-encoding=latin1+utf16 (memory $mem) (realloc (core func $realloc-align2))))

    (instance (export "plain")
      (export "echo" (func $echo))
      (export "tagged-len" (func $tagged-len))
      (export "raw" (func $raw)))
    (instance (export "inflated")
      (export "echo" (func $inflated-echo))
      (export "tagged-len" (func $inflated-tagged-len))
      (export "raw" (func $inflated-raw))))

  (instance $leaf (instantiate $Leaf (with "base" (core module $LowBase))))
  (instance $compact (instantiate $CompactForwarder
    (with "base" (core module $LowBase))
    (with "callee" (instance $leaf))))

  ;; utf8 <-> utf8
  (instance $utf8-leaf (instantiate $Utf8Leaf (with "base" (core module $LowBase))))
  (instance $utf8-to-utf8 (instantiate $Utf8Forwarder
    (with "base" (core module $LowBase))
    (with "callee" (instance $utf8-leaf))))
  ;; utf8 <-> latin1+utf16
  (instance $utf8 (instantiate $Utf8Forwarder
    (with "base" (core module $LowBase))
    (with "callee" (instance $leaf))))
  ;; utf16 <-> latin1+utf16
  (instance $utf16 (instantiate $Utf16Forwarder
    (with "base" (core module $LowBase))
    (with "callee" (instance $leaf))))
  ;; utf16 <-> utf8 <-> latin1+utf16
  (instance $utf16-via-utf8 (instantiate $Utf16Forwarder
    (with "base" (core module $LowBase))
    (with "callee" (instance $utf8))))
  ;; utf16 <-> utf16
  (instance $utf16-leaf (instantiate $Utf16Leaf (with "base" (core module $LowBase))))
  (instance $utf16-to-utf16 (instantiate $Utf16Forwarder
    (with "base" (core module $LowBase))
    (with "callee" (instance $utf16-leaf))))
  ;; utf16 <-> utf16 <-> latin1+utf16
  (instance $utf16-via-utf16 (instantiate $Utf16Forwarder
    (with "base" (core module $LowBase))
    (with "callee" (instance $utf16))))
  ;; utf8 <-> utf16 <-> latin1+utf16
  (instance $utf8-via-utf16 (instantiate $Utf8Forwarder
    (with "base" (core module $LowBase))
    (with "callee" (instance $utf16))))
  ;; utf8 <-> latin1+utf16 <-> latin1+utf16
  (instance $utf8-via-compact (instantiate $Utf8Forwarder
    (with "base" (core module $LowBase))
    (with "callee" (instance $compact "plain"))))
  (instance $utf8-via-inflated-compact (instantiate $Utf8Forwarder
    (with "base" (core module $LowBase))
    (with "callee" (instance $compact "inflated"))))

  ;; The same again, between components that allocate above 2GiB. These are
  ;; entered through a utf8 component that allocates low in memory, as the host
  ;; reads and writes the strings of the component that it calls.
  (instance $high-leaf (instantiate $Leaf (with "base" (core module $HighBase))))
  (instance $high-compact (instantiate $CompactForwarder
    (with "base" (core module $HighBase))
    (with "callee" (instance $high-leaf))))
  (instance $high-utf16 (instantiate $Utf16Forwarder
    (with "base" (core module $HighBase))
    (with "callee" (instance $high-leaf))))
  (instance $high-utf8-to-compact (instantiate $Utf8Forwarder
    (with "base" (core module $HighBase))
    (with "callee" (instance $high-compact "inflated"))))
  (instance $high-utf8-to-utf16 (instantiate $Utf8Forwarder
    (with "base" (core module $HighBase))
    (with "callee" (instance $high-utf16))))
  ;; utf8 <-> utf8 <-> latin1+utf16 <-> latin1+utf16
  (instance $utf8-via-high-compact (instantiate $Utf8Forwarder
    (with "base" (core module $LowBase))
    (with "callee" (instance $high-utf8-to-compact))))
  ;; utf8 <-> utf8 <-> utf16 <-> latin1+utf16
  (instance $utf8-via-high-utf16 (instantiate $Utf8Forwarder
    (with "base" (core module $LowBase))
    (with "callee" (instance $high-utf8-to-utf16))))

  (export "utf8-to-utf8" (instance $utf8-to-utf8))
  (export "utf8-to-compact" (instance $utf8))
  (export "utf16-to-utf16" (instance $utf16-to-utf16))
  (export "utf16-to-compact" (instance $utf16))
  (export "utf16-via-utf8" (instance $utf16-via-utf8))
  (export "utf16-via-utf16" (instance $utf16-via-utf16))
  (export "utf8-via-utf16" (instance $utf8-via-utf16))
  (export "utf8-via-compact" (instance $utf8-via-compact))
  (export "utf8-via-inflated-compact" (instance $utf8-via-inflated-compact))
  (export "utf8-via-high-compact" (instance $utf8-via-high-compact))
  (export "utf8-via-high-utf16" (instance $utf8-via-high-utf16))
)
