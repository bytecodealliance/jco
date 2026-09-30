;; A component that keeps everything it allocates (and its return area) above
;; 2GiB, where pointers are negative when read as signed 32-bit integers.
;;
;; Every export hands back the value it was given, either directly or by way
;; of a host import, so that the host has to lower into and lift out of the top
;; half of the component's memory.
(component
  (import "host" (instance $host
    (export "echo-string" (func (param "v" string) (result string)))
    (export "echo-bytes" (func (param "v" (list u8)) (result (list u8))))
    (export "echo-strings" (func (param "v" (list string)) (result (list string))))
    (export "echo-tuple" (func
      (param "v" (tuple u32 string (list u16)))
      (result (tuple u32 string (list u16)))))))

  (core module $Libc
    (memory (export "memory") 1)
    (global $next (mut i32) (i32.const 0x80000400))
    (global (export "return-area") i32 (i32.const 0x80000010))

    (func $grow-to (param $end i32)
      (local $pages i32)
      (local.set $pages
        (i32.sub
          (i32.shr_u (i32.add (local.get $end) (i32.const 0xffff)) (i32.const 16))
          (memory.size)))
      (if (i32.gt_s (local.get $pages) (i32.const 0))
        (then
          (if (i32.eq (memory.grow (local.get $pages)) (i32.const -1))
            (then (unreachable))))))

    ;; The return area is written to before anything has been allocated
    (func $init (call $grow-to (global.get $next)))
    (start $init)

    (func (export "realloc")
      (param $old i32) (param $old-size i32) (param $align i32) (param $new-size i32)
      (result i32)
      (local $ret i32)

      (local.set $ret
        (i32.and
          (i32.add (global.get $next) (i32.sub (local.get $align) (i32.const 1)))
          (i32.sub (i32.const 0) (local.get $align))))
      (global.set $next (i32.add (local.get $ret) (local.get $new-size)))
      (call $grow-to (global.get $next))

      (memory.copy
        (local.get $ret)
        (local.get $old)
        (select
          (local.get $old-size)
          (local.get $new-size)
          (i32.lt_u (local.get $old-size) (local.get $new-size))))
      (local.get $ret)))

  ;; Returns the pointer and length it was given, which covers strings and lists
  (core module $Echo
    (import "libc" "memory" (memory 1))
    (import "libc" "return-area" (global $ret i32))

    (func (export "echo") (param $ptr i32) (param $len i32) (result i32)
      (i32.store (global.get $ret) (local.get $ptr))
      (i32.store offset=4 (global.get $ret) (local.get $len))
      (global.get $ret))

    ;; As `echo`, after writing a byte into the value
    (func (export "poke-echo")
      (param $ptr i32) (param $len i32) (param $at i32) (param $byte i32)
      (result i32)
      (i32.store8 (i32.add (local.get $ptr) (local.get $at)) (local.get $byte))
      (i32.store (global.get $ret) (local.get $ptr))
      (i32.store offset=4 (global.get $ret) (local.get $len))
      (global.get $ret))

    (func (export "echo-tuple")
      (param $id i32) (param $name-ptr i32) (param $name-len i32)
      (param $values-ptr i32) (param $values-len i32)
      (result i32)
      (i32.store (global.get $ret) (local.get $id))
      (i32.store offset=4 (global.get $ret) (local.get $name-ptr))
      (i32.store offset=8 (global.get $ret) (local.get $name-len))
      (i32.store offset=12 (global.get $ret) (local.get $values-ptr))
      (i32.store offset=16 (global.get $ret) (local.get $values-len))
      (global.get $ret)))

  ;; Passes the pointer and length it was given to a host import, and returns
  ;; what the host wrote to the return area
  (core module $ViaHost
    (import "libc" "memory" (memory 1))
    (import "libc" "return-area" (global $ret i32))
    (import "host" "echo" (func $echo (param i32 i32 i32)))

    (func (export "echo") (param $ptr i32) (param $len i32) (result i32)
      (call $echo (local.get $ptr) (local.get $len) (global.get $ret))
      (global.get $ret))

    ;; As `echo`, after writing a byte into the value
    (func (export "poke-echo")
      (param $ptr i32) (param $len i32) (param $at i32) (param $byte i32)
      (result i32)
      (i32.store8 (i32.add (local.get $ptr) (local.get $at)) (local.get $byte))
      (call $echo (local.get $ptr) (local.get $len) (global.get $ret))
      (global.get $ret)))

  (core module $TupleViaHost
    (import "libc" "return-area" (global $ret i32))
    (import "host" "echo" (func $echo (param i32 i32 i32 i32 i32 i32)))

    (func (export "echo") (param i32 i32 i32 i32 i32) (result i32)
      (call $echo
        (local.get 0) (local.get 1) (local.get 2) (local.get 3) (local.get 4)
        (global.get $ret))
      (global.get $ret)))

  (core instance $libc (instantiate $Libc))
  (alias core export $libc "memory" (core memory $mem))
  (alias core export $libc "realloc" (core func $realloc))
  (core instance $echo (instantiate $Echo (with "libc" (instance $libc))))

  (core func $host-echo-string
    (canon lower (func $host "echo-string") (memory $mem) (realloc (core func $realloc))))
  (core func $host-echo-string-utf16
    (canon lower (func $host "echo-string")
      string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
  (core func $host-echo-bytes
    (canon lower (func $host "echo-bytes") (memory $mem) (realloc (core func $realloc))))
  (core func $host-echo-strings
    (canon lower (func $host "echo-strings") (memory $mem) (realloc (core func $realloc))))
  (core func $host-echo-tuple
    (canon lower (func $host "echo-tuple") (memory $mem) (realloc (core func $realloc))))

  (core instance $string-via-host (instantiate $ViaHost
    (with "libc" (instance $libc))
    (with "host" (instance (export "echo" (func $host-echo-string))))))
  (core instance $string-utf16-via-host (instantiate $ViaHost
    (with "libc" (instance $libc))
    (with "host" (instance (export "echo" (func $host-echo-string-utf16))))))
  (core instance $bytes-via-host (instantiate $ViaHost
    (with "libc" (instance $libc))
    (with "host" (instance (export "echo" (func $host-echo-bytes))))))
  (core instance $strings-via-host (instantiate $ViaHost
    (with "libc" (instance $libc))
    (with "host" (instance (export "echo" (func $host-echo-strings))))))
  (core instance $tuple-via-host (instantiate $TupleViaHost
    (with "libc" (instance $libc))
    (with "host" (instance (export "echo" (func $host-echo-tuple))))))

  (func $echo-string (param "v" string) (result string)
    (canon lift (core func $echo "echo") (memory $mem) (realloc (core func $realloc))))
  (func $echo-string-utf16 (param "v" string) (result string)
    (canon lift (core func $echo "echo")
      string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
  (func $poke-string (param "v" string) (param "at" u32) (param "byte" u8) (result string)
    (canon lift (core func $echo "poke-echo") (memory $mem) (realloc (core func $realloc))))
  (func $poke-string-utf16 (param "v" string) (param "at" u32) (param "byte" u8) (result string)
    (canon lift (core func $echo "poke-echo")
      string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
  (func $echo-bytes (param "v" (list u8)) (result (list u8))
    (canon lift (core func $echo "echo") (memory $mem) (realloc (core func $realloc))))
  (func $echo-u32s (param "v" (list u32)) (result (list u32))
    (canon lift (core func $echo "echo") (memory $mem) (realloc (core func $realloc))))
  (func $echo-strings (param "v" (list string)) (result (list string))
    (canon lift (core func $echo "echo") (memory $mem) (realloc (core func $realloc))))
  (func $echo-tuple (param "v" (tuple u32 string (list u16))) (result (tuple u32 string (list u16)))
    (canon lift (core func $echo "echo-tuple") (memory $mem) (realloc (core func $realloc))))

  (func $string-via-host (param "v" string) (result string)
    (canon lift (core func $string-via-host "echo")
      (memory $mem) (realloc (core func $realloc))))
  (func $string-utf16-via-host (param "v" string) (result string)
    (canon lift (core func $string-utf16-via-host "echo")
      string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
  (func $poke-string-via-host (param "v" string) (param "at" u32) (param "byte" u8) (result string)
    (canon lift (core func $string-via-host "poke-echo")
      (memory $mem) (realloc (core func $realloc))))
  (func $poke-string-utf16-via-host
    (param "v" string) (param "at" u32) (param "byte" u8) (result string)
    (canon lift (core func $string-utf16-via-host "poke-echo")
      string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
  (func $bytes-via-host (param "v" (list u8)) (result (list u8))
    (canon lift (core func $bytes-via-host "echo")
      (memory $mem) (realloc (core func $realloc))))
  (func $strings-via-host (param "v" (list string)) (result (list string))
    (canon lift (core func $strings-via-host "echo")
      (memory $mem) (realloc (core func $realloc))))
  (func $tuple-via-host (param "v" (tuple u32 string (list u16))) (result (tuple u32 string (list u16)))
    (canon lift (core func $tuple-via-host "echo")
      (memory $mem) (realloc (core func $realloc))))

  (instance (export "direct")
    (export "echo-string" (func $echo-string))
    (export "echo-string-utf16" (func $echo-string-utf16))
    (export "poke-string" (func $poke-string))
    (export "poke-string-utf16" (func $poke-string-utf16))
    (export "echo-bytes" (func $echo-bytes))
    (export "echo-u32s" (func $echo-u32s))
    (export "echo-strings" (func $echo-strings))
    (export "echo-tuple" (func $echo-tuple)))
  (instance (export "via-host")
    (export "echo-string" (func $string-via-host))
    (export "echo-string-utf16" (func $string-utf16-via-host))
    (export "poke-string" (func $poke-string-via-host))
    (export "poke-string-utf16" (func $poke-string-utf16-via-host))
    (export "echo-bytes" (func $bytes-via-host))
    (export "echo-strings" (func $strings-via-host))
    (export "echo-tuple" (func $tuple-via-host)))
)
