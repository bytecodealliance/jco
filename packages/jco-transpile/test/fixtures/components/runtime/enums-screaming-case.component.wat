(component
  (core module $identity
    (func (export "roundtrip") (param i32) (result i32)
      local.get 0)
  )
  (core instance $identity (instantiate $identity))

  (type $status (enum "value-a" "http-error"))
  (type $roundtrip-type
    (func (param "value" $status) (result $status)))
  (func $roundtrip (type $roundtrip-type)
    (canon lift (core func $identity "roundtrip")))

  ;; Adapt the internal function and type into a named interface export. This
  ;; is the same type-export pattern emitted by wit-component.
  (component $api-adapter
    (type $import-status (enum "value-a" "http-error"))
    (import "import-type-status" (type $import-status-eq (eq $import-status)))
    (type $import-roundtrip-type
      (func (param "value" $import-status-eq) (result $import-status-eq)))
    (import "import-func-roundtrip" (func $import-roundtrip (type $import-roundtrip-type)))

    (type $export-status (enum "value-a" "http-error"))
    (export "status" (type $export-status))
    (type $export-roundtrip-type (func (param "value" 4) (result 4)))
    (export "roundtrip" (func $import-roundtrip) (func (type $export-roundtrip-type)))
  )

  (instance $api (instantiate $api-adapter
    (with "import-type-status" (type $status))
    (with "import-func-roundtrip" (func $roundtrip))
  ))
  (export "api" (instance $api))
)
