/** Default provider: importing node:sqlite grants no database or filesystem authority. */
function denied(): never {
  throw {
    name: "Error",
    code: "ERR_JCO_SQLITE_ADAPTER_REQUIRED",
    message: "node:sqlite requires an explicit jco:node/sqlite host provider.",
  };
}
export const openDatabase = denied;
export const backup = denied;
// Resource exports are required by generated bindings, but denial creates no resources.
export class Database {
  constructor() {
    denied();
  }
}
export class Statement {
  constructor() {
    denied();
  }
}
export class Cursor {
  constructor() {
    denied();
  }
}
export class Session {
  constructor() {
    denied();
  }
}
export class TagStore {
  constructor() {
    denied();
  }
}
