;; `thread.resume-later` and `thread.new-indirect` trap on invalid indices, and
;; such a trap poisons the instance like any other built-in trap.

(component definition $ResumeUnknown
  (core module $M
    (import "" "thread.resume-later" (func $thread.resume-later (param i32)))
    (func (export "resume-unknown") (call $thread.resume-later (i32.const 1234)))
    (func (export "resume-zero") (call $thread.resume-later (i32.const 0)))
  )
  (canon thread.resume-later (core func $thread.resume-later))
  (core instance $m (instantiate $M (with "" (instance
    (export "thread.resume-later" (func $thread.resume-later))))))
  (func (export "resume-unknown") (canon lift (core func $m "resume-unknown")))
  (func (export "resume-zero") (canon lift (core func $m "resume-zero")))
)
(component instance $i $ResumeUnknown)
(assert_trap (invoke "resume-unknown") "unknown handle index 1234")
(assert_trap (invoke "resume-unknown") "cannot enter component instance")
(component instance $i $ResumeUnknown)
(assert_trap (invoke "resume-zero") "unknown handle index 0")
(assert_trap (invoke "resume-zero") "cannot enter component instance")

(component definition $NewIndirectInvalid
  (core module $Table
    (table (export "__indirect_function_table") 2 funcref))
  (core instance $table (instantiate $Table))
  (alias core export $table "__indirect_function_table" (core table $indirect-function-table))
  (core module $M
    (import "" "thread.new-indirect" (func $thread.new-indirect (param i32 i32) (result i32)))
    (import "" "__indirect_function_table" (table $t 2 funcref))
    (func $start (param i32))
    (elem (table $t) (i32.const 0) func $start)
    (func (export "new-out-of-bounds") (drop (call $thread.new-indirect (i32.const 2) (i32.const 0))))
    (func (export "new-negative") (drop (call $thread.new-indirect (i32.const -1) (i32.const 0))))
    (func (export "new-uninitialized") (drop (call $thread.new-indirect (i32.const 1) (i32.const 0))))
  )
  (core type $start-func-ty (func (param i32)))
  (core func $thread.new-indirect
    (canon thread.new-indirect $start-func-ty (core table $indirect-function-table)))
  (core instance $m (instantiate $M (with "" (instance
    (export "thread.new-indirect" (func $thread.new-indirect))
    (export "__indirect_function_table" (table $indirect-function-table))))))
  (func (export "new-out-of-bounds") (canon lift (core func $m "new-out-of-bounds")))
  (func (export "new-negative") (canon lift (core func $m "new-negative")))
  (func (export "new-uninitialized") (canon lift (core func $m "new-uninitialized")))
)
(component instance $j $NewIndirectInvalid)
(assert_trap (invoke "new-out-of-bounds") "table index out of bounds")
(assert_trap (invoke "new-out-of-bounds") "cannot enter component instance")
(component instance $j $NewIndirectInvalid)
(assert_trap (invoke "new-negative") "table index out of bounds")
(component instance $j $NewIndirectInvalid)
(assert_trap (invoke "new-uninitialized") "uninitialized table element")
(assert_trap (invoke "new-uninitialized") "cannot enter component instance")
