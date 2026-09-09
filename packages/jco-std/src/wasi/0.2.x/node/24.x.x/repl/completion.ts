// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// Adapted from nodejs/node v24.20.0, commit
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/internal/repl/completion.js.
// Local changes: TypeScript types, ES intrinsics, acorn from npm rather than Node's vendored copy.
// A component has no filesystem or inspector, so file-path completion (`allowBlockingCompletions`)
// yields no entries, global lexical scope names are unavailable, and `isProxy` cannot be observed
// -- a proxy that hides its own property names is treated as an ordinary object.
// See ./README.md for runtime boundaries and the upstream dependency audit.

import * as acorn from "acorn";
import { Parser } from "acorn";
import type { AnyNode, Expression, MemberExpression, Program } from "acorn";
import * as walk from "acorn-walk";
import { builtinModules } from "../module/builtins.js";
import type { CompleterResult } from "../readline/types.js";
import { getREPLResourceName, getReplBuiltinLibs } from "./utils.js";
import type { EvalCallback, ReplCommand } from "./types.js";

// acorn exports these at runtime but omits them from its type declarations.
const { isIdentifierChar, isIdentifierStart } = acorn as unknown as {
  isIdentifierChar(code: number): boolean;
  isIdentifierStart(code: number): boolean;
};

const importRE = /\bimport\s*\(\s*['"`](([\w@./:-]+\/)?(?:[\w@./:-]*))(?![^'"`])$/;
const requireRE = /\brequire\s*\(\s*['"`](([\w@./:-]+\/)?(?:[\w@./:-]*))(?![^'"`])$/;
const fsAutoCompleteRE = /fs(?:\.promises)?\.\s*[a-z][a-zA-Z]+\(\s*["'](.*)/;

/** Node's `node:`-scheme builtin names: every lib plus the scheme-only modules. */
const nodeSchemeBuiltinLibs = (): string[] => [
  ...getReplBuiltinLibs().map((lib) => `node:${lib}`),
  ...builtinModules.filter((name) => name.startsWith("node:")),
];

/** The evaluator surface completion drives; a `REPLServer` satisfies it structurally. */
export interface Completable {
  commands: Record<string, ReplCommand>;
  context: object;
  useGlobal: boolean;
  allowBlockingCompletions: boolean;
  eval(code: string, context: object, file: string, callback: EvalCallback): void;
}

export type CompletionCallback = (error: Error | null, result?: CompleterResult) => void;

function isIdentifier(str: string): boolean {
  if (str === "") {
    return false;
  }
  const first = str.codePointAt(0)!;
  if (!isIdentifierStart(first)) {
    return false;
  }
  const firstLen = first > 0xffff ? 2 : 1;
  for (let i = firstLen; i < str.length; i += 1) {
    const cp = str.codePointAt(i)!;
    if (!isIdentifierChar(cp)) {
      return false;
    }
    if (cp > 0xffff) {
      i += 1;
    }
  }
  return true;
}

function isNotLegacyObjectPrototypeMethod(str: string): boolean {
  return (
    isIdentifier(str) &&
    str !== "__defineGetter__" &&
    str !== "__defineSetter__" &&
    str !== "__lookupGetter__" &&
    str !== "__lookupSetter__"
  );
}

/** Node's `getOwnNonIndexProperties(obj, ALL_PROPERTIES | SKIP_SYMBOLS)`: string keys that are not array indices. */
function getOwnNonIndexProperties(obj: object): string[] {
  return Object.getOwnPropertyNames(obj).filter(
    (name) => !(/^(?:0|[1-9]\d*)$/.test(name) && Number(name) < 4294967295),
  );
}

function filteredOwnPropertyNames(obj: unknown): string[] {
  if (!obj || (typeof obj !== "object" && typeof obj !== "function")) {
    return [];
  }
  // `Object.prototype` is the only non-contrived object that fulfills
  // `Object.getPrototypeOf(X) === null &&
  //  Object.getPrototypeOf(Object.getPrototypeOf(X.constructor)) === X`.
  let isObjectPrototype = false;
  if (Object.getPrototypeOf(obj) === null) {
    const ctorDescriptor = Object.getOwnPropertyDescriptor(obj, "constructor");
    if (ctorDescriptor?.value) {
      const ctorProto = Object.getPrototypeOf(ctorDescriptor.value) as object | null;
      isObjectPrototype = ctorProto !== null && Object.getPrototypeOf(ctorProto) === obj;
    }
  }
  return getOwnNonIndexProperties(obj).filter(
    isObjectPrototype ? isNotLegacyObjectPrototypeMethod : isIdentifier,
  );
}

function addCommonWords(completionGroups: string[][]) {
  // Only words which do not yet exist as global property should be added to
  // this list.
  completionGroups.push([
    "async",
    "await",
    "break",
    "case",
    "catch",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "false",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "null",
    "return",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
  ]);
}

// Provide a list of completions for the given leading text. This is
// given to the readline interface for handling tab completion.
//
// Example:
//  complete('let foo = util.')
//    -> [['util.print', 'util.debug', 'util.log', 'util.inspect'],
//        'util.' ]
//
// Warning: This evals code like "foo.bar.baz", so it could run property
// getter code. To avoid potential triggering side-effectful behaviors with getters the completion
// logic is skipped when getters or proxies are involved in the expression.
// (see: https://github.com/nodejs/node/issues/57829).
export function complete(this: Completable, line: string, callback: CompletionCallback): void {
  // List of completion lists, one for each inheritance "level"
  let completionGroups: string[][] = [];
  let completeOn: string | undefined;

  // Ignore right whitespace. It could change the outcome.
  line = line.trimStart();

  let filter = "";

  let match;
  // REPL commands (e.g. ".break").
  if ((match = /^\s*\.(\w*)$/.exec(line)) !== null) {
    completionGroups.push(Object.keys(this.commands));
    completeOn = match[1];
    if (completeOn.length) {
      filter = completeOn;
    }
  } else if ((match = requireRE.exec(line)) !== null) {
    // require('...<Tab>')
    completeOn = match[1];
    filter = completeOn;
    // Filesystem groups need a directory listing, which a component does not have.
    completionGroups.push(getReplBuiltinLibs(), nodeSchemeBuiltinLibs());
  } else if ((match = importRE.exec(line)) !== null) {
    // import('...<Tab>')
    completeOn = match[1];
    filter = completeOn;
    completionGroups.push(getReplBuiltinLibs(), nodeSchemeBuiltinLibs());
  } else if ((match = fsAutoCompleteRE.exec(line)) !== null && this.allowBlockingCompletions) {
    // Node lists the directory here; without a filesystem the answer is "nothing", with Node's shape.
    const filePath = match[1];
    completeOn = filePath.slice(filePath.lastIndexOf("/") + 1);
    completionGroups = [[]];
  } else if (line.length === 0 || /\w|\.|\$/.test(line[line.length - 1])) {
    const completeTarget = line.length === 0 ? line : findExpressionCompleteTarget(line);

    if (line.length !== 0 && !completeTarget) {
      completionGroupsLoaded();
      return;
    }
    let expr = "";
    completeOn = completeTarget ?? "";
    if (line.endsWith(".")) {
      expr = completeOn.slice(0, -1);
    } else if (line.length !== 0) {
      const bits = completeOn.split(".");
      filter = bits.pop()!;
      expr = bits.join(".");
    }

    // Resolve expr and get its completions.
    if (!expr) {
      // Node asks the inspector for global lexical scope names here; a component has none to ask.
      let contextProto: object | null = this.context;
      while ((contextProto = Object.getPrototypeOf(contextProto) as object | null) !== null) {
        completionGroups.push(filteredOwnPropertyNames(contextProto));
      }
      const contextOwnNames = filteredOwnPropertyNames(this.context);
      completionGroups.push(contextOwnNames);
      if (filter !== "") {
        addCommonWords(completionGroups);
      }
      completionGroupsLoaded();
      return;
    }

    // If the target ends with a dot (e.g. `obj.foo.`) such code won't be valid for AST parsing
    // so in order to make it correct we add an identifier to its end (e.g. `obj.foo.x`)
    const parsableCompleteTarget = completeOn.endsWith(".") ? `${completeOn}x` : completeOn;

    let completeTargetAst: Program | undefined;
    try {
      completeTargetAst = Parser.parse(parsableCompleteTarget, {
        sourceType: "module",
        ecmaVersion: "latest",
      });
    } catch {
      /* No need to specifically handle parse errors */
    }

    if (!completeTargetAst) {
      return completionGroupsLoaded();
    }

    const statement = completeTargetAst.body[0];
    return includesProxiesOrGetters(
      statement.type === "ExpressionStatement" ? statement.expression : undefined,
      parsableCompleteTarget,
      this.eval.bind(this),
      this.context,
      (includes) => {
        if (includes) {
          // The expression involves proxies or getters, meaning that it
          // can trigger side-effectful behaviors, so bail out
          return completionGroupsLoaded();
        }

        let chaining = ".";
        if (expr.endsWith("?")) {
          expr = expr.slice(0, -1);
          chaining = "?.";
        }

        const memberGroups: string[][] = [];
        const evalExpr = `try { ${expr} } catch {}`;
        this.eval(evalExpr, this.context, getREPLResourceName(), (_e, obj) => {
          try {
            let p: object | null;
            if ((typeof obj === "object" && obj !== null) || typeof obj === "function") {
              memberGroups.push(filteredOwnPropertyNames(obj));
              p = Object.getPrototypeOf(obj) as object | null;
            } else {
              const constructor = (obj as { constructor?: { prototype?: object } })?.constructor;
              p = constructor?.prototype ?? null;
            }
            // Circular refs possible? Let's guard against that.
            let sentinel = 5;
            while (p !== null && sentinel-- !== 0) {
              memberGroups.push(filteredOwnPropertyNames(p));
              p = Object.getPrototypeOf(p) as object | null;
            }
          } catch {
            // Maybe a Proxy object without `getOwnPropertyNames` trap.
            // We simply ignore it here, as we don't want to break the
            // autocompletion. Fixes the bug
            // https://github.com/nodejs/node/issues/2119
          }

          if (memberGroups.length) {
            expr += chaining;
            for (const group of memberGroups) {
              completionGroups.push(group.map((member) => `${expr}${member}`));
            }
            filter &&= `${expr}${filter}`;
          }

          completionGroupsLoaded();
        });
      },
    );
  }

  return completionGroupsLoaded();

  // Will be called when all completionGroups are in place
  // Useful for async autocompletion
  function completionGroupsLoaded() {
    // Filter, sort (within each group), uniq and merge the completion groups.
    if (completionGroups.length && filter) {
      const newCompletionGroups: string[][] = [];
      const lowerCaseFilter = filter.toLocaleLowerCase();
      for (const group of completionGroups) {
        const filteredGroup = group.filter((str) => {
          // Filter is always case-insensitive following chromium autocomplete
          // behavior.
          return str.toLocaleLowerCase().startsWith(lowerCaseFilter);
        });
        if (filteredGroup.length) {
          newCompletionGroups.push(filteredGroup);
        }
      }
      completionGroups = newCompletionGroups;
    }

    const completions: string[] = [];
    // Unique completions across all groups.
    const uniqueSet = new Set<string>();
    uniqueSet.add("");
    // Completion group 0 is the "closest" (least far up the inheritance
    // chain) so we put its completions last: to be closest in the REPL.
    for (const group of completionGroups) {
      group.sort((a, b) => (b > a ? 1 : -1));
      const setSize = uniqueSet.size;
      for (const entry of group) {
        if (!uniqueSet.has(entry)) {
          completions.unshift(entry);
          uniqueSet.add(entry);
        }
      }
      // Add a separator between groups.
      if (uniqueSet.size !== setSize) {
        completions.unshift("");
      }
    }

    // Remove obsolete group entry, if present.
    if (completions[0] === "") {
      completions.shift();
    }

    callback(null, [completions, completeOn ?? ""]);
  }
}

/**
 * This function tries to extract a target for tab completion from code representing an expression.
 *
 * Such target is basically the last piece of the expression that can be evaluated for the potential
 * tab completion.
 *
 * Some examples:
 * - The complete target for `const a = obj.b` is `obj.b`
 *   (because tab completion will evaluate and check the `obj.b` object)
 * - The complete target for `tru` is `tru`
 *   (since we'd ideally want to complete that to `true`)
 * - The complete target for `{ a: tru` is `tru`
 *   (like the last example, we'd ideally want that to complete to true)
 * - There is no complete target for `{ a: true }`
 *   (there is nothing to complete)
 * @param {string} code the code representing the expression to analyze
 * @returns {string|null} a substring of the code representing the complete target is there was one, `null` otherwise
 */
function findExpressionCompleteTarget(code: string): string | null {
  if (!code) {
    return null;
  }

  if (code.at(-1) === ".") {
    if (code.at(-2) === "?") {
      // The code ends with the optional chaining operator (`?.`),
      // such code can't generate a valid AST so we need to strip
      // the suffix, run this function's logic and add back the
      // optional chaining operator to the result if present
      const result = findExpressionCompleteTarget(code.slice(0, -2));
      return !result ? result : `${result}?.`;
    }

    // The code ends with a dot, such code can't generate a valid AST
    // so we need to strip the suffix, run this function's logic and
    // add back the dot to the result if present
    const result = findExpressionCompleteTarget(code.slice(0, -1));
    return !result ? result : `${result}.`;
  }

  let ast: Program;
  try {
    ast = Parser.parse(code, { sourceType: "module", ecmaVersion: "latest" });
  } catch {
    const keywords = code.split(" ");

    if (keywords.length > 1) {
      // Something went wrong with the parsing, however this can be due to incomplete code
      // (that is for example missing a closing bracket, as for example `{ a: obj.te`), in
      // this case we take the last code keyword and try again
      // TODO(dario-piotrowicz): make this more robust, right now we only split by spaces
      //                         but that's not always enough, for example it doesn't handle
      //                         this code: `{ a: obj['hello world'].te`
      return findExpressionCompleteTarget(keywords.at(-1)!);
    }

    // The ast parsing has legitimately failed so we return null
    return null;
  }

  const lastBodyStatement = ast.body[ast.body.length - 1];

  if (!lastBodyStatement) {
    return null;
  }

  // If the last statement is a block we know there is not going to be a potential
  // completion target (e.g. in `{ a: true }` there is no completion to be done)
  if (lastBodyStatement.type === "BlockStatement") {
    return null;
  }

  // If the last statement is an expression and it has a right side, that's what we
  // want to potentially complete on, so let's re-run the function's logic on that
  if (lastBodyStatement.type === "ExpressionStatement" && "right" in lastBodyStatement.expression) {
    const exprRight = lastBodyStatement.expression.right as Expression;
    const exprRightCode = code.slice(exprRight.start, exprRight.end);
    return findExpressionCompleteTarget(exprRightCode);
  }

  // If the last statement is a variable declaration statement the last declaration is
  // what we can potentially complete on, so let's re-run the function's logic on that
  if (lastBodyStatement.type === "VariableDeclaration") {
    const lastDeclarationInit = lastBodyStatement.declarations.at(-1)!.init;
    if (!lastDeclarationInit) {
      // If there is no initialization we can simply return
      return null;
    }
    const lastDeclarationInitCode = code.slice(lastDeclarationInit.start, lastDeclarationInit.end);
    return findExpressionCompleteTarget(lastDeclarationInitCode);
  }

  // If the last statement is an expression statement with a unary operator (delete, typeof, etc.)
  // we want to extract the argument for completion (e.g. for `delete obj.prop` we want `obj.prop`)
  if (
    lastBodyStatement.type === "ExpressionStatement" &&
    lastBodyStatement.expression.type === "UnaryExpression" &&
    lastBodyStatement.expression.argument
  ) {
    const argument = lastBodyStatement.expression.argument;
    const argumentCode = code.slice(argument.start, argument.end);
    return findExpressionCompleteTarget(argumentCode);
  }

  // If the last statement is an expression statement with "new" syntax
  // we want to extract the callee for completion (e.g. for `new Sample` we want `Sample`)
  if (
    lastBodyStatement.type === "ExpressionStatement" &&
    lastBodyStatement.expression.type === "NewExpression" &&
    lastBodyStatement.expression.callee
  ) {
    const callee = lastBodyStatement.expression.callee;
    const calleeCode = code.slice(callee.start, callee.end);
    return findExpressionCompleteTarget(calleeCode);
  }

  // Walk the AST for the current block of code, and check whether it contains any
  // statement or expression type that would potentially have side effects if evaluated.
  let isAllowed = true;
  const disallow = () => {
    isAllowed = false;
  };
  walk.simple(lastBodyStatement, {
    ForInStatement: disallow,
    ForOfStatement: disallow,
    CallExpression: disallow,
    AssignmentExpression: disallow,
    UpdateExpression: disallow,
  });
  if (!isAllowed) {
    return null;
  }

  // If any of the above early returns haven't activated then it means that
  // the potential complete target is the full code (e.g. the code represents
  // a simple partial identifier, a member expression, etc...)
  return code.slice(lastBodyStatement.start, lastBodyStatement.end);
}

type EvalFunction = Completable["eval"];
type ProxyOrGetterCallback = (includes: boolean, lastEvaledObj?: unknown) => void;

/**
 * Utility used to determine if an expression includes object getters or proxies.
 *
 * Example: given `obj.foo`, the function lets you know if `foo` has a getter function
 * associated to it, or if `obj` is a proxy
 * @param {any} expr The expression, in AST format to analyze
 * @param {string} exprStr The string representation of the expression
 * @param {(str: string, ctx: any, resourceName: string, cb: (error, evaled) => void) => void} evalFn
 *   Eval function to use
 * @param {any} ctx The context to use for any code evaluation
 * @param {(includes: boolean) => void} callback Callback that will be called with the result of the operation
 * @returns {void}
 */
function includesProxiesOrGetters(
  expr: AnyNode | undefined,
  exprStr: string,
  evalFn: EvalFunction,
  ctx: object,
  callback: ProxyOrGetterCallback,
): void {
  if (expr?.type !== "MemberExpression") {
    // If the expression is not a member one for obvious reasons no getters are involved
    return callback(false);
  }

  if (expr.object.type === "MemberExpression") {
    // The object itself is a member expression, so we need to recurse (e.g. the expression is `obj.foo.bar`)
    return includesProxiesOrGetters(
      expr.object,
      exprStr.slice(0, expr.object.end),
      evalFn,
      ctx,
      (includes, lastEvaledObj) => {
        if (includes) {
          // If the recurred call found a getter we can also terminate
          return callback(includes);
        }

        // If a getter/proxy hasn't been found by the recursion call we need to check if maybe a getter/proxy
        // is present here (e.g. in `obj.foo.bar` we found that `obj.foo` doesn't involve any getters so we now
        // need to check if `bar` on `obj.foo` (i.e. `lastEvaledObj`) has a getter or if `obj.foo.bar` is a proxy)
        return hasGetterOrIsProxy(lastEvaledObj, expr.property, (doesHaveGetterOrIsProxy) => {
          return callback(doesHaveGetterOrIsProxy);
        });
      },
    );
  }

  // This is the base of the recursion we have an identifier for the object and an identifier or literal
  // for the property (e.g. we have `obj.foo` or `obj['foo']`, `obj` is the object identifier and `foo`
  // is the property identifier/literal)
  if (expr.object.type === "Identifier") {
    return evalFn(
      `try { ${expr.object.name} } catch {}`,
      ctx,
      getREPLResourceName(),
      (err, obj) => {
        if (err) {
          return callback(false);
        }

        return hasGetterOrIsProxy(obj, expr.property, (doesHaveGetterOrIsProxy) => {
          if (doesHaveGetterOrIsProxy) {
            return callback(true);
          }

          return evalFn(`try { ${exprStr} } catch {} `, ctx, getREPLResourceName(), (err, obj) => {
            if (err) {
              return callback(false);
            }
            return callback(false, obj);
          });
        });
      },
    );
  }

  /**
   * Utility to see if a property has a getter associated to it or if
   * the property itself is a proxy object.
   * @returns {void}
   */
  function hasGetterOrIsProxy(
    obj: unknown,
    astProp: MemberExpression["property"],
    cb: (includes: boolean) => void,
  ): void {
    if (!obj || !astProp) {
      return cb(false);
    }

    if (astProp.type === "Literal") {
      // We have something like `obj['foo'].x` where `x` is the literal
      return propHasGetter(obj, astProp.value as PropertyKey, cb);
    }

    if (astProp.type === "Identifier" && exprStr.at(astProp.start - 1) === ".") {
      // We have something like `obj.foo.x` where `foo` is the identifier
      return propHasGetter(obj, astProp.name, cb);
    }

    return evalFn(
      // Note: this eval runs the property expression, which might be side-effectful, for example
      //       the user could be running `obj[getKey()].` where `getKey()` has some side effects.
      //       Arguably this behavior should not be too surprising, but if it turns out that it is,
      //       then we can revisit this behavior and add logic to analyze the property expression
      //       and eval it only if we can confidently say that it can't have any side effects
      `try { ${exprStr.slice(astProp.start, astProp.end)} } catch {} `,
      ctx,
      getREPLResourceName(),
      (err, evaledProp) => {
        if (err) {
          return cb(false);
        }

        if (typeof evaledProp === "string") {
          return propHasGetter(obj, evaledProp, cb);
        }

        return cb(false);
      },
    );
  }

  return callback(false);
}

/**
 * Given an object and a property name, checks whether the property has a getter.
 *
 * Node also checks whether the value is a proxy, which needs a V8 binding; an engine offers no
 * portable way to tell a proxy from its target, so that half of the check is absent here.
 */
function propHasGetter(obj: unknown, prop: PropertyKey, cb: (includes: boolean) => void): void {
  if (obj === null || (typeof obj !== "object" && typeof obj !== "function")) {
    return cb(false);
  }
  const propDescriptor = Object.getOwnPropertyDescriptor(obj, prop);
  cb(typeof propDescriptor?.get === "function");
}
