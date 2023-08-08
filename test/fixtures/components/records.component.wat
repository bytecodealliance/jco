(component
  (type (;0;)
    (instance
      (type (;0;) (flags "a" "b"))
      (export (;1;) "f1" (type (eq 0)))
      (type (;2;) (flags "c" "d" "e"))
      (export (;3;) "f2" (type (eq 2)))
      (type (;4;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7"))
      (export (;5;) "flag8" (type (eq 4)))
      (type (;6;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7" "b8" "b9" "b10" "b11" "b12" "b13" "b14" "b15"))
      (export (;7;) "flag16" (type (eq 6)))
      (type (;8;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7" "b8" "b9" "b10" "b11" "b12" "b13" "b14" "b15" "b16" "b17" "b18" "b19" "b20" "b21" "b22" "b23" "b24" "b25" "b26" "b27" "b28" "b29" "b30" "b31"))
      (export (;9;) "flag32" (type (eq 8)))
      (type (;10;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7" "b8" "b9" "b10" "b11" "b12" "b13" "b14" "b15" "b16" "b17" "b18" "b19" "b20" "b21" "b22" "b23" "b24" "b25" "b26" "b27" "b28" "b29" "b30" "b31" "b32" "b33" "b34" "b35" "b36" "b37" "b38" "b39" "b40" "b41" "b42" "b43" "b44" "b45" "b46" "b47" "b48" "b49" "b50" "b51" "b52" "b53" "b54" "b55" "b56" "b57" "b58" "b59" "b60" "b61" "b62" "b63"))
      (export (;11;) "flag64" (type (eq 10)))
      (type (;12;) (record (field "a" u8) (field "b" 1)))
      (export (;13;) "r1" (type (eq 12)))
      (type (;14;) (func (result "a" u8) (result "b" u16)))
      (export (;0;) "multiple-results" (func (type 14)))
      (type (;15;) (tuple u8 u32))
      (type (;16;) (tuple u32 u8))
      (type (;17;) (func (param "a" 15) (result 16)))
      (export (;1;) "swap-tuple" (func (type 17)))
      (type (;18;) (func (param "a" 1) (result 1)))
      (export (;2;) "roundtrip-flags1" (func (type 18)))
      (type (;19;) (func (param "a" 3) (result 3)))
      (export (;3;) "roundtrip-flags2" (func (type 19)))
      (type (;20;) (func (param "a" 5) (param "b" 7) (param "c" 9) (param "d" 11) (result "f8" 5) (result "f16" 7) (result "f32" 9) (result "f64" 11)))
      (export (;4;) "roundtrip-flags3" (func (type 20)))
      (type (;21;) (func (param "a" 13) (result 13)))
      (export (;5;) "roundtrip-record1" (func (type 21)))
      (type (;22;) (tuple u8))
      (type (;23;) (func (param "a" 22) (result 22)))
      (export (;6;) "tuple1" (func (type 23)))
    )
  )
  (import (interface "test:records/test") (instance (;0;) (type 0)))
  (type (;1;)
    (instance
      (type (;0;) (list u8))
      (type (;1;) (func (param "bytes" 0)))
      (export (;0;) "log" (func (type 1)))
      (export (;1;) "log-err" (func (type 1)))
    )
  )
  (import "testwasi" (instance (;1;) (type 1)))
  (core module (;0;)
    (type $.rodata (;0;) (func (param i32 i32 i32) (result i32)))
    (type $.data (;1;) (func (param i32)))
    (type (;2;) (func (param i32 i32 i32)))
    (type (;3;) (func (param i32) (result i32)))
    (type (;4;) (func (param i32 i32 i32 i32 i32 i32)))
    (type (;5;) (func (param i32 i64 i32 i32) (result i32)))
    (type (;6;) (func (param i32 i32 i32 i32) (result i32)))
    (type (;7;) (func))
    (type (;8;) (func (param i32 i32)))
    (type (;9;) (func (param i32 i32 i32 i64 i32 i32 i32 i32)))
    (type (;10;) (func (result i32)))
    (type (;11;) (func (param i32 i32) (result i32)))
    (type (;12;) (func (param i32 i32 i32 i32 i32) (result i32)))
    (type (;13;) (func (param i32 i32 i32 i32)))
    (type (;14;) (func (param i32 i64 i32) (result i64)))
    (type (;15;) (func (param f64 i32) (result f64)))
    (type (;16;) (func (param i32 i32 i32 i32 i32)))
    (import "test:records/test" "multiple-results" (func $__wasm_import_test_records_test_multiple_results (;0;) (type $.data)))
    (import "test:records/test" "swap-tuple" (func $__wasm_import_test_records_test_swap_tuple (;1;) (type 2)))
    (import "test:records/test" "roundtrip-flags1" (func $__wasm_import_test_records_test_roundtrip_flags1 (;2;) (type 3)))
    (import "test:records/test" "roundtrip-flags2" (func $__wasm_import_test_records_test_roundtrip_flags2 (;3;) (type 3)))
    (import "test:records/test" "roundtrip-flags3" (func $__wasm_import_test_records_test_roundtrip_flags3 (;4;) (type 4)))
    (import "test:records/test" "roundtrip-record1" (func $__wasm_import_test_records_test_roundtrip_record1 (;5;) (type 2)))
    (import "test:records/test" "tuple1" (func $__wasm_import_test_records_test_tuple1 (;6;) (type 3)))
    (import "wasi_snapshot_preview1" "fd_close" (func $__imported_wasi_snapshot_preview1_fd_close (;7;) (type 3)))
    (import "wasi_snapshot_preview1" "fd_seek" (func $__imported_wasi_snapshot_preview1_fd_seek (;8;) (type 5)))
    (import "wasi_snapshot_preview1" "fd_write" (func $__imported_wasi_snapshot_preview1_fd_write (;9;) (type 6)))
    (func $__wasm_call_ctors (;10;) (type 7))
    (func $_initialize (;11;) (type 7)
      block ;; label = @1
        i32.const 0
        i32.load offset=4592
        i32.eqz
        br_if 0 (;@1;)
        unreachable
        unreachable
      end
      i32.const 0
      i32.const 1
      i32.store offset=4592
      call $__wasm_call_ctors
    )
    (func $records_test_imports (;12;) (type 7)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 i64 i64 i64 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 0
      i32.const 96
      local.set 1
      local.get 0
      local.get 1
      i32.sub
      local.set 2
      local.get 2
      global.set $__stack_pointer
      i32.const 95
      local.set 3
      local.get 2
      local.get 3
      i32.add
      local.set 4
      local.get 4
      local.set 5
      i32.const 92
      local.set 6
      local.get 2
      local.get 6
      i32.add
      local.set 7
      local.get 7
      local.set 8
      local.get 5
      local.get 8
      call $test_records_test_multiple_results
      local.get 2
      i32.load8_u offset=95
      local.set 9
      i32.const 255
      local.set 10
      local.get 9
      local.get 10
      i32.and
      local.set 11
      i32.const 4
      local.set 12
      local.get 11
      local.set 13
      local.get 12
      local.set 14
      local.get 13
      local.get 14
      i32.eq
      local.set 15
      i32.const 1
      local.set 16
      local.get 15
      local.get 16
      i32.and
      local.set 17
      block ;; label = @1
        local.get 17
        br_if 0 (;@1;)
        i32.const 1477
        local.set 18
        i32.const 1082
        local.set 19
        i32.const 9
        local.set 20
        i32.const 1053
        local.set 21
        local.get 18
        local.get 19
        local.get 20
        local.get 21
        call $__assert_fail
        unreachable
      end
      local.get 2
      i32.load16_u offset=92
      local.set 22
      i32.const 65535
      local.set 23
      local.get 22
      local.get 23
      i32.and
      local.set 24
      i32.const 5
      local.set 25
      local.get 24
      local.set 26
      local.get 25
      local.set 27
      local.get 26
      local.get 27
      i32.eq
      local.set 28
      i32.const 1
      local.set 29
      local.get 28
      local.get 29
      i32.and
      local.set 30
      block ;; label = @1
        local.get 30
        br_if 0 (;@1;)
        i32.const 1470
        local.set 31
        i32.const 1082
        local.set 32
        i32.const 10
        local.set 33
        i32.const 1053
        local.set 34
        local.get 31
        local.get 32
        local.get 33
        local.get 34
        call $__assert_fail
        unreachable
      end
      i32.const 1
      local.set 35
      local.get 2
      local.get 35
      i32.store8 offset=80
      i32.const 2
      local.set 36
      local.get 2
      local.get 36
      i32.store offset=84
      i32.const 80
      local.set 37
      local.get 2
      local.get 37
      i32.add
      local.set 38
      local.get 38
      local.set 39
      i32.const 72
      local.set 40
      local.get 2
      local.get 40
      i32.add
      local.set 41
      local.get 41
      local.set 42
      local.get 39
      local.get 42
      call $test_records_test_swap_tuple
      local.get 2
      i32.load offset=72
      local.set 43
      i32.const 2
      local.set 44
      local.get 43
      local.set 45
      local.get 44
      local.set 46
      local.get 45
      local.get 46
      i32.eq
      local.set 47
      i32.const 1
      local.set 48
      local.get 47
      local.get 48
      i32.and
      local.set 49
      block ;; label = @1
        local.get 49
        br_if 0 (;@1;)
        i32.const 1560
        local.set 50
        i32.const 1082
        local.set 51
        i32.const 18
        local.set 52
        i32.const 1053
        local.set 53
        local.get 50
        local.get 51
        local.get 52
        local.get 53
        call $__assert_fail
        unreachable
      end
      local.get 2
      i32.load8_u offset=76
      local.set 54
      i32.const 255
      local.set 55
      local.get 54
      local.get 55
      i32.and
      local.set 56
      i32.const 1
      local.set 57
      local.get 56
      local.set 58
      local.get 57
      local.set 59
      local.get 58
      local.get 59
      i32.eq
      local.set 60
      i32.const 1
      local.set 61
      local.get 60
      local.get 61
      i32.and
      local.set 62
      block ;; label = @1
        local.get 62
        br_if 0 (;@1;)
        i32.const 1613
        local.set 63
        i32.const 1082
        local.set 64
        i32.const 19
        local.set 65
        i32.const 1053
        local.set 66
        local.get 63
        local.get 64
        local.get 65
        local.get 66
        call $__assert_fail
        unreachable
      end
      i32.const 1
      local.set 67
      i32.const 255
      local.set 68
      local.get 67
      local.get 68
      i32.and
      local.set 69
      local.get 69
      call $test_records_test_roundtrip_flags1
      local.set 70
      i32.const 255
      local.set 71
      local.get 70
      local.get 71
      i32.and
      local.set 72
      i32.const 1
      local.set 73
      local.get 72
      local.set 74
      local.get 73
      local.set 75
      local.get 74
      local.get 75
      i32.eq
      local.set 76
      i32.const 1
      local.set 77
      local.get 76
      local.get 77
      i32.and
      local.set 78
      block ;; label = @1
        local.get 78
        br_if 0 (;@1;)
        i32.const 1376
        local.set 79
        i32.const 1082
        local.set 80
        i32.const 21
        local.set 81
        i32.const 1053
        local.set 82
        local.get 79
        local.get 80
        local.get 81
        local.get 82
        call $__assert_fail
        unreachable
      end
      i32.const 0
      local.set 83
      i32.const 255
      local.set 84
      local.get 83
      local.get 84
      i32.and
      local.set 85
      local.get 85
      call $test_records_test_roundtrip_flags1
      local.set 86
      i32.const 255
      local.set 87
      local.get 86
      local.get 87
      i32.and
      local.set 88
      block ;; label = @1
        local.get 88
        i32.eqz
        br_if 0 (;@1;)
        i32.const 1736
        local.set 89
        i32.const 1082
        local.set 90
        i32.const 22
        local.set 91
        i32.const 1053
        local.set 92
        local.get 89
        local.get 90
        local.get 91
        local.get 92
        call $__assert_fail
        unreachable
      end
      i32.const 2
      local.set 93
      i32.const 255
      local.set 94
      local.get 93
      local.get 94
      i32.and
      local.set 95
      local.get 95
      call $test_records_test_roundtrip_flags1
      local.set 96
      i32.const 255
      local.set 97
      local.get 96
      local.get 97
      i32.and
      local.set 98
      i32.const 2
      local.set 99
      local.get 98
      local.set 100
      local.get 99
      local.set 101
      local.get 100
      local.get 101
      i32.eq
      local.set 102
      i32.const 1
      local.set 103
      local.get 102
      local.get 103
      i32.and
      local.set 104
      block ;; label = @1
        local.get 104
        br_if 0 (;@1;)
        i32.const 1291
        local.set 105
        i32.const 1082
        local.set 106
        i32.const 23
        local.set 107
        i32.const 1053
        local.set 108
        local.get 105
        local.get 106
        local.get 107
        local.get 108
        call $__assert_fail
        unreachable
      end
      i32.const 3
      local.set 109
      i32.const 255
      local.set 110
      local.get 109
      local.get 110
      i32.and
      local.set 111
      local.get 111
      call $test_records_test_roundtrip_flags1
      local.set 112
      i32.const 255
      local.set 113
      local.get 112
      local.get 113
      i32.and
      local.set 114
      i32.const 3
      local.set 115
      local.get 114
      local.set 116
      local.get 115
      local.set 117
      local.get 116
      local.get 117
      i32.eq
      local.set 118
      i32.const 1
      local.set 119
      local.get 118
      local.get 119
      i32.and
      local.set 120
      block ;; label = @1
        local.get 120
        br_if 0 (;@1;)
        i32.const 1982
        local.set 121
        i32.const 1082
        local.set 122
        i32.const 24
        local.set 123
        i32.const 1053
        local.set 124
        local.get 121
        local.get 122
        local.get 123
        local.get 124
        call $__assert_fail
        unreachable
      end
      i32.const 1
      local.set 125
      i32.const 255
      local.set 126
      local.get 125
      local.get 126
      i32.and
      local.set 127
      local.get 127
      call $test_records_test_roundtrip_flags2
      local.set 128
      i32.const 255
      local.set 129
      local.get 128
      local.get 129
      i32.and
      local.set 130
      i32.const 1
      local.set 131
      local.get 130
      local.set 132
      local.get 131
      local.set 133
      local.get 132
      local.get 133
      i32.eq
      local.set 134
      i32.const 1
      local.set 135
      local.get 134
      local.get 135
      i32.and
      local.set 136
      block ;; label = @1
        local.get 136
        br_if 0 (;@1;)
        i32.const 1206
        local.set 137
        i32.const 1082
        local.set 138
        i32.const 26
        local.set 139
        i32.const 1053
        local.set 140
        local.get 137
        local.get 138
        local.get 139
        local.get 140
        call $__assert_fail
        unreachable
      end
      i32.const 0
      local.set 141
      i32.const 255
      local.set 142
      local.get 141
      local.get 142
      i32.and
      local.set 143
      local.get 143
      call $test_records_test_roundtrip_flags2
      local.set 144
      i32.const 255
      local.set 145
      local.get 144
      local.get 145
      i32.and
      local.set 146
      block ;; label = @1
        local.get 146
        i32.eqz
        br_if 0 (;@1;)
        i32.const 1693
        local.set 147
        i32.const 1082
        local.set 148
        i32.const 27
        local.set 149
        i32.const 1053
        local.set 150
        local.get 147
        local.get 148
        local.get 149
        local.get 150
        call $__assert_fail
        unreachable
      end
      i32.const 2
      local.set 151
      i32.const 255
      local.set 152
      local.get 151
      local.get 152
      i32.and
      local.set 153
      local.get 153
      call $test_records_test_roundtrip_flags2
      local.set 154
      i32.const 255
      local.set 155
      local.get 154
      local.get 155
      i32.and
      local.set 156
      i32.const 2
      local.set 157
      local.get 156
      local.set 158
      local.get 157
      local.set 159
      local.get 158
      local.get 159
      i32.eq
      local.set 160
      i32.const 1
      local.set 161
      local.get 160
      local.get 161
      i32.and
      local.set 162
      block ;; label = @1
        local.get 162
        br_if 0 (;@1;)
        i32.const 1121
        local.set 163
        i32.const 1082
        local.set 164
        i32.const 28
        local.set 165
        i32.const 1053
        local.set 166
        local.get 163
        local.get 164
        local.get 165
        local.get 166
        call $__assert_fail
        unreachable
      end
      i32.const 5
      local.set 167
      i32.const 255
      local.set 168
      local.get 167
      local.get 168
      i32.and
      local.set 169
      local.get 169
      call $test_records_test_roundtrip_flags2
      local.set 170
      i32.const 255
      local.set 171
      local.get 170
      local.get 171
      i32.and
      local.set 172
      i32.const 5
      local.set 173
      local.get 172
      local.set 174
      local.get 173
      local.set 175
      local.get 174
      local.get 175
      i32.eq
      local.set 176
      i32.const 1
      local.set 177
      local.get 176
      local.get 177
      i32.and
      local.set 178
      block ;; label = @1
        local.get 178
        br_if 0 (;@1;)
        i32.const 1788
        local.set 179
        i32.const 1082
        local.set 180
        i32.const 29
        local.set 181
        i32.const 1053
        local.set 182
        local.get 179
        local.get 180
        local.get 181
        local.get 182
        call $__assert_fail
        unreachable
      end
      i32.const 1
      local.set 183
      i32.const 2
      local.set 184
      i32.const 4
      local.set 185
      i64.const 8
      local.set 186
      i32.const 71
      local.set 187
      local.get 2
      local.get 187
      i32.add
      local.set 188
      local.get 188
      local.set 189
      i32.const 68
      local.set 190
      local.get 2
      local.get 190
      i32.add
      local.set 191
      local.get 191
      local.set 192
      i32.const 64
      local.set 193
      local.get 2
      local.get 193
      i32.add
      local.set 194
      local.get 194
      local.set 195
      i32.const 56
      local.set 196
      local.get 2
      local.get 196
      i32.add
      local.set 197
      local.get 197
      local.set 198
      i32.const 255
      local.set 199
      local.get 183
      local.get 199
      i32.and
      local.set 200
      i32.const 65535
      local.set 201
      local.get 184
      local.get 201
      i32.and
      local.set 202
      local.get 200
      local.get 202
      local.get 185
      local.get 186
      local.get 189
      local.get 192
      local.get 195
      local.get 198
      call $test_records_test_roundtrip_flags3
      local.get 2
      i32.load8_u offset=71
      local.set 203
      i32.const 255
      local.set 204
      local.get 203
      local.get 204
      i32.and
      local.set 205
      i32.const 1
      local.set 206
      local.get 205
      local.set 207
      local.get 206
      local.set 208
      local.get 207
      local.get 208
      i32.eq
      local.set 209
      i32.const 1
      local.set 210
      local.get 209
      local.get 210
      i32.and
      local.set 211
      block ;; label = @1
        local.get 211
        br_if 0 (;@1;)
        i32.const 1639
        local.set 212
        i32.const 1082
        local.set 213
        i32.const 37
        local.set 214
        i32.const 1053
        local.set 215
        local.get 212
        local.get 213
        local.get 214
        local.get 215
        call $__assert_fail
        unreachable
      end
      local.get 2
      i32.load16_u offset=68
      local.set 216
      i32.const 65535
      local.set 217
      local.get 216
      local.get 217
      i32.and
      local.set 218
      i32.const 2
      local.set 219
      local.get 218
      local.set 220
      local.get 219
      local.set 221
      local.get 220
      local.get 221
      i32.eq
      local.set 222
      i32.const 1
      local.set 223
      local.get 222
      local.get 223
      i32.and
      local.set 224
      block ;; label = @1
        local.get 224
        br_if 0 (;@1;)
        i32.const 1575
        local.set 225
        i32.const 1082
        local.set 226
        i32.const 38
        local.set 227
        i32.const 1053
        local.set 228
        local.get 225
        local.get 226
        local.get 227
        local.get 228
        call $__assert_fail
        unreachable
      end
      local.get 2
      i32.load offset=64
      local.set 229
      i32.const 4
      local.set 230
      local.get 229
      local.set 231
      local.get 230
      local.set 232
      local.get 231
      local.get 232
      i32.eq
      local.set 233
      i32.const 1
      local.set 234
      local.get 233
      local.get 234
      i32.and
      local.set 235
      block ;; label = @1
        local.get 235
        br_if 0 (;@1;)
        i32.const 1522
        local.set 236
        i32.const 1082
        local.set 237
        i32.const 39
        local.set 238
        i32.const 1053
        local.set 239
        local.get 236
        local.get 237
        local.get 238
        local.get 239
        call $__assert_fail
        unreachable
      end
      local.get 2
      i64.load offset=56
      local.set 240
      i64.const 8
      local.set 241
      local.get 240
      local.set 242
      local.get 241
      local.set 243
      local.get 242
      local.get 243
      i64.eq
      local.set 244
      i32.const 1
      local.set 245
      local.get 244
      local.get 245
      i32.and
      local.set 246
      block ;; label = @1
        local.get 246
        br_if 0 (;@1;)
        i32.const 1484
        local.set 247
        i32.const 1082
        local.set 248
        i32.const 40
        local.set 249
        i32.const 1053
        local.set 250
        local.get 247
        local.get 248
        local.get 249
        local.get 250
        call $__assert_fail
        unreachable
      end
      i32.const 8
      local.set 251
      local.get 2
      local.get 251
      i32.store8 offset=48
      i32.const 0
      local.set 252
      local.get 2
      local.get 252
      i32.store8 offset=49
      i32.const 48
      local.set 253
      local.get 2
      local.get 253
      i32.add
      local.set 254
      local.get 254
      local.set 255
      i32.const 40
      local.set 256
      local.get 2
      local.get 256
      i32.add
      local.set 257
      local.get 257
      local.set 258
      local.get 255
      local.get 258
      call $test_records_test_roundtrip_record1
      local.get 2
      i32.load8_u offset=40
      local.set 259
      i32.const 255
      local.set 260
      local.get 259
      local.get 260
      i32.and
      local.set 261
      i32.const 8
      local.set 262
      local.get 261
      local.set 263
      local.get 262
      local.set 264
      local.get 263
      local.get 264
      i32.eq
      local.set 265
      i32.const 1
      local.set 266
      local.get 265
      local.get 266
      i32.and
      local.set 267
      block ;; label = @1
        local.get 267
        br_if 0 (;@1;)
        i32.const 1461
        local.set 268
        i32.const 1082
        local.set 269
        i32.const 47
        local.set 270
        i32.const 1053
        local.set 271
        local.get 268
        local.get 269
        local.get 270
        local.get 271
        call $__assert_fail
        unreachable
      end
      local.get 2
      i32.load8_u offset=41
      local.set 272
      i32.const 255
      local.set 273
      local.get 272
      local.get 273
      i32.and
      local.set 274
      block ;; label = @1
        local.get 274
        i32.eqz
        br_if 0 (;@1;)
        i32.const 1675
        local.set 275
        i32.const 1082
        local.set 276
        i32.const 48
        local.set 277
        i32.const 1053
        local.set 278
        local.get 275
        local.get 276
        local.get 277
        local.get 278
        call $__assert_fail
        unreachable
      end
      i32.const 0
      local.set 279
      local.get 2
      local.get 279
      i32.store8 offset=32
      i32.const 3
      local.set 280
      local.get 2
      local.get 280
      i32.store8 offset=33
      i32.const 32
      local.set 281
      local.get 2
      local.get 281
      i32.add
      local.set 282
      local.get 282
      local.set 283
      i32.const 24
      local.set 284
      local.get 2
      local.get 284
      i32.add
      local.set 285
      local.get 285
      local.set 286
      local.get 283
      local.get 286
      call $test_records_test_roundtrip_record1
      local.get 2
      i32.load8_u offset=24
      local.set 287
      i32.const 255
      local.set 288
      local.get 287
      local.get 288
      i32.and
      local.set 289
      block ;; label = @1
        local.get 289
        i32.eqz
        br_if 0 (;@1;)
        i32.const 1684
        local.set 290
        i32.const 1082
        local.set 291
        i32.const 56
        local.set 292
        i32.const 1053
        local.set 293
        local.get 290
        local.get 291
        local.get 292
        local.get 293
        call $__assert_fail
        unreachable
      end
      local.get 2
      i32.load8_u offset=25
      local.set 294
      i32.const 255
      local.set 295
      local.get 294
      local.get 295
      i32.and
      local.set 296
      i32.const 3
      local.set 297
      local.get 296
      local.set 298
      local.get 297
      local.set 299
      local.get 298
      local.get 299
      i32.eq
      local.set 300
      i32.const 1
      local.set 301
      local.get 300
      local.get 301
      i32.and
      local.set 302
      block ;; label = @1
        local.get 302
        br_if 0 (;@1;)
        i32.const 1925
        local.set 303
        i32.const 1082
        local.set 304
        i32.const 57
        local.set 305
        i32.const 1053
        local.set 306
        local.get 303
        local.get 304
        local.get 305
        local.get 306
        call $__assert_fail
        unreachable
      end
      i32.const 1
      local.set 307
      local.get 2
      local.get 307
      i32.store8 offset=16
      i32.const 16
      local.set 308
      local.get 2
      local.get 308
      i32.add
      local.set 309
      local.get 309
      local.set 310
      i32.const 8
      local.set 311
      local.get 2
      local.get 311
      i32.add
      local.set 312
      local.get 312
      local.set 313
      local.get 310
      local.get 313
      call $test_records_test_tuple1
      local.get 2
      i32.load8_u offset=8
      local.set 314
      i32.const 255
      local.set 315
      local.get 314
      local.get 315
      i32.and
      local.set 316
      i32.const 1
      local.set 317
      local.get 316
      local.set 318
      local.get 317
      local.set 319
      local.get 318
      local.get 319
      i32.eq
      local.set 320
      i32.const 1
      local.set 321
      local.get 320
      local.get 321
      i32.and
      local.set 322
      block ;; label = @1
        local.get 322
        br_if 0 (;@1;)
        i32.const 1628
        local.set 323
        i32.const 1082
        local.set 324
        i32.const 63
        local.set 325
        i32.const 1053
        local.set 326
        local.get 323
        local.get 324
        local.get 325
        local.get 326
        call $__assert_fail
        unreachable
      end
      i32.const 96
      local.set 327
      local.get 2
      local.get 327
      i32.add
      local.set 328
      local.get 328
      global.set $__stack_pointer
      return
    )
    (func $exports_test_records_test_multiple_results (;13;) (type 8) (param i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 2
      i32.const 16
      local.set 3
      local.get 2
      local.get 3
      i32.sub
      local.set 4
      local.get 4
      local.get 0
      i32.store offset=12
      local.get 4
      local.get 1
      i32.store offset=8
      local.get 4
      i32.load offset=12
      local.set 5
      i32.const 100
      local.set 6
      local.get 5
      local.get 6
      i32.store8
      local.get 4
      i32.load offset=8
      local.set 7
      i32.const 200
      local.set 8
      local.get 7
      local.get 8
      i32.store16
      return
    )
    (func $exports_test_records_test_swap_tuple (;14;) (type 8) (param i32 i32)
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
      local.get 0
      i32.store offset=12
      local.get 4
      local.get 1
      i32.store offset=8
      local.get 4
      i32.load offset=12
      local.set 5
      local.get 5
      i32.load offset=4
      local.set 6
      local.get 4
      i32.load offset=8
      local.set 7
      local.get 7
      local.get 6
      i32.store
      local.get 4
      i32.load offset=12
      local.set 8
      local.get 8
      i32.load8_u
      local.set 9
      local.get 4
      i32.load offset=8
      local.set 10
      local.get 10
      local.get 9
      i32.store8 offset=4
      return
    )
    (func $exports_test_records_test_roundtrip_flags1 (;15;) (type 3) (param i32) (result i32)
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
      local.get 0
      i32.store8 offset=15
      local.get 3
      i32.load8_u offset=15
      local.set 4
      i32.const 255
      local.set 5
      local.get 4
      local.get 5
      i32.and
      local.set 6
      local.get 6
      return
    )
    (func $exports_test_records_test_roundtrip_flags2 (;16;) (type 3) (param i32) (result i32)
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
      local.get 0
      i32.store8 offset=15
      local.get 3
      i32.load8_u offset=15
      local.set 4
      i32.const 255
      local.set 5
      local.get 4
      local.get 5
      i32.and
      local.set 6
      local.get 6
      return
    )
    (func $exports_test_records_test_roundtrip_flags3 (;17;) (type 9) (param i32 i32 i32 i64 i32 i32 i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 i32)
      global.get $__stack_pointer
      local.set 8
      i32.const 32
      local.set 9
      local.get 8
      local.get 9
      i32.sub
      local.set 10
      local.get 10
      local.get 0
      i32.store8 offset=31
      local.get 10
      local.get 1
      i32.store16 offset=28
      local.get 10
      local.get 2
      i32.store offset=24
      local.get 10
      local.get 3
      i64.store offset=16
      local.get 10
      local.get 4
      i32.store offset=12
      local.get 10
      local.get 5
      i32.store offset=8
      local.get 10
      local.get 6
      i32.store offset=4
      local.get 10
      local.get 7
      i32.store
      local.get 10
      i32.load8_u offset=31
      local.set 11
      local.get 10
      i32.load offset=12
      local.set 12
      local.get 12
      local.get 11
      i32.store8
      local.get 10
      i32.load16_u offset=28
      local.set 13
      local.get 10
      i32.load offset=8
      local.set 14
      local.get 14
      local.get 13
      i32.store16
      local.get 10
      i32.load offset=24
      local.set 15
      local.get 10
      i32.load offset=4
      local.set 16
      local.get 16
      local.get 15
      i32.store
      local.get 10
      i64.load offset=16
      local.set 17
      local.get 10
      i32.load
      local.set 18
      local.get 18
      local.get 17
      i64.store
      return
    )
    (func $exports_test_records_test_roundtrip_record1 (;18;) (type 8) (param i32 i32)
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
      local.get 0
      i32.store offset=12
      local.get 4
      local.get 1
      i32.store offset=8
      local.get 4
      i32.load offset=8
      local.set 5
      local.get 4
      i32.load offset=12
      local.set 6
      local.get 6
      i32.load16_u align=1
      local.set 7
      local.get 5
      local.get 7
      i32.store16 align=1
      return
    )
    (func $exports_test_records_test_tuple1 (;19;) (type 8) (param i32 i32)
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
      local.get 0
      i32.store offset=12
      local.get 4
      local.get 1
      i32.store offset=8
      local.get 4
      i32.load offset=12
      local.set 5
      local.get 5
      i32.load8_u
      local.set 6
      local.get 4
      i32.load offset=8
      local.set 7
      local.get 7
      local.get 6
      i32.store8
      return
    )
    (func $cabi_realloc (;20;) (type 6) (param i32 i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
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
      local.get 0
      i32.store offset=24
      local.get 6
      local.get 1
      i32.store offset=20
      local.get 6
      local.get 2
      i32.store offset=16
      local.get 6
      local.get 3
      i32.store offset=12
      local.get 6
      i32.load offset=12
      local.set 7
      block ;; label = @1
        block ;; label = @2
          local.get 7
          br_if 0 (;@2;)
          local.get 6
          i32.load offset=16
          local.set 8
          local.get 6
          local.get 8
          i32.store offset=28
          br 1 (;@1;)
        end
        local.get 6
        i32.load offset=24
        local.set 9
        local.get 6
        i32.load offset=12
        local.set 10
        local.get 9
        local.get 10
        call $realloc
        local.set 11
        local.get 6
        local.get 11
        i32.store offset=8
        local.get 6
        i32.load offset=8
        local.set 12
        i32.const 0
        local.set 13
        local.get 12
        local.set 14
        local.get 13
        local.set 15
        local.get 14
        local.get 15
        i32.ne
        local.set 16
        i32.const 1
        local.set 17
        local.get 16
        local.get 17
        i32.and
        local.set 18
        block ;; label = @2
          local.get 18
          br_if 0 (;@2;)
          call $abort
          unreachable
        end
        local.get 6
        i32.load offset=8
        local.set 19
        local.get 6
        local.get 19
        i32.store offset=28
      end
      local.get 6
      i32.load offset=28
      local.set 20
      i32.const 32
      local.set 21
      local.get 6
      local.get 21
      i32.add
      local.set 22
      local.get 22
      global.set $__stack_pointer
      local.get 20
      return
    )
    (func $test_records_test_multiple_results (;21;) (type 8) (param i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
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
      i32.store offset=12
      local.get 4
      local.get 1
      i32.store offset=8
      i32.const 4
      local.set 5
      local.get 4
      local.get 5
      i32.add
      local.set 6
      local.get 6
      local.set 7
      local.get 4
      local.get 7
      i32.store
      local.get 4
      i32.load
      local.set 8
      local.get 8
      call $__wasm_import_test_records_test_multiple_results
      local.get 4
      i32.load
      local.set 9
      local.get 9
      i32.load8_u
      local.set 10
      i32.const 255
      local.set 11
      local.get 10
      local.get 11
      i32.and
      local.set 12
      local.get 4
      i32.load offset=12
      local.set 13
      local.get 13
      local.get 12
      i32.store8
      local.get 4
      i32.load
      local.set 14
      local.get 14
      i32.load16_u offset=2
      local.set 15
      i32.const 65535
      local.set 16
      local.get 15
      local.get 16
      i32.and
      local.set 17
      local.get 4
      i32.load offset=8
      local.set 18
      local.get 18
      local.get 17
      i32.store16
      i32.const 16
      local.set 19
      local.get 4
      local.get 19
      i32.add
      local.set 20
      local.get 20
      global.set $__stack_pointer
      return
    )
    (func $test_records_test_swap_tuple (;22;) (type 8) (param i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 i32 i32)
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
      local.get 4
      local.get 0
      i32.store offset=28
      local.get 4
      local.get 1
      i32.store offset=24
      i32.const 16
      local.set 5
      local.get 4
      local.get 5
      i32.add
      local.set 6
      local.get 6
      local.set 7
      local.get 4
      local.get 7
      i32.store offset=12
      local.get 4
      i32.load offset=28
      local.set 8
      local.get 8
      i32.load8_u
      local.set 9
      i32.const 255
      local.set 10
      local.get 9
      local.get 10
      i32.and
      local.set 11
      local.get 4
      i32.load offset=28
      local.set 12
      local.get 12
      i32.load offset=4
      local.set 13
      local.get 4
      i32.load offset=12
      local.set 14
      local.get 11
      local.get 13
      local.get 14
      call $__wasm_import_test_records_test_swap_tuple
      local.get 4
      i32.load offset=24
      local.set 15
      local.get 4
      i32.load offset=12
      local.set 16
      local.get 16
      i32.load
      local.set 17
      local.get 4
      local.get 17
      i32.store
      local.get 4
      i32.load offset=12
      local.set 18
      local.get 18
      i32.load8_u offset=4
      local.set 19
      i32.const 255
      local.set 20
      local.get 19
      local.get 20
      i32.and
      local.set 21
      local.get 4
      local.get 21
      i32.store8 offset=4
      local.get 4
      i64.load
      local.set 22
      local.get 15
      local.get 22
      i64.store align=4
      i32.const 32
      local.set 23
      local.get 4
      local.get 23
      i32.add
      local.set 24
      local.get 24
      global.set $__stack_pointer
      return
    )
    (func $test_records_test_roundtrip_flags1 (;23;) (type 3) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
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
      i32.store8 offset=15
      local.get 3
      i32.load8_u offset=15
      local.set 4
      i32.const 255
      local.set 5
      local.get 4
      local.get 5
      i32.and
      local.set 6
      local.get 6
      call $__wasm_import_test_records_test_roundtrip_flags1
      local.set 7
      local.get 3
      local.get 7
      i32.store offset=8
      local.get 3
      i32.load offset=8
      local.set 8
      i32.const 255
      local.set 9
      local.get 8
      local.get 9
      i32.and
      local.set 10
      i32.const 16
      local.set 11
      local.get 3
      local.get 11
      i32.add
      local.set 12
      local.get 12
      global.set $__stack_pointer
      local.get 10
      return
    )
    (func $test_records_test_roundtrip_flags2 (;24;) (type 3) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
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
      i32.store8 offset=15
      local.get 3
      i32.load8_u offset=15
      local.set 4
      i32.const 255
      local.set 5
      local.get 4
      local.get 5
      i32.and
      local.set 6
      local.get 6
      call $__wasm_import_test_records_test_roundtrip_flags2
      local.set 7
      local.get 3
      local.get 7
      i32.store offset=8
      local.get 3
      i32.load offset=8
      local.set 8
      i32.const 255
      local.set 9
      local.get 8
      local.get 9
      i32.and
      local.set 10
      i32.const 16
      local.set 11
      local.get 3
      local.get 11
      i32.add
      local.set 12
      local.get 12
      global.set $__stack_pointer
      local.get 10
      return
    )
    (func $test_records_test_roundtrip_flags3 (;25;) (type 9) (param i32 i32 i32 i64 i32 i32 i32 i32)
      (local i32 i32 i32 i64 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 i64 i64 i32 i64 i64 i64 i64 i64 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 i32 i32 i32 i64 i64 i64 i64 i32 i32 i32)
      global.get $__stack_pointer
      local.set 8
      i32.const 64
      local.set 9
      local.get 8
      local.get 9
      i32.sub
      local.set 10
      local.get 10
      global.set $__stack_pointer
      local.get 10
      local.get 0
      i32.store8 offset=63
      local.get 10
      local.get 1
      i32.store16 offset=60
      local.get 10
      local.get 2
      i32.store offset=56
      local.get 10
      local.get 3
      i64.store offset=48
      local.get 10
      local.get 4
      i32.store offset=44
      local.get 10
      local.get 5
      i32.store offset=40
      local.get 10
      local.get 6
      i32.store offset=36
      local.get 10
      local.get 7
      i32.store offset=32
      local.get 10
      i64.load offset=48
      local.set 11
      local.get 10
      local.get 11
      i64.store offset=8
      i32.const 16
      local.set 12
      local.get 10
      local.get 12
      i32.add
      local.set 13
      local.get 13
      local.set 14
      local.get 10
      local.get 14
      i32.store offset=4
      local.get 10
      i32.load8_u offset=63
      local.set 15
      i32.const 255
      local.set 16
      local.get 15
      local.get 16
      i32.and
      local.set 17
      local.get 10
      i32.load16_u offset=60
      local.set 18
      i32.const 65535
      local.set 19
      local.get 18
      local.get 19
      i32.and
      local.set 20
      local.get 10
      i32.load offset=56
      local.set 21
      local.get 10
      i64.load offset=8
      local.set 22
      i64.const 4294967295
      local.set 23
      local.get 22
      local.get 23
      i64.and
      local.set 24
      local.get 24
      i32.wrap_i64
      local.set 25
      local.get 10
      i64.load offset=8
      local.set 26
      i64.const 32
      local.set 27
      local.get 26
      local.get 27
      i64.shr_u
      local.set 28
      i64.const 4294967295
      local.set 29
      local.get 28
      local.get 29
      i64.and
      local.set 30
      local.get 30
      i32.wrap_i64
      local.set 31
      local.get 10
      i32.load offset=4
      local.set 32
      local.get 17
      local.get 20
      local.get 21
      local.get 25
      local.get 31
      local.get 32
      call $__wasm_import_test_records_test_roundtrip_flags3
      local.get 10
      i32.load offset=4
      local.set 33
      local.get 33
      i32.load8_u
      local.set 34
      i32.const 255
      local.set 35
      local.get 34
      local.get 35
      i32.and
      local.set 36
      local.get 10
      i32.load offset=44
      local.set 37
      local.get 37
      local.get 36
      i32.store8
      local.get 10
      i32.load offset=4
      local.set 38
      local.get 38
      i32.load16_u offset=2
      local.set 39
      i32.const 65535
      local.set 40
      local.get 39
      local.get 40
      i32.and
      local.set 41
      local.get 10
      i32.load offset=40
      local.set 42
      local.get 42
      local.get 41
      i32.store16
      local.get 10
      i32.load offset=4
      local.set 43
      local.get 43
      i32.load offset=4
      local.set 44
      local.get 10
      i32.load offset=36
      local.set 45
      local.get 45
      local.get 44
      i32.store
      local.get 10
      i32.load offset=4
      local.set 46
      local.get 46
      i32.load offset=8
      local.set 47
      local.get 47
      local.set 48
      local.get 48
      i64.extend_i32_s
      local.set 49
      local.get 10
      i32.load offset=4
      local.set 50
      local.get 50
      i32.load offset=12
      local.set 51
      local.get 51
      local.set 52
      local.get 52
      i64.extend_i32_s
      local.set 53
      i64.const 32
      local.set 54
      local.get 53
      local.get 54
      i64.shl
      local.set 55
      local.get 49
      local.get 55
      i64.or
      local.set 56
      local.get 10
      i32.load offset=32
      local.set 57
      local.get 57
      local.get 56
      i64.store
      i32.const 64
      local.set 58
      local.get 10
      local.get 58
      i32.add
      local.set 59
      local.get 59
      global.set $__stack_pointer
      return
    )
    (func $test_records_test_roundtrip_record1 (;26;) (type 8) (param i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
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
      local.get 4
      local.get 0
      i32.store offset=28
      local.get 4
      local.get 1
      i32.store offset=24
      i32.const 22
      local.set 5
      local.get 4
      local.get 5
      i32.add
      local.set 6
      local.get 6
      local.set 7
      local.get 4
      local.get 7
      i32.store offset=16
      local.get 4
      i32.load offset=28
      local.set 8
      local.get 8
      i32.load8_u
      local.set 9
      i32.const 255
      local.set 10
      local.get 9
      local.get 10
      i32.and
      local.set 11
      local.get 4
      i32.load offset=28
      local.set 12
      local.get 12
      i32.load8_u offset=1
      local.set 13
      i32.const 255
      local.set 14
      local.get 13
      local.get 14
      i32.and
      local.set 15
      local.get 4
      i32.load offset=16
      local.set 16
      local.get 11
      local.get 15
      local.get 16
      call $__wasm_import_test_records_test_roundtrip_record1
      local.get 4
      i32.load offset=24
      local.set 17
      local.get 4
      i32.load offset=16
      local.set 18
      local.get 18
      i32.load8_u
      local.set 19
      i32.const 255
      local.set 20
      local.get 19
      local.get 20
      i32.and
      local.set 21
      local.get 4
      local.get 21
      i32.store8 offset=8
      local.get 4
      i32.load offset=16
      local.set 22
      local.get 22
      i32.load8_u offset=1
      local.set 23
      i32.const 255
      local.set 24
      local.get 23
      local.get 24
      i32.and
      local.set 25
      local.get 4
      local.get 25
      i32.store8 offset=9
      local.get 4
      i32.load16_u offset=8
      local.set 26
      local.get 17
      local.get 26
      i32.store16 align=1
      i32.const 32
      local.set 27
      local.get 4
      local.get 27
      i32.add
      local.set 28
      local.get 28
      global.set $__stack_pointer
      return
    )
    (func $test_records_test_tuple1 (;27;) (type 8) (param i32 i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
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
      i32.store offset=12
      local.get 4
      local.get 1
      i32.store offset=8
      local.get 4
      i32.load offset=12
      local.set 5
      local.get 5
      i32.load8_u
      local.set 6
      i32.const 255
      local.set 7
      local.get 6
      local.get 7
      i32.and
      local.set 8
      local.get 8
      call $__wasm_import_test_records_test_tuple1
      local.set 9
      local.get 4
      local.get 9
      i32.store offset=4
      local.get 4
      i32.load offset=8
      local.set 10
      local.get 4
      i32.load offset=4
      local.set 11
      local.get 4
      local.get 11
      i32.store8
      local.get 4
      i32.load8_u
      local.set 12
      local.get 10
      local.get 12
      i32.store8
      i32.const 16
      local.set 13
      local.get 4
      local.get 13
      i32.add
      local.set 14
      local.get 14
      global.set $__stack_pointer
      return
    )
    (func $__wasm_export_records_test_imports (;28;) (type 7)
      call $records_test_imports
      return
    )
    (func $__wasm_export_exports_test_records_test_multiple_results (;29;) (type 10) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 0
      i32.const 16
      local.set 1
      local.get 0
      local.get 1
      i32.sub
      local.set 2
      local.get 2
      global.set $__stack_pointer
      i32.const 15
      local.set 3
      local.get 2
      local.get 3
      i32.add
      local.set 4
      local.get 4
      local.set 5
      i32.const 12
      local.set 6
      local.get 2
      local.get 6
      i32.add
      local.set 7
      local.get 7
      local.set 8
      local.get 5
      local.get 8
      call $exports_test_records_test_multiple_results
      i32.const 4596
      local.set 9
      local.get 2
      local.get 9
      i32.store offset=8
      local.get 2
      i32.load8_u offset=15
      local.set 10
      i32.const 255
      local.set 11
      local.get 10
      local.get 11
      i32.and
      local.set 12
      local.get 2
      i32.load offset=8
      local.set 13
      local.get 13
      local.get 12
      i32.store8
      local.get 2
      i32.load16_u offset=12
      local.set 14
      i32.const 65535
      local.set 15
      local.get 14
      local.get 15
      i32.and
      local.set 16
      local.get 2
      i32.load offset=8
      local.set 17
      local.get 17
      local.get 16
      i32.store16 offset=2
      local.get 2
      i32.load offset=8
      local.set 18
      i32.const 16
      local.set 19
      local.get 2
      local.get 19
      i32.add
      local.set 20
      local.get 20
      global.set $__stack_pointer
      local.get 18
      return
    )
    (func $__wasm_export_exports_test_records_test_swap_tuple (;30;) (type 11) (param i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
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
      local.get 4
      local.get 0
      i32.store offset=28
      local.get 4
      local.get 1
      i32.store offset=24
      local.get 4
      i32.load offset=28
      local.set 5
      local.get 4
      local.get 5
      i32.store8 offset=16
      local.get 4
      i32.load offset=24
      local.set 6
      local.get 4
      local.get 6
      i32.store offset=20
      i32.const 16
      local.set 7
      local.get 4
      local.get 7
      i32.add
      local.set 8
      local.get 8
      local.set 9
      i32.const 8
      local.set 10
      local.get 4
      local.get 10
      i32.add
      local.set 11
      local.get 11
      local.set 12
      local.get 9
      local.get 12
      call $exports_test_records_test_swap_tuple
      i32.const 4596
      local.set 13
      local.get 4
      local.get 13
      i32.store offset=4
      local.get 4
      i32.load offset=8
      local.set 14
      local.get 4
      i32.load offset=4
      local.set 15
      local.get 15
      local.get 14
      i32.store
      local.get 4
      i32.load8_u offset=12
      local.set 16
      i32.const 255
      local.set 17
      local.get 16
      local.get 17
      i32.and
      local.set 18
      local.get 4
      i32.load offset=4
      local.set 19
      local.get 19
      local.get 18
      i32.store8 offset=4
      local.get 4
      i32.load offset=4
      local.set 20
      i32.const 32
      local.set 21
      local.get 4
      local.get 21
      i32.add
      local.set 22
      local.get 22
      global.set $__stack_pointer
      local.get 20
      return
    )
    (func $__wasm_export_exports_test_records_test_roundtrip_flags1 (;31;) (type 3) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
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
      local.get 3
      i32.load offset=12
      local.set 4
      i32.const 255
      local.set 5
      local.get 4
      local.get 5
      i32.and
      local.set 6
      local.get 6
      call $exports_test_records_test_roundtrip_flags1
      local.set 7
      local.get 3
      local.get 7
      i32.store8 offset=11
      local.get 3
      i32.load8_u offset=11
      local.set 8
      i32.const 255
      local.set 9
      local.get 8
      local.get 9
      i32.and
      local.set 10
      i32.const 16
      local.set 11
      local.get 3
      local.get 11
      i32.add
      local.set 12
      local.get 12
      global.set $__stack_pointer
      local.get 10
      return
    )
    (func $__wasm_export_exports_test_records_test_roundtrip_flags2 (;32;) (type 3) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
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
      local.get 3
      i32.load offset=12
      local.set 4
      i32.const 255
      local.set 5
      local.get 4
      local.get 5
      i32.and
      local.set 6
      local.get 6
      call $exports_test_records_test_roundtrip_flags2
      local.set 7
      local.get 3
      local.get 7
      i32.store8 offset=11
      local.get 3
      i32.load8_u offset=11
      local.set 8
      i32.const 255
      local.set 9
      local.get 8
      local.get 9
      i32.and
      local.set 10
      i32.const 16
      local.set 11
      local.get 3
      local.get 11
      i32.add
      local.set 12
      local.get 12
      global.set $__stack_pointer
      local.get 10
      return
    )
    (func $__wasm_export_exports_test_records_test_roundtrip_flags3 (;33;) (type 12) (param i32 i32 i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i64 i32 i32 i64 i64 i64 i64 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 i64 i64 i64 i64 i64 i32 i32 i64 i64 i64 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      local.set 5
      i32.const 64
      local.set 6
      local.get 5
      local.get 6
      i32.sub
      local.set 7
      local.get 7
      global.set $__stack_pointer
      local.get 7
      local.get 0
      i32.store offset=60
      local.get 7
      local.get 1
      i32.store offset=56
      local.get 7
      local.get 2
      i32.store offset=52
      local.get 7
      local.get 3
      i32.store offset=48
      local.get 7
      local.get 4
      i32.store offset=44
      local.get 7
      i32.load offset=60
      local.set 8
      local.get 7
      i32.load offset=56
      local.set 9
      local.get 7
      i32.load offset=52
      local.set 10
      local.get 7
      i32.load offset=48
      local.set 11
      local.get 11
      local.set 12
      local.get 12
      i64.extend_i32_s
      local.set 13
      local.get 7
      i32.load offset=44
      local.set 14
      local.get 14
      local.set 15
      local.get 15
      i64.extend_i32_s
      local.set 16
      i64.const 32
      local.set 17
      local.get 16
      local.get 17
      i64.shl
      local.set 18
      local.get 13
      local.get 18
      i64.or
      local.set 19
      i32.const 43
      local.set 20
      local.get 7
      local.get 20
      i32.add
      local.set 21
      local.get 21
      local.set 22
      i32.const 40
      local.set 23
      local.get 7
      local.get 23
      i32.add
      local.set 24
      local.get 24
      local.set 25
      i32.const 36
      local.set 26
      local.get 7
      local.get 26
      i32.add
      local.set 27
      local.get 27
      local.set 28
      i32.const 24
      local.set 29
      local.get 7
      local.get 29
      i32.add
      local.set 30
      local.get 30
      local.set 31
      i32.const 255
      local.set 32
      local.get 8
      local.get 32
      i32.and
      local.set 33
      i32.const 65535
      local.set 34
      local.get 9
      local.get 34
      i32.and
      local.set 35
      local.get 33
      local.get 35
      local.get 10
      local.get 19
      local.get 22
      local.get 25
      local.get 28
      local.get 31
      call $exports_test_records_test_roundtrip_flags3
      i32.const 4596
      local.set 36
      local.get 7
      local.get 36
      i32.store offset=20
      local.get 7
      i32.load8_u offset=43
      local.set 37
      local.get 7
      i32.load offset=20
      local.set 38
      local.get 38
      local.get 37
      i32.store8
      local.get 7
      i32.load16_u offset=40
      local.set 39
      local.get 7
      i32.load offset=20
      local.set 40
      local.get 40
      local.get 39
      i32.store16 offset=2
      local.get 7
      i32.load offset=36
      local.set 41
      local.get 7
      i32.load offset=20
      local.set 42
      local.get 42
      local.get 41
      i32.store offset=4
      local.get 7
      i64.load offset=24
      local.set 43
      local.get 7
      local.get 43
      i64.store offset=8
      local.get 7
      i64.load offset=8
      local.set 44
      i64.const 32
      local.set 45
      local.get 44
      local.get 45
      i64.shr_u
      local.set 46
      i64.const 4294967295
      local.set 47
      local.get 46
      local.get 47
      i64.and
      local.set 48
      local.get 48
      i32.wrap_i64
      local.set 49
      local.get 7
      i32.load offset=20
      local.set 50
      local.get 50
      local.get 49
      i32.store offset=12
      local.get 7
      i64.load offset=8
      local.set 51
      i64.const 4294967295
      local.set 52
      local.get 51
      local.get 52
      i64.and
      local.set 53
      local.get 53
      i32.wrap_i64
      local.set 54
      local.get 7
      i32.load offset=20
      local.set 55
      local.get 55
      local.get 54
      i32.store offset=8
      local.get 7
      i32.load offset=20
      local.set 56
      i32.const 64
      local.set 57
      local.get 7
      local.get 57
      i32.add
      local.set 58
      local.get 58
      global.set $__stack_pointer
      local.get 56
      return
    )
    (func $__wasm_export_exports_test_records_test_roundtrip_record1 (;34;) (type 11) (param i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
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
      local.get 4
      local.get 0
      i32.store offset=28
      local.get 4
      local.get 1
      i32.store offset=24
      local.get 4
      i32.load offset=28
      local.set 5
      local.get 4
      local.get 5
      i32.store8 offset=16
      local.get 4
      i32.load offset=24
      local.set 6
      local.get 4
      local.get 6
      i32.store8 offset=17
      i32.const 16
      local.set 7
      local.get 4
      local.get 7
      i32.add
      local.set 8
      local.get 8
      local.set 9
      i32.const 8
      local.set 10
      local.get 4
      local.get 10
      i32.add
      local.set 11
      local.get 11
      local.set 12
      local.get 9
      local.get 12
      call $exports_test_records_test_roundtrip_record1
      i32.const 4596
      local.set 13
      local.get 4
      local.get 13
      i32.store offset=4
      local.get 4
      i32.load8_u offset=8
      local.set 14
      i32.const 255
      local.set 15
      local.get 14
      local.get 15
      i32.and
      local.set 16
      local.get 4
      i32.load offset=4
      local.set 17
      local.get 17
      local.get 16
      i32.store8
      local.get 4
      i32.load8_u offset=9
      local.set 18
      local.get 4
      i32.load offset=4
      local.set 19
      local.get 19
      local.get 18
      i32.store8 offset=1
      local.get 4
      i32.load offset=4
      local.set 20
      i32.const 32
      local.set 21
      local.get 4
      local.get 21
      i32.add
      local.set 22
      local.get 22
      global.set $__stack_pointer
      local.get 20
      return
    )
    (func $__wasm_export_exports_test_records_test_tuple1 (;35;) (type 3) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
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
      local.get 3
      i32.load offset=12
      local.set 4
      local.get 3
      local.get 4
      i32.store8 offset=8
      i32.const 8
      local.set 5
      local.get 3
      local.get 5
      i32.add
      local.set 6
      local.get 6
      local.set 7
      local.get 3
      local.set 8
      local.get 7
      local.get 8
      call $exports_test_records_test_tuple1
      local.get 3
      i32.load8_u
      local.set 9
      i32.const 255
      local.set 10
      local.get 9
      local.get 10
      i32.and
      local.set 11
      i32.const 16
      local.set 12
      local.get 3
      local.get 12
      i32.add
      local.set 13
      local.get 13
      global.set $__stack_pointer
      local.get 11
      return
    )
    (func $dlmalloc (;36;) (type 3) (param i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 1
      global.set $__stack_pointer
      block ;; label = @1
        i32.const 0
        i32.load offset=4636
        local.tee 2
        br_if 0 (;@1;)
        block ;; label = @2
          block ;; label = @3
            i32.const 0
            i32.load offset=5084
            local.tee 3
            i32.eqz
            br_if 0 (;@3;)
            i32.const 0
            i32.load offset=5088
            local.set 4
            br 1 (;@2;)
          end
          i32.const 0
          i64.const -1
          i64.store offset=5096 align=4
          i32.const 0
          i64.const 281474976776192
          i64.store offset=5088 align=4
          i32.const 0
          local.get 1
          i32.const 8
          i32.add
          i32.const -16
          i32.and
          i32.const 1431655768
          i32.xor
          local.tee 3
          i32.store offset=5084
          i32.const 0
          i32.const 0
          i32.store offset=5104
          i32.const 0
          i32.const 0
          i32.store offset=5056
          i32.const 65536
          local.set 4
        end
        i32.const 0
        local.set 2
        i32.const 131072
        i32.const 70688
        local.get 4
        i32.add
        i32.const -1
        i32.add
        i32.const 0
        local.get 4
        i32.sub
        i32.and
        i32.const 131072
        select
        i32.const 70688
        i32.sub
        local.tee 5
        i32.const 89
        i32.lt_u
        br_if 0 (;@1;)
        i32.const 0
        local.set 4
        i32.const 0
        local.get 5
        i32.store offset=5064
        i32.const 0
        i32.const 70688
        i32.store offset=5060
        i32.const 0
        i32.const 70688
        i32.store offset=4628
        i32.const 0
        local.get 3
        i32.store offset=4648
        i32.const 0
        i32.const -1
        i32.store offset=4644
        loop ;; label = @2
          local.get 4
          i32.const 4672
          i32.add
          local.get 4
          i32.const 4660
          i32.add
          local.tee 3
          i32.store
          local.get 3
          local.get 4
          i32.const 4652
          i32.add
          local.tee 6
          i32.store
          local.get 4
          i32.const 4664
          i32.add
          local.get 6
          i32.store
          local.get 4
          i32.const 4680
          i32.add
          local.get 4
          i32.const 4668
          i32.add
          local.tee 6
          i32.store
          local.get 6
          local.get 3
          i32.store
          local.get 4
          i32.const 4688
          i32.add
          local.get 4
          i32.const 4676
          i32.add
          local.tee 3
          i32.store
          local.get 3
          local.get 6
          i32.store
          local.get 4
          i32.const 4684
          i32.add
          local.get 3
          i32.store
          local.get 4
          i32.const 32
          i32.add
          local.tee 4
          i32.const 256
          i32.ne
          br_if 0 (;@2;)
        end
        i32.const 70688
        i32.const -8
        i32.const 70688
        i32.sub
        i32.const 15
        i32.and
        i32.const 0
        i32.const 70688
        i32.const 8
        i32.add
        i32.const 15
        i32.and
        select
        local.tee 4
        i32.add
        local.tee 2
        i32.const 4
        i32.add
        local.get 5
        i32.const -56
        i32.add
        local.tee 3
        local.get 4
        i32.sub
        local.tee 4
        i32.const 1
        i32.or
        i32.store
        i32.const 0
        i32.const 0
        i32.load offset=5100
        i32.store offset=4640
        i32.const 0
        local.get 4
        i32.store offset=4624
        i32.const 0
        local.get 2
        i32.store offset=4636
        i32.const 70688
        local.get 3
        i32.add
        i32.const 56
        i32.store offset=4
      end
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
                              local.get 0
                              i32.const 236
                              i32.gt_u
                              br_if 0 (;@12;)
                              block ;; label = @13
                                i32.const 0
                                i32.load offset=4612
                                local.tee 7
                                i32.const 16
                                local.get 0
                                i32.const 19
                                i32.add
                                i32.const -16
                                i32.and
                                local.get 0
                                i32.const 11
                                i32.lt_u
                                select
                                local.tee 5
                                i32.const 3
                                i32.shr_u
                                local.tee 3
                                i32.shr_u
                                local.tee 4
                                i32.const 3
                                i32.and
                                i32.eqz
                                br_if 0 (;@13;)
                                block ;; label = @14
                                  block ;; label = @15
                                    local.get 4
                                    i32.const 1
                                    i32.and
                                    local.get 3
                                    i32.or
                                    i32.const 1
                                    i32.xor
                                    local.tee 6
                                    i32.const 3
                                    i32.shl
                                    local.tee 3
                                    i32.const 4652
                                    i32.add
                                    local.tee 4
                                    local.get 3
                                    i32.const 4660
                                    i32.add
                                    i32.load
                                    local.tee 3
                                    i32.load offset=8
                                    local.tee 5
                                    i32.ne
                                    br_if 0 (;@15;)
                                    i32.const 0
                                    local.get 7
                                    i32.const -2
                                    local.get 6
                                    i32.rotl
                                    i32.and
                                    i32.store offset=4612
                                    br 1 (;@14;)
                                  end
                                  local.get 4
                                  local.get 5
                                  i32.store offset=8
                                  local.get 5
                                  local.get 4
                                  i32.store offset=12
                                end
                                local.get 3
                                i32.const 8
                                i32.add
                                local.set 4
                                local.get 3
                                local.get 6
                                i32.const 3
                                i32.shl
                                local.tee 6
                                i32.const 3
                                i32.or
                                i32.store offset=4
                                local.get 3
                                local.get 6
                                i32.add
                                local.tee 3
                                local.get 3
                                i32.load offset=4
                                i32.const 1
                                i32.or
                                i32.store offset=4
                                br 12 (;@1;)
                              end
                              local.get 5
                              i32.const 0
                              i32.load offset=4620
                              local.tee 8
                              i32.le_u
                              br_if 1 (;@11;)
                              block ;; label = @13
                                local.get 4
                                i32.eqz
                                br_if 0 (;@13;)
                                block ;; label = @14
                                  block ;; label = @15
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
                                    local.tee 4
                                    i32.const 0
                                    local.get 4
                                    i32.sub
                                    i32.and
                                    i32.ctz
                                    local.tee 3
                                    i32.const 3
                                    i32.shl
                                    local.tee 4
                                    i32.const 4652
                                    i32.add
                                    local.tee 6
                                    local.get 4
                                    i32.const 4660
                                    i32.add
                                    i32.load
                                    local.tee 4
                                    i32.load offset=8
                                    local.tee 0
                                    i32.ne
                                    br_if 0 (;@15;)
                                    i32.const 0
                                    local.get 7
                                    i32.const -2
                                    local.get 3
                                    i32.rotl
                                    i32.and
                                    local.tee 7
                                    i32.store offset=4612
                                    br 1 (;@14;)
                                  end
                                  local.get 6
                                  local.get 0
                                  i32.store offset=8
                                  local.get 0
                                  local.get 6
                                  i32.store offset=12
                                end
                                local.get 4
                                local.get 5
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
                                local.get 5
                                i32.sub
                                local.tee 6
                                i32.store
                                local.get 4
                                local.get 5
                                i32.add
                                local.tee 0
                                local.get 6
                                i32.const 1
                                i32.or
                                i32.store offset=4
                                block ;; label = @14
                                  local.get 8
                                  i32.eqz
                                  br_if 0 (;@14;)
                                  local.get 8
                                  i32.const -8
                                  i32.and
                                  i32.const 4652
                                  i32.add
                                  local.set 5
                                  i32.const 0
                                  i32.load offset=4632
                                  local.set 3
                                  block ;; label = @15
                                    block ;; label = @16
                                      local.get 7
                                      i32.const 1
                                      local.get 8
                                      i32.const 3
                                      i32.shr_u
                                      i32.shl
                                      local.tee 9
                                      i32.and
                                      br_if 0 (;@16;)
                                      i32.const 0
                                      local.get 7
                                      local.get 9
                                      i32.or
                                      i32.store offset=4612
                                      local.get 5
                                      local.set 9
                                      br 1 (;@15;)
                                    end
                                    local.get 5
                                    i32.load offset=8
                                    local.set 9
                                  end
                                  local.get 9
                                  local.get 3
                                  i32.store offset=12
                                  local.get 5
                                  local.get 3
                                  i32.store offset=8
                                  local.get 3
                                  local.get 5
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
                                i32.store offset=4632
                                i32.const 0
                                local.get 6
                                i32.store offset=4620
                                br 12 (;@1;)
                              end
                              i32.const 0
                              i32.load offset=4616
                              local.tee 10
                              i32.eqz
                              br_if 1 (;@11;)
                              local.get 10
                              i32.const 0
                              local.get 10
                              i32.sub
                              i32.and
                              i32.ctz
                              i32.const 2
                              i32.shl
                              i32.const 4916
                              i32.add
                              i32.load
                              local.tee 0
                              i32.load offset=4
                              i32.const -8
                              i32.and
                              local.get 5
                              i32.sub
                              local.set 3
                              local.get 0
                              local.set 6
                              block ;; label = @13
                                loop ;; label = @14
                                  block ;; label = @15
                                    local.get 6
                                    i32.load offset=16
                                    local.tee 4
                                    br_if 0 (;@15;)
                                    local.get 6
                                    i32.const 20
                                    i32.add
                                    i32.load
                                    local.tee 4
                                    i32.eqz
                                    br_if 2 (;@13;)
                                  end
                                  local.get 4
                                  i32.load offset=4
                                  i32.const -8
                                  i32.and
                                  local.get 5
                                  i32.sub
                                  local.tee 6
                                  local.get 3
                                  local.get 6
                                  local.get 3
                                  i32.lt_u
                                  local.tee 6
                                  select
                                  local.set 3
                                  local.get 4
                                  local.get 0
                                  local.get 6
                                  select
                                  local.set 0
                                  local.get 4
                                  local.set 6
                                  br 0 (;@14;)
                                end
                              end
                              local.get 0
                              i32.load offset=24
                              local.set 11
                              block ;; label = @13
                                local.get 0
                                i32.load offset=12
                                local.tee 9
                                local.get 0
                                i32.eq
                                br_if 0 (;@13;)
                                local.get 0
                                i32.load offset=8
                                local.tee 4
                                i32.const 0
                                i32.load offset=4628
                                i32.lt_u
                                drop
                                local.get 9
                                local.get 4
                                i32.store offset=8
                                local.get 4
                                local.get 9
                                i32.store offset=12
                                br 11 (;@2;)
                              end
                              block ;; label = @13
                                local.get 0
                                i32.const 20
                                i32.add
                                local.tee 6
                                i32.load
                                local.tee 4
                                br_if 0 (;@13;)
                                local.get 0
                                i32.load offset=16
                                local.tee 4
                                i32.eqz
                                br_if 3 (;@10;)
                                local.get 0
                                i32.const 16
                                i32.add
                                local.set 6
                              end
                              loop ;; label = @13
                                local.get 6
                                local.set 2
                                local.get 4
                                local.tee 9
                                i32.const 20
                                i32.add
                                local.tee 6
                                i32.load
                                local.tee 4
                                br_if 0 (;@13;)
                                local.get 9
                                i32.const 16
                                i32.add
                                local.set 6
                                local.get 9
                                i32.load offset=16
                                local.tee 4
                                br_if 0 (;@13;)
                              end
                              local.get 2
                              i32.const 0
                              i32.store
                              br 10 (;@2;)
                            end
                            i32.const -1
                            local.set 5
                            local.get 0
                            i32.const -65
                            i32.gt_u
                            br_if 0 (;@11;)
                            local.get 0
                            i32.const 19
                            i32.add
                            local.tee 4
                            i32.const -16
                            i32.and
                            local.set 5
                            i32.const 0
                            i32.load offset=4616
                            local.tee 10
                            i32.eqz
                            br_if 0 (;@11;)
                            i32.const 0
                            local.set 8
                            block ;; label = @12
                              local.get 5
                              i32.const 256
                              i32.lt_u
                              br_if 0 (;@12;)
                              i32.const 31
                              local.set 8
                              local.get 5
                              i32.const 16777215
                              i32.gt_u
                              br_if 0 (;@12;)
                              local.get 5
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
                            local.get 5
                            i32.sub
                            local.set 3
                            block ;; label = @12
                              block ;; label = @13
                                block ;; label = @14
                                  block ;; label = @15
                                    local.get 8
                                    i32.const 2
                                    i32.shl
                                    i32.const 4916
                                    i32.add
                                    i32.load
                                    local.tee 6
                                    br_if 0 (;@15;)
                                    i32.const 0
                                    local.set 4
                                    i32.const 0
                                    local.set 9
                                    br 1 (;@14;)
                                  end
                                  i32.const 0
                                  local.set 4
                                  local.get 5
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
                                  loop ;; label = @15
                                    block ;; label = @16
                                      local.get 6
                                      i32.load offset=4
                                      i32.const -8
                                      i32.and
                                      local.get 5
                                      i32.sub
                                      local.tee 7
                                      local.get 3
                                      i32.ge_u
                                      br_if 0 (;@16;)
                                      local.get 7
                                      local.set 3
                                      local.get 6
                                      local.set 9
                                      local.get 7
                                      br_if 0 (;@16;)
                                      i32.const 0
                                      local.set 3
                                      local.get 6
                                      local.set 9
                                      local.get 6
                                      local.set 4
                                      br 3 (;@13;)
                                    end
                                    local.get 4
                                    local.get 6
                                    i32.const 20
                                    i32.add
                                    i32.load
                                    local.tee 7
                                    local.get 7
                                    local.get 6
                                    local.get 0
                                    i32.const 29
                                    i32.shr_u
                                    i32.const 4
                                    i32.and
                                    i32.add
                                    i32.const 16
                                    i32.add
                                    i32.load
                                    local.tee 6
                                    i32.eq
                                    select
                                    local.get 4
                                    local.get 7
                                    select
                                    local.set 4
                                    local.get 0
                                    i32.const 1
                                    i32.shl
                                    local.set 0
                                    local.get 6
                                    br_if 0 (;@15;)
                                  end
                                end
                                block ;; label = @14
                                  local.get 4
                                  local.get 9
                                  i32.or
                                  br_if 0 (;@14;)
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
                                  local.get 10
                                  i32.and
                                  local.tee 4
                                  i32.eqz
                                  br_if 3 (;@11;)
                                  local.get 4
                                  i32.const 0
                                  local.get 4
                                  i32.sub
                                  i32.and
                                  i32.ctz
                                  i32.const 2
                                  i32.shl
                                  i32.const 4916
                                  i32.add
                                  i32.load
                                  local.set 4
                                end
                                local.get 4
                                i32.eqz
                                br_if 1 (;@12;)
                              end
                              loop ;; label = @13
                                local.get 4
                                i32.load offset=4
                                i32.const -8
                                i32.and
                                local.get 5
                                i32.sub
                                local.tee 7
                                local.get 3
                                i32.lt_u
                                local.set 0
                                block ;; label = @14
                                  local.get 4
                                  i32.load offset=16
                                  local.tee 6
                                  br_if 0 (;@14;)
                                  local.get 4
                                  i32.const 20
                                  i32.add
                                  i32.load
                                  local.set 6
                                end
                                local.get 7
                                local.get 3
                                local.get 0
                                select
                                local.set 3
                                local.get 4
                                local.get 9
                                local.get 0
                                select
                                local.set 9
                                local.get 6
                                local.set 4
                                local.get 6
                                br_if 0 (;@13;)
                              end
                            end
                            local.get 9
                            i32.eqz
                            br_if 0 (;@11;)
                            local.get 3
                            i32.const 0
                            i32.load offset=4620
                            local.get 5
                            i32.sub
                            i32.ge_u
                            br_if 0 (;@11;)
                            local.get 9
                            i32.load offset=24
                            local.set 2
                            block ;; label = @12
                              local.get 9
                              i32.load offset=12
                              local.tee 0
                              local.get 9
                              i32.eq
                              br_if 0 (;@12;)
                              local.get 9
                              i32.load offset=8
                              local.tee 4
                              i32.const 0
                              i32.load offset=4628
                              i32.lt_u
                              drop
                              local.get 0
                              local.get 4
                              i32.store offset=8
                              local.get 4
                              local.get 0
                              i32.store offset=12
                              br 9 (;@3;)
                            end
                            block ;; label = @12
                              local.get 9
                              i32.const 20
                              i32.add
                              local.tee 6
                              i32.load
                              local.tee 4
                              br_if 0 (;@12;)
                              local.get 9
                              i32.load offset=16
                              local.tee 4
                              i32.eqz
                              br_if 3 (;@9;)
                              local.get 9
                              i32.const 16
                              i32.add
                              local.set 6
                            end
                            loop ;; label = @12
                              local.get 6
                              local.set 7
                              local.get 4
                              local.tee 0
                              i32.const 20
                              i32.add
                              local.tee 6
                              i32.load
                              local.tee 4
                              br_if 0 (;@12;)
                              local.get 0
                              i32.const 16
                              i32.add
                              local.set 6
                              local.get 0
                              i32.load offset=16
                              local.tee 4
                              br_if 0 (;@12;)
                            end
                            local.get 7
                            i32.const 0
                            i32.store
                            br 8 (;@3;)
                          end
                          block ;; label = @11
                            i32.const 0
                            i32.load offset=4620
                            local.tee 4
                            local.get 5
                            i32.lt_u
                            br_if 0 (;@11;)
                            i32.const 0
                            i32.load offset=4632
                            local.set 3
                            block ;; label = @12
                              block ;; label = @13
                                local.get 4
                                local.get 5
                                i32.sub
                                local.tee 6
                                i32.const 16
                                i32.lt_u
                                br_if 0 (;@13;)
                                local.get 3
                                local.get 5
                                i32.add
                                local.tee 0
                                local.get 6
                                i32.const 1
                                i32.or
                                i32.store offset=4
                                local.get 3
                                local.get 4
                                i32.add
                                local.get 6
                                i32.store
                                local.get 3
                                local.get 5
                                i32.const 3
                                i32.or
                                i32.store offset=4
                                br 1 (;@12;)
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
                              local.set 6
                            end
                            i32.const 0
                            local.get 6
                            i32.store offset=4620
                            i32.const 0
                            local.get 0
                            i32.store offset=4632
                            local.get 3
                            i32.const 8
                            i32.add
                            local.set 4
                            br 10 (;@1;)
                          end
                          block ;; label = @11
                            i32.const 0
                            i32.load offset=4624
                            local.tee 6
                            local.get 5
                            i32.le_u
                            br_if 0 (;@11;)
                            local.get 2
                            local.get 5
                            i32.add
                            local.tee 4
                            local.get 6
                            local.get 5
                            i32.sub
                            local.tee 3
                            i32.const 1
                            i32.or
                            i32.store offset=4
                            i32.const 0
                            local.get 4
                            i32.store offset=4636
                            i32.const 0
                            local.get 3
                            i32.store offset=4624
                            local.get 2
                            local.get 5
                            i32.const 3
                            i32.or
                            i32.store offset=4
                            local.get 2
                            i32.const 8
                            i32.add
                            local.set 4
                            br 10 (;@1;)
                          end
                          block ;; label = @11
                            block ;; label = @12
                              i32.const 0
                              i32.load offset=5084
                              i32.eqz
                              br_if 0 (;@12;)
                              i32.const 0
                              i32.load offset=5092
                              local.set 3
                              br 1 (;@11;)
                            end
                            i32.const 0
                            i64.const -1
                            i64.store offset=5096 align=4
                            i32.const 0
                            i64.const 281474976776192
                            i64.store offset=5088 align=4
                            i32.const 0
                            local.get 1
                            i32.const 12
                            i32.add
                            i32.const -16
                            i32.and
                            i32.const 1431655768
                            i32.xor
                            i32.store offset=5084
                            i32.const 0
                            i32.const 0
                            i32.store offset=5104
                            i32.const 0
                            i32.const 0
                            i32.store offset=5056
                            i32.const 65536
                            local.set 3
                          end
                          i32.const 0
                          local.set 4
                          block ;; label = @11
                            local.get 3
                            local.get 5
                            i32.const 71
                            i32.add
                            local.tee 8
                            i32.add
                            local.tee 0
                            i32.const 0
                            local.get 3
                            i32.sub
                            local.tee 7
                            i32.and
                            local.tee 9
                            local.get 5
                            i32.gt_u
                            br_if 0 (;@11;)
                            i32.const 0
                            i32.const 48
                            i32.store offset=5108
                            br 10 (;@1;)
                          end
                          block ;; label = @11
                            i32.const 0
                            i32.load offset=5052
                            local.tee 4
                            i32.eqz
                            br_if 0 (;@11;)
                            block ;; label = @12
                              i32.const 0
                              i32.load offset=5044
                              local.tee 3
                              local.get 9
                              i32.add
                              local.tee 10
                              local.get 3
                              i32.le_u
                              br_if 0 (;@12;)
                              local.get 10
                              local.get 4
                              i32.le_u
                              br_if 1 (;@11;)
                            end
                            i32.const 0
                            local.set 4
                            i32.const 0
                            i32.const 48
                            i32.store offset=5108
                            br 10 (;@1;)
                          end
                          i32.const 0
                          i32.load8_u offset=5056
                          i32.const 4
                          i32.and
                          br_if 4 (;@6;)
                          block ;; label = @11
                            block ;; label = @12
                              block ;; label = @13
                                local.get 2
                                i32.eqz
                                br_if 0 (;@13;)
                                i32.const 5060
                                local.set 4
                                loop ;; label = @14
                                  block ;; label = @15
                                    local.get 4
                                    i32.load
                                    local.tee 3
                                    local.get 2
                                    i32.gt_u
                                    br_if 0 (;@15;)
                                    local.get 3
                                    local.get 4
                                    i32.load offset=4
                                    i32.add
                                    local.get 2
                                    i32.gt_u
                                    br_if 3 (;@12;)
                                  end
                                  local.get 4
                                  i32.load offset=8
                                  local.tee 4
                                  br_if 0 (;@14;)
                                end
                              end
                              i32.const 0
                              call $sbrk
                              local.tee 0
                              i32.const -1
                              i32.eq
                              br_if 5 (;@7;)
                              local.get 9
                              local.set 7
                              block ;; label = @13
                                i32.const 0
                                i32.load offset=5088
                                local.tee 4
                                i32.const -1
                                i32.add
                                local.tee 3
                                local.get 0
                                i32.and
                                i32.eqz
                                br_if 0 (;@13;)
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
                                local.set 7
                              end
                              local.get 7
                              local.get 5
                              i32.le_u
                              br_if 5 (;@7;)
                              local.get 7
                              i32.const 2147483646
                              i32.gt_u
                              br_if 5 (;@7;)
                              block ;; label = @13
                                i32.const 0
                                i32.load offset=5052
                                local.tee 4
                                i32.eqz
                                br_if 0 (;@13;)
                                i32.const 0
                                i32.load offset=5044
                                local.tee 3
                                local.get 7
                                i32.add
                                local.tee 6
                                local.get 3
                                i32.le_u
                                br_if 6 (;@7;)
                                local.get 6
                                local.get 4
                                i32.gt_u
                                br_if 6 (;@7;)
                              end
                              local.get 7
                              call $sbrk
                              local.tee 4
                              local.get 0
                              i32.ne
                              br_if 1 (;@11;)
                              br 7 (;@5;)
                            end
                            local.get 0
                            local.get 6
                            i32.sub
                            local.get 7
                            i32.and
                            local.tee 7
                            i32.const 2147483646
                            i32.gt_u
                            br_if 4 (;@7;)
                            local.get 7
                            call $sbrk
                            local.tee 0
                            local.get 4
                            i32.load
                            local.get 4
                            i32.load offset=4
                            i32.add
                            i32.eq
                            br_if 3 (;@8;)
                            local.get 0
                            local.set 4
                          end
                          block ;; label = @11
                            local.get 4
                            i32.const -1
                            i32.eq
                            br_if 0 (;@11;)
                            local.get 5
                            i32.const 72
                            i32.add
                            local.get 7
                            i32.le_u
                            br_if 0 (;@11;)
                            block ;; label = @12
                              local.get 8
                              local.get 7
                              i32.sub
                              i32.const 0
                              i32.load offset=5092
                              local.tee 3
                              i32.add
                              i32.const 0
                              local.get 3
                              i32.sub
                              i32.and
                              local.tee 3
                              i32.const 2147483646
                              i32.le_u
                              br_if 0 (;@12;)
                              local.get 4
                              local.set 0
                              br 7 (;@5;)
                            end
                            block ;; label = @12
                              local.get 3
                              call $sbrk
                              i32.const -1
                              i32.eq
                              br_if 0 (;@12;)
                              local.get 3
                              local.get 7
                              i32.add
                              local.set 7
                              local.get 4
                              local.set 0
                              br 7 (;@5;)
                            end
                            i32.const 0
                            local.get 7
                            i32.sub
                            call $sbrk
                            drop
                            br 4 (;@7;)
                          end
                          local.get 4
                          local.set 0
                          local.get 4
                          i32.const -1
                          i32.ne
                          br_if 5 (;@5;)
                          br 3 (;@7;)
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
                  i32.load offset=5056
                  i32.const 4
                  i32.or
                  i32.store offset=5056
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
                local.tee 7
                local.get 5
                i32.const 56
                i32.add
                i32.le_u
                br_if 1 (;@4;)
              end
              i32.const 0
              i32.const 0
              i32.load offset=5044
              local.get 7
              i32.add
              local.tee 4
              i32.store offset=5044
              block ;; label = @5
                local.get 4
                i32.const 0
                i32.load offset=5048
                i32.le_u
                br_if 0 (;@5;)
                i32.const 0
                local.get 4
                i32.store offset=5048
              end
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      i32.const 0
                      i32.load offset=4636
                      local.tee 3
                      i32.eqz
                      br_if 0 (;@8;)
                      i32.const 5060
                      local.set 4
                      loop ;; label = @9
                        local.get 0
                        local.get 4
                        i32.load
                        local.tee 6
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
                        i32.load offset=4628
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
                      i32.store offset=4628
                    end
                    i32.const 0
                    local.set 4
                    i32.const 0
                    local.get 7
                    i32.store offset=5064
                    i32.const 0
                    local.get 0
                    i32.store offset=5060
                    i32.const 0
                    i32.const -1
                    i32.store offset=4644
                    i32.const 0
                    i32.const 0
                    i32.load offset=5084
                    i32.store offset=4648
                    i32.const 0
                    i32.const 0
                    i32.store offset=5072
                    loop ;; label = @8
                      local.get 4
                      i32.const 4672
                      i32.add
                      local.get 4
                      i32.const 4660
                      i32.add
                      local.tee 3
                      i32.store
                      local.get 3
                      local.get 4
                      i32.const 4652
                      i32.add
                      local.tee 6
                      i32.store
                      local.get 4
                      i32.const 4664
                      i32.add
                      local.get 6
                      i32.store
                      local.get 4
                      i32.const 4680
                      i32.add
                      local.get 4
                      i32.const 4668
                      i32.add
                      local.tee 6
                      i32.store
                      local.get 6
                      local.get 3
                      i32.store
                      local.get 4
                      i32.const 4688
                      i32.add
                      local.get 4
                      i32.const 4676
                      i32.add
                      local.tee 3
                      i32.store
                      local.get 3
                      local.get 6
                      i32.store
                      local.get 4
                      i32.const 4684
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
                    i32.const 0
                    local.get 0
                    i32.const 8
                    i32.add
                    i32.const 15
                    i32.and
                    select
                    local.tee 4
                    i32.add
                    local.tee 3
                    local.get 7
                    i32.const -56
                    i32.add
                    local.tee 6
                    local.get 4
                    i32.sub
                    local.tee 4
                    i32.const 1
                    i32.or
                    i32.store offset=4
                    i32.const 0
                    i32.const 0
                    i32.load offset=5100
                    i32.store offset=4640
                    i32.const 0
                    local.get 4
                    i32.store offset=4624
                    i32.const 0
                    local.get 3
                    i32.store offset=4636
                    local.get 0
                    local.get 6
                    i32.add
                    i32.const 56
                    i32.store offset=4
                    br 2 (;@5;)
                  end
                  local.get 4
                  i32.load8_u offset=12
                  i32.const 8
                  i32.and
                  br_if 0 (;@6;)
                  local.get 3
                  local.get 6
                  i32.lt_u
                  br_if 0 (;@6;)
                  local.get 3
                  local.get 0
                  i32.ge_u
                  br_if 0 (;@6;)
                  local.get 3
                  i32.const -8
                  local.get 3
                  i32.sub
                  i32.const 15
                  i32.and
                  i32.const 0
                  local.get 3
                  i32.const 8
                  i32.add
                  i32.const 15
                  i32.and
                  select
                  local.tee 6
                  i32.add
                  local.tee 0
                  i32.const 0
                  i32.load offset=4624
                  local.get 7
                  i32.add
                  local.tee 2
                  local.get 6
                  i32.sub
                  local.tee 6
                  i32.const 1
                  i32.or
                  i32.store offset=4
                  local.get 4
                  local.get 9
                  local.get 7
                  i32.add
                  i32.store offset=4
                  i32.const 0
                  i32.const 0
                  i32.load offset=5100
                  i32.store offset=4640
                  i32.const 0
                  local.get 6
                  i32.store offset=4624
                  i32.const 0
                  local.get 0
                  i32.store offset=4636
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
                  i32.load offset=4628
                  local.tee 9
                  i32.ge_u
                  br_if 0 (;@6;)
                  i32.const 0
                  local.get 0
                  i32.store offset=4628
                  local.get 0
                  local.set 9
                end
                local.get 0
                local.get 7
                i32.add
                local.set 6
                i32.const 5060
                local.set 4
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      block ;; label = @9
                        block ;; label = @10
                          block ;; label = @11
                            block ;; label = @12
                              loop ;; label = @13
                                local.get 4
                                i32.load
                                local.get 6
                                i32.eq
                                br_if 1 (;@12;)
                                local.get 4
                                i32.load offset=8
                                local.tee 4
                                br_if 0 (;@13;)
                                br 2 (;@11;)
                              end
                            end
                            local.get 4
                            i32.load8_u offset=12
                            i32.const 8
                            i32.and
                            i32.eqz
                            br_if 1 (;@10;)
                          end
                          i32.const 5060
                          local.set 4
                          loop ;; label = @11
                            block ;; label = @12
                              local.get 4
                              i32.load
                              local.tee 6
                              local.get 3
                              i32.gt_u
                              br_if 0 (;@12;)
                              local.get 6
                              local.get 4
                              i32.load offset=4
                              i32.add
                              local.tee 6
                              local.get 3
                              i32.gt_u
                              br_if 3 (;@9;)
                            end
                            local.get 4
                            i32.load offset=8
                            local.set 4
                            br 0 (;@11;)
                          end
                        end
                        local.get 4
                        local.get 0
                        i32.store
                        local.get 4
                        local.get 4
                        i32.load offset=4
                        local.get 7
                        i32.add
                        i32.store offset=4
                        local.get 0
                        i32.const -8
                        local.get 0
                        i32.sub
                        i32.const 15
                        i32.and
                        i32.const 0
                        local.get 0
                        i32.const 8
                        i32.add
                        i32.const 15
                        i32.and
                        select
                        i32.add
                        local.tee 2
                        local.get 5
                        i32.const 3
                        i32.or
                        i32.store offset=4
                        local.get 6
                        i32.const -8
                        local.get 6
                        i32.sub
                        i32.const 15
                        i32.and
                        i32.const 0
                        local.get 6
                        i32.const 8
                        i32.add
                        i32.const 15
                        i32.and
                        select
                        i32.add
                        local.tee 7
                        local.get 2
                        local.get 5
                        i32.add
                        local.tee 5
                        i32.sub
                        local.set 4
                        block ;; label = @10
                          local.get 7
                          local.get 3
                          i32.ne
                          br_if 0 (;@10;)
                          i32.const 0
                          local.get 5
                          i32.store offset=4636
                          i32.const 0
                          i32.const 0
                          i32.load offset=4624
                          local.get 4
                          i32.add
                          local.tee 4
                          i32.store offset=4624
                          local.get 5
                          local.get 4
                          i32.const 1
                          i32.or
                          i32.store offset=4
                          br 3 (;@7;)
                        end
                        block ;; label = @10
                          local.get 7
                          i32.const 0
                          i32.load offset=4632
                          i32.ne
                          br_if 0 (;@10;)
                          i32.const 0
                          local.get 5
                          i32.store offset=4632
                          i32.const 0
                          i32.const 0
                          i32.load offset=4620
                          local.get 4
                          i32.add
                          local.tee 4
                          i32.store offset=4620
                          local.get 5
                          local.get 4
                          i32.const 1
                          i32.or
                          i32.store offset=4
                          local.get 5
                          local.get 4
                          i32.add
                          local.get 4
                          i32.store
                          br 3 (;@7;)
                        end
                        block ;; label = @10
                          local.get 7
                          i32.load offset=4
                          local.tee 3
                          i32.const 3
                          i32.and
                          i32.const 1
                          i32.ne
                          br_if 0 (;@10;)
                          local.get 3
                          i32.const -8
                          i32.and
                          local.set 8
                          block ;; label = @11
                            block ;; label = @12
                              local.get 3
                              i32.const 255
                              i32.gt_u
                              br_if 0 (;@12;)
                              local.get 7
                              i32.load offset=8
                              local.tee 6
                              local.get 3
                              i32.const 3
                              i32.shr_u
                              local.tee 9
                              i32.const 3
                              i32.shl
                              i32.const 4652
                              i32.add
                              local.tee 0
                              i32.eq
                              drop
                              block ;; label = @13
                                local.get 7
                                i32.load offset=12
                                local.tee 3
                                local.get 6
                                i32.ne
                                br_if 0 (;@13;)
                                i32.const 0
                                i32.const 0
                                i32.load offset=4612
                                i32.const -2
                                local.get 9
                                i32.rotl
                                i32.and
                                i32.store offset=4612
                                br 2 (;@11;)
                              end
                              local.get 3
                              local.get 0
                              i32.eq
                              drop
                              local.get 3
                              local.get 6
                              i32.store offset=8
                              local.get 6
                              local.get 3
                              i32.store offset=12
                              br 1 (;@11;)
                            end
                            local.get 7
                            i32.load offset=24
                            local.set 10
                            block ;; label = @12
                              block ;; label = @13
                                local.get 7
                                i32.load offset=12
                                local.tee 0
                                local.get 7
                                i32.eq
                                br_if 0 (;@13;)
                                local.get 7
                                i32.load offset=8
                                local.tee 3
                                local.get 9
                                i32.lt_u
                                drop
                                local.get 0
                                local.get 3
                                i32.store offset=8
                                local.get 3
                                local.get 0
                                i32.store offset=12
                                br 1 (;@12;)
                              end
                              block ;; label = @13
                                local.get 7
                                i32.const 20
                                i32.add
                                local.tee 3
                                i32.load
                                local.tee 6
                                br_if 0 (;@13;)
                                local.get 7
                                i32.const 16
                                i32.add
                                local.tee 3
                                i32.load
                                local.tee 6
                                br_if 0 (;@13;)
                                i32.const 0
                                local.set 0
                                br 1 (;@12;)
                              end
                              loop ;; label = @13
                                local.get 3
                                local.set 9
                                local.get 6
                                local.tee 0
                                i32.const 20
                                i32.add
                                local.tee 3
                                i32.load
                                local.tee 6
                                br_if 0 (;@13;)
                                local.get 0
                                i32.const 16
                                i32.add
                                local.set 3
                                local.get 0
                                i32.load offset=16
                                local.tee 6
                                br_if 0 (;@13;)
                              end
                              local.get 9
                              i32.const 0
                              i32.store
                            end
                            local.get 10
                            i32.eqz
                            br_if 0 (;@11;)
                            block ;; label = @12
                              block ;; label = @13
                                local.get 7
                                local.get 7
                                i32.load offset=28
                                local.tee 6
                                i32.const 2
                                i32.shl
                                i32.const 4916
                                i32.add
                                local.tee 3
                                i32.load
                                i32.ne
                                br_if 0 (;@13;)
                                local.get 3
                                local.get 0
                                i32.store
                                local.get 0
                                br_if 1 (;@12;)
                                i32.const 0
                                i32.const 0
                                i32.load offset=4616
                                i32.const -2
                                local.get 6
                                i32.rotl
                                i32.and
                                i32.store offset=4616
                                br 2 (;@11;)
                              end
                              local.get 10
                              i32.const 16
                              i32.const 20
                              local.get 10
                              i32.load offset=16
                              local.get 7
                              i32.eq
                              select
                              i32.add
                              local.get 0
                              i32.store
                              local.get 0
                              i32.eqz
                              br_if 1 (;@11;)
                            end
                            local.get 0
                            local.get 10
                            i32.store offset=24
                            block ;; label = @12
                              local.get 7
                              i32.load offset=16
                              local.tee 3
                              i32.eqz
                              br_if 0 (;@12;)
                              local.get 0
                              local.get 3
                              i32.store offset=16
                              local.get 3
                              local.get 0
                              i32.store offset=24
                            end
                            local.get 7
                            i32.load offset=20
                            local.tee 3
                            i32.eqz
                            br_if 0 (;@11;)
                            local.get 0
                            i32.const 20
                            i32.add
                            local.get 3
                            i32.store
                            local.get 3
                            local.get 0
                            i32.store offset=24
                          end
                          local.get 8
                          local.get 4
                          i32.add
                          local.set 4
                          local.get 7
                          local.get 8
                          i32.add
                          local.tee 7
                          i32.load offset=4
                          local.set 3
                        end
                        local.get 7
                        local.get 3
                        i32.const -2
                        i32.and
                        i32.store offset=4
                        local.get 5
                        local.get 4
                        i32.add
                        local.get 4
                        i32.store
                        local.get 5
                        local.get 4
                        i32.const 1
                        i32.or
                        i32.store offset=4
                        block ;; label = @10
                          local.get 4
                          i32.const 255
                          i32.gt_u
                          br_if 0 (;@10;)
                          local.get 4
                          i32.const -8
                          i32.and
                          i32.const 4652
                          i32.add
                          local.set 3
                          block ;; label = @11
                            block ;; label = @12
                              i32.const 0
                              i32.load offset=4612
                              local.tee 6
                              i32.const 1
                              local.get 4
                              i32.const 3
                              i32.shr_u
                              i32.shl
                              local.tee 4
                              i32.and
                              br_if 0 (;@12;)
                              i32.const 0
                              local.get 6
                              local.get 4
                              i32.or
                              i32.store offset=4612
                              local.get 3
                              local.set 4
                              br 1 (;@11;)
                            end
                            local.get 3
                            i32.load offset=8
                            local.set 4
                          end
                          local.get 4
                          local.get 5
                          i32.store offset=12
                          local.get 3
                          local.get 5
                          i32.store offset=8
                          local.get 5
                          local.get 3
                          i32.store offset=12
                          local.get 5
                          local.get 4
                          i32.store offset=8
                          br 3 (;@7;)
                        end
                        i32.const 31
                        local.set 3
                        block ;; label = @10
                          local.get 4
                          i32.const 16777215
                          i32.gt_u
                          br_if 0 (;@10;)
                          local.get 4
                          i32.const 38
                          local.get 4
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
                        local.get 5
                        local.get 3
                        i32.store offset=28
                        local.get 5
                        i64.const 0
                        i64.store offset=16 align=4
                        local.get 3
                        i32.const 2
                        i32.shl
                        i32.const 4916
                        i32.add
                        local.set 6
                        block ;; label = @10
                          i32.const 0
                          i32.load offset=4616
                          local.tee 0
                          i32.const 1
                          local.get 3
                          i32.shl
                          local.tee 9
                          i32.and
                          br_if 0 (;@10;)
                          local.get 6
                          local.get 5
                          i32.store
                          i32.const 0
                          local.get 0
                          local.get 9
                          i32.or
                          i32.store offset=4616
                          local.get 5
                          local.get 6
                          i32.store offset=24
                          local.get 5
                          local.get 5
                          i32.store offset=8
                          local.get 5
                          local.get 5
                          i32.store offset=12
                          br 3 (;@7;)
                        end
                        local.get 4
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
                        local.get 6
                        i32.load
                        local.set 0
                        loop ;; label = @10
                          local.get 0
                          local.tee 6
                          i32.load offset=4
                          i32.const -8
                          i32.and
                          local.get 4
                          i32.eq
                          br_if 2 (;@8;)
                          local.get 3
                          i32.const 29
                          i32.shr_u
                          local.set 0
                          local.get 3
                          i32.const 1
                          i32.shl
                          local.set 3
                          local.get 6
                          local.get 0
                          i32.const 4
                          i32.and
                          i32.add
                          i32.const 16
                          i32.add
                          local.tee 9
                          i32.load
                          local.tee 0
                          br_if 0 (;@10;)
                        end
                        local.get 9
                        local.get 5
                        i32.store
                        local.get 5
                        local.get 6
                        i32.store offset=24
                        local.get 5
                        local.get 5
                        i32.store offset=12
                        local.get 5
                        local.get 5
                        i32.store offset=8
                        br 2 (;@7;)
                      end
                      local.get 0
                      i32.const -8
                      local.get 0
                      i32.sub
                      i32.const 15
                      i32.and
                      i32.const 0
                      local.get 0
                      i32.const 8
                      i32.add
                      i32.const 15
                      i32.and
                      select
                      local.tee 4
                      i32.add
                      local.tee 2
                      local.get 7
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
                      local.get 6
                      i32.const 55
                      local.get 6
                      i32.sub
                      i32.const 15
                      i32.and
                      i32.const 0
                      local.get 6
                      i32.const -55
                      i32.add
                      i32.const 15
                      i32.and
                      select
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
                      i32.load offset=5100
                      i32.store offset=4640
                      i32.const 0
                      local.get 4
                      i32.store offset=4624
                      i32.const 0
                      local.get 2
                      i32.store offset=4636
                      local.get 9
                      i32.const 16
                      i32.add
                      i32.const 0
                      i64.load offset=5068 align=4
                      i64.store align=4
                      local.get 9
                      i32.const 0
                      i64.load offset=5060 align=4
                      i64.store offset=8 align=4
                      i32.const 0
                      local.get 9
                      i32.const 8
                      i32.add
                      i32.store offset=5068
                      i32.const 0
                      local.get 7
                      i32.store offset=5064
                      i32.const 0
                      local.get 0
                      i32.store offset=5060
                      i32.const 0
                      i32.const 0
                      i32.store offset=5072
                      local.get 9
                      i32.const 36
                      i32.add
                      local.set 4
                      loop ;; label = @9
                        local.get 4
                        i32.const 7
                        i32.store
                        local.get 4
                        i32.const 4
                        i32.add
                        local.tee 4
                        local.get 6
                        i32.lt_u
                        br_if 0 (;@9;)
                      end
                      local.get 9
                      local.get 3
                      i32.eq
                      br_if 3 (;@5;)
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
                      block ;; label = @9
                        local.get 0
                        i32.const 255
                        i32.gt_u
                        br_if 0 (;@9;)
                        local.get 0
                        i32.const -8
                        i32.and
                        i32.const 4652
                        i32.add
                        local.set 4
                        block ;; label = @10
                          block ;; label = @11
                            i32.const 0
                            i32.load offset=4612
                            local.tee 6
                            i32.const 1
                            local.get 0
                            i32.const 3
                            i32.shr_u
                            i32.shl
                            local.tee 0
                            i32.and
                            br_if 0 (;@11;)
                            i32.const 0
                            local.get 6
                            local.get 0
                            i32.or
                            i32.store offset=4612
                            local.get 4
                            local.set 6
                            br 1 (;@10;)
                          end
                          local.get 4
                          i32.load offset=8
                          local.set 6
                        end
                        local.get 6
                        local.get 3
                        i32.store offset=12
                        local.get 4
                        local.get 3
                        i32.store offset=8
                        local.get 3
                        local.get 4
                        i32.store offset=12
                        local.get 3
                        local.get 6
                        i32.store offset=8
                        br 4 (;@5;)
                      end
                      i32.const 31
                      local.set 4
                      block ;; label = @9
                        local.get 0
                        i32.const 16777215
                        i32.gt_u
                        br_if 0 (;@9;)
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
                      i32.const 4916
                      i32.add
                      local.set 6
                      block ;; label = @9
                        i32.const 0
                        i32.load offset=4616
                        local.tee 9
                        i32.const 1
                        local.get 4
                        i32.shl
                        local.tee 7
                        i32.and
                        br_if 0 (;@9;)
                        local.get 6
                        local.get 3
                        i32.store
                        i32.const 0
                        local.get 9
                        local.get 7
                        i32.or
                        i32.store offset=4616
                        local.get 3
                        local.get 6
                        i32.store offset=24
                        local.get 3
                        local.get 3
                        i32.store offset=8
                        local.get 3
                        local.get 3
                        i32.store offset=12
                        br 4 (;@5;)
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
                      local.get 6
                      i32.load
                      local.set 9
                      loop ;; label = @9
                        local.get 9
                        local.tee 6
                        i32.load offset=4
                        i32.const -8
                        i32.and
                        local.get 0
                        i32.eq
                        br_if 3 (;@6;)
                        local.get 4
                        i32.const 29
                        i32.shr_u
                        local.set 9
                        local.get 4
                        i32.const 1
                        i32.shl
                        local.set 4
                        local.get 6
                        local.get 9
                        i32.const 4
                        i32.and
                        i32.add
                        i32.const 16
                        i32.add
                        local.tee 7
                        i32.load
                        local.tee 9
                        br_if 0 (;@9;)
                      end
                      local.get 7
                      local.get 3
                      i32.store
                      local.get 3
                      local.get 6
                      i32.store offset=24
                      local.get 3
                      local.get 3
                      i32.store offset=12
                      local.get 3
                      local.get 3
                      i32.store offset=8
                      br 3 (;@5;)
                    end
                    local.get 6
                    i32.load offset=8
                    local.tee 4
                    local.get 5
                    i32.store offset=12
                    local.get 6
                    local.get 5
                    i32.store offset=8
                    local.get 5
                    i32.const 0
                    i32.store offset=24
                    local.get 5
                    local.get 6
                    i32.store offset=12
                    local.get 5
                    local.get 4
                    i32.store offset=8
                  end
                  local.get 2
                  i32.const 8
                  i32.add
                  local.set 4
                  br 5 (;@1;)
                end
                local.get 6
                i32.load offset=8
                local.tee 4
                local.get 3
                i32.store offset=12
                local.get 6
                local.get 3
                i32.store offset=8
                local.get 3
                i32.const 0
                i32.store offset=24
                local.get 3
                local.get 6
                i32.store offset=12
                local.get 3
                local.get 4
                i32.store offset=8
              end
              i32.const 0
              i32.load offset=4624
              local.tee 4
              local.get 5
              i32.le_u
              br_if 0 (;@4;)
              i32.const 0
              i32.load offset=4636
              local.tee 3
              local.get 5
              i32.add
              local.tee 6
              local.get 4
              local.get 5
              i32.sub
              local.tee 4
              i32.const 1
              i32.or
              i32.store offset=4
              i32.const 0
              local.get 4
              i32.store offset=4624
              i32.const 0
              local.get 6
              i32.store offset=4636
              local.get 3
              local.get 5
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
            i32.store offset=5108
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
                local.tee 6
                i32.const 2
                i32.shl
                i32.const 4916
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
                local.get 10
                i32.const -2
                local.get 6
                i32.rotl
                i32.and
                local.tee 10
                i32.store offset=4616
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
              local.get 5
              i32.add
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
            local.get 5
            i32.add
            local.tee 0
            local.get 3
            i32.const 1
            i32.or
            i32.store offset=4
            local.get 9
            local.get 5
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
              i32.const 4652
              i32.add
              local.set 4
              block ;; label = @5
                block ;; label = @6
                  i32.const 0
                  i32.load offset=4612
                  local.tee 6
                  i32.const 1
                  local.get 3
                  i32.const 3
                  i32.shr_u
                  i32.shl
                  local.tee 3
                  i32.and
                  br_if 0 (;@6;)
                  i32.const 0
                  local.get 6
                  local.get 3
                  i32.or
                  i32.store offset=4612
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
            i32.const 4916
            i32.add
            local.set 6
            block ;; label = @4
              local.get 10
              i32.const 1
              local.get 4
              i32.shl
              local.tee 5
              i32.and
              br_if 0 (;@4;)
              local.get 6
              local.get 0
              i32.store
              i32.const 0
              local.get 10
              local.get 5
              i32.or
              i32.store offset=4616
              local.get 0
              local.get 6
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
            local.get 6
            i32.load
            local.set 5
            block ;; label = @4
              loop ;; label = @5
                local.get 5
                local.tee 6
                i32.load offset=4
                i32.const -8
                i32.and
                local.get 3
                i32.eq
                br_if 1 (;@4;)
                local.get 4
                i32.const 29
                i32.shr_u
                local.set 5
                local.get 4
                i32.const 1
                i32.shl
                local.set 4
                local.get 6
                local.get 5
                i32.const 4
                i32.and
                i32.add
                i32.const 16
                i32.add
                local.tee 7
                i32.load
                local.tee 5
                br_if 0 (;@5;)
              end
              local.get 7
              local.get 0
              i32.store
              local.get 0
              local.get 6
              i32.store offset=24
              local.get 0
              local.get 0
              i32.store offset=12
              local.get 0
              local.get 0
              i32.store offset=8
              br 1 (;@3;)
            end
            local.get 6
            i32.load offset=8
            local.tee 4
            local.get 0
            i32.store offset=12
            local.get 6
            local.get 0
            i32.store offset=8
            local.get 0
            i32.const 0
            i32.store offset=24
            local.get 0
            local.get 6
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
              local.tee 6
              i32.const 2
              i32.shl
              i32.const 4916
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
              local.get 6
              i32.rotl
              i32.and
              i32.store offset=4616
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
            local.get 5
            i32.add
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
          local.get 5
          i32.add
          local.tee 6
          local.get 3
          i32.const 1
          i32.or
          i32.store offset=4
          local.get 0
          local.get 5
          i32.const 3
          i32.or
          i32.store offset=4
          local.get 6
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
            i32.const 4652
            i32.add
            local.set 5
            i32.const 0
            i32.load offset=4632
            local.set 4
            block ;; label = @4
              block ;; label = @5
                i32.const 1
                local.get 8
                i32.const 3
                i32.shr_u
                i32.shl
                local.tee 9
                local.get 7
                i32.and
                br_if 0 (;@5;)
                i32.const 0
                local.get 9
                local.get 7
                i32.or
                i32.store offset=4612
                local.get 5
                local.set 9
                br 1 (;@4;)
              end
              local.get 5
              i32.load offset=8
              local.set 9
            end
            local.get 9
            local.get 4
            i32.store offset=12
            local.get 5
            local.get 4
            i32.store offset=8
            local.get 4
            local.get 5
            i32.store offset=12
            local.get 4
            local.get 9
            i32.store offset=8
          end
          i32.const 0
          local.get 6
          i32.store offset=4632
          i32.const 0
          local.get 3
          i32.store offset=4620
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
    (func $dlfree (;37;) (type $.data) (param i32)
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
          i32.const 3
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
          i32.load offset=4628
          local.tee 4
          i32.lt_u
          br_if 1 (;@1;)
          local.get 2
          local.get 0
          i32.add
          local.set 0
          block ;; label = @3
            local.get 1
            i32.const 0
            i32.load offset=4632
            i32.eq
            br_if 0 (;@3;)
            block ;; label = @4
              local.get 2
              i32.const 255
              i32.gt_u
              br_if 0 (;@4;)
              local.get 1
              i32.load offset=8
              local.tee 4
              local.get 2
              i32.const 3
              i32.shr_u
              local.tee 5
              i32.const 3
              i32.shl
              i32.const 4652
              i32.add
              local.tee 6
              i32.eq
              drop
              block ;; label = @5
                local.get 1
                i32.load offset=12
                local.tee 2
                local.get 4
                i32.ne
                br_if 0 (;@5;)
                i32.const 0
                i32.const 0
                i32.load offset=4612
                i32.const -2
                local.get 5
                i32.rotl
                i32.and
                i32.store offset=4612
                br 3 (;@2;)
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
              br 2 (;@2;)
            end
            local.get 1
            i32.load offset=24
            local.set 7
            block ;; label = @4
              block ;; label = @5
                local.get 1
                i32.load offset=12
                local.tee 6
                local.get 1
                i32.eq
                br_if 0 (;@5;)
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
                br 1 (;@4;)
              end
              block ;; label = @5
                local.get 1
                i32.const 20
                i32.add
                local.tee 2
                i32.load
                local.tee 4
                br_if 0 (;@5;)
                local.get 1
                i32.const 16
                i32.add
                local.tee 2
                i32.load
                local.tee 4
                br_if 0 (;@5;)
                i32.const 0
                local.set 6
                br 1 (;@4;)
              end
              loop ;; label = @5
                local.get 2
                local.set 5
                local.get 4
                local.tee 6
                i32.const 20
                i32.add
                local.tee 2
                i32.load
                local.tee 4
                br_if 0 (;@5;)
                local.get 6
                i32.const 16
                i32.add
                local.set 2
                local.get 6
                i32.load offset=16
                local.tee 4
                br_if 0 (;@5;)
              end
              local.get 5
              i32.const 0
              i32.store
            end
            local.get 7
            i32.eqz
            br_if 1 (;@2;)
            block ;; label = @4
              block ;; label = @5
                local.get 1
                local.get 1
                i32.load offset=28
                local.tee 4
                i32.const 2
                i32.shl
                i32.const 4916
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
                i32.load offset=4616
                i32.const -2
                local.get 4
                i32.rotl
                i32.and
                i32.store offset=4616
                br 3 (;@2;)
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
              br_if 2 (;@2;)
            end
            local.get 6
            local.get 7
            i32.store offset=24
            block ;; label = @4
              local.get 1
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
            local.get 1
            i32.load offset=20
            local.tee 2
            i32.eqz
            br_if 1 (;@2;)
            local.get 6
            i32.const 20
            i32.add
            local.get 2
            i32.store
            local.get 2
            local.get 6
            i32.store offset=24
            br 1 (;@2;)
          end
          local.get 3
          i32.load offset=4
          local.tee 2
          i32.const 3
          i32.and
          i32.const 3
          i32.ne
          br_if 0 (;@2;)
          local.get 3
          local.get 2
          i32.const -2
          i32.and
          i32.store offset=4
          i32.const 0
          local.get 0
          i32.store offset=4620
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
          return
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
            local.get 2
            i32.const 2
            i32.and
            br_if 0 (;@3;)
            block ;; label = @4
              local.get 3
              i32.const 0
              i32.load offset=4636
              i32.ne
              br_if 0 (;@4;)
              i32.const 0
              local.get 1
              i32.store offset=4636
              i32.const 0
              i32.const 0
              i32.load offset=4624
              local.get 0
              i32.add
              local.tee 0
              i32.store offset=4624
              local.get 1
              local.get 0
              i32.const 1
              i32.or
              i32.store offset=4
              local.get 1
              i32.const 0
              i32.load offset=4632
              i32.ne
              br_if 3 (;@1;)
              i32.const 0
              i32.const 0
              i32.store offset=4620
              i32.const 0
              i32.const 0
              i32.store offset=4632
              return
            end
            block ;; label = @4
              local.get 3
              i32.const 0
              i32.load offset=4632
              i32.ne
              br_if 0 (;@4;)
              i32.const 0
              local.get 1
              i32.store offset=4632
              i32.const 0
              i32.const 0
              i32.load offset=4620
              local.get 0
              i32.add
              local.tee 0
              i32.store offset=4620
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
            block ;; label = @4
              block ;; label = @5
                local.get 2
                i32.const 255
                i32.gt_u
                br_if 0 (;@5;)
                local.get 3
                i32.load offset=8
                local.tee 4
                local.get 2
                i32.const 3
                i32.shr_u
                local.tee 5
                i32.const 3
                i32.shl
                i32.const 4652
                i32.add
                local.tee 6
                i32.eq
                drop
                block ;; label = @6
                  local.get 3
                  i32.load offset=12
                  local.tee 2
                  local.get 4
                  i32.ne
                  br_if 0 (;@6;)
                  i32.const 0
                  i32.const 0
                  i32.load offset=4612
                  i32.const -2
                  local.get 5
                  i32.rotl
                  i32.and
                  i32.store offset=4612
                  br 2 (;@4;)
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
                br 1 (;@4;)
              end
              local.get 3
              i32.load offset=24
              local.set 7
              block ;; label = @5
                block ;; label = @6
                  local.get 3
                  i32.load offset=12
                  local.tee 6
                  local.get 3
                  i32.eq
                  br_if 0 (;@6;)
                  local.get 3
                  i32.load offset=8
                  local.tee 2
                  i32.const 0
                  i32.load offset=4628
                  i32.lt_u
                  drop
                  local.get 6
                  local.get 2
                  i32.store offset=8
                  local.get 2
                  local.get 6
                  i32.store offset=12
                  br 1 (;@5;)
                end
                block ;; label = @6
                  local.get 3
                  i32.const 20
                  i32.add
                  local.tee 2
                  i32.load
                  local.tee 4
                  br_if 0 (;@6;)
                  local.get 3
                  i32.const 16
                  i32.add
                  local.tee 2
                  i32.load
                  local.tee 4
                  br_if 0 (;@6;)
                  i32.const 0
                  local.set 6
                  br 1 (;@5;)
                end
                loop ;; label = @6
                  local.get 2
                  local.set 5
                  local.get 4
                  local.tee 6
                  i32.const 20
                  i32.add
                  local.tee 2
                  i32.load
                  local.tee 4
                  br_if 0 (;@6;)
                  local.get 6
                  i32.const 16
                  i32.add
                  local.set 2
                  local.get 6
                  i32.load offset=16
                  local.tee 4
                  br_if 0 (;@6;)
                end
                local.get 5
                i32.const 0
                i32.store
              end
              local.get 7
              i32.eqz
              br_if 0 (;@4;)
              block ;; label = @5
                block ;; label = @6
                  local.get 3
                  local.get 3
                  i32.load offset=28
                  local.tee 4
                  i32.const 2
                  i32.shl
                  i32.const 4916
                  i32.add
                  local.tee 2
                  i32.load
                  i32.ne
                  br_if 0 (;@6;)
                  local.get 2
                  local.get 6
                  i32.store
                  local.get 6
                  br_if 1 (;@5;)
                  i32.const 0
                  i32.const 0
                  i32.load offset=4616
                  i32.const -2
                  local.get 4
                  i32.rotl
                  i32.and
                  i32.store offset=4616
                  br 2 (;@4;)
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
                br_if 1 (;@4;)
              end
              local.get 6
              local.get 7
              i32.store offset=24
              block ;; label = @5
                local.get 3
                i32.load offset=16
                local.tee 2
                i32.eqz
                br_if 0 (;@5;)
                local.get 6
                local.get 2
                i32.store offset=16
                local.get 2
                local.get 6
                i32.store offset=24
              end
              local.get 3
              i32.load offset=20
              local.tee 2
              i32.eqz
              br_if 0 (;@4;)
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
            i32.load offset=4632
            i32.ne
            br_if 1 (;@2;)
            i32.const 0
            local.get 0
            i32.store offset=4620
            return
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
        end
        block ;; label = @2
          local.get 0
          i32.const 255
          i32.gt_u
          br_if 0 (;@2;)
          local.get 0
          i32.const -8
          i32.and
          i32.const 4652
          i32.add
          local.set 2
          block ;; label = @3
            block ;; label = @4
              i32.const 0
              i32.load offset=4612
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
              i32.store offset=4612
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
        i32.const 4916
        i32.add
        local.set 4
        block ;; label = @2
          block ;; label = @3
            i32.const 0
            i32.load offset=4616
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
            i32.store offset=4616
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
        i32.load offset=4644
        i32.const -1
        i32.add
        local.tee 1
        i32.const -1
        local.get 1
        select
        i32.store offset=4644
      end
    )
    (func $realloc (;38;) (type 11) (param i32 i32) (result i32)
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
        i32.store offset=5108
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
            i32.load offset=5092
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
            i32.load offset=4636
            i32.ne
            br_if 0 (;@3;)
            i32.const 0
            i32.load offset=4624
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
            i32.store offset=4636
            i32.const 0
            local.get 5
            local.get 2
            i32.sub
            local.tee 2
            i32.store offset=4624
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
            i32.load offset=4632
            i32.ne
            br_if 0 (;@3;)
            i32.const 0
            i32.load offset=4620
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
            i32.store offset=4632
            i32.const 0
            local.get 1
            i32.store offset=4620
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
              i32.const 4652
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
                i32.load offset=4612
                i32.const -2
                local.get 11
                i32.rotl
                i32.and
                i32.store offset=4612
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
                i32.load offset=4628
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
                local.get 7
                i32.const 20
                i32.add
                local.tee 1
                i32.load
                local.tee 5
                br_if 0 (;@5;)
                local.get 7
                i32.const 16
                i32.add
                local.tee 1
                i32.load
                local.tee 5
                br_if 0 (;@5;)
                i32.const 0
                local.set 8
                br 1 (;@4;)
              end
              loop ;; label = @5
                local.get 1
                local.set 11
                local.get 5
                local.tee 8
                i32.const 20
                i32.add
                local.tee 1
                i32.load
                local.tee 5
                br_if 0 (;@5;)
                local.get 8
                i32.const 16
                i32.add
                local.set 1
                local.get 8
                i32.load offset=16
                local.tee 5
                br_if 0 (;@5;)
              end
              local.get 11
              i32.const 0
              i32.store
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
                i32.const 4916
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
                i32.load offset=4616
                i32.const -2
                local.get 5
                i32.rotl
                i32.and
                i32.store offset=4616
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
            i32.load offset=20
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
    (func $dispose_chunk (;39;) (type 8) (param i32 i32)
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
          i32.const 3
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
              local.get 0
              local.get 3
              i32.sub
              local.tee 0
              i32.const 0
              i32.load offset=4632
              i32.eq
              br_if 0 (;@4;)
              block ;; label = @5
                local.get 3
                i32.const 255
                i32.gt_u
                br_if 0 (;@5;)
                local.get 0
                i32.load offset=8
                local.tee 4
                local.get 3
                i32.const 3
                i32.shr_u
                local.tee 5
                i32.const 3
                i32.shl
                i32.const 4652
                i32.add
                local.tee 6
                i32.eq
                drop
                local.get 0
                i32.load offset=12
                local.tee 3
                local.get 4
                i32.ne
                br_if 2 (;@3;)
                i32.const 0
                i32.const 0
                i32.load offset=4612
                i32.const -2
                local.get 5
                i32.rotl
                i32.and
                i32.store offset=4612
                br 3 (;@2;)
              end
              local.get 0
              i32.load offset=24
              local.set 7
              block ;; label = @5
                block ;; label = @6
                  local.get 0
                  i32.load offset=12
                  local.tee 6
                  local.get 0
                  i32.eq
                  br_if 0 (;@6;)
                  local.get 0
                  i32.load offset=8
                  local.tee 3
                  i32.const 0
                  i32.load offset=4628
                  i32.lt_u
                  drop
                  local.get 6
                  local.get 3
                  i32.store offset=8
                  local.get 3
                  local.get 6
                  i32.store offset=12
                  br 1 (;@5;)
                end
                block ;; label = @6
                  local.get 0
                  i32.const 20
                  i32.add
                  local.tee 3
                  i32.load
                  local.tee 4
                  br_if 0 (;@6;)
                  local.get 0
                  i32.const 16
                  i32.add
                  local.tee 3
                  i32.load
                  local.tee 4
                  br_if 0 (;@6;)
                  i32.const 0
                  local.set 6
                  br 1 (;@5;)
                end
                loop ;; label = @6
                  local.get 3
                  local.set 5
                  local.get 4
                  local.tee 6
                  i32.const 20
                  i32.add
                  local.tee 3
                  i32.load
                  local.tee 4
                  br_if 0 (;@6;)
                  local.get 6
                  i32.const 16
                  i32.add
                  local.set 3
                  local.get 6
                  i32.load offset=16
                  local.tee 4
                  br_if 0 (;@6;)
                end
                local.get 5
                i32.const 0
                i32.store
              end
              local.get 7
              i32.eqz
              br_if 2 (;@2;)
              block ;; label = @5
                block ;; label = @6
                  local.get 0
                  local.get 0
                  i32.load offset=28
                  local.tee 4
                  i32.const 2
                  i32.shl
                  i32.const 4916
                  i32.add
                  local.tee 3
                  i32.load
                  i32.ne
                  br_if 0 (;@6;)
                  local.get 3
                  local.get 6
                  i32.store
                  local.get 6
                  br_if 1 (;@5;)
                  i32.const 0
                  i32.const 0
                  i32.load offset=4616
                  i32.const -2
                  local.get 4
                  i32.rotl
                  i32.and
                  i32.store offset=4616
                  br 4 (;@2;)
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
                br_if 3 (;@2;)
              end
              local.get 6
              local.get 7
              i32.store offset=24
              block ;; label = @5
                local.get 0
                i32.load offset=16
                local.tee 3
                i32.eqz
                br_if 0 (;@5;)
                local.get 6
                local.get 3
                i32.store offset=16
                local.get 3
                local.get 6
                i32.store offset=24
              end
              local.get 0
              i32.load offset=20
              local.tee 3
              i32.eqz
              br_if 2 (;@2;)
              local.get 6
              i32.const 20
              i32.add
              local.get 3
              i32.store
              local.get 3
              local.get 6
              i32.store offset=24
              br 2 (;@2;)
            end
            local.get 2
            i32.load offset=4
            local.tee 3
            i32.const 3
            i32.and
            i32.const 3
            i32.ne
            br_if 1 (;@2;)
            local.get 2
            local.get 3
            i32.const -2
            i32.and
            i32.store offset=4
            i32.const 0
            local.get 1
            i32.store offset=4620
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
        end
        block ;; label = @2
          block ;; label = @3
            local.get 2
            i32.load offset=4
            local.tee 3
            i32.const 2
            i32.and
            br_if 0 (;@3;)
            block ;; label = @4
              local.get 2
              i32.const 0
              i32.load offset=4636
              i32.ne
              br_if 0 (;@4;)
              i32.const 0
              local.get 0
              i32.store offset=4636
              i32.const 0
              i32.const 0
              i32.load offset=4624
              local.get 1
              i32.add
              local.tee 1
              i32.store offset=4624
              local.get 0
              local.get 1
              i32.const 1
              i32.or
              i32.store offset=4
              local.get 0
              i32.const 0
              i32.load offset=4632
              i32.ne
              br_if 3 (;@1;)
              i32.const 0
              i32.const 0
              i32.store offset=4620
              i32.const 0
              i32.const 0
              i32.store offset=4632
              return
            end
            block ;; label = @4
              local.get 2
              i32.const 0
              i32.load offset=4632
              i32.ne
              br_if 0 (;@4;)
              i32.const 0
              local.get 0
              i32.store offset=4632
              i32.const 0
              i32.const 0
              i32.load offset=4620
              local.get 1
              i32.add
              local.tee 1
              i32.store offset=4620
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
            block ;; label = @4
              block ;; label = @5
                local.get 3
                i32.const 255
                i32.gt_u
                br_if 0 (;@5;)
                local.get 2
                i32.load offset=8
                local.tee 4
                local.get 3
                i32.const 3
                i32.shr_u
                local.tee 5
                i32.const 3
                i32.shl
                i32.const 4652
                i32.add
                local.tee 6
                i32.eq
                drop
                block ;; label = @6
                  local.get 2
                  i32.load offset=12
                  local.tee 3
                  local.get 4
                  i32.ne
                  br_if 0 (;@6;)
                  i32.const 0
                  i32.const 0
                  i32.load offset=4612
                  i32.const -2
                  local.get 5
                  i32.rotl
                  i32.and
                  i32.store offset=4612
                  br 2 (;@4;)
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
                br 1 (;@4;)
              end
              local.get 2
              i32.load offset=24
              local.set 7
              block ;; label = @5
                block ;; label = @6
                  local.get 2
                  i32.load offset=12
                  local.tee 6
                  local.get 2
                  i32.eq
                  br_if 0 (;@6;)
                  local.get 2
                  i32.load offset=8
                  local.tee 3
                  i32.const 0
                  i32.load offset=4628
                  i32.lt_u
                  drop
                  local.get 6
                  local.get 3
                  i32.store offset=8
                  local.get 3
                  local.get 6
                  i32.store offset=12
                  br 1 (;@5;)
                end
                block ;; label = @6
                  local.get 2
                  i32.const 20
                  i32.add
                  local.tee 4
                  i32.load
                  local.tee 3
                  br_if 0 (;@6;)
                  local.get 2
                  i32.const 16
                  i32.add
                  local.tee 4
                  i32.load
                  local.tee 3
                  br_if 0 (;@6;)
                  i32.const 0
                  local.set 6
                  br 1 (;@5;)
                end
                loop ;; label = @6
                  local.get 4
                  local.set 5
                  local.get 3
                  local.tee 6
                  i32.const 20
                  i32.add
                  local.tee 4
                  i32.load
                  local.tee 3
                  br_if 0 (;@6;)
                  local.get 6
                  i32.const 16
                  i32.add
                  local.set 4
                  local.get 6
                  i32.load offset=16
                  local.tee 3
                  br_if 0 (;@6;)
                end
                local.get 5
                i32.const 0
                i32.store
              end
              local.get 7
              i32.eqz
              br_if 0 (;@4;)
              block ;; label = @5
                block ;; label = @6
                  local.get 2
                  local.get 2
                  i32.load offset=28
                  local.tee 4
                  i32.const 2
                  i32.shl
                  i32.const 4916
                  i32.add
                  local.tee 3
                  i32.load
                  i32.ne
                  br_if 0 (;@6;)
                  local.get 3
                  local.get 6
                  i32.store
                  local.get 6
                  br_if 1 (;@5;)
                  i32.const 0
                  i32.const 0
                  i32.load offset=4616
                  i32.const -2
                  local.get 4
                  i32.rotl
                  i32.and
                  i32.store offset=4616
                  br 2 (;@4;)
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
                br_if 1 (;@4;)
              end
              local.get 6
              local.get 7
              i32.store offset=24
              block ;; label = @5
                local.get 2
                i32.load offset=16
                local.tee 3
                i32.eqz
                br_if 0 (;@5;)
                local.get 6
                local.get 3
                i32.store offset=16
                local.get 3
                local.get 6
                i32.store offset=24
              end
              local.get 2
              i32.load offset=20
              local.tee 3
              i32.eqz
              br_if 0 (;@4;)
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
            i32.load offset=4632
            i32.ne
            br_if 1 (;@2;)
            i32.const 0
            local.get 1
            i32.store offset=4620
            return
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
        end
        block ;; label = @2
          local.get 1
          i32.const 255
          i32.gt_u
          br_if 0 (;@2;)
          local.get 1
          i32.const -8
          i32.and
          i32.const 4652
          i32.add
          local.set 3
          block ;; label = @3
            block ;; label = @4
              i32.const 0
              i32.load offset=4612
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
              i32.store offset=4612
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
        i32.const 4916
        i32.add
        local.set 4
        block ;; label = @2
          i32.const 0
          i32.load offset=4616
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
          i32.store offset=4616
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
    (func $abort (;40;) (type 7)
      unreachable
      unreachable
    )
    (func $sbrk (;41;) (type 3) (param i32) (result i32)
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
          i32.store offset=5108
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
    (func $__assert_fail (;42;) (type 13) (param i32 i32 i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 4
      global.set $__stack_pointer
      local.get 4
      local.get 2
      i32.store offset=12
      local.get 4
      local.get 3
      i32.store offset=8
      local.get 4
      local.get 1
      i32.store offset=4
      local.get 4
      local.get 0
      i32.store
      i32.const 4480
      i32.const 2250
      local.get 4
      call $fprintf
      drop
      call $abort
      unreachable
    )
    (func $fprintf (;43;) (type $.rodata) (param i32 i32 i32) (result i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 3
      local.get 2
      i32.store offset=12
      local.get 0
      local.get 1
      local.get 2
      call $vfprintf
      local.set 2
      local.get 3
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 2
    )
    (func $__wasi_fd_close (;44;) (type 3) (param i32) (result i32)
      local.get 0
      call $__imported_wasi_snapshot_preview1_fd_close
      i32.const 65535
      i32.and
    )
    (func $__wasi_fd_seek (;45;) (type 5) (param i32 i64 i32 i32) (result i32)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      call $__imported_wasi_snapshot_preview1_fd_seek
      i32.const 65535
      i32.and
    )
    (func $__wasi_fd_write (;46;) (type 6) (param i32 i32 i32 i32) (result i32)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      call $__imported_wasi_snapshot_preview1_fd_write
      i32.const 65535
      i32.and
    )
    (func $close (;47;) (type 3) (param i32) (result i32)
      block ;; label = @1
        local.get 0
        call $__wasi_fd_close
        local.tee 0
        br_if 0 (;@1;)
        i32.const 0
        return
      end
      i32.const 0
      local.get 0
      i32.store offset=5108
      i32.const -1
    )
    (func $__stdio_close (;48;) (type 3) (param i32) (result i32)
      local.get 0
      i32.load offset=56
      call $close
    )
    (func $writev (;49;) (type $.rodata) (param i32 i32 i32) (result i32)
      (local i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      i32.const -1
      local.set 4
      block ;; label = @1
        block ;; label = @2
          local.get 2
          i32.const -1
          i32.gt_s
          br_if 0 (;@2;)
          i32.const 0
          i32.const 28
          i32.store offset=5108
          br 1 (;@1;)
        end
        block ;; label = @2
          local.get 0
          local.get 1
          local.get 2
          local.get 3
          i32.const 12
          i32.add
          call $__wasi_fd_write
          local.tee 2
          i32.eqz
          br_if 0 (;@2;)
          i32.const 0
          local.get 2
          i32.store offset=5108
          i32.const -1
          local.set 4
          br 1 (;@1;)
        end
        local.get 3
        i32.load offset=12
        local.set 4
      end
      local.get 3
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 4
    )
    (func $__stdio_write (;50;) (type $.rodata) (param i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 3
      local.get 2
      i32.store offset=12
      local.get 3
      local.get 1
      i32.store offset=8
      local.get 3
      local.get 0
      i32.load offset=24
      local.tee 1
      i32.store
      local.get 3
      local.get 0
      i32.load offset=20
      local.get 1
      i32.sub
      local.tee 1
      i32.store offset=4
      i32.const 2
      local.set 4
      block ;; label = @1
        block ;; label = @2
          local.get 1
          local.get 2
          i32.add
          local.tee 5
          local.get 0
          i32.load offset=56
          local.get 3
          i32.const 2
          call $writev
          local.tee 1
          i32.eq
          br_if 0 (;@2;)
          local.get 3
          local.set 6
          loop ;; label = @3
            block ;; label = @4
              local.get 1
              i32.const -1
              i32.gt_s
              br_if 0 (;@4;)
              i32.const 0
              local.set 1
              local.get 0
              i32.const 0
              i32.store offset=24
              local.get 0
              i64.const 0
              i64.store offset=16
              local.get 0
              local.get 0
              i32.load
              i32.const 32
              i32.or
              i32.store
              local.get 4
              i32.const 2
              i32.eq
              br_if 3 (;@1;)
              local.get 2
              local.get 6
              i32.load offset=4
              i32.sub
              local.set 1
              br 3 (;@1;)
            end
            local.get 6
            local.get 1
            local.get 6
            i32.load offset=4
            local.tee 7
            i32.gt_u
            local.tee 8
            i32.const 3
            i32.shl
            i32.add
            local.tee 9
            local.get 9
            i32.load
            local.get 1
            local.get 7
            i32.const 0
            local.get 8
            select
            i32.sub
            local.tee 7
            i32.add
            i32.store
            local.get 6
            i32.const 12
            i32.const 4
            local.get 8
            select
            i32.add
            local.tee 6
            local.get 6
            i32.load
            local.get 7
            i32.sub
            i32.store
            local.get 9
            local.set 6
            local.get 5
            local.get 1
            i32.sub
            local.tee 5
            local.get 0
            i32.load offset=56
            local.get 9
            local.get 4
            local.get 8
            i32.sub
            local.tee 4
            call $writev
            local.tee 1
            i32.ne
            br_if 0 (;@3;)
          end
        end
        local.get 0
        local.get 0
        i32.load offset=40
        local.tee 1
        i32.store offset=24
        local.get 0
        local.get 1
        i32.store offset=20
        local.get 0
        local.get 1
        local.get 0
        i32.load offset=44
        i32.add
        i32.store offset=16
        local.get 2
        local.set 1
      end
      local.get 3
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 1
    )
    (func $__lseek (;51;) (type 14) (param i32 i64 i32) (result i64)
      (local i32)
      global.get $__stack_pointer
      i32.const 16
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      block ;; label = @1
        block ;; label = @2
          local.get 0
          local.get 1
          local.get 2
          i32.const 255
          i32.and
          local.get 3
          i32.const 8
          i32.add
          call $__wasi_fd_seek
          local.tee 2
          i32.eqz
          br_if 0 (;@2;)
          i32.const 0
          i32.const 70
          local.get 2
          local.get 2
          i32.const 76
          i32.eq
          select
          i32.store offset=5108
          i64.const -1
          local.set 1
          br 1 (;@1;)
        end
        local.get 3
        i64.load offset=8
        local.set 1
      end
      local.get 3
      i32.const 16
      i32.add
      global.set $__stack_pointer
      local.get 1
    )
    (func $__stdio_seek (;52;) (type 14) (param i32 i64 i32) (result i64)
      local.get 0
      i32.load offset=56
      local.get 1
      local.get 2
      call $__lseek
    )
    (func $__towrite (;53;) (type 3) (param i32) (result i32)
      (local i32)
      local.get 0
      local.get 0
      i32.load offset=60
      local.tee 1
      i32.const -1
      i32.add
      local.get 1
      i32.or
      i32.store offset=60
      block ;; label = @1
        local.get 0
        i32.load
        local.tee 1
        i32.const 8
        i32.and
        i32.eqz
        br_if 0 (;@1;)
        local.get 0
        local.get 1
        i32.const 32
        i32.or
        i32.store
        i32.const -1
        return
      end
      local.get 0
      i64.const 0
      i64.store offset=4 align=4
      local.get 0
      local.get 0
      i32.load offset=40
      local.tee 1
      i32.store offset=24
      local.get 0
      local.get 1
      i32.store offset=20
      local.get 0
      local.get 1
      local.get 0
      i32.load offset=44
      i32.add
      i32.store offset=16
      i32.const 0
    )
    (func $__fwritex (;54;) (type $.rodata) (param i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32)
      block ;; label = @1
        block ;; label = @2
          local.get 2
          i32.load offset=16
          local.tee 3
          br_if 0 (;@2;)
          i32.const 0
          local.set 4
          local.get 2
          call $__towrite
          br_if 1 (;@1;)
          local.get 2
          i32.load offset=16
          local.set 3
        end
        block ;; label = @2
          local.get 3
          local.get 2
          i32.load offset=20
          local.tee 5
          i32.sub
          local.get 1
          i32.ge_u
          br_if 0 (;@2;)
          local.get 2
          local.get 0
          local.get 1
          local.get 2
          i32.load offset=32
          call_indirect (type $.rodata)
          return
        end
        i32.const 0
        local.set 6
        block ;; label = @2
          local.get 2
          i32.load offset=64
          i32.const 0
          i32.lt_s
          br_if 0 (;@2;)
          i32.const 0
          local.set 6
          local.get 0
          local.set 4
          i32.const 0
          local.set 3
          loop ;; label = @3
            local.get 1
            local.get 3
            i32.eq
            br_if 1 (;@2;)
            local.get 3
            i32.const 1
            i32.add
            local.set 3
            local.get 4
            i32.const -1
            i32.add
            local.tee 4
            local.get 1
            i32.add
            local.tee 7
            i32.load8_u
            i32.const 10
            i32.ne
            br_if 0 (;@3;)
          end
          local.get 2
          local.get 0
          local.get 1
          local.get 3
          i32.sub
          i32.const 1
          i32.add
          local.tee 6
          local.get 2
          i32.load offset=32
          call_indirect (type $.rodata)
          local.tee 4
          local.get 6
          i32.lt_u
          br_if 1 (;@1;)
          local.get 3
          i32.const -1
          i32.add
          local.set 1
          local.get 7
          i32.const 1
          i32.add
          local.set 0
          local.get 2
          i32.load offset=20
          local.set 5
        end
        local.get 5
        local.get 0
        local.get 1
        call $memcpy
        drop
        local.get 2
        local.get 2
        i32.load offset=20
        local.get 1
        i32.add
        i32.store offset=20
        local.get 6
        local.get 1
        i32.add
        local.set 4
      end
      local.get 4
    )
    (func $fwrite (;55;) (type 6) (param i32 i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32)
      local.get 2
      local.get 1
      i32.mul
      local.set 4
      block ;; label = @1
        block ;; label = @2
          local.get 3
          i32.load offset=16
          local.tee 5
          br_if 0 (;@2;)
          i32.const 0
          local.set 6
          local.get 3
          call $__towrite
          br_if 1 (;@1;)
          local.get 3
          i32.load offset=16
          local.set 5
        end
        block ;; label = @2
          local.get 5
          local.get 3
          i32.load offset=20
          local.tee 7
          i32.sub
          local.get 4
          i32.ge_u
          br_if 0 (;@2;)
          local.get 3
          local.get 0
          local.get 4
          local.get 3
          i32.load offset=32
          call_indirect (type $.rodata)
          local.set 6
          br 1 (;@1;)
        end
        i32.const 0
        local.set 8
        block ;; label = @2
          block ;; label = @3
            local.get 3
            i32.load offset=64
            i32.const 0
            i32.ge_s
            br_if 0 (;@3;)
            local.get 4
            local.set 5
            br 1 (;@2;)
          end
          local.get 0
          local.get 4
          i32.add
          local.set 6
          i32.const 0
          local.set 8
          i32.const 0
          local.set 5
          loop ;; label = @3
            block ;; label = @4
              local.get 4
              local.get 5
              i32.add
              br_if 0 (;@4;)
              local.get 4
              local.set 5
              br 2 (;@2;)
            end
            local.get 5
            i32.const -1
            i32.add
            local.tee 5
            local.get 6
            i32.add
            local.tee 9
            i32.load8_u
            i32.const 10
            i32.ne
            br_if 0 (;@3;)
          end
          local.get 3
          local.get 0
          local.get 4
          local.get 5
          i32.add
          i32.const 1
          i32.add
          local.tee 8
          local.get 3
          i32.load offset=32
          call_indirect (type $.rodata)
          local.tee 6
          local.get 8
          i32.lt_u
          br_if 1 (;@1;)
          local.get 5
          i32.const -1
          i32.xor
          local.set 5
          local.get 9
          i32.const 1
          i32.add
          local.set 0
          local.get 3
          i32.load offset=20
          local.set 7
        end
        local.get 7
        local.get 0
        local.get 5
        call $memcpy
        drop
        local.get 3
        local.get 3
        i32.load offset=20
        local.get 5
        i32.add
        i32.store offset=20
        local.get 8
        local.get 5
        i32.add
        local.set 6
      end
      block ;; label = @1
        local.get 6
        local.get 4
        i32.ne
        br_if 0 (;@1;)
        local.get 2
        i32.const 0
        local.get 1
        select
        return
      end
      local.get 6
      local.get 1
      i32.div_u
    )
    (func $dummy (;56;) (type 11) (param i32 i32) (result i32)
      local.get 0
    )
    (func $__lctrans (;57;) (type 11) (param i32 i32) (result i32)
      local.get 0
      local.get 1
      call $dummy
    )
    (func $strerror (;58;) (type 3) (param i32) (result i32)
      (local i32)
      block ;; label = @1
        i32.const 0
        i32.load offset=5144
        local.tee 1
        br_if 0 (;@1;)
        i32.const 5120
        local.set 1
        i32.const 0
        i32.const 5120
        i32.store offset=5144
      end
      i32.const 0
      local.get 0
      local.get 0
      i32.const 76
      i32.gt_u
      select
      i32.const 1
      i32.shl
      i32.const 3840
      i32.add
      i32.load16_u
      i32.const 2285
      i32.add
      local.get 1
      i32.load offset=20
      call $__lctrans
    )
    (func $wcrtomb (;59;) (type $.rodata) (param i32 i32 i32) (result i32)
      (local i32)
      i32.const 1
      local.set 3
      block ;; label = @1
        local.get 0
        i32.eqz
        br_if 0 (;@1;)
        block ;; label = @2
          local.get 1
          i32.const 127
          i32.gt_u
          br_if 0 (;@2;)
          local.get 0
          local.get 1
          i32.store8
          i32.const 1
          return
        end
        block ;; label = @2
          block ;; label = @3
            i32.const 0
            i32.load offset=5120
            br_if 0 (;@3;)
            block ;; label = @4
              local.get 1
              i32.const -128
              i32.and
              i32.const 57216
              i32.eq
              br_if 0 (;@4;)
              i32.const 0
              i32.const 25
              i32.store offset=5108
              br 2 (;@2;)
            end
            local.get 0
            local.get 1
            i32.store8
            i32.const 1
            return
          end
          block ;; label = @3
            local.get 1
            i32.const 2047
            i32.gt_u
            br_if 0 (;@3;)
            local.get 0
            local.get 1
            i32.const 63
            i32.and
            i32.const 128
            i32.or
            i32.store8 offset=1
            local.get 0
            local.get 1
            i32.const 6
            i32.shr_u
            i32.const 192
            i32.or
            i32.store8
            i32.const 2
            return
          end
          block ;; label = @3
            block ;; label = @4
              local.get 1
              i32.const 55296
              i32.lt_u
              br_if 0 (;@4;)
              local.get 1
              i32.const -8192
              i32.and
              i32.const 57344
              i32.ne
              br_if 1 (;@3;)
            end
            local.get 0
            local.get 1
            i32.const 63
            i32.and
            i32.const 128
            i32.or
            i32.store8 offset=2
            local.get 0
            local.get 1
            i32.const 12
            i32.shr_u
            i32.const 224
            i32.or
            i32.store8
            local.get 0
            local.get 1
            i32.const 6
            i32.shr_u
            i32.const 63
            i32.and
            i32.const 128
            i32.or
            i32.store8 offset=1
            i32.const 3
            return
          end
          block ;; label = @3
            local.get 1
            i32.const -65536
            i32.add
            i32.const 1048575
            i32.gt_u
            br_if 0 (;@3;)
            local.get 0
            local.get 1
            i32.const 63
            i32.and
            i32.const 128
            i32.or
            i32.store8 offset=3
            local.get 0
            local.get 1
            i32.const 18
            i32.shr_u
            i32.const 240
            i32.or
            i32.store8
            local.get 0
            local.get 1
            i32.const 6
            i32.shr_u
            i32.const 63
            i32.and
            i32.const 128
            i32.or
            i32.store8 offset=2
            local.get 0
            local.get 1
            i32.const 12
            i32.shr_u
            i32.const 63
            i32.and
            i32.const 128
            i32.or
            i32.store8 offset=1
            i32.const 4
            return
          end
          i32.const 0
          i32.const 25
          i32.store offset=5108
        end
        i32.const -1
        local.set 3
      end
      local.get 3
    )
    (func $wctomb (;60;) (type 11) (param i32 i32) (result i32)
      block ;; label = @1
        local.get 0
        br_if 0 (;@1;)
        i32.const 0
        return
      end
      local.get 0
      local.get 1
      i32.const 0
      call $wcrtomb
    )
    (func $frexp (;61;) (type 15) (param f64 i32) (result f64)
      (local i64 i32)
      block ;; label = @1
        local.get 0
        i64.reinterpret_f64
        local.tee 2
        i64.const 52
        i64.shr_u
        i32.wrap_i64
        i32.const 2047
        i32.and
        local.tee 3
        i32.const 2047
        i32.eq
        br_if 0 (;@1;)
        block ;; label = @2
          local.get 3
          br_if 0 (;@2;)
          block ;; label = @3
            local.get 0
            f64.const 0x0p+0 (;=0;)
            f64.ne
            br_if 0 (;@3;)
            local.get 1
            i32.const 0
            i32.store
            local.get 0
            return
          end
          local.get 0
          f64.const 0x1p+64 (;=18446744073709552000;)
          f64.mul
          local.get 1
          call $frexp
          local.set 0
          local.get 1
          local.get 1
          i32.load
          i32.const -64
          i32.add
          i32.store
          local.get 0
          return
        end
        local.get 1
        local.get 3
        i32.const -1022
        i32.add
        i32.store
        local.get 2
        i64.const -9218868437227405313
        i64.and
        i64.const 4602678819172646912
        i64.or
        f64.reinterpret_i64
        local.set 0
      end
      local.get 0
    )
    (func $fputs (;62;) (type 11) (param i32 i32) (result i32)
      (local i32)
      local.get 0
      call $strlen
      local.set 2
      i32.const -1
      i32.const 0
      local.get 2
      local.get 0
      i32.const 1
      local.get 2
      local.get 1
      call $fwrite
      i32.ne
      select
    )
    (func $vfprintf (;63;) (type $.rodata) (param i32 i32 i32) (result i32)
      (local i32 i32 i32)
      global.get $__stack_pointer
      i32.const 208
      i32.sub
      local.tee 3
      global.set $__stack_pointer
      local.get 3
      local.get 2
      i32.store offset=204
      local.get 3
      i32.const 160
      i32.add
      i32.const 32
      i32.add
      i64.const 0
      i64.store
      local.get 3
      i32.const 184
      i32.add
      i64.const 0
      i64.store
      local.get 3
      i32.const 176
      i32.add
      i64.const 0
      i64.store
      local.get 3
      i64.const 0
      i64.store offset=168
      local.get 3
      i64.const 0
      i64.store offset=160
      local.get 3
      local.get 2
      i32.store offset=200
      block ;; label = @1
        block ;; label = @2
          i32.const 0
          local.get 1
          local.get 3
          i32.const 200
          i32.add
          local.get 3
          i32.const 80
          i32.add
          local.get 3
          i32.const 160
          i32.add
          call $printf_core
          i32.const 0
          i32.ge_s
          br_if 0 (;@2;)
          i32.const -1
          local.set 0
          br 1 (;@1;)
        end
        local.get 0
        i32.load
        local.set 4
        block ;; label = @2
          local.get 0
          i32.load offset=60
          i32.const 0
          i32.gt_s
          br_if 0 (;@2;)
          local.get 0
          local.get 4
          i32.const -33
          i32.and
          i32.store
        end
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              block ;; label = @5
                local.get 0
                i32.load offset=44
                br_if 0 (;@5;)
                local.get 0
                i32.const 80
                i32.store offset=44
                local.get 0
                i32.const 0
                i32.store offset=24
                local.get 0
                i64.const 0
                i64.store offset=16
                local.get 0
                i32.load offset=40
                local.set 5
                local.get 0
                local.get 3
                i32.store offset=40
                br 1 (;@4;)
              end
              i32.const 0
              local.set 5
              local.get 0
              i32.load offset=16
              br_if 1 (;@3;)
            end
            i32.const -1
            local.set 2
            local.get 0
            call $__towrite
            br_if 1 (;@2;)
          end
          local.get 0
          local.get 1
          local.get 3
          i32.const 200
          i32.add
          local.get 3
          i32.const 80
          i32.add
          local.get 3
          i32.const 160
          i32.add
          call $printf_core
          local.set 2
        end
        local.get 4
        i32.const 32
        i32.and
        local.set 1
        block ;; label = @2
          local.get 5
          i32.eqz
          br_if 0 (;@2;)
          local.get 0
          i32.const 0
          i32.const 0
          local.get 0
          i32.load offset=32
          call_indirect (type $.rodata)
          drop
          local.get 0
          i32.const 0
          i32.store offset=44
          local.get 0
          local.get 5
          i32.store offset=40
          local.get 0
          i32.const 0
          i32.store offset=24
          local.get 0
          i32.load offset=20
          local.set 5
          local.get 0
          i64.const 0
          i64.store offset=16
          local.get 2
          i32.const -1
          local.get 5
          select
          local.set 2
        end
        local.get 0
        local.get 0
        i32.load
        local.tee 5
        local.get 1
        i32.or
        i32.store
        i32.const -1
        local.get 2
        local.get 5
        i32.const 32
        i32.and
        select
        local.set 0
      end
      local.get 3
      i32.const 208
      i32.add
      global.set $__stack_pointer
      local.get 0
    )
    (func $printf_core (;64;) (type 12) (param i32 i32 i32 i32 i32) (result i32)
      (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i64 i64 f64 i32 i32 i32 i32 i32 i32 i32 i32 f64)
      global.get $__stack_pointer
      i32.const 880
      i32.sub
      local.tee 5
      global.set $__stack_pointer
      local.get 5
      i32.const 68
      i32.add
      i32.const 12
      i32.add
      local.set 6
      i32.const 0
      local.get 5
      i32.const 112
      i32.add
      i32.sub
      local.set 7
      local.get 5
      i32.const -3988
      i32.add
      local.set 8
      local.get 5
      i32.const 55
      i32.add
      local.set 9
      local.get 5
      i32.const 80
      i32.add
      i32.const -2
      i32.xor
      local.set 10
      local.get 5
      i32.const 68
      i32.add
      i32.const 11
      i32.add
      local.set 11
      local.get 5
      i32.const 80
      i32.add
      i32.const 8
      i32.or
      local.set 12
      local.get 5
      i32.const 80
      i32.add
      i32.const 9
      i32.or
      local.set 13
      i32.const -10
      local.get 5
      i32.const 68
      i32.add
      i32.sub
      local.set 14
      local.get 5
      i32.const 68
      i32.add
      i32.const 10
      i32.add
      local.set 15
      local.get 5
      i32.const 56
      i32.add
      local.set 16
      i32.const 0
      local.set 17
      i32.const 0
      local.set 18
      i32.const 0
      local.set 19
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            loop ;; label = @4
              local.get 1
              local.set 20
              local.get 19
              local.get 18
              i32.const 2147483647
              i32.xor
              i32.gt_s
              br_if 1 (;@3;)
              local.get 19
              local.get 18
              i32.add
              local.set 18
              block ;; label = @5
                block ;; label = @6
                  block ;; label = @7
                    block ;; label = @8
                      block ;; label = @9
                        block ;; label = @10
                          block ;; label = @11
                            block ;; label = @12
                              block ;; label = @13
                                local.get 20
                                i32.load8_u
                                local.tee 19
                                i32.eqz
                                br_if 0 (;@13;)
                                local.get 20
                                local.set 1
                                loop ;; label = @14
                                  block ;; label = @15
                                    block ;; label = @16
                                      block ;; label = @17
                                        local.get 19
                                        i32.const 255
                                        i32.and
                                        local.tee 19
                                        i32.eqz
                                        br_if 0 (;@17;)
                                        local.get 19
                                        i32.const 37
                                        i32.ne
                                        br_if 2 (;@15;)
                                        local.get 1
                                        local.set 21
                                        local.get 1
                                        local.set 19
                                        loop ;; label = @18
                                          block ;; label = @19
                                            local.get 19
                                            i32.load8_u offset=1
                                            i32.const 37
                                            i32.eq
                                            br_if 0 (;@19;)
                                            local.get 19
                                            local.set 1
                                            br 3 (;@16;)
                                          end
                                          local.get 21
                                          i32.const 1
                                          i32.add
                                          local.set 21
                                          local.get 19
                                          i32.load8_u offset=2
                                          local.set 22
                                          local.get 19
                                          i32.const 2
                                          i32.add
                                          local.tee 1
                                          local.set 19
                                          local.get 22
                                          i32.const 37
                                          i32.eq
                                          br_if 0 (;@18;)
                                          br 2 (;@16;)
                                        end
                                      end
                                      local.get 1
                                      local.set 21
                                    end
                                    local.get 21
                                    local.get 20
                                    i32.sub
                                    local.tee 19
                                    local.get 18
                                    i32.const 2147483647
                                    i32.xor
                                    local.tee 21
                                    i32.gt_s
                                    br_if 12 (;@3;)
                                    block ;; label = @16
                                      local.get 0
                                      i32.eqz
                                      br_if 0 (;@16;)
                                      local.get 0
                                      i32.load8_u
                                      i32.const 32
                                      i32.and
                                      br_if 0 (;@16;)
                                      local.get 20
                                      local.get 19
                                      local.get 0
                                      call $__fwritex
                                      drop
                                    end
                                    local.get 19
                                    br_if 11 (;@4;)
                                    local.get 1
                                    i32.const 1
                                    i32.add
                                    local.set 19
                                    i32.const -1
                                    local.set 23
                                    block ;; label = @16
                                      local.get 1
                                      i32.load8_s offset=1
                                      local.tee 24
                                      i32.const -48
                                      i32.add
                                      local.tee 22
                                      i32.const 9
                                      i32.gt_u
                                      br_if 0 (;@16;)
                                      local.get 1
                                      i32.load8_u offset=2
                                      i32.const 36
                                      i32.ne
                                      br_if 0 (;@16;)
                                      local.get 1
                                      i32.const 3
                                      i32.add
                                      local.set 19
                                      local.get 1
                                      i32.load8_s offset=3
                                      local.set 24
                                      i32.const 1
                                      local.set 17
                                      local.get 22
                                      local.set 23
                                    end
                                    i32.const 0
                                    local.set 25
                                    block ;; label = @16
                                      local.get 24
                                      i32.const -32
                                      i32.add
                                      local.tee 1
                                      i32.const 31
                                      i32.gt_u
                                      br_if 0 (;@16;)
                                      i32.const 1
                                      local.get 1
                                      i32.shl
                                      local.tee 1
                                      i32.const 75913
                                      i32.and
                                      i32.eqz
                                      br_if 0 (;@16;)
                                      local.get 19
                                      i32.const 1
                                      i32.add
                                      local.set 22
                                      i32.const 0
                                      local.set 25
                                      loop ;; label = @17
                                        local.get 1
                                        local.get 25
                                        i32.or
                                        local.set 25
                                        local.get 22
                                        local.tee 19
                                        i32.load8_s
                                        local.tee 24
                                        i32.const -32
                                        i32.add
                                        local.tee 1
                                        i32.const 32
                                        i32.ge_u
                                        br_if 1 (;@16;)
                                        local.get 19
                                        i32.const 1
                                        i32.add
                                        local.set 22
                                        i32.const 1
                                        local.get 1
                                        i32.shl
                                        local.tee 1
                                        i32.const 75913
                                        i32.and
                                        br_if 0 (;@17;)
                                      end
                                    end
                                    block ;; label = @16
                                      local.get 24
                                      i32.const 42
                                      i32.ne
                                      br_if 0 (;@16;)
                                      block ;; label = @17
                                        block ;; label = @18
                                          local.get 19
                                          i32.load8_s offset=1
                                          i32.const -48
                                          i32.add
                                          local.tee 1
                                          i32.const 9
                                          i32.gt_u
                                          br_if 0 (;@18;)
                                          local.get 19
                                          i32.load8_u offset=2
                                          i32.const 36
                                          i32.ne
                                          br_if 0 (;@18;)
                                          local.get 4
                                          local.get 1
                                          i32.const 2
                                          i32.shl
                                          i32.add
                                          i32.const 10
                                          i32.store
                                          local.get 19
                                          i32.const 3
                                          i32.add
                                          local.set 22
                                          local.get 19
                                          i32.load8_s offset=1
                                          i32.const 3
                                          i32.shl
                                          local.get 3
                                          i32.add
                                          i32.const -384
                                          i32.add
                                          i32.load
                                          local.set 26
                                          i32.const 1
                                          local.set 17
                                          br 1 (;@17;)
                                        end
                                        local.get 17
                                        br_if 6 (;@11;)
                                        local.get 19
                                        i32.const 1
                                        i32.add
                                        local.set 22
                                        block ;; label = @18
                                          local.get 0
                                          br_if 0 (;@18;)
                                          i32.const 0
                                          local.set 17
                                          i32.const 0
                                          local.set 26
                                          br 6 (;@12;)
                                        end
                                        local.get 2
                                        local.get 2
                                        i32.load
                                        local.tee 1
                                        i32.const 4
                                        i32.add
                                        i32.store
                                        local.get 1
                                        i32.load
                                        local.set 26
                                        i32.const 0
                                        local.set 17
                                      end
                                      local.get 26
                                      i32.const -1
                                      i32.gt_s
                                      br_if 4 (;@12;)
                                      i32.const 0
                                      local.get 26
                                      i32.sub
                                      local.set 26
                                      local.get 25
                                      i32.const 8192
                                      i32.or
                                      local.set 25
                                      br 4 (;@12;)
                                    end
                                    i32.const 0
                                    local.set 26
                                    block ;; label = @16
                                      local.get 24
                                      i32.const -48
                                      i32.add
                                      local.tee 1
                                      i32.const 9
                                      i32.le_u
                                      br_if 0 (;@16;)
                                      local.get 19
                                      local.set 22
                                      br 4 (;@12;)
                                    end
                                    i32.const 0
                                    local.set 26
                                    loop ;; label = @16
                                      block ;; label = @17
                                        local.get 26
                                        i32.const 214748364
                                        i32.gt_u
                                        br_if 0 (;@17;)
                                        i32.const -1
                                        local.get 26
                                        i32.const 10
                                        i32.mul
                                        local.tee 22
                                        local.get 1
                                        i32.add
                                        local.get 1
                                        local.get 22
                                        i32.const 2147483647
                                        i32.xor
                                        i32.gt_u
                                        select
                                        local.set 26
                                        local.get 19
                                        i32.load8_s offset=1
                                        local.set 1
                                        local.get 19
                                        i32.const 1
                                        i32.add
                                        local.tee 22
                                        local.set 19
                                        local.get 1
                                        i32.const -48
                                        i32.add
                                        local.tee 1
                                        i32.const 10
                                        i32.lt_u
                                        br_if 1 (;@16;)
                                        local.get 26
                                        i32.const 0
                                        i32.lt_s
                                        br_if 14 (;@3;)
                                        br 5 (;@12;)
                                      end
                                      local.get 19
                                      i32.load8_s offset=1
                                      local.set 1
                                      i32.const -1
                                      local.set 26
                                      local.get 19
                                      i32.const 1
                                      i32.add
                                      local.set 19
                                      local.get 1
                                      i32.const -48
                                      i32.add
                                      local.tee 1
                                      i32.const 10
                                      i32.lt_u
                                      br_if 0 (;@16;)
                                      br 13 (;@3;)
                                    end
                                  end
                                  local.get 1
                                  i32.load8_u offset=1
                                  local.set 19
                                  local.get 1
                                  i32.const 1
                                  i32.add
                                  local.set 1
                                  br 0 (;@14;)
                                end
                              end
                              local.get 0
                              br_if 11 (;@1;)
                              block ;; label = @13
                                local.get 17
                                br_if 0 (;@13;)
                                i32.const 0
                                local.set 18
                                br 12 (;@1;)
                              end
                              block ;; label = @13
                                block ;; label = @14
                                  local.get 4
                                  i32.load offset=4
                                  local.tee 1
                                  br_if 0 (;@14;)
                                  i32.const 1
                                  local.set 1
                                  br 1 (;@13;)
                                end
                                local.get 3
                                i32.const 8
                                i32.add
                                local.get 1
                                local.get 2
                                call $pop_arg
                                block ;; label = @14
                                  local.get 4
                                  i32.load offset=8
                                  local.tee 1
                                  br_if 0 (;@14;)
                                  i32.const 2
                                  local.set 1
                                  br 1 (;@13;)
                                end
                                local.get 3
                                i32.const 16
                                i32.add
                                local.get 1
                                local.get 2
                                call $pop_arg
                                block ;; label = @14
                                  local.get 4
                                  i32.load offset=12
                                  local.tee 1
                                  br_if 0 (;@14;)
                                  i32.const 3
                                  local.set 1
                                  br 1 (;@13;)
                                end
                                local.get 3
                                i32.const 24
                                i32.add
                                local.get 1
                                local.get 2
                                call $pop_arg
                                block ;; label = @14
                                  local.get 4
                                  i32.load offset=16
                                  local.tee 1
                                  br_if 0 (;@14;)
                                  i32.const 4
                                  local.set 1
                                  br 1 (;@13;)
                                end
                                local.get 3
                                i32.const 32
                                i32.add
                                local.get 1
                                local.get 2
                                call $pop_arg
                                block ;; label = @14
                                  local.get 4
                                  i32.load offset=20
                                  local.tee 1
                                  br_if 0 (;@14;)
                                  i32.const 5
                                  local.set 1
                                  br 1 (;@13;)
                                end
                                local.get 3
                                i32.const 40
                                i32.add
                                local.get 1
                                local.get 2
                                call $pop_arg
                                block ;; label = @14
                                  local.get 4
                                  i32.load offset=24
                                  local.tee 1
                                  br_if 0 (;@14;)
                                  i32.const 6
                                  local.set 1
                                  br 1 (;@13;)
                                end
                                local.get 3
                                i32.const 48
                                i32.add
                                local.get 1
                                local.get 2
                                call $pop_arg
                                block ;; label = @14
                                  local.get 4
                                  i32.load offset=28
                                  local.tee 1
                                  br_if 0 (;@14;)
                                  i32.const 7
                                  local.set 1
                                  br 1 (;@13;)
                                end
                                local.get 3
                                i32.const 56
                                i32.add
                                local.get 1
                                local.get 2
                                call $pop_arg
                                block ;; label = @14
                                  local.get 4
                                  i32.load offset=32
                                  local.tee 1
                                  br_if 0 (;@14;)
                                  i32.const 8
                                  local.set 1
                                  br 1 (;@13;)
                                end
                                local.get 3
                                i32.const 64
                                i32.add
                                local.get 1
                                local.get 2
                                call $pop_arg
                                block ;; label = @14
                                  local.get 4
                                  i32.load offset=36
                                  local.tee 1
                                  br_if 0 (;@14;)
                                  i32.const 9
                                  local.set 1
                                  br 1 (;@13;)
                                end
                                local.get 3
                                i32.const 72
                                i32.add
                                local.get 1
                                local.get 2
                                call $pop_arg
                                i32.const 1
                                local.set 18
                                br 12 (;@1;)
                              end
                              local.get 1
                              i32.const 2
                              i32.shl
                              local.set 1
                              loop ;; label = @13
                                local.get 4
                                local.get 1
                                i32.add
                                i32.load
                                br_if 2 (;@11;)
                                local.get 1
                                i32.const 4
                                i32.add
                                local.tee 1
                                i32.const 40
                                i32.ne
                                br_if 0 (;@13;)
                              end
                              i32.const 1
                              local.set 18
                              br 11 (;@1;)
                            end
                            i32.const 0
                            local.set 19
                            i32.const -1
                            local.set 24
                            block ;; label = @12
                              block ;; label = @13
                                local.get 22
                                i32.load8_u
                                i32.const 46
                                i32.eq
                                br_if 0 (;@13;)
                                local.get 22
                                local.set 1
                                i32.const 0
                                local.set 27
                                br 1 (;@12;)
                              end
                              block ;; label = @13
                                local.get 22
                                i32.load8_s offset=1
                                local.tee 24
                                i32.const 42
                                i32.ne
                                br_if 0 (;@13;)
                                block ;; label = @14
                                  block ;; label = @15
                                    local.get 22
                                    i32.load8_s offset=2
                                    i32.const -48
                                    i32.add
                                    local.tee 1
                                    i32.const 9
                                    i32.gt_u
                                    br_if 0 (;@15;)
                                    local.get 22
                                    i32.load8_u offset=3
                                    i32.const 36
                                    i32.ne
                                    br_if 0 (;@15;)
                                    local.get 4
                                    local.get 1
                                    i32.const 2
                                    i32.shl
                                    i32.add
                                    i32.const 10
                                    i32.store
                                    local.get 22
                                    i32.const 4
                                    i32.add
                                    local.set 1
                                    local.get 22
                                    i32.load8_s offset=2
                                    i32.const 3
                                    i32.shl
                                    local.get 3
                                    i32.add
                                    i32.const -384
                                    i32.add
                                    i32.load
                                    local.set 24
                                    br 1 (;@14;)
                                  end
                                  local.get 17
                                  br_if 3 (;@11;)
                                  local.get 22
                                  i32.const 2
                                  i32.add
                                  local.set 1
                                  block ;; label = @15
                                    local.get 0
                                    br_if 0 (;@15;)
                                    i32.const 0
                                    local.set 24
                                    br 1 (;@14;)
                                  end
                                  local.get 2
                                  local.get 2
                                  i32.load
                                  local.tee 22
                                  i32.const 4
                                  i32.add
                                  i32.store
                                  local.get 22
                                  i32.load
                                  local.set 24
                                end
                                local.get 24
                                i32.const -1
                                i32.xor
                                i32.const 31
                                i32.shr_u
                                local.set 27
                                br 1 (;@12;)
                              end
                              local.get 22
                              i32.const 1
                              i32.add
                              local.set 1
                              block ;; label = @13
                                local.get 24
                                i32.const -48
                                i32.add
                                local.tee 28
                                i32.const 9
                                i32.le_u
                                br_if 0 (;@13;)
                                i32.const 1
                                local.set 27
                                i32.const 0
                                local.set 24
                                br 1 (;@12;)
                              end
                              i32.const 0
                              local.set 29
                              local.get 1
                              local.set 22
                              loop ;; label = @13
                                i32.const -1
                                local.set 24
                                block ;; label = @14
                                  local.get 29
                                  i32.const 214748364
                                  i32.gt_u
                                  br_if 0 (;@14;)
                                  i32.const -1
                                  local.get 29
                                  i32.const 10
                                  i32.mul
                                  local.tee 1
                                  local.get 28
                                  i32.add
                                  local.get 28
                                  local.get 1
                                  i32.const 2147483647
                                  i32.xor
                                  i32.gt_u
                                  select
                                  local.set 24
                                end
                                i32.const 1
                                local.set 27
                                local.get 22
                                i32.load8_s offset=1
                                local.set 28
                                local.get 24
                                local.set 29
                                local.get 22
                                i32.const 1
                                i32.add
                                local.tee 1
                                local.set 22
                                local.get 28
                                i32.const -48
                                i32.add
                                local.tee 28
                                i32.const 10
                                i32.lt_u
                                br_if 0 (;@13;)
                              end
                            end
                            loop ;; label = @12
                              local.get 19
                              local.set 22
                              local.get 1
                              i32.load8_s
                              local.tee 19
                              i32.const -123
                              i32.add
                              i32.const -58
                              i32.lt_u
                              br_if 1 (;@11;)
                              local.get 1
                              i32.const 1
                              i32.add
                              local.set 1
                              local.get 19
                              local.get 22
                              i32.const 58
                              i32.mul
                              i32.add
                              i32.const 3935
                              i32.add
                              i32.load8_u
                              local.tee 19
                              i32.const -1
                              i32.add
                              i32.const 8
                              i32.lt_u
                              br_if 0 (;@12;)
                            end
                            block ;; label = @12
                              block ;; label = @13
                                block ;; label = @14
                                  local.get 19
                                  i32.const 27
                                  i32.eq
                                  br_if 0 (;@14;)
                                  local.get 19
                                  i32.eqz
                                  br_if 3 (;@11;)
                                  block ;; label = @15
                                    local.get 23
                                    i32.const 0
                                    i32.lt_s
                                    br_if 0 (;@15;)
                                    local.get 4
                                    local.get 23
                                    i32.const 2
                                    i32.shl
                                    i32.add
                                    local.get 19
                                    i32.store
                                    local.get 5
                                    local.get 3
                                    local.get 23
                                    i32.const 3
                                    i32.shl
                                    i32.add
                                    i64.load
                                    i64.store offset=56
                                    br 2 (;@13;)
                                  end
                                  block ;; label = @15
                                    local.get 0
                                    br_if 0 (;@15;)
                                    i32.const 0
                                    local.set 18
                                    br 14 (;@1;)
                                  end
                                  local.get 5
                                  i32.const 56
                                  i32.add
                                  local.get 19
                                  local.get 2
                                  call $pop_arg
                                  br 2 (;@12;)
                                end
                                local.get 23
                                i32.const -1
                                i32.gt_s
                                br_if 2 (;@11;)
                              end
                              i32.const 0
                              local.set 19
                              local.get 0
                              i32.eqz
                              br_if 8 (;@4;)
                            end
                            local.get 25
                            i32.const -65537
                            i32.and
                            local.tee 29
                            local.get 25
                            local.get 25
                            i32.const 8192
                            i32.and
                            select
                            local.set 30
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
                                                              local.get 1
                                                              i32.const -1
                                                              i32.add
                                                              i32.load8_s
                                                              local.tee 19
                                                              i32.const -33
                                                              i32.and
                                                              local.get 19
                                                              local.get 19
                                                              i32.const 15
                                                              i32.and
                                                              i32.const 3
                                                              i32.eq
                                                              select
                                                              local.get 19
                                                              local.get 22
                                                              select
                                                              local.tee 31
                                                              i32.const -65
                                                              i32.add
                                                              br_table 16 (;@12;) 18 (;@10;) 13 (;@15;) 18 (;@10;) 16 (;@12;) 16 (;@12;) 16 (;@12;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 12 (;@16;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 3 (;@25;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 16 (;@12;) 18 (;@10;) 8 (;@20;) 5 (;@23;) 16 (;@12;) 16 (;@12;) 16 (;@12;) 18 (;@10;) 5 (;@23;) 18 (;@10;) 18 (;@10;) 18 (;@10;) 9 (;@19;) 1 (;@27;) 4 (;@24;) 2 (;@26;) 18 (;@10;) 18 (;@10;) 10 (;@18;) 18 (;@10;) 0 (;@28;) 18 (;@10;) 18 (;@10;) 3 (;@25;) 18 (;@10;)
                                                            end
                                                            i32.const 0
                                                            local.set 28
                                                            i32.const 1024
                                                            local.set 23
                                                            local.get 5
                                                            i64.load offset=56
                                                            local.set 32
                                                            br 5 (;@22;)
                                                          end
                                                          i32.const 0
                                                          local.set 19
                                                          block ;; label = @27
                                                            block ;; label = @28
                                                              block ;; label = @29
                                                                block ;; label = @30
                                                                  block ;; label = @31
                                                                    block ;; label = @32
                                                                      block ;; label = @33
                                                                        local.get 22
                                                                        i32.const 255
                                                                        i32.and
                                                                        br_table 0 (;@33;) 1 (;@32;) 2 (;@31;) 3 (;@30;) 4 (;@29;) 29 (;@4;) 5 (;@28;) 6 (;@27;) 29 (;@4;)
                                                                      end
                                                                      local.get 5
                                                                      i32.load offset=56
                                                                      local.get 18
                                                                      i32.store
                                                                      br 28 (;@4;)
                                                                    end
                                                                    local.get 5
                                                                    i32.load offset=56
                                                                    local.get 18
                                                                    i32.store
                                                                    br 27 (;@4;)
                                                                  end
                                                                  local.get 5
                                                                  i32.load offset=56
                                                                  local.get 18
                                                                  i64.extend_i32_s
                                                                  i64.store
                                                                  br 26 (;@4;)
                                                                end
                                                                local.get 5
                                                                i32.load offset=56
                                                                local.get 18
                                                                i32.store16
                                                                br 25 (;@4;)
                                                              end
                                                              local.get 5
                                                              i32.load offset=56
                                                              local.get 18
                                                              i32.store8
                                                              br 24 (;@4;)
                                                            end
                                                            local.get 5
                                                            i32.load offset=56
                                                            local.get 18
                                                            i32.store
                                                            br 23 (;@4;)
                                                          end
                                                          local.get 5
                                                          i32.load offset=56
                                                          local.get 18
                                                          i64.extend_i32_s
                                                          i64.store
                                                          br 22 (;@4;)
                                                        end
                                                        local.get 24
                                                        i32.const 8
                                                        local.get 24
                                                        i32.const 8
                                                        i32.gt_u
                                                        select
                                                        local.set 24
                                                        local.get 30
                                                        i32.const 8
                                                        i32.or
                                                        local.set 30
                                                        i32.const 120
                                                        local.set 31
                                                      end
                                                      i32.const 0
                                                      local.set 28
                                                      i32.const 1024
                                                      local.set 23
                                                      block ;; label = @25
                                                        local.get 5
                                                        i64.load offset=56
                                                        local.tee 32
                                                        i64.eqz
                                                        i32.eqz
                                                        br_if 0 (;@25;)
                                                        local.get 16
                                                        local.set 20
                                                        br 4 (;@21;)
                                                      end
                                                      local.get 31
                                                      i32.const 32
                                                      i32.and
                                                      local.set 22
                                                      local.get 16
                                                      local.set 20
                                                      loop ;; label = @25
                                                        local.get 20
                                                        i32.const -1
                                                        i32.add
                                                        local.tee 20
                                                        local.get 32
                                                        i32.wrap_i64
                                                        i32.const 15
                                                        i32.and
                                                        i32.const 4464
                                                        i32.add
                                                        i32.load8_u
                                                        local.get 22
                                                        i32.or
                                                        i32.store8
                                                        local.get 32
                                                        i64.const 15
                                                        i64.gt_u
                                                        local.set 19
                                                        local.get 32
                                                        i64.const 4
                                                        i64.shr_u
                                                        local.set 32
                                                        local.get 19
                                                        br_if 0 (;@25;)
                                                      end
                                                      local.get 30
                                                      i32.const 8
                                                      i32.and
                                                      i32.eqz
                                                      br_if 3 (;@21;)
                                                      local.get 31
                                                      i32.const 4
                                                      i32.shr_s
                                                      i32.const 1024
                                                      i32.add
                                                      local.set 23
                                                      i32.const 2
                                                      local.set 28
                                                      br 3 (;@21;)
                                                    end
                                                    local.get 16
                                                    local.set 20
                                                    block ;; label = @24
                                                      local.get 5
                                                      i64.load offset=56
                                                      local.tee 32
                                                      i64.eqz
                                                      br_if 0 (;@24;)
                                                      local.get 16
                                                      local.set 20
                                                      loop ;; label = @25
                                                        local.get 20
                                                        i32.const -1
                                                        i32.add
                                                        local.tee 20
                                                        local.get 32
                                                        i32.wrap_i64
                                                        i32.const 7
                                                        i32.and
                                                        i32.const 48
                                                        i32.or
                                                        i32.store8
                                                        local.get 32
                                                        i64.const 7
                                                        i64.gt_u
                                                        local.set 19
                                                        local.get 32
                                                        i64.const 3
                                                        i64.shr_u
                                                        local.set 32
                                                        local.get 19
                                                        br_if 0 (;@25;)
                                                      end
                                                    end
                                                    i32.const 0
                                                    local.set 28
                                                    i32.const 1024
                                                    local.set 23
                                                    local.get 30
                                                    i32.const 8
                                                    i32.and
                                                    i32.eqz
                                                    br_if 2 (;@21;)
                                                    local.get 24
                                                    local.get 16
                                                    local.get 20
                                                    i32.sub
                                                    local.tee 19
                                                    i32.const 1
                                                    i32.add
                                                    local.get 24
                                                    local.get 19
                                                    i32.gt_s
                                                    select
                                                    local.set 24
                                                    br 2 (;@21;)
                                                  end
                                                  block ;; label = @23
                                                    local.get 5
                                                    i64.load offset=56
                                                    local.tee 32
                                                    i64.const -1
                                                    i64.gt_s
                                                    br_if 0 (;@23;)
                                                    local.get 5
                                                    i64.const 0
                                                    local.get 32
                                                    i64.sub
                                                    local.tee 32
                                                    i64.store offset=56
                                                    i32.const 1
                                                    local.set 28
                                                    i32.const 1024
                                                    local.set 23
                                                    br 1 (;@22;)
                                                  end
                                                  block ;; label = @23
                                                    local.get 30
                                                    i32.const 2048
                                                    i32.and
                                                    i32.eqz
                                                    br_if 0 (;@23;)
                                                    i32.const 1
                                                    local.set 28
                                                    i32.const 1025
                                                    local.set 23
                                                    br 1 (;@22;)
                                                  end
                                                  i32.const 1026
                                                  i32.const 1024
                                                  local.get 30
                                                  i32.const 1
                                                  i32.and
                                                  local.tee 28
                                                  select
                                                  local.set 23
                                                end
                                                block ;; label = @22
                                                  block ;; label = @23
                                                    local.get 32
                                                    i64.const 4294967296
                                                    i64.ge_u
                                                    br_if 0 (;@23;)
                                                    local.get 32
                                                    local.set 33
                                                    local.get 16
                                                    local.set 20
                                                    br 1 (;@22;)
                                                  end
                                                  local.get 16
                                                  local.set 20
                                                  loop ;; label = @23
                                                    local.get 20
                                                    i32.const -1
                                                    i32.add
                                                    local.tee 20
                                                    local.get 32
                                                    local.get 32
                                                    i64.const 10
                                                    i64.div_u
                                                    local.tee 33
                                                    i64.const 10
                                                    i64.mul
                                                    i64.sub
                                                    i32.wrap_i64
                                                    i32.const 48
                                                    i32.or
                                                    i32.store8
                                                    local.get 32
                                                    i64.const 42949672959
                                                    i64.gt_u
                                                    local.set 19
                                                    local.get 33
                                                    local.set 32
                                                    local.get 19
                                                    br_if 0 (;@23;)
                                                  end
                                                end
                                                local.get 33
                                                i32.wrap_i64
                                                local.tee 19
                                                i32.eqz
                                                br_if 0 (;@21;)
                                                loop ;; label = @22
                                                  local.get 20
                                                  i32.const -1
                                                  i32.add
                                                  local.tee 20
                                                  local.get 19
                                                  local.get 19
                                                  i32.const 10
                                                  i32.div_u
                                                  local.tee 22
                                                  i32.const 10
                                                  i32.mul
                                                  i32.sub
                                                  i32.const 48
                                                  i32.or
                                                  i32.store8
                                                  local.get 19
                                                  i32.const 9
                                                  i32.gt_u
                                                  local.set 25
                                                  local.get 22
                                                  local.set 19
                                                  local.get 25
                                                  br_if 0 (;@22;)
                                                end
                                              end
                                              block ;; label = @21
                                                local.get 27
                                                i32.eqz
                                                br_if 0 (;@21;)
                                                local.get 24
                                                i32.const 0
                                                i32.lt_s
                                                br_if 18 (;@3;)
                                              end
                                              local.get 30
                                              i32.const -65537
                                              i32.and
                                              local.get 30
                                              local.get 27
                                              select
                                              local.set 29
                                              block ;; label = @21
                                                local.get 5
                                                i64.load offset=56
                                                local.tee 32
                                                i64.const 0
                                                i64.ne
                                                br_if 0 (;@21;)
                                                i32.const 0
                                                local.set 25
                                                local.get 24
                                                br_if 0 (;@21;)
                                                local.get 16
                                                local.set 20
                                                local.get 16
                                                local.set 19
                                                br 12 (;@9;)
                                              end
                                              local.get 24
                                              local.get 16
                                              local.get 20
                                              i32.sub
                                              local.get 32
                                              i64.eqz
                                              i32.add
                                              local.tee 19
                                              local.get 24
                                              local.get 19
                                              i32.gt_s
                                              select
                                              local.set 25
                                              local.get 16
                                              local.set 19
                                              br 11 (;@9;)
                                            end
                                            local.get 5
                                            local.get 5
                                            i64.load offset=56
                                            i64.store8 offset=55
                                            i32.const 0
                                            local.set 28
                                            i32.const 1024
                                            local.set 23
                                            i32.const 1
                                            local.set 25
                                            local.get 9
                                            local.set 20
                                            local.get 16
                                            local.set 19
                                            br 10 (;@9;)
                                          end
                                          i32.const 5108
                                          i32.load
                                          call $strerror
                                          local.set 20
                                          br 1 (;@17;)
                                        end
                                        local.get 5
                                        i32.load offset=56
                                        local.tee 19
                                        i32.const 1781
                                        local.get 19
                                        select
                                        local.set 20
                                      end
                                      local.get 20
                                      local.get 20
                                      local.get 24
                                      i32.const 2147483647
                                      local.get 24
                                      i32.const 2147483647
                                      i32.lt_u
                                      select
                                      call $strnlen
                                      local.tee 25
                                      i32.add
                                      local.set 19
                                      i32.const 0
                                      local.set 28
                                      i32.const 1024
                                      local.set 23
                                      local.get 24
                                      i32.const -1
                                      i32.gt_s
                                      br_if 7 (;@9;)
                                      local.get 19
                                      i32.load8_u
                                      i32.eqz
                                      br_if 7 (;@9;)
                                      br 13 (;@3;)
                                    end
                                    local.get 5
                                    i32.load offset=56
                                    local.set 20
                                    local.get 24
                                    br_if 1 (;@14;)
                                    i32.const 0
                                    local.set 19
                                    br 2 (;@13;)
                                  end
                                  local.get 5
                                  i32.const 0
                                  i32.store offset=12
                                  local.get 5
                                  local.get 5
                                  i64.load offset=56
                                  i64.store32 offset=8
                                  local.get 5
                                  local.get 5
                                  i32.const 8
                                  i32.add
                                  i32.store offset=56
                                  local.get 5
                                  i32.const 8
                                  i32.add
                                  local.set 20
                                  i32.const -1
                                  local.set 24
                                end
                                i32.const 0
                                local.set 19
                                local.get 20
                                local.set 21
                                block ;; label = @14
                                  loop ;; label = @15
                                    local.get 21
                                    i32.load
                                    local.tee 22
                                    i32.eqz
                                    br_if 1 (;@14;)
                                    block ;; label = @16
                                      local.get 5
                                      i32.const 4
                                      i32.add
                                      local.get 22
                                      call $wctomb
                                      local.tee 22
                                      i32.const 0
                                      i32.lt_s
                                      local.tee 25
                                      br_if 0 (;@16;)
                                      local.get 22
                                      local.get 24
                                      local.get 19
                                      i32.sub
                                      i32.gt_u
                                      br_if 0 (;@16;)
                                      local.get 21
                                      i32.const 4
                                      i32.add
                                      local.set 21
                                      local.get 24
                                      local.get 22
                                      local.get 19
                                      i32.add
                                      local.tee 19
                                      i32.gt_u
                                      br_if 1 (;@15;)
                                      br 2 (;@14;)
                                    end
                                  end
                                  local.get 25
                                  br_if 12 (;@2;)
                                end
                                local.get 19
                                i32.const 0
                                i32.lt_s
                                br_if 10 (;@3;)
                              end
                              block ;; label = @13
                                local.get 30
                                i32.const 73728
                                i32.and
                                local.tee 25
                                br_if 0 (;@13;)
                                local.get 26
                                local.get 19
                                i32.le_s
                                br_if 0 (;@13;)
                                local.get 5
                                i32.const 112
                                i32.add
                                i32.const 32
                                local.get 26
                                local.get 19
                                i32.sub
                                local.tee 21
                                i32.const 256
                                local.get 21
                                i32.const 256
                                i32.lt_u
                                local.tee 22
                                select
                                call $memset
                                drop
                                block ;; label = @14
                                  local.get 22
                                  br_if 0 (;@14;)
                                  loop ;; label = @15
                                    block ;; label = @16
                                      local.get 0
                                      i32.load8_u
                                      i32.const 32
                                      i32.and
                                      br_if 0 (;@16;)
                                      local.get 5
                                      i32.const 112
                                      i32.add
                                      i32.const 256
                                      local.get 0
                                      call $__fwritex
                                      drop
                                    end
                                    local.get 21
                                    i32.const -256
                                    i32.add
                                    local.tee 21
                                    i32.const 255
                                    i32.gt_u
                                    br_if 0 (;@15;)
                                  end
                                end
                                local.get 0
                                i32.load8_u
                                i32.const 32
                                i32.and
                                br_if 0 (;@13;)
                                local.get 5
                                i32.const 112
                                i32.add
                                local.get 21
                                local.get 0
                                call $__fwritex
                                drop
                              end
                              block ;; label = @13
                                local.get 19
                                i32.eqz
                                br_if 0 (;@13;)
                                i32.const 0
                                local.set 21
                                loop ;; label = @14
                                  local.get 20
                                  i32.load
                                  local.tee 22
                                  i32.eqz
                                  br_if 1 (;@13;)
                                  local.get 5
                                  i32.const 4
                                  i32.add
                                  local.get 22
                                  call $wctomb
                                  local.tee 22
                                  local.get 21
                                  i32.add
                                  local.tee 21
                                  local.get 19
                                  i32.gt_u
                                  br_if 1 (;@13;)
                                  block ;; label = @15
                                    local.get 0
                                    i32.load8_u
                                    i32.const 32
                                    i32.and
                                    br_if 0 (;@15;)
                                    local.get 5
                                    i32.const 4
                                    i32.add
                                    local.get 22
                                    local.get 0
                                    call $__fwritex
                                    drop
                                  end
                                  local.get 20
                                  i32.const 4
                                  i32.add
                                  local.set 20
                                  local.get 21
                                  local.get 19
                                  i32.lt_u
                                  br_if 0 (;@14;)
                                end
                              end
                              block ;; label = @13
                                local.get 25
                                i32.const 8192
                                i32.ne
                                br_if 0 (;@13;)
                                local.get 26
                                local.get 19
                                i32.le_s
                                br_if 0 (;@13;)
                                local.get 5
                                i32.const 112
                                i32.add
                                i32.const 32
                                local.get 26
                                local.get 19
                                i32.sub
                                local.tee 21
                                i32.const 256
                                local.get 21
                                i32.const 256
                                i32.lt_u
                                local.tee 22
                                select
                                call $memset
                                drop
                                block ;; label = @14
                                  local.get 22
                                  br_if 0 (;@14;)
                                  loop ;; label = @15
                                    block ;; label = @16
                                      local.get 0
                                      i32.load8_u
                                      i32.const 32
                                      i32.and
                                      br_if 0 (;@16;)
                                      local.get 5
                                      i32.const 112
                                      i32.add
                                      i32.const 256
                                      local.get 0
                                      call $__fwritex
                                      drop
                                    end
                                    local.get 21
                                    i32.const -256
                                    i32.add
                                    local.tee 21
                                    i32.const 255
                                    i32.gt_u
                                    br_if 0 (;@15;)
                                  end
                                end
                                local.get 0
                                i32.load8_u
                                i32.const 32
                                i32.and
                                br_if 0 (;@13;)
                                local.get 5
                                i32.const 112
                                i32.add
                                local.get 21
                                local.get 0
                                call $__fwritex
                                drop
                              end
                              local.get 26
                              local.get 19
                              local.get 26
                              local.get 19
                              i32.gt_s
                              select
                              local.set 19
                              br 8 (;@4;)
                            end
                            block ;; label = @12
                              local.get 27
                              i32.eqz
                              br_if 0 (;@12;)
                              local.get 24
                              i32.const 0
                              i32.lt_s
                              br_if 9 (;@3;)
                            end
                            local.get 5
                            f64.load offset=56
                            local.set 34
                            local.get 5
                            i32.const 0
                            i32.store offset=108
                            block ;; label = @12
                              block ;; label = @13
                                local.get 34
                                i64.reinterpret_f64
                                i64.const -1
                                i64.gt_s
                                br_if 0 (;@13;)
                                local.get 34
                                f64.neg
                                local.set 34
                                i32.const 1
                                local.set 35
                                i32.const 0
                                local.set 36
                                i32.const 1034
                                local.set 37
                                br 1 (;@12;)
                              end
                              block ;; label = @13
                                local.get 30
                                i32.const 2048
                                i32.and
                                i32.eqz
                                br_if 0 (;@13;)
                                i32.const 1
                                local.set 35
                                i32.const 0
                                local.set 36
                                i32.const 1037
                                local.set 37
                                br 1 (;@12;)
                              end
                              i32.const 1040
                              i32.const 1035
                              local.get 30
                              i32.const 1
                              i32.and
                              local.tee 35
                              select
                              local.set 37
                              local.get 35
                              i32.eqz
                              local.set 36
                            end
                            block ;; label = @12
                              local.get 34
                              f64.abs
                              f64.const inf (;=inf;)
                              f64.lt
                              br_if 0 (;@12;)
                              local.get 35
                              i32.const 3
                              i32.add
                              local.set 21
                              block ;; label = @13
                                local.get 30
                                i32.const 8192
                                i32.and
                                br_if 0 (;@13;)
                                local.get 26
                                local.get 21
                                i32.le_s
                                br_if 0 (;@13;)
                                local.get 5
                                i32.const 624
                                i32.add
                                i32.const 32
                                local.get 26
                                local.get 21
                                i32.sub
                                local.tee 19
                                i32.const 256
                                local.get 19
                                i32.const 256
                                i32.lt_u
                                local.tee 22
                                select
                                call $memset
                                drop
                                block ;; label = @14
                                  local.get 22
                                  br_if 0 (;@14;)
                                  loop ;; label = @15
                                    block ;; label = @16
                                      local.get 0
                                      i32.load8_u
                                      i32.const 32
                                      i32.and
                                      br_if 0 (;@16;)
                                      local.get 5
                                      i32.const 624
                                      i32.add
                                      i32.const 256
                                      local.get 0
                                      call $__fwritex
                                      drop
                                    end
                                    local.get 19
                                    i32.const -256
                                    i32.add
                                    local.tee 19
                                    i32.const 255
                                    i32.gt_u
                                    br_if 0 (;@15;)
                                  end
                                end
                                local.get 0
                                i32.load8_u
                                i32.const 32
                                i32.and
                                br_if 0 (;@13;)
                                local.get 5
                                i32.const 624
                                i32.add
                                local.get 19
                                local.get 0
                                call $__fwritex
                                drop
                              end
                              block ;; label = @13
                                local.get 0
                                i32.load
                                local.tee 19
                                i32.const 32
                                i32.and
                                br_if 0 (;@13;)
                                local.get 37
                                local.get 35
                                local.get 0
                                call $__fwritex
                                drop
                                local.get 0
                                i32.load
                                local.set 19
                              end
                              block ;; label = @13
                                local.get 19
                                i32.const 32
                                i32.and
                                br_if 0 (;@13;)
                                i32.const 1074
                                i32.const 1113
                                local.get 31
                                i32.const 32
                                i32.and
                                local.tee 19
                                select
                                i32.const 1078
                                i32.const 1117
                                local.get 19
                                select
                                local.get 34
                                local.get 34
                                f64.ne
                                select
                                i32.const 3
                                local.get 0
                                call $__fwritex
                                drop
                              end
                              block ;; label = @13
                                local.get 30
                                i32.const 73728
                                i32.and
                                i32.const 8192
                                i32.ne
                                br_if 0 (;@13;)
                                local.get 26
                                local.get 21
                                i32.le_s
                                br_if 0 (;@13;)
                                local.get 5
                                i32.const 624
                                i32.add
                                i32.const 32
                                local.get 26
                                local.get 21
                                i32.sub
                                local.tee 19
                                i32.const 256
                                local.get 19
                                i32.const 256
                                i32.lt_u
                                local.tee 22
                                select
                                call $memset
                                drop
                                block ;; label = @14
                                  local.get 22
                                  br_if 0 (;@14;)
                                  loop ;; label = @15
                                    block ;; label = @16
                                      local.get 0
                                      i32.load8_u
                                      i32.const 32
                                      i32.and
                                      br_if 0 (;@16;)
                                      local.get 5
                                      i32.const 624
                                      i32.add
                                      i32.const 256
                                      local.get 0
                                      call $__fwritex
                                      drop
                                    end
                                    local.get 19
                                    i32.const -256
                                    i32.add
                                    local.tee 19
                                    i32.const 255
                                    i32.gt_u
                                    br_if 0 (;@15;)
                                  end
                                end
                                local.get 0
                                i32.load8_u
                                i32.const 32
                                i32.and
                                br_if 0 (;@13;)
                                local.get 5
                                i32.const 624
                                i32.add
                                local.get 19
                                local.get 0
                                call $__fwritex
                                drop
                              end
                              local.get 21
                              local.get 26
                              local.get 21
                              local.get 26
                              i32.gt_s
                              select
                              local.set 19
                              br 8 (;@4;)
                            end
                            block ;; label = @12
                              block ;; label = @13
                                block ;; label = @14
                                  local.get 34
                                  local.get 5
                                  i32.const 108
                                  i32.add
                                  call $frexp
                                  local.tee 34
                                  local.get 34
                                  f64.add
                                  local.tee 34
                                  f64.const 0x0p+0 (;=0;)
                                  f64.eq
                                  br_if 0 (;@14;)
                                  local.get 5
                                  local.get 5
                                  i32.load offset=108
                                  local.tee 19
                                  i32.const -1
                                  i32.add
                                  i32.store offset=108
                                  local.get 31
                                  i32.const 32
                                  i32.or
                                  local.tee 38
                                  i32.const 97
                                  i32.ne
                                  br_if 1 (;@13;)
                                  br 8 (;@6;)
                                end
                                local.get 31
                                i32.const 32
                                i32.or
                                local.tee 38
                                i32.const 97
                                i32.eq
                                br_if 7 (;@6;)
                                i32.const 6
                                local.get 24
                                local.get 24
                                i32.const 0
                                i32.lt_s
                                select
                                local.set 27
                                local.get 5
                                i32.load offset=108
                                local.set 20
                                br 1 (;@12;)
                              end
                              local.get 5
                              local.get 19
                              i32.const -29
                              i32.add
                              local.tee 20
                              i32.store offset=108
                              i32.const 6
                              local.get 24
                              local.get 24
                              i32.const 0
                              i32.lt_s
                              select
                              local.set 27
                              local.get 34
                              f64.const 0x1p+28 (;=268435456;)
                              f64.mul
                              local.set 34
                            end
                            local.get 5
                            i32.const 112
                            i32.add
                            i32.const 0
                            i32.const 72
                            local.get 20
                            i32.const 0
                            i32.lt_s
                            local.tee 39
                            select
                            i32.const 2
                            i32.shl
                            local.tee 40
                            i32.add
                            local.tee 23
                            local.set 21
                            loop ;; label = @12
                              block ;; label = @13
                                block ;; label = @14
                                  local.get 34
                                  f64.const 0x1p+32 (;=4294967296;)
                                  f64.lt
                                  local.get 34
                                  f64.const 0x0p+0 (;=0;)
                                  f64.ge
                                  i32.and
                                  i32.eqz
                                  br_if 0 (;@14;)
                                  local.get 34
                                  i32.trunc_f64_u
                                  local.set 19
                                  br 1 (;@13;)
                                end
                                i32.const 0
                                local.set 19
                              end
                              local.get 21
                              local.get 19
                              i32.store
                              local.get 21
                              i32.const 4
                              i32.add
                              local.set 21
                              local.get 34
                              local.get 19
                              f64.convert_i32_u
                              f64.sub
                              f64.const 0x1.dcd65p+29 (;=1000000000;)
                              f64.mul
                              local.tee 34
                              f64.const 0x0p+0 (;=0;)
                              f64.ne
                              br_if 0 (;@12;)
                            end
                            block ;; label = @12
                              block ;; label = @13
                                local.get 20
                                i32.const 1
                                i32.ge_s
                                br_if 0 (;@13;)
                                local.get 21
                                local.set 19
                                local.get 23
                                local.set 22
                                br 1 (;@12;)
                              end
                              local.get 23
                              local.set 22
                              loop ;; label = @13
                                local.get 20
                                i32.const 29
                                local.get 20
                                i32.const 29
                                i32.lt_s
                                select
                                local.set 20
                                block ;; label = @14
                                  local.get 21
                                  i32.const -4
                                  i32.add
                                  local.tee 19
                                  local.get 22
                                  i32.lt_u
                                  br_if 0 (;@14;)
                                  local.get 20
                                  i64.extend_i32_u
                                  local.set 33
                                  i64.const 0
                                  local.set 32
                                  loop ;; label = @15
                                    local.get 19
                                    local.get 19
                                    i64.load32_u
                                    local.get 33
                                    i64.shl
                                    local.get 32
                                    i64.const 4294967295
                                    i64.and
                                    i64.add
                                    local.tee 32
                                    local.get 32
                                    i64.const 1000000000
                                    i64.div_u
                                    local.tee 32
                                    i64.const 1000000000
                                    i64.mul
                                    i64.sub
                                    i64.store32
                                    local.get 19
                                    i32.const -4
                                    i32.add
                                    local.tee 19
                                    local.get 22
                                    i32.ge_u
                                    br_if 0 (;@15;)
                                  end
                                  local.get 32
                                  i32.wrap_i64
                                  local.tee 19
                                  i32.eqz
                                  br_if 0 (;@14;)
                                  local.get 22
                                  i32.const -4
                                  i32.add
                                  local.tee 22
                                  local.get 19
                                  i32.store
                                end
                                block ;; label = @14
                                  loop ;; label = @15
                                    local.get 21
                                    local.tee 19
                                    local.get 22
                                    i32.le_u
                                    br_if 1 (;@14;)
                                    local.get 19
                                    i32.const -4
                                    i32.add
                                    local.tee 21
                                    i32.load
                                    i32.eqz
                                    br_if 0 (;@15;)
                                  end
                                end
                                local.get 5
                                local.get 5
                                i32.load offset=108
                                local.get 20
                                i32.sub
                                local.tee 20
                                i32.store offset=108
                                local.get 19
                                local.set 21
                                local.get 20
                                i32.const 0
                                i32.gt_s
                                br_if 0 (;@13;)
                              end
                            end
                            block ;; label = @12
                              local.get 20
                              i32.const -1
                              i32.gt_s
                              br_if 0 (;@12;)
                              local.get 27
                              i32.const 25
                              i32.add
                              i32.const 9
                              i32.div_u
                              i32.const 1
                              i32.add
                              local.set 41
                              loop ;; label = @13
                                i32.const 0
                                local.get 20
                                i32.sub
                                local.tee 21
                                i32.const 9
                                local.get 21
                                i32.const 9
                                i32.lt_s
                                select
                                local.set 24
                                block ;; label = @14
                                  block ;; label = @15
                                    local.get 22
                                    local.get 19
                                    i32.lt_u
                                    br_if 0 (;@15;)
                                    local.get 22
                                    i32.load
                                    local.set 21
                                    br 1 (;@14;)
                                  end
                                  i32.const 1000000000
                                  local.get 24
                                  i32.shr_u
                                  local.set 29
                                  i32.const -1
                                  local.get 24
                                  i32.shl
                                  i32.const -1
                                  i32.xor
                                  local.set 28
                                  i32.const 0
                                  local.set 20
                                  local.get 22
                                  local.set 21
                                  loop ;; label = @15
                                    local.get 21
                                    local.get 21
                                    i32.load
                                    local.tee 25
                                    local.get 24
                                    i32.shr_u
                                    local.get 20
                                    i32.add
                                    i32.store
                                    local.get 25
                                    local.get 28
                                    i32.and
                                    local.get 29
                                    i32.mul
                                    local.set 20
                                    local.get 21
                                    i32.const 4
                                    i32.add
                                    local.tee 21
                                    local.get 19
                                    i32.lt_u
                                    br_if 0 (;@15;)
                                  end
                                  local.get 22
                                  i32.load
                                  local.set 21
                                  local.get 20
                                  i32.eqz
                                  br_if 0 (;@14;)
                                  local.get 19
                                  local.get 20
                                  i32.store
                                  local.get 19
                                  i32.const 4
                                  i32.add
                                  local.set 19
                                end
                                local.get 5
                                local.get 5
                                i32.load offset=108
                                local.get 24
                                i32.add
                                local.tee 20
                                i32.store offset=108
                                local.get 23
                                local.get 22
                                local.get 21
                                i32.eqz
                                i32.const 2
                                i32.shl
                                i32.add
                                local.tee 22
                                local.get 38
                                i32.const 102
                                i32.eq
                                select
                                local.tee 21
                                local.get 41
                                i32.const 2
                                i32.shl
                                i32.add
                                local.get 19
                                local.get 19
                                local.get 21
                                i32.sub
                                i32.const 2
                                i32.shr_s
                                local.get 41
                                i32.gt_s
                                select
                                local.set 19
                                local.get 20
                                i32.const 0
                                i32.lt_s
                                br_if 0 (;@13;)
                              end
                            end
                            i32.const 0
                            local.set 25
                            block ;; label = @12
                              local.get 22
                              local.get 19
                              i32.ge_u
                              br_if 0 (;@12;)
                              local.get 23
                              local.get 22
                              i32.sub
                              i32.const 2
                              i32.shr_s
                              i32.const 9
                              i32.mul
                              local.set 25
                              local.get 22
                              i32.load
                              local.tee 20
                              i32.const 10
                              i32.lt_u
                              br_if 0 (;@12;)
                              i32.const 10
                              local.set 21
                              loop ;; label = @13
                                local.get 25
                                i32.const 1
                                i32.add
                                local.set 25
                                local.get 20
                                local.get 21
                                i32.const 10
                                i32.mul
                                local.tee 21
                                i32.ge_u
                                br_if 0 (;@13;)
                              end
                            end
                            block ;; label = @12
                              local.get 27
                              i32.const 0
                              local.get 25
                              local.get 38
                              i32.const 102
                              i32.eq
                              select
                              i32.sub
                              local.get 27
                              i32.const 0
                              i32.ne
                              local.get 38
                              i32.const 103
                              i32.eq
                              local.tee 28
                              i32.and
                              i32.sub
                              local.tee 21
                              local.get 19
                              local.get 23
                              i32.sub
                              i32.const 2
                              i32.shr_s
                              i32.const 9
                              i32.mul
                              i32.const -9
                              i32.add
                              i32.ge_s
                              br_if 0 (;@12;)
                              local.get 21
                              i32.const 9216
                              i32.add
                              local.tee 20
                              i32.const 9
                              i32.div_s
                              local.tee 24
                              i32.const 2
                              i32.shl
                              local.tee 42
                              local.get 5
                              i32.const 112
                              i32.add
                              i32.const 1
                              i32.const 73
                              local.get 39
                              select
                              i32.const 2
                              i32.shl
                              local.tee 39
                              i32.add
                              i32.add
                              i32.const -4096
                              i32.add
                              local.set 29
                              i32.const 10
                              local.set 21
                              block ;; label = @13
                                local.get 20
                                local.get 24
                                i32.const 9
                                i32.mul
                                i32.sub
                                local.tee 24
                                i32.const 7
                                i32.gt_s
                                br_if 0 (;@13;)
                                i32.const 8
                                local.get 24
                                i32.sub
                                local.tee 41
                                i32.const 7
                                i32.and
                                local.set 20
                                i32.const 10
                                local.set 21
                                block ;; label = @14
                                  local.get 24
                                  i32.const -1
                                  i32.add
                                  i32.const 7
                                  i32.lt_u
                                  br_if 0 (;@14;)
                                  local.get 41
                                  i32.const -8
                                  i32.and
                                  local.set 24
                                  i32.const 10
                                  local.set 21
                                  loop ;; label = @15
                                    local.get 21
                                    i32.const 100000000
                                    i32.mul
                                    local.set 21
                                    local.get 24
                                    i32.const -8
                                    i32.add
                                    local.tee 24
                                    br_if 0 (;@15;)
                                  end
                                end
                                local.get 20
                                i32.eqz
                                br_if 0 (;@13;)
                                loop ;; label = @14
                                  local.get 21
                                  i32.const 10
                                  i32.mul
                                  local.set 21
                                  local.get 20
                                  i32.const -1
                                  i32.add
                                  local.tee 20
                                  br_if 0 (;@14;)
                                end
                              end
                              local.get 29
                              i32.const 4
                              i32.add
                              local.set 41
                              block ;; label = @13
                                block ;; label = @14
                                  local.get 29
                                  i32.load
                                  local.tee 20
                                  local.get 20
                                  local.get 21
                                  i32.div_u
                                  local.tee 38
                                  local.get 21
                                  i32.mul
                                  i32.sub
                                  local.tee 24
                                  br_if 0 (;@14;)
                                  local.get 41
                                  local.get 19
                                  i32.eq
                                  br_if 1 (;@13;)
                                end
                                block ;; label = @14
                                  block ;; label = @15
                                    local.get 38
                                    i32.const 1
                                    i32.and
                                    br_if 0 (;@15;)
                                    f64.const 0x1p+53 (;=9007199254740992;)
                                    local.set 34
                                    local.get 21
                                    i32.const 1000000000
                                    i32.ne
                                    br_if 1 (;@14;)
                                    local.get 29
                                    local.get 22
                                    i32.le_u
                                    br_if 1 (;@14;)
                                    local.get 29
                                    i32.const -4
                                    i32.add
                                    i32.load8_u
                                    i32.const 1
                                    i32.and
                                    i32.eqz
                                    br_if 1 (;@14;)
                                  end
                                  f64.const 0x1.0000000000001p+53 (;=9007199254740994;)
                                  local.set 34
                                end
                                f64.const 0x1p-1 (;=0.5;)
                                f64.const 0x1p+0 (;=1;)
                                f64.const 0x1.8p+0 (;=1.5;)
                                local.get 41
                                local.get 19
                                i32.eq
                                select
                                f64.const 0x1.8p+0 (;=1.5;)
                                local.get 24
                                local.get 21
                                i32.const 1
                                i32.shr_u
                                local.tee 41
                                i32.eq
                                select
                                local.get 24
                                local.get 41
                                i32.lt_u
                                select
                                local.set 43
                                block ;; label = @14
                                  local.get 36
                                  br_if 0 (;@14;)
                                  local.get 37
                                  i32.load8_u
                                  i32.const 45
                                  i32.ne
                                  br_if 0 (;@14;)
                                  local.get 43
                                  f64.neg
                                  local.set 43
                                  local.get 34
                                  f64.neg
                                  local.set 34
                                end
                                local.get 29
                                local.get 20
                                local.get 24
                                i32.sub
                                local.tee 20
                                i32.store
                                local.get 34
                                local.get 43
                                f64.add
                                local.get 34
                                f64.eq
                                br_if 0 (;@13;)
                                local.get 29
                                local.get 20
                                local.get 21
                                i32.add
                                local.tee 21
                                i32.store
                                block ;; label = @14
                                  local.get 21
                                  i32.const 1000000000
                                  i32.lt_u
                                  br_if 0 (;@14;)
                                  local.get 8
                                  local.get 39
                                  local.get 42
                                  i32.add
                                  i32.add
                                  local.set 21
                                  loop ;; label = @15
                                    local.get 21
                                    i32.const 4
                                    i32.add
                                    i32.const 0
                                    i32.store
                                    block ;; label = @16
                                      local.get 21
                                      local.get 22
                                      i32.ge_u
                                      br_if 0 (;@16;)
                                      local.get 22
                                      i32.const -4
                                      i32.add
                                      local.tee 22
                                      i32.const 0
                                      i32.store
                                    end
                                    local.get 21
                                    local.get 21
                                    i32.load
                                    i32.const 1
                                    i32.add
                                    local.tee 20
                                    i32.store
                                    local.get 21
                                    i32.const -4
                                    i32.add
                                    local.set 21
                                    local.get 20
                                    i32.const 999999999
                                    i32.gt_u
                                    br_if 0 (;@15;)
                                  end
                                  local.get 21
                                  i32.const 4
                                  i32.add
                                  local.set 29
                                end
                                local.get 23
                                local.get 22
                                i32.sub
                                i32.const 2
                                i32.shr_s
                                i32.const 9
                                i32.mul
                                local.set 25
                                local.get 22
                                i32.load
                                local.tee 20
                                i32.const 10
                                i32.lt_u
                                br_if 0 (;@13;)
                                i32.const 10
                                local.set 21
                                loop ;; label = @14
                                  local.get 25
                                  i32.const 1
                                  i32.add
                                  local.set 25
                                  local.get 20
                                  local.get 21
                                  i32.const 10
                                  i32.mul
                                  local.tee 21
                                  i32.ge_u
                                  br_if 0 (;@14;)
                                end
                              end
                              local.get 29
                              i32.const 4
                              i32.add
                              local.tee 21
                              local.get 19
                              local.get 19
                              local.get 21
                              i32.gt_u
                              select
                              local.set 19
                            end
                            local.get 7
                            local.get 19
                            i32.add
                            local.get 40
                            i32.sub
                            local.set 21
                            block ;; label = @12
                              loop ;; label = @13
                                local.get 21
                                local.set 20
                                local.get 19
                                local.tee 29
                                local.get 22
                                i32.le_u
                                local.tee 24
                                br_if 1 (;@12;)
                                local.get 20
                                i32.const -4
                                i32.add
                                local.set 21
                                local.get 29
                                i32.const -4
                                i32.add
                                local.tee 19
                                i32.load
                                i32.eqz
                                br_if 0 (;@13;)
                              end
                            end
                            block ;; label = @12
                              block ;; label = @13
                                local.get 28
                                br_if 0 (;@13;)
                                local.get 30
                                i32.const 8
                                i32.and
                                local.set 41
                                br 1 (;@12;)
                              end
                              local.get 25
                              i32.const -1
                              i32.xor
                              i32.const -1
                              local.get 27
                              i32.const 1
                              local.get 27
                              select
                              local.tee 19
                              local.get 25
                              i32.gt_s
                              local.get 25
                              i32.const -5
                              i32.gt_s
                              i32.and
                              local.tee 21
                              select
                              local.get 19
                              i32.add
                              local.set 27
                              i32.const -1
                              i32.const -2
                              local.get 21
                              select
                              local.get 31
                              i32.add
                              local.set 31
                              local.get 30
                              i32.const 8
                              i32.and
                              local.tee 41
                              br_if 0 (;@12;)
                              i32.const -9
                              local.set 19
                              block ;; label = @13
                                local.get 24
                                br_if 0 (;@13;)
                                local.get 29
                                i32.const -4
                                i32.add
                                i32.load
                                local.tee 24
                                i32.eqz
                                br_if 0 (;@13;)
                                i32.const 0
                                local.set 19
                                local.get 24
                                i32.const 10
                                i32.rem_u
                                br_if 0 (;@13;)
                                i32.const 10
                                local.set 21
                                i32.const 0
                                local.set 19
                                loop ;; label = @14
                                  local.get 19
                                  i32.const -1
                                  i32.add
                                  local.set 19
                                  local.get 24
                                  local.get 21
                                  i32.const 10
                                  i32.mul
                                  local.tee 21
                                  i32.rem_u
                                  i32.eqz
                                  br_if 0 (;@14;)
                                end
                              end
                              local.get 20
                              i32.const 2
                              i32.shr_s
                              i32.const 9
                              i32.mul
                              i32.const -9
                              i32.add
                              local.set 21
                              block ;; label = @13
                                local.get 31
                                i32.const -33
                                i32.and
                                i32.const 70
                                i32.ne
                                br_if 0 (;@13;)
                                i32.const 0
                                local.set 41
                                local.get 27
                                local.get 21
                                local.get 19
                                i32.add
                                local.tee 19
                                i32.const 0
                                local.get 19
                                i32.const 0
                                i32.gt_s
                                select
                                local.tee 19
                                local.get 27
                                local.get 19
                                i32.lt_s
                                select
                                local.set 27
                                br 1 (;@12;)
                              end
                              i32.const 0
                              local.set 41
                              local.get 27
                              local.get 21
                              local.get 25
                              i32.add
                              local.get 19
                              i32.add
                              local.tee 19
                              i32.const 0
                              local.get 19
                              i32.const 0
                              i32.gt_s
                              select
                              local.tee 19
                              local.get 27
                              local.get 19
                              i32.lt_s
                              select
                              local.set 27
                            end
                            local.get 27
                            i32.const 2147483645
                            i32.const 2147483646
                            local.get 27
                            local.get 41
                            i32.or
                            local.tee 36
                            select
                            i32.gt_s
                            br_if 8 (;@3;)
                            local.get 27
                            local.get 36
                            i32.const 0
                            i32.ne
                            i32.add
                            i32.const 1
                            i32.add
                            local.set 38
                            block ;; label = @12
                              block ;; label = @13
                                local.get 31
                                i32.const -33
                                i32.and
                                i32.const 70
                                i32.ne
                                local.tee 39
                                br_if 0 (;@13;)
                                local.get 25
                                local.get 38
                                i32.const 2147483647
                                i32.xor
                                i32.gt_s
                                br_if 10 (;@3;)
                                local.get 25
                                i32.const 0
                                local.get 25
                                i32.const 0
                                i32.gt_s
                                select
                                local.set 19
                                br 1 (;@12;)
                              end
                              block ;; label = @13
                                block ;; label = @14
                                  local.get 25
                                  br_if 0 (;@14;)
                                  local.get 6
                                  local.set 20
                                  local.get 6
                                  local.set 21
                                  br 1 (;@13;)
                                end
                                local.get 25
                                local.get 25
                                i32.const 31
                                i32.shr_s
                                local.tee 19
                                i32.xor
                                local.get 19
                                i32.sub
                                local.set 19
                                local.get 6
                                local.set 20
                                local.get 6
                                local.set 21
                                loop ;; label = @14
                                  local.get 21
                                  i32.const -1
                                  i32.add
                                  local.tee 21
                                  local.get 19
                                  local.get 19
                                  i32.const 10
                                  i32.div_u
                                  local.tee 24
                                  i32.const 10
                                  i32.mul
                                  i32.sub
                                  i32.const 48
                                  i32.or
                                  i32.store8
                                  local.get 20
                                  i32.const -1
                                  i32.add
                                  local.set 20
                                  local.get 19
                                  i32.const 9
                                  i32.gt_u
                                  local.set 28
                                  local.get 24
                                  local.set 19
                                  local.get 28
                                  br_if 0 (;@14;)
                                end
                              end
                              block ;; label = @13
                                local.get 6
                                local.get 20
                                i32.sub
                                i32.const 1
                                i32.gt_s
                                br_if 0 (;@13;)
                                local.get 21
                                local.get 15
                                local.get 20
                                i32.sub
                                i32.add
                                local.tee 21
                                i32.const 48
                                local.get 14
                                local.get 20
                                i32.add
                                call $memset
                                drop
                              end
                              local.get 21
                              i32.const -2
                              i32.add
                              local.tee 40
                              local.get 31
                              i32.store8
                              local.get 21
                              i32.const -1
                              i32.add
                              i32.const 45
                              i32.const 43
                              local.get 25
                              i32.const 0
                              i32.lt_s
                              select
                              i32.store8
                              local.get 6
                              local.get 40
                              i32.sub
                              local.tee 19
                              local.get 38
                              i32.const 2147483647
                              i32.xor
                              i32.gt_s
                              br_if 9 (;@3;)
                            end
                            local.get 19
                            local.get 38
                            i32.add
                            local.tee 19
                            local.get 35
                            i32.const 2147483647
                            i32.xor
                            i32.gt_s
                            br_if 8 (;@3;)
                            local.get 19
                            local.get 35
                            i32.add
                            local.set 28
                            block ;; label = @12
                              local.get 30
                              i32.const 73728
                              i32.and
                              local.tee 30
                              br_if 0 (;@12;)
                              local.get 26
                              local.get 28
                              i32.le_s
                              br_if 0 (;@12;)
                              local.get 5
                              i32.const 624
                              i32.add
                              i32.const 32
                              local.get 26
                              local.get 28
                              i32.sub
                              local.tee 19
                              i32.const 256
                              local.get 19
                              i32.const 256
                              i32.lt_u
                              local.tee 21
                              select
                              call $memset
                              drop
                              block ;; label = @13
                                local.get 21
                                br_if 0 (;@13;)
                                loop ;; label = @14
                                  block ;; label = @15
                                    local.get 0
                                    i32.load8_u
                                    i32.const 32
                                    i32.and
                                    br_if 0 (;@15;)
                                    local.get 5
                                    i32.const 624
                                    i32.add
                                    i32.const 256
                                    local.get 0
                                    call $__fwritex
                                    drop
                                  end
                                  local.get 19
                                  i32.const -256
                                  i32.add
                                  local.tee 19
                                  i32.const 255
                                  i32.gt_u
                                  br_if 0 (;@14;)
                                end
                              end
                              local.get 0
                              i32.load8_u
                              i32.const 32
                              i32.and
                              br_if 0 (;@12;)
                              local.get 5
                              i32.const 624
                              i32.add
                              local.get 19
                              local.get 0
                              call $__fwritex
                              drop
                            end
                            block ;; label = @12
                              local.get 0
                              i32.load8_u
                              i32.const 32
                              i32.and
                              br_if 0 (;@12;)
                              local.get 37
                              local.get 35
                              local.get 0
                              call $__fwritex
                              drop
                            end
                            block ;; label = @12
                              local.get 30
                              i32.const 65536
                              i32.ne
                              br_if 0 (;@12;)
                              local.get 26
                              local.get 28
                              i32.le_s
                              br_if 0 (;@12;)
                              local.get 5
                              i32.const 624
                              i32.add
                              i32.const 48
                              local.get 26
                              local.get 28
                              i32.sub
                              local.tee 19
                              i32.const 256
                              local.get 19
                              i32.const 256
                              i32.lt_u
                              local.tee 21
                              select
                              call $memset
                              drop
                              block ;; label = @13
                                local.get 21
                                br_if 0 (;@13;)
                                loop ;; label = @14
                                  block ;; label = @15
                                    local.get 0
                                    i32.load8_u
                                    i32.const 32
                                    i32.and
                                    br_if 0 (;@15;)
                                    local.get 5
                                    i32.const 624
                                    i32.add
                                    i32.const 256
                                    local.get 0
                                    call $__fwritex
                                    drop
                                  end
                                  local.get 19
                                  i32.const -256
                                  i32.add
                                  local.tee 19
                                  i32.const 255
                                  i32.gt_u
                                  br_if 0 (;@14;)
                                end
                              end
                              local.get 0
                              i32.load8_u
                              i32.const 32
                              i32.and
                              br_if 0 (;@12;)
                              local.get 5
                              i32.const 624
                              i32.add
                              local.get 19
                              local.get 0
                              call $__fwritex
                              drop
                            end
                            local.get 39
                            br_if 3 (;@8;)
                            local.get 23
                            local.get 22
                            local.get 22
                            local.get 23
                            i32.gt_u
                            select
                            local.tee 25
                            local.set 24
                            loop ;; label = @12
                              block ;; label = @13
                                block ;; label = @14
                                  block ;; label = @15
                                    block ;; label = @16
                                      local.get 24
                                      i32.load
                                      local.tee 19
                                      i32.eqz
                                      br_if 0 (;@16;)
                                      i32.const 8
                                      local.set 21
                                      loop ;; label = @17
                                        local.get 5
                                        i32.const 80
                                        i32.add
                                        local.get 21
                                        i32.add
                                        local.get 19
                                        local.get 19
                                        i32.const 10
                                        i32.div_u
                                        local.tee 22
                                        i32.const 10
                                        i32.mul
                                        i32.sub
                                        i32.const 48
                                        i32.or
                                        i32.store8
                                        local.get 21
                                        i32.const -1
                                        i32.add
                                        local.set 21
                                        local.get 19
                                        i32.const 9
                                        i32.gt_u
                                        local.set 20
                                        local.get 22
                                        local.set 19
                                        local.get 20
                                        br_if 0 (;@17;)
                                      end
                                      local.get 21
                                      i32.const 1
                                      i32.add
                                      local.tee 22
                                      local.get 5
                                      i32.const 80
                                      i32.add
                                      i32.add
                                      local.set 19
                                      block ;; label = @17
                                        local.get 24
                                        local.get 25
                                        i32.eq
                                        br_if 0 (;@17;)
                                        local.get 21
                                        i32.const 2
                                        i32.add
                                        i32.const 2
                                        i32.lt_s
                                        br_if 4 (;@13;)
                                        br 3 (;@14;)
                                      end
                                      local.get 21
                                      i32.const 8
                                      i32.ne
                                      br_if 3 (;@13;)
                                      br 1 (;@15;)
                                    end
                                    i32.const 9
                                    local.set 22
                                    local.get 24
                                    local.get 25
                                    i32.ne
                                    br_if 1 (;@14;)
                                  end
                                  local.get 5
                                  i32.const 48
                                  i32.store8 offset=88
                                  local.get 12
                                  local.set 19
                                  br 1 (;@13;)
                                end
                                local.get 5
                                i32.const 80
                                i32.add
                                local.get 22
                                local.get 5
                                i32.const 80
                                i32.add
                                i32.add
                                local.tee 21
                                i32.const -1
                                i32.add
                                local.tee 19
                                local.get 5
                                i32.const 80
                                i32.add
                                local.get 19
                                i32.lt_u
                                select
                                local.tee 19
                                i32.const 48
                                local.get 21
                                local.get 19
                                i32.sub
                                call $memset
                                drop
                              end
                              block ;; label = @13
                                local.get 0
                                i32.load8_u
                                i32.const 32
                                i32.and
                                br_if 0 (;@13;)
                                local.get 19
                                local.get 13
                                local.get 19
                                i32.sub
                                local.get 0
                                call $__fwritex
                                drop
                              end
                              local.get 24
                              i32.const 4
                              i32.add
                              local.tee 24
                              local.get 23
                              i32.le_u
                              br_if 0 (;@12;)
                            end
                            block ;; label = @12
                              local.get 36
                              i32.eqz
                              br_if 0 (;@12;)
                              local.get 0
                              i32.load8_u
                              i32.const 32
                              i32.and
                              br_if 0 (;@12;)
                              i32.const 1779
                              i32.const 1
                              local.get 0
                              call $__fwritex
                              drop
                            end
                            block ;; label = @12
                              block ;; label = @13
                                local.get 24
                                local.get 29
                                i32.lt_u
                                br_if 0 (;@13;)
                                local.get 27
                                local.set 19
                                br 1 (;@12;)
                              end
                              block ;; label = @13
                                local.get 27
                                i32.const 1
                                i32.ge_s
                                br_if 0 (;@13;)
                                local.get 27
                                local.set 19
                                br 1 (;@12;)
                              end
                              loop ;; label = @13
                                block ;; label = @14
                                  block ;; label = @15
                                    block ;; label = @16
                                      local.get 24
                                      i32.load
                                      local.tee 19
                                      br_if 0 (;@16;)
                                      local.get 13
                                      local.set 21
                                      local.get 13
                                      local.set 22
                                      br 1 (;@15;)
                                    end
                                    local.get 13
                                    local.set 22
                                    local.get 13
                                    local.set 21
                                    loop ;; label = @16
                                      local.get 21
                                      i32.const -1
                                      i32.add
                                      local.tee 21
                                      local.get 19
                                      local.get 19
                                      i32.const 10
                                      i32.div_u
                                      local.tee 20
                                      i32.const 10
                                      i32.mul
                                      i32.sub
                                      i32.const 48
                                      i32.or
                                      i32.store8
                                      local.get 22
                                      i32.const -1
                                      i32.add
                                      local.set 22
                                      local.get 19
                                      i32.const 9
                                      i32.gt_u
                                      local.set 25
                                      local.get 20
                                      local.set 19
                                      local.get 25
                                      br_if 0 (;@16;)
                                    end
                                    local.get 21
                                    local.get 5
                                    i32.const 80
                                    i32.add
                                    i32.le_u
                                    br_if 1 (;@14;)
                                  end
                                  local.get 21
                                  local.get 5
                                  i32.const 80
                                  i32.add
                                  i32.add
                                  local.get 22
                                  i32.sub
                                  local.tee 21
                                  i32.const 48
                                  local.get 22
                                  local.get 5
                                  i32.const 80
                                  i32.add
                                  i32.sub
                                  call $memset
                                  drop
                                end
                                block ;; label = @14
                                  local.get 0
                                  i32.load8_u
                                  i32.const 32
                                  i32.and
                                  br_if 0 (;@14;)
                                  local.get 21
                                  local.get 27
                                  i32.const 9
                                  local.get 27
                                  i32.const 9
                                  i32.lt_s
                                  select
                                  local.get 0
                                  call $__fwritex
                                  drop
                                end
                                local.get 27
                                i32.const -9
                                i32.add
                                local.set 19
                                local.get 24
                                i32.const 4
                                i32.add
                                local.tee 24
                                local.get 29
                                i32.ge_u
                                br_if 1 (;@12;)
                                local.get 27
                                i32.const 9
                                i32.gt_s
                                local.set 21
                                local.get 19
                                local.set 27
                                local.get 21
                                br_if 0 (;@13;)
                              end
                            end
                            local.get 0
                            i32.const 48
                            local.get 19
                            i32.const 9
                            i32.add
                            i32.const 9
                            i32.const 0
                            call $pad
                            br 4 (;@7;)
                          end
                          i32.const 5108
                          i32.const 28
                          i32.store
                          br 8 (;@2;)
                        end
                        i32.const 0
                        local.set 28
                        i32.const 1024
                        local.set 23
                        local.get 16
                        local.set 19
                        local.get 30
                        local.set 29
                        local.get 24
                        local.set 25
                      end
                      local.get 25
                      local.get 19
                      local.get 20
                      i32.sub
                      local.tee 24
                      local.get 25
                      local.get 24
                      i32.gt_s
                      select
                      local.tee 27
                      local.get 28
                      i32.const 2147483647
                      i32.xor
                      i32.gt_s
                      br_if 5 (;@3;)
                      local.get 26
                      local.get 28
                      local.get 27
                      i32.add
                      local.tee 22
                      local.get 26
                      local.get 22
                      i32.gt_s
                      select
                      local.tee 19
                      local.get 21
                      i32.gt_s
                      br_if 5 (;@3;)
                      block ;; label = @9
                        local.get 29
                        i32.const 73728
                        i32.and
                        local.tee 29
                        br_if 0 (;@9;)
                        local.get 22
                        local.get 26
                        i32.ge_s
                        br_if 0 (;@9;)
                        local.get 5
                        i32.const 112
                        i32.add
                        i32.const 32
                        local.get 19
                        local.get 22
                        i32.sub
                        local.tee 21
                        i32.const 256
                        local.get 21
                        i32.const 256
                        i32.lt_u
                        local.tee 30
                        select
                        call $memset
                        drop
                        block ;; label = @10
                          local.get 30
                          br_if 0 (;@10;)
                          loop ;; label = @11
                            block ;; label = @12
                              local.get 0
                              i32.load8_u
                              i32.const 32
                              i32.and
                              br_if 0 (;@12;)
                              local.get 5
                              i32.const 112
                              i32.add
                              i32.const 256
                              local.get 0
                              call $__fwritex
                              drop
                            end
                            local.get 21
                            i32.const -256
                            i32.add
                            local.tee 21
                            i32.const 255
                            i32.gt_u
                            br_if 0 (;@11;)
                          end
                        end
                        local.get 0
                        i32.load8_u
                        i32.const 32
                        i32.and
                        br_if 0 (;@9;)
                        local.get 5
                        i32.const 112
                        i32.add
                        local.get 21
                        local.get 0
                        call $__fwritex
                        drop
                      end
                      block ;; label = @9
                        local.get 0
                        i32.load8_u
                        i32.const 32
                        i32.and
                        br_if 0 (;@9;)
                        local.get 23
                        local.get 28
                        local.get 0
                        call $__fwritex
                        drop
                      end
                      block ;; label = @9
                        local.get 29
                        i32.const 65536
                        i32.ne
                        br_if 0 (;@9;)
                        local.get 22
                        local.get 26
                        i32.ge_s
                        br_if 0 (;@9;)
                        local.get 5
                        i32.const 112
                        i32.add
                        i32.const 48
                        local.get 19
                        local.get 22
                        i32.sub
                        local.tee 21
                        i32.const 256
                        local.get 21
                        i32.const 256
                        i32.lt_u
                        local.tee 28
                        select
                        call $memset
                        drop
                        block ;; label = @10
                          local.get 28
                          br_if 0 (;@10;)
                          loop ;; label = @11
                            block ;; label = @12
                              local.get 0
                              i32.load8_u
                              i32.const 32
                              i32.and
                              br_if 0 (;@12;)
                              local.get 5
                              i32.const 112
                              i32.add
                              i32.const 256
                              local.get 0
                              call $__fwritex
                              drop
                            end
                            local.get 21
                            i32.const -256
                            i32.add
                            local.tee 21
                            i32.const 255
                            i32.gt_u
                            br_if 0 (;@11;)
                          end
                        end
                        local.get 0
                        i32.load8_u
                        i32.const 32
                        i32.and
                        br_if 0 (;@9;)
                        local.get 5
                        i32.const 112
                        i32.add
                        local.get 21
                        local.get 0
                        call $__fwritex
                        drop
                      end
                      block ;; label = @9
                        local.get 24
                        local.get 25
                        i32.ge_s
                        br_if 0 (;@9;)
                        local.get 5
                        i32.const 112
                        i32.add
                        i32.const 48
                        local.get 27
                        local.get 24
                        i32.sub
                        local.tee 21
                        i32.const 256
                        local.get 21
                        i32.const 256
                        i32.lt_u
                        local.tee 25
                        select
                        call $memset
                        drop
                        block ;; label = @10
                          local.get 25
                          br_if 0 (;@10;)
                          loop ;; label = @11
                            block ;; label = @12
                              local.get 0
                              i32.load8_u
                              i32.const 32
                              i32.and
                              br_if 0 (;@12;)
                              local.get 5
                              i32.const 112
                              i32.add
                              i32.const 256
                              local.get 0
                              call $__fwritex
                              drop
                            end
                            local.get 21
                            i32.const -256
                            i32.add
                            local.tee 21
                            i32.const 255
                            i32.gt_u
                            br_if 0 (;@11;)
                          end
                        end
                        local.get 0
                        i32.load8_u
                        i32.const 32
                        i32.and
                        br_if 0 (;@9;)
                        local.get 5
                        i32.const 112
                        i32.add
                        local.get 21
                        local.get 0
                        call $__fwritex
                        drop
                      end
                      block ;; label = @9
                        local.get 0
                        i32.load8_u
                        i32.const 32
                        i32.and
                        br_if 0 (;@9;)
                        local.get 20
                        local.get 24
                        local.get 0
                        call $__fwritex
                        drop
                      end
                      local.get 29
                      i32.const 8192
                      i32.ne
                      br_if 4 (;@4;)
                      local.get 22
                      local.get 26
                      i32.ge_s
                      br_if 4 (;@4;)
                      local.get 5
                      i32.const 112
                      i32.add
                      i32.const 32
                      local.get 19
                      local.get 22
                      i32.sub
                      local.tee 21
                      i32.const 256
                      local.get 21
                      i32.const 256
                      i32.lt_u
                      local.tee 22
                      select
                      call $memset
                      drop
                      block ;; label = @9
                        local.get 22
                        br_if 0 (;@9;)
                        loop ;; label = @10
                          block ;; label = @11
                            local.get 0
                            i32.load8_u
                            i32.const 32
                            i32.and
                            br_if 0 (;@11;)
                            local.get 5
                            i32.const 112
                            i32.add
                            i32.const 256
                            local.get 0
                            call $__fwritex
                            drop
                          end
                          local.get 21
                          i32.const -256
                          i32.add
                          local.tee 21
                          i32.const 255
                          i32.gt_u
                          br_if 0 (;@10;)
                        end
                      end
                      local.get 0
                      i32.load8_u
                      i32.const 32
                      i32.and
                      br_if 4 (;@4;)
                      local.get 5
                      i32.const 112
                      i32.add
                      local.get 21
                      local.get 0
                      call $__fwritex
                      drop
                      br 4 (;@4;)
                    end
                    block ;; label = @8
                      local.get 27
                      i32.const 0
                      i32.lt_s
                      br_if 0 (;@8;)
                      local.get 29
                      local.get 22
                      i32.const 4
                      i32.add
                      local.get 29
                      local.get 22
                      i32.gt_u
                      select
                      local.set 29
                      local.get 22
                      local.set 24
                      loop ;; label = @9
                        block ;; label = @10
                          block ;; label = @11
                            local.get 24
                            i32.load
                            local.tee 19
                            i32.eqz
                            br_if 0 (;@11;)
                            i32.const 0
                            local.set 21
                            loop ;; label = @12
                              local.get 5
                              i32.const 80
                              i32.add
                              local.get 21
                              i32.add
                              i32.const 8
                              i32.add
                              local.get 19
                              local.get 19
                              i32.const 10
                              i32.div_u
                              local.tee 20
                              i32.const 10
                              i32.mul
                              i32.sub
                              i32.const 48
                              i32.or
                              i32.store8
                              local.get 21
                              i32.const -1
                              i32.add
                              local.set 21
                              local.get 19
                              i32.const 9
                              i32.gt_u
                              local.set 25
                              local.get 20
                              local.set 19
                              local.get 25
                              br_if 0 (;@12;)
                            end
                            local.get 21
                            i32.eqz
                            br_if 0 (;@11;)
                            local.get 5
                            i32.const 80
                            i32.add
                            local.get 21
                            i32.add
                            i32.const 9
                            i32.add
                            local.set 19
                            br 1 (;@10;)
                          end
                          local.get 5
                          i32.const 48
                          i32.store8 offset=88
                          local.get 12
                          local.set 19
                        end
                        block ;; label = @10
                          block ;; label = @11
                            local.get 24
                            local.get 22
                            i32.eq
                            br_if 0 (;@11;)
                            local.get 19
                            local.get 5
                            i32.const 80
                            i32.add
                            i32.le_u
                            br_if 1 (;@10;)
                            local.get 5
                            i32.const 80
                            i32.add
                            i32.const 48
                            local.get 19
                            local.get 5
                            i32.const 80
                            i32.add
                            i32.sub
                            call $memset
                            drop
                            local.get 5
                            i32.const 80
                            i32.add
                            local.set 19
                            br 1 (;@10;)
                          end
                          block ;; label = @11
                            local.get 0
                            i32.load8_u
                            i32.const 32
                            i32.and
                            br_if 0 (;@11;)
                            local.get 19
                            i32.const 1
                            local.get 0
                            call $__fwritex
                            drop
                          end
                          local.get 19
                          i32.const 1
                          i32.add
                          local.set 19
                          block ;; label = @11
                            local.get 41
                            br_if 0 (;@11;)
                            local.get 27
                            i32.const 1
                            i32.lt_s
                            br_if 1 (;@10;)
                          end
                          local.get 0
                          i32.load8_u
                          i32.const 32
                          i32.and
                          br_if 0 (;@10;)
                          i32.const 1779
                          i32.const 1
                          local.get 0
                          call $__fwritex
                          drop
                        end
                        local.get 13
                        local.get 19
                        i32.sub
                        local.set 21
                        block ;; label = @10
                          local.get 0
                          i32.load8_u
                          i32.const 32
                          i32.and
                          br_if 0 (;@10;)
                          local.get 19
                          local.get 27
                          local.get 21
                          local.get 27
                          local.get 21
                          i32.lt_s
                          select
                          local.get 0
                          call $__fwritex
                          drop
                        end
                        local.get 27
                        local.get 21
                        i32.sub
                        local.set 27
                        local.get 24
                        i32.const 4
                        i32.add
                        local.tee 24
                        local.get 29
                        i32.ge_u
                        br_if 1 (;@8;)
                        local.get 27
                        i32.const -1
                        i32.gt_s
                        br_if 0 (;@9;)
                      end
                    end
                    local.get 0
                    i32.const 48
                    local.get 27
                    i32.const 18
                    i32.add
                    i32.const 18
                    i32.const 0
                    call $pad
                    local.get 0
                    i32.load8_u
                    i32.const 32
                    i32.and
                    br_if 0 (;@7;)
                    local.get 40
                    local.get 6
                    local.get 40
                    i32.sub
                    local.get 0
                    call $__fwritex
                    drop
                  end
                  local.get 30
                  i32.const 8192
                  i32.ne
                  br_if 1 (;@5;)
                  local.get 26
                  local.get 28
                  i32.le_s
                  br_if 1 (;@5;)
                  local.get 5
                  i32.const 624
                  i32.add
                  i32.const 32
                  local.get 26
                  local.get 28
                  i32.sub
                  local.tee 19
                  i32.const 256
                  local.get 19
                  i32.const 256
                  i32.lt_u
                  local.tee 21
                  select
                  call $memset
                  drop
                  block ;; label = @7
                    local.get 21
                    br_if 0 (;@7;)
                    loop ;; label = @8
                      block ;; label = @9
                        local.get 0
                        i32.load8_u
                        i32.const 32
                        i32.and
                        br_if 0 (;@9;)
                        local.get 5
                        i32.const 624
                        i32.add
                        i32.const 256
                        local.get 0
                        call $__fwritex
                        drop
                      end
                      local.get 19
                      i32.const -256
                      i32.add
                      local.tee 19
                      i32.const 255
                      i32.gt_u
                      br_if 0 (;@8;)
                    end
                  end
                  local.get 0
                  i32.load8_u
                  i32.const 32
                  i32.and
                  br_if 1 (;@5;)
                  local.get 5
                  i32.const 624
                  i32.add
                  local.get 19
                  local.get 0
                  call $__fwritex
                  drop
                  br 1 (;@5;)
                end
                local.get 37
                local.get 31
                i32.const 26
                i32.shl
                i32.const 31
                i32.shr_s
                i32.const 9
                i32.and
                i32.add
                local.set 23
                block ;; label = @6
                  local.get 24
                  i32.const 11
                  i32.gt_u
                  br_if 0 (;@6;)
                  block ;; label = @7
                    block ;; label = @8
                      i32.const 12
                      local.get 24
                      i32.sub
                      local.tee 19
                      i32.const 7
                      i32.and
                      local.tee 21
                      br_if 0 (;@8;)
                      f64.const 0x1p+4 (;=16;)
                      local.set 43
                      br 1 (;@7;)
                    end
                    local.get 24
                    i32.const -12
                    i32.add
                    local.set 19
                    f64.const 0x1p+4 (;=16;)
                    local.set 43
                    loop ;; label = @8
                      local.get 19
                      i32.const 1
                      i32.add
                      local.set 19
                      local.get 43
                      f64.const 0x1p+4 (;=16;)
                      f64.mul
                      local.set 43
                      local.get 21
                      i32.const -1
                      i32.add
                      local.tee 21
                      br_if 0 (;@8;)
                    end
                    i32.const 0
                    local.get 19
                    i32.sub
                    local.set 19
                  end
                  block ;; label = @7
                    local.get 24
                    i32.const -5
                    i32.add
                    i32.const 7
                    i32.lt_u
                    br_if 0 (;@7;)
                    loop ;; label = @8
                      local.get 43
                      f64.const 0x1p+4 (;=16;)
                      f64.mul
                      f64.const 0x1p+4 (;=16;)
                      f64.mul
                      f64.const 0x1p+4 (;=16;)
                      f64.mul
                      f64.const 0x1p+4 (;=16;)
                      f64.mul
                      f64.const 0x1p+4 (;=16;)
                      f64.mul
                      f64.const 0x1p+4 (;=16;)
                      f64.mul
                      f64.const 0x1p+4 (;=16;)
                      f64.mul
                      f64.const 0x1p+4 (;=16;)
                      f64.mul
                      local.set 43
                      local.get 19
                      i32.const -8
                      i32.add
                      local.tee 19
                      br_if 0 (;@8;)
                    end
                  end
                  block ;; label = @7
                    local.get 23
                    i32.load8_u
                    i32.const 45
                    i32.ne
                    br_if 0 (;@7;)
                    local.get 43
                    local.get 34
                    f64.neg
                    local.get 43
                    f64.sub
                    f64.add
                    f64.neg
                    local.set 34
                    br 1 (;@6;)
                  end
                  local.get 34
                  local.get 43
                  f64.add
                  local.get 43
                  f64.sub
                  local.set 34
                end
                block ;; label = @6
                  block ;; label = @7
                    local.get 5
                    i32.load offset=108
                    local.tee 25
                    i32.eqz
                    br_if 0 (;@7;)
                    local.get 25
                    local.get 25
                    i32.const 31
                    i32.shr_s
                    local.tee 19
                    i32.xor
                    local.get 19
                    i32.sub
                    local.set 19
                    i32.const 0
                    local.set 21
                    loop ;; label = @8
                      local.get 5
                      i32.const 68
                      i32.add
                      local.get 21
                      i32.add
                      i32.const 11
                      i32.add
                      local.get 19
                      local.get 19
                      i32.const 10
                      i32.div_u
                      local.tee 22
                      i32.const 10
                      i32.mul
                      i32.sub
                      i32.const 48
                      i32.or
                      i32.store8
                      local.get 21
                      i32.const -1
                      i32.add
                      local.set 21
                      local.get 19
                      i32.const 9
                      i32.gt_u
                      local.set 20
                      local.get 22
                      local.set 19
                      local.get 20
                      br_if 0 (;@8;)
                    end
                    local.get 21
                    i32.eqz
                    br_if 0 (;@7;)
                    local.get 5
                    i32.const 68
                    i32.add
                    local.get 21
                    i32.add
                    i32.const 12
                    i32.add
                    local.set 19
                    br 1 (;@6;)
                  end
                  local.get 5
                  i32.const 48
                  i32.store8 offset=79
                  local.get 11
                  local.set 19
                end
                local.get 35
                i32.const 2
                i32.or
                local.set 27
                local.get 31
                i32.const 32
                i32.and
                local.set 22
                local.get 19
                i32.const -2
                i32.add
                local.tee 29
                local.get 31
                i32.const 15
                i32.add
                i32.store8
                local.get 19
                i32.const -1
                i32.add
                i32.const 45
                i32.const 43
                local.get 25
                i32.const 0
                i32.lt_s
                select
                i32.store8
                local.get 30
                i32.const 8
                i32.and
                local.set 20
                local.get 5
                i32.const 80
                i32.add
                local.set 21
                loop ;; label = @6
                  local.get 21
                  local.set 19
                  block ;; label = @7
                    block ;; label = @8
                      local.get 34
                      f64.abs
                      f64.const 0x1p+31 (;=2147483648;)
                      f64.lt
                      i32.eqz
                      br_if 0 (;@8;)
                      local.get 34
                      i32.trunc_f64_s
                      local.set 21
                      br 1 (;@7;)
                    end
                    i32.const -2147483648
                    local.set 21
                  end
                  local.get 19
                  local.get 21
                  i32.const 4464
                  i32.add
                  i32.load8_u
                  local.get 22
                  i32.or
                  i32.store8
                  local.get 34
                  local.get 21
                  f64.convert_i32_s
                  f64.sub
                  f64.const 0x1p+4 (;=16;)
                  f64.mul
                  local.set 34
                  block ;; label = @7
                    local.get 19
                    i32.const 1
                    i32.add
                    local.tee 21
                    local.get 5
                    i32.const 80
                    i32.add
                    i32.sub
                    i32.const 1
                    i32.ne
                    br_if 0 (;@7;)
                    block ;; label = @8
                      local.get 20
                      br_if 0 (;@8;)
                      local.get 24
                      i32.const 0
                      i32.gt_s
                      br_if 0 (;@8;)
                      local.get 34
                      f64.const 0x0p+0 (;=0;)
                      f64.eq
                      br_if 1 (;@7;)
                    end
                    local.get 19
                    i32.const 46
                    i32.store8 offset=1
                    local.get 19
                    i32.const 2
                    i32.add
                    local.set 21
                  end
                  local.get 34
                  f64.const 0x0p+0 (;=0;)
                  f64.ne
                  br_if 0 (;@6;)
                end
                i32.const 2147483645
                local.get 6
                local.get 29
                i32.sub
                local.tee 25
                local.get 27
                i32.add
                local.tee 19
                i32.sub
                local.get 24
                i32.lt_s
                br_if 2 (;@3;)
                local.get 24
                i32.const 2
                i32.add
                local.get 21
                local.get 5
                i32.const 80
                i32.add
                i32.sub
                local.tee 22
                local.get 10
                local.get 21
                i32.add
                local.get 24
                i32.lt_s
                select
                local.get 22
                local.get 24
                select
                local.tee 20
                local.get 19
                i32.add
                local.set 28
                block ;; label = @6
                  local.get 30
                  i32.const 73728
                  i32.and
                  local.tee 21
                  br_if 0 (;@6;)
                  local.get 26
                  local.get 28
                  i32.le_s
                  br_if 0 (;@6;)
                  local.get 5
                  i32.const 624
                  i32.add
                  i32.const 32
                  local.get 26
                  local.get 28
                  i32.sub
                  local.tee 19
                  i32.const 256
                  local.get 19
                  i32.const 256
                  i32.lt_u
                  local.tee 24
                  select
                  call $memset
                  drop
                  block ;; label = @7
                    local.get 24
                    br_if 0 (;@7;)
                    loop ;; label = @8
                      block ;; label = @9
                        local.get 0
                        i32.load8_u
                        i32.const 32
                        i32.and
                        br_if 0 (;@9;)
                        local.get 5
                        i32.const 624
                        i32.add
                        i32.const 256
                        local.get 0
                        call $__fwritex
                        drop
                      end
                      local.get 19
                      i32.const -256
                      i32.add
                      local.tee 19
                      i32.const 255
                      i32.gt_u
                      br_if 0 (;@8;)
                    end
                  end
                  local.get 0
                  i32.load8_u
                  i32.const 32
                  i32.and
                  br_if 0 (;@6;)
                  local.get 5
                  i32.const 624
                  i32.add
                  local.get 19
                  local.get 0
                  call $__fwritex
                  drop
                end
                block ;; label = @6
                  local.get 0
                  i32.load8_u
                  i32.const 32
                  i32.and
                  br_if 0 (;@6;)
                  local.get 23
                  local.get 27
                  local.get 0
                  call $__fwritex
                  drop
                end
                block ;; label = @6
                  local.get 21
                  i32.const 65536
                  i32.ne
                  br_if 0 (;@6;)
                  local.get 26
                  local.get 28
                  i32.le_s
                  br_if 0 (;@6;)
                  local.get 5
                  i32.const 624
                  i32.add
                  i32.const 48
                  local.get 26
                  local.get 28
                  i32.sub
                  local.tee 19
                  i32.const 256
                  local.get 19
                  i32.const 256
                  i32.lt_u
                  local.tee 24
                  select
                  call $memset
                  drop
                  block ;; label = @7
                    local.get 24
                    br_if 0 (;@7;)
                    loop ;; label = @8
                      block ;; label = @9
                        local.get 0
                        i32.load8_u
                        i32.const 32
                        i32.and
                        br_if 0 (;@9;)
                        local.get 5
                        i32.const 624
                        i32.add
                        i32.const 256
                        local.get 0
                        call $__fwritex
                        drop
                      end
                      local.get 19
                      i32.const -256
                      i32.add
                      local.tee 19
                      i32.const 255
                      i32.gt_u
                      br_if 0 (;@8;)
                    end
                  end
                  local.get 0
                  i32.load8_u
                  i32.const 32
                  i32.and
                  br_if 0 (;@6;)
                  local.get 5
                  i32.const 624
                  i32.add
                  local.get 19
                  local.get 0
                  call $__fwritex
                  drop
                end
                block ;; label = @6
                  local.get 0
                  i32.load8_u
                  i32.const 32
                  i32.and
                  br_if 0 (;@6;)
                  local.get 5
                  i32.const 80
                  i32.add
                  local.get 22
                  local.get 0
                  call $__fwritex
                  drop
                end
                block ;; label = @6
                  local.get 20
                  local.get 22
                  i32.sub
                  local.tee 19
                  i32.const 1
                  i32.lt_s
                  br_if 0 (;@6;)
                  local.get 5
                  i32.const 624
                  i32.add
                  i32.const 48
                  local.get 19
                  i32.const 256
                  local.get 19
                  i32.const 256
                  i32.lt_u
                  local.tee 22
                  select
                  call $memset
                  drop
                  block ;; label = @7
                    local.get 22
                    br_if 0 (;@7;)
                    loop ;; label = @8
                      block ;; label = @9
                        local.get 0
                        i32.load8_u
                        i32.const 32
                        i32.and
                        br_if 0 (;@9;)
                        local.get 5
                        i32.const 624
                        i32.add
                        i32.const 256
                        local.get 0
                        call $__fwritex
                        drop
                      end
                      local.get 19
                      i32.const -256
                      i32.add
                      local.tee 19
                      i32.const 255
                      i32.gt_u
                      br_if 0 (;@8;)
                    end
                  end
                  local.get 0
                  i32.load8_u
                  i32.const 32
                  i32.and
                  br_if 0 (;@6;)
                  local.get 5
                  i32.const 624
                  i32.add
                  local.get 19
                  local.get 0
                  call $__fwritex
                  drop
                end
                block ;; label = @6
                  local.get 0
                  i32.load8_u
                  i32.const 32
                  i32.and
                  br_if 0 (;@6;)
                  local.get 29
                  local.get 25
                  local.get 0
                  call $__fwritex
                  drop
                end
                local.get 21
                i32.const 8192
                i32.ne
                br_if 0 (;@5;)
                local.get 26
                local.get 28
                i32.le_s
                br_if 0 (;@5;)
                local.get 5
                i32.const 624
                i32.add
                i32.const 32
                local.get 26
                local.get 28
                i32.sub
                local.tee 19
                i32.const 256
                local.get 19
                i32.const 256
                i32.lt_u
                local.tee 21
                select
                call $memset
                drop
                block ;; label = @6
                  local.get 21
                  br_if 0 (;@6;)
                  loop ;; label = @7
                    block ;; label = @8
                      local.get 0
                      i32.load8_u
                      i32.const 32
                      i32.and
                      br_if 0 (;@8;)
                      local.get 5
                      i32.const 624
                      i32.add
                      i32.const 256
                      local.get 0
                      call $__fwritex
                      drop
                    end
                    local.get 19
                    i32.const -256
                    i32.add
                    local.tee 19
                    i32.const 255
                    i32.gt_u
                    br_if 0 (;@7;)
                  end
                end
                local.get 0
                i32.load8_u
                i32.const 32
                i32.and
                br_if 0 (;@5;)
                local.get 5
                i32.const 624
                i32.add
                local.get 19
                local.get 0
                call $__fwritex
                drop
              end
              local.get 28
              local.get 26
              local.get 28
              local.get 26
              i32.gt_s
              select
              local.tee 19
              i32.const 0
              i32.ge_s
              br_if 0 (;@4;)
            end
          end
          i32.const 5108
          i32.const 61
          i32.store
        end
        i32.const -1
        local.set 18
      end
      local.get 5
      i32.const 880
      i32.add
      global.set $__stack_pointer
      local.get 18
    )
    (func $pop_arg (;65;) (type 2) (param i32 i32 i32)
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
                                            local.get 1
                                            i32.const -9
                                            i32.add
                                            br_table 17 (;@2;) 0 (;@19;) 1 (;@18;) 4 (;@15;) 2 (;@17;) 3 (;@16;) 5 (;@14;) 6 (;@13;) 7 (;@12;) 8 (;@11;) 9 (;@10;) 10 (;@9;) 11 (;@8;) 12 (;@7;) 13 (;@6;) 14 (;@5;) 15 (;@4;) 16 (;@3;) 18 (;@1;)
                                          end
                                          local.get 2
                                          local.get 2
                                          i32.load
                                          local.tee 1
                                          i32.const 4
                                          i32.add
                                          i32.store
                                          local.get 0
                                          local.get 1
                                          i64.load32_s
                                          i64.store
                                          return
                                        end
                                        local.get 2
                                        local.get 2
                                        i32.load
                                        local.tee 1
                                        i32.const 4
                                        i32.add
                                        i32.store
                                        local.get 0
                                        local.get 1
                                        i64.load32_u
                                        i64.store
                                        return
                                      end
                                      local.get 2
                                      local.get 2
                                      i32.load
                                      local.tee 1
                                      i32.const 4
                                      i32.add
                                      i32.store
                                      local.get 0
                                      local.get 1
                                      i64.load32_s
                                      i64.store
                                      return
                                    end
                                    local.get 2
                                    local.get 2
                                    i32.load
                                    local.tee 1
                                    i32.const 4
                                    i32.add
                                    i32.store
                                    local.get 0
                                    local.get 1
                                    i64.load32_u
                                    i64.store
                                    return
                                  end
                                  local.get 2
                                  local.get 2
                                  i32.load
                                  i32.const 7
                                  i32.add
                                  i32.const -8
                                  i32.and
                                  local.tee 1
                                  i32.const 8
                                  i32.add
                                  i32.store
                                  local.get 0
                                  local.get 1
                                  i64.load
                                  i64.store
                                  return
                                end
                                local.get 2
                                local.get 2
                                i32.load
                                local.tee 1
                                i32.const 4
                                i32.add
                                i32.store
                                local.get 0
                                local.get 1
                                i64.load16_s
                                i64.store
                                return
                              end
                              local.get 2
                              local.get 2
                              i32.load
                              local.tee 1
                              i32.const 4
                              i32.add
                              i32.store
                              local.get 0
                              local.get 1
                              i64.load16_u
                              i64.store
                              return
                            end
                            local.get 2
                            local.get 2
                            i32.load
                            local.tee 1
                            i32.const 4
                            i32.add
                            i32.store
                            local.get 0
                            local.get 1
                            i64.load8_s
                            i64.store
                            return
                          end
                          local.get 2
                          local.get 2
                          i32.load
                          local.tee 1
                          i32.const 4
                          i32.add
                          i32.store
                          local.get 0
                          local.get 1
                          i64.load8_u
                          i64.store
                          return
                        end
                        local.get 2
                        local.get 2
                        i32.load
                        i32.const 7
                        i32.add
                        i32.const -8
                        i32.and
                        local.tee 1
                        i32.const 8
                        i32.add
                        i32.store
                        local.get 0
                        local.get 1
                        i64.load
                        i64.store
                        return
                      end
                      local.get 2
                      local.get 2
                      i32.load
                      local.tee 1
                      i32.const 4
                      i32.add
                      i32.store
                      local.get 0
                      local.get 1
                      i64.load32_u
                      i64.store
                      return
                    end
                    local.get 2
                    local.get 2
                    i32.load
                    i32.const 7
                    i32.add
                    i32.const -8
                    i32.and
                    local.tee 1
                    i32.const 8
                    i32.add
                    i32.store
                    local.get 0
                    local.get 1
                    i64.load
                    i64.store
                    return
                  end
                  local.get 2
                  local.get 2
                  i32.load
                  i32.const 7
                  i32.add
                  i32.const -8
                  i32.and
                  local.tee 1
                  i32.const 8
                  i32.add
                  i32.store
                  local.get 0
                  local.get 1
                  i64.load
                  i64.store
                  return
                end
                local.get 2
                local.get 2
                i32.load
                local.tee 1
                i32.const 4
                i32.add
                i32.store
                local.get 0
                local.get 1
                i64.load32_s
                i64.store
                return
              end
              local.get 2
              local.get 2
              i32.load
              local.tee 1
              i32.const 4
              i32.add
              i32.store
              local.get 0
              local.get 1
              i64.load32_u
              i64.store
              return
            end
            local.get 2
            local.get 2
            i32.load
            i32.const 7
            i32.add
            i32.const -8
            i32.and
            local.tee 1
            i32.const 8
            i32.add
            i32.store
            local.get 0
            local.get 1
            f64.load
            f64.store
            return
          end
          call $long_double_not_supported
          unreachable
        end
        local.get 2
        local.get 2
        i32.load
        local.tee 1
        i32.const 4
        i32.add
        i32.store
        local.get 0
        local.get 1
        i32.load
        i32.store
      end
    )
    (func $pad (;66;) (type 16) (param i32 i32 i32 i32 i32)
      (local i32)
      global.get $__stack_pointer
      i32.const 256
      i32.sub
      local.tee 5
      global.set $__stack_pointer
      block ;; label = @1
        local.get 2
        local.get 3
        i32.le_s
        br_if 0 (;@1;)
        local.get 4
        i32.const 73728
        i32.and
        br_if 0 (;@1;)
        local.get 5
        local.get 1
        local.get 2
        local.get 3
        i32.sub
        local.tee 3
        i32.const 256
        local.get 3
        i32.const 256
        i32.lt_u
        local.tee 4
        select
        call $memset
        local.set 2
        block ;; label = @2
          local.get 4
          br_if 0 (;@2;)
          loop ;; label = @3
            block ;; label = @4
              local.get 0
              i32.load8_u
              i32.const 32
              i32.and
              br_if 0 (;@4;)
              local.get 2
              i32.const 256
              local.get 0
              call $__fwritex
              drop
            end
            local.get 3
            i32.const -256
            i32.add
            local.tee 3
            i32.const 255
            i32.gt_u
            br_if 0 (;@3;)
          end
        end
        local.get 0
        i32.load8_u
        i32.const 32
        i32.and
        br_if 0 (;@1;)
        local.get 2
        local.get 3
        local.get 0
        call $__fwritex
        drop
      end
      local.get 5
      i32.const 256
      i32.add
      global.set $__stack_pointer
    )
    (func $long_double_not_supported (;67;) (type 7)
      i32.const 2119
      i32.const 4480
      call $fputs
      drop
      call $abort
      unreachable
    )
    (func $memcpy (;68;) (type $.rodata) (param i32 i32 i32) (result i32)
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
                  block ;; label = @7
                    block ;; label = @8
                      local.get 2
                      i32.const -1
                      i32.add
                      br_table 3 (;@5;) 0 (;@8;) 1 (;@7;) 7 (;@1;)
                    end
                    local.get 4
                    local.get 5
                    i32.load
                    i32.store16 align=1
                    local.get 4
                    local.get 5
                    i32.const 2
                    i32.add
                    i32.load align=2
                    i32.store offset=2
                    local.get 4
                    local.get 5
                    i32.const 6
                    i32.add
                    i64.load align=2
                    i64.store offset=6 align=4
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
                  i32.load
                  i32.store8
                  local.get 4
                  local.get 5
                  i32.const 1
                  i32.add
                  i32.load align=1
                  i32.store offset=1
                  local.get 4
                  local.get 5
                  i32.const 5
                  i32.add
                  i64.load align=1
                  i64.store offset=5 align=4
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
              local.get 5
              i32.load
              local.tee 2
              i32.store8
              local.get 4
              local.get 2
              i32.const 16
              i32.shr_u
              i32.store8 offset=2
              local.get 4
              local.get 2
              i32.const 8
              i32.shr_u
              i32.store8 offset=1
              local.get 4
              local.get 5
              i32.const 3
              i32.add
              i32.load align=1
              i32.store offset=3
              local.get 4
              local.get 5
              i32.const 7
              i32.add
              i64.load align=1
              i64.store offset=7 align=4
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
    (func $memset (;69;) (type $.rodata) (param i32 i32 i32) (result i32)
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
        local.get 2
        local.get 0
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
    (func $strlen (;70;) (type 3) (param i32) (result i32)
      (local i32 i32)
      local.get 0
      local.set 1
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i32.const 3
          i32.and
          i32.eqz
          br_if 0 (;@2;)
          local.get 0
          local.set 1
          local.get 0
          i32.load8_u
          i32.eqz
          br_if 1 (;@1;)
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
          local.set 1
        end
        local.get 1
        i32.const -5
        i32.add
        local.set 1
        loop ;; label = @2
          local.get 1
          i32.const 5
          i32.add
          local.set 2
          local.get 1
          i32.const 4
          i32.add
          local.set 1
          local.get 2
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
          br_if 0 (;@2;)
        end
        loop ;; label = @2
          local.get 1
          i32.const 1
          i32.add
          local.tee 1
          i32.load8_u
          br_if 0 (;@2;)
        end
      end
      local.get 1
      local.get 0
      i32.sub
    )
    (func $memchr (;71;) (type $.rodata) (param i32 i32 i32) (result i32)
      (local i32 i32 i32)
      local.get 2
      i32.const 0
      i32.ne
      local.set 3
      block ;; label = @1
        block ;; label = @2
          block ;; label = @3
            block ;; label = @4
              local.get 0
              i32.const 3
              i32.and
              i32.eqz
              br_if 0 (;@4;)
              local.get 2
              i32.eqz
              br_if 0 (;@4;)
              block ;; label = @5
                local.get 0
                i32.load8_u
                local.get 1
                i32.const 255
                i32.and
                i32.ne
                br_if 0 (;@5;)
                local.get 0
                local.set 4
                local.get 2
                local.set 5
                br 3 (;@2;)
              end
              local.get 2
              i32.const -1
              i32.add
              local.tee 5
              i32.const 0
              i32.ne
              local.set 3
              local.get 0
              i32.const 1
              i32.add
              local.tee 4
              i32.const 3
              i32.and
              i32.eqz
              br_if 1 (;@3;)
              local.get 5
              i32.eqz
              br_if 1 (;@3;)
              local.get 4
              i32.load8_u
              local.get 1
              i32.const 255
              i32.and
              i32.eq
              br_if 2 (;@2;)
              local.get 2
              i32.const -2
              i32.add
              local.tee 5
              i32.const 0
              i32.ne
              local.set 3
              local.get 0
              i32.const 2
              i32.add
              local.tee 4
              i32.const 3
              i32.and
              i32.eqz
              br_if 1 (;@3;)
              local.get 5
              i32.eqz
              br_if 1 (;@3;)
              local.get 4
              i32.load8_u
              local.get 1
              i32.const 255
              i32.and
              i32.eq
              br_if 2 (;@2;)
              local.get 2
              i32.const -3
              i32.add
              local.tee 5
              i32.const 0
              i32.ne
              local.set 3
              local.get 0
              i32.const 3
              i32.add
              local.tee 4
              i32.const 3
              i32.and
              i32.eqz
              br_if 1 (;@3;)
              local.get 5
              i32.eqz
              br_if 1 (;@3;)
              local.get 4
              i32.load8_u
              local.get 1
              i32.const 255
              i32.and
              i32.eq
              br_if 2 (;@2;)
              local.get 0
              i32.const 4
              i32.add
              local.set 4
              local.get 2
              i32.const -4
              i32.add
              local.tee 5
              i32.const 0
              i32.ne
              local.set 3
              br 1 (;@3;)
            end
            local.get 2
            local.set 5
            local.get 0
            local.set 4
          end
          local.get 3
          i32.eqz
          br_if 1 (;@1;)
          block ;; label = @3
            local.get 4
            i32.load8_u
            local.get 1
            i32.const 255
            i32.and
            i32.eq
            br_if 0 (;@3;)
            local.get 5
            i32.const 4
            i32.lt_u
            br_if 0 (;@3;)
            local.get 1
            i32.const 255
            i32.and
            i32.const 16843009
            i32.mul
            local.set 0
            loop ;; label = @4
              local.get 4
              i32.load
              local.get 0
              i32.xor
              local.tee 2
              i32.const -1
              i32.xor
              local.get 2
              i32.const -16843009
              i32.add
              i32.and
              i32.const -2139062144
              i32.and
              br_if 2 (;@2;)
              local.get 4
              i32.const 4
              i32.add
              local.set 4
              local.get 5
              i32.const -4
              i32.add
              local.tee 5
              i32.const 3
              i32.gt_u
              br_if 0 (;@4;)
            end
          end
          local.get 5
          i32.eqz
          br_if 1 (;@1;)
        end
        local.get 1
        i32.const 255
        i32.and
        local.set 2
        loop ;; label = @2
          block ;; label = @3
            local.get 4
            i32.load8_u
            local.get 2
            i32.ne
            br_if 0 (;@3;)
            local.get 4
            return
          end
          local.get 4
          i32.const 1
          i32.add
          local.set 4
          local.get 5
          i32.const -1
          i32.add
          local.tee 5
          br_if 0 (;@2;)
        end
      end
      i32.const 0
    )
    (func $strnlen (;72;) (type 11) (param i32 i32) (result i32)
      (local i32)
      local.get 0
      i32.const 0
      local.get 1
      call $memchr
      local.tee 2
      local.get 0
      i32.sub
      local.get 1
      local.get 2
      select
    )
    (table (;0;) 4 4 funcref)
    (memory (;0;) 2)
    (global $__stack_pointer (;0;) (mut i32) i32.const 70688)
    (export "memory" (memory 0))
    (export "_initialize" (func $_initialize))
    (export "cabi_realloc" (func $cabi_realloc))
    (export "test-imports" (func $__wasm_export_records_test_imports))
    (export "test:records/test#multiple-results" (func $__wasm_export_exports_test_records_test_multiple_results))
    (export "test:records/test#swap-tuple" (func $__wasm_export_exports_test_records_test_swap_tuple))
    (export "test:records/test#roundtrip-flags1" (func $__wasm_export_exports_test_records_test_roundtrip_flags1))
    (export "test:records/test#roundtrip-flags2" (func $__wasm_export_exports_test_records_test_roundtrip_flags2))
    (export "test:records/test#roundtrip-flags3" (func $__wasm_export_exports_test_records_test_roundtrip_flags3))
    (export "test:records/test#roundtrip-record1" (func $__wasm_export_exports_test_records_test_roundtrip_record1))
    (export "test:records/test#tuple1" (func $__wasm_export_exports_test_records_test_tuple1))
    (elem (;0;) (i32.const 1) func $__stdio_close $__stdio_write $__stdio_seek)
    (data (;0;) (i32.const 1024) "-+   0X0x\00-0X+0X 0X-0x+0x 0x\00records_test_imports\00nan\00inf\00./tests/runtime/records/wasm.c\00NAN\00INF\00test_records_test_roundtrip_flags2(TEST_RECORDS_TEST_F2_D) == TEST_RECORDS_TEST_F2_D\00test_records_test_roundtrip_flags2(TEST_RECORDS_TEST_F2_C) == TEST_RECORDS_TEST_F2_C\00test_records_test_roundtrip_flags1(TEST_RECORDS_TEST_F1_B) == TEST_RECORDS_TEST_F1_B\00test_records_test_roundtrip_flags1(TEST_RECORDS_TEST_F1_A) == TEST_RECORDS_TEST_F1_A\00b.a == 8\00b == 5\00a == 4\00flag64 == TEST_RECORDS_TEST_FLAG64_B3\00flag32 == TEST_RECORDS_TEST_FLAG32_B2\00output.f0 == 2\00flag16 == TEST_RECORDS_TEST_FLAG16_B1\00output.f1 == 1\00t2.f0 == 1\00flag8 == TEST_RECORDS_TEST_FLAG8_B0\00b.b == 0\00b.a == 0\00test_records_test_roundtrip_flags2(0) == 0\00test_records_test_roundtrip_flags1(0) == 0\00.\00(null)\00test_records_test_roundtrip_flags2(TEST_RECORDS_TEST_F2_C | TEST_RECORDS_TEST_F2_E) == (TEST_RECORDS_TEST_F2_C | TEST_RECORDS_TEST_F2_E)\00b.b == (TEST_RECORDS_TEST_F1_A | TEST_RECORDS_TEST_F1_B)\00test_records_test_roundtrip_flags1(TEST_RECORDS_TEST_F1_A | TEST_RECORDS_TEST_F1_B) == (TEST_RECORDS_TEST_F1_A | TEST_RECORDS_TEST_F1_B)\00Support for formatting long double values is currently disabled.\0aTo enable it, add -lc-printscan-long-double to the link command.\0a\00Assertion failed: %s (%s: %s: %d)\0a\00Success\00Illegal byte sequence\00Domain error\00Result not representable\00Not a tty\00Permission denied\00Operation not permitted\00No such file or directory\00No such process\00File exists\00Value too large for data type\00No space left on device\00Out of memory\00Resource busy\00Interrupted system call\00Resource temporarily unavailable\00Invalid seek\00Cross-device link\00Read-only file system\00Directory not empty\00Connection reset by peer\00Operation timed out\00Connection refused\00Host is unreachable\00Address in use\00Broken pipe\00I/O error\00No such device or address\00No such device\00Not a directory\00Is a directory\00Text file busy\00Exec format error\00Invalid argument\00Argument list too long\00Symbolic link loop\00Filename too long\00Too many open files in system\00No file descriptors available\00Bad file descriptor\00No child process\00Bad address\00File too large\00Too many links\00No locks available\00Resource deadlock would occur\00State not recoverable\00Previous owner died\00Operation canceled\00Function not implemented\00No message of desired type\00Identifier removed\00Link has been severed\00Protocol error\00Bad message\00Not a socket\00Destination address required\00Message too large\00Protocol wrong type for socket\00Protocol not available\00Protocol not supported\00Not supported\00Address family not supported by protocol\00Address not available\00Network is down\00Network unreachable\00Connection reset by network\00Connection aborted\00No buffer space available\00Socket is connected\00Socket not connected\00Operation already in progress\00Operation in progress\00Stale file handle\00Quota exceeded\00Multihop attempted\00Capabilities insufficient\00\00\00\00\00\00u\02N\00\d6\01\e2\04\b9\04\18\01\8e\05\ed\02\16\04\f2\00\97\03\01\038\05\af\01\82\01O\03/\04\1e\00\d4\05\a2\00\12\03\1e\03\c2\01\de\03\08\00\ac\05\00\01d\02\f1\01e\054\02\8c\02\cf\02-\03L\04\e3\05\9f\02\f8\04\1c\05\08\05\b1\02K\05\15\02x\00R\02<\03\f1\03\e4\00\c3\03}\04\cc\00\aa\03y\05$\02n\01m\03\22\04\ab\04D\00\fb\01\ae\00\83\03`\00\e5\01\07\04\94\04^\04+\00X\019\01\92\00\c2\05\9b\01C\02F\01\f6\05\00\00\00\00\00\00\19\00\0a\00\19\19\19\00\00\00\00\05\00\00\00\00\00\00\09\00\00\00\00\0b\00\00\00\00\00\00\00\00\19\00\11\0a\19\19\19\03\0a\07\00\01\1b\09\0b\18\00\00\09\06\0b\00\00\0b\00\06\19\00\00\00\19\19\19\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\0e\00\00\00\00\00\00\00\00\19\00\0a\0d\19\19\19\00\0d\00\00\02\00\09\0e\00\00\00\09\00\0e\00\00\0e\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\0c\00\00\00\00\00\00\00\00\00\00\00\13\00\00\00\00\13\00\00\00\00\09\0c\00\00\00\00\00\0c\00\00\0c\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\10\00\00\00\00\00\00\00\00\00\00\00\0f\00\00\00\04\0f\00\00\00\00\09\10\00\00\00\00\00\10\00\00\10\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\12\00\00\00\00\00\00\00\00\00\00\00\11\00\00\00\00\11\00\00\00\00\09\12\00\00\00\00\00\12\00\00\12\00\00\1a\00\00\00\1a\1a\1a\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\1a\00\00\00\1a\1a\1a\00\00\00\00\00\00\09\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\14\00\00\00\00\00\00\00\00\00\00\00\17\00\00\00\00\17\00\00\00\00\09\14\00\00\00\00\00\14\00\00\14\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\16\00\00\00\00\00\00\00\00\00\00\00\15\00\00\00\00\15\00\00\00\00\09\16\00\00\00\00\00\16\00\00\16\00\000123456789ABCDEF")
    (data (;1;) (i32.const 4480) "\05\00\00\00\00\00\00\00\00\00\00\00\01\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\02\00\00\00\03\00\00\00\00\14\00\00\00\00\00\00\00\00\00\00\00\00\00\00\02\00\00\00\00\00\00\00\ff\ff\ff\ff\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00")
    (@producers
      (language "C11" "")
      (processed-by "clang" "16.0.0 (https://github.com/llvm/llvm-project 08d094a0e457360ad8b94b017d2dc277e697ca76)")
      (processed-by "wit-component" "0.13.1")
      (processed-by "wit-bindgen-c" "0.9.0")
    )
  )
  (core module (;1;)
    (type (;0;) (func (param i32 i32)))
    (type (;1;) (func (param i32 i32 i32 i32) (result i32)))
    (type (;2;) (func (param i32 i64 i32 i32) (result i32)))
    (type (;3;) (func (param i32) (result i32)))
    (import "env" "memory" (memory (;0;) 0))
    (import "testwasi" "log-err" (func $_ZN22wasi_snapshot_preview18testwasi7log_err10wit_import17hd4c9c922014b0486E (;0;) (type 0)))
    (import "testwasi" "log" (func $_ZN22wasi_snapshot_preview18testwasi3log10wit_import17h5ccb982eb99a6e9cE (;1;) (type 0)))
    (func $fd_write (;2;) (type 1) (param i32 i32 i32 i32) (result i32)
      (local i32)
      block ;; label = @1
        block ;; label = @2
          local.get 0
          i32.const -3
          i32.add
          i32.const -2
          i32.lt_u
          br_if 0 (;@2;)
          i32.const 0
          local.set 4
          block ;; label = @3
            block ;; label = @4
              local.get 2
              i32.eqz
              br_if 0 (;@4;)
              loop ;; label = @5
                local.get 1
                i32.const 4
                i32.add
                i32.load
                local.tee 4
                br_if 2 (;@3;)
                local.get 1
                i32.const 8
                i32.add
                local.set 1
                local.get 2
                i32.const -1
                i32.add
                local.tee 2
                br_if 0 (;@5;)
              end
              i32.const 0
              local.set 4
            end
            local.get 3
            local.get 4
            i32.store
            i32.const 0
            return
          end
          local.get 1
          i32.load
          local.set 1
          local.get 0
          i32.const 1
          i32.eq
          br_if 1 (;@1;)
          local.get 1
          local.get 4
          call $_ZN22wasi_snapshot_preview18testwasi7log_err10wit_import17hd4c9c922014b0486E
          local.get 3
          local.get 4
          i32.store
          i32.const 0
          return
        end
        unreachable
        unreachable
      end
      local.get 1
      local.get 4
      call $_ZN22wasi_snapshot_preview18testwasi3log10wit_import17h5ccb982eb99a6e9cE
      local.get 3
      local.get 4
      i32.store
      i32.const 0
    )
    (func $fd_seek (;3;) (type 2) (param i32 i64 i32 i32) (result i32)
      unreachable
      unreachable
    )
    (func $fd_close (;4;) (type 3) (param i32) (result i32)
      unreachable
      unreachable
    )
    (export "fd_write" (func $fd_write))
    (export "fd_seek" (func $fd_seek))
    (export "fd_close" (func $fd_close))
    (@producers
      (language "Rust" "")
      (processed-by "rustc" "1.72.0-nightly (d9c13cd45 2023-07-05)")
    )
  )
  (core module (;2;)
    (type (;0;) (func (param i32)))
    (type (;1;) (func (param i32 i32 i32)))
    (type (;2;) (func (param i32 i32 i32 i32 i32 i32)))
    (type (;3;) (func (param i32 i32)))
    (type (;4;) (func (param i32) (result i32)))
    (type (;5;) (func (param i32 i64 i32 i32) (result i32)))
    (type (;6;) (func (param i32 i32 i32 i32) (result i32)))
    (func $indirect-test:records/test-multiple-results (;0;) (type 0) (param i32)
      local.get 0
      i32.const 0
      call_indirect (type 0)
    )
    (func $indirect-test:records/test-swap-tuple (;1;) (type 1) (param i32 i32 i32)
      local.get 0
      local.get 1
      local.get 2
      i32.const 1
      call_indirect (type 1)
    )
    (func $indirect-test:records/test-roundtrip-flags3 (;2;) (type 2) (param i32 i32 i32 i32 i32 i32)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      local.get 4
      local.get 5
      i32.const 2
      call_indirect (type 2)
    )
    (func $indirect-test:records/test-roundtrip-record1 (;3;) (type 1) (param i32 i32 i32)
      local.get 0
      local.get 1
      local.get 2
      i32.const 3
      call_indirect (type 1)
    )
    (func $indirect-testwasi-log (;4;) (type 3) (param i32 i32)
      local.get 0
      local.get 1
      i32.const 4
      call_indirect (type 3)
    )
    (func $indirect-testwasi-log-err (;5;) (type 3) (param i32 i32)
      local.get 0
      local.get 1
      i32.const 5
      call_indirect (type 3)
    )
    (func $adapt-wasi_snapshot_preview1-fd_close (;6;) (type 4) (param i32) (result i32)
      local.get 0
      i32.const 6
      call_indirect (type 4)
    )
    (func $adapt-wasi_snapshot_preview1-fd_seek (;7;) (type 5) (param i32 i64 i32 i32) (result i32)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      i32.const 7
      call_indirect (type 5)
    )
    (func $adapt-wasi_snapshot_preview1-fd_write (;8;) (type 6) (param i32 i32 i32 i32) (result i32)
      local.get 0
      local.get 1
      local.get 2
      local.get 3
      i32.const 8
      call_indirect (type 6)
    )
    (table (;0;) 9 9 funcref)
    (export "0" (func $indirect-test:records/test-multiple-results))
    (export "1" (func $indirect-test:records/test-swap-tuple))
    (export "2" (func $indirect-test:records/test-roundtrip-flags3))
    (export "3" (func $indirect-test:records/test-roundtrip-record1))
    (export "4" (func $indirect-testwasi-log))
    (export "5" (func $indirect-testwasi-log-err))
    (export "6" (func $adapt-wasi_snapshot_preview1-fd_close))
    (export "7" (func $adapt-wasi_snapshot_preview1-fd_seek))
    (export "8" (func $adapt-wasi_snapshot_preview1-fd_write))
    (export "$imports" (table 0))
    (@producers
      (processed-by "wit-component" "0.13.1")
    )
  )
  (core module (;3;)
    (type (;0;) (func (param i32)))
    (type (;1;) (func (param i32 i32 i32)))
    (type (;2;) (func (param i32 i32 i32 i32 i32 i32)))
    (type (;3;) (func (param i32 i32)))
    (type (;4;) (func (param i32) (result i32)))
    (type (;5;) (func (param i32 i64 i32 i32) (result i32)))
    (type (;6;) (func (param i32 i32 i32 i32) (result i32)))
    (import "" "0" (func (;0;) (type 0)))
    (import "" "1" (func (;1;) (type 1)))
    (import "" "2" (func (;2;) (type 2)))
    (import "" "3" (func (;3;) (type 1)))
    (import "" "4" (func (;4;) (type 3)))
    (import "" "5" (func (;5;) (type 3)))
    (import "" "6" (func (;6;) (type 4)))
    (import "" "7" (func (;7;) (type 5)))
    (import "" "8" (func (;8;) (type 6)))
    (import "" "$imports" (table (;0;) 9 9 funcref))
    (elem (;0;) (i32.const 0) func 0 1 2 3 4 5 6 7 8)
    (@producers
      (processed-by "wit-component" "0.13.1")
    )
  )
  (core instance (;0;) (instantiate 2))
  (alias core export 0 "0" (core func (;0;)))
  (alias core export 0 "1" (core func (;1;)))
  (alias export 0 "roundtrip-flags1" (func (;0;)))
  (core func (;2;) (canon lower (func 0)))
  (alias export 0 "roundtrip-flags2" (func (;1;)))
  (core func (;3;) (canon lower (func 1)))
  (alias core export 0 "2" (core func (;4;)))
  (alias core export 0 "3" (core func (;5;)))
  (alias export 0 "tuple1" (func (;2;)))
  (core func (;6;) (canon lower (func 2)))
  (core instance (;1;)
    (export "multiple-results" (func 0))
    (export "swap-tuple" (func 1))
    (export "roundtrip-flags1" (func 2))
    (export "roundtrip-flags2" (func 3))
    (export "roundtrip-flags3" (func 4))
    (export "roundtrip-record1" (func 5))
    (export "tuple1" (func 6))
  )
  (alias core export 0 "6" (core func (;7;)))
  (alias core export 0 "7" (core func (;8;)))
  (alias core export 0 "8" (core func (;9;)))
  (core instance (;2;)
    (export "fd_close" (func 7))
    (export "fd_seek" (func 8))
    (export "fd_write" (func 9))
  )
  (core instance (;3;) (instantiate 0
      (with "test:records/test" (instance 1))
      (with "wasi_snapshot_preview1" (instance 2))
    )
  )
  (alias core export 3 "memory" (core memory (;0;)))
  (alias core export 3 "cabi_realloc" (core func (;10;)))
  (core instance (;4;)
    (export "memory" (memory 0))
  )
  (alias core export 0 "4" (core func (;11;)))
  (alias core export 0 "5" (core func (;12;)))
  (core instance (;5;)
    (export "log" (func 11))
    (export "log-err" (func 12))
  )
  (core instance (;6;) (instantiate 1
      (with "env" (instance 4))
      (with "testwasi" (instance 5))
    )
  )
  (alias core export 0 "$imports" (core table (;0;)))
  (alias export 0 "multiple-results" (func (;3;)))
  (core func (;13;) (canon lower (func 3) (memory 0)))
  (alias export 0 "swap-tuple" (func (;4;)))
  (core func (;14;) (canon lower (func 4) (memory 0)))
  (alias export 0 "roundtrip-flags3" (func (;5;)))
  (core func (;15;) (canon lower (func 5) (memory 0)))
  (alias export 0 "roundtrip-record1" (func (;6;)))
  (core func (;16;) (canon lower (func 6) (memory 0)))
  (alias export 1 "log" (func (;7;)))
  (core func (;17;) (canon lower (func 7) (memory 0)))
  (alias export 1 "log-err" (func (;8;)))
  (core func (;18;) (canon lower (func 8) (memory 0)))
  (alias core export 6 "fd_close" (core func (;19;)))
  (alias core export 6 "fd_seek" (core func (;20;)))
  (alias core export 6 "fd_write" (core func (;21;)))
  (core instance (;7;)
    (export "$imports" (table 0))
    (export "0" (func 13))
    (export "1" (func 14))
    (export "2" (func 15))
    (export "3" (func 16))
    (export "4" (func 17))
    (export "5" (func 18))
    (export "6" (func 19))
    (export "7" (func 20))
    (export "8" (func 21))
  )
  (core instance (;8;) (instantiate 3
      (with "" (instance 7))
    )
  )
  (type (;2;) (func (result "a" u8) (result "b" u16)))
  (alias core export 3 "test:records/test#multiple-results" (core func (;22;)))
  (func (;9;) (type 2) (canon lift (core func 22) (memory 0)))
  (type (;3;) (tuple u8 u32))
  (type (;4;) (tuple u32 u8))
  (type (;5;) (func (param "a" 3) (result 4)))
  (alias core export 3 "test:records/test#swap-tuple" (core func (;23;)))
  (func (;10;) (type 5) (canon lift (core func 23) (memory 0)))
  (type (;6;) (flags "a" "b"))
  (type (;7;) (func (param "a" 6) (result 6)))
  (alias core export 3 "test:records/test#roundtrip-flags1" (core func (;24;)))
  (func (;11;) (type 7) (canon lift (core func 24)))
  (type (;8;) (flags "c" "d" "e"))
  (type (;9;) (func (param "a" 8) (result 8)))
  (alias core export 3 "test:records/test#roundtrip-flags2" (core func (;25;)))
  (func (;12;) (type 9) (canon lift (core func 25)))
  (type (;10;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7"))
  (type (;11;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7" "b8" "b9" "b10" "b11" "b12" "b13" "b14" "b15"))
  (type (;12;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7" "b8" "b9" "b10" "b11" "b12" "b13" "b14" "b15" "b16" "b17" "b18" "b19" "b20" "b21" "b22" "b23" "b24" "b25" "b26" "b27" "b28" "b29" "b30" "b31"))
  (type (;13;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7" "b8" "b9" "b10" "b11" "b12" "b13" "b14" "b15" "b16" "b17" "b18" "b19" "b20" "b21" "b22" "b23" "b24" "b25" "b26" "b27" "b28" "b29" "b30" "b31" "b32" "b33" "b34" "b35" "b36" "b37" "b38" "b39" "b40" "b41" "b42" "b43" "b44" "b45" "b46" "b47" "b48" "b49" "b50" "b51" "b52" "b53" "b54" "b55" "b56" "b57" "b58" "b59" "b60" "b61" "b62" "b63"))
  (type (;14;) (func (param "a" 10) (param "b" 11) (param "c" 12) (param "d" 13) (result "f8" 10) (result "f16" 11) (result "f32" 12) (result "f64" 13)))
  (alias core export 3 "test:records/test#roundtrip-flags3" (core func (;26;)))
  (func (;13;) (type 14) (canon lift (core func 26) (memory 0)))
  (type (;15;) (record (field "a" u8) (field "b" 6)))
  (type (;16;) (func (param "a" 15) (result 15)))
  (alias core export 3 "test:records/test#roundtrip-record1" (core func (;27;)))
  (func (;14;) (type 16) (canon lift (core func 27) (memory 0)))
  (type (;17;) (tuple u8))
  (type (;18;) (func (param "a" 17) (result 17)))
  (alias core export 3 "test:records/test#tuple1" (core func (;28;)))
  (func (;15;) (type 18) (canon lift (core func 28)))
  (component (;0;)
    (type (;0;) (func (result "a" u8) (result "b" u16)))
    (import "import-func-multiple-results" (func (;0;) (type 0)))
    (type (;1;) (tuple u8 u32))
    (type (;2;) (tuple u32 u8))
    (type (;3;) (func (param "a" 1) (result 2)))
    (import "import-func-swap-tuple" (func (;1;) (type 3)))
    (type (;4;) (flags "a" "b"))
    (import "import-type-f1" (type (;5;) (eq 4)))
    (type (;6;) (func (param "a" 5) (result 5)))
    (import "import-func-roundtrip-flags1" (func (;2;) (type 6)))
    (type (;7;) (flags "c" "d" "e"))
    (import "import-type-f2" (type (;8;) (eq 7)))
    (type (;9;) (func (param "a" 8) (result 8)))
    (import "import-func-roundtrip-flags2" (func (;3;) (type 9)))
    (type (;10;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7"))
    (import "import-type-flag8" (type (;11;) (eq 10)))
    (type (;12;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7" "b8" "b9" "b10" "b11" "b12" "b13" "b14" "b15"))
    (import "import-type-flag16" (type (;13;) (eq 12)))
    (type (;14;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7" "b8" "b9" "b10" "b11" "b12" "b13" "b14" "b15" "b16" "b17" "b18" "b19" "b20" "b21" "b22" "b23" "b24" "b25" "b26" "b27" "b28" "b29" "b30" "b31"))
    (import "import-type-flag32" (type (;15;) (eq 14)))
    (type (;16;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7" "b8" "b9" "b10" "b11" "b12" "b13" "b14" "b15" "b16" "b17" "b18" "b19" "b20" "b21" "b22" "b23" "b24" "b25" "b26" "b27" "b28" "b29" "b30" "b31" "b32" "b33" "b34" "b35" "b36" "b37" "b38" "b39" "b40" "b41" "b42" "b43" "b44" "b45" "b46" "b47" "b48" "b49" "b50" "b51" "b52" "b53" "b54" "b55" "b56" "b57" "b58" "b59" "b60" "b61" "b62" "b63"))
    (import "import-type-flag64" (type (;17;) (eq 16)))
    (type (;18;) (func (param "a" 11) (param "b" 13) (param "c" 15) (param "d" 17) (result "f8" 11) (result "f16" 13) (result "f32" 15) (result "f64" 17)))
    (import "import-func-roundtrip-flags3" (func (;4;) (type 18)))
    (type (;19;) (record (field "a" u8) (field "b" 5)))
    (import "import-type-r1" (type (;20;) (eq 19)))
    (type (;21;) (func (param "a" 20) (result 20)))
    (import "import-func-roundtrip-record1" (func (;5;) (type 21)))
    (type (;22;) (tuple u8))
    (type (;23;) (func (param "a" 22) (result 22)))
    (import "import-func-tuple1" (func (;6;) (type 23)))
    (type (;24;) (flags "a" "b"))
    (export (;25;) "f1" (type 24))
    (type (;26;) (flags "c" "d" "e"))
    (export (;27;) "f2" (type 26))
    (type (;28;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7"))
    (export (;29;) "flag8" (type 28))
    (type (;30;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7" "b8" "b9" "b10" "b11" "b12" "b13" "b14" "b15"))
    (export (;31;) "flag16" (type 30))
    (type (;32;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7" "b8" "b9" "b10" "b11" "b12" "b13" "b14" "b15" "b16" "b17" "b18" "b19" "b20" "b21" "b22" "b23" "b24" "b25" "b26" "b27" "b28" "b29" "b30" "b31"))
    (export (;33;) "flag32" (type 32))
    (type (;34;) (flags "b0" "b1" "b2" "b3" "b4" "b5" "b6" "b7" "b8" "b9" "b10" "b11" "b12" "b13" "b14" "b15" "b16" "b17" "b18" "b19" "b20" "b21" "b22" "b23" "b24" "b25" "b26" "b27" "b28" "b29" "b30" "b31" "b32" "b33" "b34" "b35" "b36" "b37" "b38" "b39" "b40" "b41" "b42" "b43" "b44" "b45" "b46" "b47" "b48" "b49" "b50" "b51" "b52" "b53" "b54" "b55" "b56" "b57" "b58" "b59" "b60" "b61" "b62" "b63"))
    (export (;35;) "flag64" (type 34))
    (type (;36;) (record (field "a" u8) (field "b" 25)))
    (export (;37;) "r1" (type 36))
    (type (;38;) (func (result "a" u8) (result "b" u16)))
    (export (;7;) "multiple-results" (func 0) (func (type 38)))
    (type (;39;) (tuple u8 u32))
    (type (;40;) (tuple u32 u8))
    (type (;41;) (func (param "a" 39) (result 40)))
    (export (;8;) "swap-tuple" (func 1) (func (type 41)))
    (type (;42;) (func (param "a" 25) (result 25)))
    (export (;9;) "roundtrip-flags1" (func 2) (func (type 42)))
    (type (;43;) (func (param "a" 27) (result 27)))
    (export (;10;) "roundtrip-flags2" (func 3) (func (type 43)))
    (type (;44;) (func (param "a" 29) (param "b" 31) (param "c" 33) (param "d" 35) (result "f8" 29) (result "f16" 31) (result "f32" 33) (result "f64" 35)))
    (export (;11;) "roundtrip-flags3" (func 4) (func (type 44)))
    (type (;45;) (func (param "a" 37) (result 37)))
    (export (;12;) "roundtrip-record1" (func 5) (func (type 45)))
    (type (;46;) (tuple u8))
    (type (;47;) (func (param "a" 46) (result 46)))
    (export (;13;) "tuple1" (func 6) (func (type 47)))
  )
  (instance (;2;) (instantiate 0
      (with "import-func-multiple-results" (func 9))
      (with "import-func-swap-tuple" (func 10))
      (with "import-func-roundtrip-flags1" (func 11))
      (with "import-func-roundtrip-flags2" (func 12))
      (with "import-func-roundtrip-flags3" (func 13))
      (with "import-func-roundtrip-record1" (func 14))
      (with "import-func-tuple1" (func 15))
      (with "import-type-f1" (type 6))
      (with "import-type-f2" (type 8))
      (with "import-type-flag8" (type 10))
      (with "import-type-flag16" (type 11))
      (with "import-type-flag32" (type 12))
      (with "import-type-flag64" (type 13))
      (with "import-type-r1" (type 15))
    )
  )
  (export (;3;) (interface "test:records/test") (instance 2))
  (type (;19;) (func))
  (alias core export 3 "test-imports" (core func (;29;)))
  (func (;16;) (type 19) (canon lift (core func 29)))
  (export (;17;) "test-imports" (func 16))
  (@producers
    (processed-by "wit-component" "0.13.1")
  )
)