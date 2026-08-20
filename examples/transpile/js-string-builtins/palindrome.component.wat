(component
  ;; These fallback exports make the component valid independently of the JS
  ;; String Builtins proposal. A proposal-aware engine replaces the matching
  ;; imports while compiling $palindrome, so these functions are never called.
  (core module $fallbacks
    (func (export "length") (param externref) (result i32)
      unreachable
    )
    (func (export "charCodeAt") (param externref i32) (result i32)
      unreachable
    )
    (global (export "racecar") (ref extern)
      (extern.convert_any (ref.i31 (i32.const 0)))
    )
    (global (export "hello") (ref extern)
      (extern.convert_any (ref.i31 (i32.const 0)))
    )
  )
  (core instance $fallbacks-instance (instantiate $fallbacks))

  (alias core export $fallbacks-instance "length" (core func $length))
  (alias core export $fallbacks-instance "charCodeAt" (core func $char-code-at))
  (alias core export $fallbacks-instance "racecar" (core global $racecar))
  (alias core export $fallbacks-instance "hello" (core global $hello))

  (core instance $js-string
    (export "length" (func $length))
    (export "charCodeAt" (func $char-code-at))
  )
  (core instance $string-constants
    (export "racecar" (global $racecar))
    (export "hello" (global $hello))
  )

  (core module $palindrome
    (import "wasm:js-string" "length"
      (func $length (param externref) (result i32))
    )
    (import "wasm:js-string" "charCodeAt"
      (func $char-code-at (param externref i32) (result i32))
    )
    (import "_" "racecar" (global $racecar (ref extern)))
    (import "_" "hello" (global $hello (ref extern)))

    (func $is-palindrome (param $value externref) (result i32)
      (local $length i32)
      (local $middle i32)
      (local $index i32)

      local.get $value
      call $length
      local.tee $length
      i32.const 2
      i32.div_u
      local.set $middle

      loop $check-next
        local.get $index
        local.get $middle
        i32.lt_u
        if
          local.get $value
          local.get $index
          call $char-code-at

          local.get $value
          local.get $length
          local.get $index
          i32.sub
          i32.const 1
          i32.sub
          call $char-code-at

          i32.ne
          if
            i32.const 0
            return
          end

          local.get $index
          i32.const 1
          i32.add
          local.set $index
          br $check-next
        end
      end

      i32.const 1
    )

    (func (export "racecar-is-palindrome") (result i32)
      global.get $racecar
      call $is-palindrome
    )
    (func (export "hello-is-palindrome") (result i32)
      global.get $hello
      call $is-palindrome
    )
  )

  (core instance $palindrome-instance
    (instantiate $palindrome
      (with "wasm:js-string" (instance $js-string))
      (with "_" (instance $string-constants))
    )
  )

  (alias core export $palindrome-instance "racecar-is-palindrome"
    (core func $racecar-is-palindrome)
  )
  (alias core export $palindrome-instance "hello-is-palindrome"
    (core func $hello-is-palindrome)
  )

  (type $check (func (result bool)))
  (func $racecar-check (type $check)
    (canon lift (core func $racecar-is-palindrome))
  )
  (func $hello-check (type $check)
    (canon lift (core func $hello-is-palindrome))
  )

  (export "racecar-is-palindrome" (func $racecar-check))
  (export "hello-is-palindrome" (func $hello-check))
)
