;; Exercises the string transcoders used by fused adapters between components
;; that use different string encodings.
;;
;; $Leaf (latin1+utf16) reports exactly what it received, and is called either
;; directly or through a chain of forwarding components, so that every string
;; crosses at least one encoding boundary in each direction.
(component $Root
  ;; Allocator that always moves on `realloc`, so that transcoders which depend
  ;; on stale pointers or on bytes past the old allocation are caught.
  (core module $Libc
    (memory (export "memory") 1)
    (global $next (mut i32) (i32.const 1024))

    (func $realloc (export "realloc")
      (param $old i32) (param $old-size i32) (param $align i32) (param $new-size i32)
      (result i32)
      (local $ret i32)

      (local.set $ret
        (i32.and
          (i32.add (global.get $next) (i32.sub (local.get $align) (i32.const 1)))
          (i32.sub (i32.const 0) (local.get $align))))
      (global.set $next (i32.add (local.get $ret) (local.get $new-size)))

      (loop $grow
        (if (i32.gt_u (global.get $next) (i32.shl (memory.size) (i32.const 16)))
          (then
            (drop (memory.grow (i32.const 1)))
            (br $grow))))

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

    (func (export "inflated-echo") (param i32 i32) (result i32)
      (call $echo (call $inflate (local.get 0) (local.get 1)) (i32.const 16))
      (i32.const 16))
    (func (export "inflated-tagged-len") (param i32 i32) (result i32)
      (call $tagged-len (call $inflate (local.get 0) (local.get 1))))
    (func (export "inflated-raw") (param i32 i32) (result i32)
      (call $raw (call $inflate (local.get 0) (local.get 1)) (i32.const 16))
      (i32.const 16)))

  (component $Leaf
    (alias outer $Root $Libc (core module $Libc))
    (alias outer $Root $LeafImpl (core module $LeafImpl))

    (core instance $libc (instantiate $Libc))
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

  (component $Utf8Forwarder
    (import "callee" (instance $callee
      (export "echo" (func (param "s" string) (result string)))
      (export "tagged-len" (func (param "s" string) (result u32)))
      (export "raw" (func (param "s" string) (result (list u8))))))
    (alias outer $Root $Libc (core module $Libc))
    (alias outer $Root $ForwardImpl (core module $ForwardImpl))

    (core instance $libc (instantiate $Libc))
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
        string-encoding=utf8 (memory $mem) (realloc (core func $realloc)))))

  ;; NOTE: `echo` is left out, since returning a latin1+utf16 string to a utf16
  ;; component needs the (not yet implemented) utf16 copy transcoder
  (component $Utf16Forwarder
    (import "callee" (instance $callee
      (export "tagged-len" (func (param "s" string) (result u32)))
      (export "raw" (func (param "s" string) (result (list u8))))))
    (alias outer $Root $Libc (core module $Libc))

    (core instance $libc (instantiate $Libc))
    (alias core export $libc "memory" (core memory $mem))
    (alias core export $libc "realloc" (core func $realloc))

    (core func $tagged-len
      (canon lower (func $callee "tagged-len")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
    (core func $raw
      (canon lower (func $callee "raw")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))

    (core module $Impl
      (import "callee" "tagged-len" (func $tagged-len (param i32 i32) (result i32)))
      (import "callee" "raw" (func $raw (param i32 i32 i32)))

      (func (export "tagged-len") (param i32 i32) (result i32)
        (call $tagged-len (local.get 0) (local.get 1)))
      (func (export "raw") (param i32 i32) (result i32)
        (call $raw (local.get 0) (local.get 1) (i32.const 16))
        (i32.const 16)))
    (core instance $i (instantiate $Impl
      (with "callee" (instance
        (export "tagged-len" (func $tagged-len))
        (export "raw" (func $raw))))))

    (func (export "tagged-len") (param "s" string) (result u32)
      (canon lift (core func $i "tagged-len")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
    (func (export "raw") (param "s" string) (result (list u8))
      (canon lift (core func $i "raw")
        string-encoding=utf16 (memory $mem) (realloc (core func $realloc)))))

  ;; Forwards latin1+utf16 strings, either untouched (`plain`) or after
  ;; re-encoding latin1 strings as UTF-16 (`inflated`)
  (component $CompactForwarder
    (import "callee" (instance $callee
      (export "echo" (func (param "s" string) (result string)))
      (export "tagged-len" (func (param "s" string) (result u32)))
      (export "raw" (func (param "s" string) (result (list u8))))))
    (alias outer $Root $Libc (core module $Libc))
    (alias outer $Root $ForwardImpl (core module $ForwardImpl))

    (core instance $libc (instantiate $Libc))
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

  (instance $leaf (instantiate $Leaf))
  (instance $compact (instantiate $CompactForwarder (with "callee" (instance $leaf))))

  ;; utf8 <-> latin1+utf16
  (instance $utf8 (instantiate $Utf8Forwarder (with "callee" (instance $leaf))))
  ;; utf16 -> latin1+utf16
  (instance $utf16 (instantiate $Utf16Forwarder (with "callee" (instance $leaf))))
  ;; utf8 <-> latin1+utf16 <-> latin1+utf16
  (instance $utf8-via-compact
    (instantiate $Utf8Forwarder (with "callee" (instance $compact "plain"))))
  (instance $utf8-via-inflated-compact
    (instantiate $Utf8Forwarder (with "callee" (instance $compact "inflated"))))

  (export "utf8-to-compact" (instance $utf8))
  (export "utf16-to-compact" (instance $utf16))
  (export "utf8-via-compact" (instance $utf8-via-compact))
  (export "utf8-via-inflated-compact" (instance $utf8-via-inflated-compact))
)
