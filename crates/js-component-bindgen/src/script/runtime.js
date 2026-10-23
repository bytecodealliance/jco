// Runtime shared by every generated script engine bootstrap module.
//
// Scripts are ES modules. Neither StarlingMonkey nor QuickJS can import a module from a string
// once the engine has been pre-initialized, so `load` rewrites the module's top-level `import`
// and `export` declarations into plain code and evaluates the result with `new Function`.
// Rolldown, which `jco componentize --script-only` bundles with, hoists every import (and
// `export * from`) to the top of the module and collects every export into one trailing
// `export { ... };` statement, so the rewrite only has to recognise those two blocks.
//
// Exported resources are classes the engine captured at initialization, so a script's own
// class is spliced into the prototype chain beneath the engine's class: instances then pass
// the engine's `instanceof` checks while the engine's method stubs forward to the script.

let $script = null;

const $IDENT = "[A-Za-z_$][\\w$]*";
const $STRING = "\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'";
const $IMPORT = new RegExp(
  `^import\\s*(?:(${$STRING})|(?:(${$IDENT})\\s*,?\\s*)?(?:\\*\\s*as\\s+(${$IDENT})|\\{([^}]*)\\})?\\s*from\\s*(${$STRING}))\\s*;?`,
);
const $EXPORT_ALL = new RegExp(`^export\\s*\\*\\s*from\\s*(${$STRING})\\s*;?`);
const $EXPORT_LIST = /(^|\n)export\s*\{([^}]*)\}\s*;?\s*$/;

function $import(specifier) {
  const module = $modules.get(specifier);
  if (module === undefined) {
    throw new Error(
      `"${specifier}" is not imported by the engine world; available imports: ${
        [...$modules.keys()].map((key) => `"${key}"`).join(", ") || "(none)"
      }`,
    );
  }
  return module;
}

/** Present an engine import as a module namespace with a `default` export, as both engines do. */
function $namespace(module) {
  const namespace = Object.create(null);
  for (const key of Object.keys(module)) {
    Object.defineProperty(namespace, key, { get: () => module[key], enumerable: true });
  }
  if (!("default" in namespace)) {
    Object.defineProperty(namespace, "default", { value: namespace, enumerable: true });
  }
  return namespace;
}

/** Skip whitespace and comments starting at `pos`. */
function $skipTrivia(source, pos) {
  for (;;) {
    while (pos < source.length && /\s/.test(source[pos])) {
      pos++;
    }
    if (source.startsWith("//", pos)) {
      const end = source.indexOf("\n", pos);
      pos = end === -1 ? source.length : end + 1;
    } else if (source.startsWith("/*", pos)) {
      const end = source.indexOf("*/", pos + 2);
      pos = end === -1 ? source.length : end + 2;
    } else {
      return pos;
    }
  }
}

/** Parse `name`, `name as alias` or `"string" as alias` entries of an import or export list. */
function $bindings(list) {
  return list
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const match = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Za-z_$][\w$]*)(?:\s+as\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Za-z_$][\w$]*))?$/.exec(entry);
      if (match === null) {
        throw new SyntaxError(`unsupported import or export entry "${entry}"`);
      }
      return { name: $unquote(match[1]), alias: $unquote(match[2] ?? match[1]) };
    });
}

function $unquote(literal) {
  if (literal.startsWith('"')) {
    return JSON.parse(literal);
  }
  if (literal.startsWith("'")) {
    return JSON.parse(`"${literal.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"`);
  }
  return literal;
}

/** Rewrite an ES module into a function body taking `$import` and `$exports`. */
function $rewrite(source) {
  let prelude = "";
  let pos = 0;
  for (;;) {
    pos = $skipTrivia(source, pos);
    const rest = source.slice(pos);
    let match = $IMPORT.exec(rest);
    if (match !== null) {
      const [, bare, defaultName, namespaceName, named, from] = match;
      const specifier = JSON.stringify($unquote(bare ?? from));
      prelude += `$import(${specifier});\n`;
      if (defaultName !== undefined) {
        prelude += `const ${defaultName} = $import(${specifier}).default;\n`;
      }
      if (namespaceName !== undefined) {
        prelude += `const ${namespaceName} = $import(${specifier});\n`;
      }
      if (named !== undefined) {
        for (const { name, alias } of $bindings(named)) {
          prelude += `const ${alias} = $import(${specifier})[${JSON.stringify(name)}];\n`;
        }
      }
      pos += match[0].length;
      continue;
    }
    match = $EXPORT_ALL.exec(rest);
    if (match !== null) {
      prelude += `$exportAll($exports, $import(${JSON.stringify($unquote(match[1]))}));\n`;
      pos += match[0].length;
      continue;
    }
    break;
  }

  let body = source.slice(pos);
  let epilogue = "";
  const exports = $EXPORT_LIST.exec(body);
  if (exports !== null) {
    body = body.slice(0, exports.index);
    for (const { name, alias } of $bindings(exports[2])) {
      epilogue += `Object.defineProperty($exports, ${JSON.stringify(alias)}, { get: () => ${name}, enumerable: true });\n`;
    }
  }
  return `${prelude}${body}\n${epilogue}`;
}

function $exportAll(exports, module) {
  for (const key of Object.keys(module)) {
    if (key !== "default" && !Object.hasOwn(exports, key)) {
      Object.defineProperty(exports, key, { get: () => module[key], enumerable: true });
    }
  }
}

function $exports() {
  if ($script === null) {
    throw new Error(
      "no script is loaded; call jco:script-engine/script-loader.load before using the engine's exports",
    );
  }
  return $script.exports;
}

function $resolve(path) {
  let value = $exports();
  for (const segment of path) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[segment];
  }
  return value;
}

function $lookup(path) {
  const value = $resolve(path);
  if (typeof value !== "function") {
    throw new Error(`script "${$script.name}" does not export "${path.join(".")}"`);
  }
  return value;
}

function $method(path, engineClass, name) {
  let proto = $lookup(path).prototype;
  while (proto !== null && proto !== undefined && proto !== engineClass.prototype) {
    if (Object.hasOwn(proto, name)) {
      return proto[name];
    }
    proto = Object.getPrototypeOf(proto);
  }
  throw new Error(`script "${$script.name}" does not implement "${path.join(".")}.${name}"`);
}

function $link(path, engineClass) {
  const scriptClass = $resolve(path);
  if (typeof scriptClass !== "function" || scriptClass === engineClass) {
    return;
  }
  let proto = scriptClass.prototype;
  if (proto === null || typeof proto !== "object") {
    return;
  }
  for (;;) {
    const parent = Object.getPrototypeOf(proto);
    if (parent === null || parent === Object.prototype || parent === engineClass.prototype) {
      break;
    }
    proto = parent;
  }
  if (Object.getPrototypeOf(proto) !== engineClass.prototype) {
    Object.setPrototypeOf(proto, engineClass.prototype);
  }
}

const $scriptLoader = {
  load(name, source) {
    let evaluate;
    try {
      evaluate = new Function("$import", "$exports", "$exportAll", $rewrite(source));
    } catch (error) {
      throw `failed to parse script "${name}": ${error}. Scripts must be ES modules as bundled by \`jco componentize --script-only\`: imports at the top, one export list at the end, no top-level await.`;
    }
    const exports = Object.create(null);
    try {
      evaluate($import, exports, $exportAll);
    } catch (error) {
      throw `failed to evaluate script "${name}": ${error}`;
    }
    $script = { name, exports };
    try {
      $linkResources();
    } catch (error) {
      $script = null;
      throw `failed to link resources of script "${name}": ${error}`;
    }
  },
  unload() {
    $script = null;
  },
  loaded() {
    return $script === null ? undefined : $script.name;
  },
};
