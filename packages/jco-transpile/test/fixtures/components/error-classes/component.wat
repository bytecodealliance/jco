(component
  (core module (;0;)
    (type (;0;) (func (param i32) (result i32)))
    (memory (;0;) 1)
    (export "memory" (memory 0))
    (export "test:error-classes/failures#check" (func 0))
    (export "test:error-classes/failures#recheck" (func 1))
    (export "test:error-classes/failures#parse" (func 2))
    (func (;0;) (type 0) (param i32) (result i32)
      i32.const 16
      local.get 0
      i32.store8
      i32.const 20
      i32.const 1
      i32.const 42
      local.get 0
      select
      i32.store
      i32.const 16
    )
    (func (;1;) (type 0) (param i32) (result i32)
      i32.const 32
      local.get 0
      i32.store8
      i32.const 33
      i32.const 0
      i32.store8
      i32.const 32
    )
    (func (;2;) (type 0) (param i32) (result i32)
      i32.const 40
      local.get 0
      i32.store8
      local.get 0
      if ;; label = @1
        i32.const 44
        i32.const 64
        i32.store
        i32.const 48
        i32.const 9
        i32.store
      else
        i32.const 44
        i32.const 7
        i32.store
      end
      i32.const 40
    )
    (data (;0;) (i32.const 64) "bad input")
  )
  (type (;0;) (enum "not-found" "denied"))
  (core instance (;0;) (instantiate 0))
  (alias core export 0 "memory" (core memory (;0;)))
  (type (;1;) (result u32 (error 0)))
  (type (;2;) (func (param "fail" bool) (result 1)))
  (alias core export 0 "test:error-classes/failures#check" (core func (;0;)))
  (func (;0;) (type 2) (canon lift (core func 0) (memory 0)))
  (type (;3;) (result (error 0)))
  (type (;4;) (func (param "fail" bool) (result 3)))
  (alias core export 0 "test:error-classes/failures#recheck" (core func (;1;)))
  (func (;1;) (type 4) (canon lift (core func 1) (memory 0)))
  (type (;5;) (result u32 (error string)))
  (type (;6;) (func (param "fail" bool) (result 5)))
  (alias core export 0 "test:error-classes/failures#parse" (core func (;2;)))
  (func (;2;) (type 6) (canon lift (core func 2) (memory 0) string-encoding=utf8))
  (component (;0;)
    (type (;0;) (enum "not-found" "denied"))
    (import "import-type-error-code" (type (;1;) (eq 0)))
    (type (;2;) (result u32 (error 1)))
    (type (;3;) (func (param "fail" bool) (result 2)))
    (import "import-func-check" (func (;0;) (type 3)))
    (type (;4;) (result (error 1)))
    (type (;5;) (func (param "fail" bool) (result 4)))
    (import "import-func-recheck" (func (;1;) (type 5)))
    (type (;6;) (result u32 (error string)))
    (type (;7;) (func (param "fail" bool) (result 6)))
    (import "import-func-parse" (func (;2;) (type 7)))
    (type (;8;) (enum "not-found" "denied"))
    (export (;9;) "error-code" (type 8))
    (type (;10;) (result u32 (error 9)))
    (type (;11;) (func (param "fail" bool) (result 10)))
    (export (;3;) "check" (func 0) (func (type 11)))
    (type (;12;) (result (error 9)))
    (type (;13;) (func (param "fail" bool) (result 12)))
    (export (;4;) "recheck" (func 1) (func (type 13)))
    (type (;14;) (result u32 (error string)))
    (type (;15;) (func (param "fail" bool) (result 14)))
    (export (;5;) "parse" (func 2) (func (type 15)))
  )
  (instance (;0;) (instantiate 0
      (with "import-func-check" (func 0))
      (with "import-func-recheck" (func 1))
      (with "import-func-parse" (func 2))
      (with "import-type-error-code" (type 0))
    )
  )
  (export (;1;) "test:error-classes/failures" (instance 0))
)
