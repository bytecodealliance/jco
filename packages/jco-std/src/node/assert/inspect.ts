// Locally written, portable formatting helper guided by Node.js util.inspect
// behavior at v24.19.0. No Node.js implementation code is copied in this file.
// It intentionally implements only the subset needed by the assert shim.

function quote(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
  return `'${escaped}'`;
}

export function inspect(value: unknown, seen = new Set<object>(), depth = 0): string {
  switch (typeof value) {
    case "string":
      return quote(value);
    case "number":
      return Object.is(value, -0) ? "-0" : String(value);
    case "bigint":
      return `${value}n`;
    case "boolean":
    case "undefined":
      return String(value);
    case "symbol":
      return String(value);
    case "function":
      return `[Function: ${value.name || "anonymous"}]`;
  }
  if (value === null) {
    return "null";
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  if (depth > 20) {
    return "[Object]";
  }
  seen.add(value);
  try {
    if (value instanceof Date) {
      const time = value.getTime();
      return Number.isNaN(time) ? "Invalid Date" : value.toISOString();
    }
    if (value instanceof RegExp) {
      return String(value);
    }
    if (value instanceof Error) {
      return `${value.name}: ${value.message}`;
    }
    if (ArrayBuffer.isView(value)) {
      const name = value.constructor.name;
      if (value instanceof DataView) {
        return `DataView { byteLength: ${value.byteLength} }`;
      }
      return `${name}(${(value as unknown as { length: number }).length}) [ ${Array.from(
        value as unknown as ArrayLike<unknown>,
        (item) => inspect(item, seen, depth + 1),
      ).join(", ")} ]`;
    }
    if (value instanceof ArrayBuffer) {
      return `ArrayBuffer { byteLength: ${value.byteLength} }`;
    }
    if (value instanceof Map) {
      const entries = Array.from(
        value,
        ([key, item]) => `${inspect(key, seen, depth + 1)} => ${inspect(item, seen, depth + 1)}`,
      );
      return `Map(${value.size}) { ${entries.join(", ")} }`;
    }
    if (value instanceof Set) {
      return `Set(${value.size}) { ${Array.from(value, (item) => inspect(item, seen, depth + 1)).join(", ")} }`;
    }
    if (Array.isArray(value)) {
      const entries: string[] = [];
      for (let i = 0; i < value.length; i++) {
        entries.push(
          Object.hasOwn(value, i) ? inspect(value[i], seen, depth + 1) : "<1 empty item>",
        );
      }
      return `[ ${entries.join(", ")} ]`;
    }
    const ctor = Object.getPrototypeOf(value)?.constructor;
    const prefix = ctor && ctor !== Object ? `${ctor.name} ` : "";
    const keys = Reflect.ownKeys(value)
      .filter((key) => Object.prototype.propertyIsEnumerable.call(value, key))
      .sort((a, b) => String(a).localeCompare(String(b)));
    const entries = keys.map((key) => {
      const label =
        typeof key === "symbol"
          ? `[${String(key)}]`
          : /^[A-Za-z_$][\w$]*$/.test(key)
            ? key
            : quote(key);
      return `${label}: ${inspect((value as Record<PropertyKey, unknown>)[key], seen, depth + 1)}`;
    });
    return `${prefix}{ ${entries.join(", ")} }`;
  } finally {
    seen.delete(value);
  }
}
