(component
  (type $filesystem
    (instance
      (export "descriptor" (type $descriptor (sub resource)))
      (type $descriptor-borrow (borrow $descriptor))
      (type $open-at-result (result u32 (error u32)))
      (type $open-at
        (func async
          (param "self" $descriptor-borrow)
          (param "path-flags" u32)
          (param "path" string)
          (param "open-flags" u32)
          (param "descriptor-flags" u32)
          (result $open-at-result)
        )
      )
      (export "[method]descriptor.open-at" (func (type $open-at)))
    )
  )
  (import "test:filesystem/types" (instance $filesystem-import (type $filesystem)))
  (alias export $filesystem-import "[method]descriptor.open-at" (func $open-at))

  (core module $memory-module
    (memory (export "memory") 1)
  )
  (core instance $memory-instance (instantiate $memory-module))

  ;; The interface function is async, but the guest deliberately lowers it
  ;; with the sync ABI. Its core type is therefore six flat arguments plus a
  ;; trailing result pointer, rather than the async argument-buffer ABI.
  (core func $lowered-open-at
    (canon lower (func $open-at)
      (memory $memory-instance "memory")
      string-encoding=utf8
    )
  )

  (core module $guest
    (import "host" "open-at"
      (func (param i32 i32 i32 i32 i32 i32 i32))
    )
  )
  (core instance $host
    (export "open-at" (func $lowered-open-at))
  )
  (core instance (instantiate $guest (with "host" (instance $host))))
)
