(component
  (core module $identity
    (func (export "roundtrip") (param i32) (result i32)
      local.get 0)
  )
  (core instance $identity (instantiate $identity))

  (type $permissions (flags
    "read" "write" "admin" "flag-3" "flag-4" "flag-5" "flag-6" "flag-7"
    "flag-8" "flag-9" "flag-10" "flag-11" "flag-12" "flag-13" "flag-14"
    "flag-15" "flag-16" "flag-17" "flag-18" "flag-19" "flag-20"
    "flag-21" "flag-22" "flag-23" "flag-24" "flag-25" "flag-26"
    "flag-27" "flag-28" "flag-29" "flag-30" "flag-31"))
  (type $roundtrip-type
    (func (param "value" $permissions) (result $permissions)))
  (func $roundtrip (type $roundtrip-type)
    (canon lift (core func $identity "roundtrip")))

  ;; Adapt the internal function and type into a named interface export. This
  ;; is the same type-export pattern emitted by wit-component.
  (component $api-adapter
    (type $import-permissions (flags
      "read" "write" "admin" "flag-3" "flag-4" "flag-5" "flag-6" "flag-7"
      "flag-8" "flag-9" "flag-10" "flag-11" "flag-12" "flag-13" "flag-14"
      "flag-15" "flag-16" "flag-17" "flag-18" "flag-19" "flag-20"
      "flag-21" "flag-22" "flag-23" "flag-24" "flag-25" "flag-26"
      "flag-27" "flag-28" "flag-29" "flag-30" "flag-31"))
    (import "import-type-permissions" (type $import-permissions-eq (eq $import-permissions)))
    (type $import-roundtrip-type
      (func (param "value" $import-permissions-eq) (result $import-permissions-eq)))
    (import "import-func-roundtrip" (func $import-roundtrip (type $import-roundtrip-type)))

    (type $export-permissions (flags
      "read" "write" "admin" "flag-3" "flag-4" "flag-5" "flag-6" "flag-7"
      "flag-8" "flag-9" "flag-10" "flag-11" "flag-12" "flag-13" "flag-14"
      "flag-15" "flag-16" "flag-17" "flag-18" "flag-19" "flag-20"
      "flag-21" "flag-22" "flag-23" "flag-24" "flag-25" "flag-26"
      "flag-27" "flag-28" "flag-29" "flag-30" "flag-31"))
    (export "permissions" (type $export-permissions))
    (type $export-roundtrip-type (func (param "value" 4) (result 4)))
    (export "roundtrip" (func $import-roundtrip) (func (type $export-roundtrip-type)))
  )

  (instance $api (instantiate $api-adapter
    (with "import-type-permissions" (type $permissions))
    (with "import-func-roundtrip" (func $roundtrip))
  ))
  (export "api" (instance $api))
)
