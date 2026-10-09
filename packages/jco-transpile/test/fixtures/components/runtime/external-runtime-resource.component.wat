(component
  (type $resource (resource (rep i32)))
  (core func $new (canon resource.new $resource))
  (core func $rep (canon resource.rep $resource))
  (core instance $intrinsics
    (export "new" (func $new))
    (export "rep" (func $rep))
  )
  (core module $module
    (import "intrinsics" "new" (func $new (param i32) (result i32)))
    (import "intrinsics" "rep" (func $rep (param i32) (result i32)))
    (func (export "run") (param i32) (result i32)
      local.get 0
      call $new
      call $rep
    )
    (func (export "invalid") (param i32) (result i32)
      local.get 0
      call $rep
    )
  )
  (core instance $instance (instantiate $module
    (with "intrinsics" (instance $intrinsics))
  ))
  (func (export "run") (param "value" u32) (result u32)
    (canon lift (core func $instance "run"))
  )
  (func (export "invalid") (param "handle" u32) (result u32)
    (canon lift (core func $instance "invalid"))
  )
)
