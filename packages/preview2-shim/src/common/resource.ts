/**
 * Base constructor for shim-owned WIT resources. A derived class gets its own
 * method prototype whose parent is ResourceBase.prototype (null). Construction
 * still uses new.target.prototype, including for resources with private fields.
 */
function ResourceBase() {}
ResourceBase.prototype = null;

// Resource constructors also resolve static members through this base.
export const WasiResource: new () => object = Object.setPrototypeOf(ResourceBase, null);
