(component
  (type (;0;)
    (instance
      (export (;0;) "pollable" (type (sub resource)))
      (type (;1;) (borrow 0))
      (type (;2;) (list 1))
      (type (;3;) (list u32))
      (type (;4;) (func (param "in" 2) (result 3)))
      (export (;0;) "poll" (func (type 4)))
    )
  )
  (import "wasi:io/poll@0.2.0" (instance (;0;) (type 0)))
  (type (;1;)
    (instance
      (export (;0;) "pollable" (type (sub resource)))
      (type (;1;) (borrow 0))
      (type (;2;) (list 1))
      (type (;3;) (list u32))
      (type (;4;) (func (param "in" 2) (result 3)))
      (export (;0;) "poll" (func (type 4)))
    )
  )
  (import "wasi:io/poll@0.2.1" (instance (;1;) (type 1)))
  (alias export 0 "pollable" (type (;2;)))
  (type (;3;)
    (instance
      (type (;0;) u64)
      (export (;1;) "duration" (type (eq 0)))
      (alias outer 1 2 (type (;2;)))
      (export (;3;) "pollable" (type (eq 2)))
      (type (;4;) (own 3))
      (type (;5;) (func (param "when" 1) (result 4)))
      (export (;0;) "subscribe-duration" (func (type 5)))
    )
  )
  (import "wasi:clocks/monotonic-clock@0.2.0" (instance (;2;) (type 3)))
  (alias export 1 "pollable" (type (;4;)))
  (type (;5;)
    (instance
      (type (;0;) u64)
      (export (;1;) "duration" (type (eq 0)))
      (alias outer 1 4 (type (;2;)))
      (export (;3;) "pollable" (type (eq 2)))
      (type (;4;) (own 3))
      (type (;5;) (func (param "when" 1) (result 4)))
      (export (;0;) "subscribe-duration" (func (type 5)))
    )
  )
  (import "wasi:clocks/monotonic-clock@0.2.1" (instance (;3;) (type 5)))
  (type (;6;)
    (instance
      (type (;0;) (tuple string string))
      (type (;1;) (list 0))
      (type (;2;) (func (result 1)))
      (export (;0;) "get-environment" (func (type 2)))
    )
  )
  (import "wasi:cli/environment@0.2.0" (instance (;4;) (type 6)))
  (type (;7;)
    (instance
      (type (;0;) (result))
      (type (;1;) (func (param "status" 0)))
      (export (;0;) "exit" (func (type 1)))
    )
  )
  (import "wasi:cli/exit@0.2.0" (instance (;5;) (type 7)))
  (type (;8;)
    (instance
      (export (;0;) "error" (type (sub resource)))
    )
  )
  (import "wasi:io/error@0.2.0" (instance (;6;) (type 8)))
  (alias export 6 "error" (type (;9;)))
  (type (;10;)
    (instance
      (export (;0;) "output-stream" (type (sub resource)))
      (alias outer 1 9 (type (;1;)))
      (export (;2;) "error" (type (eq 1)))
      (type (;3;) (own 2))
      (type (;4;) (variant (case "last-operation-failed" 3) (case "closed")))
      (export (;5;) "stream-error" (type (eq 4)))
      (export (;6;) "input-stream" (type (sub resource)))
      (type (;7;) (borrow 0))
      (type (;8;) (result u64 (error 5)))
      (type (;9;) (func (param "self" 7) (result 8)))
      (export (;0;) "[method]output-stream.check-write" (func (type 9)))
      (type (;10;) (list u8))
      (type (;11;) (result (error 5)))
      (type (;12;) (func (param "self" 7) (param "contents" 10) (result 11)))
      (export (;1;) "[method]output-stream.write" (func (type 12)))
      (export (;2;) "[method]output-stream.blocking-write-and-flush" (func (type 12)))
      (type (;13;) (func (param "self" 7) (result 11)))
      (export (;3;) "[method]output-stream.blocking-flush" (func (type 13)))
    )
  )
  (import "wasi:io/streams@0.2.0" (instance (;7;) (type 10)))
  (alias export 7 "input-stream" (type (;11;)))
  (type (;12;)
    (instance
      (alias outer 1 11 (type (;0;)))
      (export (;1;) "input-stream" (type (eq 0)))
      (type (;2;) (own 1))
      (type (;3;) (func (result 2)))
      (export (;0;) "get-stdin" (func (type 3)))
    )
  )
  (import "wasi:cli/stdin@0.2.0" (instance (;8;) (type 12)))
  (alias export 7 "output-stream" (type (;13;)))
  (type (;14;)
    (instance
      (alias outer 1 13 (type (;0;)))
      (export (;1;) "output-stream" (type (eq 0)))
      (type (;2;) (own 1))
      (type (;3;) (func (result 2)))
      (export (;0;) "get-stdout" (func (type 3)))
    )
  )
  (import "wasi:cli/stdout@0.2.0" (instance (;9;) (type 14)))
  (alias export 7 "output-stream" (type (;15;)))
  (type (;16;)
    (instance
      (alias outer 1 15 (type (;0;)))
      (export (;1;) "output-stream" (type (eq 0)))
      (type (;2;) (own 1))
      (type (;3;) (func (result 2)))
      (export (;0;) "get-stderr" (func (type 3)))
    )
  )
  (import "wasi:cli/stderr@0.2.0" (instance (;10;) (type 16)))
  (type (;17;)
    (instance
      (type (;0;) (record (field "seconds" u64) (field "nanoseconds" u32)))
      (export (;1;) "datetime" (type (eq 0)))
    )
  )
  (import "wasi:clocks/wall-clock@0.2.0" (instance (;11;) (type 17)))
  (alias export 7 "output-stream" (type (;18;)))
  (alias export 11 "datetime" (type (;19;)))
  (alias export 7 "error" (type (;20;)))
  (type (;21;)
    (instance
      (export (;0;) "descriptor" (type (sub resource)))
      (type (;1;) u64)
      (export (;2;) "filesize" (type (eq 1)))
      (alias outer 1 18 (type (;3;)))
      (export (;4;) "output-stream" (type (eq 3)))
      (type (;5;) (enum "access" "would-block" "already" "bad-descriptor" "busy" "deadlock" "quota" "exist" "file-too-large" "illegal-byte-sequence" "in-progress" "interrupted" "invalid" "io" "is-directory" "loop" "too-many-links" "message-size" "name-too-long" "no-device" "no-entry" "no-lock" "insufficient-memory" "insufficient-space" "not-directory" "not-empty" "not-recoverable" "unsupported" "no-tty" "no-such-device" "overflow" "not-permitted" "pipe" "read-only" "invalid-seek" "text-file-busy" "cross-device"))
      (export (;6;) "error-code" (type (eq 5)))
      (type (;7;) (enum "unknown" "block-device" "character-device" "directory" "fifo" "symbolic-link" "regular-file" "socket"))
      (export (;8;) "descriptor-type" (type (eq 7)))
      (type (;9;) u64)
      (export (;10;) "link-count" (type (eq 9)))
      (alias outer 1 19 (type (;11;)))
      (export (;12;) "datetime" (type (eq 11)))
      (type (;13;) (option 12))
      (type (;14;) (record (field "type" 8) (field "link-count" 10) (field "size" 2) (field "data-access-timestamp" 13) (field "data-modification-timestamp" 13) (field "status-change-timestamp" 13)))
      (export (;15;) "descriptor-stat" (type (eq 14)))
      (alias outer 1 20 (type (;16;)))
      (export (;17;) "error" (type (eq 16)))
      (type (;18;) (borrow 0))
      (type (;19;) (own 4))
      (type (;20;) (result 19 (error 6)))
      (type (;21;) (func (param "self" 18) (param "offset" 2) (result 20)))
      (export (;0;) "[method]descriptor.write-via-stream" (func (type 21)))
      (type (;22;) (func (param "self" 18) (result 20)))
      (export (;1;) "[method]descriptor.append-via-stream" (func (type 22)))
      (type (;23;) (result 8 (error 6)))
      (type (;24;) (func (param "self" 18) (result 23)))
      (export (;2;) "[method]descriptor.get-type" (func (type 24)))
      (type (;25;) (result 15 (error 6)))
      (type (;26;) (func (param "self" 18) (result 25)))
      (export (;3;) "[method]descriptor.stat" (func (type 26)))
      (type (;27;) (borrow 17))
      (type (;28;) (option 6))
      (type (;29;) (func (param "err" 27) (result 28)))
      (export (;4;) "filesystem-error-code" (func (type 29)))
    )
  )
  (import "wasi:filesystem/types@0.2.0" (instance (;12;) (type 21)))
  (alias export 12 "descriptor" (type (;22;)))
  (type (;23;)
    (instance
      (alias outer 1 22 (type (;0;)))
      (export (;1;) "descriptor" (type (eq 0)))
      (type (;2;) (own 1))
      (type (;3;) (tuple 2 string))
      (type (;4;) (list 3))
      (type (;5;) (func (result 4)))
      (export (;0;) "get-directories" (func (type 5)))
    )
  )
  (import "wasi:filesystem/preopens@0.2.0" (instance (;13;) (type 23)))
  (core module (;0;)
    (type (;0;) (func (param i32)))
    (type (;1;) (func (param i32 i32)))
    (type (;2;) (func (param i32 i32 i32) (result i32)))
    (type (;3;) (func (param i32 i32 i32)))
    (type (;4;) (func (param i32 i32) (result i32)))
    (type (;5;) (func (param i64) (result i32)))
    (type (;6;) (func (param i32 i32 i32 i32) (result i32)))
    (type (;7;) (func))
    (type (;8;) (func (param i32) (result i32)))
    (type (;9;) (func (param i64) (result i64)))
    (type (;10;) (func (param i32 i32 i32 i32)))
    (type (;11;) (func (param i32 i32 i32 i32 i32)))
    (type (;12;) (func (result i32)))
    (type (;13;) (func (param i32 i32 i32 i32 i32 i32)))
    (type (;14;) (func (param i32 i32 i32 i32 i32 i32 i32)))
    (type (;15;) (func (param i32 i32 i32 i32 i32 i32) (result i32)))
    (type (;16;) (func (param i32 i32 i32 i32 i32) (result i32)))
    (type (;17;) (func (param i64 i32 i32) (result i32)))
    (import "wasi:clocks/monotonic-clock@0.2.0" "subscribe-duration" (func $_ZN3foo4wasi11clocks0_2_015monotonic_clock18subscribe_duration10wit_import17h832f9e419c37d930E (;0;) (type 5)))
    (import "wasi:io/poll@0.2.0" "[resource-drop]pollable" (func $_ZN77_$LT$foo..wasi..io0_2_0..poll..Pollable$u20$as$u20$foo.._rt..WasmResource$GT$4drop4drop17hd9d6a658f810e297E (;1;) (type 0)))
    (import "wasi:io/poll@0.2.0" "poll" (func $_ZN3foo4wasi7io0_2_04poll4poll10wit_import17h624371b30bd0bb74E (;2;) (type 3)))
    (import "wasi:clocks/monotonic-clock@0.2.1" "subscribe-duration" (func $_ZN3foo4wasi11clocks0_2_115monotonic_clock18subscribe_duration10wit_import17hec5ae3e6751965d8E (;3;) (type 5)))
    (import "wasi:io/poll@0.2.1" "[resource-drop]pollable" (func $_ZN77_$LT$foo..wasi..io0_2_1..poll..Pollable$u20$as$u20$foo.._rt..WasmResource$GT$4drop4drop17hc3b0ac9f1daf6088E (;4;) (type 0)))
    (import "wasi:io/poll@0.2.1" "poll" (func $_ZN3foo4wasi7io0_2_14poll4poll10wit_import17h1ad9a25d8be2f89cE (;5;) (type 3)))
    (import "wasi_snapshot_preview1" "fd_write" (func $_ZN4wasi13lib_generated22wasi_snapshot_preview18fd_write17h6411a55d3fc118fcE (;6;) (type 6)))
    (import "wasi_snapshot_preview1" "environ_get" (func $__imported_wasi_snapshot_preview1_environ_get (;7;) (type 4)))
    (import "wasi_snapshot_preview1" "environ_sizes_get" (func $__imported_wasi_snapshot_preview1_environ_sizes_get (;8;) (type 4)))
    (import "wasi_snapshot_preview1" "proc_exit" (func $__imported_wasi_snapshot_preview1_proc_exit (;9;) (type 0)))
    (func $__wasm_call_ctors (;10;) (type 7))
    (func $_ZN4core5slice4iter87_$LT$impl$u20$core..iter..traits..collect..IntoIterator$u20$for$u20$$RF$$u5b$T$u5d$$GT$9into_iter17h1b30d8dbf5c4b885E (;11;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 3
      i32.const 32
      local.set 4
      local.get 3
      local.get 4
      i32.sub
      local.set 5
      local.get 5
      local.get 1
      i32.store offset=4
      local.get 5
      local.get 2
      i32.store offset=8
      local.get 5
      local.get 2
      i32.store offset=12
      local.get 5
      local.get 1
      i32.store offset=16
      local.get 5
      local.get 2
      i32.store offset=20
      local.get 5
      local.get 1
      i32.store offset=24
      local.get 5
      local.get 1
      i32.store offset=28
      i32.const 2
      local.set 6
      local.get 2
      local.get 6
      i32.shl
      local.set 7
      local.get 1
      local.get 7
      i32.add
      local.set 8
      local.get 5
      local.get 8
      i32.store
      local.get 5
      i32.load
      local.set 9
      local.get 0
      local.get 9
      i32.store offset=4
      local.get 0
      local.get 1
      i32.store
      return
    )
    (func $_ZN4core5slice4iter87_$LT$impl$u20$core..iter..traits..collect..IntoIterator$u20$for$u20$$RF$$u5b$T$u5d$$GT$9into_iter17h77b7b13c5306a3cfE (;12;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 3
      i32.const 32
      local.set 4
      local.get 3
      local.get 4
      i32.sub
      local.set 5
      local.get 5
      local.get 1
      i32.store offset=4
      local.get 5
      local.get 2
      i32.store offset=8
      local.get 5
      local.get 2
      i32.store offset=12
      local.get 5
      local.get 1
      i32.store offset=16
      local.get 5
      local.get 2
      i32.store offset=20
      local.get 5
      local.get 1
      i32.store offset=24
      local.get 5
      local.get 1
      i32.store offset=28
      i32.const 2
      local.set 6
      local.get 2
      local.get 6
      i32.shl
      local.set 7
      local.get 1
      local.get 7
      i32.add
      local.set 8
      local.get 5
      local.get 8
      i32.store
      local.get 5
      i32.load
      local.set 9
      local.get 0
      local.get 9
      i32.store offset=4
      local.get 0
      local.get 1
      i32.store
      return
    )
    (func $_ZN4core3ptr13read_volatile18precondition_check17h2c855c2a4cc02827E (;13;) (type 1) (param i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 48
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      global.set $__stack_pointer
      i32.const 1048620
      local.set 5
      local.get 4
      local.get 5
      i32.store offset=4
      local.get 4
      local.get 0
      i32.store offset=32
      local.get 4
      local.get 1
      i32.store offset=36
      local.get 4
      local.get 0
      i32.store offset=40
      block ;; label = @1
        block ;; label = @2
          local.get 0
          br_if 0 (;@2;)
          br 1 (;@1;)
        end
        local.get 1
        i32.popcnt
        local.set 6
        local.get 4
        local.get 6
        i32.store offset=44
        local.get 4
        i32.load offset=44
        local.set 7
        i32.const 1
        local.set 8
        local.get 7
        local.set 9
        local.get 8
        local.set 10
        local.get 9
        local.get 10
        i32.eq
        local.set 11
        i32.const 1
        local.set 12
        local.get 11
        local.get 12
        i32.and
        local.set 13
        block ;; label = @2
          block ;; label = @3
            local.get 13
            i32.eqz
            br_if 0 (;@3;)
            i32.const 1
            local.set 14
            local.get 1
            local.get 14
            i32.sub
            local.set 15
            local.get 0
            local.get 15
            i32.and
            local.set 16
            local.get 16
            i32.eqz
            br_if 1 (;@2;)
            br 2 (;@1;)
          end
          i32.const 1048620
          local.set 17
          local.get 4
          local.get 17
          i32.store offset=8
          i32.const 1
          local.set 18
          local.get 4
          local.get 18
          i32.store offset=12
          i32.const 0
          local.set 19
          local.get 19
          i32.load offset=1048740
          local.set 20
          i32.const 0
          local.set 21
          local.get 21
          i32.load offset=1048744
          local.set 22
          local.get 4
          local.get 20
          i32.store offset=24
          local.get 4
          local.get 22
          i32.store offset=28
          i32.const 4
          local.set 23
          local.get 4
          local.get 23
          i32.store offset=16
          i32.const 0
          local.set 24
          local.get 4
          local.get 24
          i32.store offset=20
          i32.const 8
          local.set 25
          local.get 4
          local.get 25
          i32.add
          local.set 26
          local.get 26
          local.set 27
          i32.const 1048832
          local.set 28
          local.get 27
          local.get 28
          call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
          unreachable
        end
        i32.const 48
        local.set 29
        local.get 4
        local.get 29
        i32.add
        local.set 30
        local.get 30
        global.set $__stack_pointer
        return
      end
      i32.const 1048628
      local.set 31
      i32.const 110
      local.set 32
      local.get 31
      local.get 32
      call $_ZN4core9panicking14panic_nounwind17hb10ad53603be5a05E
      unreachable
    )
    (func $_ZN3foo4wasi11clocks0_2_015monotonic_clock18subscribe_duration17h425c70592c71d849E (;14;) (type 5) (param i64) (result i32)
      (local i32 i32 i32 i64 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 32
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i64.store offset=16
      local.get 0
      call $_ZN3foo3_rt6as_i6417h101ab03d01dbe45dE
      local.set 4
      local.get 4
      call $_ZN3foo4wasi11clocks0_2_015monotonic_clock18subscribe_duration10wit_import17h832f9e419c37d930E
      local.set 5
      local.get 3
      local.get 5
      i32.store offset=24
      local.get 5
      call $_ZN3foo4wasi7io0_2_04poll8Pollable11from_handle17h5ccbea550b35b8bcE
      local.set 6
      local.get 3
      local.get 6
      i32.store offset=28
      local.get 3
      i32.load offset=28
      local.set 7
      local.get 3
      local.get 7
      i32.store offset=12
      local.get 3
      i32.load offset=12
      local.set 8
      i32.const 32
      local.set 9
      local.get 3
      local.get 9
      i32.add
      local.set 10
      local.get 10
      global.set $__stack_pointer
      local.get 8
      return
    )
    (func $_ZN3foo4wasi7io0_2_04poll8Pollable11from_handle17h5ccbea550b35b8bcE (;15;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=8
      local.get 0
      call $_ZN3foo3_rt17Resource$LT$T$GT$11from_handle17hd96979ca4db4b1e3E
      local.set 4
      local.get 3
      local.get 4
      i32.store offset=12
      local.get 3
      i32.load offset=12
      local.set 5
      local.get 3
      local.get 5
      i32.store offset=4
      local.get 3
      i32.load offset=4
      local.set 6
      local.get 3
      local.get 6
      i32.store
      local.get 3
      i32.load
      local.set 7
      i32.const 16
      local.set 8
      local.get 3
      local.get 8
      i32.add
      local.set 9
      local.get 9
      global.set $__stack_pointer
      local.get 7
      return
    )
    (func $_ZN3foo4wasi7io0_2_04poll8Pollable6handle17h2c8f335c1c5056b1E (;16;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=12
      local.get 0
      call $_ZN3foo3_rt17Resource$LT$T$GT$6handle17ha14cee480a55db6eE
      local.set 4
      i32.const 16
      local.set 5
      local.get 3
      local.get 5
      i32.add
      local.set 6
      local.get 6
      global.set $__stack_pointer
      local.get 4
      return
    )
    (func $_ZN77_$LT$foo..wasi..io0_2_0..poll..Pollable$u20$as$u20$foo.._rt..WasmResource$GT$4drop17h9eb9359c17eecfa9E (;17;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=12
      local.get 0
      call $_ZN77_$LT$foo..wasi..io0_2_0..poll..Pollable$u20$as$u20$foo.._rt..WasmResource$GT$4drop4drop17hd9d6a658f810e297E
      i32.const 16
      local.set 4
      local.get 3
      local.get 4
      i32.add
      local.set 5
      local.get 5
      global.set $__stack_pointer
      return
    )
    (func $_ZN3foo4wasi7io0_2_04poll4poll17hfa86e367c444a37eE (;18;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32 i32 i64 i64 i64 i64 i64 i64 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 3
      i32.const 224
      local.set 4
      local.get 3
      local.get 4
      i32.sub
      local.set 5
      local.get 5
      global.set $__stack_pointer
      local.get 5
      local.get 1
      i32.store offset=104
      local.get 5
      local.get 2
      i32.store offset=108
      local.get 5
      i32.load8_u offset=147
      local.set 6
      local.get 6
      i64.extend_i32_u
      local.set 7
      i64.const 255
      local.set 8
      local.get 7
      local.get 8
      i64.and
      local.set 9
      i64.const 72340172838076673
      local.set 10
      local.get 9
      local.get 10
      i64.mul
      local.set 11
      local.get 5
      local.get 11
      i64.store offset=32
      local.get 5
      i64.load offset=32 align=1
      local.set 12
      local.get 5
      local.get 12
      i64.store offset=24
      local.get 5
      local.get 2
      i32.store offset=112
      i32.const 2
      local.set 13
      local.get 2
      local.get 13
      i32.shl
      local.set 14
      i32.const 1073741823
      local.set 15
      local.get 2
      local.get 15
      i32.and
      local.set 16
      local.get 16
      local.get 2
      i32.ne
      local.set 17
      i32.const 1
      local.set 18
      local.get 17
      local.get 18
      i32.and
      local.set 19
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 19
              br_if 0 (;@4;)
              i32.const 4
              local.set 20
              i32.const 16
              local.set 21
              local.get 5
              local.get 21
              i32.add
              local.set 22
              local.get 22
              local.get 14
              local.get 20
              call $_ZN4core5alloc6layout6Layout25from_size_align_unchecked17h62291b53bc389006E
              local.get 5
              i32.load offset=20
              local.set 23
              local.get 5
              i32.load offset=16
              local.set 24
              local.get 5
              local.get 24
              i32.store offset=44
              local.get 5
              local.get 23
              i32.store offset=48
              i32.const 44
              local.set 25
              local.get 5
              local.get 25
              i32.add
              local.set 26
              local.get 26
              local.set 27
              local.get 27
              call $_ZN4core5alloc6layout6Layout4size17he05cad0a1f23e699E
              local.set 28
              local.get 28
              i32.eqz
              br_if 1 (;@3;)
              br 2 (;@2;)
            end
            i32.const 1048860
            local.set 29
            local.get 29
            call $_ZN4core9panicking11panic_const24panic_const_mul_overflow17hce9c6f2692bf60a5E
            unreachable
          end
          i32.const 0
          local.set 30
          local.get 5
          local.get 30
          i32.store offset=208
          i32.const 0
          local.set 31
          local.get 5
          local.get 31
          i32.store offset=212
          i32.const 0
          local.set 32
          local.get 5
          local.get 32
          i32.store offset=52
          br 1 (;@1;)
        end
        local.get 5
        i32.load offset=44
        local.set 33
        local.get 5
        i32.load offset=48
        local.set 34
        local.get 33
        local.get 34
        call $_ZN5alloc5alloc5alloc17he13d52f3f09a1361E
        local.set 35
        local.get 5
        local.get 35
        i32.store offset=188
        local.get 5
        local.get 35
        i32.store offset=116
        local.get 35
        call $_ZN4core3ptr7mut_ptr31_$LT$impl$u20$$BP$mut$u20$T$GT$7is_null17h2eac4e0ea4a4aaeaE
        local.set 36
        i32.const 1
        local.set 37
        local.get 36
        local.get 37
        i32.and
        local.set 38
        block ;; label = @2
          local.get 38
          br_if 0 (;@2;)
          local.get 5
          local.get 35
          i32.store offset=52
          br 1 (;@1;)
        end
        local.get 5
        i32.load offset=44
        local.set 39
        local.get 5
        i32.load offset=48
        local.set 40
        local.get 39
        local.get 40
        call $_ZN5alloc5alloc18handle_alloc_error17h7bdcb31f02c1333fE
        unreachable
      end
      i32.const 8
      local.set 41
      local.get 5
      local.get 41
      i32.add
      local.set 42
      local.get 42
      local.get 1
      local.get 2
      call $_ZN4core5slice4iter87_$LT$impl$u20$core..iter..traits..collect..IntoIterator$u20$for$u20$$RF$$u5b$T$u5d$$GT$9into_iter17h77b7b13c5306a3cfE
      local.get 5
      i32.load offset=12
      local.set 43
      local.get 5
      i32.load offset=8
      local.set 44
      i32.const 68
      local.set 45
      local.get 5
      local.get 45
      i32.add
      local.set 46
      local.get 46
      local.set 47
      local.get 47
      local.get 44
      local.get 43
      call $_ZN4core4iter6traits8iterator8Iterator9enumerate17h6d23f06829a56d52E
      i32.const 56
      local.set 48
      local.get 5
      local.get 48
      i32.add
      local.set 49
      local.get 49
      local.set 50
      i32.const 68
      local.set 51
      local.get 5
      local.get 51
      i32.add
      local.set 52
      local.get 52
      local.set 53
      local.get 50
      local.get 53
      call $_ZN63_$LT$I$u20$as$u20$core..iter..traits..collect..IntoIterator$GT$9into_iter17h221c4ea91f43f862E
      i32.const 8
      local.set 54
      i32.const 80
      local.set 55
      local.get 5
      local.get 55
      i32.add
      local.set 56
      local.get 56
      local.get 54
      i32.add
      local.set 57
      i32.const 56
      local.set 58
      local.get 5
      local.get 58
      i32.add
      local.set 59
      local.get 59
      local.get 54
      i32.add
      local.set 60
      local.get 60
      i32.load
      local.set 61
      local.get 57
      local.get 61
      i32.store
      local.get 5
      i64.load offset=56 align=4
      local.set 62
      local.get 5
      local.get 62
      i64.store offset=80
      block ;; label = @1
        block ;; label = @2
          loop ;; label = @3
            i32.const 80
            local.set 63
            local.get 5
            local.get 63
            i32.add
            local.set 64
            local.get 5
            local.get 64
            call $_ZN110_$LT$core..iter..adapters..enumerate..Enumerate$LT$I$GT$$u20$as$u20$core..iter..traits..iterator..Iterator$GT$4next17h8982968a737d6af5E
            local.get 5
            i32.load offset=4
            local.set 65
            local.get 5
            i32.load
            local.set 66
            local.get 5
            local.get 66
            i32.store offset=96
            local.get 5
            local.get 65
            i32.store offset=100
            local.get 5
            i32.load offset=100
            local.set 67
            i32.const 0
            local.set 68
            i32.const 1
            local.set 69
            local.get 69
            local.get 68
            local.get 67
            select
            local.set 70
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      block ;; label = @9
                        block ;; label = @10
                          block ;; label = @11
                            block ;; label = @12
                              local.get 70
                              br_if 0 (;@12;)
                              i32.const 24
                              local.set 71
                              local.get 5
                              local.get 71
                              i32.add
                              local.set 72
                              local.get 72
                              local.set 73
                              local.get 5
                              local.get 73
                              i32.store offset=216
                              i32.const 8
                              local.set 74
                              local.get 5
                              local.get 74
                              i32.store offset=220
                              i32.const 24
                              local.set 75
                              local.get 5
                              local.get 75
                              i32.add
                              local.set 76
                              local.get 76
                              local.set 77
                              local.get 5
                              local.get 77
                              i32.store offset=196
                              i32.const 24
                              local.set 78
                              local.get 5
                              local.get 78
                              i32.add
                              local.set 79
                              local.get 79
                              local.set 80
                              local.get 5
                              local.get 80
                              i32.store offset=120
                              local.get 5
                              i32.load offset=52
                              local.set 81
                              i32.const 24
                              local.set 82
                              local.get 5
                              local.get 82
                              i32.add
                              local.set 83
                              local.get 83
                              local.set 84
                              local.get 81
                              local.get 2
                              local.get 84
                              call $_ZN3foo4wasi7io0_2_04poll4poll10wit_import17h624371b30bd0bb74E
                              i32.const 24
                              local.set 85
                              local.get 5
                              local.get 85
                              i32.add
                              local.set 86
                              local.get 86
                              local.set 87
                              local.get 5
                              local.get 87
                              i32.store offset=172
                              i32.const 0
                              local.set 88
                              local.get 5
                              local.get 88
                              i32.store offset=176
                              i32.const 24
                              local.set 89
                              local.get 5
                              local.get 89
                              i32.add
                              local.set 90
                              local.get 90
                              local.set 91
                              local.get 5
                              local.get 91
                              i32.store offset=192
                              i32.const 24
                              local.set 92
                              local.get 5
                              local.get 92
                              i32.add
                              local.set 93
                              local.get 93
                              local.set 94
                              i32.const 3
                              local.set 95
                              local.get 94
                              local.get 95
                              i32.and
                              local.set 96
                              local.get 96
                              i32.eqz
                              br_if 1 (;@11;)
                              br 2 (;@10;)
                            end
                            local.get 5
                            i32.load offset=96
                            local.set 97
                            local.get 5
                            local.get 97
                            i32.store offset=132
                            local.get 5
                            i32.load offset=100
                            local.set 98
                            local.get 5
                            local.get 98
                            i32.store offset=136
                            local.get 5
                            i32.load offset=52
                            local.set 99
                            i32.const 2
                            local.set 100
                            local.get 97
                            local.get 100
                            i32.shl
                            local.set 101
                            i32.const 1073741823
                            local.set 102
                            local.get 97
                            local.get 102
                            i32.and
                            local.set 103
                            local.get 103
                            local.get 97
                            i32.ne
                            local.set 104
                            i32.const 1
                            local.set 105
                            local.get 104
                            local.get 105
                            i32.and
                            local.set 106
                            local.get 106
                            br_if 6 (;@5;)
                            br 5 (;@6;)
                          end
                          local.get 5
                          i32.load offset=24
                          local.set 107
                          local.get 5
                          local.get 107
                          i32.store offset=124
                          i32.const 24
                          local.set 108
                          local.get 5
                          local.get 108
                          i32.add
                          local.set 109
                          local.get 109
                          local.set 110
                          local.get 5
                          local.get 110
                          i32.store offset=164
                          i32.const 4
                          local.set 111
                          local.get 5
                          local.get 111
                          i32.store offset=168
                          i32.const 24
                          local.set 112
                          local.get 5
                          local.get 112
                          i32.add
                          local.set 113
                          local.get 113
                          local.set 114
                          i32.const 4
                          local.set 115
                          local.get 114
                          local.get 115
                          i32.add
                          local.set 116
                          local.get 5
                          local.get 116
                          i32.store offset=204
                          i32.const 3
                          local.set 117
                          local.get 116
                          local.get 117
                          i32.and
                          local.set 118
                          local.get 118
                          i32.eqz
                          br_if 1 (;@9;)
                          br 2 (;@8;)
                        end
                        i32.const 4
                        local.set 119
                        i32.const 1048860
                        local.set 120
                        local.get 119
                        local.get 94
                        local.get 120
                        call $_ZN4core9panicking36panic_misaligned_pointer_dereference17h5f995884aa2fdf9dE
                        unreachable
                      end
                      local.get 116
                      i32.load
                      local.set 121
                      local.get 5
                      local.get 121
                      i32.store offset=128
                      i32.const 44
                      local.set 122
                      local.get 5
                      local.get 122
                      i32.add
                      local.set 123
                      local.get 123
                      local.set 124
                      local.get 124
                      call $_ZN4core5alloc6layout6Layout4size17he05cad0a1f23e699E
                      local.set 125
                      local.get 125
                      i32.eqz
                      br_if 7 (;@1;)
                      br 1 (;@7;)
                    end
                    i32.const 4
                    local.set 126
                    i32.const 1048860
                    local.set 127
                    local.get 126
                    local.get 116
                    local.get 127
                    call $_ZN4core9panicking36panic_misaligned_pointer_dereference17h5f995884aa2fdf9dE
                    unreachable
                  end
                  local.get 5
                  i32.load offset=52
                  local.set 128
                  local.get 5
                  local.get 128
                  i32.store offset=184
                  local.get 5
                  i32.load offset=44
                  local.set 129
                  local.get 5
                  i32.load offset=48
                  local.set 130
                  local.get 128
                  local.get 129
                  local.get 130
                  call $_ZN5alloc5alloc7dealloc17hd8ea480b7f37c390E
                  br 5 (;@1;)
                end
                local.get 5
                local.get 99
                i32.store offset=156
                local.get 5
                local.get 101
                i32.store offset=160
                local.get 99
                local.get 101
                i32.add
                local.set 131
                local.get 5
                local.get 131
                i32.store offset=140
                local.get 98
                i32.load
                local.set 132
                local.get 132
                call $_ZN3foo4wasi7io0_2_04poll8Pollable6handle17h2c8f335c1c5056b1E
                local.set 133
                local.get 5
                local.get 131
                i32.store offset=148
                i32.const 0
                local.set 134
                local.get 5
                local.get 134
                i32.store offset=152
                local.get 5
                local.get 131
                i32.store offset=200
                i32.const 3
                local.set 135
                local.get 131
                local.get 135
                i32.and
                local.set 136
                local.get 136
                i32.eqz
                br_if 1 (;@4;)
                br 3 (;@2;)
              end
              i32.const 1048860
              local.set 137
              local.get 137
              call $_ZN4core9panicking11panic_const24panic_const_mul_overflow17hce9c6f2692bf60a5E
              unreachable
            end
            local.get 131
            local.get 133
            i32.store
            br 0 (;@3;)
          end
        end
        i32.const 4
        local.set 138
        i32.const 1048860
        local.set 139
        local.get 138
        local.get 131
        local.get 139
        call $_ZN4core9panicking36panic_misaligned_pointer_dereference17h5f995884aa2fdf9dE
        unreachable
      end
      local.get 5
      local.get 107
      i32.store offset=180
      local.get 0
      local.get 107
      local.get 121
      local.get 121
      call $_ZN5alloc3vec12Vec$LT$T$GT$14from_raw_parts17h036479d766291ac5E
      i32.const 224
      local.set 140
      local.get 5
      local.get 140
      i32.add
      local.set 141
      local.get 141
      global.set $__stack_pointer
      return
    )
    (func $_ZN3foo4wasi11clocks0_2_115monotonic_clock18subscribe_duration17h9072e0e000642499E (;19;) (type 5) (param i64) (result i32)
      (local i32 i32 i32 i64 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 32
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i64.store offset=16
      local.get 0
      call $_ZN3foo3_rt6as_i6417h101ab03d01dbe45dE
      local.set 4
      local.get 4
      call $_ZN3foo4wasi11clocks0_2_115monotonic_clock18subscribe_duration10wit_import17hec5ae3e6751965d8E
      local.set 5
      local.get 3
      local.get 5
      i32.store offset=24
      local.get 5
      call $_ZN3foo4wasi7io0_2_14poll8Pollable11from_handle17h958c122d70338aefE
      local.set 6
      local.get 3
      local.get 6
      i32.store offset=28
      local.get 3
      i32.load offset=28
      local.set 7
      local.get 3
      local.get 7
      i32.store offset=12
      local.get 3
      i32.load offset=12
      local.set 8
      i32.const 32
      local.set 9
      local.get 3
      local.get 9
      i32.add
      local.set 10
      local.get 10
      global.set $__stack_pointer
      local.get 8
      return
    )
    (func $_ZN3foo4wasi7io0_2_14poll8Pollable11from_handle17h958c122d70338aefE (;20;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=8
      local.get 0
      call $_ZN3foo3_rt17Resource$LT$T$GT$11from_handle17ha7d938c7f4a0175cE
      local.set 4
      local.get 3
      local.get 4
      i32.store offset=12
      local.get 3
      i32.load offset=12
      local.set 5
      local.get 3
      local.get 5
      i32.store offset=4
      local.get 3
      i32.load offset=4
      local.set 6
      local.get 3
      local.get 6
      i32.store
      local.get 3
      i32.load
      local.set 7
      i32.const 16
      local.set 8
      local.get 3
      local.get 8
      i32.add
      local.set 9
      local.get 9
      global.set $__stack_pointer
      local.get 7
      return
    )
    (func $_ZN3foo4wasi7io0_2_14poll8Pollable6handle17haed124584d1e3719E (;21;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=12
      local.get 0
      call $_ZN3foo3_rt17Resource$LT$T$GT$6handle17h8cc6af1b1fd76c33E
      local.set 4
      i32.const 16
      local.set 5
      local.get 3
      local.get 5
      i32.add
      local.set 6
      local.get 6
      global.set $__stack_pointer
      local.get 4
      return
    )
    (func $_ZN77_$LT$foo..wasi..io0_2_1..poll..Pollable$u20$as$u20$foo.._rt..WasmResource$GT$4drop17h69fb5e0b57ffac5cE (;22;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=12
      local.get 0
      call $_ZN77_$LT$foo..wasi..io0_2_1..poll..Pollable$u20$as$u20$foo.._rt..WasmResource$GT$4drop4drop17hc3b0ac9f1daf6088E
      i32.const 16
      local.set 4
      local.get 3
      local.get 4
      i32.add
      local.set 5
      local.get 5
      global.set $__stack_pointer
      return
    )
    (func $_ZN3foo4wasi7io0_2_14poll4poll17haa888ab780ca6d57E (;23;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32 i32 i64 i64 i64 i64 i64 i64 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 3
      i32.const 224
      local.set 4
      local.get 3
      local.get 4
      i32.sub
      local.set 5
      local.get 5
      global.set $__stack_pointer
      local.get 5
      local.get 1
      i32.store offset=104
      local.get 5
      local.get 2
      i32.store offset=108
      local.get 5
      i32.load8_u offset=147
      local.set 6
      local.get 6
      i64.extend_i32_u
      local.set 7
      i64.const 255
      local.set 8
      local.get 7
      local.get 8
      i64.and
      local.set 9
      i64.const 72340172838076673
      local.set 10
      local.get 9
      local.get 10
      i64.mul
      local.set 11
      local.get 5
      local.get 11
      i64.store offset=32
      local.get 5
      i64.load offset=32 align=1
      local.set 12
      local.get 5
      local.get 12
      i64.store offset=24
      local.get 5
      local.get 2
      i32.store offset=112
      i32.const 2
      local.set 13
      local.get 2
      local.get 13
      i32.shl
      local.set 14
      i32.const 1073741823
      local.set 15
      local.get 2
      local.get 15
      i32.and
      local.set 16
      local.get 16
      local.get 2
      i32.ne
      local.set 17
      i32.const 1
      local.set 18
      local.get 17
      local.get 18
      i32.and
      local.set 19
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 19
              br_if 0 (;@4;)
              i32.const 4
              local.set 20
              i32.const 16
              local.set 21
              local.get 5
              local.get 21
              i32.add
              local.set 22
              local.get 22
              local.get 14
              local.get 20
              call $_ZN4core5alloc6layout6Layout25from_size_align_unchecked17h62291b53bc389006E
              local.get 5
              i32.load offset=20
              local.set 23
              local.get 5
              i32.load offset=16
              local.set 24
              local.get 5
              local.get 24
              i32.store offset=44
              local.get 5
              local.get 23
              i32.store offset=48
              i32.const 44
              local.set 25
              local.get 5
              local.get 25
              i32.add
              local.set 26
              local.get 26
              local.set 27
              local.get 27
              call $_ZN4core5alloc6layout6Layout4size17he05cad0a1f23e699E
              local.set 28
              local.get 28
              i32.eqz
              br_if 1 (;@3;)
              br 2 (;@2;)
            end
            i32.const 1048888
            local.set 29
            local.get 29
            call $_ZN4core9panicking11panic_const24panic_const_mul_overflow17hce9c6f2692bf60a5E
            unreachable
          end
          i32.const 0
          local.set 30
          local.get 5
          local.get 30
          i32.store offset=208
          i32.const 0
          local.set 31
          local.get 5
          local.get 31
          i32.store offset=212
          i32.const 0
          local.set 32
          local.get 5
          local.get 32
          i32.store offset=52
          br 1 (;@1;)
        end
        local.get 5
        i32.load offset=44
        local.set 33
        local.get 5
        i32.load offset=48
        local.set 34
        local.get 33
        local.get 34
        call $_ZN5alloc5alloc5alloc17he13d52f3f09a1361E
        local.set 35
        local.get 5
        local.get 35
        i32.store offset=188
        local.get 5
        local.get 35
        i32.store offset=116
        local.get 35
        call $_ZN4core3ptr7mut_ptr31_$LT$impl$u20$$BP$mut$u20$T$GT$7is_null17h2eac4e0ea4a4aaeaE
        local.set 36
        i32.const 1
        local.set 37
        local.get 36
        local.get 37
        i32.and
        local.set 38
        block ;; label = @2
          local.get 38
          br_if 0 (;@2;)
          local.get 5
          local.get 35
          i32.store offset=52
          br 1 (;@1;)
        end
        local.get 5
        i32.load offset=44
        local.set 39
        local.get 5
        i32.load offset=48
        local.set 40
        local.get 39
        local.get 40
        call $_ZN5alloc5alloc18handle_alloc_error17h7bdcb31f02c1333fE
        unreachable
      end
      i32.const 8
      local.set 41
      local.get 5
      local.get 41
      i32.add
      local.set 42
      local.get 42
      local.get 1
      local.get 2
      call $_ZN4core5slice4iter87_$LT$impl$u20$core..iter..traits..collect..IntoIterator$u20$for$u20$$RF$$u5b$T$u5d$$GT$9into_iter17h1b30d8dbf5c4b885E
      local.get 5
      i32.load offset=12
      local.set 43
      local.get 5
      i32.load offset=8
      local.set 44
      i32.const 68
      local.set 45
      local.get 5
      local.get 45
      i32.add
      local.set 46
      local.get 46
      local.set 47
      local.get 47
      local.get 44
      local.get 43
      call $_ZN4core4iter6traits8iterator8Iterator9enumerate17h6c445d524df70b48E
      i32.const 56
      local.set 48
      local.get 5
      local.get 48
      i32.add
      local.set 49
      local.get 49
      local.set 50
      i32.const 68
      local.set 51
      local.get 5
      local.get 51
      i32.add
      local.set 52
      local.get 52
      local.set 53
      local.get 50
      local.get 53
      call $_ZN63_$LT$I$u20$as$u20$core..iter..traits..collect..IntoIterator$GT$9into_iter17hc7552c2a1a2ca063E
      i32.const 8
      local.set 54
      i32.const 80
      local.set 55
      local.get 5
      local.get 55
      i32.add
      local.set 56
      local.get 56
      local.get 54
      i32.add
      local.set 57
      i32.const 56
      local.set 58
      local.get 5
      local.get 58
      i32.add
      local.set 59
      local.get 59
      local.get 54
      i32.add
      local.set 60
      local.get 60
      i32.load
      local.set 61
      local.get 57
      local.get 61
      i32.store
      local.get 5
      i64.load offset=56 align=4
      local.set 62
      local.get 5
      local.get 62
      i64.store offset=80
      block ;; label = @1
        block ;; label = @2
          loop ;; label = @3
            i32.const 80
            local.set 63
            local.get 5
            local.get 63
            i32.add
            local.set 64
            local.get 5
            local.get 64
            call $_ZN110_$LT$core..iter..adapters..enumerate..Enumerate$LT$I$GT$$u20$as$u20$core..iter..traits..iterator..Iterator$GT$4next17ha8e4a611907dacdfE
            local.get 5
            i32.load offset=4
            local.set 65
            local.get 5
            i32.load
            local.set 66
            local.get 5
            local.get 66
            i32.store offset=96
            local.get 5
            local.get 65
            i32.store offset=100
            local.get 5
            i32.load offset=100
            local.set 67
            i32.const 0
            local.set 68
            i32.const 1
            local.set 69
            local.get 69
            local.get 68
            local.get 67
            select
            local.set 70
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      block ;; label = @9
                        block ;; label = @10
                          block ;; label = @11
                            block ;; label = @12
                              local.get 70
                              br_if 0 (;@12;)
                              i32.const 24
                              local.set 71
                              local.get 5
                              local.get 71
                              i32.add
                              local.set 72
                              local.get 72
                              local.set 73
                              local.get 5
                              local.get 73
                              i32.store offset=216
                              i32.const 8
                              local.set 74
                              local.get 5
                              local.get 74
                              i32.store offset=220
                              i32.const 24
                              local.set 75
                              local.get 5
                              local.get 75
                              i32.add
                              local.set 76
                              local.get 76
                              local.set 77
                              local.get 5
                              local.get 77
                              i32.store offset=196
                              i32.const 24
                              local.set 78
                              local.get 5
                              local.get 78
                              i32.add
                              local.set 79
                              local.get 79
                              local.set 80
                              local.get 5
                              local.get 80
                              i32.store offset=120
                              local.get 5
                              i32.load offset=52
                              local.set 81
                              i32.const 24
                              local.set 82
                              local.get 5
                              local.get 82
                              i32.add
                              local.set 83
                              local.get 83
                              local.set 84
                              local.get 81
                              local.get 2
                              local.get 84
                              call $_ZN3foo4wasi7io0_2_14poll4poll10wit_import17h1ad9a25d8be2f89cE
                              i32.const 24
                              local.set 85
                              local.get 5
                              local.get 85
                              i32.add
                              local.set 86
                              local.get 86
                              local.set 87
                              local.get 5
                              local.get 87
                              i32.store offset=172
                              i32.const 0
                              local.set 88
                              local.get 5
                              local.get 88
                              i32.store offset=176
                              i32.const 24
                              local.set 89
                              local.get 5
                              local.get 89
                              i32.add
                              local.set 90
                              local.get 90
                              local.set 91
                              local.get 5
                              local.get 91
                              i32.store offset=192
                              i32.const 24
                              local.set 92
                              local.get 5
                              local.get 92
                              i32.add
                              local.set 93
                              local.get 93
                              local.set 94
                              i32.const 3
                              local.set 95
                              local.get 94
                              local.get 95
                              i32.and
                              local.set 96
                              local.get 96
                              i32.eqz
                              br_if 1 (;@11;)
                              br 2 (;@10;)
                            end
                            local.get 5
                            i32.load offset=96
                            local.set 97
                            local.get 5
                            local.get 97
                            i32.store offset=132
                            local.get 5
                            i32.load offset=100
                            local.set 98
                            local.get 5
                            local.get 98
                            i32.store offset=136
                            local.get 5
                            i32.load offset=52
                            local.set 99
                            i32.const 2
                            local.set 100
                            local.get 97
                            local.get 100
                            i32.shl
                            local.set 101
                            i32.const 1073741823
                            local.set 102
                            local.get 97
                            local.get 102
                            i32.and
                            local.set 103
                            local.get 103
                            local.get 97
                            i32.ne
                            local.set 104
                            i32.const 1
                            local.set 105
                            local.get 104
                            local.get 105
                            i32.and
                            local.set 106
                            local.get 106
                            br_if 6 (;@5;)
                            br 5 (;@6;)
                          end
                          local.get 5
                          i32.load offset=24
                          local.set 107
                          local.get 5
                          local.get 107
                          i32.store offset=124
                          i32.const 24
                          local.set 108
                          local.get 5
                          local.get 108
                          i32.add
                          local.set 109
                          local.get 109
                          local.set 110
                          local.get 5
                          local.get 110
                          i32.store offset=164
                          i32.const 4
                          local.set 111
                          local.get 5
                          local.get 111
                          i32.store offset=168
                          i32.const 24
                          local.set 112
                          local.get 5
                          local.get 112
                          i32.add
                          local.set 113
                          local.get 113
                          local.set 114
                          i32.const 4
                          local.set 115
                          local.get 114
                          local.get 115
                          i32.add
                          local.set 116
                          local.get 5
                          local.get 116
                          i32.store offset=204
                          i32.const 3
                          local.set 117
                          local.get 116
                          local.get 117
                          i32.and
                          local.set 118
                          local.get 118
                          i32.eqz
                          br_if 1 (;@9;)
                          br 2 (;@8;)
                        end
                        i32.const 4
                        local.set 119
                        i32.const 1048888
                        local.set 120
                        local.get 119
                        local.get 94
                        local.get 120
                        call $_ZN4core9panicking36panic_misaligned_pointer_dereference17h5f995884aa2fdf9dE
                        unreachable
                      end
                      local.get 116
                      i32.load
                      local.set 121
                      local.get 5
                      local.get 121
                      i32.store offset=128
                      i32.const 44
                      local.set 122
                      local.get 5
                      local.get 122
                      i32.add
                      local.set 123
                      local.get 123
                      local.set 124
                      local.get 124
                      call $_ZN4core5alloc6layout6Layout4size17he05cad0a1f23e699E
                      local.set 125
                      local.get 125
                      i32.eqz
                      br_if 7 (;@1;)
                      br 1 (;@7;)
                    end
                    i32.const 4
                    local.set 126
                    i32.const 1048888
                    local.set 127
                    local.get 126
                    local.get 116
                    local.get 127
                    call $_ZN4core9panicking36panic_misaligned_pointer_dereference17h5f995884aa2fdf9dE
                    unreachable
                  end
                  local.get 5
                  i32.load offset=52
                  local.set 128
                  local.get 5
                  local.get 128
                  i32.store offset=184
                  local.get 5
                  i32.load offset=44
                  local.set 129
                  local.get 5
                  i32.load offset=48
                  local.set 130
                  local.get 128
                  local.get 129
                  local.get 130
                  call $_ZN5alloc5alloc7dealloc17hd8ea480b7f37c390E
                  br 5 (;@1;)
                end
                local.get 5
                local.get 99
                i32.store offset=156
                local.get 5
                local.get 101
                i32.store offset=160
                local.get 99
                local.get 101
                i32.add
                local.set 131
                local.get 5
                local.get 131
                i32.store offset=140
                local.get 98
                i32.load
                local.set 132
                local.get 132
                call $_ZN3foo4wasi7io0_2_14poll8Pollable6handle17haed124584d1e3719E
                local.set 133
                local.get 5
                local.get 131
                i32.store offset=148
                i32.const 0
                local.set 134
                local.get 5
                local.get 134
                i32.store offset=152
                local.get 5
                local.get 131
                i32.store offset=200
                i32.const 3
                local.set 135
                local.get 131
                local.get 135
                i32.and
                local.set 136
                local.get 136
                i32.eqz
                br_if 1 (;@4;)
                br 3 (;@2;)
              end
              i32.const 1048888
              local.set 137
              local.get 137
              call $_ZN4core9panicking11panic_const24panic_const_mul_overflow17hce9c6f2692bf60a5E
              unreachable
            end
            local.get 131
            local.get 133
            i32.store
            br 0 (;@3;)
          end
        end
        i32.const 4
        local.set 138
        i32.const 1048888
        local.set 139
        local.get 138
        local.get 131
        local.get 139
        call $_ZN4core9panicking36panic_misaligned_pointer_dereference17h5f995884aa2fdf9dE
        unreachable
      end
      local.get 5
      local.get 107
      i32.store offset=180
      local.get 0
      local.get 107
      local.get 121
      local.get 121
      call $_ZN5alloc3vec12Vec$LT$T$GT$14from_raw_parts17h036479d766291ac5E
      i32.const 224
      local.set 140
      local.get 5
      local.get 140
      i32.add
      local.set 141
      local.get 141
      global.set $__stack_pointer
      return
    )
    (func $_ZN4core3num23_$LT$impl$u20$usize$GT$13unchecked_mul18precondition_check17h56948a27c136cd40E (;24;) (type 1) (param i32 i32)
      (local i32 i32 i32 i64 i64 i64 i64 i64 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 16
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      global.set $__stack_pointer
      local.get 4
      local.get 0
      i32.store
      local.get 4
      local.get 1
      i32.store offset=4
      local.get 1
      i64.extend_i32_u
      local.set 5
      local.get 0
      i64.extend_i32_u
      local.set 6
      local.get 6
      local.get 5
      i64.mul
      local.set 7
      i64.const 32
      local.set 8
      local.get 7
      local.get 8
      i64.shr_u
      local.set 9
      local.get 9
      i32.wrap_i64
      local.set 10
      i32.const 0
      local.set 11
      local.get 10
      local.get 11
      i32.ne
      local.set 12
      local.get 7
      i32.wrap_i64
      local.set 13
      local.get 4
      local.get 13
      i32.store offset=8
      i32.const 1
      local.set 14
      local.get 12
      local.get 14
      i32.and
      local.set 15
      local.get 4
      local.get 15
      i32.store8 offset=15
      i32.const 1
      local.set 16
      local.get 12
      local.get 16
      i32.and
      local.set 17
      block ;; label = @1
        local.get 17
        br_if 0 (;@1;)
        i32.const 16
        local.set 18
        local.get 4
        local.get 18
        i32.add
        local.set 19
        local.get 19
        global.set $__stack_pointer
        return
      end
      i32.const 1048904
      local.set 20
      i32.const 69
      local.set 21
      local.get 20
      local.get 21
      call $_ZN4core9panicking14panic_nounwind17hb10ad53603be5a05E
      unreachable
    )
    (func $_ZN4core4sync6atomic9AtomicU323new17h383032b5a63cc73bE (;25;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      local.get 0
      i32.store offset=12
      local.get 3
      local.get 0
      i32.store offset=8
      local.get 3
      i32.load offset=8
      local.set 4
      local.get 4
      return
    )
    (func $_ZN4core4sync6atomic9AtomicU324load17he4f7b3fbb4386bc9E (;26;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 16
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      global.set $__stack_pointer
      local.get 4
      local.get 0
      i32.store offset=4
      local.get 4
      local.get 1
      i32.store8 offset=11
      local.get 4
      local.get 0
      i32.store offset=12
      local.get 0
      local.get 1
      call $_ZN4core4sync6atomic11atomic_load17h1780767172eeb287E
      local.set 5
      i32.const 16
      local.set 6
      local.get 4
      local.get 6
      i32.add
      local.set 7
      local.get 7
      global.set $__stack_pointer
      local.get 5
      return
    )
    (func $_ZN4core3ptr47drop_in_place$LT$alloc..vec..Vec$LT$u32$GT$$GT$17h7fa475e61db2806bE (;27;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=12
      local.get 0
      call $_ZN70_$LT$alloc..vec..Vec$LT$T$C$A$GT$$u20$as$u20$core..ops..drop..Drop$GT$4drop17h28e36ff7398d271fE
      local.get 0
      call $_ZN4core3ptr54drop_in_place$LT$alloc..raw_vec..RawVec$LT$u32$GT$$GT$17h3b12828d553e8dc7E
      i32.const 16
      local.set 4
      local.get 3
      local.get 4
      i32.add
      local.set 5
      local.get 5
      global.set $__stack_pointer
      return
    )
    (func $_ZN70_$LT$alloc..vec..Vec$LT$T$C$A$GT$$u20$as$u20$core..ops..drop..Drop$GT$4drop17h28e36ff7398d271fE (;28;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 32
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      local.get 0
      i32.store offset=12
      local.get 3
      local.get 0
      i32.store offset=16
      local.get 0
      i32.load offset=4
      local.set 4
      local.get 3
      local.get 4
      i32.store offset=20
      local.get 3
      local.get 4
      i32.store offset=24
      local.get 0
      i32.load offset=8
      local.set 5
      local.get 3
      local.get 5
      i32.store offset=28
      return
    )
    (func $_ZN4core3ptr54drop_in_place$LT$alloc..raw_vec..RawVec$LT$u32$GT$$GT$17h3b12828d553e8dc7E (;29;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=12
      local.get 0
      call $_ZN77_$LT$alloc..raw_vec..RawVec$LT$T$C$A$GT$$u20$as$u20$core..ops..drop..Drop$GT$4drop17hc72f2020b3e3cba3E
      i32.const 16
      local.set 4
      local.get 3
      local.get 4
      i32.add
      local.set 5
      local.get 5
      global.set $__stack_pointer
      return
    )
    (func $_ZN77_$LT$alloc..raw_vec..RawVec$LT$T$C$A$GT$$u20$as$u20$core..ops..drop..Drop$GT$4drop17hc72f2020b3e3cba3E (;30;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 32
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=16
      i32.const 4
      local.set 4
      local.get 3
      local.get 4
      i32.add
      local.set 5
      local.get 5
      local.set 6
      local.get 6
      local.get 0
      call $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$14current_memory17hd292a2728c49a72aE
      local.get 3
      i32.load offset=8
      local.set 7
      i32.const 0
      local.set 8
      i32.const 1
      local.set 9
      local.get 9
      local.get 8
      local.get 7
      select
      local.set 10
      i32.const 1
      local.set 11
      local.get 10
      local.set 12
      local.get 11
      local.set 13
      local.get 12
      local.get 13
      i32.eq
      local.set 14
      i32.const 1
      local.set 15
      local.get 14
      local.get 15
      i32.and
      local.set 16
      block ;; label = @1
        local.get 16
        i32.eqz
        br_if 0 (;@1;)
        local.get 3
        i32.load offset=4
        local.set 17
        local.get 3
        local.get 17
        i32.store offset=20
        local.get 3
        i32.load offset=8
        local.set 18
        local.get 3
        i32.load offset=12
        local.set 19
        local.get 3
        local.get 18
        i32.store offset=24
        local.get 3
        local.get 19
        i32.store offset=28
        i32.const 8
        local.set 20
        local.get 0
        local.get 20
        i32.add
        local.set 21
        local.get 21
        local.get 17
        local.get 18
        local.get 19
        call $_ZN63_$LT$alloc..alloc..Global$u20$as$u20$core..alloc..Allocator$GT$10deallocate17h5d68900c1a23340cE
      end
      i32.const 32
      local.set 22
      local.get 3
      local.get 22
      i32.add
      local.set 23
      local.get 23
      global.set $__stack_pointer
      return
    )
    (func $_ZN4core3ptr55drop_in_place$LT$foo..wasi..io0_2_0..poll..Pollable$GT$17h2fbd6052fe5e6cc9E (;31;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=12
      local.get 0
      call $_ZN4core3ptr81drop_in_place$LT$foo.._rt..Resource$LT$foo..wasi..io0_2_0..poll..Pollable$GT$$GT$17h0bcf1afe1fe42014E
      i32.const 16
      local.set 4
      local.get 3
      local.get 4
      i32.add
      local.set 5
      local.get 5
      global.set $__stack_pointer
      return
    )
    (func $_ZN4core3ptr81drop_in_place$LT$foo.._rt..Resource$LT$foo..wasi..io0_2_0..poll..Pollable$GT$$GT$17h0bcf1afe1fe42014E (;32;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=12
      local.get 0
      call $_ZN69_$LT$foo.._rt..Resource$LT$T$GT$$u20$as$u20$core..ops..drop..Drop$GT$4drop17h5c2971b8851c1011E
      i32.const 16
      local.set 4
      local.get 3
      local.get 4
      i32.add
      local.set 5
      local.get 5
      global.set $__stack_pointer
      return
    )
    (func $_ZN4core3ptr55drop_in_place$LT$foo..wasi..io0_2_1..poll..Pollable$GT$17h828d040ace07ca79E (;33;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=12
      local.get 0
      call $_ZN4core3ptr81drop_in_place$LT$foo.._rt..Resource$LT$foo..wasi..io0_2_1..poll..Pollable$GT$$GT$17h4c4aec02da60721eE
      i32.const 16
      local.set 4
      local.get 3
      local.get 4
      i32.add
      local.set 5
      local.get 5
      global.set $__stack_pointer
      return
    )
    (func $_ZN4core3ptr81drop_in_place$LT$foo.._rt..Resource$LT$foo..wasi..io0_2_1..poll..Pollable$GT$$GT$17h4c4aec02da60721eE (;34;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=12
      local.get 0
      call $_ZN69_$LT$foo.._rt..Resource$LT$T$GT$$u20$as$u20$core..ops..drop..Drop$GT$4drop17hcc9666704bdca7d8E
      i32.const 16
      local.set 4
      local.get 3
      local.get 4
      i32.add
      local.set 5
      local.get 5
      global.set $__stack_pointer
      return
    )
    (func $_ZN69_$LT$foo.._rt..Resource$LT$T$GT$$u20$as$u20$core..ops..drop..Drop$GT$4drop17h5c2971b8851c1011E (;35;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=8
      i32.const 0
      local.set 4
      local.get 3
      local.get 4
      i32.store8 offset=7
      local.get 3
      i32.load8_u offset=7
      local.set 5
      local.get 0
      local.get 5
      call $_ZN4core4sync6atomic9AtomicU324load17he4f7b3fbb4386bc9E
      local.set 6
      local.get 3
      local.get 6
      i32.store offset=12
      i32.const -1
      local.set 7
      local.get 6
      local.set 8
      local.get 7
      local.set 9
      local.get 8
      local.get 9
      i32.eq
      local.set 10
      i32.const 1
      local.set 11
      local.get 10
      local.get 11
      i32.and
      local.set 12
      block ;; label = @1
        local.get 12
        br_if 0 (;@1;)
        local.get 6
        call $_ZN77_$LT$foo..wasi..io0_2_0..poll..Pollable$u20$as$u20$foo.._rt..WasmResource$GT$4drop17h9eb9359c17eecfa9E
      end
      i32.const 16
      local.set 13
      local.get 3
      local.get 13
      i32.add
      local.set 14
      local.get 14
      global.set $__stack_pointer
      return
    )
    (func $_ZN69_$LT$foo.._rt..Resource$LT$T$GT$$u20$as$u20$core..ops..drop..Drop$GT$4drop17hcc9666704bdca7d8E (;36;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=8
      i32.const 0
      local.set 4
      local.get 3
      local.get 4
      i32.store8 offset=7
      local.get 3
      i32.load8_u offset=7
      local.set 5
      local.get 0
      local.get 5
      call $_ZN4core4sync6atomic9AtomicU324load17he4f7b3fbb4386bc9E
      local.set 6
      local.get 3
      local.get 6
      i32.store offset=12
      i32.const -1
      local.set 7
      local.get 6
      local.set 8
      local.get 7
      local.set 9
      local.get 8
      local.get 9
      i32.eq
      local.set 10
      i32.const 1
      local.set 11
      local.get 10
      local.get 11
      i32.and
      local.set 12
      block ;; label = @1
        local.get 12
        br_if 0 (;@1;)
        local.get 6
        call $_ZN77_$LT$foo..wasi..io0_2_1..poll..Pollable$u20$as$u20$foo.._rt..WasmResource$GT$4drop17h69fb5e0b57ffac5cE
      end
      i32.const 16
      local.set 13
      local.get 3
      local.get 13
      i32.add
      local.set 14
      local.get 14
      global.set $__stack_pointer
      return
    )
    (func $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$14current_memory17hd292a2728c49a72aE (;37;) (type 1) (param i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 48
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      global.set $__stack_pointer
      local.get 4
      local.get 1
      i32.store offset=12
      local.get 1
      i32.load
      local.set 5
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 5
              br_if 0 (;@4;)
              br 1 (;@3;)
            end
            i32.const 4
            local.set 6
            local.get 4
            local.get 6
            i32.store offset=16
            i32.const 4
            local.set 7
            local.get 4
            local.get 7
            i32.store offset=20
            local.get 1
            i32.load
            local.set 8
            local.get 4
            local.get 8
            i32.store offset=24
            br 1 (;@2;)
          end
          i32.const 0
          local.set 9
          local.get 0
          local.get 9
          i32.store offset=4
          br 1 (;@1;)
        end
        i32.const 4
        local.set 10
        local.get 10
        local.get 8
        call $_ZN4core3num23_$LT$impl$u20$usize$GT$13unchecked_mul18precondition_check17h56948a27c136cd40E
        i32.const 2
        local.set 11
        local.get 8
        local.get 11
        i32.shl
        local.set 12
        local.get 4
        local.get 12
        i32.store offset=28
        i32.const 4
        local.set 13
        local.get 4
        local.get 13
        i32.store offset=32
        local.get 4
        local.get 12
        i32.store offset=36
        local.get 1
        i32.load offset=4
        local.set 14
        local.get 4
        local.get 14
        i32.store offset=40
        local.get 4
        local.get 14
        i32.store offset=44
        local.get 4
        local.get 14
        i32.store
        i32.const 4
        local.set 15
        local.get 4
        local.get 15
        i32.store offset=4
        local.get 4
        local.get 12
        i32.store offset=8
        local.get 4
        i64.load align=4
        local.set 16
        local.get 0
        local.get 16
        i64.store align=4
        i32.const 8
        local.set 17
        local.get 0
        local.get 17
        i32.add
        local.set 18
        local.get 4
        local.get 17
        i32.add
        local.set 19
        local.get 19
        i32.load
        local.set 20
        local.get 18
        local.get 20
        i32.store
      end
      i32.const 48
      local.set 21
      local.get 4
      local.get 21
      i32.add
      local.set 22
      local.get 22
      global.set $__stack_pointer
      return
    )
    (func $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$17from_raw_parts_in17he556a73efc9274a1E (;38;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 3
      i32.const 16
      local.set 4
      local.get 3
      local.get 4
      i32.sub
      local.set 5
      local.get 5
      global.set $__stack_pointer
      local.get 5
      local.get 1
      i32.store offset=4
      local.get 5
      local.get 2
      i32.store offset=8
      local.get 5
      local.get 2
      i32.store
      local.get 1
      call $_ZN4core3ptr8non_null16NonNull$LT$T$GT$13new_unchecked18precondition_check17h08ada58691ee7098E
      local.get 5
      i32.load
      local.set 6
      local.get 0
      local.get 1
      i32.store offset=4
      local.get 0
      local.get 6
      i32.store
      i32.const 16
      local.set 7
      local.get 5
      local.get 7
      i32.add
      local.set 8
      local.get 8
      global.set $__stack_pointer
      return
    )
    (func $_ZN4core4iter6traits8iterator8Iterator9enumerate17h6c445d524df70b48E (;39;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 3
      i32.const 16
      local.set 4
      local.get 3
      local.get 4
      i32.sub
      local.set 5
      local.get 5
      local.get 1
      i32.store offset=8
      local.get 5
      local.get 2
      i32.store offset=12
      local.get 0
      local.get 1
      i32.store
      local.get 0
      local.get 2
      i32.store offset=4
      i32.const 0
      local.set 6
      local.get 0
      local.get 6
      i32.store offset=8
      return
    )
    (func $_ZN4core4iter6traits8iterator8Iterator9enumerate17h6d23f06829a56d52E (;40;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 3
      i32.const 16
      local.set 4
      local.get 3
      local.get 4
      i32.sub
      local.set 5
      local.get 5
      local.get 1
      i32.store offset=8
      local.get 5
      local.get 2
      i32.store offset=12
      local.get 0
      local.get 1
      i32.store
      local.get 0
      local.get 2
      i32.store offset=4
      i32.const 0
      local.set 6
      local.get 0
      local.get 6
      i32.store offset=8
      return
    )
    (func $_ZN91_$LT$core..slice..iter..Iter$LT$T$GT$$u20$as$u20$core..iter..traits..iterator..Iterator$GT$4next17h13711ccf26117d8eE (;41;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 80
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      local.get 0
      i32.store offset=28
      i32.const 4
      local.set 4
      local.get 0
      local.get 4
      i32.add
      local.set 5
      local.get 3
      local.get 5
      i32.store offset=32
      local.get 0
      i32.load offset=4
      local.set 6
      local.get 3
      local.get 6
      i32.store offset=20
      local.get 3
      local.get 0
      i32.store offset=36
      i32.const 20
      local.set 7
      local.get 3
      local.get 7
      i32.add
      local.set 8
      local.get 8
      local.set 9
      local.get 3
      local.get 9
      i32.store offset=40
      local.get 0
      i32.load
      local.set 10
      local.get 3
      local.get 10
      i32.store offset=44
      local.get 3
      i32.load offset=20
      local.set 11
      local.get 10
      local.set 12
      local.get 11
      local.set 13
      local.get 12
      local.get 13
      i32.eq
      local.set 14
      i32.const 1
      local.set 15
      local.get 14
      local.get 15
      i32.and
      local.set 16
      local.get 3
      local.get 16
      i32.store8 offset=19
      local.get 3
      i32.load8_u offset=19
      local.set 17
      i32.const 1
      local.set 18
      local.get 17
      local.get 18
      i32.and
      local.set 19
      block ;; label = @1
        block ;; label = @2
          local.get 19
          br_if 0 (;@2;)
          local.get 3
          local.get 0
          i32.store offset=56
          i32.const 1
          local.set 20
          local.get 3
          local.get 20
          i32.store offset=60
          local.get 0
          i32.load
          local.set 21
          local.get 3
          local.get 21
          i32.store offset=64
          i32.const 4
          local.set 22
          local.get 0
          local.get 22
          i32.add
          local.set 23
          local.get 3
          local.get 23
          i32.store offset=68
          local.get 3
          local.get 23
          i32.store offset=72
          local.get 0
          i32.load
          local.set 24
          local.get 3
          local.get 24
          i32.store offset=76
          i32.const 4
          local.set 25
          local.get 24
          local.get 25
          i32.add
          local.set 26
          local.get 0
          local.get 26
          i32.store
          local.get 3
          local.get 21
          i32.store offset=24
          i32.const 24
          local.set 27
          local.get 3
          local.get 27
          i32.add
          local.set 28
          local.get 28
          local.set 29
          local.get 3
          local.get 29
          i32.store offset=48
          local.get 3
          i32.load offset=24
          local.set 30
          local.get 3
          local.get 30
          i32.store offset=52
          local.get 3
          local.get 30
          i32.store offset=12
          br 1 (;@1;)
        end
        i32.const 0
        local.set 31
        local.get 3
        local.get 31
        i32.store offset=12
      end
      local.get 3
      i32.load offset=12
      local.set 32
      local.get 32
      return
    )
    (func $_ZN91_$LT$core..slice..iter..Iter$LT$T$GT$$u20$as$u20$core..iter..traits..iterator..Iterator$GT$4next17he616b31c9c922576E (;42;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 80
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      local.get 0
      i32.store offset=28
      i32.const 4
      local.set 4
      local.get 0
      local.get 4
      i32.add
      local.set 5
      local.get 3
      local.get 5
      i32.store offset=32
      local.get 0
      i32.load offset=4
      local.set 6
      local.get 3
      local.get 6
      i32.store offset=20
      local.get 3
      local.get 0
      i32.store offset=36
      i32.const 20
      local.set 7
      local.get 3
      local.get 7
      i32.add
      local.set 8
      local.get 8
      local.set 9
      local.get 3
      local.get 9
      i32.store offset=40
      local.get 0
      i32.load
      local.set 10
      local.get 3
      local.get 10
      i32.store offset=44
      local.get 3
      i32.load offset=20
      local.set 11
      local.get 10
      local.set 12
      local.get 11
      local.set 13
      local.get 12
      local.get 13
      i32.eq
      local.set 14
      i32.const 1
      local.set 15
      local.get 14
      local.get 15
      i32.and
      local.set 16
      local.get 3
      local.get 16
      i32.store8 offset=19
      local.get 3
      i32.load8_u offset=19
      local.set 17
      i32.const 1
      local.set 18
      local.get 17
      local.get 18
      i32.and
      local.set 19
      block ;; label = @1
        block ;; label = @2
          local.get 19
          br_if 0 (;@2;)
          local.get 3
          local.get 0
          i32.store offset=56
          i32.const 1
          local.set 20
          local.get 3
          local.get 20
          i32.store offset=60
          local.get 0
          i32.load
          local.set 21
          local.get 3
          local.get 21
          i32.store offset=64
          i32.const 4
          local.set 22
          local.get 0
          local.get 22
          i32.add
          local.set 23
          local.get 3
          local.get 23
          i32.store offset=68
          local.get 3
          local.get 23
          i32.store offset=72
          local.get 0
          i32.load
          local.set 24
          local.get 3
          local.get 24
          i32.store offset=76
          i32.const 4
          local.set 25
          local.get 24
          local.get 25
          i32.add
          local.set 26
          local.get 0
          local.get 26
          i32.store
          local.get 3
          local.get 21
          i32.store offset=24
          i32.const 24
          local.set 27
          local.get 3
          local.get 27
          i32.add
          local.set 28
          local.get 28
          local.set 29
          local.get 3
          local.get 29
          i32.store offset=48
          local.get 3
          i32.load offset=24
          local.set 30
          local.get 3
          local.get 30
          i32.store offset=52
          local.get 3
          local.get 30
          i32.store offset=12
          br 1 (;@1;)
        end
        i32.const 0
        local.set 31
        local.get 3
        local.get 31
        i32.store offset=12
      end
      local.get 3
      i32.load offset=12
      local.set 32
      local.get 32
      return
    )
    (func $_ZN3foo3_rt17Resource$LT$T$GT$11from_handle17ha7d938c7f4a0175cE (;43;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=8
      i32.const -1
      local.set 4
      local.get 0
      local.set 5
      local.get 4
      local.set 6
      local.get 5
      local.get 6
      i32.ne
      local.set 7
      i32.const 1
      local.set 8
      local.get 7
      local.get 8
      i32.and
      local.set 9
      block ;; label = @1
        local.get 9
        br_if 0 (;@1;)
        i32.const 1048973
        local.set 10
        i32.const 36
        local.set 11
        i32.const 1049020
        local.set 12
        local.get 10
        local.get 11
        local.get 12
        call $_ZN4core9panicking5panic17h9f2e0421338a58efE
        unreachable
      end
      local.get 0
      call $_ZN4core4sync6atomic9AtomicU323new17h383032b5a63cc73bE
      local.set 13
      local.get 3
      local.get 13
      i32.store offset=12
      local.get 3
      i32.load offset=12
      local.set 14
      local.get 3
      local.get 14
      i32.store offset=4
      local.get 3
      i32.load offset=4
      local.set 15
      local.get 3
      local.get 15
      i32.store
      local.get 3
      i32.load
      local.set 16
      i32.const 16
      local.set 17
      local.get 3
      local.get 17
      i32.add
      local.set 18
      local.get 18
      global.set $__stack_pointer
      local.get 16
      return
    )
    (func $_ZN3foo3_rt17Resource$LT$T$GT$11from_handle17hd96979ca4db4b1e3E (;44;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=8
      i32.const -1
      local.set 4
      local.get 0
      local.set 5
      local.get 4
      local.set 6
      local.get 5
      local.get 6
      i32.ne
      local.set 7
      i32.const 1
      local.set 8
      local.get 7
      local.get 8
      i32.and
      local.set 9
      block ;; label = @1
        local.get 9
        br_if 0 (;@1;)
        i32.const 1048973
        local.set 10
        i32.const 36
        local.set 11
        i32.const 1049020
        local.set 12
        local.get 10
        local.get 11
        local.get 12
        call $_ZN4core9panicking5panic17h9f2e0421338a58efE
        unreachable
      end
      local.get 0
      call $_ZN4core4sync6atomic9AtomicU323new17h383032b5a63cc73bE
      local.set 13
      local.get 3
      local.get 13
      i32.store offset=12
      local.get 3
      i32.load offset=12
      local.set 14
      local.get 3
      local.get 14
      i32.store offset=4
      local.get 3
      i32.load offset=4
      local.set 15
      local.get 3
      local.get 15
      i32.store
      local.get 3
      i32.load
      local.set 16
      i32.const 16
      local.set 17
      local.get 3
      local.get 17
      i32.add
      local.set 18
      local.get 18
      global.set $__stack_pointer
      local.get 16
      return
    )
    (func $_ZN3foo3_rt17Resource$LT$T$GT$6handle17h8cc6af1b1fd76c33E (;45;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=12
      i32.const 0
      local.set 4
      local.get 3
      local.get 4
      i32.store8 offset=11
      local.get 3
      i32.load8_u offset=11
      local.set 5
      local.get 0
      local.get 5
      call $_ZN4core4sync6atomic9AtomicU324load17he4f7b3fbb4386bc9E
      local.set 6
      i32.const 16
      local.set 7
      local.get 3
      local.get 7
      i32.add
      local.set 8
      local.get 8
      global.set $__stack_pointer
      local.get 6
      return
    )
    (func $_ZN3foo3_rt17Resource$LT$T$GT$6handle17ha14cee480a55db6eE (;46;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=12
      i32.const 0
      local.set 4
      local.get 3
      local.get 4
      i32.store8 offset=11
      local.get 3
      i32.load8_u offset=11
      local.set 5
      local.get 0
      local.get 5
      call $_ZN4core4sync6atomic9AtomicU324load17he4f7b3fbb4386bc9E
      local.set 6
      i32.const 16
      local.set 7
      local.get 3
      local.get 7
      i32.add
      local.set 8
      local.get 8
      global.set $__stack_pointer
      local.get 6
      return
    )
    (func $_ZN3foo3_rt6as_i6417h101ab03d01dbe45dE (;47;) (type 9) (param i64) (result i64)
      (local i32 i32 i32 i64 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i64.store offset=8
      local.get 0
      call $_ZN39_$LT$u64$u20$as$u20$foo.._rt..AsI64$GT$6as_i6417hd66b914efece11f4E
      local.set 4
      i32.const 16
      local.set 5
      local.get 3
      local.get 5
      i32.add
      local.set 6
      local.get 6
      global.set $__stack_pointer
      local.get 4
      return
    )
    (func $_ZN4core4sync6atomic11atomic_load17h1780767172eeb287E (;48;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 80
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      global.set $__stack_pointer
      i32.const 1049088
      local.set 5
      local.get 4
      local.get 5
      i32.store offset=12
      i32.const 1049136
      local.set 6
      local.get 4
      local.get 6
      i32.store offset=16
      local.get 4
      local.get 1
      i32.store8 offset=23
      local.get 4
      local.get 0
      i32.store offset=76
      local.get 4
      i32.load8_u offset=23
      local.set 7
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 7
                  br_table 0 (;@6;) 1 (;@5;) 2 (;@4;) 3 (;@3;) 4 (;@2;) 0 (;@6;)
                end
                local.get 0
                i32.load
                local.set 8
                local.get 4
                local.get 8
                i32.store offset=24
                br 4 (;@1;)
              end
              i32.const 1049136
              local.set 9
              local.get 4
              local.get 9
              i32.store offset=28
              i32.const 1
              local.set 10
              local.get 4
              local.get 10
              i32.store offset=32
              i32.const 0
              local.set 11
              local.get 11
              i32.load offset=1049144
              local.set 12
              i32.const 0
              local.set 13
              local.get 13
              i32.load offset=1049148
              local.set 14
              local.get 4
              local.get 12
              i32.store offset=44
              local.get 4
              local.get 14
              i32.store offset=48
              i32.const 4
              local.set 15
              local.get 4
              local.get 15
              i32.store offset=36
              i32.const 0
              local.set 16
              local.get 4
              local.get 16
              i32.store offset=40
              i32.const 28
              local.set 17
              local.get 4
              local.get 17
              i32.add
              local.set 18
              local.get 18
              local.set 19
              i32.const 1049232
              local.set 20
              local.get 19
              local.get 20
              call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
              unreachable
            end
            local.get 0
            i32.load
            local.set 21
            local.get 4
            local.get 21
            i32.store offset=24
            br 2 (;@1;)
          end
          i32.const 1049088
          local.set 22
          local.get 4
          local.get 22
          i32.store offset=52
          i32.const 1
          local.set 23
          local.get 4
          local.get 23
          i32.store offset=56
          i32.const 0
          local.set 24
          local.get 24
          i32.load offset=1049144
          local.set 25
          i32.const 0
          local.set 26
          local.get 26
          i32.load offset=1049148
          local.set 27
          local.get 4
          local.get 25
          i32.store offset=68
          local.get 4
          local.get 27
          i32.store offset=72
          i32.const 4
          local.set 28
          local.get 4
          local.get 28
          i32.store offset=60
          i32.const 0
          local.set 29
          local.get 4
          local.get 29
          i32.store offset=64
          i32.const 52
          local.set 30
          local.get 4
          local.get 30
          i32.add
          local.set 31
          local.get 31
          local.set 32
          i32.const 1049248
          local.set 33
          local.get 32
          local.get 33
          call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
          unreachable
        end
        local.get 0
        i32.load
        local.set 34
        local.get 4
        local.get 34
        i32.store offset=24
      end
      local.get 4
      i32.load offset=24
      local.set 35
      i32.const 80
      local.set 36
      local.get 4
      local.get 36
      i32.add
      local.set 37
      local.get 37
      global.set $__stack_pointer
      local.get 35
      return
      unreachable
    )
    (func $_ZN42_$LT$foo..MyTest$u20$as$u20$foo..Guest$GT$4test17h99345eeeb75cb110E (;49;) (type 7)
      (local i32 i32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 0
      i32.const 48
      local.set 1
      local.get 0
      local.get 1
      i32.sub
      local.set 2
      local.get 2
      global.set $__stack_pointer
      i64.const 10000000
      local.set 3
      local.get 3
      call $_ZN3foo4wasi11clocks0_2_015monotonic_clock18subscribe_duration17h425c70592c71d849E
      local.set 4
      local.get 2
      local.get 4
      i32.store offset=40
      local.get 2
      i32.load offset=40
      local.set 5
      local.get 2
      local.get 5
      i32.store offset=16
      i32.const 16
      local.set 6
      local.get 2
      local.get 6
      i32.add
      local.set 7
      local.get 7
      local.set 8
      local.get 2
      local.get 8
      i32.store offset=12
      local.get 2
      local.set 9
      i32.const 12
      local.set 10
      local.get 2
      local.get 10
      i32.add
      local.set 11
      local.get 11
      local.set 12
      i32.const 1
      local.set 13
      local.get 9
      local.get 12
      local.get 13
      call $_ZN3foo4wasi7io0_2_04poll4poll17hfa86e367c444a37eE
      local.get 2
      local.set 14
      local.get 14
      call $_ZN4core3ptr47drop_in_place$LT$alloc..vec..Vec$LT$u32$GT$$GT$17h7fa475e61db2806bE
      i32.const 16
      local.set 15
      local.get 2
      local.get 15
      i32.add
      local.set 16
      local.get 16
      local.set 17
      local.get 17
      call $_ZN4core3ptr55drop_in_place$LT$foo..wasi..io0_2_0..poll..Pollable$GT$17h2fbd6052fe5e6cc9E
      i64.const 10000000
      local.set 18
      local.get 18
      call $_ZN3foo4wasi11clocks0_2_115monotonic_clock18subscribe_duration17h9072e0e000642499E
      local.set 19
      local.get 2
      local.get 19
      i32.store offset=44
      local.get 2
      i32.load offset=44
      local.set 20
      local.get 2
      local.get 20
      i32.store offset=36
      i32.const 36
      local.set 21
      local.get 2
      local.get 21
      i32.add
      local.set 22
      local.get 22
      local.set 23
      local.get 2
      local.get 23
      i32.store offset=32
      i32.const 20
      local.set 24
      local.get 2
      local.get 24
      i32.add
      local.set 25
      local.get 25
      local.set 26
      i32.const 32
      local.set 27
      local.get 2
      local.get 27
      i32.add
      local.set 28
      local.get 28
      local.set 29
      i32.const 1
      local.set 30
      local.get 26
      local.get 29
      local.get 30
      call $_ZN3foo4wasi7io0_2_14poll4poll17haa888ab780ca6d57E
      i32.const 20
      local.set 31
      local.get 2
      local.get 31
      i32.add
      local.set 32
      local.get 32
      local.set 33
      local.get 33
      call $_ZN4core3ptr47drop_in_place$LT$alloc..vec..Vec$LT$u32$GT$$GT$17h7fa475e61db2806bE
      i32.const 36
      local.set 34
      local.get 2
      local.get 34
      i32.add
      local.set 35
      local.get 35
      local.set 36
      local.get 36
      call $_ZN4core3ptr55drop_in_place$LT$foo..wasi..io0_2_1..poll..Pollable$GT$17h828d040ace07ca79E
      i32.const 48
      local.set 37
      local.get 2
      local.get 37
      i32.add
      local.set 38
      local.get 38
      global.set $__stack_pointer
      return
    )
    (func $test (;50;) (type 7)
      call $_ZN3foo17_export_test_cabi17ha5a06f7ed936f2afE
      return
    )
    (func $_ZN3foo17_export_test_cabi17ha5a06f7ed936f2afE (;51;) (type 7)
      call $_ZN3foo3_rt14run_ctors_once17h59a0cc5eab5dc0feE
      call $_ZN42_$LT$foo..MyTest$u20$as$u20$foo..Guest$GT$4test17h99345eeeb75cb110E
      return
    )
    (func $_ZN5alloc3vec12Vec$LT$T$GT$14from_raw_parts17h036479d766291ac5E (;52;) (type 10) (param i32 i32 i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 4
      i32.const 32
      local.set 5
      local.get 4
      local.get 5
      i32.sub
      local.set 6
      local.get 6
      global.set $__stack_pointer
      local.get 6
      local.get 1
      i32.store offset=20
      local.get 6
      local.get 2
      i32.store offset=24
      local.get 6
      local.get 3
      i32.store offset=28
      i32.const 8
      local.set 7
      local.get 6
      local.get 7
      i32.add
      local.set 8
      local.get 8
      local.get 1
      local.get 3
      call $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$17from_raw_parts_in17he556a73efc9274a1E
      local.get 6
      i32.load offset=12
      local.set 9
      local.get 6
      i32.load offset=8
      local.set 10
      local.get 0
      local.get 10
      i32.store
      local.get 0
      local.get 9
      i32.store offset=4
      local.get 0
      local.get 2
      i32.store offset=8
      i32.const 32
      local.set 11
      local.get 6
      local.get 11
      i32.add
      local.set 12
      local.get 12
      global.set $__stack_pointer
      return
    )
    (func $_ZN4core5alloc6layout6Layout25from_size_align_unchecked17h62291b53bc389006E (;53;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32)
      global.get $__stack_pointer
      local.set 3
      i32.const 16
      local.set 4
      local.get 3
      local.get 4
      i32.sub
      local.set 5
      local.get 5
      local.get 1
      i32.store offset=8
      local.get 5
      local.get 2
      i32.store offset=12
      local.get 0
      local.get 1
      i32.store offset=4
      local.get 0
      local.get 2
      i32.store
      return
    )
    (func $_ZN4core5alloc6layout6Layout4size17he05cad0a1f23e699E (;54;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      local.get 0
      i32.store offset=12
      local.get 0
      i32.load offset=4
      local.set 4
      local.get 4
      return
    )
    (func $_ZN5alloc5alloc5alloc17he13d52f3f09a1361E (;55;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 32
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      global.set $__stack_pointer
      i32.const 1052649
      local.set 5
      local.get 4
      local.get 5
      i32.store
      local.get 4
      local.get 0
      i32.store offset=4
      local.get 4
      local.get 1
      i32.store offset=8
      i32.const 1052649
      local.set 6
      i32.const 1
      local.set 7
      local.get 6
      local.get 7
      call $_ZN4core3ptr13read_volatile18precondition_check17h2c855c2a4cc02827E
      i32.const 0
      local.set 8
      local.get 8
      i32.load8_u offset=1052649
      local.set 9
      local.get 4
      local.get 9
      i32.store8 offset=19
      i32.const 4
      local.set 10
      local.get 4
      local.get 10
      i32.add
      local.set 11
      local.get 11
      local.set 12
      local.get 4
      local.get 12
      i32.store offset=20
      local.get 4
      i32.load offset=8
      local.set 13
      i32.const 4
      local.set 14
      local.get 4
      local.get 14
      i32.add
      local.set 15
      local.get 15
      local.set 16
      local.get 4
      local.get 16
      i32.store offset=24
      local.get 4
      i32.load offset=4
      local.set 17
      local.get 4
      local.get 17
      i32.store offset=28
      local.get 4
      local.get 17
      i32.store offset=12
      local.get 4
      i32.load offset=12
      local.set 18
      local.get 13
      local.get 18
      call $__rust_alloc
      local.set 19
      i32.const 32
      local.set 20
      local.get 4
      local.get 20
      i32.add
      local.set 21
      local.get 21
      global.set $__stack_pointer
      local.get 19
      return
    )
    (func $_ZN5alloc5alloc7dealloc17hd8ea480b7f37c390E (;56;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 3
      i32.const 32
      local.set 4
      local.get 3
      local.get 4
      i32.sub
      local.set 5
      local.get 5
      global.set $__stack_pointer
      local.get 5
      local.get 1
      i32.store offset=4
      local.get 5
      local.get 2
      i32.store offset=8
      local.get 5
      local.get 0
      i32.store offset=16
      i32.const 4
      local.set 6
      local.get 5
      local.get 6
      i32.add
      local.set 7
      local.get 7
      local.set 8
      local.get 5
      local.get 8
      i32.store offset=20
      local.get 5
      i32.load offset=8
      local.set 9
      i32.const 4
      local.set 10
      local.get 5
      local.get 10
      i32.add
      local.set 11
      local.get 11
      local.set 12
      local.get 5
      local.get 12
      i32.store offset=24
      local.get 5
      i32.load offset=4
      local.set 13
      local.get 5
      local.get 13
      i32.store offset=28
      local.get 5
      local.get 13
      i32.store offset=12
      local.get 5
      i32.load offset=12
      local.set 14
      local.get 0
      local.get 9
      local.get 14
      call $__rust_dealloc
      i32.const 32
      local.set 15
      local.get 5
      local.get 15
      i32.add
      local.set 16
      local.get 16
      global.set $__stack_pointer
      return
    )
    (func $_ZN63_$LT$alloc..alloc..Global$u20$as$u20$core..alloc..Allocator$GT$10deallocate17h5d68900c1a23340cE (;57;) (type 10) (param i32 i32 i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 4
      i32.const 48
      local.set 5
      local.get 4
      local.get 5
      i32.sub
      local.set 6
      local.get 6
      global.set $__stack_pointer
      local.get 6
      local.get 2
      i32.store
      local.get 6
      local.get 3
      i32.store offset=4
      local.get 6
      local.get 0
      i32.store offset=20
      local.get 6
      local.get 1
      i32.store offset=24
      local.get 6
      local.set 7
      local.get 6
      local.get 7
      i32.store offset=28
      local.get 6
      i32.load offset=4
      local.set 8
      block ;; label = @1
        local.get 8
        i32.eqz
        br_if 0 (;@1;)
        local.get 6
        local.get 1
        i32.store offset=32
        local.get 6
        i32.load
        local.set 9
        local.get 6
        i32.load offset=4
        local.set 10
        local.get 6
        local.get 9
        i32.store offset=8
        local.get 6
        local.get 10
        i32.store offset=12
        i32.const 8
        local.set 11
        local.get 6
        local.get 11
        i32.add
        local.set 12
        local.get 12
        local.set 13
        local.get 6
        local.get 13
        i32.store offset=36
        i32.const 8
        local.set 14
        local.get 6
        local.get 14
        i32.add
        local.set 15
        local.get 15
        local.set 16
        local.get 6
        local.get 16
        i32.store offset=40
        local.get 6
        i32.load
        local.set 17
        local.get 6
        local.get 17
        i32.store offset=44
        local.get 6
        local.get 17
        i32.store offset=16
        local.get 6
        i32.load offset=16
        local.set 18
        local.get 1
        local.get 8
        local.get 18
        call $__rust_dealloc
      end
      i32.const 48
      local.set 19
      local.get 6
      local.get 19
      i32.add
      local.set 20
      local.get 20
      global.set $__stack_pointer
      return
    )
    (func $_ZN110_$LT$core..iter..adapters..enumerate..Enumerate$LT$I$GT$$u20$as$u20$core..iter..traits..iterator..Iterator$GT$4next17h8982968a737d6af5E (;58;) (type 1) (param i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 48
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      global.set $__stack_pointer
      local.get 4
      local.get 1
      i32.store offset=32
      local.get 1
      call $_ZN91_$LT$core..slice..iter..Iter$LT$T$GT$$u20$as$u20$core..iter..traits..iterator..Iterator$GT$4next17h13711ccf26117d8eE
      local.set 5
      local.get 4
      local.get 5
      i32.store offset=28
      local.get 4
      i32.load offset=28
      local.set 6
      i32.const 0
      local.set 7
      i32.const 1
      local.set 8
      local.get 8
      local.get 7
      local.get 6
      select
      local.set 9
      block ;; label = @1
        block ;; label = @2
          local.get 9
          br_if 0 (;@2;)
          i32.const 0
          local.set 10
          local.get 4
          local.get 10
          i32.store offset=20
          br 1 (;@1;)
        end
        local.get 4
        i32.load offset=28
        local.set 11
        local.get 4
        local.get 11
        i32.store offset=36
        local.get 4
        local.get 11
        i32.store offset=24
        local.get 4
        i32.load offset=24
        local.set 12
        local.get 4
        local.get 12
        i32.store offset=40
        local.get 1
        i32.load offset=8
        local.set 13
        local.get 4
        local.get 13
        i32.store offset=44
        local.get 1
        i32.load offset=8
        local.set 14
        i32.const 1
        local.set 15
        local.get 14
        local.get 15
        i32.add
        local.set 16
        local.get 16
        i32.eqz
        local.set 17
        i32.const 1
        local.set 18
        local.get 17
        local.get 18
        i32.and
        local.set 19
        block ;; label = @2
          local.get 19
          br_if 0 (;@2;)
          local.get 1
          local.get 16
          i32.store offset=8
          local.get 4
          local.get 13
          i32.store offset=16
          local.get 4
          local.get 12
          i32.store offset=20
          br 1 (;@1;)
        end
        i32.const 1049356
        local.set 20
        local.get 20
        call $_ZN4core9panicking11panic_const24panic_const_add_overflow17h8673594c898eaaa4E
        unreachable
      end
      local.get 4
      i32.load offset=16
      local.set 21
      local.get 4
      i32.load offset=20
      local.set 22
      local.get 0
      local.get 22
      i32.store offset=4
      local.get 0
      local.get 21
      i32.store
      i32.const 48
      local.set 23
      local.get 4
      local.get 23
      i32.add
      local.set 24
      local.get 24
      global.set $__stack_pointer
      return
    )
    (func $_ZN110_$LT$core..iter..adapters..enumerate..Enumerate$LT$I$GT$$u20$as$u20$core..iter..traits..iterator..Iterator$GT$4next17ha8e4a611907dacdfE (;59;) (type 1) (param i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 48
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      global.set $__stack_pointer
      local.get 4
      local.get 1
      i32.store offset=32
      local.get 1
      call $_ZN91_$LT$core..slice..iter..Iter$LT$T$GT$$u20$as$u20$core..iter..traits..iterator..Iterator$GT$4next17he616b31c9c922576E
      local.set 5
      local.get 4
      local.get 5
      i32.store offset=28
      local.get 4
      i32.load offset=28
      local.set 6
      i32.const 0
      local.set 7
      i32.const 1
      local.set 8
      local.get 8
      local.get 7
      local.get 6
      select
      local.set 9
      block ;; label = @1
        block ;; label = @2
          local.get 9
          br_if 0 (;@2;)
          i32.const 0
          local.set 10
          local.get 4
          local.get 10
          i32.store offset=20
          br 1 (;@1;)
        end
        local.get 4
        i32.load offset=28
        local.set 11
        local.get 4
        local.get 11
        i32.store offset=36
        local.get 4
        local.get 11
        i32.store offset=24
        local.get 4
        i32.load offset=24
        local.set 12
        local.get 4
        local.get 12
        i32.store offset=40
        local.get 1
        i32.load offset=8
        local.set 13
        local.get 4
        local.get 13
        i32.store offset=44
        local.get 1
        i32.load offset=8
        local.set 14
        i32.const 1
        local.set 15
        local.get 14
        local.get 15
        i32.add
        local.set 16
        local.get 16
        i32.eqz
        local.set 17
        i32.const 1
        local.set 18
        local.get 17
        local.get 18
        i32.and
        local.set 19
        block ;; label = @2
          local.get 19
          br_if 0 (;@2;)
          local.get 1
          local.get 16
          i32.store offset=8
          local.get 4
          local.get 13
          i32.store offset=16
          local.get 4
          local.get 12
          i32.store offset=20
          br 1 (;@1;)
        end
        i32.const 1049356
        local.set 20
        local.get 20
        call $_ZN4core9panicking11panic_const24panic_const_add_overflow17h8673594c898eaaa4E
        unreachable
      end
      local.get 4
      i32.load offset=16
      local.set 21
      local.get 4
      i32.load offset=20
      local.set 22
      local.get 0
      local.get 22
      i32.store offset=4
      local.get 0
      local.get 21
      i32.store
      i32.const 48
      local.set 23
      local.get 4
      local.get 23
      i32.add
      local.set 24
      local.get 24
      global.set $__stack_pointer
      return
    )
    (func $_ZN63_$LT$I$u20$as$u20$core..iter..traits..collect..IntoIterator$GT$9into_iter17h221c4ea91f43f862E (;60;) (type 1) (param i32 i32)
      (local i64 i32 i32 i32 i32)
      local.get 1
      i64.load align=4
      local.set 2
      local.get 0
      local.get 2
      i64.store align=4
      i32.const 8
      local.set 3
      local.get 0
      local.get 3
      i32.add
      local.set 4
      local.get 1
      local.get 3
      i32.add
      local.set 5
      local.get 5
      i32.load
      local.set 6
      local.get 4
      local.get 6
      i32.store
      return
    )
    (func $_ZN63_$LT$I$u20$as$u20$core..iter..traits..collect..IntoIterator$GT$9into_iter17hc7552c2a1a2ca063E (;61;) (type 1) (param i32 i32)
      (local i64 i32 i32 i32 i32)
      local.get 1
      i64.load align=4
      local.set 2
      local.get 0
      local.get 2
      i64.store align=4
      i32.const 8
      local.set 3
      local.get 0
      local.get 3
      i32.add
      local.set 4
      local.get 1
      local.get 3
      i32.add
      local.set 5
      local.get 5
      i32.load
      local.set 6
      local.get 4
      local.get 6
      i32.store
      return
    )
    (func $_ZN4core3ptr8non_null16NonNull$LT$T$GT$13new_unchecked18precondition_check17h08ada58691ee7098E (;62;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store offset=8
      local.get 3
      local.get 0
      i32.store offset=12
      block ;; label = @1
        local.get 0
        br_if 0 (;@1;)
        i32.const 1049372
        local.set 4
        i32.const 93
        local.set 5
        local.get 4
        local.get 5
        call $_ZN4core9panicking14panic_nounwind17hb10ad53603be5a05E
        unreachable
      end
      i32.const 16
      local.set 6
      local.get 3
      local.get 6
      i32.add
      local.set 7
      local.get 7
      global.set $__stack_pointer
      return
    )
    (func $_ZN39_$LT$u64$u20$as$u20$foo.._rt..AsI64$GT$6as_i6417hd66b914efece11f4E (;63;) (type 9) (param i64) (result i64)
      (local i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      local.get 0
      i64.store offset=8
      local.get 0
      return
    )
    (func $_ZN3foo3_rt14run_ctors_once17h59a0cc5eab5dc0feE (;64;) (type 7)
      call $_ZN14wit_bindgen_rt14run_ctors_once17he9cf8a2a65ea0aa6E
      return
    )
    (func $__rust_alloc (;65;) (type 4) (param i32 i32) (result i32)
      (local i32)
      local.get 0
      local.get 1
      call $__rdl_alloc
      local.set 2
      local.get 2
      return
    )
    (func $__rust_dealloc (;66;) (type 3) (param i32 i32 i32)
      local.get 0
      local.get 1
      local.get 2
      call $__rdl_dealloc
      return
    )
    (func $__rust_realloc (;67;) (type 6) (param i32 i32 i32 i32) (result i32)
      (local i32)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      call $__rdl_realloc
      local.set 4
      local.get 4
      return
    )
    (func $__rust_alloc_error_handler (;68;) (type 1) (param i32 i32)
      local.get 0
      local.get 1
      call $__rg_oom
      return
    )
    (func $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17hfee966ea49c4b9b8E (;69;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 16
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      global.set $__stack_pointer
      local.get 4
      local.get 0
      i32.store offset=8
      local.get 4
      local.get 1
      i32.store offset=12
      local.get 0
      i32.load
      local.set 5
      local.get 5
      local.get 1
      call $_ZN4core3fmt3num52_$LT$impl$u20$core..fmt..Debug$u20$for$u20$usize$GT$3fmt17h2bc83e5753441c39E
      local.set 6
      i32.const 1
      local.set 7
      local.get 6
      local.get 7
      i32.and
      local.set 8
      i32.const 16
      local.set 9
      local.get 4
      local.get 9
      i32.add
      local.set 10
      local.get 10
      global.set $__stack_pointer
      local.get 8
      return
    )
    (func $_ZN4core3fmt3num52_$LT$impl$u20$core..fmt..Debug$u20$for$u20$usize$GT$3fmt17h2bc83e5753441c39E (;70;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 16
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      global.set $__stack_pointer
      local.get 4
      local.get 0
      i32.store offset=8
      local.get 4
      local.get 1
      i32.store offset=12
      local.get 1
      i32.load offset=28
      local.set 5
      i32.const 16
      local.set 6
      local.get 5
      local.get 6
      i32.and
      local.set 7
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                local.get 7
                br_if 0 (;@5;)
                local.get 1
                i32.load offset=28
                local.set 8
                i32.const 32
                local.set 9
                local.get 8
                local.get 9
                i32.and
                local.set 10
                local.get 10
                i32.eqz
                br_if 1 (;@4;)
                br 2 (;@3;)
              end
              local.get 0
              local.get 1
              call $_ZN4core3fmt3num53_$LT$impl$u20$core..fmt..LowerHex$u20$for$u20$i32$GT$3fmt17h1d8520e9e78517c0E
              local.set 11
              i32.const 1
              local.set 12
              local.get 11
              local.get 12
              i32.and
              local.set 13
              local.get 4
              local.get 13
              i32.store8 offset=7
              br 3 (;@1;)
            end
            local.get 0
            local.get 1
            call $_ZN4core3fmt3num3imp52_$LT$impl$u20$core..fmt..Display$u20$for$u20$u32$GT$3fmt17h3b56eb797759e149E
            local.set 14
            i32.const 1
            local.set 15
            local.get 14
            local.get 15
            i32.and
            local.set 16
            local.get 4
            local.get 16
            i32.store8 offset=7
            br 1 (;@2;)
          end
          local.get 0
          local.get 1
          call $_ZN4core3fmt3num53_$LT$impl$u20$core..fmt..UpperHex$u20$for$u20$i32$GT$3fmt17h67634a7447620a5eE
          local.set 17
          i32.const 1
          local.set 18
          local.get 17
          local.get 18
          i32.and
          local.set 19
          local.get 4
          local.get 19
          i32.store8 offset=7
        end
      end
      local.get 4
      i32.load8_u offset=7
      local.set 20
      i32.const 1
      local.set 21
      local.get 20
      local.get 21
      i32.and
      local.set 22
      i32.const 16
      local.set 23
      local.get 4
      local.get 23
      i32.add
      local.set 24
      local.get 24
      global.set $__stack_pointer
      local.get 22
      return
    )
    (func $_ZN4core3ptr13read_volatile18precondition_check17hec1739cd6dab641aE (;71;) (type 1) (param i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 48
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      global.set $__stack_pointer
      i32.const 1049508
      local.set 5
      local.get 4
      local.get 5
      i32.store offset=4
      local.get 4
      local.get 0
      i32.store offset=32
      local.get 4
      local.get 1
      i32.store offset=36
      local.get 4
      local.get 0
      i32.store offset=40
      block ;; label = @1
        block ;; label = @2
          local.get 0
          br_if 0 (;@2;)
          br 1 (;@1;)
        end
        local.get 1
        i32.popcnt
        local.set 6
        local.get 4
        local.get 6
        i32.store offset=44
        local.get 4
        i32.load offset=44
        local.set 7
        i32.const 1
        local.set 8
        local.get 7
        local.set 9
        local.get 8
        local.set 10
        local.get 9
        local.get 10
        i32.eq
        local.set 11
        i32.const 1
        local.set 12
        local.get 11
        local.get 12
        i32.and
        local.set 13
        block ;; label = @2
          block ;; label = @3
            local.get 13
            i32.eqz
            br_if 0 (;@3;)
            i32.const 1
            local.set 14
            local.get 1
            local.get 14
            i32.sub
            local.set 15
            local.get 0
            local.get 15
            i32.and
            local.set 16
            local.get 16
            i32.eqz
            br_if 1 (;@2;)
            br 2 (;@1;)
          end
          i32.const 1049508
          local.set 17
          local.get 4
          local.get 17
          i32.store offset=8
          i32.const 1
          local.set 18
          local.get 4
          local.get 18
          i32.store offset=12
          i32.const 0
          local.set 19
          local.get 19
          i32.load offset=1049628
          local.set 20
          i32.const 0
          local.set 21
          local.get 21
          i32.load offset=1049632
          local.set 22
          local.get 4
          local.get 20
          i32.store offset=24
          local.get 4
          local.get 22
          i32.store offset=28
          i32.const 4
          local.set 23
          local.get 4
          local.get 23
          i32.store offset=16
          i32.const 0
          local.set 24
          local.get 4
          local.get 24
          i32.store offset=20
          i32.const 8
          local.set 25
          local.get 4
          local.get 25
          i32.add
          local.set 26
          local.get 26
          local.set 27
          i32.const 1049720
          local.set 28
          local.get 27
          local.get 28
          call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
          unreachable
        end
        i32.const 48
        local.set 29
        local.get 4
        local.get 29
        i32.add
        local.set 30
        local.get 30
        global.set $__stack_pointer
        return
      end
      i32.const 1049516
      local.set 31
      i32.const 110
      local.set 32
      local.get 31
      local.get 32
      call $_ZN4core9panicking14panic_nounwind17hb10ad53603be5a05E
      unreachable
    )
    (func $_ZN4core3ptr7mut_ptr31_$LT$impl$u20$$BP$mut$u20$T$GT$7is_null17h2eac4e0ea4a4aaeaE (;72;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 1
      i32.const 16
      local.set 2
      local.get 1
      local.get 2
      i32.sub
      local.set 3
      local.get 3
      local.get 0
      i32.store offset=8
      local.get 3
      local.get 0
      i32.store offset=12
      i32.const 0
      local.set 4
      local.get 0
      local.set 5
      local.get 4
      local.set 6
      local.get 5
      local.get 6
      i32.eq
      local.set 7
      i32.const 1
      local.set 8
      local.get 7
      local.get 8
      i32.and
      local.set 9
      local.get 9
      return
    )
    (func $_ZN4core5alloc6layout6Layout25from_size_align_unchecked17h62c1974cbc607f85E (;73;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32)
      global.get $__stack_pointer
      local.set 3
      i32.const 16
      local.set 4
      local.get 3
      local.get 4
      i32.sub
      local.set 5
      local.get 5
      local.get 1
      i32.store offset=8
      local.get 5
      local.get 2
      i32.store offset=12
      local.get 0
      local.get 1
      i32.store offset=4
      local.get 0
      local.get 2
      i32.store
      return
    )
    (func $_ZN4core9panicking13assert_failed17h6f3f5d4f7e3d4547E (;74;) (type 11) (param i32 i32 i32 i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 5
      i32.const 16
      local.set 6
      local.get 5
      local.get 6
      i32.sub
      local.set 7
      local.get 7
      global.set $__stack_pointer
      local.get 7
      local.get 1
      i32.store offset=4
      local.get 7
      local.get 2
      i32.store offset=8
      local.get 7
      local.get 0
      i32.store8 offset=15
      i32.const 4
      local.set 8
      local.get 7
      local.get 8
      i32.add
      local.set 9
      local.get 9
      local.set 10
      i32.const 1049736
      local.set 11
      i32.const 8
      local.set 12
      local.get 7
      local.get 12
      i32.add
      local.set 13
      local.get 13
      local.set 14
      local.get 0
      local.get 10
      local.get 11
      local.get 14
      local.get 11
      local.get 3
      local.get 4
      call $_ZN4core9panicking19assert_failed_inner17ha7ed4ad68b2c3a67E
      unreachable
    )
    (func $_ZN5alloc5alloc5alloc17hb38e6dfdc8ef4082E (;75;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 32
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      global.set $__stack_pointer
      i32.const 1052649
      local.set 5
      local.get 4
      local.get 5
      i32.store
      local.get 4
      local.get 0
      i32.store offset=4
      local.get 4
      local.get 1
      i32.store offset=8
      i32.const 1052649
      local.set 6
      i32.const 1
      local.set 7
      local.get 6
      local.get 7
      call $_ZN4core3ptr13read_volatile18precondition_check17hec1739cd6dab641aE
      i32.const 0
      local.set 8
      local.get 8
      i32.load8_u offset=1052649
      local.set 9
      local.get 4
      local.get 9
      i32.store8 offset=19
      i32.const 4
      local.set 10
      local.get 4
      local.get 10
      i32.add
      local.set 11
      local.get 11
      local.set 12
      local.get 4
      local.get 12
      i32.store offset=20
      local.get 4
      i32.load offset=8
      local.set 13
      i32.const 4
      local.set 14
      local.get 4
      local.get 14
      i32.add
      local.set 15
      local.get 15
      local.set 16
      local.get 4
      local.get 16
      i32.store offset=24
      local.get 4
      i32.load offset=4
      local.set 17
      local.get 4
      local.get 17
      i32.store offset=28
      local.get 4
      local.get 17
      i32.store offset=12
      local.get 4
      i32.load offset=12
      local.set 18
      local.get 13
      local.get 18
      call $__rust_alloc
      local.set 19
      i32.const 32
      local.set 20
      local.get 4
      local.get 20
      i32.add
      local.set 21
      local.get 21
      global.set $__stack_pointer
      local.get 19
      return
    )
    (func $_ZN5alloc5alloc7realloc17ha8727483fbeb6f7bE (;76;) (type 6) (param i32 i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 4
      i32.const 32
      local.set 5
      local.get 4
      local.get 5
      i32.sub
      local.set 6
      local.get 6
      global.set $__stack_pointer
      local.get 6
      local.get 1
      i32.store
      local.get 6
      local.get 2
      i32.store offset=4
      local.get 6
      local.get 0
      i32.store offset=12
      local.get 6
      local.get 3
      i32.store offset=16
      local.get 6
      local.set 7
      local.get 6
      local.get 7
      i32.store offset=20
      local.get 6
      i32.load offset=4
      local.set 8
      local.get 6
      local.set 9
      local.get 6
      local.get 9
      i32.store offset=24
      local.get 6
      i32.load
      local.set 10
      local.get 6
      local.get 10
      i32.store offset=28
      local.get 6
      local.get 10
      i32.store offset=8
      local.get 6
      i32.load offset=8
      local.set 11
      local.get 0
      local.get 8
      local.get 11
      local.get 3
      call $__rust_realloc
      local.set 12
      i32.const 32
      local.set 13
      local.get 6
      local.get 13
      i32.add
      local.set 14
      local.get 14
      global.set $__stack_pointer
      local.get 12
      return
    )
    (func $cabi_realloc_wit_bindgen_0_30_0 (;77;) (type 6) (param i32 i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 4
      i32.const 16
      local.set 5
      local.get 4
      local.get 5
      i32.sub
      local.set 6
      local.get 6
      global.set $__stack_pointer
      local.get 6
      local.get 0
      i32.store
      local.get 6
      local.get 1
      i32.store offset=4
      local.get 6
      local.get 2
      i32.store offset=8
      local.get 6
      local.get 3
      i32.store offset=12
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      call $_ZN14wit_bindgen_rt12cabi_realloc17hcb8b304d1ac0fde4E
      local.set 7
      i32.const 16
      local.set 8
      local.get 6
      local.get 8
      i32.add
      local.set 9
      local.get 9
      global.set $__stack_pointer
      local.get 7
      return
    )
    (func $_ZN14wit_bindgen_rt12cabi_realloc17hcb8b304d1ac0fde4E (;78;) (type 6) (param i32 i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i64 i64 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 4
      i32.const 112
      local.set 5
      local.get 4
      local.get 5
      i32.sub
      local.set 6
      local.get 6
      global.set $__stack_pointer
      local.get 6
      local.get 3
      i32.store offset=16
      local.get 6
      local.get 0
      i32.store offset=92
      local.get 6
      local.get 1
      i32.store offset=96
      local.get 6
      local.get 2
      i32.store offset=100
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 1
                  br_if 0 (;@6;)
                  local.get 6
                  i32.load offset=16
                  local.set 7
                  local.get 7
                  i32.eqz
                  br_if 1 (;@5;)
                  br 2 (;@4;)
                end
                br 2 (;@3;)
              end
              local.get 6
              local.get 2
              i32.store offset=20
              br 3 (;@1;)
            end
            local.get 6
            i32.load offset=16
            local.set 8
            local.get 6
            local.get 8
            local.get 2
            call $_ZN4core5alloc6layout6Layout25from_size_align_unchecked17h62c1974cbc607f85E
            local.get 6
            i32.load offset=4
            local.set 9
            local.get 6
            i32.load
            local.set 10
            local.get 6
            local.get 10
            i32.store offset=24
            local.get 6
            local.get 9
            i32.store offset=28
            local.get 6
            i32.load offset=24
            local.set 11
            local.get 6
            i32.load offset=28
            local.set 12
            local.get 11
            local.get 12
            call $_ZN5alloc5alloc5alloc17hb38e6dfdc8ef4082E
            local.set 13
            local.get 6
            local.get 13
            i32.store offset=32
            br 1 (;@2;)
          end
          i32.const 16
          local.set 14
          local.get 6
          local.get 14
          i32.add
          local.set 15
          local.get 15
          local.set 16
          local.get 6
          local.get 16
          i32.store offset=104
          i32.const 1049756
          local.set 17
          local.get 6
          local.get 17
          i32.store offset=108
          local.get 6
          i32.load offset=16
          local.set 18
          i32.const 0
          local.set 19
          local.get 19
          i32.load offset=1049756
          local.set 20
          local.get 18
          local.set 21
          local.get 20
          local.set 22
          local.get 21
          local.get 22
          i32.eq
          local.set 23
          i32.const 1
          local.set 24
          local.get 23
          local.get 24
          i32.and
          local.set 25
          block ;; label = @3
            local.get 25
            br_if 0 (;@3;)
            i32.const 8
            local.set 26
            local.get 6
            local.get 26
            i32.add
            local.set 27
            local.get 27
            local.get 1
            local.get 2
            call $_ZN4core5alloc6layout6Layout25from_size_align_unchecked17h62c1974cbc607f85E
            local.get 6
            i32.load offset=12
            local.set 28
            local.get 6
            i32.load offset=8
            local.set 29
            local.get 6
            local.get 29
            i32.store offset=24
            local.get 6
            local.get 28
            i32.store offset=28
            local.get 6
            i32.load offset=24
            local.set 30
            local.get 6
            i32.load offset=28
            local.set 31
            local.get 6
            i32.load offset=16
            local.set 32
            local.get 0
            local.get 30
            local.get 31
            local.get 32
            call $_ZN5alloc5alloc7realloc17ha8727483fbeb6f7bE
            local.set 33
            local.get 6
            local.get 33
            i32.store offset=32
            br 1 (;@2;)
          end
          i32.const 1
          local.set 34
          local.get 6
          local.get 34
          i32.store8 offset=39
          i32.const 68
          local.set 35
          local.get 6
          local.get 35
          i32.add
          local.set 36
          local.get 36
          local.set 37
          i32.const 1049804
          local.set 38
          local.get 37
          local.get 38
          call $_ZN4core3fmt9Arguments9new_const17ha0285ed412fe84ebE
          i32.const 16
          local.set 39
          i32.const 40
          local.set 40
          local.get 6
          local.get 40
          i32.add
          local.set 41
          local.get 41
          local.get 39
          i32.add
          local.set 42
          i32.const 68
          local.set 43
          local.get 6
          local.get 43
          i32.add
          local.set 44
          local.get 44
          local.get 39
          i32.add
          local.set 45
          local.get 45
          i64.load align=4
          local.set 46
          local.get 42
          local.get 46
          i64.store
          i32.const 8
          local.set 47
          i32.const 40
          local.set 48
          local.get 6
          local.get 48
          i32.add
          local.set 49
          local.get 49
          local.get 47
          i32.add
          local.set 50
          i32.const 68
          local.set 51
          local.get 6
          local.get 51
          i32.add
          local.set 52
          local.get 52
          local.get 47
          i32.add
          local.set 53
          local.get 53
          i64.load align=4
          local.set 54
          local.get 50
          local.get 54
          i64.store
          local.get 6
          i64.load offset=68 align=4
          local.set 55
          local.get 6
          local.get 55
          i64.store offset=40
          local.get 6
          i32.load8_u offset=39
          local.set 56
          i32.const 16
          local.set 57
          local.get 6
          local.get 57
          i32.add
          local.set 58
          local.get 58
          local.set 59
          i32.const 1049756
          local.set 60
          i32.const 40
          local.set 61
          local.get 6
          local.get 61
          i32.add
          local.set 62
          local.get 62
          local.set 63
          i32.const 1049916
          local.set 64
          local.get 56
          local.get 59
          local.get 60
          local.get 63
          local.get 64
          call $_ZN4core9panicking13assert_failed17h6f3f5d4f7e3d4547E
          unreachable
        end
        local.get 6
        i32.load offset=32
        local.set 65
        local.get 65
        call $_ZN4core3ptr7mut_ptr31_$LT$impl$u20$$BP$mut$u20$T$GT$7is_null17h2eac4e0ea4a4aaeaE
        local.set 66
        i32.const 1
        local.set 67
        local.get 66
        local.get 67
        i32.and
        local.set 68
        block ;; label = @2
          local.get 68
          br_if 0 (;@2;)
          local.get 6
          i32.load offset=32
          local.set 69
          local.get 6
          local.get 69
          i32.store offset=20
          br 1 (;@1;)
        end
        local.get 6
        i32.load offset=24
        local.set 70
        local.get 6
        i32.load offset=28
        local.set 71
        local.get 70
        local.get 71
        call $_ZN5alloc5alloc18handle_alloc_error17h7bdcb31f02c1333fE
        unreachable
      end
      local.get 6
      i32.load offset=20
      local.set 72
      i32.const 112
      local.set 73
      local.get 6
      local.get 73
      i32.add
      local.set 74
      local.get 74
      global.set $__stack_pointer
      local.get 72
      return
    )
    (func $_ZN14wit_bindgen_rt14run_ctors_once17he9cf8a2a65ea0aa6E (;79;) (type 7)
      (local i32 i32 i32 i32 i32 i32)
      i32.const 0
      local.set 0
      local.get 0
      i32.load8_u offset=1052650
      local.set 1
      i32.const 1
      local.set 2
      local.get 1
      local.get 2
      i32.and
      local.set 3
      block ;; label = @1
        local.get 3
        br_if 0 (;@1;)
        call $__wasm_call_ctors
        i32.const 1
        local.set 4
        i32.const 0
        local.set 5
        local.get 5
        local.get 4
        i32.store8 offset=1052650
      end
      return
    )
    (func $_ZN4core3fmt9Arguments9new_const17ha0285ed412fe84ebE (;80;) (type 1) (param i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 16
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      local.get 1
      i32.store offset=12
      local.get 0
      local.get 1
      i32.store
      i32.const 1
      local.set 5
      local.get 0
      local.get 5
      i32.store offset=4
      i32.const 0
      local.set 6
      local.get 6
      i32.load offset=1049932
      local.set 7
      i32.const 0
      local.set 8
      local.get 8
      i32.load offset=1049936
      local.set 9
      local.get 0
      local.get 7
      i32.store offset=16
      local.get 0
      local.get 9
      i32.store offset=20
      i32.const 4
      local.set 10
      local.get 0
      local.get 10
      i32.store offset=8
      i32.const 0
      local.set 11
      local.get 0
      local.get 11
      i32.store offset=12
      return
    )
    (func $_ZN36_$LT$T$u20$as$u20$core..any..Any$GT$7type_id17h1f3918fc15315f33E (;81;) (type 1) (param i32 i32)
      local.get 0
      i64.const 7199936582794304877
      i64.store offset=8
      local.get 0
      i64.const -5076933981314334344
      i64.store
    )
    (func $_ZN36_$LT$T$u20$as$u20$core..any..Any$GT$7type_id17h39f0d0c355eabd2cE (;82;) (type 1) (param i32 i32)
      local.get 0
      i64.const 2789784050715676570
      i64.store offset=8
      local.get 0
      i64.const 8345271900260102035
      i64.store
    )
    (func $_ZN36_$LT$T$u20$as$u20$core..any..Any$GT$7type_id17he695300dfb07afd1E (;83;) (type 1) (param i32 i32)
      local.get 0
      i64.const -2259593071510701799
      i64.store offset=8
      local.get 0
      i64.const -318054164392809685
      i64.store
    )
    (func $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17h2dcc30c3ae811092E (;84;) (type 4) (param i32 i32) (result i32)
      local.get 0
      i32.load
      local.get 1
      call $_ZN43_$LT$bool$u20$as$u20$core..fmt..Display$GT$3fmt17hace09e3e1b2a9347E
    )
    (func $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17h868f32f902646e89E (;85;) (type 4) (param i32 i32) (result i32)
      local.get 0
      i32.load
      local.get 0
      i32.load offset=4
      local.get 1
      call $_ZN42_$LT$str$u20$as$u20$core..fmt..Display$GT$3fmt17h1c8e670e7aa54677E
    )
    (func $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17ha780adf48b070eb3E (;86;) (type 4) (param i32 i32) (result i32)
      local.get 0
      i32.load
      local.get 1
      call $_ZN70_$LT$core..panic..location..Location$u20$as$u20$core..fmt..Display$GT$3fmt17hc747e14b778be851E
    )
    (func $_ZN4core3fmt5Write10write_char17h920592283b5a2127E (;87;) (type 4) (param i32 i32) (result i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 2
      i32.const 0
      i32.store offset=12
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 1
              i32.const 128
              i32.lt_u
              br_if 0 (;@4;)
              local.get 1
              i32.const 2048
              i32.lt_u
              br_if 1 (;@3;)
              local.get 1
              i32.const 65536
              i32.ge_u
              br_if 2 (;@2;)
              local.get 2
              local.get 1
              i32.const 63
              i32.and
              i32.const 128
              i32.or
              i32.store8 offset=14
              local.get 2
              local.get 1
              i32.const 12
              i32.shr_u
              i32.const 224
              i32.or
              i32.store8 offset=12
              local.get 2
              local.get 1
              i32.const 6
              i32.shr_u
              i32.const 63
              i32.and
              i32.const 128
              i32.or
              i32.store8 offset=13
              i32.const 3
              local.set 3
              br 3 (;@1;)
            end
            local.get 2
            local.get 1
            i32.store8 offset=12
            i32.const 1
            local.set 3
            br 2 (;@1;)
          end
          local.get 2
          local.get 1
          i32.const 63
          i32.and
          i32.const 128
          i32.or
          i32.store8 offset=13
          local.get 2
          local.get 1
          i32.const 6
          i32.shr_u
          i32.const 192
          i32.or
          i32.store8 offset=12
          i32.const 2
          local.set 3
          br 1 (;@1;)
        end
        local.get 2
        local.get 1
        i32.const 63
        i32.and
        i32.const 128
        i32.or
        i32.store8 offset=15
        local.get 2
        local.get 1
        i32.const 6
        i32.shr_u
        i32.const 63
        i32.and
        i32.const 128
        i32.or
        i32.store8 offset=14
        local.get 2
        local.get 1
        i32.const 12
        i32.shr_u
        i32.const 63
        i32.and
        i32.const 128
        i32.or
        i32.store8 offset=13
        local.get 2
        local.get 1
        i32.const 18
        i32.shr_u
        i32.const 7
        i32.and
        i32.const 240
        i32.or
        i32.store8 offset=12
        i32.const 4
        local.set 3
      end
      block ;; label = @1
        local.get 0
        i32.load offset=8
        local.tee 1
        i32.load
        local.get 1
        i32.load offset=8
        local.tee 0
        i32.sub
        local.get 3
        i32.ge_u
        br_if 0 (;@1;)
        local.get 1
        local.get 0
        local.get 3
        call $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$7reserve21do_reserve_and_handle17h9cfcbcc2bed65e9aE
        local.get 1
        i32.load offset=8
        local.set 0
      end
      local.get 1
      i32.load offset=4
      local.get 0
      i32.add
      local.get 2
      i32.const 12
      i32.add
      local.get 3
      call $memcpy
      drop
      local.get 1
      local.get 0
      local.get 3
      i32.add
      i32.store offset=8
      local.get 2
      i32.const 16
      i32.add
      global.set $__stack_pointer
      i32.const 0
    )
    (func $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$7reserve21do_reserve_and_handle17h9cfcbcc2bed65e9aE (;88;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      block ;; label = @1
        local.get 1
        local.get 2
        i32.add
        local.tee 2
        local.get 1
        i32.ge_u
        br_if 0 (;@1;)
        i32.const 0
        i32.const 0
        call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
        unreachable
      end
      i32.const 1
      local.set 4
      local.get 0
      i32.load
      local.tee 5
      i32.const 1
      i32.shl
      local.tee 1
      local.get 2
      local.get 1
      local.get 2
      i32.gt_u
      select
      local.tee 1
      i32.const 8
      local.get 1
      i32.const 8
      i32.gt_u
      select
      local.tee 1
      i32.const -1
      i32.xor
      i32.const 31
      i32.shr_u
      local.set 2
      block ;; label = @1
        block ;; label = @2
          local.get 5
          br_if 0 (;@2;)
          i32.const 0
          local.set 4
          br 1 (;@1;)
        end
        local.get 3
        local.get 5
        i32.store offset=28
        local.get 3
        local.get 0
        i32.load offset=4
        i32.store offset=20
      end
      local.get 3
      local.get 4
      i32.store offset=24
      local.get 3
      i32.const 8
      i32.add
      local.get 2
      local.get 1
      local.get 3
      i32.const 20
      i32.add
      call $_ZN5alloc7raw_vec11finish_grow17hcb8db1e49770011eE
      block ;; label = @1
        local.get 3
        i32.load offset=8
        i32.eqz
        br_if 0 (;@1;)
        local.get 3
        i32.load offset=12
        local.get 3
        i32.load offset=16
        call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
        unreachable
      end
      local.get 3
      i32.load offset=12
      local.set 2
      local.get 0
      local.get 1
      i32.store
      local.get 0
      local.get 2
      i32.store offset=4
      local.get 3
      i32.const 32
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN4core3fmt5Write10write_char17h9901503f16821d0aE (;89;) (type 4) (param i32 i32) (result i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 2
      i32.const 0
      i32.store offset=12
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 1
              i32.const 128
              i32.lt_u
              br_if 0 (;@4;)
              local.get 1
              i32.const 2048
              i32.lt_u
              br_if 1 (;@3;)
              local.get 1
              i32.const 65536
              i32.ge_u
              br_if 2 (;@2;)
              local.get 2
              local.get 1
              i32.const 63
              i32.and
              i32.const 128
              i32.or
              i32.store8 offset=14
              local.get 2
              local.get 1
              i32.const 12
              i32.shr_u
              i32.const 224
              i32.or
              i32.store8 offset=12
              local.get 2
              local.get 1
              i32.const 6
              i32.shr_u
              i32.const 63
              i32.and
              i32.const 128
              i32.or
              i32.store8 offset=13
              i32.const 3
              local.set 1
              br 3 (;@1;)
            end
            local.get 2
            local.get 1
            i32.store8 offset=12
            i32.const 1
            local.set 1
            br 2 (;@1;)
          end
          local.get 2
          local.get 1
          i32.const 63
          i32.and
          i32.const 128
          i32.or
          i32.store8 offset=13
          local.get 2
          local.get 1
          i32.const 6
          i32.shr_u
          i32.const 192
          i32.or
          i32.store8 offset=12
          i32.const 2
          local.set 1
          br 1 (;@1;)
        end
        local.get 2
        local.get 1
        i32.const 63
        i32.and
        i32.const 128
        i32.or
        i32.store8 offset=15
        local.get 2
        local.get 1
        i32.const 6
        i32.shr_u
        i32.const 63
        i32.and
        i32.const 128
        i32.or
        i32.store8 offset=14
        local.get 2
        local.get 1
        i32.const 12
        i32.shr_u
        i32.const 63
        i32.and
        i32.const 128
        i32.or
        i32.store8 offset=13
        local.get 2
        local.get 1
        i32.const 18
        i32.shr_u
        i32.const 7
        i32.and
        i32.const 240
        i32.or
        i32.store8 offset=12
        i32.const 4
        local.set 1
      end
      local.get 0
      local.get 2
      i32.const 12
      i32.add
      local.get 1
      call $_ZN80_$LT$std..io..Write..write_fmt..Adapter$LT$T$GT$$u20$as$u20$core..fmt..Write$GT$9write_str17hcfdf18f9e3c26cecE
      local.set 1
      local.get 2
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 1
    )
    (func $_ZN80_$LT$std..io..Write..write_fmt..Adapter$LT$T$GT$$u20$as$u20$core..fmt..Write$GT$9write_str17hcfdf18f9e3c26cecE (;90;) (type 2) (param i32 i32 i32) (result i32)
      (local i32 i32 i32 i64)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      i32.const 0
      local.set 4
      block ;; label = @1
        block ;; label = @2
          local.get 2
          i32.eqz
          br_if 0 (;@2;)
          loop ;; label = @3
            local.get 3
            local.get 2
            i32.store offset=4
            local.get 3
            local.get 1
            i32.store
            local.get 3
            i32.const 8
            i32.add
            i32.const 2
            local.get 3
            i32.const 1
            call $_ZN4wasi13lib_generated8fd_write17h3677cbd19c973238E
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    local.get 3
                    i32.load16_u offset=8
                    br_if 0 (;@7;)
                    local.get 3
                    i32.load offset=12
                    local.tee 5
                    br_if 2 (;@5;)
                    i32.const 0
                    i64.load offset=1050400
                    local.set 6
                    br 1 (;@6;)
                  end
                  local.get 3
                  i64.load16_u offset=10
                  local.tee 6
                  i64.const 27
                  i64.eq
                  br_if 2 (;@4;)
                  local.get 6
                  i64.const 32
                  i64.shl
                  local.set 6
                end
                local.get 6
                i64.const 255
                i64.and
                i64.const 4
                i64.eq
                br_if 3 (;@2;)
                local.get 0
                i32.load offset=4
                local.set 1
                block ;; label = @6
                  block ;; label = @7
                    local.get 0
                    i32.load8_u
                    local.tee 2
                    i32.const 4
                    i32.gt_u
                    br_if 0 (;@7;)
                    local.get 2
                    i32.const 3
                    i32.ne
                    br_if 1 (;@6;)
                  end
                  local.get 1
                  i32.load
                  local.set 5
                  block ;; label = @7
                    local.get 1
                    i32.const 4
                    i32.add
                    i32.load
                    local.tee 2
                    i32.load
                    local.tee 4
                    i32.eqz
                    br_if 0 (;@7;)
                    local.get 5
                    local.get 4
                    call_indirect (type 0)
                  end
                  block ;; label = @7
                    local.get 2
                    i32.load offset=4
                    local.tee 4
                    i32.eqz
                    br_if 0 (;@7;)
                    local.get 5
                    local.get 4
                    local.get 2
                    i32.load offset=8
                    call $__rust_dealloc
                  end
                  local.get 1
                  i32.const 12
                  i32.const 4
                  call $__rust_dealloc
                end
                local.get 0
                local.get 6
                i64.store align=4
                i32.const 1
                local.set 4
                br 3 (;@2;)
              end
              local.get 2
              local.get 5
              i32.lt_u
              br_if 3 (;@1;)
              local.get 1
              local.get 5
              i32.add
              local.set 1
              local.get 2
              local.get 5
              i32.sub
              local.set 2
            end
            local.get 2
            br_if 0 (;@3;)
          end
        end
        local.get 3
        i32.const 16
        i32.add
        global.set $__stack_pointer
        local.get 4
        return
      end
      local.get 5
      local.get 2
      i32.const 1050408
      call $_ZN4core5slice5index26slice_start_index_len_fail17h5249b664c892b135E
      unreachable
    )
    (func $_ZN4core3fmt5Write9write_fmt17h0c5ad60afd664945E (;91;) (type 4) (param i32 i32) (result i32)
      local.get 0
      i32.const 1050120
      local.get 1
      call $_ZN4core3fmt5write17h86ae7d4da82da0b2E
    )
    (func $_ZN4core3fmt5Write9write_fmt17h8164afb3f1e315acE (;92;) (type 4) (param i32 i32) (result i32)
      local.get 0
      i32.const 1050168
      local.get 1
      call $_ZN4core3fmt5write17h86ae7d4da82da0b2E
    )
    (func $_ZN4core3fmt5Write9write_fmt17h8babb06e12caa1c2E (;93;) (type 4) (param i32 i32) (result i32)
      local.get 0
      i32.const 1050144
      local.get 1
      call $_ZN4core3fmt5write17h86ae7d4da82da0b2E
    )
    (func $_ZN3std9panicking12default_hook17hdf494962bb928bb2E (;94;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 128
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i32.load8_u offset=17
          br_if 0 (;@2;)
          block ;; label = @3
            i32.const 0
            i32.load offset=1052688
            i32.const 1
            i32.gt_u
            br_if 0 (;@3;)
            local.get 1
            call $_ZN3std5panic19get_backtrace_style17he3c147f4917a62b7E
            i32.store8 offset=47
            br 2 (;@1;)
          end
          local.get 1
          i32.const 1
          i32.store8 offset=47
          br 1 (;@1;)
        end
        local.get 1
        i32.const 3
        i32.store8 offset=47
      end
      local.get 1
      local.get 0
      i32.load offset=12
      i32.store offset=48
      i32.const 12
      local.set 2
      local.get 1
      i32.const 24
      i32.add
      local.get 0
      i32.load
      local.tee 3
      local.get 0
      i32.load offset=4
      i32.const 12
      i32.add
      local.tee 4
      i32.load
      call_indirect (type 1)
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 1
            i64.load offset=24
            i64.const -5076933981314334344
            i64.ne
            br_if 0 (;@3;)
            i32.const 4
            local.set 0
            local.get 3
            local.set 5
            local.get 1
            i64.load offset=32
            i64.const 7199936582794304877
            i64.eq
            br_if 1 (;@2;)
          end
          local.get 1
          i32.const 8
          i32.add
          local.get 3
          local.get 4
          i32.load
          call_indirect (type 1)
          i32.const 1051000
          local.set 0
          local.get 1
          i64.load offset=8
          i64.const -318054164392809685
          i64.ne
          br_if 1 (;@1;)
          local.get 1
          i64.load offset=16
          i64.const -2259593071510701799
          i64.ne
          br_if 1 (;@1;)
          local.get 3
          i32.const 4
          i32.add
          local.set 5
          i32.const 8
          local.set 0
        end
        local.get 3
        local.get 0
        i32.add
        i32.load
        local.set 2
        local.get 5
        i32.load
        local.set 0
      end
      local.get 1
      local.get 2
      i32.store offset=56
      local.get 1
      local.get 0
      i32.store offset=52
      block ;; label = @1
        i32.const 0
        i32.load offset=1052704
        local.tee 0
        br_if 0 (;@1;)
        i32.const 1052704
        call $_ZN4core4cell4once17OnceCell$LT$T$GT$8try_init17hffad3f0818fb1fc6E
        drop
        i32.const 0
        i32.load offset=1052704
        local.set 0
      end
      local.get 0
      local.get 0
      i32.load
      local.tee 3
      i32.const 1
      i32.add
      i32.store
      block ;; label = @1
        block ;; label = @2
          local.get 3
          i32.const -1
          i32.le_s
          br_if 0 (;@2;)
          local.get 1
          local.get 0
          i32.store offset=60
          i32.const 9
          local.set 3
          i32.const 1051012
          local.set 2
          block ;; label = @3
            local.get 0
            i32.eqz
            br_if 0 (;@3;)
            block ;; label = @4
              block ;; label = @5
                local.get 0
                i32.load offset=16
                br_table 1 (;@4;) 0 (;@5;) 2 (;@3;) 1 (;@4;)
              end
              local.get 0
              i32.load offset=24
              i32.const -1
              i32.add
              local.set 3
              local.get 0
              i32.load offset=20
              local.set 2
              br 1 (;@3;)
            end
            i32.const 4
            local.set 3
            i32.const 1050300
            local.set 2
          end
          local.get 1
          local.get 3
          i32.store offset=68
          local.get 1
          local.get 2
          i32.store offset=64
          local.get 1
          local.get 1
          i32.const 47
          i32.add
          i32.store offset=84
          local.get 1
          local.get 1
          i32.const 52
          i32.add
          i32.store offset=80
          local.get 1
          local.get 1
          i32.const 48
          i32.add
          i32.store offset=76
          local.get 1
          local.get 1
          i32.const 64
          i32.add
          i32.store offset=72
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  i32.const 0
                  i32.load8_u offset=1052651
                  br_if 0 (;@6;)
                  local.get 1
                  i64.const 0
                  i64.store offset=88 align=4
                  local.get 1
                  i32.const 92
                  i32.add
                  local.set 2
                  br 1 (;@5;)
                end
                i32.const 0
                i32.const 1
                i32.store8 offset=1052651
                block ;; label = @6
                  i32.const 0
                  i32.load8_u offset=1052696
                  br_if 0 (;@6;)
                  i32.const 0
                  call $_ZN3std3sys12thread_local12static_local20LazyStorage$LT$T$GT$10initialize17hed142702bdbbfc37E
                end
                local.get 1
                i32.const 0
                i32.store offset=88
                local.get 1
                i32.const 0
                i32.load offset=1052700
                local.tee 3
                i32.store offset=92
                i32.const 0
                i32.const 0
                i32.store offset=1052700
                local.get 1
                i32.const 92
                i32.add
                local.set 2
                local.get 3
                br_if 1 (;@4;)
              end
              local.get 1
              i32.const 72
              i32.add
              local.get 1
              i32.const 127
              i32.add
              i32.const 3
              call $_ZN3std9panicking12default_hook28_$u7b$$u7b$closure$u7d$$u7d$17h6f528641705733ebE
              i32.const 0
              local.set 3
              br 1 (;@3;)
            end
            local.get 3
            i32.load8_u offset=8
            local.set 0
            local.get 3
            i32.const 1
            i32.store8 offset=8
            local.get 1
            local.get 0
            i32.store8 offset=99
            local.get 0
            br_if 2 (;@1;)
            local.get 1
            i32.const 72
            i32.add
            local.get 3
            i32.const 12
            i32.add
            i32.const 4
            call $_ZN3std9panicking12default_hook28_$u7b$$u7b$closure$u7d$$u7d$17h6f528641705733ebE
            local.get 3
            i32.const 0
            i32.store8 offset=8
            i32.const 0
            i32.const 1
            i32.store8 offset=1052651
            block ;; label = @4
              i32.const 0
              i32.load8_u offset=1052696
              br_if 0 (;@4;)
              i32.const 0
              call $_ZN3std3sys12thread_local12static_local20LazyStorage$LT$T$GT$10initialize17hed142702bdbbfc37E
            end
            i32.const 0
            i32.load offset=1052700
            local.set 0
            i32.const 0
            local.get 3
            i32.store offset=1052700
            i32.const 1
            local.set 3
            local.get 1
            i32.const 1
            i32.store offset=100
            local.get 1
            local.get 0
            i32.store offset=104
            block ;; label = @4
              local.get 0
              i32.eqz
              br_if 0 (;@4;)
              local.get 0
              local.get 0
              i32.load
              local.tee 5
              i32.const -1
              i32.add
              i32.store
              local.get 5
              i32.const 1
              i32.ne
              br_if 0 (;@4;)
              local.get 1
              i32.const 104
              i32.add
              call $_ZN5alloc4sync16Arc$LT$T$C$A$GT$9drop_slow17h247cf69885394f8aE
            end
            local.get 1
            i32.load offset=60
            local.set 0
          end
          block ;; label = @3
            local.get 0
            i32.eqz
            br_if 0 (;@3;)
            local.get 0
            local.get 0
            i32.load
            local.tee 5
            i32.const -1
            i32.add
            i32.store
            local.get 5
            i32.const 1
            i32.ne
            br_if 0 (;@3;)
            local.get 1
            i32.const 60
            i32.add
            call $_ZN5alloc4sync16Arc$LT$T$C$A$GT$9drop_slow17he76bf25ebc447615E
          end
          block ;; label = @3
            local.get 3
            local.get 1
            i32.load offset=88
            i32.const 0
            i32.ne
            local.get 1
            i32.load offset=92
            local.tee 0
            i32.eqz
            i32.or
            i32.or
            i32.const 1
            i32.eq
            br_if 0 (;@3;)
            local.get 0
            local.get 0
            i32.load
            local.tee 3
            i32.const -1
            i32.add
            i32.store
            local.get 3
            i32.const 1
            i32.ne
            br_if 0 (;@3;)
            local.get 2
            call $_ZN5alloc4sync16Arc$LT$T$C$A$GT$9drop_slow17h247cf69885394f8aE
          end
          local.get 1
          i32.const 128
          i32.add
          global.set $__stack_pointer
          return
        end
        unreachable
        unreachable
      end
      local.get 1
      i64.const 0
      i64.store offset=112 align=4
      local.get 1
      i64.const 17179869185
      i64.store offset=104 align=4
      local.get 1
      i32.const 1050612
      i32.store offset=100
      local.get 1
      i32.const 99
      i32.add
      local.get 1
      i32.const 100
      i32.add
      call $_ZN4core9panicking13assert_failed17h56c9d3f3aa6ef6edE
      unreachable
    )
    (func $_ZN5alloc4sync16Arc$LT$T$C$A$GT$9drop_slow17he76bf25ebc447615E (;95;) (type 0) (param i32)
      (local i32 i32)
      block ;; label = @1
        local.get 0
        i32.load
        local.tee 0
        i32.load offset=16
        i32.const 1
        i32.ne
        br_if 0 (;@1;)
        local.get 0
        i32.load offset=20
        local.tee 1
        i32.const 0
        i32.store8
        local.get 0
        i32.load offset=24
        local.tee 2
        i32.eqz
        br_if 0 (;@1;)
        local.get 1
        local.get 2
        i32.const 1
        call $__rust_dealloc
      end
      block ;; label = @1
        local.get 0
        i32.const -1
        i32.eq
        br_if 0 (;@1;)
        local.get 0
        local.get 0
        i32.load offset=4
        local.tee 1
        i32.const -1
        i32.add
        i32.store offset=4
        local.get 1
        i32.const 1
        i32.ne
        br_if 0 (;@1;)
        local.get 0
        i32.const 32
        i32.const 8
        call $__rust_dealloc
      end
    )
    (func $_ZN4core3ptr42drop_in_place$LT$alloc..string..String$GT$17he424d63ca6d10601E (;96;) (type 0) (param i32)
      (local i32)
      block ;; label = @1
        local.get 0
        i32.load
        local.tee 1
        i32.eqz
        br_if 0 (;@1;)
        local.get 0
        i32.load offset=4
        local.get 1
        i32.const 1
        call $__rust_dealloc
      end
    )
    (func $_ZN4core3ptr77drop_in_place$LT$std..panicking..begin_panic_handler..FormatStringPayload$GT$17he46bc18372466552E (;97;) (type 0) (param i32)
      (local i32)
      block ;; label = @1
        local.get 0
        i32.load
        local.tee 1
        i32.const -2147483648
        i32.or
        i32.const -2147483648
        i32.eq
        br_if 0 (;@1;)
        local.get 0
        i32.load offset=4
        local.get 1
        i32.const 1
        call $__rust_dealloc
      end
    )
    (func $_ZN4core3ptr81drop_in_place$LT$core..result..Result$LT$$LP$$RP$$C$std..io..error..Error$GT$$GT$17h5f8fdfdf5d3fdf33E (;98;) (type 1) (param i32 i32)
      (local i32 i32)
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i32.const 255
          i32.and
          local.tee 0
          i32.const 4
          i32.gt_u
          br_if 0 (;@2;)
          local.get 0
          i32.const 3
          i32.ne
          br_if 1 (;@1;)
        end
        local.get 1
        i32.load
        local.set 2
        block ;; label = @2
          local.get 1
          i32.const 4
          i32.add
          i32.load
          local.tee 0
          i32.load
          local.tee 3
          i32.eqz
          br_if 0 (;@2;)
          local.get 2
          local.get 3
          call_indirect (type 0)
        end
        block ;; label = @2
          local.get 0
          i32.load offset=4
          local.tee 3
          i32.eqz
          br_if 0 (;@2;)
          local.get 2
          local.get 3
          local.get 0
          i32.load offset=8
          call $__rust_dealloc
        end
        local.get 1
        i32.const 12
        i32.const 4
        call $__rust_dealloc
      end
    )
    (func $_ZN4core3ptr88drop_in_place$LT$std..io..Write..write_fmt..Adapter$LT$alloc..vec..Vec$LT$u8$GT$$GT$$GT$17h5bd937049d024a22E (;99;) (type 0) (param i32)
      (local i32 i32 i32)
      local.get 0
      i32.load offset=4
      local.set 1
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i32.load8_u
          local.tee 0
          i32.const 4
          i32.gt_u
          br_if 0 (;@2;)
          local.get 0
          i32.const 3
          i32.ne
          br_if 1 (;@1;)
        end
        local.get 1
        i32.load
        local.set 2
        block ;; label = @2
          local.get 1
          i32.const 4
          i32.add
          i32.load
          local.tee 0
          i32.load
          local.tee 3
          i32.eqz
          br_if 0 (;@2;)
          local.get 2
          local.get 3
          call_indirect (type 0)
        end
        block ;; label = @2
          local.get 0
          i32.load offset=4
          local.tee 3
          i32.eqz
          br_if 0 (;@2;)
          local.get 2
          local.get 3
          local.get 0
          i32.load offset=8
          call $__rust_dealloc
        end
        local.get 1
        i32.const 12
        i32.const 4
        call $__rust_dealloc
      end
    )
    (func $_ZN4core4cell4once17OnceCell$LT$T$GT$8try_init17hffad3f0818fb1fc6E (;100;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32 i64 i64 i64)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      local.get 1
      i32.const 8
      i32.const 24
      call $_ZN5alloc4sync32arcinner_layout_for_value_layout17hc7be1e8b76b95d6bE
      local.get 1
      i32.load
      local.set 2
      block ;; label = @1
        block ;; label = @2
          local.get 1
          i32.load offset=4
          local.tee 3
          br_if 0 (;@2;)
          local.get 2
          local.set 4
          br 1 (;@1;)
        end
        i32.const 0
        i32.load8_u offset=1052649
        drop
        local.get 3
        local.get 2
        call $__rust_alloc
        local.set 4
      end
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 4
            i32.eqz
            br_if 0 (;@3;)
            local.get 4
            i32.const 2
            i32.store offset=16
            local.get 4
            i64.const 4294967297
            i64.store
            i32.const 0
            i64.load offset=1052680
            local.set 5
            loop ;; label = @4
              local.get 5
              i64.const 1
              i64.add
              local.tee 6
              i64.eqz
              br_if 2 (;@2;)
              i32.const 0
              local.get 6
              i32.const 0
              i64.load offset=1052680
              local.tee 7
              local.get 7
              local.get 5
              i64.eq
              local.tee 2
              select
              i64.store offset=1052680
              local.get 7
              local.set 5
              local.get 2
              i32.eqz
              br_if 0 (;@4;)
            end
            local.get 4
            local.get 6
            i64.store offset=8
            local.get 0
            i32.load
            i32.eqz
            br_if 2 (;@1;)
            local.get 1
            i32.const 0
            i32.store offset=24
            local.get 1
            i32.const 1
            i32.store offset=12
            local.get 1
            i32.const 1049956
            i32.store offset=8
            local.get 1
            i64.const 4
            i64.store offset=16 align=4
            local.get 1
            i32.const 8
            i32.add
            i32.const 1050044
            call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
            unreachable
          end
          local.get 2
          local.get 3
          call $_ZN5alloc5alloc18handle_alloc_error17h7bdcb31f02c1333fE
          unreachable
        end
        call $_ZN3std6thread8ThreadId3new9exhausted17h614a6f8fed560664E
        unreachable
      end
      local.get 0
      local.get 4
      i32.store
      local.get 1
      i32.const 32
      i32.add
      global.set $__stack_pointer
      local.get 0
    )
    (func $_ZN3std6thread8ThreadId3new9exhausted17h614a6f8fed560664E (;101;) (type 7)
      (local i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 0
      global.set $__stack_pointer
      local.get 0
      i32.const 0
      i32.store offset=24
      local.get 0
      i32.const 1
      i32.store offset=12
      local.get 0
      i32.const 1050276
      i32.store offset=8
      local.get 0
      i64.const 4
      i64.store offset=16 align=4
      local.get 0
      i32.const 8
      i32.add
      i32.const 1050284
      call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
      unreachable
    )
    (func $_ZN4core9panicking13assert_failed17h56c9d3f3aa6ef6edE (;102;) (type 1) (param i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 2
      i32.const 1050060
      i32.store offset=12
      local.get 2
      local.get 0
      i32.store offset=8
      i32.const 0
      local.get 2
      i32.const 8
      i32.add
      i32.const 1050064
      local.get 2
      i32.const 12
      i32.add
      i32.const 1050064
      local.get 1
      i32.const 1050664
      call $_ZN4core9panicking19assert_failed_inner17ha7ed4ad68b2c3a67E
      unreachable
    )
    (func $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$10write_char17hbc9b5a514b56601bE (;103;) (type 4) (param i32 i32) (result i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 1
              i32.const 128
              i32.lt_u
              br_if 0 (;@4;)
              local.get 2
              i32.const 0
              i32.store offset=12
              local.get 1
              i32.const 2048
              i32.lt_u
              br_if 1 (;@3;)
              block ;; label = @5
                local.get 1
                i32.const 65536
                i32.ge_u
                br_if 0 (;@5;)
                local.get 2
                local.get 1
                i32.const 63
                i32.and
                i32.const 128
                i32.or
                i32.store8 offset=14
                local.get 2
                local.get 1
                i32.const 12
                i32.shr_u
                i32.const 224
                i32.or
                i32.store8 offset=12
                local.get 2
                local.get 1
                i32.const 6
                i32.shr_u
                i32.const 63
                i32.and
                i32.const 128
                i32.or
                i32.store8 offset=13
                i32.const 3
                local.set 1
                br 3 (;@2;)
              end
              local.get 2
              local.get 1
              i32.const 63
              i32.and
              i32.const 128
              i32.or
              i32.store8 offset=15
              local.get 2
              local.get 1
              i32.const 6
              i32.shr_u
              i32.const 63
              i32.and
              i32.const 128
              i32.or
              i32.store8 offset=14
              local.get 2
              local.get 1
              i32.const 12
              i32.shr_u
              i32.const 63
              i32.and
              i32.const 128
              i32.or
              i32.store8 offset=13
              local.get 2
              local.get 1
              i32.const 18
              i32.shr_u
              i32.const 7
              i32.and
              i32.const 240
              i32.or
              i32.store8 offset=12
              i32.const 4
              local.set 1
              br 2 (;@2;)
            end
            block ;; label = @4
              local.get 0
              i32.load offset=8
              local.tee 3
              local.get 0
              i32.load
              i32.ne
              br_if 0 (;@4;)
              local.get 0
              call $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$8grow_one17hd203cef64ba4a761E
            end
            local.get 0
            local.get 3
            i32.const 1
            i32.add
            i32.store offset=8
            local.get 0
            i32.load offset=4
            local.get 3
            i32.add
            local.get 1
            i32.store8
            br 2 (;@1;)
          end
          local.get 2
          local.get 1
          i32.const 63
          i32.and
          i32.const 128
          i32.or
          i32.store8 offset=13
          local.get 2
          local.get 1
          i32.const 6
          i32.shr_u
          i32.const 192
          i32.or
          i32.store8 offset=12
          i32.const 2
          local.set 1
        end
        block ;; label = @2
          local.get 0
          i32.load
          local.get 0
          i32.load offset=8
          local.tee 3
          i32.sub
          local.get 1
          i32.ge_u
          br_if 0 (;@2;)
          local.get 0
          local.get 3
          local.get 1
          call $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$7reserve21do_reserve_and_handle17h9cfcbcc2bed65e9aE
          local.get 0
          i32.load offset=8
          local.set 3
        end
        local.get 0
        i32.load offset=4
        local.get 3
        i32.add
        local.get 2
        i32.const 12
        i32.add
        local.get 1
        call $memcpy
        drop
        local.get 0
        local.get 3
        local.get 1
        i32.add
        i32.store offset=8
      end
      local.get 2
      i32.const 16
      i32.add
      global.set $__stack_pointer
      i32.const 0
    )
    (func $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$8grow_one17hd203cef64ba4a761E (;104;) (type 0) (param i32)
      (local i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      block ;; label = @1
        local.get 0
        i32.load
        local.tee 2
        i32.const 1
        i32.add
        local.tee 3
        br_if 0 (;@1;)
        i32.const 0
        i32.const 0
        call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
        unreachable
      end
      local.get 2
      i32.const 1
      i32.shl
      local.tee 4
      local.get 3
      local.get 4
      local.get 3
      i32.gt_u
      select
      local.tee 3
      i32.const 8
      local.get 3
      i32.const 8
      i32.gt_u
      select
      local.tee 3
      i32.const -1
      i32.xor
      i32.const 31
      i32.shr_u
      local.set 4
      block ;; label = @1
        block ;; label = @2
          local.get 2
          br_if 0 (;@2;)
          i32.const 0
          local.set 2
          br 1 (;@1;)
        end
        local.get 1
        local.get 2
        i32.store offset=28
        local.get 1
        local.get 0
        i32.load offset=4
        i32.store offset=20
        i32.const 1
        local.set 2
      end
      local.get 1
      local.get 2
      i32.store offset=24
      local.get 1
      i32.const 8
      i32.add
      local.get 4
      local.get 3
      local.get 1
      i32.const 20
      i32.add
      call $_ZN5alloc7raw_vec11finish_grow17hcb8db1e49770011eE
      block ;; label = @1
        local.get 1
        i32.load offset=8
        i32.eqz
        br_if 0 (;@1;)
        local.get 1
        i32.load offset=12
        local.get 1
        i32.load offset=16
        call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
        unreachable
      end
      local.get 1
      i32.load offset=12
      local.set 2
      local.get 0
      local.get 3
      i32.store
      local.get 0
      local.get 2
      i32.store offset=4
      local.get 1
      i32.const 32
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$9write_str17h29fbbe981c255749E (;105;) (type 2) (param i32 i32 i32) (result i32)
      (local i32)
      block ;; label = @1
        local.get 0
        i32.load
        local.get 0
        i32.load offset=8
        local.tee 3
        i32.sub
        local.get 2
        i32.ge_u
        br_if 0 (;@1;)
        local.get 0
        local.get 3
        local.get 2
        call $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$7reserve21do_reserve_and_handle17h9cfcbcc2bed65e9aE
        local.get 0
        i32.load offset=8
        local.set 3
      end
      local.get 0
      i32.load offset=4
      local.get 3
      i32.add
      local.get 1
      local.get 2
      call $memcpy
      drop
      local.get 0
      local.get 3
      local.get 2
      i32.add
      i32.store offset=8
      i32.const 0
    )
    (func $_ZN5alloc4sync16Arc$LT$T$C$A$GT$9drop_slow17h247cf69885394f8aE (;106;) (type 0) (param i32)
      (local i32)
      block ;; label = @1
        local.get 0
        i32.load
        local.tee 0
        i32.const 12
        i32.add
        i32.load
        local.tee 1
        i32.eqz
        br_if 0 (;@1;)
        local.get 0
        i32.const 16
        i32.add
        i32.load
        local.get 1
        i32.const 1
        call $__rust_dealloc
      end
      block ;; label = @1
        local.get 0
        i32.const -1
        i32.eq
        br_if 0 (;@1;)
        local.get 0
        local.get 0
        i32.load offset=4
        local.tee 1
        i32.const -1
        i32.add
        i32.store offset=4
        local.get 1
        i32.const 1
        i32.ne
        br_if 0 (;@1;)
        local.get 0
        i32.const 24
        i32.const 4
        call $__rust_dealloc
      end
    )
    (func $_ZN5alloc7raw_vec11finish_grow17hcb8db1e49770011eE (;107;) (type 10) (param i32 i32 i32 i32)
      (local i32)
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 1
            i32.eqz
            br_if 0 (;@3;)
            local.get 2
            i32.const 0
            i32.lt_s
            br_if 1 (;@2;)
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 3
                  i32.load offset=4
                  i32.eqz
                  br_if 0 (;@6;)
                  block ;; label = @7
                    local.get 3
                    i32.load offset=8
                    local.tee 4
                    br_if 0 (;@7;)
                    block ;; label = @8
                      local.get 2
                      br_if 0 (;@8;)
                      local.get 1
                      local.set 3
                      br 4 (;@4;)
                    end
                    i32.const 0
                    i32.load8_u offset=1052649
                    drop
                    br 2 (;@5;)
                  end
                  local.get 3
                  i32.load
                  local.get 4
                  local.get 1
                  local.get 2
                  call $__rust_realloc
                  local.set 3
                  br 2 (;@4;)
                end
                block ;; label = @6
                  local.get 2
                  br_if 0 (;@6;)
                  local.get 1
                  local.set 3
                  br 2 (;@4;)
                end
                i32.const 0
                i32.load8_u offset=1052649
                drop
              end
              local.get 2
              local.get 1
              call $__rust_alloc
              local.set 3
            end
            block ;; label = @4
              local.get 3
              i32.eqz
              br_if 0 (;@4;)
              local.get 0
              local.get 2
              i32.store offset=8
              local.get 0
              local.get 3
              i32.store offset=4
              local.get 0
              i32.const 0
              i32.store
              return
            end
            local.get 0
            local.get 2
            i32.store offset=8
            local.get 0
            local.get 1
            i32.store offset=4
            br 2 (;@1;)
          end
          local.get 0
          i32.const 0
          i32.store offset=4
          br 1 (;@1;)
        end
        local.get 0
        i32.const 0
        i32.store offset=4
      end
      local.get 0
      i32.const 1
      i32.store
    )
    (func $_ZN3std2io5Write9write_fmt17h8e312ff03507c2b0E (;108;) (type 3) (param i32 i32 i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 3
      i32.const 4
      i32.store8 offset=8
      local.get 3
      local.get 1
      i32.store offset=16
      block ;; label = @1
        block ;; label = @2
          local.get 3
          i32.const 8
          i32.add
          i32.const 1050120
          local.get 2
          call $_ZN4core3fmt5write17h86ae7d4da82da0b2E
          br_if 0 (;@2;)
          local.get 0
          i32.const 4
          i32.store8
          local.get 3
          i32.load offset=12
          local.set 2
          block ;; label = @3
            local.get 3
            i32.load8_u offset=8
            local.tee 1
            i32.const 4
            i32.gt_u
            br_if 0 (;@3;)
            local.get 1
            i32.const 3
            i32.ne
            br_if 2 (;@1;)
          end
          local.get 2
          i32.load
          local.set 0
          block ;; label = @3
            local.get 2
            i32.const 4
            i32.add
            i32.load
            local.tee 1
            i32.load
            local.tee 4
            i32.eqz
            br_if 0 (;@3;)
            local.get 0
            local.get 4
            call_indirect (type 0)
          end
          block ;; label = @3
            local.get 1
            i32.load offset=4
            local.tee 4
            i32.eqz
            br_if 0 (;@3;)
            local.get 0
            local.get 4
            local.get 1
            i32.load offset=8
            call $__rust_dealloc
          end
          local.get 2
          i32.const 12
          i32.const 4
          call $__rust_dealloc
          br 1 (;@1;)
        end
        block ;; label = @2
          local.get 3
          i32.load8_u offset=8
          i32.const 4
          i32.eq
          br_if 0 (;@2;)
          local.get 0
          local.get 3
          i64.load offset=8
          i64.store align=4
          br 1 (;@1;)
        end
        local.get 3
        i32.const 0
        i32.store offset=40
        local.get 3
        i32.const 1
        i32.store offset=28
        local.get 3
        i32.const 1050512
        i32.store offset=24
        local.get 3
        i64.const 4
        i64.store offset=32 align=4
        local.get 3
        i32.const 24
        i32.add
        i32.const 1050520
        call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
        unreachable
      end
      local.get 3
      i32.const 48
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN3std3sys3pal4wasi7helpers14abort_internal17hf00157e338c93fc6E (;109;) (type 7)
      call $abort
      unreachable
    )
    (func $_ZN3std3env11current_dir17h9dc33850aa2f42e6E (;110;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      i32.const 0
      i32.load8_u offset=1052649
      drop
      i32.const 512
      local.set 2
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  i32.const 512
                  i32.const 1
                  call $__rust_alloc
                  local.tee 3
                  i32.eqz
                  br_if 0 (;@6;)
                  local.get 1
                  local.get 3
                  i32.store offset=8
                  local.get 1
                  i32.const 512
                  i32.store offset=4
                  local.get 3
                  i32.const 512
                  call $getcwd
                  br_if 3 (;@3;)
                  block ;; label = @7
                    i32.const 0
                    i32.load offset=1053204
                    local.tee 2
                    i32.const 68
                    i32.ne
                    br_if 0 (;@7;)
                    i32.const 512
                    local.set 2
                    br 2 (;@5;)
                  end
                  local.get 0
                  local.get 2
                  i32.store offset=8
                  local.get 0
                  i64.const 2147483648
                  i64.store align=4
                  i32.const 512
                  local.set 2
                  br 2 (;@4;)
                end
                i32.const 1
                i32.const 512
                call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
                unreachable
              end
              loop ;; label = @5
                local.get 1
                local.get 2
                i32.store offset=12
                local.get 1
                i32.const 4
                i32.add
                local.get 2
                i32.const 1
                call $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$7reserve21do_reserve_and_handle17h9cfcbcc2bed65e9aE
                local.get 1
                i32.load offset=8
                local.tee 3
                local.get 1
                i32.load offset=4
                local.tee 2
                call $getcwd
                br_if 2 (;@3;)
                i32.const 0
                i32.load offset=1053204
                local.tee 4
                i32.const 68
                i32.eq
                br_if 0 (;@5;)
              end
              local.get 0
              local.get 4
              i32.store offset=8
              local.get 0
              i64.const 2147483648
              i64.store align=4
              local.get 2
              i32.eqz
              br_if 2 (;@2;)
            end
            local.get 3
            local.get 2
            i32.const 1
            call $__rust_dealloc
            br 1 (;@2;)
          end
          local.get 1
          local.get 3
          call $strlen
          local.tee 4
          i32.store offset=12
          block ;; label = @3
            local.get 2
            local.get 4
            i32.le_u
            br_if 0 (;@3;)
            block ;; label = @4
              block ;; label = @5
                local.get 4
                br_if 0 (;@5;)
                i32.const 1
                local.set 5
                local.get 3
                local.get 2
                i32.const 1
                call $__rust_dealloc
                br 1 (;@4;)
              end
              local.get 3
              local.get 2
              i32.const 1
              local.get 4
              call $__rust_realloc
              local.tee 5
              i32.eqz
              br_if 3 (;@1;)
            end
            local.get 1
            local.get 4
            i32.store offset=4
            local.get 1
            local.get 5
            i32.store offset=8
          end
          local.get 0
          local.get 1
          i64.load offset=4 align=4
          i64.store align=4
          local.get 0
          i32.const 8
          i32.add
          local.get 1
          i32.const 4
          i32.add
          i32.const 8
          i32.add
          i32.load
          i32.store
        end
        local.get 1
        i32.const 16
        i32.add
        global.set $__stack_pointer
        return
      end
      i32.const 1
      local.get 4
      call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
      unreachable
    )
    (func $_ZN3std3env7_var_os17h72db8e6ed545f77cE (;111;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32)
      global.get $__stack_pointer
      i32.const 416
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 2
            i32.const 383
            i32.gt_u
            br_if 0 (;@3;)
            local.get 3
            i32.const 20
            i32.add
            local.get 1
            local.get 2
            call $memcpy
            drop
            local.get 3
            i32.const 20
            i32.add
            local.get 2
            i32.add
            i32.const 0
            i32.store8
            local.get 3
            i32.const 404
            i32.add
            local.get 3
            i32.const 20
            i32.add
            local.get 2
            i32.const 1
            i32.add
            call $_ZN4core3ffi5c_str4CStr19from_bytes_with_nul17h4d0a9cda8d5df576E
            block ;; label = @4
              local.get 3
              i32.load offset=404
              br_if 0 (;@4;)
              block ;; label = @5
                local.get 3
                i32.load offset=408
                call $getenv
                local.tee 1
                br_if 0 (;@5;)
                i32.const -2147483648
                local.set 2
                br 3 (;@2;)
              end
              block ;; label = @5
                block ;; label = @6
                  local.get 1
                  call $strlen
                  local.tee 2
                  br_if 0 (;@6;)
                  i32.const 1
                  local.set 4
                  br 1 (;@5;)
                end
                i32.const 0
                local.set 5
                local.get 2
                i32.const 0
                i32.lt_s
                br_if 4 (;@1;)
                i32.const 0
                i32.load8_u offset=1052649
                drop
                i32.const 1
                local.set 5
                local.get 2
                i32.const 1
                call $__rust_alloc
                local.tee 4
                i32.eqz
                br_if 4 (;@1;)
              end
              local.get 4
              local.get 1
              local.get 2
              call $memcpy
              local.set 1
              local.get 3
              local.get 2
              i32.store offset=16
              local.get 3
              local.get 1
              i32.store offset=12
              br 2 (;@2;)
            end
            local.get 3
            i32.const 0
            i64.load offset=1050736
            i64.store offset=12 align=4
            i32.const -2147483647
            local.set 2
            br 1 (;@2;)
          end
          local.get 3
          i32.const 8
          i32.add
          local.get 1
          local.get 2
          call $_ZN3std3sys3pal6common14small_c_string24run_with_cstr_allocating17h4862ed7e6acaafb1E
          local.get 3
          i32.load offset=8
          local.set 2
        end
        block ;; label = @2
          block ;; label = @3
            local.get 2
            i32.const -2147483647
            i32.eq
            br_if 0 (;@3;)
            local.get 0
            local.get 3
            i64.load offset=12 align=4
            i64.store offset=4 align=4
            local.get 0
            local.get 2
            i32.store
            br 1 (;@2;)
          end
          block ;; label = @3
            local.get 3
            i32.load8_u offset=12
            i32.const 3
            i32.ne
            br_if 0 (;@3;)
            local.get 3
            i32.load offset=16
            local.tee 2
            i32.load
            local.set 4
            block ;; label = @4
              local.get 2
              i32.const 4
              i32.add
              i32.load
              local.tee 1
              i32.load
              local.tee 5
              i32.eqz
              br_if 0 (;@4;)
              local.get 4
              local.get 5
              call_indirect (type 0)
            end
            block ;; label = @4
              local.get 1
              i32.load offset=4
              local.tee 5
              i32.eqz
              br_if 0 (;@4;)
              local.get 4
              local.get 5
              local.get 1
              i32.load offset=8
              call $__rust_dealloc
            end
            local.get 2
            i32.const 12
            i32.const 4
            call $__rust_dealloc
          end
          local.get 0
          i32.const -2147483648
          i32.store
        end
        local.get 3
        i32.const 416
        i32.add
        global.set $__stack_pointer
        return
      end
      local.get 5
      local.get 2
      call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
      unreachable
    )
    (func $_ZN3std3sys3pal6common14small_c_string24run_with_cstr_allocating17h4862ed7e6acaafb1E (;112;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 3
      local.get 1
      local.get 2
      call $_ZN72_$LT$$RF$str$u20$as$u20$alloc..ffi..c_str..CString..new..SpecNewImpl$GT$13spec_new_impl17h4aa85f42dd29275cE
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 3
            i32.load
            local.tee 2
            i32.const -2147483648
            i32.ne
            br_if 0 (;@3;)
            local.get 3
            i32.load offset=8
            local.set 1
            block ;; label = @4
              block ;; label = @5
                local.get 3
                i32.load offset=4
                local.tee 4
                call $getenv
                local.tee 5
                br_if 0 (;@5;)
                local.get 0
                i32.const -2147483648
                i32.store
                br 1 (;@4;)
              end
              block ;; label = @5
                block ;; label = @6
                  local.get 5
                  call $strlen
                  local.tee 2
                  br_if 0 (;@6;)
                  i32.const 1
                  local.set 6
                  br 1 (;@5;)
                end
                i32.const 0
                local.set 7
                local.get 2
                i32.const 0
                i32.lt_s
                br_if 3 (;@2;)
                i32.const 0
                i32.load8_u offset=1052649
                drop
                i32.const 1
                local.set 7
                local.get 2
                i32.const 1
                call $__rust_alloc
                local.tee 6
                i32.eqz
                br_if 3 (;@2;)
              end
              local.get 6
              local.get 5
              local.get 2
              call $memcpy
              local.set 5
              local.get 0
              local.get 2
              i32.store offset=8
              local.get 0
              local.get 5
              i32.store offset=4
              local.get 0
              local.get 2
              i32.store
            end
            local.get 4
            i32.const 0
            i32.store8
            local.get 1
            i32.eqz
            br_if 2 (;@1;)
            local.get 4
            local.get 1
            i32.const 1
            call $__rust_dealloc
            br 2 (;@1;)
          end
          local.get 0
          i32.const -2147483647
          i32.store
          local.get 0
          i32.const 0
          i64.load offset=1050736
          i64.store offset=4 align=4
          local.get 2
          i32.eqz
          br_if 1 (;@1;)
          local.get 3
          i32.load offset=4
          local.get 2
          i32.const 1
          call $__rust_dealloc
          br 1 (;@1;)
        end
        local.get 7
        local.get 2
        call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
        unreachable
      end
      local.get 3
      i32.const 16
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN3std3sys12thread_local12static_local20LazyStorage$LT$T$GT$10initialize17hed142702bdbbfc37E (;113;) (type 0) (param i32)
      (local i32 i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      i32.const 0
      local.set 2
      block ;; label = @1
        local.get 0
        i32.eqz
        br_if 0 (;@1;)
        local.get 0
        i32.load
        local.set 3
        local.get 0
        i32.const 0
        i32.store
        local.get 0
        i32.load offset=4
        i32.const 0
        local.get 3
        select
        local.set 2
      end
      i32.const 0
      i32.load8_u offset=1052696
      local.set 3
      i32.const 0
      i32.const 1
      i32.store8 offset=1052696
      i32.const 0
      i32.load offset=1052700
      local.set 0
      i32.const 0
      local.get 2
      i32.store offset=1052700
      local.get 1
      local.get 0
      i32.store offset=12
      local.get 1
      local.get 3
      i32.store offset=8
      block ;; label = @1
        local.get 3
        i32.eqz
        br_if 0 (;@1;)
        local.get 0
        i32.eqz
        br_if 0 (;@1;)
        local.get 0
        local.get 0
        i32.load
        local.tee 3
        i32.const -1
        i32.add
        i32.store
        local.get 3
        i32.const 1
        i32.ne
        br_if 0 (;@1;)
        local.get 1
        i32.const 12
        i32.add
        call $_ZN5alloc4sync16Arc$LT$T$C$A$GT$9drop_slow17h247cf69885394f8aE
      end
      local.get 1
      i32.const 16
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN3std2io5Write9write_fmt17hb21ea30df3210b70E (;114;) (type 3) (param i32 i32 i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 3
      i32.const 4
      i32.store8 offset=8
      local.get 3
      local.get 1
      i32.store offset=16
      block ;; label = @1
        block ;; label = @2
          local.get 3
          i32.const 8
          i32.add
          i32.const 1050144
          local.get 2
          call $_ZN4core3fmt5write17h86ae7d4da82da0b2E
          br_if 0 (;@2;)
          local.get 0
          i32.const 4
          i32.store8
          local.get 3
          i32.load offset=12
          local.set 2
          block ;; label = @3
            local.get 3
            i32.load8_u offset=8
            local.tee 1
            i32.const 4
            i32.gt_u
            br_if 0 (;@3;)
            local.get 1
            i32.const 3
            i32.ne
            br_if 2 (;@1;)
          end
          local.get 2
          i32.load
          local.set 0
          block ;; label = @3
            local.get 2
            i32.const 4
            i32.add
            i32.load
            local.tee 1
            i32.load
            local.tee 4
            i32.eqz
            br_if 0 (;@3;)
            local.get 0
            local.get 4
            call_indirect (type 0)
          end
          block ;; label = @3
            local.get 1
            i32.load offset=4
            local.tee 4
            i32.eqz
            br_if 0 (;@3;)
            local.get 0
            local.get 4
            local.get 1
            i32.load offset=8
            call $__rust_dealloc
          end
          local.get 2
          i32.const 12
          i32.const 4
          call $__rust_dealloc
          br 1 (;@1;)
        end
        block ;; label = @2
          local.get 3
          i32.load8_u offset=8
          i32.const 4
          i32.eq
          br_if 0 (;@2;)
          local.get 0
          local.get 3
          i64.load offset=8
          i64.store align=4
          br 1 (;@1;)
        end
        local.get 3
        i32.const 0
        i32.store offset=40
        local.get 3
        i32.const 1
        i32.store offset=28
        local.get 3
        i32.const 1050512
        i32.store offset=24
        local.get 3
        i64.const 4
        i64.store offset=32 align=4
        local.get 3
        i32.const 24
        i32.add
        i32.const 1050520
        call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
        unreachable
      end
      local.get 3
      i32.const 48
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN80_$LT$std..io..Write..write_fmt..Adapter$LT$T$GT$$u20$as$u20$core..fmt..Write$GT$9write_str17h8be809f679f644a4E (;115;) (type 2) (param i32 i32 i32) (result i32)
      (local i32)
      block ;; label = @1
        local.get 0
        i32.load offset=8
        local.tee 0
        i32.load
        local.get 0
        i32.load offset=8
        local.tee 3
        i32.sub
        local.get 2
        i32.ge_u
        br_if 0 (;@1;)
        local.get 0
        local.get 3
        local.get 2
        call $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$7reserve21do_reserve_and_handle17h9cfcbcc2bed65e9aE
        local.get 0
        i32.load offset=8
        local.set 3
      end
      local.get 0
      i32.load offset=4
      local.get 3
      i32.add
      local.get 1
      local.get 2
      call $memcpy
      drop
      local.get 0
      local.get 3
      local.get 2
      i32.add
      i32.store offset=8
      i32.const 0
    )
    (func $_ZN3std5panic19get_backtrace_style17he3c147f4917a62b7E (;116;) (type 12) (result i32)
      (local i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 0
      global.set $__stack_pointer
      i32.const 1
      local.set 1
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                i32.const 0
                i32.load8_u offset=1052652
                br_table 3 (;@2;) 1 (;@4;) 4 (;@1;) 2 (;@3;) 0 (;@5;)
              end
              i32.const 1050080
              i32.const 40
              i32.const 1050560
              call $_ZN4core9panicking5panic17h9f2e0421338a58efE
              unreachable
            end
            i32.const 0
            local.set 1
            br 2 (;@1;)
          end
          i32.const 2
          local.set 1
          br 1 (;@1;)
        end
        local.get 0
        i32.const 4
        i32.add
        i32.const 1050305
        i32.const 14
        call $_ZN3std3env7_var_os17h72db8e6ed545f77cE
        block ;; label = @2
          block ;; label = @3
            local.get 0
            i32.load offset=4
            local.tee 2
            i32.const -2147483648
            i32.eq
            br_if 0 (;@3;)
            i32.const 0
            local.set 1
            local.get 0
            i32.load offset=8
            local.set 3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 0
                  i32.load offset=12
                  i32.const -1
                  i32.add
                  br_table 0 (;@6;) 2 (;@4;) 2 (;@4;) 1 (;@5;) 2 (;@4;)
                end
                local.get 3
                i32.load8_u
                i32.const 48
                i32.eq
                i32.const 1
                i32.shl
                local.set 1
                br 1 (;@4;)
              end
              local.get 3
              i32.const 1050576
              i32.const 4
              call $memcmp
              i32.eqz
              local.set 1
            end
            block ;; label = @4
              local.get 2
              i32.eqz
              br_if 0 (;@4;)
              local.get 3
              local.get 2
              i32.const 1
              call $__rust_dealloc
            end
            local.get 1
            i32.const 1
            i32.add
            local.set 2
            br 1 (;@2;)
          end
          i32.const 3
          local.set 2
          i32.const 2
          local.set 1
        end
        i32.const 0
        local.get 2
        i32.store8 offset=1052652
      end
      local.get 0
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 1
    )
    (func $_ZN3std7process5abort17he31877bb916f1bf6E (;117;) (type 7)
      call $_ZN3std3sys3pal4wasi7helpers14abort_internal17hf00157e338c93fc6E
      unreachable
    )
    (func $_ZN91_$LT$std..sys_common..backtrace.._print..DisplayBacktrace$u20$as$u20$core..fmt..Display$GT$3fmt17h6f9cc2dccf01fc6bE (;118;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32 i64 i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 1
      i32.load offset=24
      local.set 3
      local.get 1
      i32.load offset=20
      local.set 4
      local.get 0
      i32.load8_u
      local.set 0
      local.get 2
      i32.const 4
      i32.add
      call $_ZN3std3env11current_dir17h9dc33850aa2f42e6E
      local.get 2
      i64.load offset=8 align=4
      local.set 5
      block ;; label = @1
        local.get 2
        i32.load offset=4
        local.tee 1
        i32.const -2147483648
        i32.ne
        br_if 0 (;@1;)
        local.get 5
        i64.const 255
        i64.and
        i64.const 3
        i64.ne
        br_if 0 (;@1;)
        local.get 5
        i64.const 32
        i64.shr_u
        i32.wrap_i64
        local.tee 6
        i32.load
        local.set 7
        block ;; label = @2
          local.get 6
          i32.const 4
          i32.add
          i32.load
          local.tee 8
          i32.load
          local.tee 9
          i32.eqz
          br_if 0 (;@2;)
          local.get 7
          local.get 9
          call_indirect (type 0)
        end
        block ;; label = @2
          local.get 8
          i32.load offset=4
          local.tee 9
          i32.eqz
          br_if 0 (;@2;)
          local.get 7
          local.get 9
          local.get 8
          i32.load offset=8
          call $__rust_dealloc
        end
        local.get 6
        i32.const 12
        i32.const 4
        call $__rust_dealloc
      end
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 4
            i32.const 1050744
            i32.const 17
            local.get 3
            i32.load offset=12
            local.tee 3
            call_indirect (type 2)
            br_if 0 (;@3;)
            block ;; label = @4
              local.get 0
              i32.const 255
              i32.and
              br_if 0 (;@4;)
              local.get 4
              i32.const 1050761
              i32.const 88
              local.get 3
              call_indirect (type 2)
              br_if 1 (;@3;)
            end
            i32.const 0
            local.set 4
            local.get 1
            i32.const -2147483648
            i32.or
            i32.const -2147483648
            i32.eq
            br_if 2 (;@1;)
            br 1 (;@2;)
          end
          i32.const 1
          local.set 4
          local.get 1
          i32.const -2147483648
          i32.or
          i32.const -2147483648
          i32.eq
          br_if 1 (;@1;)
        end
        local.get 5
        i32.wrap_i64
        local.get 1
        i32.const 1
        call $__rust_dealloc
      end
      local.get 2
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 4
    )
    (func $_ZN3std10sys_common9backtrace26__rust_end_short_backtrace17h78f6f5c4c3216f80E (;119;) (type 0) (param i32)
      local.get 0
      call $_ZN3std9panicking19begin_panic_handler28_$u7b$$u7b$closure$u7d$$u7d$17he907e26664fa9cf6E
      unreachable
    )
    (func $_ZN3std9panicking19begin_panic_handler28_$u7b$$u7b$closure$u7d$$u7d$17he907e26664fa9cf6E (;120;) (type 0) (param i32)
      (local i32 i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      local.get 0
      i32.load
      local.tee 2
      i32.load offset=12
      local.set 3
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 2
              i32.load offset=4
              br_table 0 (;@4;) 1 (;@3;) 2 (;@2;)
            end
            local.get 3
            br_if 1 (;@2;)
            i32.const 1
            local.set 2
            i32.const 0
            local.set 3
            br 2 (;@1;)
          end
          local.get 3
          br_if 0 (;@2;)
          local.get 2
          i32.load
          local.tee 2
          i32.load offset=4
          local.set 3
          local.get 2
          i32.load
          local.set 2
          br 1 (;@1;)
        end
        local.get 1
        local.get 2
        i32.store offset=12
        local.get 1
        i32.const -2147483648
        i32.store
        local.get 1
        i32.const 1051236
        local.get 0
        i32.load offset=4
        local.tee 2
        i32.load offset=8
        local.get 0
        i32.load offset=8
        local.get 2
        i32.load8_u offset=16
        local.get 2
        i32.load8_u offset=17
        call $_ZN3std9panicking20rust_panic_with_hook17h674e95a151c89456E
        unreachable
      end
      local.get 1
      local.get 3
      i32.store offset=4
      local.get 1
      local.get 2
      i32.store
      local.get 1
      i32.const 1051216
      local.get 0
      i32.load offset=4
      local.tee 2
      i32.load offset=8
      local.get 0
      i32.load offset=8
      local.get 2
      i32.load8_u offset=16
      local.get 2
      i32.load8_u offset=17
      call $_ZN3std9panicking20rust_panic_with_hook17h674e95a151c89456E
      unreachable
    )
    (func $_ZN3std5alloc24default_alloc_error_hook17h4f8dbbbf0f42e7f9E (;121;) (type 1) (param i32 i32)
      (local i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      block ;; label = @1
        i32.const 0
        i32.load8_u offset=1052648
        br_if 0 (;@1;)
        local.get 2
        i32.const 2
        i32.store offset=12
        local.get 2
        i32.const 1050884
        i32.store offset=8
        local.get 2
        i64.const 1
        i64.store offset=20 align=4
        local.get 2
        i32.const 5
        i64.extend_i32_u
        i64.const 32
        i64.shl
        local.get 2
        i32.const 40
        i32.add
        i64.extend_i32_u
        i64.or
        i64.store offset=32
        local.get 2
        local.get 1
        i32.store offset=40
        local.get 2
        local.get 2
        i32.const 32
        i32.add
        i32.store offset=16
        local.get 2
        local.get 2
        i32.const 47
        i32.add
        local.get 2
        i32.const 8
        i32.add
        call $_ZN3std2io5Write9write_fmt17h8e312ff03507c2b0E
        local.get 2
        i32.load offset=4
        local.set 3
        block ;; label = @2
          block ;; label = @3
            local.get 2
            i32.load8_u
            local.tee 1
            i32.const 4
            i32.gt_u
            br_if 0 (;@3;)
            local.get 1
            i32.const 3
            i32.ne
            br_if 1 (;@2;)
          end
          local.get 3
          i32.load
          local.set 4
          block ;; label = @3
            local.get 3
            i32.const 4
            i32.add
            i32.load
            local.tee 1
            i32.load
            local.tee 5
            i32.eqz
            br_if 0 (;@3;)
            local.get 4
            local.get 5
            call_indirect (type 0)
          end
          block ;; label = @3
            local.get 1
            i32.load offset=4
            local.tee 5
            i32.eqz
            br_if 0 (;@3;)
            local.get 4
            local.get 5
            local.get 1
            i32.load offset=8
            call $__rust_dealloc
          end
          local.get 3
          i32.const 12
          i32.const 4
          call $__rust_dealloc
        end
        local.get 2
        i32.const 48
        i32.add
        global.set $__stack_pointer
        return
      end
      local.get 2
      i32.const 2
      i32.store offset=12
      local.get 2
      i32.const 1050916
      i32.store offset=8
      local.get 2
      i64.const 1
      i64.store offset=20 align=4
      local.get 2
      local.get 1
      i32.store
      local.get 2
      i32.const 5
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.get 2
      i64.extend_i32_u
      i64.or
      i64.store offset=32
      local.get 2
      local.get 2
      i32.const 32
      i32.add
      i32.store offset=16
      local.get 2
      i32.const 8
      i32.add
      i32.const 1050956
      call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
      unreachable
    )
    (func $__rdl_alloc (;122;) (type 4) (param i32 i32) (result i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 1
            i32.const 8
            i32.gt_u
            br_if 0 (;@3;)
            local.get 1
            local.get 0
            i32.le_u
            br_if 1 (;@2;)
          end
          local.get 2
          i32.const 0
          i32.store offset=12
          local.get 2
          i32.const 12
          i32.add
          local.get 1
          i32.const 4
          local.get 1
          i32.const 4
          i32.gt_u
          select
          local.get 0
          call $posix_memalign
          local.set 1
          i32.const 0
          local.get 2
          i32.load offset=12
          local.get 1
          select
          local.set 1
          br 1 (;@1;)
        end
        local.get 0
        call $malloc
        local.set 1
      end
      local.get 2
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 1
    )
    (func $__rdl_dealloc (;123;) (type 3) (param i32 i32 i32)
      local.get 0
      call $free
    )
    (func $__rdl_realloc (;124;) (type 6) (param i32 i32 i32 i32) (result i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 4
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 2
            i32.const 8
            i32.gt_u
            br_if 0 (;@3;)
            local.get 2
            local.get 3
            i32.le_u
            br_if 1 (;@2;)
          end
          i32.const 0
          local.set 5
          local.get 4
          i32.const 0
          i32.store offset=12
          local.get 4
          i32.const 12
          i32.add
          local.get 2
          i32.const 4
          local.get 2
          i32.const 4
          i32.gt_u
          select
          local.get 3
          call $posix_memalign
          br_if 1 (;@1;)
          local.get 4
          i32.load offset=12
          local.tee 2
          i32.eqz
          br_if 1 (;@1;)
          local.get 2
          local.get 0
          local.get 1
          local.get 3
          local.get 1
          local.get 3
          i32.lt_u
          select
          call $memcpy
          local.set 2
          local.get 0
          call $free
          local.get 2
          local.set 5
          br 1 (;@1;)
        end
        local.get 0
        local.get 3
        call $realloc
        local.set 5
      end
      local.get 4
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 5
    )
    (func $_ZN3std9panicking12default_hook28_$u7b$$u7b$closure$u7d$$u7d$17h6f528641705733ebE (;125;) (type 3) (param i32 i32 i32)
      (local i32 i64 i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 64
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 3
      i32.const 1051048
      i32.store
      local.get 3
      i64.const 3
      i64.store offset=12 align=4
      local.get 3
      i32.const 6
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.tee 4
      local.get 0
      i64.load32_u offset=8
      i64.or
      i64.store offset=48
      local.get 3
      i32.const 7
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.get 0
      i64.load32_u offset=4
      i64.or
      i64.store offset=40
      local.get 3
      local.get 4
      local.get 0
      i64.load32_u
      i64.or
      i64.store offset=32
      local.get 3
      local.get 3
      i32.const 32
      i32.add
      i32.store offset=8
      local.get 3
      i32.const 4
      i32.store offset=4
      local.get 3
      i32.const 24
      i32.add
      local.get 1
      local.get 3
      local.get 2
      call_indirect (type 3)
      local.get 3
      i32.load offset=28
      local.set 5
      block ;; label = @1
        block ;; label = @2
          local.get 3
          i32.load8_u offset=24
          local.tee 6
          i32.const 4
          i32.gt_u
          br_if 0 (;@2;)
          local.get 6
          i32.const 3
          i32.ne
          br_if 1 (;@1;)
        end
        local.get 5
        i32.load
        local.set 7
        block ;; label = @2
          local.get 5
          i32.const 4
          i32.add
          i32.load
          local.tee 6
          i32.load
          local.tee 8
          i32.eqz
          br_if 0 (;@2;)
          local.get 7
          local.get 8
          call_indirect (type 0)
        end
        block ;; label = @2
          local.get 6
          i32.load offset=4
          local.tee 8
          i32.eqz
          br_if 0 (;@2;)
          local.get 7
          local.get 8
          local.get 6
          i32.load offset=8
          call $__rust_dealloc
        end
        local.get 5
        i32.const 12
        i32.const 4
        call $__rust_dealloc
      end
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 0
                  i32.load offset=12
                  i32.load8_u
                  br_table 0 (;@6;) 1 (;@5;) 2 (;@4;) 3 (;@3;) 0 (;@6;)
                end
                i32.const 0
                i32.load8_u offset=1052653
                local.set 0
                i32.const 0
                i32.const 1
                i32.store8 offset=1052653
                local.get 3
                local.get 0
                i32.store8
                local.get 0
                br_if 3 (;@2;)
                local.get 3
                i32.const 1
                i32.store offset=36
                local.get 3
                i32.const 1050320
                i32.store offset=32
                local.get 3
                i64.const 1
                i64.store offset=44 align=4
                local.get 3
                i32.const 8
                i64.extend_i32_u
                i64.const 32
                i64.shl
                local.get 3
                i32.const 63
                i32.add
                i64.extend_i32_u
                i64.or
                i64.store
                local.get 3
                i32.const 0
                i32.store8 offset=63
                local.get 3
                local.get 3
                i32.store offset=40
                local.get 3
                i32.const 24
                i32.add
                local.get 1
                local.get 3
                i32.const 32
                i32.add
                local.get 2
                call_indirect (type 3)
                i32.const 0
                i32.const 0
                i32.store8 offset=1052653
                local.get 3
                i32.load offset=28
                local.set 1
                block ;; label = @6
                  local.get 3
                  i32.load8_u offset=24
                  local.tee 0
                  i32.const 4
                  i32.gt_u
                  br_if 0 (;@6;)
                  local.get 0
                  i32.const 3
                  i32.ne
                  br_if 3 (;@3;)
                end
                local.get 1
                i32.load
                local.set 2
                block ;; label = @6
                  local.get 1
                  i32.const 4
                  i32.add
                  i32.load
                  local.tee 0
                  i32.load
                  local.tee 6
                  i32.eqz
                  br_if 0 (;@6;)
                  local.get 2
                  local.get 6
                  call_indirect (type 0)
                end
                block ;; label = @6
                  local.get 0
                  i32.load offset=4
                  local.tee 6
                  i32.eqz
                  br_if 0 (;@6;)
                  local.get 2
                  local.get 6
                  local.get 0
                  i32.load offset=8
                  call $__rust_dealloc
                end
                local.get 1
                i32.const 12
                i32.const 4
                call $__rust_dealloc
                br 2 (;@3;)
              end
              i32.const 0
              i32.load8_u offset=1052653
              local.set 0
              i32.const 0
              i32.const 1
              i32.store8 offset=1052653
              local.get 3
              local.get 0
              i32.store8
              local.get 0
              br_if 3 (;@1;)
              local.get 3
              i32.const 1
              i32.store offset=36
              local.get 3
              i32.const 1050320
              i32.store offset=32
              local.get 3
              i64.const 1
              i64.store offset=44 align=4
              local.get 3
              i32.const 8
              i64.extend_i32_u
              i64.const 32
              i64.shl
              local.get 3
              i32.const 63
              i32.add
              i64.extend_i32_u
              i64.or
              i64.store
              local.get 3
              i32.const 1
              i32.store8 offset=63
              local.get 3
              local.get 3
              i32.store offset=40
              local.get 3
              i32.const 24
              i32.add
              local.get 1
              local.get 3
              i32.const 32
              i32.add
              local.get 2
              call_indirect (type 3)
              i32.const 0
              i32.const 0
              i32.store8 offset=1052653
              local.get 3
              i32.load offset=28
              local.set 1
              block ;; label = @5
                local.get 3
                i32.load8_u offset=24
                local.tee 0
                i32.const 4
                i32.gt_u
                br_if 0 (;@5;)
                local.get 0
                i32.const 3
                i32.ne
                br_if 2 (;@3;)
              end
              local.get 1
              i32.load
              local.set 2
              block ;; label = @5
                local.get 1
                i32.const 4
                i32.add
                i32.load
                local.tee 0
                i32.load
                local.tee 6
                i32.eqz
                br_if 0 (;@5;)
                local.get 2
                local.get 6
                call_indirect (type 0)
              end
              block ;; label = @5
                local.get 0
                i32.load offset=4
                local.tee 6
                i32.eqz
                br_if 0 (;@5;)
                local.get 2
                local.get 6
                local.get 0
                i32.load offset=8
                call $__rust_dealloc
              end
              local.get 1
              i32.const 12
              i32.const 4
              call $__rust_dealloc
              br 1 (;@3;)
            end
            i32.const 0
            i32.load8_u offset=1052632
            local.set 0
            i32.const 0
            i32.const 0
            i32.store8 offset=1052632
            local.get 0
            i32.eqz
            br_if 0 (;@3;)
            local.get 3
            i32.const 0
            i32.store offset=48
            local.get 3
            i32.const 1
            i32.store offset=36
            local.get 3
            i32.const 1051160
            i32.store offset=32
            local.get 3
            i64.const 4
            i64.store offset=40 align=4
            local.get 3
            local.get 1
            local.get 3
            i32.const 32
            i32.add
            local.get 2
            call_indirect (type 3)
            local.get 3
            i32.load offset=4
            local.set 1
            block ;; label = @4
              local.get 3
              i32.load8_u
              local.tee 0
              i32.const 4
              i32.gt_u
              br_if 0 (;@4;)
              local.get 0
              i32.const 3
              i32.ne
              br_if 1 (;@3;)
            end
            local.get 1
            i32.load
            local.set 2
            block ;; label = @4
              local.get 1
              i32.const 4
              i32.add
              i32.load
              local.tee 0
              i32.load
              local.tee 6
              i32.eqz
              br_if 0 (;@4;)
              local.get 2
              local.get 6
              call_indirect (type 0)
            end
            block ;; label = @4
              local.get 0
              i32.load offset=4
              local.tee 6
              i32.eqz
              br_if 0 (;@4;)
              local.get 2
              local.get 6
              local.get 0
              i32.load offset=8
              call $__rust_dealloc
            end
            local.get 1
            i32.const 12
            i32.const 4
            call $__rust_dealloc
          end
          local.get 3
          i32.const 64
          i32.add
          global.set $__stack_pointer
          return
        end
        local.get 3
        i64.const 0
        i64.store offset=44 align=4
        local.get 3
        i64.const 17179869185
        i64.store offset=36 align=4
        local.get 3
        i32.const 1050612
        i32.store offset=32
        local.get 3
        local.get 3
        i32.const 32
        i32.add
        call $_ZN4core9panicking13assert_failed17h56c9d3f3aa6ef6edE
        unreachable
      end
      local.get 3
      i64.const 0
      i64.store offset=44 align=4
      local.get 3
      i64.const 17179869185
      i64.store offset=36 align=4
      local.get 3
      i32.const 1050612
      i32.store offset=32
      local.get 3
      local.get 3
      i32.const 32
      i32.add
      call $_ZN4core9panicking13assert_failed17h56c9d3f3aa6ef6edE
      unreachable
    )
    (func $rust_begin_unwind (;126;) (type 0) (param i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      block ;; label = @1
        local.get 0
        i32.load offset=8
        local.tee 2
        br_if 0 (;@1;)
        i32.const 1051168
        call $_ZN4core6option13unwrap_failed17he734bfec322d9781E
        unreachable
      end
      local.get 1
      local.get 0
      i32.load offset=12
      i32.store offset=12
      local.get 1
      local.get 0
      i32.store offset=8
      local.get 1
      local.get 2
      i32.store offset=4
      local.get 1
      i32.const 4
      i32.add
      call $_ZN3std10sys_common9backtrace26__rust_end_short_backtrace17h78f6f5c4c3216f80E
      unreachable
    )
    (func $_ZN102_$LT$std..panicking..begin_panic_handler..FormatStringPayload$u20$as$u20$core..panic..PanicPayload$GT$8take_box17h408ec53afc6e4b59E (;127;) (type 1) (param i32 i32)
      (local i32 i32 i32 i64)
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      block ;; label = @1
        local.get 1
        i32.load
        i32.const -2147483648
        i32.ne
        br_if 0 (;@1;)
        local.get 1
        i32.load offset=12
        local.set 3
        local.get 2
        i32.const 36
        i32.add
        i32.const 8
        i32.add
        local.tee 4
        i32.const 0
        i32.store
        local.get 2
        i64.const 4294967296
        i64.store offset=36 align=4
        local.get 2
        i32.const 36
        i32.add
        i32.const 1050168
        local.get 3
        call $_ZN4core3fmt5write17h86ae7d4da82da0b2E
        drop
        local.get 2
        i32.const 24
        i32.add
        i32.const 8
        i32.add
        local.get 4
        i32.load
        local.tee 3
        i32.store
        local.get 2
        local.get 2
        i64.load offset=36 align=4
        local.tee 5
        i64.store offset=24
        local.get 1
        i32.const 8
        i32.add
        local.get 3
        i32.store
        local.get 1
        local.get 5
        i64.store align=4
      end
      local.get 1
      i64.load align=4
      local.set 5
      local.get 1
      i64.const 4294967296
      i64.store align=4
      local.get 2
      i32.const 8
      i32.add
      i32.const 8
      i32.add
      local.tee 3
      local.get 1
      i32.const 8
      i32.add
      local.tee 1
      i32.load
      i32.store
      local.get 1
      i32.const 0
      i32.store
      i32.const 0
      i32.load8_u offset=1052649
      drop
      local.get 2
      local.get 5
      i64.store offset=8
      block ;; label = @1
        i32.const 12
        i32.const 4
        call $__rust_alloc
        local.tee 1
        br_if 0 (;@1;)
        i32.const 4
        i32.const 12
        call $_ZN5alloc5alloc18handle_alloc_error17h7bdcb31f02c1333fE
        unreachable
      end
      local.get 1
      local.get 2
      i64.load offset=8
      i64.store align=4
      local.get 1
      i32.const 8
      i32.add
      local.get 3
      i32.load
      i32.store
      local.get 0
      i32.const 1051184
      i32.store offset=4
      local.get 0
      local.get 1
      i32.store
      local.get 2
      i32.const 48
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN102_$LT$std..panicking..begin_panic_handler..FormatStringPayload$u20$as$u20$core..panic..PanicPayload$GT$3get17he934073eb0aea946E (;128;) (type 1) (param i32 i32)
      (local i32 i32 i32 i64)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      block ;; label = @1
        local.get 1
        i32.load
        i32.const -2147483648
        i32.ne
        br_if 0 (;@1;)
        local.get 1
        i32.load offset=12
        local.set 3
        local.get 2
        i32.const 20
        i32.add
        i32.const 8
        i32.add
        local.tee 4
        i32.const 0
        i32.store
        local.get 2
        i64.const 4294967296
        i64.store offset=20 align=4
        local.get 2
        i32.const 20
        i32.add
        i32.const 1050168
        local.get 3
        call $_ZN4core3fmt5write17h86ae7d4da82da0b2E
        drop
        local.get 2
        i32.const 8
        i32.add
        i32.const 8
        i32.add
        local.get 4
        i32.load
        local.tee 3
        i32.store
        local.get 2
        local.get 2
        i64.load offset=20 align=4
        local.tee 5
        i64.store offset=8
        local.get 1
        i32.const 8
        i32.add
        local.get 3
        i32.store
        local.get 1
        local.get 5
        i64.store align=4
      end
      local.get 0
      i32.const 1051184
      i32.store offset=4
      local.get 0
      local.get 1
      i32.store
      local.get 2
      i32.const 32
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN99_$LT$std..panicking..begin_panic_handler..StaticStrPayload$u20$as$u20$core..panic..PanicPayload$GT$8take_box17he2941444311ab37dE (;129;) (type 1) (param i32 i32)
      (local i32 i32)
      i32.const 0
      i32.load8_u offset=1052649
      drop
      local.get 1
      i32.load offset=4
      local.set 2
      local.get 1
      i32.load
      local.set 3
      block ;; label = @1
        i32.const 8
        i32.const 4
        call $__rust_alloc
        local.tee 1
        br_if 0 (;@1;)
        i32.const 4
        i32.const 8
        call $_ZN5alloc5alloc18handle_alloc_error17h7bdcb31f02c1333fE
        unreachable
      end
      local.get 1
      local.get 2
      i32.store offset=4
      local.get 1
      local.get 3
      i32.store
      local.get 0
      i32.const 1051200
      i32.store offset=4
      local.get 0
      local.get 1
      i32.store
    )
    (func $_ZN99_$LT$std..panicking..begin_panic_handler..StaticStrPayload$u20$as$u20$core..panic..PanicPayload$GT$3get17h0eabfb26e759d6c9E (;130;) (type 1) (param i32 i32)
      local.get 0
      i32.const 1051200
      i32.store offset=4
      local.get 0
      local.get 1
      i32.store
    )
    (func $_ZN3std9panicking20rust_panic_with_hook17h674e95a151c89456E (;131;) (type 13) (param i32 i32 i32 i32 i32 i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 112
      i32.sub
      local.tee 6
      global.set $__stack_pointer
      i32.const 0
      i32.const 0
      i32.load offset=1052672
      local.tee 7
      i32.const 1
      i32.add
      i32.store offset=1052672
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      block ;; label = @9
                        block ;; label = @10
                          local.get 7
                          i32.const 0
                          i32.lt_s
                          br_if 0 (;@10;)
                          i32.const 0
                          i32.load8_u offset=1052692
                          br_if 1 (;@9;)
                          i32.const 0
                          i32.const 1
                          i32.store8 offset=1052692
                          i32.const 0
                          i32.const 0
                          i32.load offset=1052688
                          i32.const 1
                          i32.add
                          i32.store offset=1052688
                          local.get 6
                          local.get 5
                          i32.store8 offset=41
                          local.get 6
                          local.get 4
                          i32.store8 offset=40
                          local.get 6
                          local.get 3
                          i32.store offset=36
                          local.get 6
                          local.get 2
                          i32.store offset=32
                          i32.const 0
                          i32.load offset=1052660
                          local.tee 2
                          i32.const -1
                          i32.le_s
                          br_if 4 (;@6;)
                          i32.const 0
                          local.get 2
                          i32.const 1
                          i32.add
                          i32.store offset=1052660
                          i32.const 0
                          i32.load offset=1052664
                          local.set 2
                          local.get 6
                          i32.const 8
                          i32.add
                          local.get 0
                          local.get 1
                          i32.load offset=16
                          call_indirect (type 1)
                          local.get 6
                          local.get 6
                          i64.load offset=8
                          i64.store offset=24 align=4
                          local.get 2
                          br_if 2 (;@8;)
                          local.get 6
                          i32.const 24
                          i32.add
                          call $_ZN3std9panicking12default_hook17hdf494962bb928bb2E
                          br 3 (;@7;)
                        end
                        local.get 6
                        local.get 5
                        i32.store8 offset=41
                        local.get 6
                        local.get 4
                        i32.store8 offset=40
                        local.get 6
                        local.get 3
                        i32.store offset=36
                        local.get 6
                        local.get 2
                        i32.store offset=32
                        local.get 6
                        i32.const 1051256
                        i32.store offset=28
                        local.get 6
                        i32.const 1
                        i32.store offset=24
                        local.get 6
                        i32.const 2
                        i32.store offset=92
                        local.get 6
                        i32.const 1051324
                        i32.store offset=88
                        local.get 6
                        i64.const 1
                        i64.store offset=100 align=4
                        local.get 6
                        i32.const 9
                        i64.extend_i32_u
                        i64.const 32
                        i64.shl
                        local.get 6
                        i32.const 24
                        i32.add
                        i64.extend_i32_u
                        i64.or
                        i64.store offset=48
                        local.get 6
                        local.get 6
                        i32.const 48
                        i32.add
                        i32.store offset=96
                        local.get 6
                        i32.const 80
                        i32.add
                        local.get 6
                        i32.const 80
                        i32.add
                        local.get 6
                        i32.const 88
                        i32.add
                        call $_ZN3std2io5Write9write_fmt17h8e312ff03507c2b0E
                        local.get 6
                        i32.load offset=84
                        local.set 2
                        block ;; label = @10
                          local.get 6
                          i32.load8_u offset=80
                          local.tee 6
                          i32.const 4
                          i32.gt_u
                          br_if 0 (;@10;)
                          local.get 6
                          i32.const 3
                          i32.ne
                          br_if 9 (;@1;)
                        end
                        local.get 2
                        i32.load
                        local.set 4
                        block ;; label = @10
                          local.get 2
                          i32.const 4
                          i32.add
                          i32.load
                          local.tee 6
                          i32.load
                          local.tee 5
                          i32.eqz
                          br_if 0 (;@10;)
                          local.get 4
                          local.get 5
                          call_indirect (type 0)
                        end
                        block ;; label = @10
                          local.get 6
                          i32.load offset=4
                          local.tee 5
                          i32.eqz
                          br_if 0 (;@10;)
                          local.get 4
                          local.get 5
                          local.get 6
                          i32.load offset=8
                          call $__rust_dealloc
                        end
                        local.get 2
                        i32.const 12
                        i32.const 4
                        call $__rust_dealloc
                        br 8 (;@1;)
                      end
                      local.get 2
                      br_if 4 (;@4;)
                      br 5 (;@3;)
                    end
                    i32.const 0
                    i32.load offset=1052664
                    local.get 6
                    i32.const 24
                    i32.add
                    i32.const 0
                    i32.load offset=1052668
                    i32.load offset=20
                    call_indirect (type 1)
                  end
                  i32.const 0
                  i32.const 0
                  i32.load offset=1052660
                  i32.const -1
                  i32.add
                  i32.store offset=1052660
                  i32.const 0
                  i32.const 0
                  i32.store8 offset=1052692
                  local.get 4
                  i32.eqz
                  br_if 1 (;@5;)
                  local.get 0
                  local.get 1
                  call $rust_panic
                  unreachable
                end
                local.get 6
                i32.const 1
                i32.store offset=92
                local.get 6
                i32.const 1051584
                i32.store offset=88
                local.get 6
                i64.const 0
                i64.store offset=100 align=4
                local.get 6
                local.get 6
                i32.const 80
                i32.add
                i32.store offset=96
                local.get 6
                i32.const 48
                i32.add
                local.get 6
                i32.const 80
                i32.add
                local.get 6
                i32.const 88
                i32.add
                call $_ZN3std2io5Write9write_fmt17h8e312ff03507c2b0E
                local.get 6
                i32.load8_u offset=48
                local.get 6
                i32.load offset=52
                call $_ZN4core3ptr81drop_in_place$LT$core..result..Result$LT$$LP$$RP$$C$std..io..error..Error$GT$$GT$17h5f8fdfdf5d3fdf33E
                call $_ZN3std3sys3pal4wasi7helpers14abort_internal17hf00157e338c93fc6E
                unreachable
              end
              local.get 6
              i32.const 0
              i32.store offset=104
              local.get 6
              i32.const 1
              i32.store offset=92
              local.get 6
              i32.const 1051456
              i32.store offset=88
              local.get 6
              i64.const 4
              i64.store offset=96 align=4
              local.get 6
              i32.const 48
              i32.add
              local.get 6
              i32.const 80
              i32.add
              local.get 6
              i32.const 88
              i32.add
              call $_ZN3std2io5Write9write_fmt17h8e312ff03507c2b0E
              local.get 6
              i32.load8_u offset=48
              local.get 6
              i32.load offset=52
              call $_ZN4core3ptr81drop_in_place$LT$core..result..Result$LT$$LP$$RP$$C$std..io..error..Error$GT$$GT$17h5f8fdfdf5d3fdf33E
              call $_ZN3std3sys3pal4wasi7helpers14abort_internal17hf00157e338c93fc6E
              unreachable
            end
            local.get 2
            i32.load offset=12
            local.set 7
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 2
                  i32.load offset=4
                  br_table 0 (;@6;) 1 (;@5;) 3 (;@3;)
                end
                local.get 7
                br_if 2 (;@3;)
                i32.const 0
                local.set 2
                i32.const 1
                local.set 7
                br 1 (;@4;)
              end
              local.get 7
              br_if 1 (;@3;)
              local.get 2
              i32.load
              local.tee 7
              i32.load offset=4
              local.set 2
              local.get 7
              i32.load
              local.set 7
            end
            local.get 6
            local.get 2
            i32.store offset=20
            local.get 6
            local.get 7
            i32.store offset=16
            local.get 6
            i64.const 0
            i64.store offset=36 align=4
            local.get 6
            i64.const 17179869185
            i64.store offset=28 align=4
            local.get 6
            local.get 6
            i32.const 16
            i32.add
            i32.store offset=24
            local.get 6
            i32.const 24
            i32.add
            local.set 2
            br 1 (;@2;)
          end
          i32.const 0
          local.set 2
          local.get 6
          i32.const 0
          i32.store offset=16
          local.get 6
          i32.const 0
          i32.store offset=24
        end
        local.get 6
        local.get 5
        i32.store8 offset=65
        local.get 6
        local.get 4
        i32.store8 offset=64
        local.get 6
        local.get 3
        i32.store offset=60
        local.get 6
        local.get 2
        i32.store offset=56
        local.get 6
        i32.const 1051256
        i32.store offset=52
        local.get 6
        i32.const 1
        i32.store offset=48
        local.get 6
        i32.const 2
        i32.store offset=92
        local.get 6
        i32.const 1051392
        i32.store offset=88
        local.get 6
        i64.const 1
        i64.store offset=100 align=4
        local.get 6
        i32.const 9
        i64.extend_i32_u
        i64.const 32
        i64.shl
        local.get 6
        i32.const 48
        i32.add
        i64.extend_i32_u
        i64.or
        i64.store offset=80
        local.get 6
        local.get 6
        i32.const 80
        i32.add
        i32.store offset=96
        local.get 6
        i32.const 72
        i32.add
        local.get 6
        i32.const 80
        i32.add
        local.get 6
        i32.const 88
        i32.add
        call $_ZN3std2io5Write9write_fmt17h8e312ff03507c2b0E
        local.get 6
        i32.load offset=76
        local.set 2
        block ;; label = @2
          local.get 6
          i32.load8_u offset=72
          local.tee 6
          i32.const 4
          i32.gt_u
          br_if 0 (;@2;)
          local.get 6
          i32.const 3
          i32.ne
          br_if 1 (;@1;)
        end
        local.get 2
        i32.load
        local.set 4
        block ;; label = @2
          local.get 2
          i32.const 4
          i32.add
          i32.load
          local.tee 6
          i32.load
          local.tee 5
          i32.eqz
          br_if 0 (;@2;)
          local.get 4
          local.get 5
          call_indirect (type 0)
        end
        block ;; label = @2
          local.get 6
          i32.load offset=4
          local.tee 5
          i32.eqz
          br_if 0 (;@2;)
          local.get 4
          local.get 5
          local.get 6
          i32.load offset=8
          call $__rust_dealloc
        end
        local.get 2
        i32.const 12
        i32.const 4
        call $__rust_dealloc
        call $_ZN3std3sys3pal4wasi7helpers14abort_internal17hf00157e338c93fc6E
        unreachable
      end
      call $_ZN3std3sys3pal4wasi7helpers14abort_internal17hf00157e338c93fc6E
      unreachable
    )
    (func $rust_panic (;132;) (type 1) (param i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 64
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 2
      local.get 0
      local.get 1
      call $__rust_start_panic
      i32.store offset=12
      local.get 2
      i32.const 2
      i32.store offset=28
      local.get 2
      i32.const 1051520
      i32.store offset=24
      local.get 2
      i64.const 1
      i64.store offset=36 align=4
      local.get 2
      i32.const 5
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.get 2
      i32.const 12
      i32.add
      i64.extend_i32_u
      i64.or
      i64.store offset=48
      local.get 2
      local.get 2
      i32.const 48
      i32.add
      i32.store offset=32
      local.get 2
      i32.const 16
      i32.add
      local.get 2
      i32.const 63
      i32.add
      local.get 2
      i32.const 24
      i32.add
      call $_ZN3std2io5Write9write_fmt17h8e312ff03507c2b0E
      local.get 2
      i32.load8_u offset=16
      local.get 2
      i32.load offset=20
      call $_ZN4core3ptr81drop_in_place$LT$core..result..Result$LT$$LP$$RP$$C$std..io..error..Error$GT$$GT$17h5f8fdfdf5d3fdf33E
      call $_ZN3std3sys3pal4wasi7helpers14abort_internal17hf00157e338c93fc6E
      unreachable
    )
    (func $_ZN3std5alloc8rust_oom17hf510504f2aeeadddE (;133;) (type 1) (param i32 i32)
      (local i32)
      local.get 0
      local.get 1
      i32.const 0
      i32.load offset=1052656
      local.tee 2
      i32.const 10
      local.get 2
      select
      call_indirect (type 1)
      call $_ZN3std7process5abort17he31877bb916f1bf6E
      unreachable
    )
    (func $__rg_oom (;134;) (type 1) (param i32 i32)
      local.get 1
      local.get 0
      call $_ZN3std5alloc8rust_oom17hf510504f2aeeadddE
      unreachable
    )
    (func $__rust_start_panic (;135;) (type 4) (param i32 i32) (result i32)
      unreachable
      unreachable
    )
    (func $_ZN4wasi13lib_generated8fd_write17h3677cbd19c973238E (;136;) (type 10) (param i32 i32 i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 4
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          local.get 1
          local.get 2
          local.get 3
          local.get 4
          i32.const 12
          i32.add
          call $_ZN4wasi13lib_generated22wasi_snapshot_preview18fd_write17h6411a55d3fc118fcE
          local.tee 3
          br_if 0 (;@2;)
          local.get 0
          local.get 4
          i32.load offset=12
          i32.store offset=4
          i32.const 0
          local.set 3
          br 1 (;@1;)
        end
        local.get 0
        local.get 3
        i32.store16 offset=2
        i32.const 1
        local.set 3
      end
      local.get 0
      local.get 3
      i32.store16
      local.get 4
      i32.const 16
      i32.add
      global.set $__stack_pointer
    )
    (func $malloc (;137;) (type 8) (param i32) (result i32)
      local.get 0
      call $dlmalloc
    )
    (func $dlmalloc (;138;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      block ;; label = @9
                        block ;; label = @10
                          block ;; label = @11
                            block ;; label = @12
                              i32.const 0
                              i32.load offset=1052732
                              local.tee 2
                              br_if 0 (;@12;)
                              block ;; label = @13
                                i32.const 0
                                i32.load offset=1053180
                                local.tee 3
                                br_if 0 (;@13;)
                                i32.const 0
                                i64.const -1
                                i64.store offset=1053192 align=4
                                i32.const 0
                                i64.const 281474976776192
                                i64.store offset=1053184 align=4
                                i32.const 0
                                local.get 1
                                i32.const 8
                                i32.add
                                i32.const -16
                                i32.and
                                i32.const 1431655768
                                i32.xor
                                local.tee 3
                                i32.store offset=1053180
                                i32.const 0
                                i32.const 0
                                i32.store offset=1053200
                                i32.const 0
                                i32.const 0
                                i32.store offset=1053152
                              end
                              i32.const 1114112
                              i32.const 1053216
                              i32.lt_u
                              br_if 1 (;@11;)
                              i32.const 0
                              local.set 2
                              i32.const 1114112
                              i32.const 1053216
                              i32.sub
                              i32.const 89
                              i32.lt_u
                              br_if 0 (;@12;)
                              i32.const 0
                              local.set 4
                              i32.const 0
                              i32.const 1053216
                              i32.store offset=1053156
                              i32.const 0
                              i32.const 1053216
                              i32.store offset=1052724
                              i32.const 0
                              local.get 3
                              i32.store offset=1052744
                              i32.const 0
                              i32.const -1
                              i32.store offset=1052740
                              i32.const 0
                              i32.const 1114112
                              i32.const 1053216
                              i32.sub
                              i32.store offset=1053160
                              loop ;; label = @13
                                local.get 4
                                i32.const 1052768
                                i32.add
                                local.get 4
                                i32.const 1052756
                                i32.add
                                local.tee 3
                                i32.store
                                local.get 3
                                local.get 4
                                i32.const 1052748
                                i32.add
                                local.tee 5
                                i32.store
                                local.get 4
                                i32.const 1052760
                                i32.add
                                local.get 5
                                i32.store
                                local.get 4
                                i32.const 1052776
                                i32.add
                                local.get 4
                                i32.const 1052764
                                i32.add
                                local.tee 5
                                i32.store
                                local.get 5
                                local.get 3
                                i32.store
                                local.get 4
                                i32.const 1052784
                                i32.add
                                local.get 4
                                i32.const 1052772
                                i32.add
                                local.tee 3
                                i32.store
                                local.get 3
                                local.get 5
                                i32.store
                                local.get 4
                                i32.const 1052780
                                i32.add
                                local.get 3
                                i32.store
                                local.get 4
                                i32.const 32
                                i32.add
                                local.tee 4
                                i32.const 256
                                i32.ne
                                br_if 0 (;@13;)
                              end
                              i32.const 1053216
                              i32.const -8
                              i32.const 1053216
                              i32.sub
                              i32.const 15
                              i32.and
                              local.tee 4
                              i32.add
                              local.tee 2
                              i32.const 1114112
                              i32.const 1053216
                              i32.sub
                              i32.const -56
                              i32.add
                              local.tee 3
                              local.get 4
                              i32.sub
                              local.tee 4
                              i32.const 1
                              i32.or
                              i32.store offset=4
                              i32.const 0
                              i32.const 0
                              i32.load offset=1053196
                              i32.store offset=1052736
                              i32.const 0
                              local.get 4
                              i32.store offset=1052720
                              i32.const 0
                              local.get 2
                              i32.store offset=1052732
                              local.get 3
                              i32.const 1053216
                              i32.add
                              i32.const 4
                              i32.add
                              i32.const 56
                              i32.store
                            end
                            block ;; label = @12
                              block ;; label = @13
                                local.get 0
                                i32.const 236
                                i32.gt_u
                                br_if 0 (;@13;)
                                block ;; label = @14
                                  i32.const 0
                                  i32.load offset=1052708
                                  local.tee 6
                                  i32.const 16
                                  local.get 0
                                  i32.const 19
                                  i32.add
                                  i32.const 496
                                  i32.and
                                  local.get 0
                                  i32.const 11
                                  i32.lt_u
                                  select
                                  local.tee 7
                                  i32.const 3
                                  i32.shr_u
                                  local.tee 3
                                  i32.shr_u
                                  local.tee 4
                                  i32.const 3
                                  i32.and
                                  i32.eqz
                                  br_if 0 (;@14;)
                                  block ;; label = @15
                                    block ;; label = @16
                                      local.get 4
                                      i32.const 1
                                      i32.and
                                      local.get 3
                                      i32.or
                                      i32.const 1
                                      i32.xor
                                      local.tee 5
                                      i32.const 3
                                      i32.shl
                                      local.tee 3
                                      i32.const 1052748
                                      i32.add
                                      local.tee 4
                                      local.get 3
                                      i32.const 1052756
                                      i32.add
                                      i32.load
                                      local.tee 3
                                      i32.load offset=8
                                      local.tee 7
                                      i32.ne
                                      br_if 0 (;@16;)
                                      i32.const 0
                                      local.get 6
                                      i32.const -2
                                      local.get 5
                                      i32.rotl
                                      i32.and
                                      i32.store offset=1052708
                                      br 1 (;@15;)
                                    end
                                    local.get 4
                                    local.get 7
                                    i32.store offset=8
                                    local.get 7
                                    local.get 4
                                    i32.store offset=12
                                  end
                                  local.get 3
                                  i32.const 8
                                  i32.add
                                  local.set 4
                                  local.get 3
                                  local.get 5
                                  i32.const 3
                                  i32.shl
                                  local.tee 5
                                  i32.const 3
                                  i32.or
                                  i32.store offset=4
                                  local.get 3
                                  local.get 5
                                  i32.add
                                  local.tee 3
                                  local.get 3
                                  i32.load offset=4
                                  i32.const 1
                                  i32.or
                                  i32.store offset=4
                                  br 13 (;@1;)
                                end
                                local.get 7
                                i32.const 0
                                i32.load offset=1052716
                                local.tee 8
                                i32.le_u
                                br_if 1 (;@12;)
                                block ;; label = @14
                                  local.get 4
                                  i32.eqz
                                  br_if 0 (;@14;)
                                  block ;; label = @15
                                    block ;; label = @16
                                      local.get 4
                                      local.get 3
                                      i32.shl
                                      i32.const 2
                                      local.get 3
                                      i32.shl
                                      local.tee 4
                                      i32.const 0
                                      local.get 4
                                      i32.sub
                                      i32.or
                                      i32.and
                                      i32.ctz
                                      local.tee 3
                                      i32.const 3
                                      i32.shl
                                      local.tee 4
                                      i32.const 1052748
                                      i32.add
                                      local.tee 5
                                      local.get 4
                                      i32.const 1052756
                                      i32.add
                                      i32.load
                                      local.tee 4
                                      i32.load offset=8
                                      local.tee 0
                                      i32.ne
                                      br_if 0 (;@16;)
                                      i32.const 0
                                      local.get 6
                                      i32.const -2
                                      local.get 3
                                      i32.rotl
                                      i32.and
                                      local.tee 6
                                      i32.store offset=1052708
                                      br 1 (;@15;)
                                    end
                                    local.get 5
                                    local.get 0
                                    i32.store offset=8
                                    local.get 0
                                    local.get 5
                                    i32.store offset=12
                                  end
                                  local.get 4
                                  local.get 7
                                  i32.const 3
                                  i32.or
                                  i32.store offset=4
                                  local.get 4
                                  local.get 3
                                  i32.const 3
                                  i32.shl
                                  local.tee 3
                                  i32.add
                                  local.get 3
                                  local.get 7
                                  i32.sub
                                  local.tee 5
                                  i32.store
                                  local.get 4
                                  local.get 7
                                  i32.add
                                  local.tee 0
                                  local.get 5
                                  i32.const 1
                                  i32.or
                                  i32.store offset=4
                                  block ;; label = @15
                                    local.get 8
                                    i32.eqz
                                    br_if 0 (;@15;)
                                    local.get 8
                                    i32.const -8
                                    i32.and
                                    i32.const 1052748
                                    i32.add
                                    local.set 7
                                    i32.const 0
                                    i32.load offset=1052728
                                    local.set 3
                                    block ;; label = @16
                                      block ;; label = @17
                                        local.get 6
                                        i32.const 1
                                        local.get 8
                                        i32.const 3
                                        i32.shr_u
                                        i32.shl
                                        local.tee 9
                                        i32.and
                                        br_if 0 (;@17;)
                                        i32.const 0
                                        local.get 6
                                        local.get 9
                                        i32.or
                                        i32.store offset=1052708
                                        local.get 7
                                        local.set 9
                                        br 1 (;@16;)
                                      end
                                      local.get 7
                                      i32.load offset=8
                                      local.set 9
                                    end
                                    local.get 9
                                    local.get 3
                                    i32.store offset=12
                                    local.get 7
                                    local.get 3
                                    i32.store offset=8
                                    local.get 3
                                    local.get 7
                                    i32.store offset=12
                                    local.get 3
                                    local.get 9
                                    i32.store offset=8
                                  end
                                  local.get 4
                                  i32.const 8
                                  i32.add
                                  local.set 4
                                  i32.const 0
                                  local.get 0
                                  i32.store offset=1052728
                                  i32.const 0
                                  local.get 5
                                  i32.store offset=1052716
                                  br 13 (;@1;)
                                end
                                i32.const 0
                                i32.load offset=1052712
                                local.tee 10
                                i32.eqz
                                br_if 1 (;@12;)
                                local.get 10
                                i32.ctz
                                i32.const 2
                                i32.shl
                                i32.const 1053012
                                i32.add
                                i32.load
                                local.tee 0
                                i32.load offset=4
                                i32.const -8
                                i32.and
                                local.get 7
                                i32.sub
                                local.set 3
                                local.get 0
                                local.set 5
                                block ;; label = @14
                                  loop ;; label = @15
                                    block ;; label = @16
                                      local.get 5
                                      i32.load offset=16
                                      local.tee 4
                                      br_if 0 (;@16;)
                                      local.get 5
                                      i32.const 20
                                      i32.add
                                      i32.load
                                      local.tee 4
                                      i32.eqz
                                      br_if 2 (;@14;)
                                    end
                                    local.get 4
                                    i32.load offset=4
                                    i32.const -8
                                    i32.and
                                    local.get 7
                                    i32.sub
                                    local.tee 5
                                    local.get 3
                                    local.get 5
                                    local.get 3
                                    i32.lt_u
                                    local.tee 5
                                    select
                                    local.set 3
                                    local.get 4
                                    local.get 0
                                    local.get 5
                                    select
                                    local.set 0
                                    local.get 4
                                    local.set 5
                                    br 0 (;@15;)
                                  end
                                end
                                local.get 0
                                i32.load offset=24
                                local.set 11
                                block ;; label = @14
                                  local.get 0
                                  i32.load offset=12
                                  local.tee 9
                                  local.get 0
                                  i32.eq
                                  br_if 0 (;@14;)
                                  local.get 0
                                  i32.load offset=8
                                  local.tee 4
                                  i32.const 0
                                  i32.load offset=1052724
                                  i32.lt_u
                                  drop
                                  local.get 9
                                  local.get 4
                                  i32.store offset=8
                                  local.get 4
                                  local.get 9
                                  i32.store offset=12
                                  br 12 (;@2;)
                                end
                                block ;; label = @14
                                  local.get 0
                                  i32.const 20
                                  i32.add
                                  local.tee 5
                                  i32.load
                                  local.tee 4
                                  br_if 0 (;@14;)
                                  local.get 0
                                  i32.load offset=16
                                  local.tee 4
                                  i32.eqz
                                  br_if 4 (;@10;)
                                  local.get 0
                                  i32.const 16
                                  i32.add
                                  local.set 5
                                end
                                loop ;; label = @14
                                  local.get 5
                                  local.set 2
                                  local.get 4
                                  local.tee 9
                                  i32.const 20
                                  i32.add
                                  local.tee 5
                                  i32.load
                                  local.tee 4
                                  br_if 0 (;@14;)
                                  local.get 9
                                  i32.const 16
                                  i32.add
                                  local.set 5
                                  local.get 9
                                  i32.load offset=16
                                  local.tee 4
                                  br_if 0 (;@14;)
                                end
                                local.get 2
                                i32.const 0
                                i32.store
                                br 11 (;@2;)
                              end
                              i32.const -1
                              local.set 7
                              local.get 0
                              i32.const -65
                              i32.gt_u
                              br_if 0 (;@12;)
                              local.get 0
                              i32.const 19
                              i32.add
                              local.tee 4
                              i32.const -16
                              i32.and
                              local.set 7
                              i32.const 0
                              i32.load offset=1052712
                              local.tee 11
                              i32.eqz
                              br_if 0 (;@12;)
                              i32.const 0
                              local.set 8
                              block ;; label = @13
                                local.get 7
                                i32.const 256
                                i32.lt_u
                                br_if 0 (;@13;)
                                i32.const 31
                                local.set 8
                                local.get 7
                                i32.const 16777215
                                i32.gt_u
                                br_if 0 (;@13;)
                                local.get 7
                                i32.const 38
                                local.get 4
                                i32.const 8
                                i32.shr_u
                                i32.clz
                                local.tee 4
                                i32.sub
                                i32.shr_u
                                i32.const 1
                                i32.and
                                local.get 4
                                i32.const 1
                                i32.shl
                                i32.sub
                                i32.const 62
                                i32.add
                                local.set 8
                              end
                              i32.const 0
                              local.get 7
                              i32.sub
                              local.set 3
                              block ;; label = @13
                                block ;; label = @14
                                  block ;; label = @15
                                    block ;; label = @16
                                      local.get 8
                                      i32.const 2
                                      i32.shl
                                      i32.const 1053012
                                      i32.add
                                      i32.load
                                      local.tee 5
                                      br_if 0 (;@16;)
                                      i32.const 0
                                      local.set 4
                                      i32.const 0
                                      local.set 9
                                      br 1 (;@15;)
                                    end
                                    i32.const 0
                                    local.set 4
                                    local.get 7
                                    i32.const 0
                                    i32.const 25
                                    local.get 8
                                    i32.const 1
                                    i32.shr_u
                                    i32.sub
                                    local.get 8
                                    i32.const 31
                                    i32.eq
                                    select
                                    i32.shl
                                    local.set 0
                                    i32.const 0
                                    local.set 9
                                    loop ;; label = @16
                                      block ;; label = @17
                                        local.get 5
                                        i32.load offset=4
                                        i32.const -8
                                        i32.and
                                        local.get 7
                                        i32.sub
                                        local.tee 6
                                        local.get 3
                                        i32.ge_u
                                        br_if 0 (;@17;)
                                        local.get 6
                                        local.set 3
                                        local.get 5
                                        local.set 9
                                        local.get 6
                                        br_if 0 (;@17;)
                                        i32.const 0
                                        local.set 3
                                        local.get 5
                                        local.set 9
                                        local.get 5
                                        local.set 4
                                        br 3 (;@14;)
                                      end
                                      local.get 4
                                      local.get 5
                                      i32.const 20
                                      i32.add
                                      i32.load
                                      local.tee 6
                                      local.get 6
                                      local.get 5
                                      local.get 0
                                      i32.const 29
                                      i32.shr_u
                                      i32.const 4
                                      i32.and
                                      i32.add
                                      i32.const 16
                                      i32.add
                                      i32.load
                                      local.tee 5
                                      i32.eq
                                      select
                                      local.get 4
                                      local.get 6
                                      select
                                      local.set 4
                                      local.get 0
                                      i32.const 1
                                      i32.shl
                                      local.set 0
                                      local.get 5
                                      br_if 0 (;@16;)
                                    end
                                  end
                                  block ;; label = @15
                                    local.get 4
                                    local.get 9
                                    i32.or
                                    br_if 0 (;@15;)
                                    i32.const 0
                                    local.set 9
                                    i32.const 2
                                    local.get 8
                                    i32.shl
                                    local.tee 4
                                    i32.const 0
                                    local.get 4
                                    i32.sub
                                    i32.or
                                    local.get 11
                                    i32.and
                                    local.tee 4
                                    i32.eqz
                                    br_if 3 (;@12;)
                                    local.get 4
                                    i32.ctz
                                    i32.const 2
                                    i32.shl
                                    i32.const 1053012
                                    i32.add
                                    i32.load
                                    local.set 4
                                  end
                                  local.get 4
                                  i32.eqz
                                  br_if 1 (;@13;)
                                end
                                loop ;; label = @14
                                  local.get 4
                                  i32.load offset=4
                                  i32.const -8
                                  i32.and
                                  local.get 7
                                  i32.sub
                                  local.tee 6
                                  local.get 3
                                  i32.lt_u
                                  local.set 0
                                  block ;; label = @15
                                    local.get 4
                                    i32.load offset=16
                                    local.tee 5
                                    br_if 0 (;@15;)
                                    local.get 4
                                    i32.const 20
                                    i32.add
                                    i32.load
                                    local.set 5
                                  end
                                  local.get 6
                                  local.get 3
                                  local.get 0
                                  select
                                  local.set 3
                                  local.get 4
                                  local.get 9
                                  local.get 0
                                  select
                                  local.set 9
                                  local.get 5
                                  local.set 4
                                  local.get 5
                                  br_if 0 (;@14;)
                                end
                              end
                              local.get 9
                              i32.eqz
                              br_if 0 (;@12;)
                              local.get 3
                              i32.const 0
                              i32.load offset=1052716
                              local.get 7
                              i32.sub
                              i32.ge_u
                              br_if 0 (;@12;)
                              local.get 9
                              i32.load offset=24
                              local.set 2
                              block ;; label = @13
                                local.get 9
                                i32.load offset=12
                                local.tee 0
                                local.get 9
                                i32.eq
                                br_if 0 (;@13;)
                                local.get 9
                                i32.load offset=8
                                local.tee 4
                                i32.const 0
                                i32.load offset=1052724
                                i32.lt_u
                                drop
                                local.get 0
                                local.get 4
                                i32.store offset=8
                                local.get 4
                                local.get 0
                                i32.store offset=12
                                br 10 (;@3;)
                              end
                              block ;; label = @13
                                local.get 9
                                i32.const 20
                                i32.add
                                local.tee 5
                                i32.load
                                local.tee 4
                                br_if 0 (;@13;)
                                local.get 9
                                i32.load offset=16
                                local.tee 4
                                i32.eqz
                                br_if 4 (;@9;)
                                local.get 9
                                i32.const 16
                                i32.add
                                local.set 5
                              end
                              loop ;; label = @13
                                local.get 5
                                local.set 6
                                local.get 4
                                local.tee 0
                                i32.const 20
                                i32.add
                                local.tee 5
                                i32.load
                                local.tee 4
                                br_if 0 (;@13;)
                                local.get 0
                                i32.const 16
                                i32.add
                                local.set 5
                                local.get 0
                                i32.load offset=16
                                local.tee 4
                                br_if 0 (;@13;)
                              end
                              local.get 6
                              i32.const 0
                              i32.store
                              br 9 (;@3;)
                            end
                            block ;; label = @12
                              i32.const 0
                              i32.load offset=1052716
                              local.tee 4
                              local.get 7
                              i32.lt_u
                              br_if 0 (;@12;)
                              i32.const 0
                              i32.load offset=1052728
                              local.set 3
                              block ;; label = @13
                                block ;; label = @14
                                  local.get 4
                                  local.get 7
                                  i32.sub
                                  local.tee 5
                                  i32.const 16
                                  i32.lt_u
                                  br_if 0 (;@14;)
                                  local.get 3
                                  local.get 7
                                  i32.add
                                  local.tee 0
                                  local.get 5
                                  i32.const 1
                                  i32.or
                                  i32.store offset=4
                                  local.get 3
                                  local.get 4
                                  i32.add
                                  local.get 5
                                  i32.store
                                  local.get 3
                                  local.get 7
                                  i32.const 3
                                  i32.or
                                  i32.store offset=4
                                  br 1 (;@13;)
                                end
                                local.get 3
                                local.get 4
                                i32.const 3
                                i32.or
                                i32.store offset=4
                                local.get 3
                                local.get 4
                                i32.add
                                local.tee 4
                                local.get 4
                                i32.load offset=4
                                i32.const 1
                                i32.or
                                i32.store offset=4
                                i32.const 0
                                local.set 0
                                i32.const 0
                                local.set 5
                              end
                              i32.const 0
                              local.get 5
                              i32.store offset=1052716
                              i32.const 0
                              local.get 0
                              i32.store offset=1052728
                              local.get 3
                              i32.const 8
                              i32.add
                              local.set 4
                              br 11 (;@1;)
                            end
                            block ;; label = @12
                              i32.const 0
                              i32.load offset=1052720
                              local.tee 5
                              local.get 7
                              i32.le_u
                              br_if 0 (;@12;)
                              local.get 2
                              local.get 7
                              i32.add
                              local.tee 4
                              local.get 5
                              local.get 7
                              i32.sub
                              local.tee 3
                              i32.const 1
                              i32.or
                              i32.store offset=4
                              i32.const 0
                              local.get 4
                              i32.store offset=1052732
                              i32.const 0
                              local.get 3
                              i32.store offset=1052720
                              local.get 2
                              local.get 7
                              i32.const 3
                              i32.or
                              i32.store offset=4
                              local.get 2
                              i32.const 8
                              i32.add
                              local.set 4
                              br 11 (;@1;)
                            end
                            block ;; label = @12
                              block ;; label = @13
                                i32.const 0
                                i32.load offset=1053180
                                i32.eqz
                                br_if 0 (;@13;)
                                i32.const 0
                                i32.load offset=1053188
                                local.set 3
                                br 1 (;@12;)
                              end
                              i32.const 0
                              i64.const -1
                              i64.store offset=1053192 align=4
                              i32.const 0
                              i64.const 281474976776192
                              i64.store offset=1053184 align=4
                              i32.const 0
                              local.get 1
                              i32.const 12
                              i32.add
                              i32.const -16
                              i32.and
                              i32.const 1431655768
                              i32.xor
                              i32.store offset=1053180
                              i32.const 0
                              i32.const 0
                              i32.store offset=1053200
                              i32.const 0
                              i32.const 0
                              i32.store offset=1053152
                              i32.const 65536
                              local.set 3
                            end
                            i32.const 0
                            local.set 4
                            block ;; label = @12
                              local.get 3
                              local.get 7
                              i32.const 71
                              i32.add
                              local.tee 8
                              i32.add
                              local.tee 0
                              i32.const 0
                              local.get 3
                              i32.sub
                              local.tee 6
                              i32.and
                              local.tee 9
                              local.get 7
                              i32.gt_u
                              br_if 0 (;@12;)
                              i32.const 0
                              i32.const 48
                              i32.store offset=1053204
                              br 11 (;@1;)
                            end
                            block ;; label = @12
                              i32.const 0
                              i32.load offset=1053148
                              local.tee 4
                              i32.eqz
                              br_if 0 (;@12;)
                              block ;; label = @13
                                i32.const 0
                                i32.load offset=1053140
                                local.tee 3
                                local.get 9
                                i32.add
                                local.tee 11
                                local.get 3
                                i32.le_u
                                br_if 0 (;@13;)
                                local.get 11
                                local.get 4
                                i32.le_u
                                br_if 1 (;@12;)
                              end
                              i32.const 0
                              local.set 4
                              i32.const 0
                              i32.const 48
                              i32.store offset=1053204
                              br 11 (;@1;)
                            end
                            i32.const 0
                            i32.load8_u offset=1053152
                            i32.const 4
                            i32.and
                            br_if 5 (;@6;)
                            block ;; label = @12
                              block ;; label = @13
                                block ;; label = @14
                                  local.get 2
                                  i32.eqz
                                  br_if 0 (;@14;)
                                  i32.const 1053156
                                  local.set 4
                                  loop ;; label = @15
                                    block ;; label = @16
                                      local.get 4
                                      i32.load
                                      local.tee 3
                                      local.get 2
                                      i32.gt_u
                                      br_if 0 (;@16;)
                                      local.get 3
                                      local.get 4
                                      i32.load offset=4
                                      i32.add
                                      local.get 2
                                      i32.gt_u
                                      br_if 3 (;@13;)
                                    end
                                    local.get 4
                                    i32.load offset=8
                                    local.tee 4
                                    br_if 0 (;@15;)
                                  end
                                end
                                i32.const 0
                                call $sbrk
                                local.tee 0
                                i32.const -1
                                i32.eq
                                br_if 6 (;@7;)
                                local.get 9
                                local.set 6
                                block ;; label = @14
                                  i32.const 0
                                  i32.load offset=1053184
                                  local.tee 4
                                  i32.const -1
                                  i32.add
                                  local.tee 3
                                  local.get 0
                                  i32.and
                                  i32.eqz
                                  br_if 0 (;@14;)
                                  local.get 9
                                  local.get 0
                                  i32.sub
                                  local.get 3
                                  local.get 0
                                  i32.add
                                  i32.const 0
                                  local.get 4
                                  i32.sub
                                  i32.and
                                  i32.add
                                  local.set 6
                                end
                                local.get 6
                                local.get 7
                                i32.le_u
                                br_if 6 (;@7;)
                                local.get 6
                                i32.const 2147483646
                                i32.gt_u
                                br_if 6 (;@7;)
                                block ;; label = @14
                                  i32.const 0
                                  i32.load offset=1053148
                                  local.tee 4
                                  i32.eqz
                                  br_if 0 (;@14;)
                                  i32.const 0
                                  i32.load offset=1053140
                                  local.tee 3
                                  local.get 6
                                  i32.add
                                  local.tee 5
                                  local.get 3
                                  i32.le_u
                                  br_if 7 (;@7;)
                                  local.get 5
                                  local.get 4
                                  i32.gt_u
                                  br_if 7 (;@7;)
                                end
                                local.get 6
                                call $sbrk
                                local.tee 4
                                local.get 0
                                i32.ne
                                br_if 1 (;@12;)
                                br 8 (;@5;)
                              end
                              local.get 0
                              local.get 5
                              i32.sub
                              local.get 6
                              i32.and
                              local.tee 6
                              i32.const 2147483646
                              i32.gt_u
                              br_if 5 (;@7;)
                              local.get 6
                              call $sbrk
                              local.tee 0
                              local.get 4
                              i32.load
                              local.get 4
                              i32.load offset=4
                              i32.add
                              i32.eq
                              br_if 4 (;@8;)
                              local.get 0
                              local.set 4
                            end
                            block ;; label = @12
                              local.get 6
                              local.get 7
                              i32.const 72
                              i32.add
                              i32.ge_u
                              br_if 0 (;@12;)
                              local.get 4
                              i32.const -1
                              i32.eq
                              br_if 0 (;@12;)
                              block ;; label = @13
                                local.get 8
                                local.get 6
                                i32.sub
                                i32.const 0
                                i32.load offset=1053188
                                local.tee 3
                                i32.add
                                i32.const 0
                                local.get 3
                                i32.sub
                                i32.and
                                local.tee 3
                                i32.const 2147483646
                                i32.le_u
                                br_if 0 (;@13;)
                                local.get 4
                                local.set 0
                                br 8 (;@5;)
                              end
                              block ;; label = @13
                                local.get 3
                                call $sbrk
                                i32.const -1
                                i32.eq
                                br_if 0 (;@13;)
                                local.get 3
                                local.get 6
                                i32.add
                                local.set 6
                                local.get 4
                                local.set 0
                                br 8 (;@5;)
                              end
                              i32.const 0
                              local.get 6
                              i32.sub
                              call $sbrk
                              drop
                              br 5 (;@7;)
                            end
                            local.get 4
                            local.set 0
                            local.get 4
                            i32.const -1
                            i32.ne
                            br_if 6 (;@5;)
                            br 4 (;@7;)
                          end
                          unreachable
                          unreachable
                        end
                        i32.const 0
                        local.set 9
                        br 7 (;@2;)
                      end
                      i32.const 0
                      local.set 0
                      br 5 (;@3;)
                    end
                    local.get 0
                    i32.const -1
                    i32.ne
                    br_if 2 (;@5;)
                  end
                  i32.const 0
                  i32.const 0
                  i32.load offset=1053152
                  i32.const 4
                  i32.or
                  i32.store offset=1053152
                end
                local.get 9
                i32.const 2147483646
                i32.gt_u
                br_if 1 (;@4;)
                local.get 9
                call $sbrk
                local.set 0
                i32.const 0
                call $sbrk
                local.set 4
                local.get 0
                i32.const -1
                i32.eq
                br_if 1 (;@4;)
                local.get 4
                i32.const -1
                i32.eq
                br_if 1 (;@4;)
                local.get 0
                local.get 4
                i32.ge_u
                br_if 1 (;@4;)
                local.get 4
                local.get 0
                i32.sub
                local.tee 6
                local.get 7
                i32.const 56
                i32.add
                i32.le_u
                br_if 1 (;@4;)
              end
              i32.const 0
              i32.const 0
              i32.load offset=1053140
              local.get 6
              i32.add
              local.tee 4
              i32.store offset=1053140
              block ;; label = @5
                local.get 4
                i32.const 0
                i32.load offset=1053144
                i32.le_u
                br_if 0 (;@5;)
                i32.const 0
                local.get 4
                i32.store offset=1053144
              end
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      i32.const 0
                      i32.load offset=1052732
                      local.tee 3
                      i32.eqz
                      br_if 0 (;@8;)
                      i32.const 1053156
                      local.set 4
                      loop ;; label = @9
                        local.get 0
                        local.get 4
                        i32.load
                        local.tee 5
                        local.get 4
                        i32.load offset=4
                        local.tee 9
                        i32.add
                        i32.eq
                        br_if 2 (;@7;)
                        local.get 4
                        i32.load offset=8
                        local.tee 4
                        br_if 0 (;@9;)
                        br 3 (;@6;)
                      end
                    end
                    block ;; label = @8
                      block ;; label = @9
                        i32.const 0
                        i32.load offset=1052724
                        local.tee 4
                        i32.eqz
                        br_if 0 (;@9;)
                        local.get 0
                        local.get 4
                        i32.ge_u
                        br_if 1 (;@8;)
                      end
                      i32.const 0
                      local.get 0
                      i32.store offset=1052724
                    end
                    i32.const 0
                    local.set 4
                    i32.const 0
                    local.get 6
                    i32.store offset=1053160
                    i32.const 0
                    local.get 0
                    i32.store offset=1053156
                    i32.const 0
                    i32.const -1
                    i32.store offset=1052740
                    i32.const 0
                    i32.const 0
                    i32.load offset=1053180
                    i32.store offset=1052744
                    i32.const 0
                    i32.const 0
                    i32.store offset=1053168
                    loop ;; label = @8
                      local.get 4
                      i32.const 1052768
                      i32.add
                      local.get 4
                      i32.const 1052756
                      i32.add
                      local.tee 3
                      i32.store
                      local.get 3
                      local.get 4
                      i32.const 1052748
                      i32.add
                      local.tee 5
                      i32.store
                      local.get 4
                      i32.const 1052760
                      i32.add
                      local.get 5
                      i32.store
                      local.get 4
                      i32.const 1052776
                      i32.add
                      local.get 4
                      i32.const 1052764
                      i32.add
                      local.tee 5
                      i32.store
                      local.get 5
                      local.get 3
                      i32.store
                      local.get 4
                      i32.const 1052784
                      i32.add
                      local.get 4
                      i32.const 1052772
                      i32.add
                      local.tee 3
                      i32.store
                      local.get 3
                      local.get 5
                      i32.store
                      local.get 4
                      i32.const 1052780
                      i32.add
                      local.get 3
                      i32.store
                      local.get 4
                      i32.const 32
                      i32.add
                      local.tee 4
                      i32.const 256
                      i32.ne
                      br_if 0 (;@8;)
                    end
                    local.get 0
                    i32.const -8
                    local.get 0
                    i32.sub
                    i32.const 15
                    i32.and
                    local.tee 4
                    i32.add
                    local.tee 3
                    local.get 6
                    i32.const -56
                    i32.add
                    local.tee 5
                    local.get 4
                    i32.sub
                    local.tee 4
                    i32.const 1
                    i32.or
                    i32.store offset=4
                    i32.const 0
                    i32.const 0
                    i32.load offset=1053196
                    i32.store offset=1052736
                    i32.const 0
                    local.get 4
                    i32.store offset=1052720
                    i32.const 0
                    local.get 3
                    i32.store offset=1052732
                    local.get 0
                    local.get 5
                    i32.add
                    i32.const 56
                    i32.store offset=4
                    br 2 (;@5;)
                  end
                  local.get 3
                  local.get 0
                  i32.ge_u
                  br_if 0 (;@6;)
                  local.get 3
                  local.get 5
                  i32.lt_u
                  br_if 0 (;@6;)
                  local.get 4
                  i32.load offset=12
                  i32.const 8
                  i32.and
                  br_if 0 (;@6;)
                  local.get 3
                  i32.const -8
                  local.get 3
                  i32.sub
                  i32.const 15
                  i32.and
                  local.tee 5
                  i32.add
                  local.tee 0
                  i32.const 0
                  i32.load offset=1052720
                  local.get 6
                  i32.add
                  local.tee 2
                  local.get 5
                  i32.sub
                  local.tee 5
                  i32.const 1
                  i32.or
                  i32.store offset=4
                  local.get 4
                  local.get 9
                  local.get 6
                  i32.add
                  i32.store offset=4
                  i32.const 0
                  i32.const 0
                  i32.load offset=1053196
                  i32.store offset=1052736
                  i32.const 0
                  local.get 5
                  i32.store offset=1052720
                  i32.const 0
                  local.get 0
                  i32.store offset=1052732
                  local.get 3
                  local.get 2
                  i32.add
                  i32.const 56
                  i32.store offset=4
                  br 1 (;@5;)
                end
                block ;; label = @6
                  local.get 0
                  i32.const 0
                  i32.load offset=1052724
                  i32.ge_u
                  br_if 0 (;@6;)
                  i32.const 0
                  local.get 0
                  i32.store offset=1052724
                end
                local.get 0
                local.get 6
                i32.add
                local.set 5
                i32.const 1053156
                local.set 4
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      block ;; label = @9
                        loop ;; label = @10
                          local.get 4
                          i32.load
                          local.get 5
                          i32.eq
                          br_if 1 (;@9;)
                          local.get 4
                          i32.load offset=8
                          local.tee 4
                          br_if 0 (;@10;)
                          br 2 (;@8;)
                        end
                      end
                      local.get 4
                      i32.load8_u offset=12
                      i32.const 8
                      i32.and
                      i32.eqz
                      br_if 1 (;@7;)
                    end
                    i32.const 1053156
                    local.set 4
                    block ;; label = @8
                      loop ;; label = @9
                        block ;; label = @10
                          local.get 4
                          i32.load
                          local.tee 5
                          local.get 3
                          i32.gt_u
                          br_if 0 (;@10;)
                          local.get 5
                          local.get 4
                          i32.load offset=4
                          i32.add
                          local.tee 5
                          local.get 3
                          i32.gt_u
                          br_if 2 (;@8;)
                        end
                        local.get 4
                        i32.load offset=8
                        local.set 4
                        br 0 (;@9;)
                      end
                    end
                    local.get 0
                    i32.const -8
                    local.get 0
                    i32.sub
                    i32.const 15
                    i32.and
                    local.tee 4
                    i32.add
                    local.tee 2
                    local.get 6
                    i32.const -56
                    i32.add
                    local.tee 9
                    local.get 4
                    i32.sub
                    local.tee 4
                    i32.const 1
                    i32.or
                    i32.store offset=4
                    local.get 0
                    local.get 9
                    i32.add
                    i32.const 56
                    i32.store offset=4
                    local.get 3
                    local.get 5
                    i32.const 55
                    local.get 5
                    i32.sub
                    i32.const 15
                    i32.and
                    i32.add
                    i32.const -63
                    i32.add
                    local.tee 9
                    local.get 9
                    local.get 3
                    i32.const 16
                    i32.add
                    i32.lt_u
                    select
                    local.tee 9
                    i32.const 35
                    i32.store offset=4
                    i32.const 0
                    i32.const 0
                    i32.load offset=1053196
                    i32.store offset=1052736
                    i32.const 0
                    local.get 4
                    i32.store offset=1052720
                    i32.const 0
                    local.get 2
                    i32.store offset=1052732
                    local.get 9
                    i32.const 16
                    i32.add
                    i32.const 0
                    i64.load offset=1053164 align=4
                    i64.store align=4
                    local.get 9
                    i32.const 0
                    i64.load offset=1053156 align=4
                    i64.store offset=8 align=4
                    i32.const 0
                    local.get 9
                    i32.const 8
                    i32.add
                    i32.store offset=1053164
                    i32.const 0
                    local.get 6
                    i32.store offset=1053160
                    i32.const 0
                    local.get 0
                    i32.store offset=1053156
                    i32.const 0
                    i32.const 0
                    i32.store offset=1053168
                    local.get 9
                    i32.const 36
                    i32.add
                    local.set 4
                    loop ;; label = @8
                      local.get 4
                      i32.const 7
                      i32.store
                      local.get 4
                      i32.const 4
                      i32.add
                      local.tee 4
                      local.get 5
                      i32.lt_u
                      br_if 0 (;@8;)
                    end
                    local.get 9
                    local.get 3
                    i32.eq
                    br_if 2 (;@5;)
                    local.get 9
                    local.get 9
                    i32.load offset=4
                    i32.const -2
                    i32.and
                    i32.store offset=4
                    local.get 9
                    local.get 9
                    local.get 3
                    i32.sub
                    local.tee 0
                    i32.store
                    local.get 3
                    local.get 0
                    i32.const 1
                    i32.or
                    i32.store offset=4
                    block ;; label = @8
                      local.get 0
                      i32.const 255
                      i32.gt_u
                      br_if 0 (;@8;)
                      local.get 0
                      i32.const -8
                      i32.and
                      i32.const 1052748
                      i32.add
                      local.set 4
                      block ;; label = @9
                        block ;; label = @10
                          i32.const 0
                          i32.load offset=1052708
                          local.tee 5
                          i32.const 1
                          local.get 0
                          i32.const 3
                          i32.shr_u
                          i32.shl
                          local.tee 0
                          i32.and
                          br_if 0 (;@10;)
                          i32.const 0
                          local.get 5
                          local.get 0
                          i32.or
                          i32.store offset=1052708
                          local.get 4
                          local.set 5
                          br 1 (;@9;)
                        end
                        local.get 4
                        i32.load offset=8
                        local.set 5
                      end
                      local.get 5
                      local.get 3
                      i32.store offset=12
                      local.get 4
                      local.get 3
                      i32.store offset=8
                      local.get 3
                      local.get 4
                      i32.store offset=12
                      local.get 3
                      local.get 5
                      i32.store offset=8
                      br 3 (;@5;)
                    end
                    i32.const 31
                    local.set 4
                    block ;; label = @8
                      local.get 0
                      i32.const 16777215
                      i32.gt_u
                      br_if 0 (;@8;)
                      local.get 0
                      i32.const 38
                      local.get 0
                      i32.const 8
                      i32.shr_u
                      i32.clz
                      local.tee 4
                      i32.sub
                      i32.shr_u
                      i32.const 1
                      i32.and
                      local.get 4
                      i32.const 1
                      i32.shl
                      i32.sub
                      i32.const 62
                      i32.add
                      local.set 4
                    end
                    local.get 3
                    local.get 4
                    i32.store offset=28
                    local.get 3
                    i64.const 0
                    i64.store offset=16 align=4
                    local.get 4
                    i32.const 2
                    i32.shl
                    i32.const 1053012
                    i32.add
                    local.set 5
                    block ;; label = @8
                      i32.const 0
                      i32.load offset=1052712
                      local.tee 9
                      i32.const 1
                      local.get 4
                      i32.shl
                      local.tee 6
                      i32.and
                      br_if 0 (;@8;)
                      local.get 5
                      local.get 3
                      i32.store
                      i32.const 0
                      local.get 9
                      local.get 6
                      i32.or
                      i32.store offset=1052712
                      local.get 3
                      local.get 5
                      i32.store offset=24
                      local.get 3
                      local.get 3
                      i32.store offset=8
                      local.get 3
                      local.get 3
                      i32.store offset=12
                      br 3 (;@5;)
                    end
                    local.get 0
                    i32.const 0
                    i32.const 25
                    local.get 4
                    i32.const 1
                    i32.shr_u
                    i32.sub
                    local.get 4
                    i32.const 31
                    i32.eq
                    select
                    i32.shl
                    local.set 4
                    local.get 5
                    i32.load
                    local.set 9
                    loop ;; label = @8
                      local.get 9
                      local.tee 5
                      i32.load offset=4
                      i32.const -8
                      i32.and
                      local.get 0
                      i32.eq
                      br_if 2 (;@6;)
                      local.get 4
                      i32.const 29
                      i32.shr_u
                      local.set 9
                      local.get 4
                      i32.const 1
                      i32.shl
                      local.set 4
                      local.get 5
                      local.get 9
                      i32.const 4
                      i32.and
                      i32.add
                      i32.const 16
                      i32.add
                      local.tee 6
                      i32.load
                      local.tee 9
                      br_if 0 (;@8;)
                    end
                    local.get 6
                    local.get 3
                    i32.store
                    local.get 3
                    local.get 5
                    i32.store offset=24
                    local.get 3
                    local.get 3
                    i32.store offset=12
                    local.get 3
                    local.get 3
                    i32.store offset=8
                    br 2 (;@5;)
                  end
                  local.get 4
                  local.get 0
                  i32.store
                  local.get 4
                  local.get 4
                  i32.load offset=4
                  local.get 6
                  i32.add
                  i32.store offset=4
                  local.get 0
                  local.get 5
                  local.get 7
                  call $prepend_alloc
                  local.set 4
                  br 5 (;@1;)
                end
                local.get 5
                i32.load offset=8
                local.tee 4
                local.get 3
                i32.store offset=12
                local.get 5
                local.get 3
                i32.store offset=8
                local.get 3
                i32.const 0
                i32.store offset=24
                local.get 3
                local.get 5
                i32.store offset=12
                local.get 3
                local.get 4
                i32.store offset=8
              end
              i32.const 0
              i32.load offset=1052720
              local.tee 4
              local.get 7
              i32.le_u
              br_if 0 (;@4;)
              i32.const 0
              i32.load offset=1052732
              local.tee 3
              local.get 7
              i32.add
              local.tee 5
              local.get 4
              local.get 7
              i32.sub
              local.tee 4
              i32.const 1
              i32.or
              i32.store offset=4
              i32.const 0
              local.get 4
              i32.store offset=1052720
              i32.const 0
              local.get 5
              i32.store offset=1052732
              local.get 3
              local.get 7
              i32.const 3
              i32.or
              i32.store offset=4
              local.get 3
              i32.const 8
              i32.add
              local.set 4
              br 3 (;@1;)
            end
            i32.const 0
            local.set 4
            i32.const 0
            i32.const 48
            i32.store offset=1053204
            br 2 (;@1;)
          end
          block ;; label = @3
            local.get 2
            i32.eqz
            br_if 0 (;@3;)
            block ;; label = @4
              block ;; label = @5
                local.get 9
                local.get 9
                i32.load offset=28
                local.tee 5
                i32.const 2
                i32.shl
                i32.const 1053012
                i32.add
                local.tee 4
                i32.load
                i32.ne
                br_if 0 (;@5;)
                local.get 4
                local.get 0
                i32.store
                local.get 0
                br_if 1 (;@4;)
                i32.const 0
                local.get 11
                i32.const -2
                local.get 5
                i32.rotl
                i32.and
                local.tee 11
                i32.store offset=1052712
                br 2 (;@3;)
              end
              local.get 2
              i32.const 16
              i32.const 20
              local.get 2
              i32.load offset=16
              local.get 9
              i32.eq
              select
              i32.add
              local.get 0
              i32.store
              local.get 0
              i32.eqz
              br_if 1 (;@3;)
            end
            local.get 0
            local.get 2
            i32.store offset=24
            block ;; label = @4
              local.get 9
              i32.load offset=16
              local.tee 4
              i32.eqz
              br_if 0 (;@4;)
              local.get 0
              local.get 4
              i32.store offset=16
              local.get 4
              local.get 0
              i32.store offset=24
            end
            local.get 9
            i32.const 20
            i32.add
            i32.load
            local.tee 4
            i32.eqz
            br_if 0 (;@3;)
            local.get 0
            i32.const 20
            i32.add
            local.get 4
            i32.store
            local.get 4
            local.get 0
            i32.store offset=24
          end
          block ;; label = @3
            block ;; label = @4
              local.get 3
              i32.const 15
              i32.gt_u
              br_if 0 (;@4;)
              local.get 9
              local.get 3
              local.get 7
              i32.or
              local.tee 4
              i32.const 3
              i32.or
              i32.store offset=4
              local.get 9
              local.get 4
              i32.add
              local.tee 4
              local.get 4
              i32.load offset=4
              i32.const 1
              i32.or
              i32.store offset=4
              br 1 (;@3;)
            end
            local.get 9
            local.get 7
            i32.add
            local.tee 0
            local.get 3
            i32.const 1
            i32.or
            i32.store offset=4
            local.get 9
            local.get 7
            i32.const 3
            i32.or
            i32.store offset=4
            local.get 0
            local.get 3
            i32.add
            local.get 3
            i32.store
            block ;; label = @4
              local.get 3
              i32.const 255
              i32.gt_u
              br_if 0 (;@4;)
              local.get 3
              i32.const -8
              i32.and
              i32.const 1052748
              i32.add
              local.set 4
              block ;; label = @5
                block ;; label = @6
                  i32.const 0
                  i32.load offset=1052708
                  local.tee 5
                  i32.const 1
                  local.get 3
                  i32.const 3
                  i32.shr_u
                  i32.shl
                  local.tee 3
                  i32.and
                  br_if 0 (;@6;)
                  i32.const 0
                  local.get 5
                  local.get 3
                  i32.or
                  i32.store offset=1052708
                  local.get 4
                  local.set 3
                  br 1 (;@5;)
                end
                local.get 4
                i32.load offset=8
                local.set 3
              end
              local.get 3
              local.get 0
              i32.store offset=12
              local.get 4
              local.get 0
              i32.store offset=8
              local.get 0
              local.get 4
              i32.store offset=12
              local.get 0
              local.get 3
              i32.store offset=8
              br 1 (;@3;)
            end
            i32.const 31
            local.set 4
            block ;; label = @4
              local.get 3
              i32.const 16777215
              i32.gt_u
              br_if 0 (;@4;)
              local.get 3
              i32.const 38
              local.get 3
              i32.const 8
              i32.shr_u
              i32.clz
              local.tee 4
              i32.sub
              i32.shr_u
              i32.const 1
              i32.and
              local.get 4
              i32.const 1
              i32.shl
              i32.sub
              i32.const 62
              i32.add
              local.set 4
            end
            local.get 0
            local.get 4
            i32.store offset=28
            local.get 0
            i64.const 0
            i64.store offset=16 align=4
            local.get 4
            i32.const 2
            i32.shl
            i32.const 1053012
            i32.add
            local.set 5
            block ;; label = @4
              local.get 11
              i32.const 1
              local.get 4
              i32.shl
              local.tee 7
              i32.and
              br_if 0 (;@4;)
              local.get 5
              local.get 0
              i32.store
              i32.const 0
              local.get 11
              local.get 7
              i32.or
              i32.store offset=1052712
              local.get 0
              local.get 5
              i32.store offset=24
              local.get 0
              local.get 0
              i32.store offset=8
              local.get 0
              local.get 0
              i32.store offset=12
              br 1 (;@3;)
            end
            local.get 3
            i32.const 0
            i32.const 25
            local.get 4
            i32.const 1
            i32.shr_u
            i32.sub
            local.get 4
            i32.const 31
            i32.eq
            select
            i32.shl
            local.set 4
            local.get 5
            i32.load
            local.set 7
            block ;; label = @4
              loop ;; label = @5
                local.get 7
                local.tee 5
                i32.load offset=4
                i32.const -8
                i32.and
                local.get 3
                i32.eq
                br_if 1 (;@4;)
                local.get 4
                i32.const 29
                i32.shr_u
                local.set 7
                local.get 4
                i32.const 1
                i32.shl
                local.set 4
                local.get 5
                local.get 7
                i32.const 4
                i32.and
                i32.add
                i32.const 16
                i32.add
                local.tee 6
                i32.load
                local.tee 7
                br_if 0 (;@5;)
              end
              local.get 6
              local.get 0
              i32.store
              local.get 0
              local.get 5
              i32.store offset=24
              local.get 0
              local.get 0
              i32.store offset=12
              local.get 0
              local.get 0
              i32.store offset=8
              br 1 (;@3;)
            end
            local.get 5
            i32.load offset=8
            local.tee 4
            local.get 0
            i32.store offset=12
            local.get 5
            local.get 0
            i32.store offset=8
            local.get 0
            i32.const 0
            i32.store offset=24
            local.get 0
            local.get 5
            i32.store offset=12
            local.get 0
            local.get 4
            i32.store offset=8
          end
          local.get 9
          i32.const 8
          i32.add
          local.set 4
          br 1 (;@1;)
        end
        block ;; label = @2
          local.get 11
          i32.eqz
          br_if 0 (;@2;)
          block ;; label = @3
            block ;; label = @4
              local.get 0
              local.get 0
              i32.load offset=28
              local.tee 5
              i32.const 2
              i32.shl
              i32.const 1053012
              i32.add
              local.tee 4
              i32.load
              i32.ne
              br_if 0 (;@4;)
              local.get 4
              local.get 9
              i32.store
              local.get 9
              br_if 1 (;@3;)
              i32.const 0
              local.get 10
              i32.const -2
              local.get 5
              i32.rotl
              i32.and
              i32.store offset=1052712
              br 2 (;@2;)
            end
            local.get 11
            i32.const 16
            i32.const 20
            local.get 11
            i32.load offset=16
            local.get 0
            i32.eq
            select
            i32.add
            local.get 9
            i32.store
            local.get 9
            i32.eqz
            br_if 1 (;@2;)
          end
          local.get 9
          local.get 11
          i32.store offset=24
          block ;; label = @3
            local.get 0
            i32.load offset=16
            local.tee 4
            i32.eqz
            br_if 0 (;@3;)
            local.get 9
            local.get 4
            i32.store offset=16
            local.get 4
            local.get 9
            i32.store offset=24
          end
          local.get 0
          i32.const 20
          i32.add
          i32.load
          local.tee 4
          i32.eqz
          br_if 0 (;@2;)
          local.get 9
          i32.const 20
          i32.add
          local.get 4
          i32.store
          local.get 4
          local.get 9
          i32.store offset=24
        end
        block ;; label = @2
          block ;; label = @3
            local.get 3
            i32.const 15
            i32.gt_u
            br_if 0 (;@3;)
            local.get 0
            local.get 3
            local.get 7
            i32.or
            local.tee 4
            i32.const 3
            i32.or
            i32.store offset=4
            local.get 0
            local.get 4
            i32.add
            local.tee 4
            local.get 4
            i32.load offset=4
            i32.const 1
            i32.or
            i32.store offset=4
            br 1 (;@2;)
          end
          local.get 0
          local.get 7
          i32.add
          local.tee 5
          local.get 3
          i32.const 1
          i32.or
          i32.store offset=4
          local.get 0
          local.get 7
          i32.const 3
          i32.or
          i32.store offset=4
          local.get 5
          local.get 3
          i32.add
          local.get 3
          i32.store
          block ;; label = @3
            local.get 8
            i32.eqz
            br_if 0 (;@3;)
            local.get 8
            i32.const -8
            i32.and
            i32.const 1052748
            i32.add
            local.set 7
            i32.const 0
            i32.load offset=1052728
            local.set 4
            block ;; label = @4
              block ;; label = @5
                i32.const 1
                local.get 8
                i32.const 3
                i32.shr_u
                i32.shl
                local.tee 9
                local.get 6
                i32.and
                br_if 0 (;@5;)
                i32.const 0
                local.get 9
                local.get 6
                i32.or
                i32.store offset=1052708
                local.get 7
                local.set 9
                br 1 (;@4;)
              end
              local.get 7
              i32.load offset=8
              local.set 9
            end
            local.get 9
            local.get 4
            i32.store offset=12
            local.get 7
            local.get 4
            i32.store offset=8
            local.get 4
            local.get 7
            i32.store offset=12
            local.get 4
            local.get 9
            i32.store offset=8
          end
          i32.const 0
          local.get 5
          i32.store offset=1052728
          i32.const 0
          local.get 3
          i32.store offset=1052716
        end
        local.get 0
        i32.const 8
        i32.add
        local.set 4
      end
      local.get 1
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 4
    )
    (func $prepend_alloc (;139;) (type 2) (param i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32)
      local.get 0
      i32.const -8
      local.get 0
      i32.sub
      i32.const 15
      i32.and
      i32.add
      local.tee 3
      local.get 2
      i32.const 3
      i32.or
      i32.store offset=4
      local.get 1
      i32.const -8
      local.get 1
      i32.sub
      i32.const 15
      i32.and
      i32.add
      local.tee 4
      local.get 3
      local.get 2
      i32.add
      local.tee 5
      i32.sub
      local.set 2
      block ;; label = @1
        block ;; label = @2
          local.get 4
          i32.const 0
          i32.load offset=1052732
          i32.ne
          br_if 0 (;@2;)
          i32.const 0
          local.get 5
          i32.store offset=1052732
          i32.const 0
          i32.const 0
          i32.load offset=1052720
          local.get 2
          i32.add
          local.tee 2
          i32.store offset=1052720
          local.get 5
          local.get 2
          i32.const 1
          i32.or
          i32.store offset=4
          br 1 (;@1;)
        end
        block ;; label = @2
          local.get 4
          i32.const 0
          i32.load offset=1052728
          i32.ne
          br_if 0 (;@2;)
          i32.const 0
          local.get 5
          i32.store offset=1052728
          i32.const 0
          i32.const 0
          i32.load offset=1052716
          local.get 2
          i32.add
          local.tee 2
          i32.store offset=1052716
          local.get 5
          local.get 2
          i32.const 1
          i32.or
          i32.store offset=4
          local.get 5
          local.get 2
          i32.add
          local.get 2
          i32.store
          br 1 (;@1;)
        end
        block ;; label = @2
          local.get 4
          i32.load offset=4
          local.tee 0
          i32.const 3
          i32.and
          i32.const 1
          i32.ne
          br_if 0 (;@2;)
          local.get 0
          i32.const -8
          i32.and
          local.set 6
          block ;; label = @3
            block ;; label = @4
              local.get 0
              i32.const 255
              i32.gt_u
              br_if 0 (;@4;)
              local.get 4
              i32.load offset=8
              local.tee 1
              local.get 0
              i32.const 3
              i32.shr_u
              local.tee 7
              i32.const 3
              i32.shl
              i32.const 1052748
              i32.add
              local.tee 8
              i32.eq
              drop
              block ;; label = @5
                local.get 4
                i32.load offset=12
                local.tee 0
                local.get 1
                i32.ne
                br_if 0 (;@5;)
                i32.const 0
                i32.const 0
                i32.load offset=1052708
                i32.const -2
                local.get 7
                i32.rotl
                i32.and
                i32.store offset=1052708
                br 2 (;@3;)
              end
              local.get 0
              local.get 8
              i32.eq
              drop
              local.get 0
              local.get 1
              i32.store offset=8
              local.get 1
              local.get 0
              i32.store offset=12
              br 1 (;@3;)
            end
            local.get 4
            i32.load offset=24
            local.set 9
            block ;; label = @4
              block ;; label = @5
                local.get 4
                i32.load offset=12
                local.tee 8
                local.get 4
                i32.eq
                br_if 0 (;@5;)
                local.get 4
                i32.load offset=8
                local.tee 0
                i32.const 0
                i32.load offset=1052724
                i32.lt_u
                drop
                local.get 8
                local.get 0
                i32.store offset=8
                local.get 0
                local.get 8
                i32.store offset=12
                br 1 (;@4;)
              end
              block ;; label = @5
                block ;; label = @6
                  local.get 4
                  i32.const 20
                  i32.add
                  local.tee 1
                  i32.load
                  local.tee 0
                  br_if 0 (;@6;)
                  local.get 4
                  i32.load offset=16
                  local.tee 0
                  i32.eqz
                  br_if 1 (;@5;)
                  local.get 4
                  i32.const 16
                  i32.add
                  local.set 1
                end
                loop ;; label = @6
                  local.get 1
                  local.set 7
                  local.get 0
                  local.tee 8
                  i32.const 20
                  i32.add
                  local.tee 1
                  i32.load
                  local.tee 0
                  br_if 0 (;@6;)
                  local.get 8
                  i32.const 16
                  i32.add
                  local.set 1
                  local.get 8
                  i32.load offset=16
                  local.tee 0
                  br_if 0 (;@6;)
                end
                local.get 7
                i32.const 0
                i32.store
                br 1 (;@4;)
              end
              i32.const 0
              local.set 8
            end
            local.get 9
            i32.eqz
            br_if 0 (;@3;)
            block ;; label = @4
              block ;; label = @5
                local.get 4
                local.get 4
                i32.load offset=28
                local.tee 1
                i32.const 2
                i32.shl
                i32.const 1053012
                i32.add
                local.tee 0
                i32.load
                i32.ne
                br_if 0 (;@5;)
                local.get 0
                local.get 8
                i32.store
                local.get 8
                br_if 1 (;@4;)
                i32.const 0
                i32.const 0
                i32.load offset=1052712
                i32.const -2
                local.get 1
                i32.rotl
                i32.and
                i32.store offset=1052712
                br 2 (;@3;)
              end
              local.get 9
              i32.const 16
              i32.const 20
              local.get 9
              i32.load offset=16
              local.get 4
              i32.eq
              select
              i32.add
              local.get 8
              i32.store
              local.get 8
              i32.eqz
              br_if 1 (;@3;)
            end
            local.get 8
            local.get 9
            i32.store offset=24
            block ;; label = @4
              local.get 4
              i32.load offset=16
              local.tee 0
              i32.eqz
              br_if 0 (;@4;)
              local.get 8
              local.get 0
              i32.store offset=16
              local.get 0
              local.get 8
              i32.store offset=24
            end
            local.get 4
            i32.const 20
            i32.add
            i32.load
            local.tee 0
            i32.eqz
            br_if 0 (;@3;)
            local.get 8
            i32.const 20
            i32.add
            local.get 0
            i32.store
            local.get 0
            local.get 8
            i32.store offset=24
          end
          local.get 6
          local.get 2
          i32.add
          local.set 2
          local.get 4
          local.get 6
          i32.add
          local.tee 4
          i32.load offset=4
          local.set 0
        end
        local.get 4
        local.get 0
        i32.const -2
        i32.and
        i32.store offset=4
        local.get 5
        local.get 2
        i32.add
        local.get 2
        i32.store
        local.get 5
        local.get 2
        i32.const 1
        i32.or
        i32.store offset=4
        block ;; label = @2
          local.get 2
          i32.const 255
          i32.gt_u
          br_if 0 (;@2;)
          local.get 2
          i32.const -8
          i32.and
          i32.const 1052748
          i32.add
          local.set 0
          block ;; label = @3
            block ;; label = @4
              i32.const 0
              i32.load offset=1052708
              local.tee 1
              i32.const 1
              local.get 2
              i32.const 3
              i32.shr_u
              i32.shl
              local.tee 2
              i32.and
              br_if 0 (;@4;)
              i32.const 0
              local.get 1
              local.get 2
              i32.or
              i32.store offset=1052708
              local.get 0
              local.set 2
              br 1 (;@3;)
            end
            local.get 0
            i32.load offset=8
            local.set 2
          end
          local.get 2
          local.get 5
          i32.store offset=12
          local.get 0
          local.get 5
          i32.store offset=8
          local.get 5
          local.get 0
          i32.store offset=12
          local.get 5
          local.get 2
          i32.store offset=8
          br 1 (;@1;)
        end
        i32.const 31
        local.set 0
        block ;; label = @2
          local.get 2
          i32.const 16777215
          i32.gt_u
          br_if 0 (;@2;)
          local.get 2
          i32.const 38
          local.get 2
          i32.const 8
          i32.shr_u
          i32.clz
          local.tee 0
          i32.sub
          i32.shr_u
          i32.const 1
          i32.and
          local.get 0
          i32.const 1
          i32.shl
          i32.sub
          i32.const 62
          i32.add
          local.set 0
        end
        local.get 5
        local.get 0
        i32.store offset=28
        local.get 5
        i64.const 0
        i64.store offset=16 align=4
        local.get 0
        i32.const 2
        i32.shl
        i32.const 1053012
        i32.add
        local.set 1
        block ;; label = @2
          i32.const 0
          i32.load offset=1052712
          local.tee 8
          i32.const 1
          local.get 0
          i32.shl
          local.tee 4
          i32.and
          br_if 0 (;@2;)
          local.get 1
          local.get 5
          i32.store
          i32.const 0
          local.get 8
          local.get 4
          i32.or
          i32.store offset=1052712
          local.get 5
          local.get 1
          i32.store offset=24
          local.get 5
          local.get 5
          i32.store offset=8
          local.get 5
          local.get 5
          i32.store offset=12
          br 1 (;@1;)
        end
        local.get 2
        i32.const 0
        i32.const 25
        local.get 0
        i32.const 1
        i32.shr_u
        i32.sub
        local.get 0
        i32.const 31
        i32.eq
        select
        i32.shl
        local.set 0
        local.get 1
        i32.load
        local.set 8
        block ;; label = @2
          loop ;; label = @3
            local.get 8
            local.tee 1
            i32.load offset=4
            i32.const -8
            i32.and
            local.get 2
            i32.eq
            br_if 1 (;@2;)
            local.get 0
            i32.const 29
            i32.shr_u
            local.set 8
            local.get 0
            i32.const 1
            i32.shl
            local.set 0
            local.get 1
            local.get 8
            i32.const 4
            i32.and
            i32.add
            i32.const 16
            i32.add
            local.tee 4
            i32.load
            local.tee 8
            br_if 0 (;@3;)
          end
          local.get 4
          local.get 5
          i32.store
          local.get 5
          local.get 1
          i32.store offset=24
          local.get 5
          local.get 5
          i32.store offset=12
          local.get 5
          local.get 5
          i32.store offset=8
          br 1 (;@1;)
        end
        local.get 1
        i32.load offset=8
        local.tee 2
        local.get 5
        i32.store offset=12
        local.get 1
        local.get 5
        i32.store offset=8
        local.get 5
        i32.const 0
        i32.store offset=24
        local.get 5
        local.get 1
        i32.store offset=12
        local.get 5
        local.get 2
        i32.store offset=8
      end
      local.get 3
      i32.const 8
      i32.add
    )
    (func $free (;140;) (type 0) (param i32)
      local.get 0
      call $dlfree
    )
    (func $dlfree (;141;) (type 0) (param i32)
      (local i32 i32 i32 i32 i32 i32 i32)
      block ;; label = @1
        local.get 0
        i32.eqz
        br_if 0 (;@1;)
        local.get 0
        i32.const -8
        i32.add
        local.tee 1
        local.get 0
        i32.const -4
        i32.add
        i32.load
        local.tee 2
        i32.const -8
        i32.and
        local.tee 0
        i32.add
        local.set 3
        block ;; label = @2
          local.get 2
          i32.const 1
          i32.and
          br_if 0 (;@2;)
          local.get 2
          i32.const 2
          i32.and
          i32.eqz
          br_if 1 (;@1;)
          local.get 1
          local.get 1
          i32.load
          local.tee 2
          i32.sub
          local.tee 1
          i32.const 0
          i32.load offset=1052724
          local.tee 4
          i32.lt_u
          br_if 1 (;@1;)
          local.get 2
          local.get 0
          i32.add
          local.set 0
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                local.get 1
                i32.const 0
                i32.load offset=1052728
                i32.eq
                br_if 0 (;@5;)
                block ;; label = @6
                  local.get 2
                  i32.const 255
                  i32.gt_u
                  br_if 0 (;@6;)
                  local.get 1
                  i32.load offset=8
                  local.tee 4
                  local.get 2
                  i32.const 3
                  i32.shr_u
                  local.tee 5
                  i32.const 3
                  i32.shl
                  i32.const 1052748
                  i32.add
                  local.tee 6
                  i32.eq
                  drop
                  block ;; label = @7
                    local.get 1
                    i32.load offset=12
                    local.tee 2
                    local.get 4
                    i32.ne
                    br_if 0 (;@7;)
                    i32.const 0
                    i32.const 0
                    i32.load offset=1052708
                    i32.const -2
                    local.get 5
                    i32.rotl
                    i32.and
                    i32.store offset=1052708
                    br 5 (;@2;)
                  end
                  local.get 2
                  local.get 6
                  i32.eq
                  drop
                  local.get 2
                  local.get 4
                  i32.store offset=8
                  local.get 4
                  local.get 2
                  i32.store offset=12
                  br 4 (;@2;)
                end
                local.get 1
                i32.load offset=24
                local.set 7
                block ;; label = @6
                  local.get 1
                  i32.load offset=12
                  local.tee 6
                  local.get 1
                  i32.eq
                  br_if 0 (;@6;)
                  local.get 1
                  i32.load offset=8
                  local.tee 2
                  local.get 4
                  i32.lt_u
                  drop
                  local.get 6
                  local.get 2
                  i32.store offset=8
                  local.get 2
                  local.get 6
                  i32.store offset=12
                  br 3 (;@3;)
                end
                block ;; label = @6
                  local.get 1
                  i32.const 20
                  i32.add
                  local.tee 4
                  i32.load
                  local.tee 2
                  br_if 0 (;@6;)
                  local.get 1
                  i32.load offset=16
                  local.tee 2
                  i32.eqz
                  br_if 2 (;@4;)
                  local.get 1
                  i32.const 16
                  i32.add
                  local.set 4
                end
                loop ;; label = @6
                  local.get 4
                  local.set 5
                  local.get 2
                  local.tee 6
                  i32.const 20
                  i32.add
                  local.tee 4
                  i32.load
                  local.tee 2
                  br_if 0 (;@6;)
                  local.get 6
                  i32.const 16
                  i32.add
                  local.set 4
                  local.get 6
                  i32.load offset=16
                  local.tee 2
                  br_if 0 (;@6;)
                end
                local.get 5
                i32.const 0
                i32.store
                br 2 (;@3;)
              end
              local.get 3
              i32.load offset=4
              local.tee 2
              i32.const 3
              i32.and
              i32.const 3
              i32.ne
              br_if 2 (;@2;)
              local.get 3
              local.get 2
              i32.const -2
              i32.and
              i32.store offset=4
              i32.const 0
              local.get 0
              i32.store offset=1052716
              local.get 3
              local.get 0
              i32.store
              local.get 1
              local.get 0
              i32.const 1
              i32.or
              i32.store offset=4
              return
            end
            i32.const 0
            local.set 6
          end
          local.get 7
          i32.eqz
          br_if 0 (;@2;)
          block ;; label = @3
            block ;; label = @4
              local.get 1
              local.get 1
              i32.load offset=28
              local.tee 4
              i32.const 2
              i32.shl
              i32.const 1053012
              i32.add
              local.tee 2
              i32.load
              i32.ne
              br_if 0 (;@4;)
              local.get 2
              local.get 6
              i32.store
              local.get 6
              br_if 1 (;@3;)
              i32.const 0
              i32.const 0
              i32.load offset=1052712
              i32.const -2
              local.get 4
              i32.rotl
              i32.and
              i32.store offset=1052712
              br 2 (;@2;)
            end
            local.get 7
            i32.const 16
            i32.const 20
            local.get 7
            i32.load offset=16
            local.get 1
            i32.eq
            select
            i32.add
            local.get 6
            i32.store
            local.get 6
            i32.eqz
            br_if 1 (;@2;)
          end
          local.get 6
          local.get 7
          i32.store offset=24
          block ;; label = @3
            local.get 1
            i32.load offset=16
            local.tee 2
            i32.eqz
            br_if 0 (;@3;)
            local.get 6
            local.get 2
            i32.store offset=16
            local.get 2
            local.get 6
            i32.store offset=24
          end
          local.get 1
          i32.const 20
          i32.add
          i32.load
          local.tee 2
          i32.eqz
          br_if 0 (;@2;)
          local.get 6
          i32.const 20
          i32.add
          local.get 2
          i32.store
          local.get 2
          local.get 6
          i32.store offset=24
        end
        local.get 1
        local.get 3
        i32.ge_u
        br_if 0 (;@1;)
        local.get 3
        i32.load offset=4
        local.tee 2
        i32.const 1
        i32.and
        i32.eqz
        br_if 0 (;@1;)
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 2
                  i32.const 2
                  i32.and
                  br_if 0 (;@6;)
                  block ;; label = @7
                    local.get 3
                    i32.const 0
                    i32.load offset=1052732
                    i32.ne
                    br_if 0 (;@7;)
                    i32.const 0
                    local.get 1
                    i32.store offset=1052732
                    i32.const 0
                    i32.const 0
                    i32.load offset=1052720
                    local.get 0
                    i32.add
                    local.tee 0
                    i32.store offset=1052720
                    local.get 1
                    local.get 0
                    i32.const 1
                    i32.or
                    i32.store offset=4
                    local.get 1
                    i32.const 0
                    i32.load offset=1052728
                    i32.ne
                    br_if 6 (;@1;)
                    i32.const 0
                    i32.const 0
                    i32.store offset=1052716
                    i32.const 0
                    i32.const 0
                    i32.store offset=1052728
                    return
                  end
                  block ;; label = @7
                    local.get 3
                    i32.const 0
                    i32.load offset=1052728
                    i32.ne
                    br_if 0 (;@7;)
                    i32.const 0
                    local.get 1
                    i32.store offset=1052728
                    i32.const 0
                    i32.const 0
                    i32.load offset=1052716
                    local.get 0
                    i32.add
                    local.tee 0
                    i32.store offset=1052716
                    local.get 1
                    local.get 0
                    i32.const 1
                    i32.or
                    i32.store offset=4
                    local.get 1
                    local.get 0
                    i32.add
                    local.get 0
                    i32.store
                    return
                  end
                  local.get 2
                  i32.const -8
                  i32.and
                  local.get 0
                  i32.add
                  local.set 0
                  block ;; label = @7
                    local.get 2
                    i32.const 255
                    i32.gt_u
                    br_if 0 (;@7;)
                    local.get 3
                    i32.load offset=8
                    local.tee 4
                    local.get 2
                    i32.const 3
                    i32.shr_u
                    local.tee 5
                    i32.const 3
                    i32.shl
                    i32.const 1052748
                    i32.add
                    local.tee 6
                    i32.eq
                    drop
                    block ;; label = @8
                      local.get 3
                      i32.load offset=12
                      local.tee 2
                      local.get 4
                      i32.ne
                      br_if 0 (;@8;)
                      i32.const 0
                      i32.const 0
                      i32.load offset=1052708
                      i32.const -2
                      local.get 5
                      i32.rotl
                      i32.and
                      i32.store offset=1052708
                      br 5 (;@3;)
                    end
                    local.get 2
                    local.get 6
                    i32.eq
                    drop
                    local.get 2
                    local.get 4
                    i32.store offset=8
                    local.get 4
                    local.get 2
                    i32.store offset=12
                    br 4 (;@3;)
                  end
                  local.get 3
                  i32.load offset=24
                  local.set 7
                  block ;; label = @7
                    local.get 3
                    i32.load offset=12
                    local.tee 6
                    local.get 3
                    i32.eq
                    br_if 0 (;@7;)
                    local.get 3
                    i32.load offset=8
                    local.tee 2
                    i32.const 0
                    i32.load offset=1052724
                    i32.lt_u
                    drop
                    local.get 6
                    local.get 2
                    i32.store offset=8
                    local.get 2
                    local.get 6
                    i32.store offset=12
                    br 3 (;@4;)
                  end
                  block ;; label = @7
                    local.get 3
                    i32.const 20
                    i32.add
                    local.tee 4
                    i32.load
                    local.tee 2
                    br_if 0 (;@7;)
                    local.get 3
                    i32.load offset=16
                    local.tee 2
                    i32.eqz
                    br_if 2 (;@5;)
                    local.get 3
                    i32.const 16
                    i32.add
                    local.set 4
                  end
                  loop ;; label = @7
                    local.get 4
                    local.set 5
                    local.get 2
                    local.tee 6
                    i32.const 20
                    i32.add
                    local.tee 4
                    i32.load
                    local.tee 2
                    br_if 0 (;@7;)
                    local.get 6
                    i32.const 16
                    i32.add
                    local.set 4
                    local.get 6
                    i32.load offset=16
                    local.tee 2
                    br_if 0 (;@7;)
                  end
                  local.get 5
                  i32.const 0
                  i32.store
                  br 2 (;@4;)
                end
                local.get 3
                local.get 2
                i32.const -2
                i32.and
                i32.store offset=4
                local.get 1
                local.get 0
                i32.add
                local.get 0
                i32.store
                local.get 1
                local.get 0
                i32.const 1
                i32.or
                i32.store offset=4
                br 3 (;@2;)
              end
              i32.const 0
              local.set 6
            end
            local.get 7
            i32.eqz
            br_if 0 (;@3;)
            block ;; label = @4
              block ;; label = @5
                local.get 3
                local.get 3
                i32.load offset=28
                local.tee 4
                i32.const 2
                i32.shl
                i32.const 1053012
                i32.add
                local.tee 2
                i32.load
                i32.ne
                br_if 0 (;@5;)
                local.get 2
                local.get 6
                i32.store
                local.get 6
                br_if 1 (;@4;)
                i32.const 0
                i32.const 0
                i32.load offset=1052712
                i32.const -2
                local.get 4
                i32.rotl
                i32.and
                i32.store offset=1052712
                br 2 (;@3;)
              end
              local.get 7
              i32.const 16
              i32.const 20
              local.get 7
              i32.load offset=16
              local.get 3
              i32.eq
              select
              i32.add
              local.get 6
              i32.store
              local.get 6
              i32.eqz
              br_if 1 (;@3;)
            end
            local.get 6
            local.get 7
            i32.store offset=24
            block ;; label = @4
              local.get 3
              i32.load offset=16
              local.tee 2
              i32.eqz
              br_if 0 (;@4;)
              local.get 6
              local.get 2
              i32.store offset=16
              local.get 2
              local.get 6
              i32.store offset=24
            end
            local.get 3
            i32.const 20
            i32.add
            i32.load
            local.tee 2
            i32.eqz
            br_if 0 (;@3;)
            local.get 6
            i32.const 20
            i32.add
            local.get 2
            i32.store
            local.get 2
            local.get 6
            i32.store offset=24
          end
          local.get 1
          local.get 0
          i32.add
          local.get 0
          i32.store
          local.get 1
          local.get 0
          i32.const 1
          i32.or
          i32.store offset=4
          local.get 1
          i32.const 0
          i32.load offset=1052728
          i32.ne
          br_if 0 (;@2;)
          i32.const 0
          local.get 0
          i32.store offset=1052716
          return
        end
        block ;; label = @2
          local.get 0
          i32.const 255
          i32.gt_u
          br_if 0 (;@2;)
          local.get 0
          i32.const -8
          i32.and
          i32.const 1052748
          i32.add
          local.set 2
          block ;; label = @3
            block ;; label = @4
              i32.const 0
              i32.load offset=1052708
              local.tee 4
              i32.const 1
              local.get 0
              i32.const 3
              i32.shr_u
              i32.shl
              local.tee 0
              i32.and
              br_if 0 (;@4;)
              i32.const 0
              local.get 4
              local.get 0
              i32.or
              i32.store offset=1052708
              local.get 2
              local.set 0
              br 1 (;@3;)
            end
            local.get 2
            i32.load offset=8
            local.set 0
          end
          local.get 0
          local.get 1
          i32.store offset=12
          local.get 2
          local.get 1
          i32.store offset=8
          local.get 1
          local.get 2
          i32.store offset=12
          local.get 1
          local.get 0
          i32.store offset=8
          return
        end
        i32.const 31
        local.set 2
        block ;; label = @2
          local.get 0
          i32.const 16777215
          i32.gt_u
          br_if 0 (;@2;)
          local.get 0
          i32.const 38
          local.get 0
          i32.const 8
          i32.shr_u
          i32.clz
          local.tee 2
          i32.sub
          i32.shr_u
          i32.const 1
          i32.and
          local.get 2
          i32.const 1
          i32.shl
          i32.sub
          i32.const 62
          i32.add
          local.set 2
        end
        local.get 1
        local.get 2
        i32.store offset=28
        local.get 1
        i64.const 0
        i64.store offset=16 align=4
        local.get 2
        i32.const 2
        i32.shl
        i32.const 1053012
        i32.add
        local.set 4
        block ;; label = @2
          block ;; label = @3
            i32.const 0
            i32.load offset=1052712
            local.tee 6
            i32.const 1
            local.get 2
            i32.shl
            local.tee 3
            i32.and
            br_if 0 (;@3;)
            local.get 4
            local.get 1
            i32.store
            i32.const 0
            local.get 6
            local.get 3
            i32.or
            i32.store offset=1052712
            local.get 1
            local.get 4
            i32.store offset=24
            local.get 1
            local.get 1
            i32.store offset=8
            local.get 1
            local.get 1
            i32.store offset=12
            br 1 (;@2;)
          end
          local.get 0
          i32.const 0
          i32.const 25
          local.get 2
          i32.const 1
          i32.shr_u
          i32.sub
          local.get 2
          i32.const 31
          i32.eq
          select
          i32.shl
          local.set 2
          local.get 4
          i32.load
          local.set 6
          block ;; label = @3
            loop ;; label = @4
              local.get 6
              local.tee 4
              i32.load offset=4
              i32.const -8
              i32.and
              local.get 0
              i32.eq
              br_if 1 (;@3;)
              local.get 2
              i32.const 29
              i32.shr_u
              local.set 6
              local.get 2
              i32.const 1
              i32.shl
              local.set 2
              local.get 4
              local.get 6
              i32.const 4
              i32.and
              i32.add
              i32.const 16
              i32.add
              local.tee 3
              i32.load
              local.tee 6
              br_if 0 (;@4;)
            end
            local.get 3
            local.get 1
            i32.store
            local.get 1
            local.get 4
            i32.store offset=24
            local.get 1
            local.get 1
            i32.store offset=12
            local.get 1
            local.get 1
            i32.store offset=8
            br 1 (;@2;)
          end
          local.get 4
          i32.load offset=8
          local.tee 0
          local.get 1
          i32.store offset=12
          local.get 4
          local.get 1
          i32.store offset=8
          local.get 1
          i32.const 0
          i32.store offset=24
          local.get 1
          local.get 4
          i32.store offset=12
          local.get 1
          local.get 0
          i32.store offset=8
        end
        i32.const 0
        i32.const 0
        i32.load offset=1052740
        i32.const -1
        i32.add
        local.tee 1
        i32.const -1
        local.get 1
        select
        i32.store offset=1052740
      end
    )
    (func $calloc (;142;) (type 4) (param i32 i32) (result i32)
      (local i32 i64)
      block ;; label = @1
        block ;; label = @2
          local.get 0
          br_if 0 (;@2;)
          i32.const 0
          local.set 2
          br 1 (;@1;)
        end
        local.get 0
        i64.extend_i32_u
        local.get 1
        i64.extend_i32_u
        i64.mul
        local.tee 3
        i32.wrap_i64
        local.set 2
        local.get 1
        local.get 0
        i32.or
        i32.const 65536
        i32.lt_u
        br_if 0 (;@1;)
        i32.const -1
        local.get 2
        local.get 3
        i64.const 32
        i64.shr_u
        i32.wrap_i64
        i32.const 0
        i32.ne
        select
        local.set 2
      end
      block ;; label = @1
        local.get 2
        call $dlmalloc
        local.tee 0
        i32.eqz
        br_if 0 (;@1;)
        local.get 0
        i32.const -4
        i32.add
        i32.load8_u
        i32.const 3
        i32.and
        i32.eqz
        br_if 0 (;@1;)
        local.get 0
        i32.const 0
        local.get 2
        call $memset
        drop
      end
      local.get 0
    )
    (func $realloc (;143;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      block ;; label = @1
        local.get 0
        br_if 0 (;@1;)
        local.get 1
        call $dlmalloc
        return
      end
      block ;; label = @1
        local.get 1
        i32.const -64
        i32.lt_u
        br_if 0 (;@1;)
        i32.const 0
        i32.const 48
        i32.store offset=1053204
        i32.const 0
        return
      end
      i32.const 16
      local.get 1
      i32.const 19
      i32.add
      i32.const -16
      i32.and
      local.get 1
      i32.const 11
      i32.lt_u
      select
      local.set 2
      local.get 0
      i32.const -4
      i32.add
      local.tee 3
      i32.load
      local.tee 4
      i32.const -8
      i32.and
      local.set 5
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 4
            i32.const 3
            i32.and
            br_if 0 (;@3;)
            local.get 2
            i32.const 256
            i32.lt_u
            br_if 1 (;@2;)
            local.get 5
            local.get 2
            i32.const 4
            i32.or
            i32.lt_u
            br_if 1 (;@2;)
            local.get 5
            local.get 2
            i32.sub
            i32.const 0
            i32.load offset=1053188
            i32.const 1
            i32.shl
            i32.le_u
            br_if 2 (;@1;)
            br 1 (;@2;)
          end
          local.get 0
          i32.const -8
          i32.add
          local.tee 6
          local.get 5
          i32.add
          local.set 7
          block ;; label = @3
            local.get 5
            local.get 2
            i32.lt_u
            br_if 0 (;@3;)
            local.get 5
            local.get 2
            i32.sub
            local.tee 1
            i32.const 16
            i32.lt_u
            br_if 2 (;@1;)
            local.get 3
            local.get 2
            local.get 4
            i32.const 1
            i32.and
            i32.or
            i32.const 2
            i32.or
            i32.store
            local.get 6
            local.get 2
            i32.add
            local.tee 2
            local.get 1
            i32.const 3
            i32.or
            i32.store offset=4
            local.get 7
            local.get 7
            i32.load offset=4
            i32.const 1
            i32.or
            i32.store offset=4
            local.get 2
            local.get 1
            call $dispose_chunk
            local.get 0
            return
          end
          block ;; label = @3
            local.get 7
            i32.const 0
            i32.load offset=1052732
            i32.ne
            br_if 0 (;@3;)
            i32.const 0
            i32.load offset=1052720
            local.get 5
            i32.add
            local.tee 5
            local.get 2
            i32.le_u
            br_if 1 (;@2;)
            local.get 3
            local.get 2
            local.get 4
            i32.const 1
            i32.and
            i32.or
            i32.const 2
            i32.or
            i32.store
            i32.const 0
            local.get 6
            local.get 2
            i32.add
            local.tee 1
            i32.store offset=1052732
            i32.const 0
            local.get 5
            local.get 2
            i32.sub
            local.tee 2
            i32.store offset=1052720
            local.get 1
            local.get 2
            i32.const 1
            i32.or
            i32.store offset=4
            local.get 0
            return
          end
          block ;; label = @3
            local.get 7
            i32.const 0
            i32.load offset=1052728
            i32.ne
            br_if 0 (;@3;)
            i32.const 0
            i32.load offset=1052716
            local.get 5
            i32.add
            local.tee 5
            local.get 2
            i32.lt_u
            br_if 1 (;@2;)
            block ;; label = @4
              block ;; label = @5
                local.get 5
                local.get 2
                i32.sub
                local.tee 1
                i32.const 16
                i32.lt_u
                br_if 0 (;@5;)
                local.get 3
                local.get 2
                local.get 4
                i32.const 1
                i32.and
                i32.or
                i32.const 2
                i32.or
                i32.store
                local.get 6
                local.get 2
                i32.add
                local.tee 2
                local.get 1
                i32.const 1
                i32.or
                i32.store offset=4
                local.get 6
                local.get 5
                i32.add
                local.tee 5
                local.get 1
                i32.store
                local.get 5
                local.get 5
                i32.load offset=4
                i32.const -2
                i32.and
                i32.store offset=4
                br 1 (;@4;)
              end
              local.get 3
              local.get 4
              i32.const 1
              i32.and
              local.get 5
              i32.or
              i32.const 2
              i32.or
              i32.store
              local.get 6
              local.get 5
              i32.add
              local.tee 1
              local.get 1
              i32.load offset=4
              i32.const 1
              i32.or
              i32.store offset=4
              i32.const 0
              local.set 1
              i32.const 0
              local.set 2
            end
            i32.const 0
            local.get 2
            i32.store offset=1052728
            i32.const 0
            local.get 1
            i32.store offset=1052716
            local.get 0
            return
          end
          local.get 7
          i32.load offset=4
          local.tee 8
          i32.const 2
          i32.and
          br_if 0 (;@2;)
          local.get 8
          i32.const -8
          i32.and
          local.get 5
          i32.add
          local.tee 9
          local.get 2
          i32.lt_u
          br_if 0 (;@2;)
          local.get 9
          local.get 2
          i32.sub
          local.set 10
          block ;; label = @3
            block ;; label = @4
              local.get 8
              i32.const 255
              i32.gt_u
              br_if 0 (;@4;)
              local.get 7
              i32.load offset=8
              local.tee 1
              local.get 8
              i32.const 3
              i32.shr_u
              local.tee 11
              i32.const 3
              i32.shl
              i32.const 1052748
              i32.add
              local.tee 8
              i32.eq
              drop
              block ;; label = @5
                local.get 7
                i32.load offset=12
                local.tee 5
                local.get 1
                i32.ne
                br_if 0 (;@5;)
                i32.const 0
                i32.const 0
                i32.load offset=1052708
                i32.const -2
                local.get 11
                i32.rotl
                i32.and
                i32.store offset=1052708
                br 2 (;@3;)
              end
              local.get 5
              local.get 8
              i32.eq
              drop
              local.get 5
              local.get 1
              i32.store offset=8
              local.get 1
              local.get 5
              i32.store offset=12
              br 1 (;@3;)
            end
            local.get 7
            i32.load offset=24
            local.set 12
            block ;; label = @4
              block ;; label = @5
                local.get 7
                i32.load offset=12
                local.tee 8
                local.get 7
                i32.eq
                br_if 0 (;@5;)
                local.get 7
                i32.load offset=8
                local.tee 1
                i32.const 0
                i32.load offset=1052724
                i32.lt_u
                drop
                local.get 8
                local.get 1
                i32.store offset=8
                local.get 1
                local.get 8
                i32.store offset=12
                br 1 (;@4;)
              end
              block ;; label = @5
                block ;; label = @6
                  local.get 7
                  i32.const 20
                  i32.add
                  local.tee 5
                  i32.load
                  local.tee 1
                  br_if 0 (;@6;)
                  local.get 7
                  i32.load offset=16
                  local.tee 1
                  i32.eqz
                  br_if 1 (;@5;)
                  local.get 7
                  i32.const 16
                  i32.add
                  local.set 5
                end
                loop ;; label = @6
                  local.get 5
                  local.set 11
                  local.get 1
                  local.tee 8
                  i32.const 20
                  i32.add
                  local.tee 5
                  i32.load
                  local.tee 1
                  br_if 0 (;@6;)
                  local.get 8
                  i32.const 16
                  i32.add
                  local.set 5
                  local.get 8
                  i32.load offset=16
                  local.tee 1
                  br_if 0 (;@6;)
                end
                local.get 11
                i32.const 0
                i32.store
                br 1 (;@4;)
              end
              i32.const 0
              local.set 8
            end
            local.get 12
            i32.eqz
            br_if 0 (;@3;)
            block ;; label = @4
              block ;; label = @5
                local.get 7
                local.get 7
                i32.load offset=28
                local.tee 5
                i32.const 2
                i32.shl
                i32.const 1053012
                i32.add
                local.tee 1
                i32.load
                i32.ne
                br_if 0 (;@5;)
                local.get 1
                local.get 8
                i32.store
                local.get 8
                br_if 1 (;@4;)
                i32.const 0
                i32.const 0
                i32.load offset=1052712
                i32.const -2
                local.get 5
                i32.rotl
                i32.and
                i32.store offset=1052712
                br 2 (;@3;)
              end
              local.get 12
              i32.const 16
              i32.const 20
              local.get 12
              i32.load offset=16
              local.get 7
              i32.eq
              select
              i32.add
              local.get 8
              i32.store
              local.get 8
              i32.eqz
              br_if 1 (;@3;)
            end
            local.get 8
            local.get 12
            i32.store offset=24
            block ;; label = @4
              local.get 7
              i32.load offset=16
              local.tee 1
              i32.eqz
              br_if 0 (;@4;)
              local.get 8
              local.get 1
              i32.store offset=16
              local.get 1
              local.get 8
              i32.store offset=24
            end
            local.get 7
            i32.const 20
            i32.add
            i32.load
            local.tee 1
            i32.eqz
            br_if 0 (;@3;)
            local.get 8
            i32.const 20
            i32.add
            local.get 1
            i32.store
            local.get 1
            local.get 8
            i32.store offset=24
          end
          block ;; label = @3
            local.get 10
            i32.const 15
            i32.gt_u
            br_if 0 (;@3;)
            local.get 3
            local.get 4
            i32.const 1
            i32.and
            local.get 9
            i32.or
            i32.const 2
            i32.or
            i32.store
            local.get 6
            local.get 9
            i32.add
            local.tee 1
            local.get 1
            i32.load offset=4
            i32.const 1
            i32.or
            i32.store offset=4
            local.get 0
            return
          end
          local.get 3
          local.get 2
          local.get 4
          i32.const 1
          i32.and
          i32.or
          i32.const 2
          i32.or
          i32.store
          local.get 6
          local.get 2
          i32.add
          local.tee 1
          local.get 10
          i32.const 3
          i32.or
          i32.store offset=4
          local.get 6
          local.get 9
          i32.add
          local.tee 2
          local.get 2
          i32.load offset=4
          i32.const 1
          i32.or
          i32.store offset=4
          local.get 1
          local.get 10
          call $dispose_chunk
          local.get 0
          return
        end
        block ;; label = @2
          local.get 1
          call $dlmalloc
          local.tee 2
          br_if 0 (;@2;)
          i32.const 0
          return
        end
        local.get 2
        local.get 0
        i32.const -4
        i32.const -8
        local.get 3
        i32.load
        local.tee 5
        i32.const 3
        i32.and
        select
        local.get 5
        i32.const -8
        i32.and
        i32.add
        local.tee 5
        local.get 1
        local.get 5
        local.get 1
        i32.lt_u
        select
        call $memcpy
        local.set 1
        local.get 0
        call $dlfree
        local.get 1
        local.set 0
      end
      local.get 0
    )
    (func $dispose_chunk (;144;) (type 1) (param i32 i32)
      (local i32 i32 i32 i32 i32 i32)
      local.get 0
      local.get 1
      i32.add
      local.set 2
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i32.load offset=4
          local.tee 3
          i32.const 1
          i32.and
          br_if 0 (;@2;)
          local.get 3
          i32.const 2
          i32.and
          i32.eqz
          br_if 1 (;@1;)
          local.get 0
          i32.load
          local.tee 3
          local.get 1
          i32.add
          local.set 1
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 0
                  local.get 3
                  i32.sub
                  local.tee 0
                  i32.const 0
                  i32.load offset=1052728
                  i32.eq
                  br_if 0 (;@6;)
                  block ;; label = @7
                    local.get 3
                    i32.const 255
                    i32.gt_u
                    br_if 0 (;@7;)
                    local.get 0
                    i32.load offset=8
                    local.tee 4
                    local.get 3
                    i32.const 3
                    i32.shr_u
                    local.tee 5
                    i32.const 3
                    i32.shl
                    i32.const 1052748
                    i32.add
                    local.tee 6
                    i32.eq
                    drop
                    local.get 0
                    i32.load offset=12
                    local.tee 3
                    local.get 4
                    i32.ne
                    br_if 2 (;@5;)
                    i32.const 0
                    i32.const 0
                    i32.load offset=1052708
                    i32.const -2
                    local.get 5
                    i32.rotl
                    i32.and
                    i32.store offset=1052708
                    br 5 (;@2;)
                  end
                  local.get 0
                  i32.load offset=24
                  local.set 7
                  block ;; label = @7
                    local.get 0
                    i32.load offset=12
                    local.tee 6
                    local.get 0
                    i32.eq
                    br_if 0 (;@7;)
                    local.get 0
                    i32.load offset=8
                    local.tee 3
                    i32.const 0
                    i32.load offset=1052724
                    i32.lt_u
                    drop
                    local.get 6
                    local.get 3
                    i32.store offset=8
                    local.get 3
                    local.get 6
                    i32.store offset=12
                    br 4 (;@3;)
                  end
                  block ;; label = @7
                    local.get 0
                    i32.const 20
                    i32.add
                    local.tee 4
                    i32.load
                    local.tee 3
                    br_if 0 (;@7;)
                    local.get 0
                    i32.load offset=16
                    local.tee 3
                    i32.eqz
                    br_if 3 (;@4;)
                    local.get 0
                    i32.const 16
                    i32.add
                    local.set 4
                  end
                  loop ;; label = @7
                    local.get 4
                    local.set 5
                    local.get 3
                    local.tee 6
                    i32.const 20
                    i32.add
                    local.tee 4
                    i32.load
                    local.tee 3
                    br_if 0 (;@7;)
                    local.get 6
                    i32.const 16
                    i32.add
                    local.set 4
                    local.get 6
                    i32.load offset=16
                    local.tee 3
                    br_if 0 (;@7;)
                  end
                  local.get 5
                  i32.const 0
                  i32.store
                  br 3 (;@3;)
                end
                local.get 2
                i32.load offset=4
                local.tee 3
                i32.const 3
                i32.and
                i32.const 3
                i32.ne
                br_if 3 (;@2;)
                local.get 2
                local.get 3
                i32.const -2
                i32.and
                i32.store offset=4
                i32.const 0
                local.get 1
                i32.store offset=1052716
                local.get 2
                local.get 1
                i32.store
                local.get 0
                local.get 1
                i32.const 1
                i32.or
                i32.store offset=4
                return
              end
              local.get 3
              local.get 6
              i32.eq
              drop
              local.get 3
              local.get 4
              i32.store offset=8
              local.get 4
              local.get 3
              i32.store offset=12
              br 2 (;@2;)
            end
            i32.const 0
            local.set 6
          end
          local.get 7
          i32.eqz
          br_if 0 (;@2;)
          block ;; label = @3
            block ;; label = @4
              local.get 0
              local.get 0
              i32.load offset=28
              local.tee 4
              i32.const 2
              i32.shl
              i32.const 1053012
              i32.add
              local.tee 3
              i32.load
              i32.ne
              br_if 0 (;@4;)
              local.get 3
              local.get 6
              i32.store
              local.get 6
              br_if 1 (;@3;)
              i32.const 0
              i32.const 0
              i32.load offset=1052712
              i32.const -2
              local.get 4
              i32.rotl
              i32.and
              i32.store offset=1052712
              br 2 (;@2;)
            end
            local.get 7
            i32.const 16
            i32.const 20
            local.get 7
            i32.load offset=16
            local.get 0
            i32.eq
            select
            i32.add
            local.get 6
            i32.store
            local.get 6
            i32.eqz
            br_if 1 (;@2;)
          end
          local.get 6
          local.get 7
          i32.store offset=24
          block ;; label = @3
            local.get 0
            i32.load offset=16
            local.tee 3
            i32.eqz
            br_if 0 (;@3;)
            local.get 6
            local.get 3
            i32.store offset=16
            local.get 3
            local.get 6
            i32.store offset=24
          end
          local.get 0
          i32.const 20
          i32.add
          i32.load
          local.tee 3
          i32.eqz
          br_if 0 (;@2;)
          local.get 6
          i32.const 20
          i32.add
          local.get 3
          i32.store
          local.get 3
          local.get 6
          i32.store offset=24
        end
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 2
                  i32.load offset=4
                  local.tee 3
                  i32.const 2
                  i32.and
                  br_if 0 (;@6;)
                  block ;; label = @7
                    local.get 2
                    i32.const 0
                    i32.load offset=1052732
                    i32.ne
                    br_if 0 (;@7;)
                    i32.const 0
                    local.get 0
                    i32.store offset=1052732
                    i32.const 0
                    i32.const 0
                    i32.load offset=1052720
                    local.get 1
                    i32.add
                    local.tee 1
                    i32.store offset=1052720
                    local.get 0
                    local.get 1
                    i32.const 1
                    i32.or
                    i32.store offset=4
                    local.get 0
                    i32.const 0
                    i32.load offset=1052728
                    i32.ne
                    br_if 6 (;@1;)
                    i32.const 0
                    i32.const 0
                    i32.store offset=1052716
                    i32.const 0
                    i32.const 0
                    i32.store offset=1052728
                    return
                  end
                  block ;; label = @7
                    local.get 2
                    i32.const 0
                    i32.load offset=1052728
                    i32.ne
                    br_if 0 (;@7;)
                    i32.const 0
                    local.get 0
                    i32.store offset=1052728
                    i32.const 0
                    i32.const 0
                    i32.load offset=1052716
                    local.get 1
                    i32.add
                    local.tee 1
                    i32.store offset=1052716
                    local.get 0
                    local.get 1
                    i32.const 1
                    i32.or
                    i32.store offset=4
                    local.get 0
                    local.get 1
                    i32.add
                    local.get 1
                    i32.store
                    return
                  end
                  local.get 3
                  i32.const -8
                  i32.and
                  local.get 1
                  i32.add
                  local.set 1
                  block ;; label = @7
                    local.get 3
                    i32.const 255
                    i32.gt_u
                    br_if 0 (;@7;)
                    local.get 2
                    i32.load offset=8
                    local.tee 4
                    local.get 3
                    i32.const 3
                    i32.shr_u
                    local.tee 5
                    i32.const 3
                    i32.shl
                    i32.const 1052748
                    i32.add
                    local.tee 6
                    i32.eq
                    drop
                    block ;; label = @8
                      local.get 2
                      i32.load offset=12
                      local.tee 3
                      local.get 4
                      i32.ne
                      br_if 0 (;@8;)
                      i32.const 0
                      i32.const 0
                      i32.load offset=1052708
                      i32.const -2
                      local.get 5
                      i32.rotl
                      i32.and
                      i32.store offset=1052708
                      br 5 (;@3;)
                    end
                    local.get 3
                    local.get 6
                    i32.eq
                    drop
                    local.get 3
                    local.get 4
                    i32.store offset=8
                    local.get 4
                    local.get 3
                    i32.store offset=12
                    br 4 (;@3;)
                  end
                  local.get 2
                  i32.load offset=24
                  local.set 7
                  block ;; label = @7
                    local.get 2
                    i32.load offset=12
                    local.tee 6
                    local.get 2
                    i32.eq
                    br_if 0 (;@7;)
                    local.get 2
                    i32.load offset=8
                    local.tee 3
                    i32.const 0
                    i32.load offset=1052724
                    i32.lt_u
                    drop
                    local.get 6
                    local.get 3
                    i32.store offset=8
                    local.get 3
                    local.get 6
                    i32.store offset=12
                    br 3 (;@4;)
                  end
                  block ;; label = @7
                    local.get 2
                    i32.const 20
                    i32.add
                    local.tee 4
                    i32.load
                    local.tee 3
                    br_if 0 (;@7;)
                    local.get 2
                    i32.load offset=16
                    local.tee 3
                    i32.eqz
                    br_if 2 (;@5;)
                    local.get 2
                    i32.const 16
                    i32.add
                    local.set 4
                  end
                  loop ;; label = @7
                    local.get 4
                    local.set 5
                    local.get 3
                    local.tee 6
                    i32.const 20
                    i32.add
                    local.tee 4
                    i32.load
                    local.tee 3
                    br_if 0 (;@7;)
                    local.get 6
                    i32.const 16
                    i32.add
                    local.set 4
                    local.get 6
                    i32.load offset=16
                    local.tee 3
                    br_if 0 (;@7;)
                  end
                  local.get 5
                  i32.const 0
                  i32.store
                  br 2 (;@4;)
                end
                local.get 2
                local.get 3
                i32.const -2
                i32.and
                i32.store offset=4
                local.get 0
                local.get 1
                i32.add
                local.get 1
                i32.store
                local.get 0
                local.get 1
                i32.const 1
                i32.or
                i32.store offset=4
                br 3 (;@2;)
              end
              i32.const 0
              local.set 6
            end
            local.get 7
            i32.eqz
            br_if 0 (;@3;)
            block ;; label = @4
              block ;; label = @5
                local.get 2
                local.get 2
                i32.load offset=28
                local.tee 4
                i32.const 2
                i32.shl
                i32.const 1053012
                i32.add
                local.tee 3
                i32.load
                i32.ne
                br_if 0 (;@5;)
                local.get 3
                local.get 6
                i32.store
                local.get 6
                br_if 1 (;@4;)
                i32.const 0
                i32.const 0
                i32.load offset=1052712
                i32.const -2
                local.get 4
                i32.rotl
                i32.and
                i32.store offset=1052712
                br 2 (;@3;)
              end
              local.get 7
              i32.const 16
              i32.const 20
              local.get 7
              i32.load offset=16
              local.get 2
              i32.eq
              select
              i32.add
              local.get 6
              i32.store
              local.get 6
              i32.eqz
              br_if 1 (;@3;)
            end
            local.get 6
            local.get 7
            i32.store offset=24
            block ;; label = @4
              local.get 2
              i32.load offset=16
              local.tee 3
              i32.eqz
              br_if 0 (;@4;)
              local.get 6
              local.get 3
              i32.store offset=16
              local.get 3
              local.get 6
              i32.store offset=24
            end
            local.get 2
            i32.const 20
            i32.add
            i32.load
            local.tee 3
            i32.eqz
            br_if 0 (;@3;)
            local.get 6
            i32.const 20
            i32.add
            local.get 3
            i32.store
            local.get 3
            local.get 6
            i32.store offset=24
          end
          local.get 0
          local.get 1
          i32.add
          local.get 1
          i32.store
          local.get 0
          local.get 1
          i32.const 1
          i32.or
          i32.store offset=4
          local.get 0
          i32.const 0
          i32.load offset=1052728
          i32.ne
          br_if 0 (;@2;)
          i32.const 0
          local.get 1
          i32.store offset=1052716
          return
        end
        block ;; label = @2
          local.get 1
          i32.const 255
          i32.gt_u
          br_if 0 (;@2;)
          local.get 1
          i32.const -8
          i32.and
          i32.const 1052748
          i32.add
          local.set 3
          block ;; label = @3
            block ;; label = @4
              i32.const 0
              i32.load offset=1052708
              local.tee 4
              i32.const 1
              local.get 1
              i32.const 3
              i32.shr_u
              i32.shl
              local.tee 1
              i32.and
              br_if 0 (;@4;)
              i32.const 0
              local.get 4
              local.get 1
              i32.or
              i32.store offset=1052708
              local.get 3
              local.set 1
              br 1 (;@3;)
            end
            local.get 3
            i32.load offset=8
            local.set 1
          end
          local.get 1
          local.get 0
          i32.store offset=12
          local.get 3
          local.get 0
          i32.store offset=8
          local.get 0
          local.get 3
          i32.store offset=12
          local.get 0
          local.get 1
          i32.store offset=8
          return
        end
        i32.const 31
        local.set 3
        block ;; label = @2
          local.get 1
          i32.const 16777215
          i32.gt_u
          br_if 0 (;@2;)
          local.get 1
          i32.const 38
          local.get 1
          i32.const 8
          i32.shr_u
          i32.clz
          local.tee 3
          i32.sub
          i32.shr_u
          i32.const 1
          i32.and
          local.get 3
          i32.const 1
          i32.shl
          i32.sub
          i32.const 62
          i32.add
          local.set 3
        end
        local.get 0
        local.get 3
        i32.store offset=28
        local.get 0
        i64.const 0
        i64.store offset=16 align=4
        local.get 3
        i32.const 2
        i32.shl
        i32.const 1053012
        i32.add
        local.set 4
        block ;; label = @2
          i32.const 0
          i32.load offset=1052712
          local.tee 6
          i32.const 1
          local.get 3
          i32.shl
          local.tee 2
          i32.and
          br_if 0 (;@2;)
          local.get 4
          local.get 0
          i32.store
          i32.const 0
          local.get 6
          local.get 2
          i32.or
          i32.store offset=1052712
          local.get 0
          local.get 4
          i32.store offset=24
          local.get 0
          local.get 0
          i32.store offset=8
          local.get 0
          local.get 0
          i32.store offset=12
          return
        end
        local.get 1
        i32.const 0
        i32.const 25
        local.get 3
        i32.const 1
        i32.shr_u
        i32.sub
        local.get 3
        i32.const 31
        i32.eq
        select
        i32.shl
        local.set 3
        local.get 4
        i32.load
        local.set 6
        block ;; label = @2
          loop ;; label = @3
            local.get 6
            local.tee 4
            i32.load offset=4
            i32.const -8
            i32.and
            local.get 1
            i32.eq
            br_if 1 (;@2;)
            local.get 3
            i32.const 29
            i32.shr_u
            local.set 6
            local.get 3
            i32.const 1
            i32.shl
            local.set 3
            local.get 4
            local.get 6
            i32.const 4
            i32.and
            i32.add
            i32.const 16
            i32.add
            local.tee 2
            i32.load
            local.tee 6
            br_if 0 (;@3;)
          end
          local.get 2
          local.get 0
          i32.store
          local.get 0
          local.get 4
          i32.store offset=24
          local.get 0
          local.get 0
          i32.store offset=12
          local.get 0
          local.get 0
          i32.store offset=8
          return
        end
        local.get 4
        i32.load offset=8
        local.tee 1
        local.get 0
        i32.store offset=12
        local.get 4
        local.get 0
        i32.store offset=8
        local.get 0
        i32.const 0
        i32.store offset=24
        local.get 0
        local.get 4
        i32.store offset=12
        local.get 0
        local.get 1
        i32.store offset=8
      end
    )
    (func $posix_memalign (;145;) (type 2) (param i32 i32 i32) (result i32)
      (local i32 i32)
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 1
            i32.const 16
            i32.ne
            br_if 0 (;@3;)
            local.get 2
            call $dlmalloc
            local.set 1
            br 1 (;@2;)
          end
          i32.const 28
          local.set 3
          local.get 1
          i32.const 4
          i32.lt_u
          br_if 1 (;@1;)
          local.get 1
          i32.const 3
          i32.and
          br_if 1 (;@1;)
          local.get 1
          i32.const 2
          i32.shr_u
          local.tee 4
          local.get 4
          i32.const -1
          i32.add
          i32.and
          br_if 1 (;@1;)
          i32.const 48
          local.set 3
          i32.const -64
          local.get 1
          i32.sub
          local.get 2
          i32.lt_u
          br_if 1 (;@1;)
          local.get 1
          i32.const 16
          local.get 1
          i32.const 16
          i32.gt_u
          select
          local.get 2
          call $internal_memalign
          local.set 1
        end
        block ;; label = @2
          local.get 1
          br_if 0 (;@2;)
          i32.const 48
          return
        end
        local.get 0
        local.get 1
        i32.store
        i32.const 0
        local.set 3
      end
      local.get 3
    )
    (func $internal_memalign (;146;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i32.const 16
          local.get 0
          i32.const 16
          i32.gt_u
          select
          local.tee 2
          local.get 2
          i32.const -1
          i32.add
          i32.and
          br_if 0 (;@2;)
          local.get 2
          local.set 0
          br 1 (;@1;)
        end
        i32.const 32
        local.set 3
        loop ;; label = @2
          local.get 3
          local.tee 0
          i32.const 1
          i32.shl
          local.set 3
          local.get 0
          local.get 2
          i32.lt_u
          br_if 0 (;@2;)
        end
      end
      block ;; label = @1
        i32.const -64
        local.get 0
        i32.sub
        local.get 1
        i32.gt_u
        br_if 0 (;@1;)
        i32.const 0
        i32.const 48
        i32.store offset=1053204
        i32.const 0
        return
      end
      block ;; label = @1
        local.get 0
        i32.const 16
        local.get 1
        i32.const 19
        i32.add
        i32.const -16
        i32.and
        local.get 1
        i32.const 11
        i32.lt_u
        select
        local.tee 1
        i32.add
        i32.const 12
        i32.add
        call $dlmalloc
        local.tee 3
        br_if 0 (;@1;)
        i32.const 0
        return
      end
      local.get 3
      i32.const -8
      i32.add
      local.set 2
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i32.const -1
          i32.add
          local.get 3
          i32.and
          br_if 0 (;@2;)
          local.get 2
          local.set 0
          br 1 (;@1;)
        end
        local.get 3
        i32.const -4
        i32.add
        local.tee 4
        i32.load
        local.tee 5
        i32.const -8
        i32.and
        local.get 3
        local.get 0
        i32.add
        i32.const -1
        i32.add
        i32.const 0
        local.get 0
        i32.sub
        i32.and
        i32.const -8
        i32.add
        local.tee 3
        i32.const 0
        local.get 0
        local.get 3
        local.get 2
        i32.sub
        i32.const 15
        i32.gt_u
        select
        i32.add
        local.tee 0
        local.get 2
        i32.sub
        local.tee 3
        i32.sub
        local.set 6
        block ;; label = @2
          local.get 5
          i32.const 3
          i32.and
          br_if 0 (;@2;)
          local.get 0
          local.get 6
          i32.store offset=4
          local.get 0
          local.get 2
          i32.load
          local.get 3
          i32.add
          i32.store
          br 1 (;@1;)
        end
        local.get 0
        local.get 6
        local.get 0
        i32.load offset=4
        i32.const 1
        i32.and
        i32.or
        i32.const 2
        i32.or
        i32.store offset=4
        local.get 0
        local.get 6
        i32.add
        local.tee 6
        local.get 6
        i32.load offset=4
        i32.const 1
        i32.or
        i32.store offset=4
        local.get 4
        local.get 3
        local.get 4
        i32.load
        i32.const 1
        i32.and
        i32.or
        i32.const 2
        i32.or
        i32.store
        local.get 2
        local.get 3
        i32.add
        local.tee 6
        local.get 6
        i32.load offset=4
        i32.const 1
        i32.or
        i32.store offset=4
        local.get 2
        local.get 3
        call $dispose_chunk
      end
      block ;; label = @1
        local.get 0
        i32.load offset=4
        local.tee 3
        i32.const 3
        i32.and
        i32.eqz
        br_if 0 (;@1;)
        local.get 3
        i32.const -8
        i32.and
        local.tee 2
        local.get 1
        i32.const 16
        i32.add
        i32.le_u
        br_if 0 (;@1;)
        local.get 0
        local.get 1
        local.get 3
        i32.const 1
        i32.and
        i32.or
        i32.const 2
        i32.or
        i32.store offset=4
        local.get 0
        local.get 1
        i32.add
        local.tee 3
        local.get 2
        local.get 1
        i32.sub
        local.tee 1
        i32.const 3
        i32.or
        i32.store offset=4
        local.get 0
        local.get 2
        i32.add
        local.tee 2
        local.get 2
        i32.load offset=4
        i32.const 1
        i32.or
        i32.store offset=4
        local.get 3
        local.get 1
        call $dispose_chunk
      end
      local.get 0
      i32.const 8
      i32.add
    )
    (func $_Exit (;147;) (type 0) (param i32)
      local.get 0
      call $__wasi_proc_exit
      unreachable
    )
    (func $__wasilibc_ensure_environ (;148;) (type 7)
      block ;; label = @1
        i32.const 0
        i32.load offset=1052636
        i32.const -1
        i32.ne
        br_if 0 (;@1;)
        call $__wasilibc_initialize_environ
      end
    )
    (func $__wasilibc_initialize_environ (;149;) (type 7)
      (local i32 i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 0
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i32.const 12
          i32.add
          local.get 0
          i32.const 8
          i32.add
          call $__wasi_environ_sizes_get
          br_if 0 (;@2;)
          block ;; label = @3
            local.get 0
            i32.load offset=12
            local.tee 1
            br_if 0 (;@3;)
            i32.const 1053208
            local.set 1
            br 2 (;@1;)
          end
          block ;; label = @3
            block ;; label = @4
              local.get 1
              i32.const 1
              i32.add
              local.tee 1
              i32.eqz
              br_if 0 (;@4;)
              local.get 0
              i32.load offset=8
              call $malloc
              local.tee 2
              i32.eqz
              br_if 0 (;@4;)
              local.get 1
              i32.const 4
              call $calloc
              local.tee 1
              br_if 1 (;@3;)
              local.get 2
              call $free
            end
            i32.const 70
            call $_Exit
            unreachable
          end
          local.get 1
          local.get 2
          call $__wasi_environ_get
          i32.eqz
          br_if 1 (;@1;)
          local.get 2
          call $free
          local.get 1
          call $free
        end
        i32.const 71
        call $_Exit
        unreachable
      end
      i32.const 0
      local.get 1
      i32.store offset=1052636
      local.get 0
      i32.const 16
      i32.add
      global.set $__stack_pointer
    )
    (func $__wasi_environ_get (;150;) (type 4) (param i32 i32) (result i32)
      local.get 0
      local.get 1
      call $__imported_wasi_snapshot_preview1_environ_get
      i32.const 65535
      i32.and
    )
    (func $__wasi_environ_sizes_get (;151;) (type 4) (param i32 i32) (result i32)
      local.get 0
      local.get 1
      call $__imported_wasi_snapshot_preview1_environ_sizes_get
      i32.const 65535
      i32.and
    )
    (func $__wasi_proc_exit (;152;) (type 0) (param i32)
      local.get 0
      call $__imported_wasi_snapshot_preview1_proc_exit
      unreachable
    )
    (func $abort (;153;) (type 7)
      unreachable
      unreachable
    )
    (func $getcwd (;154;) (type 4) (param i32 i32) (result i32)
      (local i32)
      i32.const 0
      i32.load offset=1052640
      local.set 2
      block ;; label = @1
        block ;; label = @2
          local.get 0
          br_if 0 (;@2;)
          local.get 2
          call $strdup
          local.tee 0
          br_if 1 (;@1;)
          i32.const 0
          i32.const 48
          i32.store offset=1053204
          i32.const 0
          return
        end
        block ;; label = @2
          local.get 2
          call $strlen
          i32.const 1
          i32.add
          local.get 1
          i32.le_u
          br_if 0 (;@2;)
          i32.const 0
          i32.const 68
          i32.store offset=1053204
          i32.const 0
          return
        end
        local.get 0
        local.get 2
        call $strcpy
        local.set 0
      end
      local.get 0
    )
    (func $sbrk (;155;) (type 8) (param i32) (result i32)
      block ;; label = @1
        local.get 0
        br_if 0 (;@1;)
        memory.size
        i32.const 16
        i32.shl
        return
      end
      block ;; label = @1
        local.get 0
        i32.const 65535
        i32.and
        br_if 0 (;@1;)
        local.get 0
        i32.const -1
        i32.le_s
        br_if 0 (;@1;)
        block ;; label = @2
          local.get 0
          i32.const 16
          i32.shr_u
          memory.grow
          local.tee 0
          i32.const -1
          i32.ne
          br_if 0 (;@2;)
          i32.const 0
          i32.const 48
          i32.store offset=1053204
          i32.const -1
          return
        end
        local.get 0
        i32.const 16
        i32.shl
        return
      end
      call $abort
      unreachable
    )
    (func $getenv (;156;) (type 8) (param i32) (result i32)
      (local i32 i32 i32 i32)
      call $__wasilibc_ensure_environ
      block ;; label = @1
        local.get 0
        i32.const 61
        call $__strchrnul
        local.tee 1
        local.get 0
        i32.ne
        br_if 0 (;@1;)
        i32.const 0
        return
      end
      i32.const 0
      local.set 2
      block ;; label = @1
        local.get 0
        local.get 1
        local.get 0
        i32.sub
        local.tee 3
        i32.add
        i32.load8_u
        br_if 0 (;@1;)
        i32.const 0
        i32.load offset=1052636
        local.tee 4
        i32.eqz
        br_if 0 (;@1;)
        local.get 4
        i32.load
        local.tee 1
        i32.eqz
        br_if 0 (;@1;)
        local.get 4
        i32.const 4
        i32.add
        local.set 4
        block ;; label = @2
          loop ;; label = @3
            block ;; label = @4
              local.get 0
              local.get 1
              local.get 3
              call $strncmp
              br_if 0 (;@4;)
              local.get 1
              local.get 3
              i32.add
              local.tee 1
              i32.load8_u
              i32.const 61
              i32.eq
              br_if 2 (;@2;)
            end
            local.get 4
            i32.load
            local.set 1
            local.get 4
            i32.const 4
            i32.add
            local.set 4
            local.get 1
            br_if 0 (;@3;)
            br 2 (;@1;)
          end
        end
        local.get 1
        i32.const 1
        i32.add
        local.set 2
      end
      local.get 2
    )
    (func $memcmp (;157;) (type 2) (param i32 i32 i32) (result i32)
      (local i32 i32 i32)
      i32.const 0
      local.set 3
      block ;; label = @1
        local.get 2
        i32.eqz
        br_if 0 (;@1;)
        block ;; label = @2
          loop ;; label = @3
            local.get 0
            i32.load8_u
            local.tee 4
            local.get 1
            i32.load8_u
            local.tee 5
            i32.ne
            br_if 1 (;@2;)
            local.get 1
            i32.const 1
            i32.add
            local.set 1
            local.get 0
            i32.const 1
            i32.add
            local.set 0
            local.get 2
            i32.const -1
            i32.add
            local.tee 2
            br_if 0 (;@3;)
            br 2 (;@1;)
          end
        end
        local.get 4
        local.get 5
        i32.sub
        local.set 3
      end
      local.get 3
    )
    (func $memcpy (;158;) (type 2) (param i32 i32 i32) (result i32)
      (local i32 i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 2
            i32.const 32
            i32.gt_u
            br_if 0 (;@3;)
            local.get 1
            i32.const 3
            i32.and
            i32.eqz
            br_if 1 (;@2;)
            local.get 2
            i32.eqz
            br_if 1 (;@2;)
            local.get 0
            local.get 1
            i32.load8_u
            i32.store8
            local.get 2
            i32.const -1
            i32.add
            local.set 3
            local.get 0
            i32.const 1
            i32.add
            local.set 4
            local.get 1
            i32.const 1
            i32.add
            local.tee 5
            i32.const 3
            i32.and
            i32.eqz
            br_if 2 (;@1;)
            local.get 3
            i32.eqz
            br_if 2 (;@1;)
            local.get 0
            local.get 1
            i32.load8_u offset=1
            i32.store8 offset=1
            local.get 2
            i32.const -2
            i32.add
            local.set 3
            local.get 0
            i32.const 2
            i32.add
            local.set 4
            local.get 1
            i32.const 2
            i32.add
            local.tee 5
            i32.const 3
            i32.and
            i32.eqz
            br_if 2 (;@1;)
            local.get 3
            i32.eqz
            br_if 2 (;@1;)
            local.get 0
            local.get 1
            i32.load8_u offset=2
            i32.store8 offset=2
            local.get 2
            i32.const -3
            i32.add
            local.set 3
            local.get 0
            i32.const 3
            i32.add
            local.set 4
            local.get 1
            i32.const 3
            i32.add
            local.tee 5
            i32.const 3
            i32.and
            i32.eqz
            br_if 2 (;@1;)
            local.get 3
            i32.eqz
            br_if 2 (;@1;)
            local.get 0
            local.get 1
            i32.load8_u offset=3
            i32.store8 offset=3
            local.get 2
            i32.const -4
            i32.add
            local.set 3
            local.get 0
            i32.const 4
            i32.add
            local.set 4
            local.get 1
            i32.const 4
            i32.add
            local.set 5
            br 2 (;@1;)
          end
          local.get 0
          local.get 1
          local.get 2
          memory.copy
          local.get 0
          return
        end
        local.get 2
        local.set 3
        local.get 0
        local.set 4
        local.get 1
        local.set 5
      end
      block ;; label = @1
        block ;; label = @2
          local.get 4
          i32.const 3
          i32.and
          local.tee 2
          br_if 0 (;@2;)
          block ;; label = @3
            block ;; label = @4
              local.get 3
              i32.const 16
              i32.ge_u
              br_if 0 (;@4;)
              local.get 3
              local.set 2
              br 1 (;@3;)
            end
            block ;; label = @4
              local.get 3
              i32.const -16
              i32.add
              local.tee 2
              i32.const 16
              i32.and
              br_if 0 (;@4;)
              local.get 4
              local.get 5
              i64.load align=4
              i64.store align=4
              local.get 4
              local.get 5
              i64.load offset=8 align=4
              i64.store offset=8 align=4
              local.get 4
              i32.const 16
              i32.add
              local.set 4
              local.get 5
              i32.const 16
              i32.add
              local.set 5
              local.get 2
              local.set 3
            end
            local.get 2
            i32.const 16
            i32.lt_u
            br_if 0 (;@3;)
            local.get 3
            local.set 2
            loop ;; label = @4
              local.get 4
              local.get 5
              i64.load align=4
              i64.store align=4
              local.get 4
              local.get 5
              i64.load offset=8 align=4
              i64.store offset=8 align=4
              local.get 4
              local.get 5
              i64.load offset=16 align=4
              i64.store offset=16 align=4
              local.get 4
              local.get 5
              i64.load offset=24 align=4
              i64.store offset=24 align=4
              local.get 4
              i32.const 32
              i32.add
              local.set 4
              local.get 5
              i32.const 32
              i32.add
              local.set 5
              local.get 2
              i32.const -32
              i32.add
              local.tee 2
              i32.const 15
              i32.gt_u
              br_if 0 (;@4;)
            end
          end
          block ;; label = @3
            local.get 2
            i32.const 8
            i32.lt_u
            br_if 0 (;@3;)
            local.get 4
            local.get 5
            i64.load align=4
            i64.store align=4
            local.get 5
            i32.const 8
            i32.add
            local.set 5
            local.get 4
            i32.const 8
            i32.add
            local.set 4
          end
          block ;; label = @3
            local.get 2
            i32.const 4
            i32.and
            i32.eqz
            br_if 0 (;@3;)
            local.get 4
            local.get 5
            i32.load
            i32.store
            local.get 5
            i32.const 4
            i32.add
            local.set 5
            local.get 4
            i32.const 4
            i32.add
            local.set 4
          end
          block ;; label = @3
            local.get 2
            i32.const 2
            i32.and
            i32.eqz
            br_if 0 (;@3;)
            local.get 4
            local.get 5
            i32.load16_u align=1
            i32.store16 align=1
            local.get 4
            i32.const 2
            i32.add
            local.set 4
            local.get 5
            i32.const 2
            i32.add
            local.set 5
          end
          local.get 2
          i32.const 1
          i32.and
          i32.eqz
          br_if 1 (;@1;)
          local.get 4
          local.get 5
          i32.load8_u
          i32.store8
          local.get 0
          return
        end
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 3
                  i32.const 32
                  i32.lt_u
                  br_if 0 (;@6;)
                  local.get 4
                  local.get 5
                  i32.load
                  local.tee 3
                  i32.store8
                  block ;; label = @7
                    block ;; label = @8
                      local.get 2
                      i32.const -1
                      i32.add
                      br_table 3 (;@5;) 0 (;@8;) 1 (;@7;) 3 (;@5;)
                    end
                    local.get 4
                    local.get 3
                    i32.const 8
                    i32.shr_u
                    i32.store8 offset=1
                    local.get 4
                    local.get 5
                    i32.const 6
                    i32.add
                    i64.load align=2
                    i64.store offset=6 align=4
                    local.get 4
                    local.get 5
                    i32.load offset=4
                    i32.const 16
                    i32.shl
                    local.get 3
                    i32.const 16
                    i32.shr_u
                    i32.or
                    i32.store offset=2
                    local.get 4
                    i32.const 18
                    i32.add
                    local.set 2
                    local.get 5
                    i32.const 18
                    i32.add
                    local.set 1
                    i32.const 14
                    local.set 6
                    local.get 5
                    i32.const 14
                    i32.add
                    i32.load align=2
                    local.set 5
                    i32.const 14
                    local.set 3
                    br 3 (;@4;)
                  end
                  local.get 4
                  local.get 5
                  i32.const 5
                  i32.add
                  i64.load align=1
                  i64.store offset=5 align=4
                  local.get 4
                  local.get 5
                  i32.load offset=4
                  i32.const 24
                  i32.shl
                  local.get 3
                  i32.const 8
                  i32.shr_u
                  i32.or
                  i32.store offset=1
                  local.get 4
                  i32.const 17
                  i32.add
                  local.set 2
                  local.get 5
                  i32.const 17
                  i32.add
                  local.set 1
                  i32.const 13
                  local.set 6
                  local.get 5
                  i32.const 13
                  i32.add
                  i32.load align=1
                  local.set 5
                  i32.const 15
                  local.set 3
                  br 2 (;@4;)
                end
                block ;; label = @6
                  block ;; label = @7
                    local.get 3
                    i32.const 16
                    i32.ge_u
                    br_if 0 (;@7;)
                    local.get 4
                    local.set 2
                    local.get 5
                    local.set 1
                    br 1 (;@6;)
                  end
                  local.get 4
                  local.get 5
                  i32.load8_u
                  i32.store8
                  local.get 4
                  local.get 5
                  i32.load offset=1 align=1
                  i32.store offset=1 align=1
                  local.get 4
                  local.get 5
                  i64.load offset=5 align=1
                  i64.store offset=5 align=1
                  local.get 4
                  local.get 5
                  i32.load16_u offset=13 align=1
                  i32.store16 offset=13 align=1
                  local.get 4
                  local.get 5
                  i32.load8_u offset=15
                  i32.store8 offset=15
                  local.get 4
                  i32.const 16
                  i32.add
                  local.set 2
                  local.get 5
                  i32.const 16
                  i32.add
                  local.set 1
                end
                local.get 3
                i32.const 8
                i32.and
                br_if 2 (;@3;)
                br 3 (;@2;)
              end
              local.get 4
              local.get 3
              i32.const 16
              i32.shr_u
              i32.store8 offset=2
              local.get 4
              local.get 3
              i32.const 8
              i32.shr_u
              i32.store8 offset=1
              local.get 4
              local.get 5
              i32.const 7
              i32.add
              i64.load align=1
              i64.store offset=7 align=4
              local.get 4
              local.get 5
              i32.load offset=4
              i32.const 8
              i32.shl
              local.get 3
              i32.const 24
              i32.shr_u
              i32.or
              i32.store offset=3
              local.get 4
              i32.const 19
              i32.add
              local.set 2
              local.get 5
              i32.const 19
              i32.add
              local.set 1
              i32.const 15
              local.set 6
              local.get 5
              i32.const 15
              i32.add
              i32.load align=1
              local.set 5
              i32.const 13
              local.set 3
            end
            local.get 4
            local.get 6
            i32.add
            local.get 5
            i32.store
          end
          local.get 2
          local.get 1
          i64.load align=1
          i64.store align=1
          local.get 2
          i32.const 8
          i32.add
          local.set 2
          local.get 1
          i32.const 8
          i32.add
          local.set 1
        end
        block ;; label = @2
          local.get 3
          i32.const 4
          i32.and
          i32.eqz
          br_if 0 (;@2;)
          local.get 2
          local.get 1
          i32.load align=1
          i32.store align=1
          local.get 2
          i32.const 4
          i32.add
          local.set 2
          local.get 1
          i32.const 4
          i32.add
          local.set 1
        end
        block ;; label = @2
          local.get 3
          i32.const 2
          i32.and
          i32.eqz
          br_if 0 (;@2;)
          local.get 2
          local.get 1
          i32.load16_u align=1
          i32.store16 align=1
          local.get 2
          i32.const 2
          i32.add
          local.set 2
          local.get 1
          i32.const 2
          i32.add
          local.set 1
        end
        local.get 3
        i32.const 1
        i32.and
        i32.eqz
        br_if 0 (;@1;)
        local.get 2
        local.get 1
        i32.load8_u
        i32.store8
      end
      local.get 0
    )
    (func $memset (;159;) (type 2) (param i32 i32 i32) (result i32)
      (local i32 i32 i32 i64)
      block ;; label = @1
        local.get 2
        i32.const 33
        i32.lt_u
        br_if 0 (;@1;)
        local.get 0
        local.get 1
        local.get 2
        memory.fill
        local.get 0
        return
      end
      block ;; label = @1
        local.get 2
        i32.eqz
        br_if 0 (;@1;)
        local.get 0
        local.get 1
        i32.store8
        local.get 0
        local.get 2
        i32.add
        local.tee 3
        i32.const -1
        i32.add
        local.get 1
        i32.store8
        local.get 2
        i32.const 3
        i32.lt_u
        br_if 0 (;@1;)
        local.get 0
        local.get 1
        i32.store8 offset=2
        local.get 0
        local.get 1
        i32.store8 offset=1
        local.get 3
        i32.const -3
        i32.add
        local.get 1
        i32.store8
        local.get 3
        i32.const -2
        i32.add
        local.get 1
        i32.store8
        local.get 2
        i32.const 7
        i32.lt_u
        br_if 0 (;@1;)
        local.get 0
        local.get 1
        i32.store8 offset=3
        local.get 3
        i32.const -4
        i32.add
        local.get 1
        i32.store8
        local.get 2
        i32.const 9
        i32.lt_u
        br_if 0 (;@1;)
        local.get 0
        i32.const 0
        local.get 0
        i32.sub
        i32.const 3
        i32.and
        local.tee 4
        i32.add
        local.tee 5
        local.get 1
        i32.const 255
        i32.and
        i32.const 16843009
        i32.mul
        local.tee 3
        i32.store
        local.get 5
        local.get 2
        local.get 4
        i32.sub
        i32.const -4
        i32.and
        local.tee 1
        i32.add
        local.tee 2
        i32.const -4
        i32.add
        local.get 3
        i32.store
        local.get 1
        i32.const 9
        i32.lt_u
        br_if 0 (;@1;)
        local.get 5
        local.get 3
        i32.store offset=8
        local.get 5
        local.get 3
        i32.store offset=4
        local.get 2
        i32.const -8
        i32.add
        local.get 3
        i32.store
        local.get 2
        i32.const -12
        i32.add
        local.get 3
        i32.store
        local.get 1
        i32.const 25
        i32.lt_u
        br_if 0 (;@1;)
        local.get 5
        local.get 3
        i32.store offset=24
        local.get 5
        local.get 3
        i32.store offset=20
        local.get 5
        local.get 3
        i32.store offset=16
        local.get 5
        local.get 3
        i32.store offset=12
        local.get 2
        i32.const -16
        i32.add
        local.get 3
        i32.store
        local.get 2
        i32.const -20
        i32.add
        local.get 3
        i32.store
        local.get 2
        i32.const -24
        i32.add
        local.get 3
        i32.store
        local.get 2
        i32.const -28
        i32.add
        local.get 3
        i32.store
        local.get 1
        local.get 5
        i32.const 4
        i32.and
        i32.const 24
        i32.or
        local.tee 2
        i32.sub
        local.tee 1
        i32.const 32
        i32.lt_u
        br_if 0 (;@1;)
        local.get 3
        i64.extend_i32_u
        i64.const 4294967297
        i64.mul
        local.set 6
        local.get 5
        local.get 2
        i32.add
        local.set 2
        loop ;; label = @2
          local.get 2
          local.get 6
          i64.store offset=24
          local.get 2
          local.get 6
          i64.store offset=16
          local.get 2
          local.get 6
          i64.store offset=8
          local.get 2
          local.get 6
          i64.store
          local.get 2
          i32.const 32
          i32.add
          local.set 2
          local.get 1
          i32.const -32
          i32.add
          local.tee 1
          i32.const 31
          i32.gt_u
          br_if 0 (;@2;)
        end
      end
      local.get 0
    )
    (func $__strchrnul (;160;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 1
              i32.const 255
              i32.and
              local.tee 2
              i32.eqz
              br_if 0 (;@4;)
              local.get 0
              i32.const 3
              i32.and
              i32.eqz
              br_if 2 (;@2;)
              block ;; label = @5
                local.get 0
                i32.load8_u
                local.tee 3
                br_if 0 (;@5;)
                local.get 0
                return
              end
              local.get 3
              local.get 1
              i32.const 255
              i32.and
              i32.ne
              br_if 1 (;@3;)
              local.get 0
              return
            end
            local.get 0
            local.get 0
            call $strlen
            i32.add
            return
          end
          block ;; label = @3
            local.get 0
            i32.const 1
            i32.add
            local.tee 3
            i32.const 3
            i32.and
            br_if 0 (;@3;)
            local.get 3
            local.set 0
            br 1 (;@2;)
          end
          local.get 3
          i32.load8_u
          local.tee 4
          i32.eqz
          br_if 1 (;@1;)
          local.get 4
          local.get 1
          i32.const 255
          i32.and
          i32.eq
          br_if 1 (;@1;)
          block ;; label = @3
            local.get 0
            i32.const 2
            i32.add
            local.tee 3
            i32.const 3
            i32.and
            br_if 0 (;@3;)
            local.get 3
            local.set 0
            br 1 (;@2;)
          end
          local.get 3
          i32.load8_u
          local.tee 4
          i32.eqz
          br_if 1 (;@1;)
          local.get 4
          local.get 1
          i32.const 255
          i32.and
          i32.eq
          br_if 1 (;@1;)
          block ;; label = @3
            local.get 0
            i32.const 3
            i32.add
            local.tee 3
            i32.const 3
            i32.and
            br_if 0 (;@3;)
            local.get 3
            local.set 0
            br 1 (;@2;)
          end
          local.get 3
          i32.load8_u
          local.tee 4
          i32.eqz
          br_if 1 (;@1;)
          local.get 4
          local.get 1
          i32.const 255
          i32.and
          i32.eq
          br_if 1 (;@1;)
          local.get 0
          i32.const 4
          i32.add
          local.set 0
        end
        block ;; label = @2
          local.get 0
          i32.load
          local.tee 3
          i32.const -1
          i32.xor
          local.get 3
          i32.const -16843009
          i32.add
          i32.and
          i32.const -2139062144
          i32.and
          br_if 0 (;@2;)
          local.get 2
          i32.const 16843009
          i32.mul
          local.set 2
          loop ;; label = @3
            local.get 3
            local.get 2
            i32.xor
            local.tee 3
            i32.const -1
            i32.xor
            local.get 3
            i32.const -16843009
            i32.add
            i32.and
            i32.const -2139062144
            i32.and
            br_if 1 (;@2;)
            local.get 0
            i32.const 4
            i32.add
            local.tee 0
            i32.load
            local.tee 3
            i32.const -1
            i32.xor
            local.get 3
            i32.const -16843009
            i32.add
            i32.and
            i32.const -2139062144
            i32.and
            i32.eqz
            br_if 0 (;@3;)
          end
        end
        local.get 0
        i32.const -1
        i32.add
        local.set 3
        local.get 1
        i32.const 255
        i32.and
        local.set 1
        loop ;; label = @2
          local.get 3
          i32.const 1
          i32.add
          local.tee 3
          i32.load8_u
          local.tee 0
          i32.eqz
          br_if 1 (;@1;)
          local.get 0
          local.get 1
          i32.ne
          br_if 0 (;@2;)
        end
      end
      local.get 3
    )
    (func $__stpcpy (;161;) (type 4) (param i32 i32) (result i32)
      (local i32 i32)
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 1
            local.get 0
            i32.xor
            i32.const 3
            i32.and
            i32.eqz
            br_if 0 (;@3;)
            local.get 1
            i32.load8_u
            local.set 2
            br 1 (;@2;)
          end
          block ;; label = @3
            local.get 1
            i32.const 3
            i32.and
            i32.eqz
            br_if 0 (;@3;)
            local.get 0
            local.get 1
            i32.load8_u
            local.tee 2
            i32.store8
            block ;; label = @4
              local.get 2
              br_if 0 (;@4;)
              local.get 0
              return
            end
            local.get 0
            i32.const 1
            i32.add
            local.set 2
            block ;; label = @4
              local.get 1
              i32.const 1
              i32.add
              local.tee 3
              i32.const 3
              i32.and
              br_if 0 (;@4;)
              local.get 2
              local.set 0
              local.get 3
              local.set 1
              br 1 (;@3;)
            end
            local.get 2
            local.get 3
            i32.load8_u
            local.tee 3
            i32.store8
            local.get 3
            i32.eqz
            br_if 2 (;@1;)
            local.get 0
            i32.const 2
            i32.add
            local.set 2
            block ;; label = @4
              local.get 1
              i32.const 2
              i32.add
              local.tee 3
              i32.const 3
              i32.and
              br_if 0 (;@4;)
              local.get 2
              local.set 0
              local.get 3
              local.set 1
              br 1 (;@3;)
            end
            local.get 2
            local.get 3
            i32.load8_u
            local.tee 3
            i32.store8
            local.get 3
            i32.eqz
            br_if 2 (;@1;)
            local.get 0
            i32.const 3
            i32.add
            local.set 2
            block ;; label = @4
              local.get 1
              i32.const 3
              i32.add
              local.tee 3
              i32.const 3
              i32.and
              br_if 0 (;@4;)
              local.get 2
              local.set 0
              local.get 3
              local.set 1
              br 1 (;@3;)
            end
            local.get 2
            local.get 3
            i32.load8_u
            local.tee 3
            i32.store8
            local.get 3
            i32.eqz
            br_if 2 (;@1;)
            local.get 0
            i32.const 4
            i32.add
            local.set 0
            local.get 1
            i32.const 4
            i32.add
            local.set 1
          end
          local.get 1
          i32.load
          local.tee 2
          i32.const -1
          i32.xor
          local.get 2
          i32.const -16843009
          i32.add
          i32.and
          i32.const -2139062144
          i32.and
          br_if 0 (;@2;)
          loop ;; label = @3
            local.get 0
            local.get 2
            i32.store
            local.get 0
            i32.const 4
            i32.add
            local.set 0
            local.get 1
            i32.const 4
            i32.add
            local.tee 1
            i32.load
            local.tee 2
            i32.const -1
            i32.xor
            local.get 2
            i32.const -16843009
            i32.add
            i32.and
            i32.const -2139062144
            i32.and
            i32.eqz
            br_if 0 (;@3;)
          end
        end
        local.get 0
        local.get 2
        i32.store8
        block ;; label = @2
          local.get 2
          i32.const 255
          i32.and
          br_if 0 (;@2;)
          local.get 0
          return
        end
        local.get 1
        i32.const 1
        i32.add
        local.set 1
        local.get 0
        local.set 2
        loop ;; label = @2
          local.get 2
          local.get 1
          i32.load8_u
          local.tee 0
          i32.store8 offset=1
          local.get 1
          i32.const 1
          i32.add
          local.set 1
          local.get 2
          i32.const 1
          i32.add
          local.set 2
          local.get 0
          br_if 0 (;@2;)
        end
      end
      local.get 2
    )
    (func $strcpy (;162;) (type 4) (param i32 i32) (result i32)
      local.get 0
      local.get 1
      call $__stpcpy
      drop
      local.get 0
    )
    (func $strdup (;163;) (type 8) (param i32) (result i32)
      (local i32 i32)
      block ;; label = @1
        local.get 0
        call $strlen
        i32.const 1
        i32.add
        local.tee 1
        call $malloc
        local.tee 2
        i32.eqz
        br_if 0 (;@1;)
        local.get 2
        local.get 0
        local.get 1
        call $memcpy
        drop
      end
      local.get 2
    )
    (func $strlen (;164;) (type 8) (param i32) (result i32)
      (local i32 i32 i32)
      local.get 0
      local.set 1
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i32.const 3
          i32.and
          i32.eqz
          br_if 0 (;@2;)
          block ;; label = @3
            local.get 0
            i32.load8_u
            br_if 0 (;@3;)
            local.get 0
            local.get 0
            i32.sub
            return
          end
          local.get 0
          i32.const 1
          i32.add
          local.tee 1
          i32.const 3
          i32.and
          i32.eqz
          br_if 0 (;@2;)
          local.get 1
          i32.load8_u
          i32.eqz
          br_if 1 (;@1;)
          local.get 0
          i32.const 2
          i32.add
          local.tee 1
          i32.const 3
          i32.and
          i32.eqz
          br_if 0 (;@2;)
          local.get 1
          i32.load8_u
          i32.eqz
          br_if 1 (;@1;)
          local.get 0
          i32.const 3
          i32.add
          local.tee 1
          i32.const 3
          i32.and
          i32.eqz
          br_if 0 (;@2;)
          local.get 1
          i32.load8_u
          i32.eqz
          br_if 1 (;@1;)
          local.get 0
          i32.const 4
          i32.add
          local.tee 1
          i32.const 3
          i32.and
          br_if 1 (;@1;)
        end
        local.get 1
        i32.const -4
        i32.add
        local.set 2
        local.get 1
        i32.const -5
        i32.add
        local.set 1
        loop ;; label = @2
          local.get 1
          i32.const 4
          i32.add
          local.set 1
          local.get 2
          i32.const 4
          i32.add
          local.tee 2
          i32.load
          local.tee 3
          i32.const -1
          i32.xor
          local.get 3
          i32.const -16843009
          i32.add
          i32.and
          i32.const -2139062144
          i32.and
          i32.eqz
          br_if 0 (;@2;)
        end
        loop ;; label = @2
          local.get 1
          i32.const 1
          i32.add
          local.set 1
          local.get 2
          i32.load8_u
          local.set 3
          local.get 2
          i32.const 1
          i32.add
          local.set 2
          local.get 3
          br_if 0 (;@2;)
        end
      end
      local.get 1
      local.get 0
      i32.sub
    )
    (func $strncmp (;165;) (type 2) (param i32 i32 i32) (result i32)
      (local i32 i32)
      block ;; label = @1
        local.get 2
        br_if 0 (;@1;)
        i32.const 0
        return
      end
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i32.load8_u
          local.tee 3
          br_if 0 (;@2;)
          i32.const 0
          local.set 3
          br 1 (;@1;)
        end
        local.get 0
        i32.const 1
        i32.add
        local.set 0
        local.get 2
        i32.const -1
        i32.add
        local.set 2
        block ;; label = @2
          loop ;; label = @3
            local.get 3
            i32.const 255
            i32.and
            local.get 1
            i32.load8_u
            local.tee 4
            i32.ne
            br_if 1 (;@2;)
            local.get 4
            i32.eqz
            br_if 1 (;@2;)
            local.get 2
            i32.const 0
            i32.eq
            br_if 1 (;@2;)
            local.get 2
            i32.const -1
            i32.add
            local.set 2
            local.get 1
            i32.const 1
            i32.add
            local.set 1
            local.get 0
            i32.load8_u
            local.set 3
            local.get 0
            i32.const 1
            i32.add
            local.set 0
            local.get 3
            br_if 0 (;@3;)
          end
          i32.const 0
          local.set 3
        end
        local.get 3
        i32.const 255
        i32.and
        local.set 3
      end
      local.get 3
      local.get 1
      i32.load8_u
      i32.sub
    )
    (func $_ZN69_$LT$core..alloc..layout..LayoutError$u20$as$u20$core..fmt..Debug$GT$3fmt17hf4b985c6e40b5d18E (;166;) (type 4) (param i32 i32) (result i32)
      local.get 1
      i32.const 1051594
      i32.const 11
      call $_ZN4core3fmt9Formatter9write_str17h4979a51232c3e6b6E
    )
    (func $_ZN5alloc7raw_vec17capacity_overflow17h702801fa6aae0fd2E (;167;) (type 7)
      (local i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 0
      global.set $__stack_pointer
      local.get 0
      i32.const 0
      i32.store offset=24
      local.get 0
      i32.const 1
      i32.store offset=12
      local.get 0
      i32.const 1051624
      i32.store offset=8
      local.get 0
      i64.const 4
      i64.store offset=16 align=4
      local.get 0
      i32.const 8
      i32.add
      i32.const 1051660
      call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
      unreachable
    )
    (func $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E (;168;) (type 1) (param i32 i32)
      block ;; label = @1
        local.get 0
        br_if 0 (;@1;)
        call $_ZN5alloc7raw_vec17capacity_overflow17h702801fa6aae0fd2E
        unreachable
      end
      local.get 0
      local.get 1
      call $_ZN5alloc5alloc18handle_alloc_error17h7bdcb31f02c1333fE
      unreachable
    )
    (func $_ZN5alloc7raw_vec11finish_grow17h5930174404efe11aE (;169;) (type 10) (param i32 i32 i32 i32)
      (local i32 i32 i32)
      i32.const 1
      local.set 4
      i32.const 0
      local.set 5
      i32.const 4
      local.set 6
      block ;; label = @1
        local.get 1
        i32.eqz
        br_if 0 (;@1;)
        local.get 2
        i32.const 0
        i32.lt_s
        br_if 0 (;@1;)
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 3
                  i32.load offset=4
                  i32.eqz
                  br_if 0 (;@6;)
                  block ;; label = @7
                    local.get 3
                    i32.load offset=8
                    local.tee 4
                    br_if 0 (;@7;)
                    block ;; label = @8
                      local.get 2
                      br_if 0 (;@8;)
                      i32.const 1
                      local.set 4
                      br 4 (;@4;)
                    end
                    i32.const 0
                    i32.load8_u offset=1052649
                    drop
                    local.get 2
                    i32.const 1
                    call $__rust_alloc
                    local.set 4
                    br 2 (;@5;)
                  end
                  local.get 3
                  i32.load
                  local.get 4
                  i32.const 1
                  local.get 2
                  call $__rust_realloc
                  local.set 4
                  br 1 (;@5;)
                end
                block ;; label = @6
                  local.get 2
                  br_if 0 (;@6;)
                  i32.const 1
                  local.set 4
                  br 2 (;@4;)
                end
                i32.const 0
                i32.load8_u offset=1052649
                drop
                local.get 2
                i32.const 1
                call $__rust_alloc
                local.set 4
              end
              local.get 4
              i32.eqz
              br_if 1 (;@3;)
            end
            local.get 0
            local.get 4
            i32.store offset=4
            i32.const 0
            local.set 4
            br 1 (;@2;)
          end
          i32.const 1
          local.set 4
          local.get 0
          i32.const 1
          i32.store offset=4
        end
        i32.const 8
        local.set 6
        local.get 2
        local.set 5
      end
      local.get 0
      local.get 6
      i32.add
      local.get 5
      i32.store
      local.get 0
      local.get 4
      i32.store
    )
    (func $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$8grow_one17ha8cc09e11efbc6bdE (;170;) (type 0) (param i32)
      (local i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      block ;; label = @1
        local.get 0
        i32.load
        local.tee 2
        i32.const 1
        i32.add
        local.tee 3
        br_if 0 (;@1;)
        i32.const 0
        i32.const 0
        call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
        unreachable
      end
      local.get 2
      i32.const 1
      i32.shl
      local.tee 4
      local.get 3
      local.get 4
      local.get 3
      i32.gt_u
      select
      local.tee 3
      i32.const 8
      local.get 3
      i32.const 8
      i32.gt_u
      select
      local.tee 3
      i32.const -1
      i32.xor
      i32.const 31
      i32.shr_u
      local.set 4
      block ;; label = @1
        block ;; label = @2
          local.get 2
          br_if 0 (;@2;)
          i32.const 0
          local.set 2
          br 1 (;@1;)
        end
        local.get 1
        local.get 2
        i32.store offset=28
        local.get 1
        local.get 0
        i32.load offset=4
        i32.store offset=20
        i32.const 1
        local.set 2
      end
      local.get 1
      local.get 2
      i32.store offset=24
      local.get 1
      i32.const 8
      i32.add
      local.get 4
      local.get 3
      local.get 1
      i32.const 20
      i32.add
      call $_ZN5alloc7raw_vec11finish_grow17h5930174404efe11aE
      block ;; label = @1
        local.get 1
        i32.load offset=8
        i32.eqz
        br_if 0 (;@1;)
        local.get 1
        i32.load offset=12
        local.get 1
        i32.load offset=16
        call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
        unreachable
      end
      local.get 1
      i32.load offset=12
      local.set 2
      local.get 0
      local.get 3
      i32.store
      local.get 0
      local.get 2
      i32.store offset=4
      local.get 1
      i32.const 32
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN5alloc5alloc18handle_alloc_error17h7bdcb31f02c1333fE (;171;) (type 1) (param i32 i32)
      local.get 1
      local.get 0
      call $__rust_alloc_error_handler
      unreachable
    )
    (func $_ZN72_$LT$$RF$str$u20$as$u20$alloc..ffi..c_str..CString..new..SpecNewImpl$GT$13spec_new_impl17h4aa85f42dd29275cE (;172;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 2
              i32.const 1
              i32.add
              local.tee 4
              i32.eqz
              br_if 0 (;@4;)
              i32.const 0
              local.set 5
              local.get 4
              i32.const 0
              i32.lt_s
              br_if 1 (;@3;)
              i32.const 0
              i32.load8_u offset=1052649
              drop
              i32.const 1
              local.set 5
              local.get 4
              i32.const 1
              call $__rust_alloc
              local.tee 6
              i32.eqz
              br_if 1 (;@3;)
              local.get 6
              local.get 1
              local.get 2
              call $memcpy
              local.set 6
              block ;; label = @5
                local.get 2
                i32.const 8
                i32.lt_u
                br_if 0 (;@5;)
                local.get 3
                i32.const 8
                i32.add
                i32.const 0
                local.get 1
                local.get 2
                call $_ZN4core5slice6memchr14memchr_aligned17h29ad13d9d0ad2e7eE
                local.get 3
                i32.load offset=12
                local.set 7
                local.get 3
                i32.load offset=8
                local.set 5
                br 4 (;@1;)
              end
              block ;; label = @5
                local.get 2
                br_if 0 (;@5;)
                i32.const 0
                local.set 7
                i32.const 0
                local.set 5
                br 4 (;@1;)
              end
              block ;; label = @5
                local.get 1
                i32.load8_u
                br_if 0 (;@5;)
                i32.const 1
                local.set 5
                i32.const 0
                local.set 7
                br 4 (;@1;)
              end
              i32.const 1
              local.set 5
              local.get 2
              i32.const 1
              i32.eq
              br_if 2 (;@2;)
              block ;; label = @5
                local.get 1
                i32.load8_u offset=1
                br_if 0 (;@5;)
                i32.const 1
                local.set 7
                br 4 (;@1;)
              end
              i32.const 2
              local.set 7
              local.get 2
              i32.const 2
              i32.eq
              br_if 2 (;@2;)
              local.get 1
              i32.load8_u offset=2
              i32.eqz
              br_if 3 (;@1;)
              i32.const 3
              local.set 7
              local.get 2
              i32.const 3
              i32.eq
              br_if 2 (;@2;)
              local.get 1
              i32.load8_u offset=3
              i32.eqz
              br_if 3 (;@1;)
              i32.const 4
              local.set 7
              local.get 2
              i32.const 4
              i32.eq
              br_if 2 (;@2;)
              local.get 1
              i32.load8_u offset=4
              i32.eqz
              br_if 3 (;@1;)
              i32.const 5
              local.set 7
              local.get 2
              i32.const 5
              i32.eq
              br_if 2 (;@2;)
              local.get 1
              i32.load8_u offset=5
              i32.eqz
              br_if 3 (;@1;)
              local.get 2
              local.set 7
              i32.const 0
              local.set 5
              local.get 2
              i32.const 6
              i32.eq
              br_if 3 (;@1;)
              local.get 2
              i32.const 6
              local.get 1
              i32.load8_u offset=6
              local.tee 1
              select
              local.set 7
              local.get 1
              i32.eqz
              local.set 5
              br 3 (;@1;)
            end
            i32.const 1051708
            call $_ZN4core6option13unwrap_failed17he734bfec322d9781E
            unreachable
          end
          local.get 5
          local.get 4
          call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
          unreachable
        end
        local.get 2
        local.set 7
        i32.const 0
        local.set 5
      end
      block ;; label = @1
        block ;; label = @2
          local.get 5
          br_if 0 (;@2;)
          local.get 3
          local.get 2
          i32.store offset=28
          local.get 3
          local.get 6
          i32.store offset=24
          local.get 3
          local.get 4
          i32.store offset=20
          local.get 3
          local.get 3
          i32.const 20
          i32.add
          call $_ZN5alloc3ffi5c_str7CString19_from_vec_unchecked17h3b1aa75b5cb90b83E
          local.get 0
          local.get 3
          i64.load
          i64.store offset=4 align=4
          local.get 0
          i32.const -2147483648
          i32.store
          br 1 (;@1;)
        end
        local.get 0
        local.get 2
        i32.store offset=8
        local.get 0
        local.get 6
        i32.store offset=4
        local.get 0
        local.get 4
        i32.store
        local.get 0
        local.get 7
        i32.store offset=12
      end
      local.get 3
      i32.const 32
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN5alloc3ffi5c_str7CString19_from_vec_unchecked17h3b1aa75b5cb90b83E (;173;) (type 1) (param i32 i32)
      (local i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      block ;; label = @1
        local.get 1
        i32.load
        local.tee 3
        local.get 1
        i32.load offset=8
        local.tee 4
        i32.ne
        br_if 0 (;@1;)
        block ;; label = @2
          local.get 4
          i32.const 1
          i32.add
          local.tee 3
          br_if 0 (;@2;)
          i32.const 0
          i32.const 0
          call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
          unreachable
        end
        local.get 3
        i32.const -1
        i32.xor
        i32.const 31
        i32.shr_u
        local.set 5
        block ;; label = @2
          block ;; label = @3
            local.get 4
            br_if 0 (;@3;)
            i32.const 0
            local.set 6
            br 1 (;@2;)
          end
          local.get 2
          local.get 4
          i32.store offset=28
          local.get 2
          local.get 1
          i32.load offset=4
          i32.store offset=20
          i32.const 1
          local.set 6
        end
        local.get 2
        local.get 6
        i32.store offset=24
        local.get 2
        i32.const 8
        i32.add
        local.get 5
        local.get 3
        local.get 2
        i32.const 20
        i32.add
        call $_ZN5alloc7raw_vec11finish_grow17h5930174404efe11aE
        block ;; label = @2
          local.get 2
          i32.load offset=8
          i32.eqz
          br_if 0 (;@2;)
          local.get 2
          i32.load offset=12
          local.get 2
          i32.load offset=16
          call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
          unreachable
        end
        local.get 2
        i32.load offset=12
        local.set 5
        local.get 1
        local.get 3
        i32.store
        local.get 1
        local.get 5
        i32.store offset=4
      end
      block ;; label = @1
        local.get 4
        local.get 3
        i32.ne
        br_if 0 (;@1;)
        local.get 1
        call $_ZN5alloc7raw_vec19RawVec$LT$T$C$A$GT$8grow_one17ha8cc09e11efbc6bdE
        local.get 1
        i32.load
        local.set 3
      end
      local.get 1
      local.get 4
      i32.const 1
      i32.add
      local.tee 5
      i32.store offset=8
      local.get 1
      i32.load offset=4
      local.tee 1
      local.get 4
      i32.add
      i32.const 0
      i32.store8
      block ;; label = @1
        block ;; label = @2
          local.get 3
          local.get 5
          i32.gt_u
          br_if 0 (;@2;)
          local.get 1
          local.set 4
          br 1 (;@1;)
        end
        block ;; label = @2
          local.get 5
          br_if 0 (;@2;)
          i32.const 1
          local.set 4
          local.get 1
          local.get 3
          i32.const 1
          call $__rust_dealloc
          br 1 (;@1;)
        end
        local.get 1
        local.get 3
        i32.const 1
        local.get 5
        call $__rust_realloc
        local.tee 4
        br_if 0 (;@1;)
        i32.const 1
        local.get 5
        call $_ZN5alloc7raw_vec12handle_error17h846c2adcc7598fc1E
        unreachable
      end
      local.get 0
      local.get 5
      i32.store offset=4
      local.get 0
      local.get 4
      i32.store
      local.get 2
      i32.const 32
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN5alloc4sync32arcinner_layout_for_value_layout17hc7be1e8b76b95d6bE (;174;) (type 3) (param i32 i32 i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      block ;; label = @1
        local.get 1
        i32.const 7
        i32.add
        i32.const 0
        local.get 1
        i32.sub
        i32.and
        local.tee 4
        local.get 4
        i32.const -8
        i32.add
        i32.lt_u
        br_if 0 (;@1;)
        local.get 4
        local.get 2
        i32.add
        local.tee 2
        local.get 4
        i32.lt_u
        br_if 0 (;@1;)
        local.get 2
        i32.const -2147483648
        local.get 1
        i32.const 4
        local.get 1
        i32.const 4
        i32.gt_u
        select
        local.tee 1
        i32.sub
        i32.gt_u
        br_if 0 (;@1;)
        local.get 0
        local.get 1
        i32.store
        local.get 0
        local.get 1
        local.get 2
        i32.add
        i32.const -1
        i32.add
        i32.const 0
        local.get 1
        i32.sub
        i32.and
        i32.store offset=4
        local.get 3
        i32.const 16
        i32.add
        global.set $__stack_pointer
        return
      end
      i32.const 1051724
      i32.const 43
      local.get 3
      i32.const 15
      i32.add
      i32.const 1051768
      i32.const 1051812
      call $_ZN4core6result13unwrap_failed17h9170afd31b6d6d39E
      unreachable
    )
    (func $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E (;175;) (type 1) (param i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 2
      i32.const 1
      i32.store16 offset=28
      local.get 2
      local.get 1
      i32.store offset=24
      local.get 2
      local.get 0
      i32.store offset=20
      local.get 2
      i32.const 1051992
      i32.store offset=16
      local.get 2
      i32.const 1
      i32.store offset=12
      local.get 2
      i32.const 12
      i32.add
      call $rust_begin_unwind
      unreachable
    )
    (func $_ZN4core5slice5index26slice_start_index_len_fail17h5249b664c892b135E (;176;) (type 3) (param i32 i32 i32)
      (local i32 i64)
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 3
      local.get 0
      i32.store
      local.get 3
      local.get 1
      i32.store offset=4
      local.get 3
      i32.const 2
      i32.store offset=12
      local.get 3
      i32.const 1052616
      i32.store offset=8
      local.get 3
      i64.const 2
      i64.store offset=20 align=4
      local.get 3
      i32.const 5
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.tee 4
      local.get 3
      i32.const 4
      i32.add
      i64.extend_i32_u
      i64.or
      i64.store offset=40
      local.get 3
      local.get 4
      local.get 3
      i64.extend_i32_u
      i64.or
      i64.store offset=32
      local.get 3
      local.get 3
      i32.const 32
      i32.add
      i32.store offset=16
      local.get 3
      i32.const 8
      i32.add
      local.get 2
      call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
      unreachable
    )
    (func $_ZN4core3fmt9Formatter3pad17h76f0fc0e2167db42E (;177;) (type 2) (param i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32)
      block ;; label = @1
        local.get 0
        i32.load
        local.tee 3
        local.get 0
        i32.load offset=8
        local.tee 4
        i32.or
        i32.eqz
        br_if 0 (;@1;)
        block ;; label = @2
          local.get 4
          i32.eqz
          br_if 0 (;@2;)
          local.get 1
          local.get 2
          i32.add
          local.set 5
          block ;; label = @3
            block ;; label = @4
              local.get 0
              i32.load offset=12
              local.tee 6
              br_if 0 (;@4;)
              i32.const 0
              local.set 7
              local.get 1
              local.set 8
              br 1 (;@3;)
            end
            i32.const 0
            local.set 7
            local.get 1
            local.set 8
            loop ;; label = @4
              local.get 8
              local.tee 4
              local.get 5
              i32.eq
              br_if 2 (;@2;)
              block ;; label = @5
                block ;; label = @6
                  local.get 4
                  i32.load8_s
                  local.tee 8
                  i32.const -1
                  i32.le_s
                  br_if 0 (;@6;)
                  local.get 4
                  i32.const 1
                  i32.add
                  local.set 8
                  br 1 (;@5;)
                end
                block ;; label = @6
                  local.get 8
                  i32.const -32
                  i32.ge_u
                  br_if 0 (;@6;)
                  local.get 4
                  i32.const 2
                  i32.add
                  local.set 8
                  br 1 (;@5;)
                end
                block ;; label = @6
                  local.get 8
                  i32.const -16
                  i32.ge_u
                  br_if 0 (;@6;)
                  local.get 4
                  i32.const 3
                  i32.add
                  local.set 8
                  br 1 (;@5;)
                end
                local.get 4
                i32.load8_u offset=2
                i32.const 63
                i32.and
                i32.const 6
                i32.shl
                local.get 4
                i32.load8_u offset=1
                i32.const 63
                i32.and
                i32.const 12
                i32.shl
                i32.or
                local.get 4
                i32.load8_u offset=3
                i32.const 63
                i32.and
                i32.or
                local.get 8
                i32.const 255
                i32.and
                i32.const 18
                i32.shl
                i32.const 1835008
                i32.and
                i32.or
                i32.const 1114112
                i32.eq
                br_if 3 (;@2;)
                local.get 4
                i32.const 4
                i32.add
                local.set 8
              end
              local.get 7
              local.get 4
              i32.sub
              local.get 8
              i32.add
              local.set 7
              local.get 6
              i32.const -1
              i32.add
              local.tee 6
              br_if 0 (;@4;)
            end
          end
          local.get 8
          local.get 5
          i32.eq
          br_if 0 (;@2;)
          block ;; label = @3
            local.get 8
            i32.load8_s
            local.tee 4
            i32.const -1
            i32.gt_s
            br_if 0 (;@3;)
            local.get 4
            i32.const -32
            i32.lt_u
            br_if 0 (;@3;)
            local.get 4
            i32.const -16
            i32.lt_u
            br_if 0 (;@3;)
            local.get 8
            i32.load8_u offset=2
            i32.const 63
            i32.and
            i32.const 6
            i32.shl
            local.get 8
            i32.load8_u offset=1
            i32.const 63
            i32.and
            i32.const 12
            i32.shl
            i32.or
            local.get 8
            i32.load8_u offset=3
            i32.const 63
            i32.and
            i32.or
            local.get 4
            i32.const 255
            i32.and
            i32.const 18
            i32.shl
            i32.const 1835008
            i32.and
            i32.or
            i32.const 1114112
            i32.eq
            br_if 1 (;@2;)
          end
          block ;; label = @3
            block ;; label = @4
              local.get 7
              i32.eqz
              br_if 0 (;@4;)
              block ;; label = @5
                local.get 7
                local.get 2
                i32.lt_u
                br_if 0 (;@5;)
                i32.const 0
                local.set 4
                local.get 7
                local.get 2
                i32.eq
                br_if 1 (;@4;)
                br 2 (;@3;)
              end
              i32.const 0
              local.set 4
              local.get 1
              local.get 7
              i32.add
              i32.load8_s
              i32.const -64
              i32.lt_s
              br_if 1 (;@3;)
            end
            local.get 1
            local.set 4
          end
          local.get 7
          local.get 2
          local.get 4
          select
          local.set 2
          local.get 4
          local.get 1
          local.get 4
          select
          local.set 1
        end
        block ;; label = @2
          local.get 3
          br_if 0 (;@2;)
          local.get 0
          i32.load offset=20
          local.get 1
          local.get 2
          local.get 0
          i32.load offset=24
          i32.load offset=12
          call_indirect (type 2)
          return
        end
        local.get 0
        i32.load offset=4
        local.set 3
        block ;; label = @2
          block ;; label = @3
            local.get 2
            i32.const 16
            i32.lt_u
            br_if 0 (;@3;)
            local.get 1
            local.get 2
            call $_ZN4core3str5count14do_count_chars17h0d2663faf1e1a3afE
            local.set 4
            br 1 (;@2;)
          end
          block ;; label = @3
            local.get 2
            br_if 0 (;@3;)
            i32.const 0
            local.set 4
            br 1 (;@2;)
          end
          local.get 2
          i32.const 3
          i32.and
          local.set 6
          block ;; label = @3
            block ;; label = @4
              local.get 2
              i32.const 4
              i32.ge_u
              br_if 0 (;@4;)
              i32.const 0
              local.set 4
              i32.const 0
              local.set 7
              br 1 (;@3;)
            end
            local.get 2
            i32.const 12
            i32.and
            local.set 5
            i32.const 0
            local.set 4
            i32.const 0
            local.set 7
            loop ;; label = @4
              local.get 4
              local.get 1
              local.get 7
              i32.add
              local.tee 8
              i32.load8_s
              i32.const -65
              i32.gt_s
              i32.add
              local.get 8
              i32.const 1
              i32.add
              i32.load8_s
              i32.const -65
              i32.gt_s
              i32.add
              local.get 8
              i32.const 2
              i32.add
              i32.load8_s
              i32.const -65
              i32.gt_s
              i32.add
              local.get 8
              i32.const 3
              i32.add
              i32.load8_s
              i32.const -65
              i32.gt_s
              i32.add
              local.set 4
              local.get 5
              local.get 7
              i32.const 4
              i32.add
              local.tee 7
              i32.ne
              br_if 0 (;@4;)
            end
          end
          local.get 6
          i32.eqz
          br_if 0 (;@2;)
          local.get 1
          local.get 7
          i32.add
          local.set 8
          loop ;; label = @3
            local.get 4
            local.get 8
            i32.load8_s
            i32.const -65
            i32.gt_s
            i32.add
            local.set 4
            local.get 8
            i32.const 1
            i32.add
            local.set 8
            local.get 6
            i32.const -1
            i32.add
            local.tee 6
            br_if 0 (;@3;)
          end
        end
        block ;; label = @2
          block ;; label = @3
            local.get 3
            local.get 4
            i32.le_u
            br_if 0 (;@3;)
            local.get 3
            local.get 4
            i32.sub
            local.set 5
            i32.const 0
            local.set 4
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  local.get 0
                  i32.load8_u offset=32
                  br_table 2 (;@4;) 0 (;@6;) 1 (;@5;) 2 (;@4;) 2 (;@4;)
                end
                local.get 5
                local.set 4
                i32.const 0
                local.set 5
                br 1 (;@4;)
              end
              local.get 5
              i32.const 1
              i32.shr_u
              local.set 4
              local.get 5
              i32.const 1
              i32.add
              i32.const 1
              i32.shr_u
              local.set 5
            end
            local.get 4
            i32.const 1
            i32.add
            local.set 4
            local.get 0
            i32.load offset=16
            local.set 6
            local.get 0
            i32.load offset=24
            local.set 8
            local.get 0
            i32.load offset=20
            local.set 7
            loop ;; label = @4
              local.get 4
              i32.const -1
              i32.add
              local.tee 4
              i32.eqz
              br_if 2 (;@2;)
              local.get 7
              local.get 6
              local.get 8
              i32.load offset=16
              call_indirect (type 4)
              i32.eqz
              br_if 0 (;@4;)
            end
            i32.const 1
            return
          end
          local.get 0
          i32.load offset=20
          local.get 1
          local.get 2
          local.get 0
          i32.load offset=24
          i32.load offset=12
          call_indirect (type 2)
          return
        end
        i32.const 1
        local.set 4
        block ;; label = @2
          local.get 7
          local.get 1
          local.get 2
          local.get 8
          i32.load offset=12
          call_indirect (type 2)
          br_if 0 (;@2;)
          i32.const 0
          local.set 4
          block ;; label = @3
            loop ;; label = @4
              block ;; label = @5
                local.get 5
                local.get 4
                i32.ne
                br_if 0 (;@5;)
                local.get 5
                local.set 4
                br 2 (;@3;)
              end
              local.get 4
              i32.const 1
              i32.add
              local.set 4
              local.get 7
              local.get 6
              local.get 8
              i32.load offset=16
              call_indirect (type 4)
              i32.eqz
              br_if 0 (;@4;)
            end
            local.get 4
            i32.const -1
            i32.add
            local.set 4
          end
          local.get 4
          local.get 5
          i32.lt_u
          local.set 4
        end
        local.get 4
        return
      end
      local.get 0
      i32.load offset=20
      local.get 1
      local.get 2
      local.get 0
      i32.load offset=24
      i32.load offset=12
      call_indirect (type 2)
    )
    (func $_ZN4core9panicking5panic17h9f2e0421338a58efE (;178;) (type 3) (param i32 i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 3
      i32.const 0
      i32.store offset=16
      local.get 3
      i32.const 1
      i32.store offset=4
      local.get 3
      i64.const 4
      i64.store offset=8 align=4
      local.get 3
      local.get 1
      i32.store offset=28
      local.get 3
      local.get 0
      i32.store offset=24
      local.get 3
      local.get 3
      i32.const 24
      i32.add
      i32.store
      local.get 3
      local.get 2
      call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
      unreachable
    )
    (func $_ZN4core3fmt3num3imp52_$LT$impl$u20$core..fmt..Display$u20$for$u20$u32$GT$3fmt17h3b56eb797759e149E (;179;) (type 4) (param i32 i32) (result i32)
      local.get 0
      i64.load32_u
      i32.const 1
      local.get 1
      call $_ZN4core3fmt3num3imp7fmt_u6417h5caca5c982653f4cE
    )
    (func $_ZN4core3fmt5write17h86ae7d4da82da0b2E (;180;) (type 2) (param i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 3
      i32.const 3
      i32.store8 offset=44
      local.get 3
      i32.const 32
      i32.store offset=28
      i32.const 0
      local.set 4
      local.get 3
      i32.const 0
      i32.store offset=40
      local.get 3
      local.get 1
      i32.store offset=36
      local.get 3
      local.get 0
      i32.store offset=32
      local.get 3
      i32.const 0
      i32.store offset=20
      local.get 3
      i32.const 0
      i32.store offset=12
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                local.get 2
                i32.load offset=16
                local.tee 5
                br_if 0 (;@5;)
                local.get 2
                i32.load offset=12
                local.tee 0
                i32.eqz
                br_if 1 (;@4;)
                local.get 2
                i32.load offset=8
                local.set 1
                local.get 0
                i32.const 3
                i32.shl
                local.set 6
                local.get 0
                i32.const -1
                i32.add
                i32.const 536870911
                i32.and
                i32.const 1
                i32.add
                local.set 4
                local.get 2
                i32.load
                local.set 0
                loop ;; label = @6
                  block ;; label = @7
                    local.get 0
                    i32.const 4
                    i32.add
                    i32.load
                    local.tee 7
                    i32.eqz
                    br_if 0 (;@7;)
                    local.get 3
                    i32.load offset=32
                    local.get 0
                    i32.load
                    local.get 7
                    local.get 3
                    i32.load offset=36
                    i32.load offset=12
                    call_indirect (type 2)
                    br_if 4 (;@3;)
                  end
                  local.get 1
                  i32.load
                  local.get 3
                  i32.const 12
                  i32.add
                  local.get 1
                  i32.load offset=4
                  call_indirect (type 4)
                  br_if 3 (;@3;)
                  local.get 1
                  i32.const 8
                  i32.add
                  local.set 1
                  local.get 0
                  i32.const 8
                  i32.add
                  local.set 0
                  local.get 6
                  i32.const -8
                  i32.add
                  local.tee 6
                  br_if 0 (;@6;)
                  br 2 (;@4;)
                end
              end
              local.get 2
              i32.load offset=20
              local.tee 1
              i32.eqz
              br_if 0 (;@4;)
              local.get 1
              i32.const 5
              i32.shl
              local.set 8
              local.get 1
              i32.const -1
              i32.add
              i32.const 134217727
              i32.and
              i32.const 1
              i32.add
              local.set 4
              local.get 2
              i32.load offset=8
              local.set 9
              local.get 2
              i32.load
              local.set 0
              i32.const 0
              local.set 6
              loop ;; label = @5
                block ;; label = @6
                  local.get 0
                  i32.const 4
                  i32.add
                  i32.load
                  local.tee 1
                  i32.eqz
                  br_if 0 (;@6;)
                  local.get 3
                  i32.load offset=32
                  local.get 0
                  i32.load
                  local.get 1
                  local.get 3
                  i32.load offset=36
                  i32.load offset=12
                  call_indirect (type 2)
                  br_if 3 (;@3;)
                end
                local.get 3
                local.get 5
                local.get 6
                i32.add
                local.tee 1
                i32.const 16
                i32.add
                i32.load
                i32.store offset=28
                local.get 3
                local.get 1
                i32.const 28
                i32.add
                i32.load8_u
                i32.store8 offset=44
                local.get 3
                local.get 1
                i32.const 24
                i32.add
                i32.load
                i32.store offset=40
                local.get 1
                i32.const 12
                i32.add
                i32.load
                local.set 7
                i32.const 0
                local.set 10
                i32.const 0
                local.set 11
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      local.get 1
                      i32.const 8
                      i32.add
                      i32.load
                      br_table 1 (;@7;) 0 (;@8;) 2 (;@6;) 1 (;@7;)
                    end
                    local.get 7
                    i32.const 3
                    i32.shl
                    local.set 12
                    i32.const 0
                    local.set 11
                    local.get 9
                    local.get 12
                    i32.add
                    local.tee 12
                    i32.load offset=4
                    br_if 1 (;@6;)
                    local.get 12
                    i32.load
                    local.set 7
                  end
                  i32.const 1
                  local.set 11
                end
                local.get 3
                local.get 7
                i32.store offset=16
                local.get 3
                local.get 11
                i32.store offset=12
                local.get 1
                i32.const 4
                i32.add
                i32.load
                local.set 7
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      local.get 1
                      i32.load
                      br_table 1 (;@7;) 0 (;@8;) 2 (;@6;) 1 (;@7;)
                    end
                    local.get 7
                    i32.const 3
                    i32.shl
                    local.set 11
                    local.get 9
                    local.get 11
                    i32.add
                    local.tee 11
                    i32.load offset=4
                    br_if 1 (;@6;)
                    local.get 11
                    i32.load
                    local.set 7
                  end
                  i32.const 1
                  local.set 10
                end
                local.get 3
                local.get 7
                i32.store offset=24
                local.get 3
                local.get 10
                i32.store offset=20
                local.get 9
                local.get 1
                i32.const 20
                i32.add
                i32.load
                i32.const 3
                i32.shl
                i32.add
                local.tee 1
                i32.load
                local.get 3
                i32.const 12
                i32.add
                local.get 1
                i32.load offset=4
                call_indirect (type 4)
                br_if 2 (;@3;)
                local.get 0
                i32.const 8
                i32.add
                local.set 0
                local.get 8
                local.get 6
                i32.const 32
                i32.add
                local.tee 6
                i32.ne
                br_if 0 (;@5;)
              end
            end
            local.get 4
            local.get 2
            i32.load offset=4
            i32.ge_u
            br_if 1 (;@2;)
            local.get 3
            i32.load offset=32
            local.get 2
            i32.load
            local.get 4
            i32.const 3
            i32.shl
            i32.add
            local.tee 1
            i32.load
            local.get 1
            i32.load offset=4
            local.get 3
            i32.load offset=36
            i32.load offset=12
            call_indirect (type 2)
            i32.eqz
            br_if 1 (;@2;)
          end
          i32.const 1
          local.set 1
          br 1 (;@1;)
        end
        i32.const 0
        local.set 1
      end
      local.get 3
      i32.const 48
      i32.add
      global.set $__stack_pointer
      local.get 1
    )
    (func $_ZN36_$LT$T$u20$as$u20$core..any..Any$GT$7type_id17h52e4290999298771E (;181;) (type 1) (param i32 i32)
      local.get 0
      i64.const 2789784050715676570
      i64.store offset=8
      local.get 0
      i64.const 8345271900260102035
      i64.store
    )
    (func $_ZN4core3ffi5c_str4CStr19from_bytes_with_nul17h4d0a9cda8d5df576E (;182;) (type 3) (param i32 i32 i32)
      (local i32 i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                local.get 2
                i32.const 8
                i32.lt_u
                br_if 0 (;@5;)
                block ;; label = @6
                  block ;; label = @7
                    local.get 1
                    i32.const 3
                    i32.add
                    i32.const -4
                    i32.and
                    local.get 1
                    i32.sub
                    local.tee 3
                    i32.eqz
                    br_if 0 (;@7;)
                    i32.const 0
                    local.set 4
                    loop ;; label = @8
                      local.get 1
                      local.get 4
                      i32.add
                      i32.load8_u
                      i32.eqz
                      br_if 5 (;@3;)
                      local.get 3
                      local.get 4
                      i32.const 1
                      i32.add
                      local.tee 4
                      i32.ne
                      br_if 0 (;@8;)
                    end
                    local.get 3
                    local.get 2
                    i32.const -8
                    i32.add
                    local.tee 5
                    i32.le_u
                    br_if 1 (;@6;)
                    br 3 (;@4;)
                  end
                  local.get 2
                  i32.const -8
                  i32.add
                  local.set 5
                end
                loop ;; label = @6
                  local.get 1
                  local.get 3
                  i32.add
                  local.tee 4
                  i32.const 4
                  i32.add
                  i32.load
                  local.tee 6
                  i32.const -16843009
                  i32.add
                  local.get 6
                  i32.const -1
                  i32.xor
                  i32.and
                  local.get 4
                  i32.load
                  local.tee 4
                  i32.const -16843009
                  i32.add
                  local.get 4
                  i32.const -1
                  i32.xor
                  i32.and
                  i32.or
                  i32.const -2139062144
                  i32.and
                  br_if 2 (;@4;)
                  local.get 3
                  i32.const 8
                  i32.add
                  local.tee 3
                  local.get 5
                  i32.le_u
                  br_if 0 (;@6;)
                  br 2 (;@4;)
                end
              end
              local.get 2
              i32.eqz
              br_if 2 (;@2;)
              block ;; label = @5
                local.get 1
                i32.load8_u
                br_if 0 (;@5;)
                i32.const 0
                local.set 4
                br 2 (;@3;)
              end
              i32.const 1
              local.set 4
              local.get 2
              i32.const 1
              i32.eq
              br_if 2 (;@2;)
              local.get 1
              i32.load8_u offset=1
              i32.eqz
              br_if 1 (;@3;)
              i32.const 2
              local.set 4
              local.get 2
              i32.const 2
              i32.eq
              br_if 2 (;@2;)
              local.get 1
              i32.load8_u offset=2
              i32.eqz
              br_if 1 (;@3;)
              i32.const 3
              local.set 4
              local.get 2
              i32.const 3
              i32.eq
              br_if 2 (;@2;)
              local.get 1
              i32.load8_u offset=3
              i32.eqz
              br_if 1 (;@3;)
              i32.const 4
              local.set 4
              local.get 2
              i32.const 4
              i32.eq
              br_if 2 (;@2;)
              local.get 1
              i32.load8_u offset=4
              i32.eqz
              br_if 1 (;@3;)
              i32.const 5
              local.set 4
              local.get 2
              i32.const 5
              i32.eq
              br_if 2 (;@2;)
              local.get 1
              i32.load8_u offset=5
              i32.eqz
              br_if 1 (;@3;)
              i32.const 6
              local.set 4
              local.get 2
              i32.const 6
              i32.eq
              br_if 2 (;@2;)
              local.get 1
              i32.load8_u offset=6
              i32.eqz
              br_if 1 (;@3;)
              br 2 (;@2;)
            end
            local.get 3
            local.get 2
            i32.eq
            br_if 1 (;@2;)
            loop ;; label = @4
              block ;; label = @5
                local.get 1
                local.get 3
                i32.add
                i32.load8_u
                br_if 0 (;@5;)
                local.get 3
                local.set 4
                br 2 (;@3;)
              end
              local.get 2
              local.get 3
              i32.const 1
              i32.add
              local.tee 3
              i32.ne
              br_if 0 (;@4;)
              br 2 (;@2;)
            end
          end
          local.get 4
          i32.const 1
          i32.add
          local.get 2
          i32.eq
          br_if 1 (;@1;)
          local.get 0
          local.get 4
          i32.store offset=8
          local.get 0
          i32.const 0
          i32.store offset=4
          local.get 0
          i32.const 1
          i32.store
          return
        end
        local.get 0
        i32.const 1
        i32.store offset=4
        local.get 0
        i32.const 1
        i32.store
        return
      end
      local.get 0
      local.get 2
      i32.store offset=8
      local.get 0
      local.get 1
      i32.store offset=4
      local.get 0
      i32.const 0
      i32.store
    )
    (func $_ZN4core6result13unwrap_failed17h9170afd31b6d6d39E (;183;) (type 11) (param i32 i32 i32 i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 64
      i32.sub
      local.tee 5
      global.set $__stack_pointer
      local.get 5
      local.get 1
      i32.store offset=12
      local.get 5
      local.get 0
      i32.store offset=8
      local.get 5
      local.get 3
      i32.store offset=20
      local.get 5
      local.get 2
      i32.store offset=16
      local.get 5
      i32.const 2
      i32.store offset=28
      local.get 5
      i32.const 1052292
      i32.store offset=24
      local.get 5
      i64.const 2
      i64.store offset=36 align=4
      local.get 5
      i32.const 32
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.get 5
      i32.const 16
      i32.add
      i64.extend_i32_u
      i64.or
      i64.store offset=56
      local.get 5
      i32.const 33
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.get 5
      i32.const 8
      i32.add
      i64.extend_i32_u
      i64.or
      i64.store offset=48
      local.get 5
      local.get 5
      i32.const 48
      i32.add
      i32.store offset=32
      local.get 5
      i32.const 24
      i32.add
      local.get 4
      call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
      unreachable
    )
    (func $_ZN4core6option13unwrap_failed17he734bfec322d9781E (;184;) (type 0) (param i32)
      i32.const 1051909
      i32.const 43
      local.get 0
      call $_ZN4core9panicking5panic17h9f2e0421338a58efE
      unreachable
    )
    (func $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17hfecc6d15f15fcc8cE (;185;) (type 4) (param i32 i32) (result i32)
      local.get 1
      local.get 0
      i32.load
      local.get 0
      i32.load offset=4
      call $_ZN4core3fmt9Formatter3pad17h76f0fc0e2167db42E
    )
    (func $_ZN70_$LT$core..panic..location..Location$u20$as$u20$core..fmt..Display$GT$3fmt17hc747e14b778be851E (;186;) (type 4) (param i32 i32) (result i32)
      (local i32 i64)
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 2
      i32.const 3
      i32.store offset=4
      local.get 2
      i32.const 1051952
      i32.store
      local.get 2
      i64.const 3
      i64.store offset=12 align=4
      local.get 2
      i32.const 5
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.tee 3
      local.get 0
      i32.const 12
      i32.add
      i64.extend_i32_u
      i64.or
      i64.store offset=40
      local.get 2
      local.get 3
      local.get 0
      i32.const 8
      i32.add
      i64.extend_i32_u
      i64.or
      i64.store offset=32
      local.get 2
      i32.const 33
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.get 0
      i64.extend_i32_u
      i64.or
      i64.store offset=24
      local.get 2
      local.get 2
      i32.const 24
      i32.add
      i32.store offset=8
      local.get 1
      i32.load offset=20
      local.get 1
      i32.load offset=24
      local.get 2
      call $_ZN4core3fmt5write17h86ae7d4da82da0b2E
      local.set 0
      local.get 2
      i32.const 48
      i32.add
      global.set $__stack_pointer
      local.get 0
    )
    (func $_ZN73_$LT$core..panic..panic_info..PanicInfo$u20$as$u20$core..fmt..Display$GT$3fmt17h0a6426656ab2e03bE (;187;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i64)
      global.get $__stack_pointer
      i32.const 64
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      i32.const 1
      local.set 3
      block ;; label = @1
        local.get 1
        i32.load offset=20
        local.tee 4
        i32.const 1051976
        i32.const 12
        local.get 1
        i32.load offset=24
        local.tee 5
        i32.load offset=12
        local.tee 6
        call_indirect (type 2)
        br_if 0 (;@1;)
        local.get 0
        i32.load offset=12
        local.set 1
        local.get 2
        i32.const 3
        i32.store offset=20
        local.get 2
        i32.const 1051952
        i32.store offset=16
        local.get 2
        i64.const 3
        i64.store offset=28 align=4
        local.get 2
        i32.const 33
        i64.extend_i32_u
        i64.const 32
        i64.shl
        local.get 1
        i64.extend_i32_u
        i64.or
        i64.store offset=40
        local.get 2
        i32.const 5
        i64.extend_i32_u
        i64.const 32
        i64.shl
        local.tee 7
        local.get 1
        i32.const 12
        i32.add
        i64.extend_i32_u
        i64.or
        i64.store offset=56
        local.get 2
        local.get 7
        local.get 1
        i32.const 8
        i32.add
        i64.extend_i32_u
        i64.or
        i64.store offset=48
        local.get 2
        local.get 2
        i32.const 40
        i32.add
        i32.store offset=24
        local.get 4
        local.get 5
        local.get 2
        i32.const 16
        i32.add
        call $_ZN4core3fmt5write17h86ae7d4da82da0b2E
        br_if 0 (;@1;)
        i32.const 1
        local.set 3
        local.get 4
        i32.const 1051908
        i32.const 1
        local.get 6
        call_indirect (type 2)
        br_if 0 (;@1;)
        block ;; label = @2
          block ;; label = @3
            local.get 0
            i32.load offset=8
            local.tee 1
            i32.eqz
            br_if 0 (;@3;)
            i32.const 1
            local.set 3
            local.get 4
            i32.const 1051988
            i32.const 1
            local.get 6
            call_indirect (type 2)
            br_if 2 (;@1;)
            local.get 2
            i32.const 40
            i32.add
            i32.const 16
            i32.add
            local.get 1
            i32.const 16
            i32.add
            i64.load align=4
            i64.store
            local.get 2
            i32.const 40
            i32.add
            i32.const 8
            i32.add
            local.get 1
            i32.const 8
            i32.add
            i64.load align=4
            i64.store
            local.get 2
            local.get 1
            i64.load align=4
            i64.store offset=40
            local.get 4
            local.get 5
            local.get 2
            i32.const 40
            i32.add
            call $_ZN4core3fmt5write17h86ae7d4da82da0b2E
            i32.eqz
            br_if 1 (;@2;)
            br 2 (;@1;)
          end
          local.get 2
          local.get 0
          i32.load
          local.tee 1
          local.get 0
          i32.load offset=4
          i32.const 12
          i32.add
          i32.load
          call_indirect (type 1)
          local.get 2
          i64.load
          i64.const -5076933981314334344
          i64.ne
          br_if 0 (;@2;)
          local.get 2
          i64.load offset=8
          i64.const 7199936582794304877
          i64.ne
          br_if 0 (;@2;)
          i32.const 1
          local.set 3
          local.get 4
          i32.const 1051988
          i32.const 1
          local.get 6
          call_indirect (type 2)
          br_if 1 (;@1;)
          local.get 4
          local.get 1
          i32.load
          local.get 1
          i32.load offset=4
          local.get 6
          call_indirect (type 2)
          br_if 1 (;@1;)
        end
        i32.const 0
        local.set 3
      end
      local.get 2
      i32.const 64
      i32.add
      global.set $__stack_pointer
      local.get 3
    )
    (func $_ZN4core9panicking18panic_nounwind_fmt17h4492f482302d73feE (;188;) (type 3) (param i32 i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 3
      i32.const 16
      i32.add
      local.get 0
      i32.const 16
      i32.add
      i64.load align=4
      i64.store
      local.get 3
      i32.const 8
      i32.add
      local.get 0
      i32.const 8
      i32.add
      i64.load align=4
      i64.store
      local.get 3
      local.get 0
      i64.load align=4
      i64.store
      local.get 3
      local.get 1
      i32.store8 offset=45
      local.get 3
      i32.const 0
      i32.store8 offset=44
      local.get 3
      local.get 2
      i32.store offset=40
      local.get 3
      i32.const 1051992
      i32.store offset=32
      local.get 3
      i32.const 1
      i32.store offset=28
      local.get 3
      local.get 3
      i32.store offset=36
      local.get 3
      i32.const 28
      i32.add
      call $rust_begin_unwind
      unreachable
    )
    (func $_ZN4core9panicking14panic_nounwind17hb10ad53603be5a05E (;189;) (type 1) (param i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 2
      i32.const 0
      i32.store offset=16
      local.get 2
      i32.const 1
      i32.store offset=4
      local.get 2
      i64.const 4
      i64.store offset=8 align=4
      local.get 2
      local.get 1
      i32.store offset=28
      local.get 2
      local.get 0
      i32.store offset=24
      local.get 2
      local.get 2
      i32.const 24
      i32.add
      i32.store
      local.get 2
      i32.const 0
      i32.const 1052040
      call $_ZN4core9panicking18panic_nounwind_fmt17h4492f482302d73feE
      unreachable
    )
    (func $_ZN4core9panicking36panic_misaligned_pointer_dereference17h5f995884aa2fdf9dE (;190;) (type 3) (param i32 i32 i32)
      (local i32 i64)
      global.get $__stack_pointer
      i32.const 112
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 3
      local.get 1
      i32.store offset=4
      local.get 3
      local.get 0
      i32.store
      local.get 3
      i32.const 34
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.tee 4
      local.get 3
      i32.const 4
      i32.add
      i64.extend_i32_u
      i64.or
      i64.store offset=40
      local.get 3
      local.get 4
      local.get 3
      i64.extend_i32_u
      i64.or
      i64.store offset=32
      local.get 3
      i32.const 108
      i32.add
      i32.const 3
      i32.store8
      local.get 3
      i32.const 104
      i32.add
      i32.const 4
      i32.store
      local.get 3
      i32.const 96
      i32.add
      i64.const 4294967328
      i64.store align=4
      local.get 3
      i32.const 88
      i32.add
      i32.const 2
      i32.store
      local.get 3
      i32.const 2
      i32.store offset=28
      local.get 3
      i32.const 2
      i32.store offset=12
      local.get 3
      i32.const 1052128
      i32.store offset=8
      local.get 3
      i32.const 2
      i32.store offset=20
      local.get 3
      i32.const 2
      i32.store offset=80
      local.get 3
      i32.const 3
      i32.store8 offset=76
      local.get 3
      i32.const 4
      i32.store offset=72
      local.get 3
      i64.const 32
      i64.store offset=64 align=4
      local.get 3
      i32.const 2
      i32.store offset=56
      local.get 3
      i32.const 2
      i32.store offset=48
      local.get 3
      local.get 3
      i32.const 48
      i32.add
      i32.store offset=24
      local.get 3
      local.get 3
      i32.const 32
      i32.add
      i32.store offset=16
      local.get 3
      i32.const 8
      i32.add
      i32.const 0
      local.get 2
      call $_ZN4core9panicking18panic_nounwind_fmt17h4492f482302d73feE
      unreachable
    )
    (func $_ZN4core3fmt3num53_$LT$impl$u20$core..fmt..LowerHex$u20$for$u20$i32$GT$3fmt17h1d8520e9e78517c0E (;191;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32)
      global.get $__stack_pointer
      i32.const 128
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 0
      i32.load
      local.set 0
      i32.const 0
      local.set 3
      loop ;; label = @1
        local.get 2
        local.get 3
        i32.add
        i32.const 127
        i32.add
        local.get 0
        i32.const 15
        i32.and
        local.tee 4
        i32.const 48
        i32.or
        local.get 4
        i32.const 87
        i32.add
        local.get 4
        i32.const 10
        i32.lt_u
        select
        i32.store8
        local.get 3
        i32.const -1
        i32.add
        local.set 3
        local.get 0
        i32.const 16
        i32.lt_u
        local.set 4
        local.get 0
        i32.const 4
        i32.shr_u
        local.set 0
        local.get 4
        i32.eqz
        br_if 0 (;@1;)
      end
      block ;; label = @1
        local.get 3
        i32.const 128
        i32.add
        local.tee 0
        i32.const 128
        i32.le_u
        br_if 0 (;@1;)
        local.get 0
        i32.const 128
        i32.const 1052336
        call $_ZN4core5slice5index26slice_start_index_len_fail17h5249b664c892b135E
        unreachable
      end
      local.get 1
      i32.const 1
      i32.const 1052352
      i32.const 2
      local.get 2
      local.get 3
      i32.add
      i32.const 128
      i32.add
      i32.const 0
      local.get 3
      i32.sub
      call $_ZN4core3fmt9Formatter12pad_integral17h9b590b44d842dd23E
      local.set 0
      local.get 2
      i32.const 128
      i32.add
      global.set $__stack_pointer
      local.get 0
    )
    (func $_ZN4core9panicking19assert_failed_inner17ha7ed4ad68b2c3a67E (;192;) (type 14) (param i32 i32 i32 i32 i32 i32 i32)
      (local i32 i64)
      global.get $__stack_pointer
      i32.const 112
      i32.sub
      local.tee 7
      global.set $__stack_pointer
      local.get 7
      local.get 2
      i32.store offset=12
      local.get 7
      local.get 1
      i32.store offset=8
      local.get 7
      local.get 4
      i32.store offset=20
      local.get 7
      local.get 3
      i32.store offset=16
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 0
              i32.const 255
              i32.and
              br_table 0 (;@4;) 1 (;@3;) 2 (;@2;) 0 (;@4;)
            end
            local.get 7
            i32.const 1052144
            i32.store offset=24
            i32.const 2
            local.set 2
            br 2 (;@1;)
          end
          local.get 7
          i32.const 1052146
          i32.store offset=24
          i32.const 2
          local.set 2
          br 1 (;@1;)
        end
        local.get 7
        i32.const 1052148
        i32.store offset=24
        i32.const 7
        local.set 2
      end
      local.get 7
      local.get 2
      i32.store offset=28
      block ;; label = @1
        local.get 5
        i32.load
        br_if 0 (;@1;)
        local.get 7
        i32.const 3
        i32.store offset=92
        local.get 7
        i32.const 1052204
        i32.store offset=88
        local.get 7
        i64.const 3
        i64.store offset=100 align=4
        local.get 7
        i32.const 32
        i64.extend_i32_u
        i64.const 32
        i64.shl
        local.tee 8
        local.get 7
        i32.const 16
        i32.add
        i64.extend_i32_u
        i64.or
        i64.store offset=72
        local.get 7
        local.get 8
        local.get 7
        i32.const 8
        i32.add
        i64.extend_i32_u
        i64.or
        i64.store offset=64
        local.get 7
        i32.const 33
        i64.extend_i32_u
        i64.const 32
        i64.shl
        local.get 7
        i32.const 24
        i32.add
        i64.extend_i32_u
        i64.or
        i64.store offset=56
        local.get 7
        local.get 7
        i32.const 56
        i32.add
        i32.store offset=96
        local.get 7
        i32.const 88
        i32.add
        local.get 6
        call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
        unreachable
      end
      local.get 7
      i32.const 32
      i32.add
      i32.const 16
      i32.add
      local.get 5
      i32.const 16
      i32.add
      i64.load align=4
      i64.store
      local.get 7
      i32.const 32
      i32.add
      i32.const 8
      i32.add
      local.get 5
      i32.const 8
      i32.add
      i64.load align=4
      i64.store
      local.get 7
      local.get 5
      i64.load align=4
      i64.store offset=32
      local.get 7
      i32.const 4
      i32.store offset=92
      local.get 7
      i32.const 1052256
      i32.store offset=88
      local.get 7
      i64.const 4
      i64.store offset=100 align=4
      local.get 7
      i32.const 32
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.tee 8
      local.get 7
      i32.const 16
      i32.add
      i64.extend_i32_u
      i64.or
      i64.store offset=80
      local.get 7
      local.get 8
      local.get 7
      i32.const 8
      i32.add
      i64.extend_i32_u
      i64.or
      i64.store offset=72
      local.get 7
      i32.const 35
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.get 7
      i32.const 32
      i32.add
      i64.extend_i32_u
      i64.or
      i64.store offset=64
      local.get 7
      i32.const 33
      i64.extend_i32_u
      i64.const 32
      i64.shl
      local.get 7
      i32.const 24
      i32.add
      i64.extend_i32_u
      i64.or
      i64.store offset=56
      local.get 7
      local.get 7
      i32.const 56
      i32.add
      i32.store offset=96
      local.get 7
      i32.const 88
      i32.add
      local.get 6
      call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
      unreachable
    )
    (func $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17h3d40f6a97cfa328aE (;193;) (type 4) (param i32 i32) (result i32)
      local.get 0
      i32.load
      local.get 1
      local.get 0
      i32.load offset=4
      i32.load offset=12
      call_indirect (type 4)
    )
    (func $_ZN59_$LT$core..fmt..Arguments$u20$as$u20$core..fmt..Display$GT$3fmt17h8eb0129beb9530bdE (;194;) (type 4) (param i32 i32) (result i32)
      local.get 1
      i32.load offset=20
      local.get 1
      i32.load offset=24
      local.get 0
      call $_ZN4core3fmt5write17h86ae7d4da82da0b2E
    )
    (func $_ZN4core3fmt9Formatter12pad_integral17h9b590b44d842dd23E (;195;) (type 15) (param i32 i32 i32 i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          local.get 1
          br_if 0 (;@2;)
          local.get 5
          i32.const 1
          i32.add
          local.set 6
          local.get 0
          i32.load offset=28
          local.set 7
          i32.const 45
          local.set 8
          br 1 (;@1;)
        end
        i32.const 43
        i32.const 1114112
        local.get 0
        i32.load offset=28
        local.tee 7
        i32.const 1
        i32.and
        local.tee 1
        select
        local.set 8
        local.get 1
        local.get 5
        i32.add
        local.set 6
      end
      block ;; label = @1
        block ;; label = @2
          local.get 7
          i32.const 4
          i32.and
          br_if 0 (;@2;)
          i32.const 0
          local.set 2
          br 1 (;@1;)
        end
        block ;; label = @2
          block ;; label = @3
            local.get 3
            i32.const 16
            i32.lt_u
            br_if 0 (;@3;)
            local.get 2
            local.get 3
            call $_ZN4core3str5count14do_count_chars17h0d2663faf1e1a3afE
            local.set 1
            br 1 (;@2;)
          end
          block ;; label = @3
            local.get 3
            br_if 0 (;@3;)
            i32.const 0
            local.set 1
            br 1 (;@2;)
          end
          local.get 3
          i32.const 3
          i32.and
          local.set 9
          block ;; label = @3
            block ;; label = @4
              local.get 3
              i32.const 4
              i32.ge_u
              br_if 0 (;@4;)
              i32.const 0
              local.set 1
              i32.const 0
              local.set 10
              br 1 (;@3;)
            end
            local.get 3
            i32.const 12
            i32.and
            local.set 11
            i32.const 0
            local.set 1
            i32.const 0
            local.set 10
            loop ;; label = @4
              local.get 1
              local.get 2
              local.get 10
              i32.add
              local.tee 12
              i32.load8_s
              i32.const -65
              i32.gt_s
              i32.add
              local.get 12
              i32.const 1
              i32.add
              i32.load8_s
              i32.const -65
              i32.gt_s
              i32.add
              local.get 12
              i32.const 2
              i32.add
              i32.load8_s
              i32.const -65
              i32.gt_s
              i32.add
              local.get 12
              i32.const 3
              i32.add
              i32.load8_s
              i32.const -65
              i32.gt_s
              i32.add
              local.set 1
              local.get 11
              local.get 10
              i32.const 4
              i32.add
              local.tee 10
              i32.ne
              br_if 0 (;@4;)
            end
          end
          local.get 9
          i32.eqz
          br_if 0 (;@2;)
          local.get 2
          local.get 10
          i32.add
          local.set 12
          loop ;; label = @3
            local.get 1
            local.get 12
            i32.load8_s
            i32.const -65
            i32.gt_s
            i32.add
            local.set 1
            local.get 12
            i32.const 1
            i32.add
            local.set 12
            local.get 9
            i32.const -1
            i32.add
            local.tee 9
            br_if 0 (;@3;)
          end
        end
        local.get 1
        local.get 6
        i32.add
        local.set 6
      end
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i32.load
          br_if 0 (;@2;)
          i32.const 1
          local.set 1
          local.get 0
          i32.load offset=20
          local.tee 12
          local.get 0
          i32.load offset=24
          local.tee 10
          local.get 8
          local.get 2
          local.get 3
          call $_ZN4core3fmt9Formatter12pad_integral12write_prefix17h035d1360460d9a0fE
          br_if 1 (;@1;)
          local.get 12
          local.get 4
          local.get 5
          local.get 10
          i32.load offset=12
          call_indirect (type 2)
          return
        end
        block ;; label = @2
          local.get 0
          i32.load offset=4
          local.tee 9
          local.get 6
          i32.gt_u
          br_if 0 (;@2;)
          i32.const 1
          local.set 1
          local.get 0
          i32.load offset=20
          local.tee 12
          local.get 0
          i32.load offset=24
          local.tee 10
          local.get 8
          local.get 2
          local.get 3
          call $_ZN4core3fmt9Formatter12pad_integral12write_prefix17h035d1360460d9a0fE
          br_if 1 (;@1;)
          local.get 12
          local.get 4
          local.get 5
          local.get 10
          i32.load offset=12
          call_indirect (type 2)
          return
        end
        block ;; label = @2
          local.get 7
          i32.const 8
          i32.and
          i32.eqz
          br_if 0 (;@2;)
          local.get 0
          i32.load offset=16
          local.set 11
          local.get 0
          i32.const 48
          i32.store offset=16
          local.get 0
          i32.load8_u offset=32
          local.set 7
          i32.const 1
          local.set 1
          local.get 0
          i32.const 1
          i32.store8 offset=32
          local.get 0
          i32.load offset=20
          local.tee 12
          local.get 0
          i32.load offset=24
          local.tee 10
          local.get 8
          local.get 2
          local.get 3
          call $_ZN4core3fmt9Formatter12pad_integral12write_prefix17h035d1360460d9a0fE
          br_if 1 (;@1;)
          local.get 9
          local.get 6
          i32.sub
          i32.const 1
          i32.add
          local.set 1
          block ;; label = @3
            loop ;; label = @4
              local.get 1
              i32.const -1
              i32.add
              local.tee 1
              i32.eqz
              br_if 1 (;@3;)
              local.get 12
              i32.const 48
              local.get 10
              i32.load offset=16
              call_indirect (type 4)
              i32.eqz
              br_if 0 (;@4;)
            end
            i32.const 1
            return
          end
          i32.const 1
          local.set 1
          local.get 12
          local.get 4
          local.get 5
          local.get 10
          i32.load offset=12
          call_indirect (type 2)
          br_if 1 (;@1;)
          local.get 0
          local.get 7
          i32.store8 offset=32
          local.get 0
          local.get 11
          i32.store offset=16
          i32.const 0
          local.set 1
          br 1 (;@1;)
        end
        local.get 9
        local.get 6
        i32.sub
        local.set 6
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 0
              i32.load8_u offset=32
              local.tee 1
              br_table 2 (;@2;) 0 (;@4;) 1 (;@3;) 0 (;@4;) 2 (;@2;)
            end
            local.get 6
            local.set 1
            i32.const 0
            local.set 6
            br 1 (;@2;)
          end
          local.get 6
          i32.const 1
          i32.shr_u
          local.set 1
          local.get 6
          i32.const 1
          i32.add
          i32.const 1
          i32.shr_u
          local.set 6
        end
        local.get 1
        i32.const 1
        i32.add
        local.set 1
        local.get 0
        i32.load offset=16
        local.set 9
        local.get 0
        i32.load offset=24
        local.set 12
        local.get 0
        i32.load offset=20
        local.set 10
        block ;; label = @2
          loop ;; label = @3
            local.get 1
            i32.const -1
            i32.add
            local.tee 1
            i32.eqz
            br_if 1 (;@2;)
            local.get 10
            local.get 9
            local.get 12
            i32.load offset=16
            call_indirect (type 4)
            i32.eqz
            br_if 0 (;@3;)
          end
          i32.const 1
          return
        end
        i32.const 1
        local.set 1
        local.get 10
        local.get 12
        local.get 8
        local.get 2
        local.get 3
        call $_ZN4core3fmt9Formatter12pad_integral12write_prefix17h035d1360460d9a0fE
        br_if 0 (;@1;)
        local.get 10
        local.get 4
        local.get 5
        local.get 12
        i32.load offset=12
        call_indirect (type 2)
        br_if 0 (;@1;)
        i32.const 0
        local.set 1
        loop ;; label = @2
          block ;; label = @3
            local.get 6
            local.get 1
            i32.ne
            br_if 0 (;@3;)
            local.get 6
            local.get 6
            i32.lt_u
            return
          end
          local.get 1
          i32.const 1
          i32.add
          local.set 1
          local.get 10
          local.get 9
          local.get 12
          i32.load offset=16
          call_indirect (type 4)
          i32.eqz
          br_if 0 (;@2;)
        end
        local.get 1
        i32.const -1
        i32.add
        local.get 6
        i32.lt_u
        return
      end
      local.get 1
    )
    (func $_ZN4core3str5count14do_count_chars17h0d2663faf1e1a3afE (;196;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          local.get 1
          local.get 0
          i32.const 3
          i32.add
          i32.const -4
          i32.and
          local.tee 2
          local.get 0
          i32.sub
          local.tee 3
          i32.lt_u
          br_if 0 (;@2;)
          local.get 1
          local.get 3
          i32.sub
          local.tee 4
          i32.const 4
          i32.lt_u
          br_if 0 (;@2;)
          local.get 4
          i32.const 3
          i32.and
          local.set 5
          i32.const 0
          local.set 6
          i32.const 0
          local.set 1
          block ;; label = @3
            local.get 2
            local.get 0
            i32.eq
            local.tee 7
            br_if 0 (;@3;)
            i32.const 0
            local.set 1
            block ;; label = @4
              block ;; label = @5
                local.get 0
                local.get 2
                i32.sub
                local.tee 8
                i32.const -4
                i32.le_u
                br_if 0 (;@5;)
                i32.const 0
                local.set 9
                br 1 (;@4;)
              end
              i32.const 0
              local.set 9
              loop ;; label = @5
                local.get 1
                local.get 0
                local.get 9
                i32.add
                local.tee 2
                i32.load8_s
                i32.const -65
                i32.gt_s
                i32.add
                local.get 2
                i32.const 1
                i32.add
                i32.load8_s
                i32.const -65
                i32.gt_s
                i32.add
                local.get 2
                i32.const 2
                i32.add
                i32.load8_s
                i32.const -65
                i32.gt_s
                i32.add
                local.get 2
                i32.const 3
                i32.add
                i32.load8_s
                i32.const -65
                i32.gt_s
                i32.add
                local.set 1
                local.get 9
                i32.const 4
                i32.add
                local.tee 9
                br_if 0 (;@5;)
              end
            end
            local.get 7
            br_if 0 (;@3;)
            local.get 0
            local.get 9
            i32.add
            local.set 2
            loop ;; label = @4
              local.get 1
              local.get 2
              i32.load8_s
              i32.const -65
              i32.gt_s
              i32.add
              local.set 1
              local.get 2
              i32.const 1
              i32.add
              local.set 2
              local.get 8
              i32.const 1
              i32.add
              local.tee 8
              br_if 0 (;@4;)
            end
          end
          local.get 0
          local.get 3
          i32.add
          local.set 9
          block ;; label = @3
            local.get 5
            i32.eqz
            br_if 0 (;@3;)
            local.get 9
            local.get 4
            i32.const -4
            i32.and
            i32.add
            local.tee 2
            i32.load8_s
            i32.const -65
            i32.gt_s
            local.set 6
            local.get 5
            i32.const 1
            i32.eq
            br_if 0 (;@3;)
            local.get 6
            local.get 2
            i32.load8_s offset=1
            i32.const -65
            i32.gt_s
            i32.add
            local.set 6
            local.get 5
            i32.const 2
            i32.eq
            br_if 0 (;@3;)
            local.get 6
            local.get 2
            i32.load8_s offset=2
            i32.const -65
            i32.gt_s
            i32.add
            local.set 6
          end
          local.get 4
          i32.const 2
          i32.shr_u
          local.set 3
          local.get 6
          local.get 1
          i32.add
          local.set 8
          loop ;; label = @3
            local.get 9
            local.set 4
            local.get 3
            i32.eqz
            br_if 2 (;@1;)
            local.get 3
            i32.const 192
            local.get 3
            i32.const 192
            i32.lt_u
            select
            local.tee 6
            i32.const 3
            i32.and
            local.set 7
            local.get 6
            i32.const 2
            i32.shl
            local.set 5
            i32.const 0
            local.set 2
            block ;; label = @4
              local.get 3
              i32.const 4
              i32.lt_u
              br_if 0 (;@4;)
              local.get 4
              local.get 5
              i32.const 1008
              i32.and
              i32.add
              local.set 0
              i32.const 0
              local.set 2
              local.get 4
              local.set 1
              loop ;; label = @5
                local.get 1
                i32.load offset=12
                local.tee 9
                i32.const -1
                i32.xor
                i32.const 7
                i32.shr_u
                local.get 9
                i32.const 6
                i32.shr_u
                i32.or
                i32.const 16843009
                i32.and
                local.get 1
                i32.load offset=8
                local.tee 9
                i32.const -1
                i32.xor
                i32.const 7
                i32.shr_u
                local.get 9
                i32.const 6
                i32.shr_u
                i32.or
                i32.const 16843009
                i32.and
                local.get 1
                i32.load offset=4
                local.tee 9
                i32.const -1
                i32.xor
                i32.const 7
                i32.shr_u
                local.get 9
                i32.const 6
                i32.shr_u
                i32.or
                i32.const 16843009
                i32.and
                local.get 1
                i32.load
                local.tee 9
                i32.const -1
                i32.xor
                i32.const 7
                i32.shr_u
                local.get 9
                i32.const 6
                i32.shr_u
                i32.or
                i32.const 16843009
                i32.and
                local.get 2
                i32.add
                i32.add
                i32.add
                i32.add
                local.set 2
                local.get 1
                i32.const 16
                i32.add
                local.tee 1
                local.get 0
                i32.ne
                br_if 0 (;@5;)
              end
            end
            local.get 3
            local.get 6
            i32.sub
            local.set 3
            local.get 4
            local.get 5
            i32.add
            local.set 9
            local.get 2
            i32.const 8
            i32.shr_u
            i32.const 16711935
            i32.and
            local.get 2
            i32.const 16711935
            i32.and
            i32.add
            i32.const 65537
            i32.mul
            i32.const 16
            i32.shr_u
            local.get 8
            i32.add
            local.set 8
            local.get 7
            i32.eqz
            br_if 0 (;@3;)
          end
          local.get 4
          local.get 6
          i32.const 252
          i32.and
          i32.const 2
          i32.shl
          i32.add
          local.tee 2
          i32.load
          local.tee 1
          i32.const -1
          i32.xor
          i32.const 7
          i32.shr_u
          local.get 1
          i32.const 6
          i32.shr_u
          i32.or
          i32.const 16843009
          i32.and
          local.set 1
          block ;; label = @3
            local.get 7
            i32.const 1
            i32.eq
            br_if 0 (;@3;)
            local.get 2
            i32.load offset=4
            local.tee 9
            i32.const -1
            i32.xor
            i32.const 7
            i32.shr_u
            local.get 9
            i32.const 6
            i32.shr_u
            i32.or
            i32.const 16843009
            i32.and
            local.get 1
            i32.add
            local.set 1
            local.get 7
            i32.const 2
            i32.eq
            br_if 0 (;@3;)
            local.get 2
            i32.load offset=8
            local.tee 2
            i32.const -1
            i32.xor
            i32.const 7
            i32.shr_u
            local.get 2
            i32.const 6
            i32.shr_u
            i32.or
            i32.const 16843009
            i32.and
            local.get 1
            i32.add
            local.set 1
          end
          local.get 1
          i32.const 8
          i32.shr_u
          i32.const 459007
          i32.and
          local.get 1
          i32.const 16711935
          i32.and
          i32.add
          i32.const 65537
          i32.mul
          i32.const 16
          i32.shr_u
          local.get 8
          i32.add
          return
        end
        block ;; label = @2
          local.get 1
          br_if 0 (;@2;)
          i32.const 0
          return
        end
        local.get 1
        i32.const 3
        i32.and
        local.set 9
        block ;; label = @2
          block ;; label = @3
            local.get 1
            i32.const 4
            i32.ge_u
            br_if 0 (;@3;)
            i32.const 0
            local.set 8
            i32.const 0
            local.set 2
            br 1 (;@2;)
          end
          local.get 1
          i32.const -4
          i32.and
          local.set 3
          i32.const 0
          local.set 8
          i32.const 0
          local.set 2
          loop ;; label = @3
            local.get 8
            local.get 0
            local.get 2
            i32.add
            local.tee 1
            i32.load8_s
            i32.const -65
            i32.gt_s
            i32.add
            local.get 1
            i32.const 1
            i32.add
            i32.load8_s
            i32.const -65
            i32.gt_s
            i32.add
            local.get 1
            i32.const 2
            i32.add
            i32.load8_s
            i32.const -65
            i32.gt_s
            i32.add
            local.get 1
            i32.const 3
            i32.add
            i32.load8_s
            i32.const -65
            i32.gt_s
            i32.add
            local.set 8
            local.get 3
            local.get 2
            i32.const 4
            i32.add
            local.tee 2
            i32.ne
            br_if 0 (;@3;)
          end
        end
        local.get 9
        i32.eqz
        br_if 0 (;@1;)
        local.get 0
        local.get 2
        i32.add
        local.set 1
        loop ;; label = @2
          local.get 8
          local.get 1
          i32.load8_s
          i32.const -65
          i32.gt_s
          i32.add
          local.set 8
          local.get 1
          i32.const 1
          i32.add
          local.set 1
          local.get 9
          i32.const -1
          i32.add
          local.tee 9
          br_if 0 (;@2;)
        end
      end
      local.get 8
    )
    (func $_ZN4core3fmt9Formatter12pad_integral12write_prefix17h035d1360460d9a0fE (;197;) (type 16) (param i32 i32 i32 i32 i32) (result i32)
      (local i32)
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 2
            i32.const 1114112
            i32.eq
            br_if 0 (;@3;)
            i32.const 1
            local.set 5
            local.get 0
            local.get 2
            local.get 1
            i32.load offset=16
            call_indirect (type 4)
            br_if 1 (;@2;)
          end
          local.get 3
          br_if 1 (;@1;)
          i32.const 0
          local.set 5
        end
        local.get 5
        return
      end
      local.get 0
      local.get 3
      local.get 4
      local.get 1
      i32.load offset=12
      call_indirect (type 2)
    )
    (func $_ZN4core3fmt9Formatter9write_str17h4979a51232c3e6b6E (;198;) (type 2) (param i32 i32 i32) (result i32)
      local.get 0
      i32.load offset=20
      local.get 1
      local.get 2
      local.get 0
      i32.load offset=24
      i32.load offset=12
      call_indirect (type 2)
    )
    (func $_ZN43_$LT$bool$u20$as$u20$core..fmt..Display$GT$3fmt17hace09e3e1b2a9347E (;199;) (type 4) (param i32 i32) (result i32)
      block ;; label = @1
        local.get 0
        i32.load8_u
        br_if 0 (;@1;)
        local.get 1
        i32.const 1052554
        i32.const 5
        call $_ZN4core3fmt9Formatter3pad17h76f0fc0e2167db42E
        return
      end
      local.get 1
      i32.const 1052559
      i32.const 4
      call $_ZN4core3fmt9Formatter3pad17h76f0fc0e2167db42E
    )
    (func $_ZN42_$LT$str$u20$as$u20$core..fmt..Display$GT$3fmt17h1c8e670e7aa54677E (;200;) (type 2) (param i32 i32 i32) (result i32)
      local.get 2
      local.get 0
      local.get 1
      call $_ZN4core3fmt9Formatter3pad17h76f0fc0e2167db42E
    )
    (func $_ZN4core5slice6memchr14memchr_aligned17h29ad13d9d0ad2e7eE (;201;) (type 10) (param i32 i32 i32 i32)
      (local i32 i32 i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 2
              i32.const 3
              i32.add
              i32.const -4
              i32.and
              local.tee 4
              local.get 2
              i32.eq
              br_if 0 (;@4;)
              local.get 4
              local.get 2
              i32.sub
              local.tee 4
              local.get 3
              local.get 4
              local.get 3
              i32.lt_u
              select
              local.tee 4
              i32.eqz
              br_if 0 (;@4;)
              i32.const 0
              local.set 5
              local.get 1
              i32.const 255
              i32.and
              local.set 6
              i32.const 1
              local.set 7
              loop ;; label = @5
                local.get 2
                local.get 5
                i32.add
                i32.load8_u
                local.get 6
                i32.eq
                br_if 4 (;@1;)
                local.get 4
                local.get 5
                i32.const 1
                i32.add
                local.tee 5
                i32.ne
                br_if 0 (;@5;)
              end
              local.get 4
              local.get 3
              i32.const -8
              i32.add
              local.tee 7
              i32.gt_u
              br_if 2 (;@2;)
              br 1 (;@3;)
            end
            local.get 3
            i32.const -8
            i32.add
            local.set 7
            i32.const 0
            local.set 4
          end
          local.get 1
          i32.const 255
          i32.and
          i32.const 16843009
          i32.mul
          local.set 5
          loop ;; label = @3
            local.get 2
            local.get 4
            i32.add
            local.tee 6
            i32.const 4
            i32.add
            i32.load
            local.get 5
            i32.xor
            local.tee 8
            i32.const -16843009
            i32.add
            local.get 8
            i32.const -1
            i32.xor
            i32.and
            local.get 6
            i32.load
            local.get 5
            i32.xor
            local.tee 6
            i32.const -16843009
            i32.add
            local.get 6
            i32.const -1
            i32.xor
            i32.and
            i32.or
            i32.const -2139062144
            i32.and
            br_if 1 (;@2;)
            local.get 4
            i32.const 8
            i32.add
            local.tee 4
            local.get 7
            i32.le_u
            br_if 0 (;@3;)
          end
        end
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 3
              local.get 4
              i32.sub
              local.tee 6
              br_if 0 (;@4;)
              i32.const 0
              local.set 6
              br 1 (;@3;)
            end
            local.get 2
            local.get 4
            i32.add
            local.set 8
            i32.const 0
            local.set 5
            local.get 1
            i32.const 255
            i32.and
            local.set 2
            i32.const 1
            local.set 7
            loop ;; label = @4
              block ;; label = @5
                local.get 8
                local.get 5
                i32.add
                i32.load8_u
                local.get 2
                i32.ne
                br_if 0 (;@5;)
                local.get 5
                local.set 6
                br 3 (;@2;)
              end
              local.get 6
              local.get 5
              i32.const 1
              i32.add
              local.tee 5
              i32.ne
              br_if 0 (;@4;)
            end
          end
          i32.const 0
          local.set 7
        end
        local.get 6
        local.get 4
        i32.add
        local.set 5
      end
      local.get 0
      local.get 5
      i32.store offset=4
      local.get 0
      local.get 7
      i32.store
    )
    (func $_ZN4core9panicking11panic_const24panic_const_add_overflow17h8673594c898eaaa4E (;202;) (type 0) (param i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      local.get 1
      i32.const 0
      i32.store offset=24
      local.get 1
      i32.const 1
      i32.store offset=12
      local.get 1
      i32.const 1051856
      i32.store offset=8
      local.get 1
      i64.const 4
      i64.store offset=16 align=4
      local.get 1
      i32.const 8
      i32.add
      local.get 0
      call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
      unreachable
    )
    (func $_ZN4core9panicking11panic_const24panic_const_mul_overflow17hce9c6f2692bf60a5E (;203;) (type 0) (param i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      local.get 1
      i32.const 0
      i32.store offset=24
      local.get 1
      i32.const 1
      i32.store offset=12
      local.get 1
      i32.const 1051900
      i32.store offset=8
      local.get 1
      i64.const 4
      i64.store offset=16 align=4
      local.get 1
      i32.const 8
      i32.add
      local.get 0
      call $_ZN4core9panicking9panic_fmt17ha6dd277a6c564e01E
      unreachable
    )
    (func $_ZN4core3fmt3num3imp7fmt_u6417h5caca5c982653f4cE (;204;) (type 17) (param i64 i32 i32) (result i32)
      (local i32 i32 i64 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      i32.const 39
      local.set 4
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i64.const 10000
          i64.ge_u
          br_if 0 (;@2;)
          local.get 0
          local.set 5
          br 1 (;@1;)
        end
        i32.const 39
        local.set 4
        loop ;; label = @2
          local.get 3
          i32.const 9
          i32.add
          local.get 4
          i32.add
          local.tee 6
          i32.const -4
          i32.add
          local.get 0
          local.get 0
          i64.const 10000
          i64.div_u
          local.tee 5
          i64.const 10000
          i64.mul
          i64.sub
          i32.wrap_i64
          local.tee 7
          i32.const 65535
          i32.and
          i32.const 100
          i32.div_u
          local.tee 8
          i32.const 1
          i32.shl
          i32.const 1052354
          i32.add
          i32.load16_u align=1
          i32.store16 align=1
          local.get 6
          i32.const -2
          i32.add
          local.get 7
          local.get 8
          i32.const 100
          i32.mul
          i32.sub
          i32.const 65535
          i32.and
          i32.const 1
          i32.shl
          i32.const 1052354
          i32.add
          i32.load16_u align=1
          i32.store16 align=1
          local.get 4
          i32.const -4
          i32.add
          local.set 4
          local.get 0
          i64.const 99999999
          i64.gt_u
          local.set 6
          local.get 5
          local.set 0
          local.get 6
          br_if 0 (;@2;)
        end
      end
      block ;; label = @1
        local.get 5
        i32.wrap_i64
        local.tee 6
        i32.const 99
        i32.le_u
        br_if 0 (;@1;)
        local.get 3
        i32.const 9
        i32.add
        local.get 4
        i32.const -2
        i32.add
        local.tee 4
        i32.add
        local.get 5
        i32.wrap_i64
        local.tee 6
        local.get 6
        i32.const 65535
        i32.and
        i32.const 100
        i32.div_u
        local.tee 6
        i32.const 100
        i32.mul
        i32.sub
        i32.const 65535
        i32.and
        i32.const 1
        i32.shl
        i32.const 1052354
        i32.add
        i32.load16_u align=1
        i32.store16 align=1
      end
      block ;; label = @1
        block ;; label = @2
          local.get 6
          i32.const 10
          i32.lt_u
          br_if 0 (;@2;)
          local.get 3
          i32.const 9
          i32.add
          local.get 4
          i32.const -2
          i32.add
          local.tee 4
          i32.add
          local.get 6
          i32.const 1
          i32.shl
          i32.const 1052354
          i32.add
          i32.load16_u align=1
          i32.store16 align=1
          br 1 (;@1;)
        end
        local.get 3
        i32.const 9
        i32.add
        local.get 4
        i32.const -1
        i32.add
        local.tee 4
        i32.add
        local.get 6
        i32.const 48
        i32.or
        i32.store8
      end
      local.get 2
      local.get 1
      i32.const 1
      i32.const 0
      local.get 3
      i32.const 9
      i32.add
      local.get 4
      i32.add
      i32.const 39
      local.get 4
      i32.sub
      call $_ZN4core3fmt9Formatter12pad_integral17h9b590b44d842dd23E
      local.set 4
      local.get 3
      i32.const 48
      i32.add
      global.set $__stack_pointer
      local.get 4
    )
    (func $_ZN4core3fmt3num53_$LT$impl$u20$core..fmt..UpperHex$u20$for$u20$i32$GT$3fmt17h67634a7447620a5eE (;205;) (type 4) (param i32 i32) (result i32)
      (local i32 i32 i32)
      global.get $__stack_pointer
      i32.const 128
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 0
      i32.load
      local.set 0
      i32.const 0
      local.set 3
      loop ;; label = @1
        local.get 2
        local.get 3
        i32.add
        i32.const 127
        i32.add
        local.get 0
        i32.const 15
        i32.and
        local.tee 4
        i32.const 48
        i32.or
        local.get 4
        i32.const 55
        i32.add
        local.get 4
        i32.const 10
        i32.lt_u
        select
        i32.store8
        local.get 3
        i32.const -1
        i32.add
        local.set 3
        local.get 0
        i32.const 16
        i32.lt_u
        local.set 4
        local.get 0
        i32.const 4
        i32.shr_u
        local.set 0
        local.get 4
        i32.eqz
        br_if 0 (;@1;)
      end
      block ;; label = @1
        local.get 3
        i32.const 128
        i32.add
        local.tee 0
        i32.const 128
        i32.le_u
        br_if 0 (;@1;)
        local.get 0
        i32.const 128
        i32.const 1052336
        call $_ZN4core5slice5index26slice_start_index_len_fail17h5249b664c892b135E
        unreachable
      end
      local.get 1
      i32.const 1
      i32.const 1052352
      i32.const 2
      local.get 2
      local.get 3
      i32.add
      i32.const 128
      i32.add
      i32.const 0
      local.get 3
      i32.sub
      call $_ZN4core3fmt9Formatter12pad_integral17h9b590b44d842dd23E
      local.set 0
      local.get 2
      i32.const 128
      i32.add
      global.set $__stack_pointer
      local.get 0
    )
    (func $cabi_realloc (;206;) (type 6) (param i32 i32 i32 i32) (result i32)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      call $cabi_realloc_wit_bindgen_0_30_0
    )
    (table (;0;) 37 37 funcref)
    (memory (;0;) 17)
    (global $__stack_pointer (;0;) (mut i32) i32.const 1048576)
    (export "memory" (memory 0))
    (export "test" (func $test))
    (export "cabi_realloc_wit_bindgen_0_30_0" (func $cabi_realloc_wit_bindgen_0_30_0))
    (export "cabi_realloc" (func $cabi_realloc))
    (elem (;0;) (i32.const 1) func $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17hfee966ea49c4b9b8E $cabi_realloc $_ZN3std2io5Write9write_fmt17h8e312ff03507c2b0E $_ZN3std2io5Write9write_fmt17hb21ea30df3210b70E $_ZN4core3fmt3num3imp52_$LT$impl$u20$core..fmt..Display$u20$for$u20$u32$GT$3fmt17h3b56eb797759e149E $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17h868f32f902646e89E $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17ha780adf48b070eb3E $_ZN91_$LT$std..sys_common..backtrace.._print..DisplayBacktrace$u20$as$u20$core..fmt..Display$GT$3fmt17h6f9cc2dccf01fc6bE $_ZN73_$LT$core..panic..panic_info..PanicInfo$u20$as$u20$core..fmt..Display$GT$3fmt17h0a6426656ab2e03bE $_ZN3std5alloc24default_alloc_error_hook17h4f8dbbbf0f42e7f9E $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17h2dcc30c3ae811092E $_ZN4core3ptr88drop_in_place$LT$std..io..Write..write_fmt..Adapter$LT$alloc..vec..Vec$LT$u8$GT$$GT$$GT$17h5bd937049d024a22E $_ZN80_$LT$std..io..Write..write_fmt..Adapter$LT$T$GT$$u20$as$u20$core..fmt..Write$GT$9write_str17hcfdf18f9e3c26cecE $_ZN4core3fmt5Write10write_char17h9901503f16821d0aE $_ZN4core3fmt5Write9write_fmt17h0c5ad60afd664945E $_ZN80_$LT$std..io..Write..write_fmt..Adapter$LT$T$GT$$u20$as$u20$core..fmt..Write$GT$9write_str17h8be809f679f644a4E $_ZN4core3fmt5Write10write_char17h920592283b5a2127E $_ZN4core3fmt5Write9write_fmt17h8babb06e12caa1c2E $_ZN4core3ptr42drop_in_place$LT$alloc..string..String$GT$17he424d63ca6d10601E $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$9write_str17h29fbbe981c255749E $_ZN58_$LT$alloc..string..String$u20$as$u20$core..fmt..Write$GT$10write_char17hbc9b5a514b56601bE $_ZN4core3fmt5Write9write_fmt17h8164afb3f1e315acE $_ZN36_$LT$T$u20$as$u20$core..any..Any$GT$7type_id17he695300dfb07afd1E $_ZN36_$LT$T$u20$as$u20$core..any..Any$GT$7type_id17h1f3918fc15315f33E $_ZN99_$LT$std..panicking..begin_panic_handler..StaticStrPayload$u20$as$u20$core..panic..PanicPayload$GT$8take_box17he2941444311ab37dE $_ZN99_$LT$std..panicking..begin_panic_handler..StaticStrPayload$u20$as$u20$core..panic..PanicPayload$GT$3get17h0eabfb26e759d6c9E $_ZN4core3ptr77drop_in_place$LT$std..panicking..begin_panic_handler..FormatStringPayload$GT$17he46bc18372466552E $_ZN102_$LT$std..panicking..begin_panic_handler..FormatStringPayload$u20$as$u20$core..panic..PanicPayload$GT$8take_box17h408ec53afc6e4b59E $_ZN102_$LT$std..panicking..begin_panic_handler..FormatStringPayload$u20$as$u20$core..panic..PanicPayload$GT$3get17he934073eb0aea946E $_ZN36_$LT$T$u20$as$u20$core..any..Any$GT$7type_id17h39f0d0c355eabd2cE $_ZN69_$LT$core..alloc..layout..LayoutError$u20$as$u20$core..fmt..Debug$GT$3fmt17hf4b985c6e40b5d18E $_ZN42_$LT$$RF$T$u20$as$u20$core..fmt..Debug$GT$3fmt17h3d40f6a97cfa328aE $_ZN44_$LT$$RF$T$u20$as$u20$core..fmt..Display$GT$3fmt17hfecc6d15f15fcc8cE $_ZN4core3fmt3num53_$LT$impl$u20$core..fmt..LowerHex$u20$for$u20$i32$GT$3fmt17h1d8520e9e78517c0E $_ZN59_$LT$core..fmt..Arguments$u20$as$u20$core..fmt..Display$GT$3fmt17h8eb0129beb9530bdE $_ZN36_$LT$T$u20$as$u20$core..any..Any$GT$7type_id17h52e4290999298771E)
    (data $.rodata (;0;) (i32.const 1048576) "is_aligned_to: align is not a power-of-two\00\00\00\00\10\00*\00\00\00unsafe precondition(s) violated: ptr::read_volatile requires that the pointer argument is aligned and non-null\00\00\00\00\00\00\00\00\00\00/rustc/051478957371ee0084a7c0913941d2a8c4757bb9/library/core/src/ptr/const_ptr.rs\00\00\00\ac\00\10\00Q\00\00\00\86\06\00\00\0d\00\00\00src/lib.rs\00\00\10\01\10\00\0a\00\00\00\01\00\00\00\01\00\00\00src/lib.rs\00\00,\01\10\00\0a\00\00\00\01\00\00\00\01\00\00\00unsafe precondition(s) violated: usize::unchecked_mul cannot overflowassertion failed: handle != u32::MAXsrc/lib.rs\00\b1\01\10\00\0a\00\00\00\01\00\00\00\01\00\00\00there is no such thing as an acquire-release load\00\00\00\cc\01\10\001\00\00\00there is no such thing as a release load\08\02\10\00(\00\00\00\00\00\00\00\00\00\00\00/rustc/051478957371ee0084a7c0913941d2a8c4757bb9/library/core/src/sync/atomic.rs\00@\02\10\00O\00\00\00\e5\0c\00\00\18\00\00\00@\02\10\00O\00\00\00\e6\0c\00\00\17\00\00\00/rustc/051478957371ee0084a7c0913941d2a8c4757bb9/library/core/src/iter/adapters/enumerate.rs\00\b0\02\10\00[\00\00\002\00\00\00\09\00\00\00unsafe precondition(s) violated: NonNull::new_unchecked requires that the pointer is non-nullis_aligned_to: align is not a power-of-two\00y\03\10\00*\00\00\00unsafe precondition(s) violated: ptr::read_volatile requires that the pointer argument is aligned and non-null\00\00\00\00\00\00\00\00\00\00/rustc/051478957371ee0084a7c0913941d2a8c4757bb9/library/core/src/ptr/const_ptr.rs\00\00\00$\04\10\00Q\00\00\00\86\06\00\00\0d\00\00\00\00\00\00\00\04\00\00\00\04\00\00\00\01\00\00\00\02\00\00\00\00\00\00\00non-zero old_len requires non-zero new_len!\00\a0\04\10\00+\00\00\00/Users/gbedford/.cargo/registry/src/index.crates.io-6f17d22bba15001f/wit-bindgen-rt-0.30.0/src/lib.rs\00\00\00\d4\04\10\00e\00\00\00F\00\00\00\09\00\00\00\00\00\00\00\00\00\00\00reentrant init\00\00T\05\10\00\0e\00\00\00/rustc/051478957371ee0084a7c0913941d2a8c4757bb9/library/core/src/cell/once.rs\00\00\00l\05\10\00M\00\00\00$\01\00\00B\00\00\00\00\00\00\00\00\00\00\00\04\00\00\00\04\00\00\00\0b\00\00\00internal error: entered unreachable code\0c\00\00\00\0c\00\00\00\04\00\00\00\0d\00\00\00\0e\00\00\00\0f\00\00\00\0c\00\00\00\0c\00\00\00\04\00\00\00\10\00\00\00\11\00\00\00\12\00\00\00\13\00\00\00\0c\00\00\00\04\00\00\00\14\00\00\00\15\00\00\00\16\00\00\00library/std/src/thread/mod.rsfailed to generate unique thread ID: bitspace exhaustedm\06\10\007\00\00\00P\06\10\00\1d\00\00\00\be\04\00\00\0d\00\00\00main\00RUST_BACKTRACE\00\01\00\00\00\00\00\00\00library/std/src/io/mod.rsfailed to write whole buffer\00\00\00\f1\06\10\00\1c\00\00\00\17\00\00\00\00\00\00\00\02\00\00\00\10\07\10\00\d8\06\10\00\19\00\00\00\a9\06\00\00$\00\00\00a formatting trait implementation returned an error when the underlying stream did not\00\008\07\10\00V\00\00\00\d8\06\10\00\19\00\00\004\07\00\00\15\00\00\00library/std/src/panic.rs\a8\07\10\00\18\00\00\00\fc\00\00\00\12\00\00\00fullcannot recursively acquire mutex\d4\07\10\00 \00\00\00library/std/src/sys/sync/mutex/no_threads.rs\fc\07\10\00,\00\00\00\14\00\00\00\09\00\00\00file name contained an unexpected NUL byte\00\008\08\10\00*\00\00\00\14\00\00\00\02\00\00\00d\08\10\00stack backtrace:\0anote: Some details are omitted, run with `RUST_BACKTRACE=full` for a verbose backtrace.\0amemory allocation of  bytes failed\0a\e1\08\10\00\15\00\00\00\f6\08\10\00\0e\00\00\00 bytes failed\00\00\00\e1\08\10\00\15\00\00\00\14\09\10\00\0d\00\00\00library/std/src/alloc.rs4\09\10\00\18\00\00\00b\01\00\00\09\00\00\00library/std/src/panicking.rsBox<dyn Any><unnamed>thread '' panicked at :\0a\0a\00\00\8d\09\10\00\08\00\00\00\95\09\10\00\0e\00\00\00\a3\09\10\00\02\00\00\00\a5\09\10\00\01\00\00\00note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace\0a\00\00\c8\09\10\00N\00\00\00\5c\09\10\00\1c\00\00\00\8b\02\00\00\1e\00\00\00\13\00\00\00\0c\00\00\00\04\00\00\00\17\00\00\00\00\00\00\00\08\00\00\00\04\00\00\00\18\00\00\00\00\00\00\00\08\00\00\00\04\00\00\00\19\00\00\00\1a\00\00\00\1b\00\00\00\10\00\00\00\04\00\00\00\1c\00\00\00\1d\00\00\00\00\00\00\00\00\00\00\00\01\00\00\00\1e\00\00\00\0apanicked after panic::always_abort(), aborting.\0a\00\00\00\01\00\00\00\00\00\00\00\88\0a\10\001\00\00\00\0athread panicked while processing panic. aborting.\0a\00\01\00\00\00\00\00\00\00\cc\0a\10\003\00\00\00thread caused non-unwinding panic. aborting.\0a\00\00\00\10\0b\10\00-\00\00\00fatal runtime error: failed to initiate panic, error \00\00\00H\0b\10\005\00\00\00\a5\09\10\00\01\00\00\00fatal runtime error: rwlock locked for writing\0a\00\90\0b\10\00/\00\00\00/\00LayoutErrorcapacity overflow\00\00\d5\0b\10\00\11\00\00\00library/alloc/src/raw_vec.rs\f0\0b\10\00\1c\00\00\00\19\00\00\00\05\00\00\00library/alloc/src/ffi/c_str.rs\00\00\1c\0c\10\00\1e\00\00\00\1e\01\00\007\00\00\00called `Result::unwrap()` on an `Err` value\00\00\00\00\00\00\00\00\00\01\00\00\00\1f\00\00\00library/alloc/src/sync.rs\00\00\00\88\0c\10\00\19\00\00\00s\01\00\002\00\00\00attempt to add with overflow\b4\0c\10\00\1c\00\00\00attempt to multiply with overflow\00\00\00\d8\0c\10\00!\00\00\00:called `Option::unwrap()` on a `None` value\01\00\00\00\00\00\00\00\04\0d\10\00\01\00\00\00\04\0d\10\00\01\00\00\00panicked at \0a\00\00\00\00\00\00\00\00\00\00\00\01\00\00\00$\00\00\00library/core/src/panicking.rs\00\00\00h\0d\10\00\1d\00\00\00\db\00\00\00\05\00\00\00misaligned pointer dereference: address must be a multiple of  but is \00\00\98\0d\10\00>\00\00\00\d6\0d\10\00\08\00\00\00==!=matchesassertion `left  right` failed\0a  left: \0a right: \00\fb\0d\10\00\10\00\00\00\0b\0e\10\00\17\00\00\00\22\0e\10\00\09\00\00\00 right` failed: \0a  left: \00\00\00\fb\0d\10\00\10\00\00\00D\0e\10\00\10\00\00\00T\0e\10\00\09\00\00\00\22\0e\10\00\09\00\00\00: \00\00\01\00\00\00\00\00\00\00\80\0e\10\00\02\00\00\00library/core/src/fmt/num.rs\00\94\0e\10\00\1b\00\00\00i\00\00\00\17\00\00\000x00010203040506070809101112131415161718192021222324252627282930313233343536373839404142434445464748495051525354555657585960616263646566676869707172737475767778798081828384858687888990919293949596979899falsetruerange start index  out of range for slice of length \00\93\0f\10\00\12\00\00\00\a5\0f\10\00\22\00\00\00")
    (data $.data (;1;) (i32.const 1052632) "\01\00\00\00\ff\ff\ff\ff\c8\0b\10\00")
    (@custom ".debug_abbrev" (after data) "\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\03\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\04/\00I\13\03\0e\00\00\05\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\06.\01n\0e\03\0e:\0b;\0bI\13<\19\00\00\07\05\00I\13\00\00\08.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13\00\00\09\05\00\02\18\03\0e:\0b;\0bI\13\00\00\0a\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\0b\0b\01\11\01\12\06\00\00\0c\05\00\02\181\13\00\00\0d\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\0e4\00\02\181\13\00\00\0f.\01n\0e\03\0e:\0b;\05I\13 \0b\00\00\10\0b\01\00\00\11\05\00\03\0e:\0b;\05I\13\00\00\12.\01n\0e\03\0e:\0b;\05I\13<\19\00\00\13\0f\00I\13\03\0e3\06\00\00\14$\00\03\0e>\0b\0b\0b\00\00\15\13\01\03\0e\0b\0b\88\01\0f\00\00\16\0d\00\03\0eI\13\88\01\0f8\0b\00\00\17\0f\00I\133\06\00\00\18.\01G\13 \0b\00\00\19\05\00\03\0e:\0b;\0bI\13\00\00\1a4\00\03\0e:\0b;\0bI\13\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\03\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\04/\00I\13\03\0e\00\00\05\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\06.\01n\0e\03\0e:\0b;\0bI\13<\19\00\00\07\05\00I\13\00\00\08.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13\00\00\09\05\00\02\18\03\0e:\0b;\0bI\13\00\00\0a\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\0b\0b\01\11\01\12\06\00\00\0c\05\00\02\181\13\00\00\0d\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\0e4\00\02\181\13\00\00\0f.\01n\0e\03\0e:\0b;\05I\13 \0b\00\00\10\0b\01\00\00\11\05\00\03\0e:\0b;\05I\13\00\00\12.\01n\0e\03\0e:\0b;\05I\13<\19\00\00\13\0f\00I\13\03\0e3\06\00\00\14$\00\03\0e>\0b\0b\0b\00\00\15\13\01\03\0e\0b\0b\88\01\0f\00\00\16\0d\00\03\0eI\13\88\01\0f8\0b\00\00\17\0f\00I\133\06\00\00\18.\01G\13 \0b\00\00\19\05\00\03\0e:\0b;\0bI\13\00\00\1a4\00\03\0e:\0b;\0bI\13\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\03\04\01I\13m\19\03\0e\0b\0b\88\01\0f\00\00\04(\00\03\0e\1c\0f\00\00\05\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\06\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\073\01\15\13\00\00\08\0d\00I\13\88\01\0f8\0b4\19\00\00\09\19\01\16\0b\00\00\0a\0d\00\03\0eI\13\88\01\0f8\0b\00\00\0b\13\00\03\0e\0b\0b2\0b\88\01\0f\00\00\0c\19\01\00\00\0d\13\00\03\0e\0b\0b\88\01\0f\00\00\0e.\01n\0e\03\0e:\0b;\05I\13<\19\00\00\0f\05\00I\13\00\00\10/\00I\13\03\0e\00\00\11.\01n\0e\03\0e:\0b;\05I\13 \0b\00\00\12\0b\01\00\00\13\05\00\03\0e:\0b;\05I\13\00\00\14.\01n\0e\03\0e:\0b;\0bI\13 \0b\00\00\15\05\00\03\0e:\0b;\0bI\13\00\00\16.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\17\05\00\02\18\03\0e:\0b;\0bI\13\00\00\18\1d\011\13U\17X\0bY\05W\0b\00\00\19\0b\01U\17\00\00\1a\05\00\02\181\13\00\00\1b\1d\011\13U\17X\0bY\0bW\0b\00\00\1c4\00\02\181\13\00\00\1d\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\1e\0b\01\11\01\12\06\00\00\1f\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00 $\00\03\0e>\0b\0b\0b\00\00!\13\01\03\0e\0b\0b\88\01\0f\00\00\22\0f\00I\133\06\00\00#\0f\00I\13\03\0e3\06\00\00$\15\01I\13\00\00%\01\01I\13\00\00&!\00I\13\22\0d7\0b\00\00'$\00\03\0e\0b\0b>\0b\00\00(.\01G\13 \0b\00\00)4\00\03\0e:\0b;\05I\13\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\034\00\03\0eI\13:\0b;\0b\88\01\0f\02\18n\0e\00\00\04.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13\00\00\05\05\00\02\18\03\0e:\0b;\0bI\13\00\00\06\0b\01\11\01\12\06\00\00\074\00\02\18\03\0e:\0b;\0bI\13\00\00\08\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\09\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\0a/\00I\13\03\0e\00\00\0b\0f\00I\13\03\0e3\06\00\00\0c\15\00\00\00\0d$\00\03\0e>\0b\0b\0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\034\00\03\0eI\13:\0b;\0b\88\01\0f\02\18n\0e\00\00\04\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\05\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\06.\01n\0e\03\0e:\0b;\0bI\13<\19\00\00\07\05\00I\13\00\00\08.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\09\05\00\02\18\03\0e:\0b;\0bI\13\00\00\0a.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13\00\00\0b\1d\001\13\11\01\12\06X\0bY\0bW\0b\00\00\0c\0b\01\11\01\12\06\00\00\0d4\00\02\18\03\0e:\0b;\0bI\13\00\00\0e\0b\01U\17\00\00\0f\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\10\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\114\00\02\181\13\00\00\12\05\00\02\181\13\00\00\13/\00I\13\03\0e\00\00\14\0f\00I\13\03\0e3\06\00\00\15\15\00\00\00\16\04\01I\13m\19\03\0e\0b\0b\88\01\0f\00\00\17(\00\03\0e\1c\0f\00\00\18.\01n\0e\03\0e:\0b;\05I\13 \0b\00\00\19\0b\01\00\00\1a4\00\03\0e:\0b;\05I\13\00\00\1b.\01n\0e\03\0e:\0b;\0bI\13 \0b\00\00\1c4\00\03\0e:\0b;\0bI\13\00\00\1d\05\00\03\0e:\0b;\05I\13\00\00\1e\17\01\03\0e\0b\0b\88\01\0f\00\00\1f\0d\00\03\0eI\13\88\01\0f8\0b\00\00 .\01n\0e\03\0e:\0b;\05I\13<\19\00\00!$\00\03\0e>\0b\0b\0b\00\00\22.\01\11\01\12\06@\18G\13\00\00#.\01G\13 \0b\00\00$\13\00\03\0e\0b\0b2\0b\88\01\0f\00\00%\13\01\03\0e\0b\0b\88\01\0f\00\00&\0f\00I\133\06\00\00'\01\01I\13\00\00(!\00I\13\22\0d7\0b\00\00)$\00\03\0e\0b\0b>\0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\034\00\03\0eI\13:\0b;\0b\88\01\0f\02\18n\0e\00\00\04.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13\00\00\05\05\00\02\18\03\0e:\0b;\0bI\13\00\00\06\0b\01\11\01\12\06\00\00\074\00\02\18\03\0e:\0b;\0bI\13\00\00\08\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\09\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\0a/\00I\13\03\0e\00\00\0b\0f\00I\13\03\0e3\06\00\00\0c\15\00\00\00\0d$\00\03\0e>\0b\0b\0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\034\00\03\0eI\13:\0b;\0b\88\01\0f\02\18n\0e\00\00\04\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\05\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\06.\01n\0e\03\0e:\0b;\0bI\13<\19\00\00\07\05\00I\13\00\00\08.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\09\05\00\02\18\03\0e:\0b;\0bI\13\00\00\0a.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13\00\00\0b\1d\001\13\11\01\12\06X\0bY\0bW\0b\00\00\0c\0b\01\11\01\12\06\00\00\0d4\00\02\18\03\0e:\0b;\0bI\13\00\00\0e\0b\01U\17\00\00\0f\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\10\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\114\00\02\181\13\00\00\12\05\00\02\181\13\00\00\13/\00I\13\03\0e\00\00\14\0f\00I\13\03\0e3\06\00\00\15\15\00\00\00\16\04\01I\13m\19\03\0e\0b\0b\88\01\0f\00\00\17(\00\03\0e\1c\0f\00\00\18.\01n\0e\03\0e:\0b;\05I\13 \0b\00\00\19\0b\01\00\00\1a4\00\03\0e:\0b;\05I\13\00\00\1b.\01n\0e\03\0e:\0b;\0bI\13 \0b\00\00\1c4\00\03\0e:\0b;\0bI\13\00\00\1d\05\00\03\0e:\0b;\05I\13\00\00\1e\17\01\03\0e\0b\0b\88\01\0f\00\00\1f\0d\00\03\0eI\13\88\01\0f8\0b\00\00 .\01n\0e\03\0e:\0b;\05I\13<\19\00\00!$\00\03\0e>\0b\0b\0b\00\00\22.\01\11\01\12\06@\18G\13\00\00#.\01G\13 \0b\00\00$\13\00\03\0e\0b\0b2\0b\88\01\0f\00\00%\13\01\03\0e\0b\0b\88\01\0f\00\00&\0f\00I\133\06\00\00'\01\01I\13\00\00(!\00I\13\22\0d7\0b\00\00)$\00\03\0e\0b\0b>\0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\03.\01n\0e\03\0e:\0b;\05I\13 \0b\00\00\04\0b\01\00\00\05\05\00\03\0e:\0b;\05I\13\00\00\064\00\03\0e:\0b;\05I\13\00\00\07.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\08\05\00\02\18\03\0e:\0b;\0bI\13\00\00\09\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\0a\0b\01\11\01\12\06\00\00\0b\05\00\02\181\13\00\00\0c\13\01\03\0e\0b\0b\88\01\0f\00\00\0d\0d\00\03\0eI\13\88\01\0f8\0b\00\00\0e$\00\03\0e>\0b\0b\0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03\04\01I\13m\19\03\0e\0b\0b\88\01\0f\00\00\04(\00\03\0e\1c\0f\00\00\05\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\06\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\07.\01n\0e\03\0e:\0b;\05I\13<\19\00\00\08\05\00I\13\00\00\09/\00I\13\03\0e\00\00\0a$\00\03\0e>\0b\0b\0b\00\00\0b.\01\11\01\12\06@\18G\13\00\00\0c\05\00\02\18\03\0e:\0b;\05I\13\00\00\0d\0f\00I\13\03\0e3\06\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03\04\01I\13m\19\03\0e\0b\0b\88\01\0f\00\00\04(\00\03\0e\1c\0f\00\00\05\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\06\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\07.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05\00\00\08\05\00\02\18:\0b;\05I\13\00\00\09/\00I\13\03\0e\00\00\0a.\01n\0e\03\0e:\0b;\0bI\13<\19\00\00\0b\05\00I\13\00\00\0c.\01n\0e\03\0e:\0b;\05I\13<\19\00\00\0d$\00\03\0e>\0b\0b\0b\00\00\0e\05\00\02\18\03\0e:\0b;\05I\13\00\00\0f\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\10\0b\01\11\01\12\06\00\00\11\05\00\02\181\13\00\00\124\00\02\181\13\00\00\13\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\14\13\00\03\0e\0b\0b2\0b\88\01\0f\00\00\154\00\02\18\03\0e:\0b;\05I\13\00\00\16\0f\00I\13\03\0e3\06\00\00\17.\01G\13 \0b\00\00\18\0b\01\00\00\19\05\00\03\0e:\0b;\05I\13\00\00\1a4\00\03\0e:\0b;\0bI\13\00\00\1b.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\1c\05\00\02\18\03\0e:\0b;\0bI\13\00\00\1d4\00\02\18\03\0e:\0b;\0bI\13\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03\04\01I\13m\19\03\0e\0b\0b\88\01\0f\00\00\04(\00\03\0e\1c\0f\00\00\05\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\06\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\07/\00I\13\03\0e\00\00\08.\01n\0e\03\0e:\0b;\05I\13<\19\00\00\09\05\00I\13\00\00\0a.\01n\0e\03\0e:\0b;\0bI\13<\19\00\00\0b.\01n\0e\03\0e:\0b;\05I\13 \0b\00\00\0c\0b\01\00\00\0d\05\00\03\0e:\0b;\05I\13\00\00\0e3\01\15\13\00\00\0f\0d\00I\13\88\01\0f8\0b4\19\00\00\10\19\01\16\0b\00\00\11\0d\00\03\0eI\13\88\01\0f8\0b\00\00\12\19\01\00\00\13$\00\03\0e>\0b\0b\0b\00\00\14.\01G\13 \0b\00\00\15\05\00\03\0e:\0b;\0bI\13\00\00\16\0f\00I\13\03\0e3\06\00\00\174\00\03\0e:\0b;\0bI\13\00\00\18\13\00\03\0e\0b\0b2\0b\88\01\0f\00\00\19\13\01\03\0e\0b\0b\88\01\0f\00\00\1a.\01\11\01\12\06@\18G\13\00\00\1b\05\00\02\18\03\0e:\0b;\05I\13\00\00\1c\1d\001\13\11\01\12\06X\0bY\05W\0b\00\00\1d\0b\01U\17\00\00\1e4\00\02\18\03\0e:\0b;\05I\13\00\00\1f\1d\011\13U\17X\0bY\05W\0b\00\00 \05\00\02\181\13\00\00!\0b\01\11\01\12\06\00\00\22\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00#4\00\02\181\13\00\00$\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\04/\00I\13\03\0e\00\00\05\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\06.\01n\0e\03\0e:\0b;\0bI\13<\19\00\00\07\05\00I\13\00\00\08.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05I\13\00\00\09\05\00\02\18\03\0e:\0b;\05I\13\00\00\0a\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\0b\0b\01\11\01\12\06\00\00\0c\05\00\02\181\13\00\00\0d.\01n\0e\03\0e:\0b;\05I\13 \0b\00\00\0e\0b\01\00\00\0f\05\00\03\0e:\0b;\05I\13\00\00\10.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13\00\00\11\05\00\02\18\03\0e:\0b;\0bI\13\00\00\124\00\02\18\03\0e:\0b;\0bI\13\00\00\13\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\144\00\02\181\13\00\00\15.\01n\0e\03\0e:\0b;\05I\13<\19\00\00\16.\01n\0e\03\0e:\0b;\0bI\13 \0b\00\00\17\05\00\03\0e:\0b;\0bI\13\00\00\183\01\15\13\00\00\19\0d\00I\13\88\01\0f8\0b4\19\00\00\1a\19\01\16\0b\00\00\1b\0d\00\03\0eI\13\88\01\0f8\0b\00\00\1c\19\01\00\00\1d\0f\00I\13\03\0e3\06\00\00\1e$\00\03\0e>\0b\0b\0b\00\00\1f.\01G\13 \0b\00\00 4\00\03\0e:\0b;\0bI\13\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\04/\00I\13\03\0e\00\00\05\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\06.\01n\0e\03\0e:\0b;\0bI\13<\19\00\00\07\05\00I\13\00\00\08.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13\00\00\09\05\00\02\18\03\0e:\0b;\0bI\13\00\00\0a$\00\03\0e>\0b\0b\0b\00\00\0b.\01\11\01\12\06@\18G\13\00\00\0c\0f\00I\13\03\0e3\06\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\03\04\01I\13m\19\03\0e\0b\0b\88\01\0f\00\00\04(\00\03\0e\1c\0f\00\00\05.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05I\13\00\00\06\05\00\02\18\03\0e:\0b;\05I\13\00\00\07\1d\011\13U\17X\0bY\0bW\0b\00\00\08\0b\01U\17\00\00\094\00\02\181\13\00\00\0a/\00I\13\03\0e\00\00\0b\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\0c\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\0d3\01\15\13\00\00\0e\0d\00I\13\88\01\0f8\0b4\19\00\00\0f\19\01\16\0b\00\00\10\0d\00\03\0eI\13\88\01\0f8\0b\00\00\11\13\00\03\0e\0b\0b2\0b\88\01\0f\00\00\12\19\01\00\00\13\13\00\03\0e\0b\0b\88\01\0f\00\00\14.\01n\0e\03\0e:\0b;\05I\13<\19\00\00\15\05\00I\13\00\00\16$\00\03\0e>\0b\0b\0b\00\00\17\13\01\03\0e\0b\0b\88\01\0f\00\00\18\0f\00I\133\06\00\00\19\0f\00I\13\03\0e3\06\00\00\1a\15\01I\13\00\00\1b\01\01I\13\00\00\1c!\00I\13\22\0d7\0b\00\00\1d$\00\03\0e\0b\0b>\0b\00\00\1e.\01G\13 \0b\00\00\1f\0b\01\00\00 4\00\03\0e:\0b;\05I\13\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\034\00\03\0eI\13:\0b;\0b\88\01\0f\02\18n\0e\00\00\04.\00\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\05.\00\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\00\00\06\01\01I\13\00\00\07!\00I\13\22\0d7\05\00\00\08$\00\03\0e>\0b\0b\0b\00\00\09$\00\03\0e\0b\0b>\0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\03.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\04/\00I\13\03\0e\00\00\05\13\00\03\0e\0b\0b2\0b\88\01\0f\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\03\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\04/\00I\13\03\0e\00\00\05\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\06.\01n\0e\03\0e:\0b;\05I\13<\19\00\00\07\05\00I\13\00\00\08\13\00\03\0e\0b\0b2\0b\88\01\0f\00\00\09$\00\03\0e>\0b\0b\0b\00\00\0a\0f\00I\13\03\0e3\06\00\00\0b.\01G\13 \0b\00\00\0c\0b\01\00\00\0d\05\00\03\0e:\0b;\05I\13\00\00\0e4\00\03\0e:\0b;\05I\13\00\00\0f.\01\11\01\12\06@\18G\13\00\00\10\05\00\02\18\03\0e:\0b;\05I\13\00\00\11\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\12\0b\01\11\01\12\06\00\00\13\05\00\02\181\13\00\00\144\00\02\181\13\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03\04\01I\13m\19\03\0e\0b\0b\88\01\0f\00\00\04(\00\03\0e\1c\0f\00\00\05\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\06\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\07.\01n\0e\03\0e:\0b;\0bI\13<\19\00\00\08\05\00I\13\00\00\09$\00\03\0e>\0b\0b\0b\00\00\0a.\01\11\01\12\06@\18G\13\00\00\0b\05\00\02\18\03\0e:\0b;\0bI\13\00\00\0c\0f\00I\13\03\0e3\06\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03\04\01I\13m\19\03\0e\0b\0b\88\01\0f\00\00\04(\00\03\0e\1c\0f\00\00\05\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\06\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\07.\01n\0e\03\0e:\0b;\0bI\13<\19\00\00\08\05\00I\13\00\00\09.\01n\0e\03\0e:\0b;\05I\13 \0b\00\00\0a/\00I\13\03\0e\00\00\0b\0b\01\00\00\0c4\00\03\0e:\0b;\05I\13\00\00\0d.\01n\0e\03\0e:\0b;\05I\13<\19\00\00\0e$\00\03\0e>\0b\0b\0b\00\00\0f\0f\00I\13\03\0e3\06\00\00\10.\01G\13 \0b\00\00\11\05\00\03\0e:\0b;\0bI\13\00\00\12.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13\00\00\13\05\00\02\18\03\0e:\0b;\0bI\13\00\00\14\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\15\0b\01\11\01\12\06\00\00\164\00\02\181\13\00\00\17\05\00\02\181\13\00\00\18.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\19.\01n\0e\03\0e:\0b;\0b \0b\00\00\1a\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\1b\13\00\03\0e\0b\0b2\0b\88\01\0f\00\00\1c\05\00\03\0e:\0b;\05I\13\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03.\01n\0e\03\0e:\0b;\05I\13 \0b\00\00\04/\00I\13\03\0e\00\00\05\0b\01\00\00\064\00\03\0e:\0b;\05I\13\00\00\07\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\083\01\15\13\00\00\09\0d\00I\13\88\01\0f8\0b4\19\00\00\0a\19\01\16\0b\00\00\0b\0d\00\03\0eI\13\88\01\0f8\0b\00\00\0c\19\01\00\00\0d\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\0e3\01\00\00\0f\05\00\03\0e:\0b;\05I\13\00\00\103\00\00\00\11.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13\00\00\12\05\00\02\18\03\0e:\0b;\0bI\13\00\00\13\0b\01U\17\00\00\144\00\02\18\03\0e:\0b;\0bI\13\00\00\15\1d\011\13U\17X\0bY\0bW\0b\00\00\164\00\02\181\13\00\00\17\05\00\02\181\13\00\00\18\0b\01\11\01\12\06\00\00\19.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05I\13\00\00\1a\05\00\02\18\03\0e:\0b;\05I\13\00\00\1b\13\01\03\0e\0b\0b\88\01\0f\00\00\1c$\00\03\0e>\0b\0b\0b\00\00\1d\0f\00I\13\03\0e3\06\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\03.\01n\0e\03\0e:\0b;\0bI\13 \0b\00\00\04/\00I\13\03\0e\00\00\05\0b\01\00\00\06\05\00\03\0e:\0b;\0bI\13\00\00\07.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\08\05\00\02\18\03\0e:\0b;\0bI\13\00\00\09\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\0a\0b\01\11\01\12\06\00\00\0b\05\00\02\181\13\00\00\0c$\00\03\0e>\0b\0b\0b\00\00\0d\0f\00I\13\03\0e3\06\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13\00\00\04\05\00\02\18\03\0e:\0b;\0bI\13\00\00\05.\00\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\06$\00\03\0e>\0b\0b\0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\024\00\03\0eI\13\02\18\00\00\03\13\01\1d\13\03\0e\0b\0b\88\01\0f\00\00\04\0d\00\03\0eI\13\88\01\0f8\0b\00\00\05\0f\00I\13\03\0e3\06\00\00\06$\00\03\0e>\0b\0b\0b\00\00\079\01\03\0e\00\00\08\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\09\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\0a.\01n\0e\03\0e:\0b;\05I\13<\19\00\00\0b\05\00I\13\00\00\0c.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05I\13\00\00\0d\05\00\02\18\03\0e:\0b;\05I\13\00\00\0e/\00I\13\03\0e\00\00\0f.\01n\0e\03\0e:\0b;\05I\13 \0b\00\00\10\0b\01\00\00\11\05\00\03\0e:\0b;\05I\13\00\00\12\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\13\0b\01\11\01\12\06\00\00\14\05\00\02\181\13\00\00\154\00\02\181\13\00\00\16\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\17.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05\00\00\18\13\00\03\0e\0b\0b2\0b\88\01\0f\00\00\19.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\1a\05\00\02\18\03\0e:\0b;\0bI\13\00\00\1b.\01n\0e\03\0e:\0b;\0b \0b\00\00\1c\05\00\03\0e:\0b;\0bI\13\00\00\1d4\00\02\18\03\0e:\0b;\05I\13\00\00\1e.\01n\0e\03\0e:\0b;\0bI\13<\19\00\00\1f\04\01I\13m\19\03\0e\0b\0b\88\01\0f\00\00 (\00\03\0e\1c\0f\00\00!.\01n\0e\03\0e:\0b;\0bI\13 \0b\00\00\22\05\00\02\18:\0b;\05I\13\00\00#.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13\00\00$3\01\15\13\00\00%\0d\00I\13\88\01\0f8\0b4\19\00\00&\19\01\16\0b\00\00'\19\01\16\06\00\00(\19\01\00\00)\13\00\03\0e\0b\0b\88\01\0f\00\00*4\00\02\18\03\0e:\0b;\0bI\13\00\00+\1d\011\13U\17X\0bY\0bW\0b\00\00,\0b\01U\17\00\00-4\00\03\0e:\0b;\05I\13\00\00.4\00\03\0e:\0b;\0bI\13\00\00/\13\01\03\0e\0b\0b\88\01\0f\00\000\0f\00I\133\06\00\001.\01G\13 \0b\00\002\01\01I\13\00\003!\00I\13\22\0d7\0b\00\004$\00\03\0e\0b\0b>\0b\00\005.\01\11\01\12\06@\18G\13\00\006\15\01I\13\00\007\1d\001\13\11\01\12\06X\0bY\05W\0b\00\008\1d\011\13U\17X\0bY\05W\0b\00\009.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\00\00:.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13?\19\00\00;.\00\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\024\00\03\0eI\13\02\18\00\00\03\13\01\1d\13\03\0e\0b\0b\88\01\0f\00\00\04\0d\00\03\0eI\13\88\01\0f8\0b\00\00\05\0f\00I\13\03\0e3\06\00\00\06$\00\03\0e>\0b\0b\0b\00\00\079\01\03\0e\00\00\084\00\03\0eI\13?\19:\0b;\0b\88\01\0f\02\18n\0e\00\00\094\00\03\0eI\13:\0b;\0b\88\01\0f\02\18n\0e\00\00\0a.\01\11\01\12\06@\18\03\0e:\0b;\0bI\13?\19\00\00\0b\05\00\02\18\03\0e:\0b;\0bI\13\00\00\0c.\00\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\00\00\0d.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13?\19\00\00\0e\0b\01\11\01\12\06\00\00\0f4\00\02\18\03\0e:\0b;\0bI\13\00\00\10\0b\01U\17\00\00\11\15\01I\13\00\00\12\05\00I\13\00\00\13\04\01I\13m\19\03\0e\0b\0b\88\01\0f\00\00\14(\00\03\0e\1c\0f\00\00\15\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\16\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\173\01\15\13\00\00\18\0d\00I\13\88\01\0f8\0b4\19\00\00\19\19\01\16\0b\00\00\1a\13\00\03\0e\0b\0b2\0b\88\01\0f\00\00\1b\19\01\00\00\1c\13\00\03\0e\0b\0b\88\01\0f\00\00\1d.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05I\13\00\00\1e\05\00\02\18\03\0e:\0b;\05I\13\00\00\1f/\00I\13\03\0e\00\00 .\01n\0e\03\0e:\0b;\05I\13<\19\00\00!.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0bI\13\00\00\22\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00#\05\00\02\181\13\00\00$.\01n\0e\03\0e:\0b;\0bI\13<\19\00\00%.\01n\0e\03\0e:\0b;\05I\13 \0b\00\00&\0b\01\00\00'\05\00\03\0e:\0b;\05I\13\00\00(.\01n\0e\03\0e:\0b;\0bI\13 \0b\00\00)\05\00\03\0e:\0b;\0bI\13\00\00*.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00+\1d\011\13U\17X\0bY\05W\0b\00\00,\1d\011\13U\17X\0bY\0bW\0b\00\00-4\00\02\181\13\00\00.\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00/.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05\00\000\05\00\02\18:\0b;\05I\13\00\0014\00\03\0e:\0b;\05I\13\00\002.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05\87\01\19\00\003\13\01\03\0e\0b\0b\88\01\0f\00\004\0f\00I\133\06\00\005\01\01I\13\00\006!\00I\13\22\0d7\0b\00\007$\00\03\0e\0b\0b>\0b\00\008.\01G\13 \0b\00\009.\01\11\01\12\06@\18G\13\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03\04\01I\13m\19\03\0e\0b\0b\88\01\0f\00\00\04(\00\03\0e\1c\0f\00\00\05\13\01\03\0e\0b\0b2\0b\88\01\0f\00\00\06\0d\00\03\0eI\13\88\01\0f8\0b2\0b\00\00\073\01\15\13\00\00\08\0d\00I\13\88\01\0f8\0b4\19\00\00\09\19\01\16\0b\00\00\0a\0d\00\03\0eI\13\88\01\0f8\0b\00\00\0b\13\00\03\0e\0b\0b2\0b\88\01\0f\00\00\0c\19\01\00\00\0d\13\00\03\0e\0b\0b\88\01\0f\00\00\0e.\01n\0e\03\0e:\0b;\05I\13<\19\00\00\0f\05\00I\13\00\00\10.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05I\13\00\00\11\05\00\02\18\03\0e:\0b;\05I\13\00\00\12\0b\01\11\01\12\06\00\00\134\00\02\18\03\0e:\0b;\05I\13\00\00\14/\00I\13\03\0e\00\00\153\01\00\00\163\00\00\00\17$\00\03\0e>\0b\0b\0b\00\00\18\13\01\03\0e\0b\0b\88\01\0f\00\00\19\0f\00I\133\06\00\00\1a\0f\00I\13\03\0e3\06\00\00\1b\15\01I\13\00\00\1c\01\01I\13\00\00\1d!\00I\13\22\0d7\0b\00\00\1e$\00\03\0e\0b\0b>\0b\00\00\1f.\01G\13 \0b\00\00 \0b\01\00\00!\05\00\03\0e:\0b;\05I\13\00\00\224\00\03\0e:\0b;\05I\13\00\00#.\01\11\01\12\06@\18G\13\00\00$\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00%\05\00\02\181\13\00\00&4\00\02\181\13\00\00'.\00n\0e\03\0e:\0b;\05I\13<\19?\19\00\00(.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05I\13?\19\00\00)\0b\01U\17\00\00*\05\00\02\18:\0b;\05I\13\00\00+4\00\02\18\03\0e\88\01\0f:\0b;\05I\13\00\00,.\00\11\01\12\06@\18G\13\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03.\00n\0e\03\0e:\0b;\0b \0b\00\00\04.\00n\0e\03\0e:\0b;\05 \0b\00\00\05.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05\00\00\06\1d\011\13U\17X\0bY\05W\0b\00\00\07\1d\011\13U\17X\0bY\0bW\0b\00\00\08\1d\001\13\11\01\12\06X\0bY\0bW\0b\00\00\09\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\0a\1d\001\13\11\01\12\06X\0bY\05W\0b\00\00\0b\1d\001\13U\17X\0bY\05W\0b\00\00\0c\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\0d.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\0e\1d\001\13U\17X\0bY\0bW\0b\00\00\0f\1d\011\13U\17X\0bY\0b\00\00\10\1d\011\13\11\01\12\06X\0bY\0b\00\00\11.\01\11\01\12\06@\181\13\00\00\12\1d\001\13\11\01\12\06X\0bY\0b\00\00\13\1d\001\13U\17X\0bY\0b\00\00\14.\00\11\01\12\06@\18n\0e\03\0e:\0b;\05\00\00\15.\00\11\01\12\06@\181\13\00\00\16.\00\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\17.\00\11\01\12\06@\18n\0e\03\0e:\0b;\056\0b\87\01\19\00\00\18.\00n\0e\03\0e:\0b;\05?\19 \0b\00\00\19.\00\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\00\00\1a.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\00\00\1b.\00\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\00\00\1c.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\00\00\1d.\00n\0e\03\0e:\0b;\0b?\19 \0b\00\00\1e.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\87\01\19\00\00\1f.\00\11\01\12\06@\18n\0e\03\0e:\0b;\05\87\01\19\00\00 .\00\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\87\01\19\00\00!.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b6\0b\00\00\22.\00\11\01\12\06@\18\03\0e:\0b;\0b?\19\00\00#.\01\11\01\12\06@\18n\0e\03\0e:\0b;\056\0b\00\00$.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05\87\01\19\00\00%.\01\11\01\12\06@\18\03\0e:\0b;\0b?\19\87\01\19\00\00&.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\87\01\19\00\00'.\01\11\01\12\06@\18\03\0e:\0b;\05?\19\87\01\19\00\00(.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\87\01\19\00\00).\00\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\87\01\19\00\00*.\01\11\01\12\06@\18\03\0e:\0b;\05?\19\00\00+.\00\11\01\12\06@\18\03\0e:\0b;\05?\19\87\01\19\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03.\00\11\01\12\06@\18\03\0e:\0b;\0b?\19\00\00\04.\00n\0e\03\0e:\0b;\0b\87\01\19 \0b\00\00\05.\01\11\01\12\06@\18\03\0e:\0b;\0b?\19\00\00\06\1d\001\13\11\01\12\06X\0bY\0bW\0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03.\00\11\01\12\06@\18n\0e\03\0e:\0b;\05\00\00\04.\00n\0e\03\0e:\0b;\05 \0b\00\00\05.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\06\1d\001\13\11\01\12\06X\0bY\0bW\0b\00\00\07.\00n\0e\03\0e:\0b;\0b \0b\00\00\08.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\00\00\09\1d\001\13U\17X\0bY\0bW\0b\00\00\0a.\00\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\00\00\0b.\00\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\00\00\0c.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\00\00\0d\1d\001\13U\17X\0bY\05W\0b\00\00\0e\1d\001\13\11\01\12\06X\0bY\05W\0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03.\00\11\01\12\06@\18n\0e\03\0e:\0b;\05\00\00\04.\00n\0e\03\0e:\0b;\0b \0b\00\00\05.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\06\1d\001\13\11\01\12\06X\0bY\0bW\0b\00\00\07.\00\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\08.\00n\0e\03\0e:\0b;\05 \0b\00\00\09.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05\00\00\0a\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\0b\1d\011\13U\17X\0bY\05W\0b\00\00\0c\1d\001\13\11\01\12\06X\0bY\05W\0b\00\00\0d.\01\11\01\12\06@\181\13\00\00\0e.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\00\00\0f.\00\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\00\00\10\1d\001\13U\17X\0bY\05W\0b\00\00\11.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\87\01\19\00\00\12\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\13.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\87\01\19\00\00\14.\00n\0e\03\0e:\0b;\05\87\01\19 \0b\00\00\15.\01\11\01\12\06@\18\03\0e:\0b;\05?\19\87\01\19\00\00\16\1d\001\13U\17X\0bY\0bW\0b\00\00\17.\00\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\00\00\18.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\00\00\19.\00n\0e\03\0e:\0b;\05?\19 \0b\00\00\1a\1d\011\13U\17X\0bY\0bW\0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03.\00n\0e\03\0e:\0b;\05 \0b\00\00\04.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\00\00\05\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\06\1d\001\13\11\01\12\06X\0bY\05W\0b\00\00\07\1d\001\13U\17X\0bY\0bW\0b\00\00\08\1d\001\13U\17X\0bY\05W\0b\00\00\09.\00n\0e\03\0e:\0b;\05?\19 \0b\00\00\0a.\00\11\01\12\06@\181\13\00\00\0b\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\0c\1d\001\13\11\01\12\06X\0bY\0bW\0b\00\00\0d\1d\011\13U\17X\0bY\0bW\0b\00\00\0e\1d\011\13U\17X\0bY\05W\0b\00\00\0f.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05\00\00\10.\01\11\01\12\06@\181\13\00\00\11.\00n\0e\03\0e:\0b;\0b \0b\00\00\12.\00n\0e\03\0e:\0b;\0b?\19 \0b\00\00\13.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\00\00\14.\00\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\00\00\15.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\16\1d\001\13\11\01\12\06X\0bY\0b\00\00\17.\00\11\01\12\06@\18n\0e\03\0e:\0b;\05\00\00\18\1d\011\13U\17X\0bY\0b\00\00\19.\00\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\00\00\1a.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\87\01\19\00\00\1b.\01\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\87\01\19\00\00\1c.\00n\0e\03\0e:\0b;\0b\87\01\19 \0b\00\00\1d.\00\11\01\12\06@\18n\0e\03\0e:\0b;\0b?\19\87\01\19\00\00\1e.\00\11\01\12\06@\18n\0e\03\0e:\0b;\05?\19\87\01\19\00\00\1f.\00\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00 .\00n\0e\03\0e:\0b;\056\0b \0b\00\00!.\00n\0e\03\0e:\0b;\0b6\0b \0b\00\00\22.\00n\0e\03\0e:\0b;\05\87\01\19 \0b\00\00#.\00\11\01\12\06@\18n\0e\03\0e:\0b;\056\0b\87\01\19\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01U\17\00\00\029\01\03\0e\00\00\03.\00n\0e\03\0e:\0b;\0b \0b\00\00\04.\00n\0e\03\0e:\0b;\05 \0b\00\00\05.\01\11\01\12\06@\18n\0e\03\0e:\0b;\0b\00\00\06\1d\001\13\11\01\12\06X\0bY\0bW\0b\00\00\07\1d\011\13\11\01\12\06X\0bY\0bW\0b\00\00\08\1d\011\13\11\01\12\06X\0bY\0b\00\00\09\1d\011\13\11\01\12\06X\0bY\05W\0b\00\00\0a\1d\001\13\11\01\12\06X\0bY\05W\0b\00\00\0b\1d\011\13U\17X\0bY\05W\0b\00\00\0c\1d\001\13U\17X\0bY\05W\0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\03.\01\11\01\12\06@\18\03\0e:\0b;\05?\19\00\00\04\1d\001\10\11\01\12\06X\0bY\05W\0b\00\00\05\11\01%\0e\13\05\03\0e\10\17\1b\0e\00\00\06.\00n\0e\03\0e:\0b;\05?\19 \0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\03.\01\11\01\12\06@\18\03\0e:\0b;\05?\19\00\00\04\1d\011\10\11\01\12\06X\0bY\05W\0b\00\00\05\1d\011\10\11\01\12\06X\0bY\0bW\0b\00\00\06\1d\001\10\11\01\12\06X\0bY\0bW\0b\00\00\07\1d\001\10U\17X\0bY\0bW\0b\00\00\08\1d\011\10U\17X\0bY\0bW\0b\00\00\09\1d\001\10U\17X\0bY\05W\0b\00\00\0a\1d\001\10\11\01\12\06X\0bY\05W\0b\00\00\0b\11\01%\0e\13\05\03\0e\10\17\1b\0e\00\00\0c.\00n\0e\03\0e:\0b;\0b \0b\00\00\0d.\00n\0e\03\0e:\0b;\05?\19 \0b\00\00\0e.\00n\0e\03\0e:\0b;\05 \0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\03.\01\11\01\12\06@\18\03\0e:\0b;\05?\19\00\00\04\1d\011\10\11\01\12\06X\0bY\05W\0b\00\00\05\1d\011\10\11\01\12\06X\0bY\0bW\0b\00\00\06\1d\011\10U\17X\0bY\0bW\0b\00\00\07\1d\001\10U\17X\0bY\05W\0b\00\00\08\1d\001\10\11\01\12\06X\0bY\05W\0b\00\00\09\1d\001\10\11\01\12\06X\0bY\0bW\0b\00\00\0a\11\01%\0e\13\05\03\0e\10\17\1b\0e\00\00\0b.\00n\0e\03\0e:\0b;\0b \0b\00\00\0c.\00n\0e\03\0e:\0b;\05?\19 \0b\00\00\0d.\00n\0e\03\0e:\0b;\05 \0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\03.\01\11\01\12\06@\18\03\0e:\0b;\05?\19\00\00\04\1d\011\10U\17X\0bY\05W\0b\00\00\05\1d\011\10U\17X\0bY\0bW\0b\00\00\06\1d\011\10\11\01\12\06X\0bY\0bW\0b\00\00\07\1d\001\10\11\01\12\06X\0bY\05W\0b\00\00\08\1d\001\10\11\01\12\06X\0bY\0bW\0b\00\00\09\1d\001\10U\17X\0bY\0bW\0b\00\00\0a\11\01%\0e\13\05\03\0e\10\17\1b\0e\00\00\0b.\00n\0e\03\0e:\0b;\05 \0b\00\00\0c.\00n\0e\03\0e:\0b;\0b \0b\00\00\0d.\00n\0e\03\0e:\0b;\05?\19 \0b\00\00\00\01\11\01%\0e\13\05\03\0e\10\17\1b\0e\11\01\12\06\00\00\029\01\03\0e\00\00\03.\01\11\01\12\06@\18\03\0e:\0b;\05?\19\00\00\04\1d\001\10\11\01\12\06X\0bY\05W\0b\00\00\05\11\01%\0e\13\05\03\0e\10\17\1b\0e\00\00\06.\00n\0e\03\0e:\0b;\05?\19 \0b\00\00\00")
    (@producers
      (language "Rust" "")
      (processed-by "rustc" "1.80.0 (051478957 2024-07-21)")
      (processed-by "clang" "18.1.2 (https://github.com/llvm/llvm-project 26a1d6601d727a96f4301d0d8647b5a42760ae0c)")
      (processed-by "wit-component" "0.215.0")
      (processed-by "wit-bindgen-rust" "0.30.0")
    )
    (@custom "target_features" (after data) "\03+\0bbulk-memory+\0fmutable-globals+\08sign-ext")
  )
  (core module (;1;)
    (type (;0;) (func (param i32)))
    (type (;1;) (func (param i32 i32)))
    (type (;2;) (func (param i32 i64 i32)))
    (type (;3;) (func (param i32 i32 i32 i32)))
    (type (;4;) (func (param i32 i32 i32 i32 i32)))
    (type (;5;) (func (param i32) (result i32)))
    (type (;6;) (func (param i32 i32 i32)))
    (type (;7;) (func (param i32 i32 i32 i32) (result i32)))
    (type (;8;) (func (result i32)))
    (type (;9;) (func (param i32 i32 i32) (result i32)))
    (type (;10;) (func (param i32 i32) (result i32)))
    (type (;11;) (func))
    (import "env" "memory" (memory (;0;) 0))
    (import "wasi:cli/environment@0.2.0" "get-environment" (func $_ZN22wasi_snapshot_preview124wasi_cli_get_environment17h55a6394b4942a991E (;0;) (type 0)))
    (import "wasi:filesystem/types@0.2.0" "[resource-drop]descriptor" (func $_ZN141_$LT$wasi_snapshot_preview1..bindings..wasi..filesystem..types..Descriptor$u20$as$u20$wasi_snapshot_preview1..bindings.._rt..WasmResource$GT$4drop4drop17h31ffd118310deae5E (;1;) (type 0)))
    (import "wasi:io/streams@0.2.0" "[resource-drop]output-stream" (func $_ZN137_$LT$wasi_snapshot_preview1..bindings..wasi..io..streams..OutputStream$u20$as$u20$wasi_snapshot_preview1..bindings.._rt..WasmResource$GT$4drop4drop17h4b0769f161058092E (;2;) (type 0)))
    (import "wasi:filesystem/types@0.2.0" "filesystem-error-code" (func $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types21filesystem_error_code10wit_import17h24cde18722b8d767E (;3;) (type 1)))
    (import "wasi:io/error@0.2.0" "[resource-drop]error" (func $_ZN128_$LT$wasi_snapshot_preview1..bindings..wasi..io..error..Error$u20$as$u20$wasi_snapshot_preview1..bindings.._rt..WasmResource$GT$4drop4drop17hfde71e25f37a363aE (;4;) (type 0)))
    (import "wasi:io/streams@0.2.0" "[resource-drop]input-stream" (func $_ZN136_$LT$wasi_snapshot_preview1..bindings..wasi..io..streams..InputStream$u20$as$u20$wasi_snapshot_preview1..bindings.._rt..WasmResource$GT$4drop4drop17h5d2d95a8dfb4abeeE (;5;) (type 0)))
    (import "wasi:io/streams@0.2.0" "[method]output-stream.check-write" (func $_ZN22wasi_snapshot_preview18bindings4wasi2io7streams12OutputStream11check_write10wit_import17hf2dfa7e72ddda900E (;6;) (type 1)))
    (import "wasi:io/streams@0.2.0" "[method]output-stream.write" (func $_ZN22wasi_snapshot_preview18bindings4wasi2io7streams12OutputStream5write10wit_import17hc4a13791811b5210E (;7;) (type 3)))
    (import "wasi:io/streams@0.2.0" "[method]output-stream.blocking-flush" (func $_ZN22wasi_snapshot_preview18bindings4wasi2io7streams12OutputStream14blocking_flush10wit_import17h1c360ca556eb668dE (;8;) (type 1)))
    (import "__main_module__" "cabi_realloc" (func $_ZN22wasi_snapshot_preview15State3new12cabi_realloc17h166deae888bb231bE (;9;) (type 7)))
    (import "wasi:filesystem/preopens@0.2.0" "get-directories" (func $_ZN22wasi_snapshot_preview111descriptors31wasi_filesystem_get_directories17ha763b64b19afcc5aE (;10;) (type 0)))
    (import "wasi:cli/stderr@0.2.0" "get-stderr" (func $_ZN22wasi_snapshot_preview18bindings4wasi3cli6stderr10get_stderr10wit_import17h487aea6a3c91eb04E (;11;) (type 8)))
    (import "wasi:io/streams@0.2.0" "[method]output-stream.blocking-write-and-flush" (func $_ZN22wasi_snapshot_preview18bindings4wasi2io7streams12OutputStream24blocking_write_and_flush10wit_import17h20faa542544b2392E (;12;) (type 3)))
    (import "wasi:filesystem/types@0.2.0" "[method]descriptor.write-via-stream" (func $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor16write_via_stream10wit_import17h1bdb9fdb58203ffeE (;13;) (type 2)))
    (import "wasi:cli/stdin@0.2.0" "get-stdin" (func $_ZN22wasi_snapshot_preview18bindings4wasi3cli5stdin9get_stdin10wit_import17hd93eed4c6da05032E (;14;) (type 8)))
    (import "wasi:cli/stdout@0.2.0" "get-stdout" (func $_ZN22wasi_snapshot_preview18bindings4wasi3cli6stdout10get_stdout10wit_import17h31b1f0e62e396756E (;15;) (type 8)))
    (import "wasi:cli/exit@0.2.0" "exit" (func $_ZN22wasi_snapshot_preview18bindings4wasi3cli4exit4exit10wit_import17h9d80b9522f65a53bE (;16;) (type 0)))
    (import "wasi:filesystem/types@0.2.0" "[method]descriptor.append-via-stream" (func $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor17append_via_stream10wit_import17h58df48aa85681c41E (;17;) (type 1)))
    (import "wasi:filesystem/types@0.2.0" "[method]descriptor.get-type" (func $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor8get_type10wit_import17h5a0a089266f1e391E (;18;) (type 1)))
    (import "wasi:filesystem/types@0.2.0" "[method]descriptor.stat" (func $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor4stat10wit_import17hfc2a563a82b98bd1E (;19;) (type 1)))
    (func $_ZN22wasi_snapshot_preview15State3ptr17h9a6798666addb589E (;20;) (type 8) (result i32)
      (local i32)
      block ;; label = @1
        call $get_state_ptr
        local.tee 0
        br_if 0 (;@1;)
        call $_ZN22wasi_snapshot_preview15State3new17h371ec0ffbc24bda1E
        local.tee 0
        call $set_state_ptr
      end
      local.get 0
    )
    (func $_ZN22wasi_snapshot_preview16macros11assert_fail17h3abe47e05f800882E (;21;) (type 0) (param i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      local.get 1
      i32.const 32
      i32.store8 offset=47
      local.get 1
      i64.const 7308895158390646132
      i64.store offset=39 align=1
      local.get 1
      i64.const 8097863973307965728
      i64.store offset=31 align=1
      local.get 1
      i64.const 7234307576302018670
      i64.store offset=23 align=1
      local.get 1
      i64.const 8028075845441778529
      i64.store offset=15 align=1
      local.get 1
      i32.const 15
      i32.add
      i32.const 33
      call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
      local.get 0
      call $_ZN22wasi_snapshot_preview16macros10eprint_u3217h5efd77e736dae32fE
      unreachable
      unreachable
    )
    (func $cabi_import_realloc (;22;) (type 7) (param i32 i32 i32 i32) (result i32)
      (local i32 i32 i64)
      call $allocate_stack
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 4
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      block ;; label = @9
                        block ;; label = @10
                          call $_ZN22wasi_snapshot_preview15State3ptr17h9a6798666addb589E
                          local.tee 5
                          i32.load
                          i32.const 560490357
                          i32.ne
                          br_if 0 (;@10;)
                          local.get 5
                          i32.load offset=65532
                          i32.const 560490357
                          i32.ne
                          br_if 1 (;@9;)
                          local.get 5
                          i64.load offset=4 align=4
                          local.set 6
                          local.get 5
                          i32.const 4
                          i32.store offset=4
                          local.get 4
                          i32.const 16
                          i32.add
                          local.get 5
                          i32.const 20
                          i32.add
                          i32.load
                          i32.store
                          local.get 4
                          i32.const 8
                          i32.add
                          local.get 5
                          i32.const 12
                          i32.add
                          i64.load align=4
                          i64.store
                          local.get 4
                          local.get 6
                          i64.store
                          local.get 0
                          i32.eqz
                          br_if 2 (;@8;)
                          local.get 1
                          local.get 3
                          i32.le_u
                          br_if 3 (;@7;)
                          local.get 2
                          i32.const 1
                          i32.eq
                          br_if 9 (;@1;)
                          i32.const 374
                          call $_ZN22wasi_snapshot_preview16macros11assert_fail17h3abe47e05f800882E
                          unreachable
                        end
                        i32.const 2742
                        call $_ZN22wasi_snapshot_preview16macros11assert_fail17h3abe47e05f800882E
                        unreachable
                      end
                      i32.const 2743
                      call $_ZN22wasi_snapshot_preview16macros11assert_fail17h3abe47e05f800882E
                      unreachable
                    end
                    local.get 4
                    i32.load
                    br_table 5 (;@2;) 3 (;@4;) 2 (;@5;) 1 (;@6;) 4 (;@3;) 5 (;@2;)
                  end
                  i32.const 373
                  call $_ZN22wasi_snapshot_preview16macros11assert_fail17h3abe47e05f800882E
                  unreachable
                end
                block ;; label = @6
                  local.get 2
                  i32.const 1
                  i32.eq
                  br_if 0 (;@6;)
                  local.get 4
                  i32.const 12
                  i32.add
                  local.get 2
                  local.get 3
                  call $_ZN22wasi_snapshot_preview19BumpAlloc5alloc17hfe787c1d3ff0f3b8E
                  local.set 0
                  br 5 (;@1;)
                end
                block ;; label = @6
                  local.get 4
                  i32.load offset=8
                  local.get 4
                  i32.load offset=4
                  i32.eq
                  br_if 0 (;@6;)
                  local.get 4
                  local.get 4
                  i64.load offset=12 align=4
                  i64.store offset=24 align=4
                  local.get 4
                  i32.const 24
                  i32.add
                  i32.const 1
                  local.get 3
                  call $_ZN22wasi_snapshot_preview19BumpAlloc5alloc17hfe787c1d3ff0f3b8E
                  local.set 0
                  br 5 (;@1;)
                end
                local.get 4
                i32.const 12
                i32.add
                i32.const 1
                local.get 3
                call $_ZN22wasi_snapshot_preview19BumpAlloc5alloc17hfe787c1d3ff0f3b8E
                local.set 0
                br 4 (;@1;)
              end
              block ;; label = @5
                local.get 2
                i32.const 1
                i32.eq
                br_if 0 (;@5;)
                local.get 4
                i32.const 12
                i32.add
                local.get 2
                local.get 3
                call $_ZN22wasi_snapshot_preview19BumpAlloc5alloc17hfe787c1d3ff0f3b8E
                local.set 0
                br 4 (;@1;)
              end
              local.get 4
              i32.const 4
              i32.or
              i32.const 1
              local.get 3
              i32.const 1
              i32.add
              call $_ZN22wasi_snapshot_preview19BumpAlloc5alloc17hfe787c1d3ff0f3b8E
              local.set 0
              br 3 (;@1;)
            end
            block ;; label = @4
              local.get 2
              i32.const 1
              i32.eq
              br_if 0 (;@4;)
              local.get 4
              i32.const 8
              i32.add
              local.get 2
              local.get 3
              call $_ZN22wasi_snapshot_preview19BumpAlloc5alloc17hfe787c1d3ff0f3b8E
              local.set 0
              br 3 (;@1;)
            end
            local.get 4
            local.get 4
            i32.load offset=4
            local.get 3
            i32.add
            i32.store offset=4
            local.get 4
            local.get 4
            i64.load offset=8
            i64.store offset=24 align=4
            local.get 4
            i32.const 24
            i32.add
            i32.const 1
            local.get 3
            call $_ZN22wasi_snapshot_preview19BumpAlloc5alloc17hfe787c1d3ff0f3b8E
            local.set 0
            br 2 (;@1;)
          end
          i32.const 414
          call $_ZN22wasi_snapshot_preview16macros18eprint_unreachable17h154ffb8a21843eb7E
          local.get 4
          i32.const 8250
          i32.store16 offset=24 align=1
          local.get 4
          i32.const 24
          i32.add
          i32.const 2
          call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
          local.get 4
          i64.const 748834980320733542
          i64.store offset=40 align=1
          local.get 4
          i64.const 7957688057596965985
          i64.store offset=32 align=1
          local.get 4
          i64.const 7165064744911531886
          i64.store offset=24 align=1
          local.get 4
          i32.const 24
          i32.add
          i32.const 24
          call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
          local.get 4
          i32.const 10
          i32.store8 offset=24
          local.get 4
          i32.const 24
          i32.add
          i32.const 1
          call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
          unreachable
          unreachable
        end
        local.get 4
        i32.const 4
        i32.or
        local.get 2
        local.get 3
        call $_ZN22wasi_snapshot_preview19BumpAlloc5alloc17hfe787c1d3ff0f3b8E
        local.set 0
        local.get 4
        i32.const 4
        i32.store
      end
      local.get 5
      i32.const 4
      i32.add
      local.tee 5
      local.get 4
      i64.load
      i64.store align=4
      local.get 5
      i32.const 16
      i32.add
      local.get 4
      i32.const 16
      i32.add
      i32.load
      i32.store
      local.get 5
      i32.const 8
      i32.add
      local.get 4
      i32.const 8
      i32.add
      i64.load
      i64.store align=4
      local.get 4
      i32.const 48
      i32.add
      global.set $__stack_pointer
      local.get 0
    )
    (func $_ZN22wasi_snapshot_preview19BumpAlloc5alloc17hfe787c1d3ff0f3b8E (;23;) (type 9) (param i32 i32 i32) (result i32)
      (local i32 i32 i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 1
            i32.popcnt
            i32.const 1
            i32.ne
            br_if 0 (;@3;)
            local.get 0
            i32.load offset=4
            local.tee 4
            local.get 1
            local.get 0
            i32.load
            local.tee 5
            i32.add
            i32.const -1
            i32.add
            i32.const 0
            local.get 1
            i32.sub
            i32.and
            local.get 5
            i32.sub
            local.tee 1
            i32.le_u
            br_if 1 (;@2;)
            local.get 4
            local.get 1
            i32.sub
            local.tee 4
            local.get 2
            i32.ge_u
            br_if 2 (;@1;)
            i32.const 434
            call $_ZN22wasi_snapshot_preview16macros18eprint_unreachable17h154ffb8a21843eb7E
            local.get 3
            i32.const 8250
            i32.store16 offset=3 align=1
            local.get 3
            i32.const 3
            i32.add
            i32.const 2
            call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
            local.get 3
            i32.const 10
            i32.store8 offset=31
            local.get 3
            i32.const 1701278305
            i32.store offset=27 align=1
            local.get 3
            i64.const 7791349879831294825
            i64.store offset=19 align=1
            local.get 3
            i64.const 2334406575183130223
            i64.store offset=11 align=1
            local.get 3
            i64.const 7598805550979902561
            i64.store offset=3 align=1
            local.get 3
            i32.const 3
            i32.add
            i32.const 29
            call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
            local.get 3
            i32.const 10
            i32.store8 offset=3
            local.get 3
            i32.const 3
            i32.add
            i32.const 1
            call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
            unreachable
            unreachable
          end
          i32.const 444
          call $_ZN22wasi_snapshot_preview16macros18eprint_unreachable17h154ffb8a21843eb7E
          local.get 3
          i32.const 8250
          i32.store16 offset=3 align=1
          local.get 3
          i32.const 3
          i32.add
          i32.const 2
          call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
          local.get 3
          i32.const 2676
          i32.store16 offset=19 align=1
          local.get 3
          i64.const 7954884637768641633
          i64.store offset=11 align=1
          local.get 3
          i64.const 2334106421097295465
          i64.store offset=3 align=1
          local.get 3
          i32.const 3
          i32.add
          i32.const 18
          call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
          local.get 3
          i32.const 10
          i32.store8 offset=3
          local.get 3
          i32.const 3
          i32.add
          i32.const 1
          call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
          unreachable
          unreachable
        end
        i32.const 448
        call $_ZN22wasi_snapshot_preview16macros18eprint_unreachable17h154ffb8a21843eb7E
        local.get 3
        i32.const 8250
        i32.store16 offset=3 align=1
        local.get 3
        i32.const 3
        i32.add
        i32.const 2
        call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
        local.get 3
        i32.const 10
        i32.store8 offset=21
        local.get 3
        i32.const 25972
        i32.store16 offset=19 align=1
        local.get 3
        i64.const 7017575155838820463
        i64.store offset=11 align=1
        local.get 3
        i64.const 8367798494427701606
        i64.store offset=3 align=1
        local.get 3
        i32.const 3
        i32.add
        i32.const 19
        call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
        local.get 3
        i32.const 10
        i32.store8 offset=3
        local.get 3
        i32.const 3
        i32.add
        i32.const 1
        call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
        unreachable
        unreachable
      end
      local.get 0
      local.get 4
      local.get 2
      i32.sub
      i32.store offset=4
      local.get 0
      local.get 5
      local.get 1
      i32.add
      local.tee 1
      local.get 2
      i32.add
      i32.store
      local.get 3
      i32.const 32
      i32.add
      global.set $__stack_pointer
      local.get 1
    )
    (func $_ZN22wasi_snapshot_preview16macros18eprint_unreachable17h154ffb8a21843eb7E (;24;) (type 0) (param i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      local.get 1
      i32.const 32
      i32.store8 offset=47
      local.get 1
      i32.const 1701734764
      i32.store offset=43 align=1
      local.get 1
      i64.const 2338042707334751329
      i64.store offset=35 align=1
      local.get 1
      i64.const 2338600898263348341
      i64.store offset=27 align=1
      local.get 1
      i64.const 7162263158133189730
      i64.store offset=19 align=1
      local.get 1
      i64.const 7018969289221893749
      i64.store offset=11 align=1
      local.get 1
      i32.const 11
      i32.add
      i32.const 37
      call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
      local.get 0
      call $_ZN22wasi_snapshot_preview16macros10eprint_u3215eprint_u32_impl17h1776974afc22446fE
      local.get 1
      i32.const 48
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE (;25;) (type 1) (param i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 2
      call $_ZN22wasi_snapshot_preview18bindings4wasi3cli6stderr10get_stderr10wit_import17h487aea6a3c91eb04E
      i32.store offset=12
      local.get 2
      i32.const 4
      i32.add
      local.get 2
      i32.const 12
      i32.add
      local.get 0
      local.get 1
      call $_ZN22wasi_snapshot_preview18bindings4wasi2io7streams12OutputStream24blocking_write_and_flush17h93aac5382bb8c44cE
      block ;; label = @1
        local.get 2
        i32.load offset=4
        local.tee 1
        i32.const 2
        i32.eq
        br_if 0 (;@1;)
        local.get 1
        br_if 0 (;@1;)
        local.get 2
        i32.load offset=8
        local.tee 1
        i32.const -1
        i32.eq
        br_if 0 (;@1;)
        local.get 1
        call $_ZN128_$LT$wasi_snapshot_preview1..bindings..wasi..io..error..Error$u20$as$u20$wasi_snapshot_preview1..bindings.._rt..WasmResource$GT$4drop4drop17hfde71e25f37a363aE
      end
      block ;; label = @1
        local.get 2
        i32.load offset=12
        local.tee 1
        i32.const -1
        i32.eq
        br_if 0 (;@1;)
        local.get 1
        call $_ZN137_$LT$wasi_snapshot_preview1..bindings..wasi..io..streams..OutputStream$u20$as$u20$wasi_snapshot_preview1..bindings.._rt..WasmResource$GT$4drop4drop17h4b0769f161058092E
      end
      local.get 2
      i32.const 16
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN22wasi_snapshot_preview16macros11unreachable17h6a56810d80d9499dE (;26;) (type 0) (param i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      local.get 0
      call $_ZN22wasi_snapshot_preview16macros18eprint_unreachable17h154ffb8a21843eb7E
      local.get 1
      i32.const 10
      i32.store8 offset=15
      local.get 1
      i32.const 15
      i32.add
      i32.const 1
      call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
      unreachable
      unreachable
    )
    (func $environ_get (;27;) (type 10) (param i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32)
      call $allocate_stack
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            call $_ZN22wasi_snapshot_preview15State3ptr17h9a6798666addb589E
            local.tee 3
            i32.load
            i32.const 560490357
            i32.ne
            br_if 0 (;@3;)
            local.get 3
            i32.load offset=65532
            i32.const 560490357
            i32.ne
            br_if 1 (;@2;)
            local.get 3
            i32.const 59032
            i32.store offset=20
            local.get 3
            i32.const -1
            i32.store offset=12
            local.get 3
            local.get 1
            i32.store offset=8
            local.get 3
            local.get 3
            i32.const 6192
            i32.add
            i32.store offset=16
            local.get 3
            i32.load offset=4
            local.set 1
            local.get 3
            i32.const 2
            i32.store offset=4
            local.get 1
            i32.const 4
            i32.ne
            br_if 2 (;@1;)
            local.get 2
            i64.const 0
            i64.store align=4
            local.get 2
            call $_ZN22wasi_snapshot_preview124wasi_cli_get_environment17h55a6394b4942a991E
            local.get 2
            i32.load offset=4
            local.set 4
            local.get 2
            i32.load
            local.set 1
            local.get 3
            i32.const 4
            i32.store offset=4
            block ;; label = @4
              local.get 4
              i32.eqz
              br_if 0 (;@4;)
              loop ;; label = @5
                local.get 1
                i32.const 12
                i32.add
                i32.load
                local.set 3
                local.get 1
                i32.const 8
                i32.add
                i32.load
                local.set 5
                local.get 1
                i32.const 4
                i32.add
                i32.load
                local.set 6
                local.get 0
                local.get 1
                i32.load
                local.tee 7
                i32.store
                local.get 7
                local.get 6
                i32.add
                i32.const 61
                i32.store8
                local.get 5
                local.get 3
                i32.add
                i32.const 0
                i32.store8
                local.get 1
                i32.const 16
                i32.add
                local.set 1
                local.get 0
                i32.const 4
                i32.add
                local.set 0
                local.get 4
                i32.const -1
                i32.add
                local.tee 4
                br_if 0 (;@5;)
              end
            end
            local.get 2
            i32.const 32
            i32.add
            global.set $__stack_pointer
            i32.const 0
            return
          end
          i32.const 2742
          call $_ZN22wasi_snapshot_preview16macros11assert_fail17h3abe47e05f800882E
          unreachable
        end
        i32.const 2743
        call $_ZN22wasi_snapshot_preview16macros11assert_fail17h3abe47e05f800882E
        unreachable
      end
      i32.const 2881
      call $_ZN22wasi_snapshot_preview16macros18eprint_unreachable17h154ffb8a21843eb7E
      local.get 2
      i32.const 8250
      i32.store16 align=1
      local.get 2
      i32.const 2
      call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
      local.get 2
      i32.const 10
      i32.store8 offset=28
      local.get 2
      i32.const 1952805664
      i32.store offset=24 align=1
      local.get 2
      i64.const 8747223464599642400
      i64.store offset=16 align=1
      local.get 2
      i64.const 8245937404367563884
      i64.store offset=8 align=1
      local.get 2
      i64.const 6998721855778483561
      i64.store align=1
      local.get 2
      i32.const 29
      call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
      local.get 2
      i32.const 10
      i32.store8
      local.get 2
      i32.const 1
      call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
      unreachable
      unreachable
    )
    (func $environ_sizes_get (;28;) (type 10) (param i32 i32) (result i32)
      (local i32 i32 i32 i32)
      call $allocate_stack
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    call $get_allocation_state
                    i32.const -2
                    i32.add
                    br_table 1 (;@6;) 0 (;@7;) 1 (;@6;) 0 (;@7;)
                  end
                  i32.const 0
                  local.set 3
                  local.get 0
                  i32.const 0
                  i32.store
                  br 1 (;@5;)
                end
                call $_ZN22wasi_snapshot_preview15State3ptr17h9a6798666addb589E
                local.tee 3
                i32.load
                i32.const 560490357
                i32.ne
                br_if 1 (;@4;)
                local.get 3
                i32.load offset=65532
                i32.const 560490357
                i32.ne
                br_if 2 (;@3;)
                local.get 3
                i32.const 59032
                i32.store offset=16
                local.get 3
                local.get 3
                i32.const 6192
                i32.add
                i32.store offset=12
                local.get 3
                i32.load offset=4
                local.set 4
                local.get 3
                i64.const 1
                i64.store offset=4 align=4
                local.get 4
                i32.const 4
                i32.ne
                br_if 3 (;@2;)
                local.get 2
                i64.const 0
                i64.store align=4
                local.get 2
                call $_ZN22wasi_snapshot_preview124wasi_cli_get_environment17h55a6394b4942a991E
                local.get 2
                i32.load offset=4
                local.set 4
                local.get 3
                i32.load offset=4
                local.set 5
                local.get 3
                i32.const 4
                i32.store offset=4
                local.get 5
                i32.const 1
                i32.ne
                br_if 4 (;@1;)
                local.get 3
                i32.load offset=8
                local.set 3
                local.get 0
                local.get 4
                i32.store
                local.get 3
                local.get 4
                i32.const 1
                i32.shl
                i32.add
                local.set 3
              end
              local.get 1
              local.get 3
              i32.store
              local.get 2
              i32.const 32
              i32.add
              global.set $__stack_pointer
              i32.const 0
              return
            end
            i32.const 2742
            call $_ZN22wasi_snapshot_preview16macros11assert_fail17h3abe47e05f800882E
            unreachable
          end
          i32.const 2743
          call $_ZN22wasi_snapshot_preview16macros11assert_fail17h3abe47e05f800882E
          unreachable
        end
        i32.const 2881
        call $_ZN22wasi_snapshot_preview16macros18eprint_unreachable17h154ffb8a21843eb7E
        local.get 2
        i32.const 8250
        i32.store16 align=1
        local.get 2
        i32.const 2
        call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
        local.get 2
        i32.const 10
        i32.store8 offset=28
        local.get 2
        i32.const 1952805664
        i32.store offset=24 align=1
        local.get 2
        i64.const 8747223464599642400
        i64.store offset=16 align=1
        local.get 2
        i64.const 8245937404367563884
        i64.store offset=8 align=1
        local.get 2
        i64.const 6998721855778483561
        i64.store align=1
        local.get 2
        i32.const 29
        call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
        local.get 2
        i32.const 10
        i32.store8
        local.get 2
        i32.const 1
        call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
        unreachable
        unreachable
      end
      i32.const 624
      call $_ZN22wasi_snapshot_preview16macros11unreachable17h6a56810d80d9499dE
      unreachable
    )
    (func $_ZN22wasi_snapshot_preview15State11descriptors17h870dc95a4a632c06E (;29;) (type 1) (param i32 i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 6160
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          local.get 1
          i32.load offset=24
          br_if 0 (;@2;)
          local.get 1
          i32.const -1
          i32.store offset=24
          local.get 1
          i32.const 32
          i32.add
          local.set 3
          block ;; label = @3
            local.get 1
            i32.load offset=6180
            i32.const 2
            i32.ne
            br_if 0 (;@3;)
            local.get 2
            local.get 1
            call $_ZN22wasi_snapshot_preview111descriptors11Descriptors3new17h1580c0f06bc4c976E
            local.get 3
            local.get 2
            i32.const 6160
            call $memcpy
            drop
            local.get 1
            i32.load offset=6180
            i32.const 2
            i32.eq
            br_if 2 (;@1;)
          end
          local.get 0
          local.get 1
          i32.const 24
          i32.add
          i32.store offset=4
          local.get 0
          local.get 3
          i32.store
          local.get 2
          i32.const 6160
          i32.add
          global.set $__stack_pointer
          return
        end
        i32.const 2830
        call $_ZN22wasi_snapshot_preview16macros11unreachable17h6a56810d80d9499dE
        unreachable
      end
      i32.const 2834
      call $_ZN22wasi_snapshot_preview16macros11unreachable17h6a56810d80d9499dE
      unreachable
    )
    (func $_ZN22wasi_snapshot_preview1152_$LT$impl$u20$core..convert..From$LT$wasi_snapshot_preview1..bindings..wasi..filesystem..types..ErrorCode$GT$$u20$for$u20$wasi..lib_generated..Errno$GT$4from17h39d201fe9bddb2c1E (;30;) (type 5) (param i32) (result i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.set 1
      i32.const 6
      local.set 2
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      block ;; label = @9
                        block ;; label = @10
                          block ;; label = @11
                            block ;; label = @12
                              block ;; label = @13
                                block ;; label = @14
                                  block ;; label = @15
                                    block ;; label = @16
                                      block ;; label = @17
                                        block ;; label = @18
                                          block ;; label = @19
                                            block ;; label = @20
                                              block ;; label = @21
                                                block ;; label = @22
                                                  block ;; label = @23
                                                    block ;; label = @24
                                                      block ;; label = @25
                                                        block ;; label = @26
                                                          block ;; label = @27
                                                            block ;; label = @28
                                                              block ;; label = @29
                                                                block ;; label = @30
                                                                  block ;; label = @31
                                                                    block ;; label = @32
                                                                      block ;; label = @33
                                                                        block ;; label = @34
                                                                          block ;; label = @35
                                                                            block ;; label = @36
                                                                              block ;; label = @37
                                                                                local.get 0
                                                                                i32.const 255
                                                                                i32.and
                                                                                br_table 0 (;@37;) 36 (;@1;) 1 (;@36;) 2 (;@35;) 3 (;@34;) 4 (;@33;) 5 (;@32;) 6 (;@31;) 7 (;@30;) 8 (;@29;) 9 (;@28;) 10 (;@27;) 11 (;@26;) 12 (;@25;) 13 (;@24;) 14 (;@23;) 15 (;@22;) 16 (;@21;) 17 (;@20;) 18 (;@19;) 19 (;@18;) 20 (;@17;) 21 (;@16;) 22 (;@15;) 23 (;@14;) 24 (;@13;) 25 (;@12;) 26 (;@11;) 27 (;@10;) 28 (;@9;) 29 (;@8;) 30 (;@7;) 31 (;@6;) 32 (;@5;) 33 (;@4;) 34 (;@3;) 35 (;@2;) 0 (;@37;)
                                                                              end
                                                                              local.get 1
                                                                              i32.const 2
                                                                              i32.store16 offset=14
                                                                              local.get 1
                                                                              i32.const 14
                                                                              i32.add
                                                                              local.set 0
                                                                              local.get 1
                                                                              i32.load16_u offset=14
                                                                              return
                                                                            end
                                                                            i32.const 7
                                                                            return
                                                                          end
                                                                          i32.const 8
                                                                          return
                                                                        end
                                                                        i32.const 10
                                                                        return
                                                                      end
                                                                      i32.const 16
                                                                      return
                                                                    end
                                                                    i32.const 19
                                                                    return
                                                                  end
                                                                  i32.const 20
                                                                  return
                                                                end
                                                                i32.const 22
                                                                return
                                                              end
                                                              i32.const 25
                                                              return
                                                            end
                                                            i32.const 26
                                                            return
                                                          end
                                                          i32.const 27
                                                          return
                                                        end
                                                        i32.const 28
                                                        return
                                                      end
                                                      i32.const 29
                                                      return
                                                    end
                                                    i32.const 31
                                                    return
                                                  end
                                                  i32.const 32
                                                  return
                                                end
                                                i32.const 34
                                                return
                                              end
                                              i32.const 35
                                              return
                                            end
                                            i32.const 37
                                            return
                                          end
                                          i32.const 43
                                          return
                                        end
                                        i32.const 44
                                        return
                                      end
                                      i32.const 46
                                      return
                                    end
                                    i32.const 48
                                    return
                                  end
                                  i32.const 51
                                  return
                                end
                                i32.const 54
                                return
                              end
                              i32.const 55
                              return
                            end
                            i32.const 56
                            return
                          end
                          i32.const 58
                          return
                        end
                        i32.const 59
                        return
                      end
                      i32.const 60
                      return
                    end
                    i32.const 61
                    return
                  end
                  i32.const 63
                  return
                end
                i32.const 64
                return
              end
              i32.const 69
              return
            end
            i32.const 70
            return
          end
          i32.const 74
          return
        end
        i32.const 75
        local.set 2
      end
      local.get 2
    )
    (func $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor8get_type17h593f6d8113c528f9E (;31;) (type 1) (param i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 1
      i32.load
      local.get 2
      i32.const 14
      i32.add
      call $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor8get_type10wit_import17h5a0a089266f1e391E
      local.get 2
      i32.load8_u offset=14
      local.set 1
      local.get 0
      local.get 2
      i32.load8_u offset=15
      i32.store8 offset=1
      local.get 0
      local.get 1
      i32.const 0
      i32.ne
      i32.store8
      local.get 2
      i32.const 16
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor4stat17h287758a5ab8237beE (;32;) (type 1) (param i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 112
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 1
      i32.load
      local.get 2
      i32.const 8
      i32.add
      call $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor4stat10wit_import17hfc2a563a82b98bd1E
      local.get 2
      i32.load8_u offset=16
      local.set 1
      block ;; label = @1
        block ;; label = @2
          local.get 2
          i32.load8_u offset=8
          br_if 0 (;@2;)
          local.get 0
          local.get 2
          i32.load offset=104
          i32.store offset=88
          local.get 0
          local.get 2
          i64.load offset=96
          i64.store offset=80
          local.get 0
          local.get 2
          i32.load offset=80
          i32.store offset=64
          local.get 0
          local.get 2
          i64.load offset=72
          i64.store offset=56
          local.get 0
          local.get 2
          i32.load offset=56
          i32.store offset=40
          local.get 0
          local.get 2
          i64.load offset=48
          i64.store offset=32
          local.get 0
          local.get 2
          i64.load offset=32
          i64.store offset=16
          local.get 0
          local.get 2
          i64.load offset=24
          i64.store offset=8
          local.get 0
          local.get 1
          i32.store8
          local.get 0
          local.get 2
          i32.load8_u offset=88
          i32.const 0
          i32.ne
          i64.extend_i32_u
          i64.store offset=72
          local.get 0
          local.get 2
          i32.load8_u offset=64
          i32.const 0
          i32.ne
          i64.extend_i32_u
          i64.store offset=48
          local.get 0
          local.get 2
          i32.load8_u offset=40
          i32.const 0
          i32.ne
          i64.extend_i32_u
          i64.store offset=24
          br 1 (;@1;)
        end
        local.get 0
        i64.const 2
        i64.store offset=72
        local.get 0
        local.get 1
        i32.store8
      end
      local.get 2
      i32.const 112
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN22wasi_snapshot_preview15State17with_import_alloc17h2da2a4b813fff992E (;33;) (type 6) (param i32 i32 i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 32
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 1
      i32.load offset=4
      local.set 4
      local.get 1
      local.get 2
      i64.load align=4
      i64.store offset=4 align=4
      local.get 1
      i32.const 12
      i32.add
      local.get 2
      i32.const 8
      i32.add
      i64.load align=4
      i64.store align=4
      local.get 1
      i32.const 20
      i32.add
      local.get 2
      i32.const 16
      i32.add
      i32.load
      i32.store
      block ;; label = @1
        local.get 4
        i32.const 4
        i32.ne
        br_if 0 (;@1;)
        local.get 3
        i64.const 0
        i64.store align=4
        local.get 3
        call $_ZN22wasi_snapshot_preview111descriptors31wasi_filesystem_get_directories17ha763b64b19afcc5aE
        local.get 0
        local.get 3
        i64.load align=4
        i64.store align=4
        local.get 0
        i32.const 24
        i32.add
        local.get 1
        i32.const 4
        i32.add
        local.tee 1
        i32.const 16
        i32.add
        i32.load
        i32.store
        local.get 0
        i32.const 16
        i32.add
        local.get 1
        i32.const 8
        i32.add
        i64.load align=4
        i64.store align=4
        local.get 0
        local.get 1
        i64.load align=4
        i64.store offset=8 align=4
        local.get 1
        i32.const 4
        i32.store
        local.get 3
        i32.const 32
        i32.add
        global.set $__stack_pointer
        return
      end
      i32.const 2881
      call $_ZN22wasi_snapshot_preview16macros18eprint_unreachable17h154ffb8a21843eb7E
      local.get 3
      i32.const 8250
      i32.store16 align=1
      local.get 3
      i32.const 2
      call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
      local.get 3
      i32.const 10
      i32.store8 offset=28
      local.get 3
      i32.const 1952805664
      i32.store offset=24 align=1
      local.get 3
      i64.const 8747223464599642400
      i64.store offset=16 align=1
      local.get 3
      i64.const 8245937404367563884
      i64.store offset=8 align=1
      local.get 3
      i64.const 6998721855778483561
      i64.store align=1
      local.get 3
      i32.const 29
      call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
      local.get 3
      i32.const 10
      i32.store8
      local.get 3
      i32.const 1
      call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
      unreachable
      unreachable
    )
    (func $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor17append_via_stream17h8f7ba5659384f7cbE (;34;) (type 1) (param i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      local.get 2
      i64.const 0
      i64.store offset=8
      local.get 1
      i32.load
      local.get 2
      i32.const 8
      i32.add
      call $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor17append_via_stream10wit_import17h58df48aa85681c41E
      block ;; label = @1
        block ;; label = @2
          local.get 2
          i32.load8_u offset=8
          local.tee 1
          br_if 0 (;@2;)
          local.get 0
          local.get 2
          i32.load offset=12
          i32.store offset=4
          br 1 (;@1;)
        end
        local.get 0
        local.get 2
        i32.load8_u offset=12
        i32.store8 offset=1
      end
      local.get 0
      local.get 1
      i32.store8
      local.get 2
      i32.const 16
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN22wasi_snapshot_preview18bindings4wasi2io7streams12OutputStream24blocking_write_and_flush17h93aac5382bb8c44cE (;35;) (type 3) (param i32 i32 i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 4
      global.set $__stack_pointer
      local.get 1
      i32.load
      local.get 2
      local.get 3
      local.get 4
      i32.const 4
      i32.add
      call $_ZN22wasi_snapshot_preview18bindings4wasi2io7streams12OutputStream24blocking_write_and_flush10wit_import17h20faa542544b2392E
      block ;; label = @1
        block ;; label = @2
          local.get 4
          i32.load8_u offset=4
          br_if 0 (;@2;)
          local.get 0
          i32.const 2
          i32.store
          br 1 (;@1;)
        end
        local.get 0
        i64.const 1
        local.get 4
        i64.load32_u offset=12
        i64.const 32
        i64.shl
        local.get 4
        i32.load8_u offset=8
        select
        i64.store align=4
      end
      local.get 4
      i32.const 16
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN22wasi_snapshot_preview121stream_error_to_errno17ha83ae5a015557b90E (;36;) (type 5) (param i32) (result i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      local.get 0
      local.get 1
      i32.const 14
      i32.add
      call $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types21filesystem_error_code10wit_import17h24cde18722b8d767E
      block ;; label = @1
        block ;; label = @2
          local.get 1
          i32.load8_u offset=14
          i32.const 1
          i32.eq
          br_if 0 (;@2;)
          i32.const 29
          local.set 2
          br 1 (;@1;)
        end
        local.get 1
        i32.load8_u offset=15
        call $_ZN22wasi_snapshot_preview1152_$LT$impl$u20$core..convert..From$LT$wasi_snapshot_preview1..bindings..wasi..filesystem..types..ErrorCode$GT$$u20$for$u20$wasi..lib_generated..Errno$GT$4from17h39d201fe9bddb2c1E
        local.set 2
      end
      block ;; label = @1
        local.get 0
        i32.const -1
        i32.eq
        br_if 0 (;@1;)
        local.get 0
        call $_ZN128_$LT$wasi_snapshot_preview1..bindings..wasi..io..error..Error$u20$as$u20$wasi_snapshot_preview1..bindings.._rt..WasmResource$GT$4drop4drop17hfde71e25f37a363aE
      end
      local.get 1
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 2
    )
    (func $_ZN4core3ptr68drop_in_place$LT$wasi_snapshot_preview1..descriptors..Descriptor$GT$17hd9864df47f78c429E (;37;) (type 0) (param i32)
      (local i32)
      block ;; label = @1
        local.get 0
        i32.load
        i32.const 1
        i32.ne
        br_if 0 (;@1;)
        block ;; label = @2
          local.get 0
          i32.load offset=8
          i32.eqz
          br_if 0 (;@2;)
          local.get 0
          i32.load offset=12
          local.tee 1
          i32.const -1
          i32.eq
          br_if 0 (;@2;)
          local.get 1
          call $_ZN136_$LT$wasi_snapshot_preview1..bindings..wasi..io..streams..InputStream$u20$as$u20$wasi_snapshot_preview1..bindings.._rt..WasmResource$GT$4drop4drop17h5d2d95a8dfb4abeeE
        end
        block ;; label = @2
          local.get 0
          i32.load offset=16
          i32.eqz
          br_if 0 (;@2;)
          local.get 0
          i32.load offset=20
          local.tee 1
          i32.const -1
          i32.eq
          br_if 0 (;@2;)
          local.get 1
          call $_ZN137_$LT$wasi_snapshot_preview1..bindings..wasi..io..streams..OutputStream$u20$as$u20$wasi_snapshot_preview1..bindings.._rt..WasmResource$GT$4drop4drop17h4b0769f161058092E
        end
        local.get 0
        i32.load8_u offset=41
        i32.const 2
        i32.eq
        br_if 0 (;@1;)
        local.get 0
        i32.load offset=24
        local.tee 0
        i32.const -1
        i32.eq
        br_if 0 (;@1;)
        local.get 0
        call $_ZN141_$LT$wasi_snapshot_preview1..bindings..wasi..filesystem..types..Descriptor$u20$as$u20$wasi_snapshot_preview1..bindings.._rt..WasmResource$GT$4drop4drop17h31ffd118310deae5E
      end
    )
    (func $fd_write (;38;) (type 7) (param i32 i32 i32 i32) (result i32)
      (local i32 i32 i32 i32)
      call $allocate_stack
      global.get $__stack_pointer
      i32.const 112
      i32.sub
      local.tee 4
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            call $get_allocation_state
            i32.const -2
            i32.add
            br_table 1 (;@2;) 0 (;@3;) 1 (;@2;) 0 (;@3;)
          end
          local.get 3
          i32.const 0
          i32.store
          i32.const 29
          local.set 1
          br 1 (;@1;)
        end
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      block ;; label = @9
                        local.get 2
                        i32.const 2
                        i32.lt_u
                        br_if 0 (;@9;)
                        local.get 1
                        local.get 2
                        i32.const 3
                        i32.shl
                        i32.add
                        i32.const -8
                        i32.add
                        local.set 5
                        loop ;; label = @10
                          local.get 1
                          i32.load offset=4
                          local.tee 6
                          br_if 3 (;@7;)
                          local.get 1
                          i32.const 8
                          i32.add
                          local.set 1
                          local.get 2
                          i32.const -1
                          i32.add
                          local.tee 2
                          i32.const 1
                          i32.gt_u
                          br_if 0 (;@10;)
                        end
                        local.get 5
                        local.set 1
                        br 1 (;@8;)
                      end
                      local.get 2
                      i32.eqz
                      br_if 2 (;@6;)
                    end
                    local.get 1
                    i32.load offset=4
                    local.set 6
                  end
                  local.get 1
                  i32.load
                  local.set 7
                  call $_ZN22wasi_snapshot_preview15State3ptr17h9a6798666addb589E
                  local.tee 1
                  i32.load
                  i32.const 560490357
                  i32.ne
                  br_if 1 (;@5;)
                  local.get 1
                  i32.load offset=65532
                  i32.const 560490357
                  i32.ne
                  br_if 2 (;@4;)
                  local.get 4
                  i32.const 8
                  i32.add
                  local.get 1
                  call $_ZN22wasi_snapshot_preview15State11descriptors17h870dc95a4a632c06E
                  i32.const 8
                  local.set 1
                  local.get 4
                  i32.load offset=12
                  local.set 2
                  local.get 4
                  i32.load offset=8
                  local.tee 5
                  i32.load16_u offset=6144
                  local.get 0
                  i32.le_u
                  br_if 4 (;@2;)
                  local.get 5
                  local.get 0
                  i32.const 48
                  i32.mul
                  i32.add
                  local.tee 0
                  i32.load
                  i32.const 1
                  i32.ne
                  br_if 4 (;@2;)
                  local.get 4
                  i32.const 16
                  i32.add
                  local.get 0
                  i32.const 8
                  i32.add
                  call $_ZN22wasi_snapshot_preview111descriptors7Streams16get_write_stream17h1ed2d3d12d4fd0a6E
                  block ;; label = @7
                    local.get 4
                    i32.load16_u offset=16
                    br_if 0 (;@7;)
                    local.get 4
                    i32.load offset=20
                    local.set 1
                    block ;; label = @8
                      local.get 0
                      i32.load8_u offset=41
                      local.tee 5
                      i32.const 2
                      i32.eq
                      br_if 0 (;@8;)
                      local.get 4
                      i32.const 16
                      i32.add
                      local.get 5
                      i32.const 0
                      i32.ne
                      local.get 1
                      local.get 7
                      local.get 6
                      call $_ZN22wasi_snapshot_preview112BlockingMode5write17h7bcb2c9bbbb101bdE
                      local.get 4
                      i32.load16_u offset=16
                      br_if 1 (;@7;)
                      br 5 (;@3;)
                    end
                    local.get 4
                    i32.const 16
                    i32.add
                    i32.const 1
                    local.get 1
                    local.get 7
                    local.get 6
                    call $_ZN22wasi_snapshot_preview112BlockingMode5write17h7bcb2c9bbbb101bdE
                    local.get 4
                    i32.load16_u offset=16
                    i32.eqz
                    br_if 4 (;@3;)
                  end
                  local.get 4
                  i32.load16_u offset=18
                  local.set 1
                  br 4 (;@2;)
                end
                i32.const 0
                local.set 1
                local.get 3
                i32.const 0
                i32.store
                br 4 (;@1;)
              end
              i32.const 2742
              call $_ZN22wasi_snapshot_preview16macros11assert_fail17h3abe47e05f800882E
              unreachable
            end
            i32.const 2743
            call $_ZN22wasi_snapshot_preview16macros11assert_fail17h3abe47e05f800882E
            unreachable
          end
          local.get 4
          i32.load offset=20
          local.set 1
          block ;; label = @3
            block ;; label = @4
              local.get 0
              i32.load8_u offset=41
              i32.const 2
              i32.eq
              br_if 0 (;@4;)
              block ;; label = @5
                local.get 0
                i32.load8_u offset=40
                br_if 0 (;@5;)
                local.get 0
                local.get 0
                i64.load offset=32
                local.get 1
                i64.extend_i32_u
                i64.add
                i64.store offset=32
                br 1 (;@4;)
              end
              local.get 4
              i32.const 16
              i32.add
              local.get 0
              i32.const 24
              i32.add
              call $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor4stat17h287758a5ab8237beE
              local.get 4
              i64.load offset=88
              i64.const 2
              i64.eq
              br_if 1 (;@3;)
              local.get 0
              local.get 4
              i64.load offset=32
              i64.store offset=32
            end
            local.get 3
            local.get 1
            i32.store
            i32.const 0
            local.set 1
            br 1 (;@2;)
          end
          local.get 4
          i32.load8_u offset=16
          call $_ZN22wasi_snapshot_preview1152_$LT$impl$u20$core..convert..From$LT$wasi_snapshot_preview1..bindings..wasi..filesystem..types..ErrorCode$GT$$u20$for$u20$wasi..lib_generated..Errno$GT$4from17h39d201fe9bddb2c1E
          local.set 1
        end
        local.get 2
        local.get 2
        i32.load
        i32.const 1
        i32.add
        i32.store
      end
      local.get 4
      i32.const 112
      i32.add
      global.set $__stack_pointer
      local.get 1
      i32.const 65535
      i32.and
    )
    (func $_ZN22wasi_snapshot_preview111descriptors7Streams16get_write_stream17h1ed2d3d12d4fd0a6E (;39;) (type 1) (param i32 i32)
      (local i32 i64 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 1
            i32.load offset=8
            br_if 0 (;@3;)
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    local.get 1
                    i32.load8_u offset=33
                    i32.const 2
                    i32.eq
                    br_if 0 (;@7;)
                    block ;; label = @8
                      local.get 1
                      i32.load8_u offset=20
                      i32.const 3
                      i32.ne
                      br_if 0 (;@8;)
                      local.get 0
                      i32.const 8
                      i32.store16 offset=2
                      br 3 (;@5;)
                    end
                    block ;; label = @8
                      local.get 1
                      i32.load8_u offset=32
                      br_if 0 (;@8;)
                      local.get 1
                      i64.load offset=24
                      local.set 3
                      local.get 2
                      i64.const 0
                      i64.store offset=8
                      local.get 1
                      i32.load offset=16
                      local.get 3
                      local.get 2
                      i32.const 8
                      i32.add
                      call $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor16write_via_stream10wit_import17h1bdb9fdb58203ffeE
                      local.get 2
                      i32.load8_u offset=8
                      br_if 2 (;@6;)
                      br 4 (;@4;)
                    end
                    local.get 2
                    i32.const 8
                    i32.add
                    local.get 1
                    i32.const 16
                    i32.add
                    call $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor17append_via_stream17h8f7ba5659384f7cbE
                    local.get 2
                    i32.load8_u offset=8
                    i32.eqz
                    br_if 3 (;@4;)
                    local.get 0
                    local.get 2
                    i32.load8_u offset=9
                    call $_ZN22wasi_snapshot_preview1152_$LT$impl$u20$core..convert..From$LT$wasi_snapshot_preview1..bindings..wasi..filesystem..types..ErrorCode$GT$$u20$for$u20$wasi..lib_generated..Errno$GT$4from17h39d201fe9bddb2c1E
                    i32.store16 offset=2
                    br 2 (;@5;)
                  end
                  local.get 0
                  i32.const 8
                  i32.store16 offset=2
                  br 1 (;@5;)
                end
                local.get 0
                local.get 2
                i32.load8_u offset=12
                call $_ZN22wasi_snapshot_preview1152_$LT$impl$u20$core..convert..From$LT$wasi_snapshot_preview1..bindings..wasi..filesystem..types..ErrorCode$GT$$u20$for$u20$wasi..lib_generated..Errno$GT$4from17h39d201fe9bddb2c1E
                i32.store16 offset=2
              end
              i32.const 1
              local.set 1
              br 2 (;@2;)
            end
            local.get 2
            i32.load offset=12
            local.set 4
            local.get 1
            i32.load offset=8
            br_if 2 (;@1;)
            local.get 1
            local.get 4
            i32.store offset=12
            local.get 1
            i32.const 1
            i32.store offset=8
          end
          local.get 0
          local.get 1
          i32.const 12
          i32.add
          i32.store offset=4
          i32.const 0
          local.set 1
        end
        local.get 0
        local.get 1
        i32.store16
        local.get 2
        i32.const 16
        i32.add
        global.set $__stack_pointer
        return
      end
      i32.const 156
      call $_ZN22wasi_snapshot_preview16macros11unreachable17h6a56810d80d9499dE
      unreachable
    )
    (func $_ZN22wasi_snapshot_preview112BlockingMode5write17h7bcb2c9bbbb101bdE (;40;) (type 4) (param i32 i32 i32 i32 i32)
      (local i32 i32 i32 i64)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 5
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          local.get 1
          i32.eqz
          br_if 0 (;@2;)
          local.get 4
          local.set 1
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                loop ;; label = @6
                  local.get 5
                  local.get 2
                  local.get 3
                  local.get 1
                  i32.const 4096
                  local.get 1
                  i32.const 4096
                  i32.lt_u
                  select
                  local.tee 6
                  call $_ZN22wasi_snapshot_preview18bindings4wasi2io7streams12OutputStream24blocking_write_and_flush17h93aac5382bb8c44cE
                  block ;; label = @7
                    local.get 5
                    i32.load
                    local.tee 7
                    i32.const 2
                    i32.eq
                    br_if 0 (;@7;)
                    local.get 7
                    br_table 2 (;@5;) 3 (;@4;) 2 (;@5;)
                  end
                  local.get 3
                  local.get 6
                  i32.add
                  local.set 3
                  local.get 1
                  local.get 6
                  i32.sub
                  local.tee 1
                  br_if 0 (;@6;)
                end
                local.get 0
                i32.const 0
                i32.store16
                local.get 0
                local.get 4
                i32.store offset=4
                br 4 (;@1;)
              end
              local.get 5
              i32.load offset=4
              call $_ZN22wasi_snapshot_preview121stream_error_to_errno17ha83ae5a015557b90E
              local.set 1
              br 1 (;@3;)
            end
            i32.const 29
            local.set 1
          end
          local.get 0
          i32.const 1
          i32.store16
          local.get 0
          local.get 1
          i32.store16 offset=2
          br 1 (;@1;)
        end
        local.get 2
        i32.load
        local.get 5
        call $_ZN22wasi_snapshot_preview18bindings4wasi2io7streams12OutputStream11check_write10wit_import17hf2dfa7e72ddda900E
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      local.get 5
                      i32.load8_u
                      br_if 0 (;@8;)
                      local.get 5
                      i32.load offset=8
                      local.set 1
                      br 1 (;@7;)
                    end
                    i32.const 0
                    local.set 1
                    i64.const 1
                    local.get 5
                    i64.load32_u offset=12
                    i64.const 32
                    i64.shl
                    local.get 5
                    i32.load8_u offset=8
                    select
                    local.tee 8
                    i64.const 1
                    i64.and
                    i64.eqz
                    br_if 1 (;@6;)
                  end
                  local.get 2
                  i32.load
                  local.get 3
                  local.get 4
                  local.get 1
                  local.get 4
                  local.get 1
                  i32.lt_u
                  select
                  local.tee 1
                  local.get 5
                  call $_ZN22wasi_snapshot_preview18bindings4wasi2io7streams12OutputStream5write10wit_import17hc4a13791811b5210E
                  local.get 5
                  i32.load8_u
                  br_if 2 (;@4;)
                  local.get 2
                  i32.load
                  local.get 5
                  call $_ZN22wasi_snapshot_preview18bindings4wasi2io7streams12OutputStream14blocking_flush10wit_import17h1c360ca556eb668dE
                  local.get 5
                  i32.load8_u
                  br_if 1 (;@5;)
                  local.get 0
                  i32.const 0
                  i32.store16
                  local.get 0
                  local.get 1
                  i32.store offset=4
                  br 5 (;@1;)
                end
                local.get 8
                i64.const 32
                i64.shr_u
                i32.wrap_i64
                call $_ZN22wasi_snapshot_preview121stream_error_to_errno17ha83ae5a015557b90E
                local.set 1
                local.get 0
                i32.const 1
                i32.store16
                local.get 0
                local.get 1
                i32.store16 offset=2
                br 4 (;@1;)
              end
              i64.const 1
              local.get 5
              i64.load32_u offset=8
              i64.const 32
              i64.shl
              local.get 5
              i32.load8_u offset=4
              select
              local.tee 8
              i64.const 1
              i64.and
              i64.eqz
              br_if 1 (;@3;)
              i32.const 0
              local.set 1
              local.get 0
              i32.const 0
              i32.store offset=4
              br 2 (;@2;)
            end
            block ;; label = @4
              block ;; label = @5
                i64.const 1
                local.get 5
                i64.load32_u offset=8
                i64.const 32
                i64.shl
                local.get 5
                i32.load8_u offset=4
                select
                local.tee 8
                i64.const 1
                i64.and
                i64.eqz
                br_if 0 (;@5;)
                i32.const 0
                local.set 1
                local.get 0
                i32.const 0
                i32.store offset=4
                br 1 (;@4;)
              end
              local.get 0
              local.get 8
              i64.const 32
              i64.shr_u
              i32.wrap_i64
              call $_ZN22wasi_snapshot_preview121stream_error_to_errno17ha83ae5a015557b90E
              i32.store16 offset=2
              i32.const 1
              local.set 1
            end
            local.get 0
            local.get 1
            i32.store16
            br 2 (;@1;)
          end
          local.get 0
          local.get 8
          i64.const 32
          i64.shr_u
          i32.wrap_i64
          call $_ZN22wasi_snapshot_preview121stream_error_to_errno17ha83ae5a015557b90E
          i32.store16 offset=2
          i32.const 1
          local.set 1
        end
        local.get 0
        local.get 1
        i32.store16
      end
      local.get 5
      i32.const 16
      i32.add
      global.set $__stack_pointer
    )
    (func $proc_exit (;41;) (type 0) (param i32)
      (local i32)
      call $allocate_stack
      global.get $__stack_pointer
      i32.const 48
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      local.get 0
      i32.const 0
      i32.ne
      call $_ZN22wasi_snapshot_preview18bindings4wasi3cli4exit4exit17h85b2f55ffd3517a4E
      i32.const 2277
      call $_ZN22wasi_snapshot_preview16macros18eprint_unreachable17h154ffb8a21843eb7E
      local.get 1
      i32.const 8250
      i32.store16 offset=10 align=1
      local.get 1
      i32.const 10
      i32.add
      i32.const 2
      call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
      local.get 1
      i32.const 2593
      i32.store16 offset=46 align=1
      local.get 1
      i32.const 1953069157
      i32.store offset=42 align=1
      local.get 1
      i64.const 2338537461596644384
      i64.store offset=34 align=1
      local.get 1
      i64.const 7957695015159098981
      i64.store offset=26 align=1
      local.get 1
      i64.const 7882825952909664372
      i64.store offset=18 align=1
      local.get 1
      i64.const 7599935561254793064
      i64.store offset=10 align=1
      local.get 1
      i32.const 10
      i32.add
      i32.const 38
      call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
      local.get 1
      i32.const 10
      i32.store8 offset=10
      local.get 1
      i32.const 10
      i32.add
      i32.const 1
      call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
      unreachable
      unreachable
    )
    (func $_ZN22wasi_snapshot_preview18bindings4wasi3cli4exit4exit17h85b2f55ffd3517a4E (;42;) (type 0) (param i32)
      local.get 0
      call $_ZN22wasi_snapshot_preview18bindings4wasi3cli4exit4exit10wit_import17h9d80b9522f65a53bE
    )
    (func $_ZN22wasi_snapshot_preview15State3new17h371ec0ffbc24bda1E (;43;) (type 8) (result i32)
      (local i32)
      block ;; label = @1
        call $get_allocation_state
        i32.const 2
        i32.ne
        br_if 0 (;@1;)
        i32.const 3
        call $set_allocation_state
        i32.const 0
        i32.const 0
        i32.const 8
        i32.const 65536
        call $_ZN22wasi_snapshot_preview15State3new12cabi_realloc17h166deae888bb231bE
        local.set 0
        i32.const 4
        call $set_allocation_state
        local.get 0
        i32.const 2
        i32.store offset=6180
        local.get 0
        i32.const 0
        i32.store offset=24
        local.get 0
        i64.const 17740359541
        i64.store
        local.get 0
        i32.const 65480
        i32.add
        i32.const 0
        i32.const 37
        call $memset
        drop
        local.get 0
        i32.const 560490357
        i32.store offset=65532
        local.get 0
        i32.const 11822
        i32.store16 offset=65528
        local.get 0
        i32.const 0
        i32.store offset=65520
        local.get 0
        return
      end
      i32.const 2774
      call $_ZN22wasi_snapshot_preview16macros11assert_fail17h3abe47e05f800882E
      unreachable
    )
    (func $_ZN22wasi_snapshot_preview111descriptors11Descriptors3new17h1580c0f06bc4c976E (;44;) (type 1) (param i32 i32)
      (local i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 6256
      i32.sub
      local.tee 2
      global.set $__stack_pointer
      i32.const 0
      local.set 3
      local.get 2
      i32.const 0
      i32.store offset=6156
      call $_ZN22wasi_snapshot_preview18bindings4wasi3cli5stdin9get_stdin10wit_import17hd93eed4c6da05032E
      local.set 4
      local.get 2
      i32.const 2
      i32.store8 offset=49
      local.get 2
      i32.const 0
      i32.store8 offset=32
      local.get 2
      i64.const 0
      i64.store offset=24
      local.get 2
      i32.const 1
      i32.store offset=8
      local.get 2
      local.get 4
      i64.extend_i32_u
      i64.const 32
      i64.shl
      i64.const 1
      i64.or
      i64.store offset=16
      call $_ZN22wasi_snapshot_preview18bindings4wasi3cli6stdout10get_stdout10wit_import17h31b1f0e62e396756E
      local.set 4
      local.get 2
      i32.const 80
      i32.add
      i32.const 1
      i32.store8
      local.get 2
      i32.const 64
      i32.add
      i64.const 0
      i64.store
      local.get 2
      i32.const 72
      i32.add
      local.get 4
      i64.extend_i32_u
      i64.const 32
      i64.shl
      i64.const 1
      i64.or
      i64.store
      local.get 2
      i32.const 2
      i32.store8 offset=97
      local.get 2
      i32.const 1
      i32.store offset=56
      call $_ZN22wasi_snapshot_preview18bindings4wasi3cli6stderr10get_stderr10wit_import17h487aea6a3c91eb04E
      local.set 4
      local.get 2
      i32.const 128
      i32.add
      i32.const 2
      i32.store8
      local.get 2
      i32.const 112
      i32.add
      i64.const 0
      i64.store
      local.get 2
      i32.const 120
      i32.add
      local.get 4
      i64.extend_i32_u
      i64.const 32
      i64.shl
      i64.const 1
      i64.or
      i64.store
      local.get 2
      i32.const 3
      i32.store16 offset=6152
      local.get 2
      i32.const 2
      i32.store8 offset=145
      local.get 2
      i32.const 1
      i32.store offset=104
      local.get 2
      i32.const 59032
      i32.store offset=6184
      local.get 2
      local.get 1
      i32.const 6192
      i32.add
      i32.store offset=6180
      local.get 2
      i64.const 1
      i64.store offset=6172 align=4
      local.get 2
      i32.const 6208
      i32.add
      local.get 1
      local.get 2
      i32.const 6172
      i32.add
      call $_ZN22wasi_snapshot_preview15State17with_import_alloc17h2da2a4b813fff992E
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            local.get 2
            i32.load offset=6212
            local.tee 5
            i32.eqz
            br_if 0 (;@3;)
            local.get 2
            i32.load offset=6208
            local.set 1
            local.get 2
            i32.const 152
            i32.add
            local.set 6
            local.get 2
            i32.const 6208
            i32.add
            i32.const 8
            i32.add
            local.set 4
            loop ;; label = @4
              local.get 2
              i32.const 6192
              i32.add
              i32.const 8
              i32.add
              local.get 1
              i32.const 8
              i32.add
              i32.load
              i32.store
              local.get 2
              local.get 1
              i64.load align=4
              i64.store offset=6192
              local.get 2
              local.get 2
              i32.const 6192
              i32.add
              call $_ZN22wasi_snapshot_preview18bindings4wasi10filesystem5types10Descriptor8get_type17h593f6d8113c528f9E
              local.get 2
              i32.load8_u
              br_if 2 (;@2;)
              local.get 2
              i32.load8_u offset=1
              local.set 7
              local.get 4
              i64.const 0
              i64.store
              local.get 4
              i32.const 8
              i32.add
              i64.const 0
              i64.store
              local.get 2
              local.get 2
              i32.load offset=6200
              i32.store offset=6252
              local.get 2
              i32.const 256
              i32.store16 offset=6248
              local.get 2
              i64.const 0
              i64.store offset=6240
              local.get 2
              local.get 2
              i32.load offset=6192
              i32.store offset=6232
              local.get 2
              i32.const 1
              i32.store offset=6208
              local.get 2
              local.get 7
              i32.store8 offset=6236
              local.get 3
              i32.const 125
              i32.eq
              br_if 3 (;@1;)
              local.get 6
              local.get 2
              i32.const 6208
              i32.add
              i32.const 48
              call $memcpy
              local.set 6
              local.get 2
              local.get 3
              i32.const 4
              i32.add
              i32.store16 offset=6152
              local.get 1
              i32.const 12
              i32.add
              local.set 1
              local.get 6
              i32.const 48
              i32.add
              local.set 6
              local.get 3
              i32.const 1
              i32.add
              local.tee 7
              local.set 3
              local.get 5
              local.get 7
              i32.ne
              br_if 0 (;@4;)
            end
          end
          local.get 0
          local.get 2
          i32.const 8
          i32.add
          i32.const 6160
          call $memcpy
          drop
          local.get 2
          i32.const 6256
          i32.add
          global.set $__stack_pointer
          return
        end
        i32.const 156
        call $_ZN22wasi_snapshot_preview16macros11unreachable17h6a56810d80d9499dE
        unreachable
      end
      local.get 2
      i32.const 6208
      i32.add
      call $_ZN4core3ptr68drop_in_place$LT$wasi_snapshot_preview1..descriptors..Descriptor$GT$17hd9864df47f78c429E
      i32.const 156
      call $_ZN22wasi_snapshot_preview16macros11unreachable17h6a56810d80d9499dE
      unreachable
    )
    (func $_ZN22wasi_snapshot_preview16macros10eprint_u3215eprint_u32_impl17h1776974afc22446fE (;45;) (type 0) (param i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      block ;; label = @1
        local.get 0
        i32.eqz
        br_if 0 (;@1;)
        local.get 0
        i32.const 10
        i32.div_u
        local.tee 2
        call $_ZN22wasi_snapshot_preview16macros10eprint_u3215eprint_u32_impl17h1776974afc22446fE
        local.get 1
        local.get 2
        i32.const 246
        i32.mul
        local.get 0
        i32.add
        i32.const 48
        i32.or
        i32.store8 offset=15
        local.get 1
        i32.const 15
        i32.add
        i32.const 1
        call $_ZN22wasi_snapshot_preview16macros5print17ha7c82b92dc06cf3aE
      end
      local.get 1
      i32.const 16
      i32.add
      global.set $__stack_pointer
    )
    (func $_ZN22wasi_snapshot_preview16macros10eprint_u3217h5efd77e736dae32fE (;46;) (type 0) (param i32)
      local.get 0
      call $_ZN22wasi_snapshot_preview16macros10eprint_u3215eprint_u32_impl17h1776974afc22446fE
    )
    (func $get_state_ptr (;47;) (type 8) (result i32)
      global.get $internal_state_ptr
    )
    (func $set_state_ptr (;48;) (type 0) (param i32)
      local.get 0
      global.set $internal_state_ptr
    )
    (func $get_allocation_state (;49;) (type 8) (result i32)
      global.get $allocation_state
    )
    (func $set_allocation_state (;50;) (type 0) (param i32)
      local.get 0
      global.set $allocation_state
    )
    (func $_ZN17compiler_builtins3mem6memcpy17he2d289fa2eb42ef2E (;51;) (type 9) (param i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          local.get 2
          i32.const 16
          i32.ge_u
          br_if 0 (;@2;)
          local.get 0
          local.set 3
          br 1 (;@1;)
        end
        local.get 0
        i32.const 0
        local.get 0
        i32.sub
        i32.const 3
        i32.and
        local.tee 4
        i32.add
        local.set 5
        block ;; label = @2
          local.get 4
          i32.eqz
          br_if 0 (;@2;)
          local.get 0
          local.set 3
          local.get 1
          local.set 6
          loop ;; label = @3
            local.get 3
            local.get 6
            i32.load8_u
            i32.store8
            local.get 6
            i32.const 1
            i32.add
            local.set 6
            local.get 3
            i32.const 1
            i32.add
            local.tee 3
            local.get 5
            i32.lt_u
            br_if 0 (;@3;)
          end
        end
        local.get 5
        local.get 2
        local.get 4
        i32.sub
        local.tee 7
        i32.const -4
        i32.and
        local.tee 8
        i32.add
        local.set 3
        block ;; label = @2
          block ;; label = @3
            local.get 1
            local.get 4
            i32.add
            local.tee 9
            i32.const 3
            i32.and
            i32.eqz
            br_if 0 (;@3;)
            local.get 8
            i32.const 1
            i32.lt_s
            br_if 1 (;@2;)
            local.get 9
            i32.const 3
            i32.shl
            local.tee 6
            i32.const 24
            i32.and
            local.set 2
            local.get 9
            i32.const -4
            i32.and
            local.tee 10
            i32.const 4
            i32.add
            local.set 1
            i32.const 0
            local.get 6
            i32.sub
            i32.const 24
            i32.and
            local.set 4
            local.get 10
            i32.load
            local.set 6
            loop ;; label = @4
              local.get 5
              local.get 6
              local.get 2
              i32.shr_u
              local.get 1
              i32.load
              local.tee 6
              local.get 4
              i32.shl
              i32.or
              i32.store
              local.get 1
              i32.const 4
              i32.add
              local.set 1
              local.get 5
              i32.const 4
              i32.add
              local.tee 5
              local.get 3
              i32.lt_u
              br_if 0 (;@4;)
              br 2 (;@2;)
            end
          end
          local.get 8
          i32.const 1
          i32.lt_s
          br_if 0 (;@2;)
          local.get 9
          local.set 1
          loop ;; label = @3
            local.get 5
            local.get 1
            i32.load
            i32.store
            local.get 1
            i32.const 4
            i32.add
            local.set 1
            local.get 5
            i32.const 4
            i32.add
            local.tee 5
            local.get 3
            i32.lt_u
            br_if 0 (;@3;)
          end
        end
        local.get 7
        i32.const 3
        i32.and
        local.set 2
        local.get 9
        local.get 8
        i32.add
        local.set 1
      end
      block ;; label = @1
        local.get 2
        i32.eqz
        br_if 0 (;@1;)
        local.get 3
        local.get 2
        i32.add
        local.set 5
        loop ;; label = @2
          local.get 3
          local.get 1
          i32.load8_u
          i32.store8
          local.get 1
          i32.const 1
          i32.add
          local.set 1
          local.get 3
          i32.const 1
          i32.add
          local.tee 3
          local.get 5
          i32.lt_u
          br_if 0 (;@2;)
        end
      end
      local.get 0
    )
    (func $_ZN17compiler_builtins3mem6memset17h7cd7cef2899efd6aE (;52;) (type 9) (param i32 i32 i32) (result i32)
      (local i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          local.get 2
          i32.const 16
          i32.ge_u
          br_if 0 (;@2;)
          local.get 0
          local.set 3
          br 1 (;@1;)
        end
        local.get 0
        i32.const 0
        local.get 0
        i32.sub
        i32.const 3
        i32.and
        local.tee 4
        i32.add
        local.set 5
        block ;; label = @2
          local.get 4
          i32.eqz
          br_if 0 (;@2;)
          local.get 0
          local.set 3
          loop ;; label = @3
            local.get 3
            local.get 1
            i32.store8
            local.get 3
            i32.const 1
            i32.add
            local.tee 3
            local.get 5
            i32.lt_u
            br_if 0 (;@3;)
          end
        end
        local.get 5
        local.get 2
        local.get 4
        i32.sub
        local.tee 4
        i32.const -4
        i32.and
        local.tee 2
        i32.add
        local.set 3
        block ;; label = @2
          local.get 2
          i32.const 1
          i32.lt_s
          br_if 0 (;@2;)
          local.get 1
          i32.const 255
          i32.and
          i32.const 16843009
          i32.mul
          local.set 2
          loop ;; label = @3
            local.get 5
            local.get 2
            i32.store
            local.get 5
            i32.const 4
            i32.add
            local.tee 5
            local.get 3
            i32.lt_u
            br_if 0 (;@3;)
          end
        end
        local.get 4
        i32.const 3
        i32.and
        local.set 2
      end
      block ;; label = @1
        local.get 2
        i32.eqz
        br_if 0 (;@1;)
        local.get 3
        local.get 2
        i32.add
        local.set 5
        loop ;; label = @2
          local.get 3
          local.get 1
          i32.store8
          local.get 3
          i32.const 1
          i32.add
          local.tee 3
          local.get 5
          i32.lt_u
          br_if 0 (;@2;)
        end
      end
      local.get 0
    )
    (func $memcpy (;53;) (type 9) (param i32 i32 i32) (result i32)
      local.get 0
      local.get 1
      local.get 2
      call $_ZN17compiler_builtins3mem6memcpy17he2d289fa2eb42ef2E
    )
    (func $memset (;54;) (type 9) (param i32 i32 i32) (result i32)
      local.get 0
      local.get 1
      local.get 2
      call $_ZN17compiler_builtins3mem6memset17h7cd7cef2899efd6aE
    )
    (func $allocate_stack (;55;) (type 11)
      global.get $allocation_state
      i32.const 0
      i32.eq
      if ;; label = @1
        i32.const 1
        global.set $allocation_state
        i32.const 0
        i32.const 0
        i32.const 8
        i32.const 65536
        call $_ZN22wasi_snapshot_preview15State3new12cabi_realloc17h166deae888bb231bE
        i32.const 65536
        i32.add
        global.set $__stack_pointer
        i32.const 2
        global.set $allocation_state
      end
    )
    (global $__stack_pointer (;0;) (mut i32) i32.const 0)
    (global $internal_state_ptr (;1;) (mut i32) i32.const 0)
    (global $allocation_state (;2;) (mut i32) i32.const 0)
    (export "fd_write" (func $fd_write))
    (export "environ_get" (func $environ_get))
    (export "environ_sizes_get" (func $environ_sizes_get))
    (export "cabi_import_realloc" (func $cabi_import_realloc))
    (export "proc_exit" (func $proc_exit))
    (@producers
      (language "Rust" "")
      (processed-by "rustc" "1.79.0 (129f3b996 2024-06-10)")
    )
  )
  (core module (;2;)
    (type (;0;) (func (param i32 i32 i32)))
    (type (;1;) (func (param i32)))
    (type (;2;) (func (param i32 i64 i32)))
    (type (;3;) (func (param i32 i32)))
    (type (;4;) (func (param i32 i32 i32 i32)))
    (type (;5;) (func (param i32 i32 i32 i32) (result i32)))
    (type (;6;) (func (param i32 i32) (result i32)))
    (type (;7;) (func (param i32)))
    (func $indirect-wasi:io/poll@0.2.0-poll (;0;) (type 0) (param i32 i32 i32)
      local.get 0
      local.get 1
      local.get 2
      i32.const 0
      call_indirect (type 0)
    )
    (func $indirect-wasi:io/poll@0.2.1-poll (;1;) (type 0) (param i32 i32 i32)
      local.get 0
      local.get 1
      local.get 2
      i32.const 1
      call_indirect (type 0)
    )
    (func $indirect-wasi:cli/environment@0.2.0-get-environment (;2;) (type 1) (param i32)
      local.get 0
      i32.const 2
      call_indirect (type 1)
    )
    (func $"indirect-wasi:filesystem/types@0.2.0-[method]descriptor.write-via-stream" (;3;) (type 2) (param i32 i64 i32)
      local.get 0
      local.get 1
      local.get 2
      i32.const 3
      call_indirect (type 2)
    )
    (func $"indirect-wasi:filesystem/types@0.2.0-[method]descriptor.append-via-stream" (;4;) (type 3) (param i32 i32)
      local.get 0
      local.get 1
      i32.const 4
      call_indirect (type 3)
    )
    (func $"indirect-wasi:filesystem/types@0.2.0-[method]descriptor.get-type" (;5;) (type 3) (param i32 i32)
      local.get 0
      local.get 1
      i32.const 5
      call_indirect (type 3)
    )
    (func $"indirect-wasi:filesystem/types@0.2.0-[method]descriptor.stat" (;6;) (type 3) (param i32 i32)
      local.get 0
      local.get 1
      i32.const 6
      call_indirect (type 3)
    )
    (func $indirect-wasi:filesystem/types@0.2.0-filesystem-error-code (;7;) (type 3) (param i32 i32)
      local.get 0
      local.get 1
      i32.const 7
      call_indirect (type 3)
    )
    (func $"indirect-wasi:io/streams@0.2.0-[method]output-stream.check-write" (;8;) (type 3) (param i32 i32)
      local.get 0
      local.get 1
      i32.const 8
      call_indirect (type 3)
    )
    (func $"indirect-wasi:io/streams@0.2.0-[method]output-stream.write" (;9;) (type 4) (param i32 i32 i32 i32)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      i32.const 9
      call_indirect (type 4)
    )
    (func $"indirect-wasi:io/streams@0.2.0-[method]output-stream.blocking-write-and-flush" (;10;) (type 4) (param i32 i32 i32 i32)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      i32.const 10
      call_indirect (type 4)
    )
    (func $"indirect-wasi:io/streams@0.2.0-[method]output-stream.blocking-flush" (;11;) (type 3) (param i32 i32)
      local.get 0
      local.get 1
      i32.const 11
      call_indirect (type 3)
    )
    (func $indirect-wasi:filesystem/preopens@0.2.0-get-directories (;12;) (type 1) (param i32)
      local.get 0
      i32.const 12
      call_indirect (type 1)
    )
    (func $adapt-wasi_snapshot_preview1-fd_write (;13;) (type 5) (param i32 i32 i32 i32) (result i32)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      i32.const 13
      call_indirect (type 5)
    )
    (func $adapt-wasi_snapshot_preview1-environ_get (;14;) (type 6) (param i32 i32) (result i32)
      local.get 0
      local.get 1
      i32.const 14
      call_indirect (type 6)
    )
    (func $adapt-wasi_snapshot_preview1-environ_sizes_get (;15;) (type 6) (param i32 i32) (result i32)
      local.get 0
      local.get 1
      i32.const 15
      call_indirect (type 6)
    )
    (func $adapt-wasi_snapshot_preview1-proc_exit (;16;) (type 7) (param i32)
      local.get 0
      i32.const 16
      call_indirect (type 7)
    )
    (table (;0;) 17 17 funcref)
    (export "0" (func $indirect-wasi:io/poll@0.2.0-poll))
    (export "1" (func $indirect-wasi:io/poll@0.2.1-poll))
    (export "2" (func $indirect-wasi:cli/environment@0.2.0-get-environment))
    (export "3" (func $"indirect-wasi:filesystem/types@0.2.0-[method]descriptor.write-via-stream"))
    (export "4" (func $"indirect-wasi:filesystem/types@0.2.0-[method]descriptor.append-via-stream"))
    (export "5" (func $"indirect-wasi:filesystem/types@0.2.0-[method]descriptor.get-type"))
    (export "6" (func $"indirect-wasi:filesystem/types@0.2.0-[method]descriptor.stat"))
    (export "7" (func $indirect-wasi:filesystem/types@0.2.0-filesystem-error-code))
    (export "8" (func $"indirect-wasi:io/streams@0.2.0-[method]output-stream.check-write"))
    (export "9" (func $"indirect-wasi:io/streams@0.2.0-[method]output-stream.write"))
    (export "10" (func $"indirect-wasi:io/streams@0.2.0-[method]output-stream.blocking-write-and-flush"))
    (export "11" (func $"indirect-wasi:io/streams@0.2.0-[method]output-stream.blocking-flush"))
    (export "12" (func $indirect-wasi:filesystem/preopens@0.2.0-get-directories))
    (export "13" (func $adapt-wasi_snapshot_preview1-fd_write))
    (export "14" (func $adapt-wasi_snapshot_preview1-environ_get))
    (export "15" (func $adapt-wasi_snapshot_preview1-environ_sizes_get))
    (export "16" (func $adapt-wasi_snapshot_preview1-proc_exit))
    (export "$imports" (table 0))
    (@producers
      (processed-by "wit-component" "0.212.0")
    )
  )
  (core module (;3;)
    (type (;0;) (func (param i32 i32 i32)))
    (type (;1;) (func (param i32)))
    (type (;2;) (func (param i32 i64 i32)))
    (type (;3;) (func (param i32 i32)))
    (type (;4;) (func (param i32 i32 i32 i32)))
    (type (;5;) (func (param i32 i32 i32 i32) (result i32)))
    (type (;6;) (func (param i32 i32) (result i32)))
    (type (;7;) (func (param i32)))
    (import "" "0" (func (;0;) (type 0)))
    (import "" "1" (func (;1;) (type 0)))
    (import "" "2" (func (;2;) (type 1)))
    (import "" "3" (func (;3;) (type 2)))
    (import "" "4" (func (;4;) (type 3)))
    (import "" "5" (func (;5;) (type 3)))
    (import "" "6" (func (;6;) (type 3)))
    (import "" "7" (func (;7;) (type 3)))
    (import "" "8" (func (;8;) (type 3)))
    (import "" "9" (func (;9;) (type 4)))
    (import "" "10" (func (;10;) (type 4)))
    (import "" "11" (func (;11;) (type 3)))
    (import "" "12" (func (;12;) (type 1)))
    (import "" "13" (func (;13;) (type 5)))
    (import "" "14" (func (;14;) (type 6)))
    (import "" "15" (func (;15;) (type 6)))
    (import "" "16" (func (;16;) (type 7)))
    (import "" "$imports" (table (;0;) 17 17 funcref))
    (elem (;0;) (i32.const 0) func 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16)
    (@producers
      (processed-by "wit-component" "0.212.0")
    )
  )
  (core instance (;0;) (instantiate 2))
  (alias export 2 "subscribe-duration" (func (;0;)))
  (core func (;0;) (canon lower (func 0)))
  (core instance (;1;)
    (export "subscribe-duration" (func 0))
  )
  (alias export 0 "pollable" (type (;24;)))
  (core func (;1;) (canon resource.drop 24))
  (alias core export 0 "0" (core func (;2;)))
  (core instance (;2;)
    (export "[resource-drop]pollable" (func 1))
    (export "poll" (func 2))
  )
  (alias export 3 "subscribe-duration" (func (;1;)))
  (core func (;3;) (canon lower (func 1)))
  (core instance (;3;)
    (export "subscribe-duration" (func 3))
  )
  (alias export 1 "pollable" (type (;25;)))
  (core func (;4;) (canon resource.drop 25))
  (alias core export 0 "1" (core func (;5;)))
  (core instance (;4;)
    (export "[resource-drop]pollable" (func 4))
    (export "poll" (func 5))
  )
  (alias core export 0 "13" (core func (;6;)))
  (alias core export 0 "14" (core func (;7;)))
  (alias core export 0 "15" (core func (;8;)))
  (alias core export 0 "16" (core func (;9;)))
  (core instance (;5;)
    (export "fd_write" (func 6))
    (export "environ_get" (func 7))
    (export "environ_sizes_get" (func 8))
    (export "proc_exit" (func 9))
  )
  (core instance (;6;) (instantiate 0
      (with "wasi:clocks/monotonic-clock@0.2.0" (instance 1))
      (with "wasi:io/poll@0.2.0" (instance 2))
      (with "wasi:clocks/monotonic-clock@0.2.1" (instance 3))
      (with "wasi:io/poll@0.2.1" (instance 4))
      (with "wasi_snapshot_preview1" (instance 5))
    )
  )
  (alias core export 6 "memory" (core memory (;0;)))
  (alias core export 6 "cabi_realloc" (core func (;10;)))
  (alias core export 6 "cabi_realloc" (core func (;11;)))
  (core instance (;7;)
    (export "cabi_realloc" (func 11))
  )
  (core instance (;8;)
    (export "memory" (memory 0))
  )
  (alias core export 0 "2" (core func (;12;)))
  (core instance (;9;)
    (export "get-environment" (func 12))
  )
  (alias export 12 "descriptor" (type (;26;)))
  (core func (;13;) (canon resource.drop 26))
  (alias core export 0 "3" (core func (;14;)))
  (alias core export 0 "4" (core func (;15;)))
  (alias core export 0 "5" (core func (;16;)))
  (alias core export 0 "6" (core func (;17;)))
  (alias core export 0 "7" (core func (;18;)))
  (core instance (;10;)
    (export "[resource-drop]descriptor" (func 13))
    (export "[method]descriptor.write-via-stream" (func 14))
    (export "[method]descriptor.append-via-stream" (func 15))
    (export "[method]descriptor.get-type" (func 16))
    (export "[method]descriptor.stat" (func 17))
    (export "filesystem-error-code" (func 18))
  )
  (alias export 7 "input-stream" (type (;27;)))
  (core func (;19;) (canon resource.drop 27))
  (alias export 7 "output-stream" (type (;28;)))
  (core func (;20;) (canon resource.drop 28))
  (alias core export 0 "8" (core func (;21;)))
  (alias core export 0 "9" (core func (;22;)))
  (alias core export 0 "10" (core func (;23;)))
  (alias core export 0 "11" (core func (;24;)))
  (core instance (;11;)
    (export "[resource-drop]input-stream" (func 19))
    (export "[resource-drop]output-stream" (func 20))
    (export "[method]output-stream.check-write" (func 21))
    (export "[method]output-stream.write" (func 22))
    (export "[method]output-stream.blocking-write-and-flush" (func 23))
    (export "[method]output-stream.blocking-flush" (func 24))
  )
  (alias export 6 "error" (type (;29;)))
  (core func (;25;) (canon resource.drop 29))
  (core instance (;12;)
    (export "[resource-drop]error" (func 25))
  )
  (alias core export 0 "12" (core func (;26;)))
  (core instance (;13;)
    (export "get-directories" (func 26))
  )
  (alias export 10 "get-stderr" (func (;2;)))
  (core func (;27;) (canon lower (func 2)))
  (core instance (;14;)
    (export "get-stderr" (func 27))
  )
  (alias export 8 "get-stdin" (func (;3;)))
  (core func (;28;) (canon lower (func 3)))
  (core instance (;15;)
    (export "get-stdin" (func 28))
  )
  (alias export 9 "get-stdout" (func (;4;)))
  (core func (;29;) (canon lower (func 4)))
  (core instance (;16;)
    (export "get-stdout" (func 29))
  )
  (alias export 5 "exit" (func (;5;)))
  (core func (;30;) (canon lower (func 5)))
  (core instance (;17;)
    (export "exit" (func 30))
  )
  (core instance (;18;) (instantiate 1
      (with "__main_module__" (instance 7))
      (with "env" (instance 8))
      (with "wasi:cli/environment@0.2.0" (instance 9))
      (with "wasi:filesystem/types@0.2.0" (instance 10))
      (with "wasi:io/streams@0.2.0" (instance 11))
      (with "wasi:io/error@0.2.0" (instance 12))
      (with "wasi:filesystem/preopens@0.2.0" (instance 13))
      (with "wasi:cli/stderr@0.2.0" (instance 14))
      (with "wasi:cli/stdin@0.2.0" (instance 15))
      (with "wasi:cli/stdout@0.2.0" (instance 16))
      (with "wasi:cli/exit@0.2.0" (instance 17))
    )
  )
  (alias core export 18 "cabi_import_realloc" (core func (;31;)))
  (alias core export 0 "$imports" (core table (;0;)))
  (alias export 0 "poll" (func (;6;)))
  (core func (;32;) (canon lower (func 6) (memory 0) (realloc 10)))
  (alias export 1 "poll" (func (;7;)))
  (core func (;33;) (canon lower (func 7) (memory 0) (realloc 10)))
  (alias export 4 "get-environment" (func (;8;)))
  (core func (;34;) (canon lower (func 8) (memory 0) (realloc 31) string-encoding=utf8))
  (alias export 12 "[method]descriptor.write-via-stream" (func (;9;)))
  (core func (;35;) (canon lower (func 9) (memory 0)))
  (alias export 12 "[method]descriptor.append-via-stream" (func (;10;)))
  (core func (;36;) (canon lower (func 10) (memory 0)))
  (alias export 12 "[method]descriptor.get-type" (func (;11;)))
  (core func (;37;) (canon lower (func 11) (memory 0)))
  (alias export 12 "[method]descriptor.stat" (func (;12;)))
  (core func (;38;) (canon lower (func 12) (memory 0)))
  (alias export 12 "filesystem-error-code" (func (;13;)))
  (core func (;39;) (canon lower (func 13) (memory 0)))
  (alias export 7 "[method]output-stream.check-write" (func (;14;)))
  (core func (;40;) (canon lower (func 14) (memory 0)))
  (alias export 7 "[method]output-stream.write" (func (;15;)))
  (core func (;41;) (canon lower (func 15) (memory 0)))
  (alias export 7 "[method]output-stream.blocking-write-and-flush" (func (;16;)))
  (core func (;42;) (canon lower (func 16) (memory 0)))
  (alias export 7 "[method]output-stream.blocking-flush" (func (;17;)))
  (core func (;43;) (canon lower (func 17) (memory 0)))
  (alias export 13 "get-directories" (func (;18;)))
  (core func (;44;) (canon lower (func 18) (memory 0) (realloc 31) string-encoding=utf8))
  (alias core export 18 "fd_write" (core func (;45;)))
  (alias core export 18 "environ_get" (core func (;46;)))
  (alias core export 18 "environ_sizes_get" (core func (;47;)))
  (alias core export 18 "proc_exit" (core func (;48;)))
  (core instance (;19;)
    (export "$imports" (table 0))
    (export "0" (func 32))
    (export "1" (func 33))
    (export "2" (func 34))
    (export "3" (func 35))
    (export "4" (func 36))
    (export "5" (func 37))
    (export "6" (func 38))
    (export "7" (func 39))
    (export "8" (func 40))
    (export "9" (func 41))
    (export "10" (func 42))
    (export "11" (func 43))
    (export "12" (func 44))
    (export "13" (func 45))
    (export "14" (func 46))
    (export "15" (func 47))
    (export "16" (func 48))
  )
  (core instance (;20;) (instantiate 3
      (with "" (instance 19))
    )
  )
  (type (;30;) (func))
  (alias core export 6 "test" (core func (;49;)))
  (func (;19;) (type 30) (canon lift (core func 49)))
  (export (;20;) "test" (func 19))
  (@producers
    (processed-by "wit-component" "0.212.0")
  )
)