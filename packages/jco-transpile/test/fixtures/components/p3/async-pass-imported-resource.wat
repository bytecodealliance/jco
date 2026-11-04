(component
  (import "test:data/blob" (instance $data
    (export "blob" (type (sub resource)))
  ))
  (alias export $data "blob" (type $blob))
  (core func $task_return (canon task.return (result (own $blob))))
  (core module $m
    (import "" "task.return" (func $ret (param i32)))
    (func (export "pass") (param i32) (result i32)
      local.get 0
      call $ret
      i32.const 0)
    (func (export "cb") (param i32 i32 i32) (result i32)
      i32.const 0)
  )
  (core instance $i (instantiate $m
    (with "" (instance (export "task.return" (func $task_return))))))
  (type $ft (func async (param "b" (own $blob)) (result (own $blob))))
  (func (export "pass") (type $ft)
    (canon lift (core func $i "pass") async (callback (core func $i "cb"))))
)
