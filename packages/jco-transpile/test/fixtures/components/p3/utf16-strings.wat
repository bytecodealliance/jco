;; A component that uses utf16 strings with the async ABI and with error
;; contexts, handing back the strings that it is given.
(component
  (import "host" (instance $host
    (export "echo-string" (func async (param "v" string) (result string)))))

  (core module $Libc
    (memory (export "memory") 1)
    (global $next (mut i32) (i32.const 1024))

    (func (export "realloc")
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
      (local.get $ret)))

  (core module $Impl
    (import "libc" "memory" (memory 1))
    (import "" "return-string" (func $return-string (param i32 i32)))
    (import "" "return-strings" (func $return-strings (param i32 i32)))
    (import "" "host-echo-string" (func $host-echo-string (param i32 i32 i32)))
    (import "" "error-context.new" (func $error-context-new (param i32 i32) (result i32)))
    (import "" "error-context.debug-message"
      (func $error-context-debug-message (param i32 i32)))
    (import "" "error-context.drop" (func $error-context-drop (param i32)))

    ;; Returns a string as a pair of flat values
    (func (export "echo-string") (param $ptr i32) (param $len i32) (result i32)
      (call $return-string (local.get $ptr) (local.get $len))
      (i32.const 0))

    ;; Returns a list, whose strings are read out of memory
    (func (export "echo-strings") (param $ptr i32) (param $len i32) (result i32)
      (call $return-strings (local.get $ptr) (local.get $len))
      (i32.const 0))

    ;; Returns the string that the host returned, which the host wrote to memory
    (func (export "echo-string-via-host") (param $ptr i32) (param $len i32) (result i32)
      (call $host-echo-string (local.get $ptr) (local.get $len) (i32.const 16))
      (call $return-string (i32.load (i32.const 16)) (i32.load (i32.const 20)))
      (i32.const 0))

    ;; As `echo-string`, after writing a byte into the string
    (func (export "poke-string")
      (param $ptr i32) (param $len i32) (param $at i32) (param $byte i32)
      (result i32)
      (i32.store8 (i32.add (local.get $ptr) (local.get $at)) (local.get $byte))
      (call $return-string (local.get $ptr) (local.get $len))
      (i32.const 0))

    ;; Returns the debug message of an error context created from the string
    (func (export "error-context-message") (param $ptr i32) (param $len i32) (result i32)
      (local $handle i32)
      (local.set $handle (call $error-context-new (local.get $ptr) (local.get $len)))
      (call $error-context-debug-message (local.get $handle) (i32.const 16))
      (call $error-context-drop (local.get $handle))
      (i32.const 16))

    ;; Every export returns its result before exiting, so there are no events
    (func (export "callback") (param i32 i32 i32) (result i32)
      (unreachable)))

  (core instance $libc (instantiate $Libc))
  (alias core export $libc "memory" (core memory $mem))
  (alias core export $libc "realloc" (core func $realloc))

  (core func $return-string
    (canon task.return (result string) string-encoding=utf16 (memory $mem)))
  (core func $return-strings
    (canon task.return (result (list string)) string-encoding=utf16 (memory $mem)))
  ;; The import is async, but is lowered with the sync ABI
  (core func $host-echo-string
    (canon lower (func $host "echo-string")
      string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
  (core func $error-context-new
    (canon error-context.new string-encoding=utf16 (memory $mem)))
  (core func $error-context-debug-message
    (canon error-context.debug-message
      string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
  (core func $error-context-drop (canon error-context.drop))

  (core instance $i (instantiate $Impl
    (with "libc" (instance $libc))
    (with "" (instance
      (export "return-string" (func $return-string))
      (export "return-strings" (func $return-strings))
      (export "host-echo-string" (func $host-echo-string))
      (export "error-context.new" (func $error-context-new))
      (export "error-context.debug-message" (func $error-context-debug-message))
      (export "error-context.drop" (func $error-context-drop))))))

  (func (export "echo-string") async (param "v" string) (result string)
    (canon lift (core func $i "echo-string")
      async (callback (core func $i "callback"))
      string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
  (func (export "echo-strings") async (param "v" (list string)) (result (list string))
    (canon lift (core func $i "echo-strings")
      async (callback (core func $i "callback"))
      string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
  (func (export "echo-string-via-host") async (param "v" string) (result string)
    (canon lift (core func $i "echo-string-via-host")
      async (callback (core func $i "callback"))
      string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
  (func (export "poke-string") async
    (param "v" string) (param "at" u32) (param "byte" u8) (result string)
    (canon lift (core func $i "poke-string")
      async (callback (core func $i "callback"))
      string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
  (func (export "error-context-message") (param "v" string) (result string)
    (canon lift (core func $i "error-context-message")
      string-encoding=utf16 (memory $mem) (realloc (core func $realloc))))
)
