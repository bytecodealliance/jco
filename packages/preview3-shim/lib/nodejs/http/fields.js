import { HttpError } from "./error.js";

import * as http from "node:http";
const { validateHeaderName = () => {}, validateHeaderValue = () => {} } = http;

let FORBIDDEN_HEADERS = null;
export const _forbiddenHeaders = {
  get value() {
    return (FORBIDDEN_HEADERS ??= new Set(["connection", "keep-alive", "host"]));
  },
};

/**
 * Implements the WASI Preview3 fields resource for HTTP headers and trailers
 */
export class Fields {
  #immutable = false;
  /** @type {[string, Uint8Array][]} */
  #entries = [];
  /** @type {Map<string, [string, Uint8Array[]][]>} */
  #table = new Map();

  /**
   * Constructs an empty HTTP Fields
   * WIT:
   * ```
   * constructor();
   * ```
   */
  constructor() {}

  /**
   * Constructs a Fields instance from a list of name-value pairs
   * WIT:
   * ```
   * from-list: static func(entries: list<tuple<field-name,field-value>>) -> result<fields, header-error>;
   * ```
   *
   * @param {[string, Uint8Array[]][]} entries - List of field name and value pairs
   * @returns {Fields} A new Fields instance
   * @throws {HttpError} With payload.tag 'invalid-syntax' if any name or value is invalid
   * @throws {HttpError} With payload.tag 'forbidden' if any name is forbidden
   */
  static fromList(entries) {
    const fields = new Fields();

    for (const [name, values] of entries) {
      for (const value of Array.isArray(values) ? values : [values]) {
        fields.append(name, value);
      }
    }
    return fields;
  }

  /**
   * Get all values for a given field name
   * WIT:
   * ```
   * get: func(name: field-name) -> list<field-value>;
   * ```
   *
   * @param {string} name - The field name to get values for
   * @returns {Uint8Array[]} List of values for the field
   */
  get(name) {
    const tableEntries = this.#table.get(name.toLowerCase());
    if (!tableEntries) {
      return [];
    }
    return tableEntries.flatMap(([, v]) => v);
  }

  /**
   * Check if a field name exists in the collection
   * WIT:
   * ```
   * has: func(name: field-name) -> bool;
   * ```
   *
   * @param {string} name - The field name to check
   * @returns {boolean} True if the field exists
   */
  has(name) {
    return this.#table.has(name.toLowerCase());
  }

  /**
   * Set values for a field name, replacing any existing values
   * WIT:
   * ```
   * set: func(name: field-name, value: list<field-value>) -> result<_, header-error>;
   * ```
   *
   * @param {string} name - The field name
   * @param {Uint8Array[]} values - The values to set
   * @throws {HttpError} With payload.tag 'immutable' if the fields are immutable
   * @throws {HttpError} With payload.tag 'invalid-syntax' if name or values are invalid
   * @throws {HttpError} With payload.tag 'forbidden' if name is forbidden
   */
  set(name, values) {
    this.#ensureMutable();

    this.#validateName(name);
    for (const value of values) {
      this.#validateValue(name, value);
    }

    const lowercased = name.toLowerCase();

    let bucket = this.#table.get(lowercased);
    if (bucket) {
      this.#entries = this.#entries.filter((e) => !bucket.includes(e));
      bucket.splice(0, bucket.length);
    } else {
      bucket = [];
      this.#table.set(lowercased, bucket);
    }

    for (const value of values) {
      const entry = [name, value];
      this.#entries.push(entry);
      this.#table.get(lowercased).push(entry);
    }
  }

  /**
   * Delete all values for a field name
   * WIT:
   * ```
   * delete: func(name: field-name) -> result<_, header-error>;
   * ```
   *
   * @param {string} name - The field name to delete
   * @throws {HttpError} With payload.tag 'immutable' if the fields are immutable
   */
  delete(name) {
    this.#ensureMutable();
    const lowercased = name.toLowerCase();
    const tableEntries = this.#table.get(lowercased);

    if (tableEntries) {
      this.#entries = this.#entries.filter((entry) => !tableEntries.includes(entry));
      this.#table.delete(lowercased);
    }
  }

  /**
   * Get all values for a field name and then delete them
   * WIT:
   * ```
   * get-and-delete: func(name: field-name) -> result<list<field-value>, header-error>;
   * ```
   *
   * @param {string} name - The field name to get and delete
   * @returns {Uint8Array[]} List of values that were deleted
   * @throws {HttpError} With payload.tag 'immutable' if the fields are immutable
   */
  getAndDelete(name) {
    this.#ensureMutable();

    const values = this.get(name);
    this.delete(name);
    return values;
  }

  /**
   * Append a value to a field name
   * WIT:
   * ```
   * append: func(name: field-name, value: field-value) -> result<_, header-error>;
   * ```
   *
   * @param {string} name - The field name
   * @param {Uint8Array} value - The value to append
   * @throws {HttpError} With payload.tag 'immutable' if the fields are immutable
   * @throws {HttpError} With payload.tag 'invalid-syntax' if name or value is invalid
   * @throws {HttpError} With payload.tag 'forbidden' if name is forbidden
   */
  append(name, value) {
    this.#ensureMutable();

    this.#validateName(name);
    this.#validateValue(name, value);

    const lowercased = name.toLowerCase();
    const entry = [name, value];
    this.#entries.push(entry);

    const tableEntries = this.#table.get(lowercased);
    if (tableEntries) {
      tableEntries.push(entry);
    } else {
      this.#table.set(lowercased, [entry]);
    }
  }

  /**
   * Get all entries as a list of name-value pairs
   * WIT:
   * ```
   * entries: func() -> list<tuple<field-name,field-value>>;
   * ```
   *
   * @returns {[string, Uint8Array][]} List of all entries
   */
  entries() {
    return this.#entries;
  }

  /**
   * Create a deep copy of this Fields instance
   * WIT:
   * ```
   * clone: func() -> fields;
   * ```
   *
   * @returns {Fields} A new mutable Fields instance with the same entries
   */
  clone() {
    const entries = this.#entries.slice();
    return _fieldsFromEntriesChecked(entries);
  }

  /**
   * Mark fields as immutable
   *
   * @param {Fields} fields - The Fields instance to mark as immutable
   * @returns {Fields} The same instance, now immutable
   */
  static _lock(fields) {
    fields.#immutable = true;
    return fields;
  }

  /**
   * Create a Fields instance from pre-validated entries
   *
   * @param {[string, Uint8Array][]} entries - Validated entries to use
   * @returns {Fields} A new Fields instance with the provided entries
   */
  static _fromEntriesChecked(entries) {
    const fields = new Fields();
    fields.#entries = entries;

    for (const entry of entries) {
      const lowercase = entry[0].toLowerCase();
      const existing = fields.#table.get(lowercase);

      if (existing) {
        existing.push(entry);
      } else {
        fields.#table.set(lowercase, [entry]);
      }
    }
    return fields;
  }

  #validateName(name) {
    try {
      validateHeaderName(name);
    } catch {
      throw new HttpError("invalid-syntax", `Invalid header name: ${name}`);
    }

    if (_forbiddenHeaders.value.has(name.toLowerCase())) {
      throw new HttpError("forbidden", `Header ${name} is forbidden`);
    }
  }

  #validateValue(name, value) {
    try {
      validateHeaderValue(name, new TextDecoder().decode(value));
    } catch {
      throw new HttpError("invalid-syntax", `Invalid header value for ${name}`);
    }
  }

  #ensureMutable() {
    if (this.#immutable) {
      throw new HttpError("immutable", "Cannot modify immutable fields");
    }
  }
}

export function _fieldsLock(fields) {
  return Fields._lock(fields);
}

export function _fieldsFromEntriesChecked(entries) {
  return Fields._fromEntriesChecked(entries);
}
