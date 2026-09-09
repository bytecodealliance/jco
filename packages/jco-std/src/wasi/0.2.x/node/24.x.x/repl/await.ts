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
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/internal/repl/await.js.
// Local changes: TypeScript types, ES intrinsics, acorn from npm rather than Node's vendored copy.
// See ./README.md for runtime boundaries and the upstream dependency audit.

import { Parser } from "acorn";
import type {
  AnyNode,
  ArrowFunctionExpression,
  BlockStatement,
  CallExpression,
  ExpressionStatement,
  Node,
  Pattern,
} from "acorn";
import * as walk from "acorn-walk";
import { Recoverable } from "./recoverable.js";

interface AwaitState {
  body: BlockStatement;
  ancestors: AnyNode[];
  hoistedDeclarationStatements: string[];
  replace(from: number, to: number, str: string): void;
  prepend(node: Node, str: string): void;
  append(node: Node, str: string): void;
  containsAwait: boolean;
  containsReturn: boolean;
}

type Walker = walk.WalkerCallback<AwaitState>;
type Visitor = (node: AnyNode, state: AwaitState, c: Walker) => void;
type BaseVisitors = Record<string, Visitor>;

const base = walk.base as unknown as BaseVisitors;

function isTopLevelDeclaration(state: AwaitState): boolean {
  return state.ancestors[state.ancestors.length - 2] === state.body;
}

const noop: Visitor = () => {};
const visitorsWithoutAncestors: BaseVisitors = {
  ClassDeclaration(node, state, c) {
    const declaration = node as Extract<AnyNode, { type: "ClassDeclaration" }>;
    if (isTopLevelDeclaration(state)) {
      state.prepend(declaration, `${declaration.id!.name}=`);
      state.hoistedDeclarationStatements.push(`let ${declaration.id!.name}; `);
    }

    base.ClassDeclaration(node, state, c);
  },
  ForOfStatement(node, state, c) {
    if ((node as Extract<AnyNode, { type: "ForOfStatement" }>).await === true) {
      state.containsAwait = true;
    }
    base.ForOfStatement(node, state, c);
  },
  FunctionDeclaration(node, state) {
    const declaration = node as Extract<AnyNode, { type: "FunctionDeclaration" }>;
    state.prepend(declaration, `this.${declaration.id!.name} = ${declaration.id!.name}; `);
    state.hoistedDeclarationStatements.push(`var ${declaration.id!.name}; `);
  },
  FunctionExpression: noop,
  ArrowFunctionExpression: noop,
  MethodDefinition: noop,
  AwaitExpression(node, state, c) {
    state.containsAwait = true;
    base.AwaitExpression(node, state, c);
  },
  ReturnStatement(node, state, c) {
    state.containsReturn = true;
    base.ReturnStatement(node, state, c);
  },
  VariableDeclaration(node, state, c) {
    const declaration = node as Extract<AnyNode, { type: "VariableDeclaration" }>;
    const variableKind = declaration.kind;
    const isIterableForDeclaration = ["ForOfStatement", "ForInStatement"].includes(
      state.ancestors[state.ancestors.length - 2].type,
    );

    if (variableKind === "var" || isTopLevelDeclaration(state)) {
      state.replace(
        declaration.start,
        declaration.start + variableKind.length + (isIterableForDeclaration ? 1 : 0),
        variableKind === "var" && isIterableForDeclaration
          ? ""
          : "void" + (declaration.declarations.length === 1 ? "" : " ("),
      );

      if (!isIterableForDeclaration) {
        for (const decl of declaration.declarations) {
          state.prepend(decl, "(");
          state.append(decl, decl.init ? ")" : "=undefined)");
        }

        if (declaration.declarations.length !== 1) {
          state.append(declaration.declarations[declaration.declarations.length - 1], ")");
        }
      }

      const variableIdentifiersToHoist: [kind: string, identifiers: string[]][] = [
        ["var", []],
        ["let", []],
      ];
      function registerVariableDeclarationIdentifiers(node: Pattern | null) {
        switch (node?.type) {
          case "Identifier":
            variableIdentifiersToHoist[variableKind === "var" ? 0 : 1][1].push(node.name);
            break;
          case "ObjectPattern":
            for (const property of node.properties) {
              registerVariableDeclarationIdentifiers(
                property.type === "RestElement" ? property.argument : property.value,
              );
            }
            break;
          case "ArrayPattern":
            for (const element of node.elements) {
              registerVariableDeclarationIdentifiers(element);
            }
            break;
        }
      }

      for (const decl of declaration.declarations) {
        registerVariableDeclarationIdentifiers(decl.id);
      }

      for (const [kind, identifiers] of variableIdentifiersToHoist) {
        if (identifiers.length > 0) {
          state.hoistedDeclarationStatements.push(`${kind} ${identifiers.join(", ")}; `);
        }
      }
    }

    base.VariableDeclaration(node, state, c);
  },
};

const visitors: BaseVisitors = {};
for (const nodeType of Object.keys(base)) {
  const callback = visitorsWithoutAncestors[nodeType] || base[nodeType];
  visitors[nodeType] = (node, state, c) => {
    const isNew = node !== state.ancestors[state.ancestors.length - 1];
    if (isNew) {
      state.ancestors.push(node);
    }
    callback(node, state, c);
    if (isNew) {
      state.ancestors.pop();
    }
  };
}

interface AcornSyntaxError extends SyntaxError {
  pos: number;
  loc: { line: number; column: number };
}

/**
 * Rewrite a top-level `await` script into an async wrapper returning `{ value }`.
 *
 * Returns `null` when the source needs no rewriting, throws `Recoverable` for incomplete input,
 * and re-throws parse failures as a `SyntaxError` in Node's message shape.
 */
export function processTopLevelAwait(src: string): string | null {
  const wrapPrefix = "(async () => { ";
  const wrapped = `${wrapPrefix}${src} })()`;
  const wrappedArray = wrapped.split("");
  let root;
  try {
    root = Parser.parse(wrapped, { ecmaVersion: "latest" });
  } catch (error) {
    const e = error as AcornSyntaxError;
    if (e.message.startsWith("Unterminated ")) {
      throw new Recoverable(e);
    }
    // If the parse error is before the first "await", then use the execution
    // error. Otherwise we must emit this parse error, making it look like a
    // proper syntax error.
    const awaitPos = src.indexOf("await");
    const errPos = e.pos - wrapPrefix.length;
    if (awaitPos > errPos) {
      return null;
    }
    // Convert keyword parse errors on await into their original errors when
    // possible.
    if (errPos === awaitPos + 6 && e.message.includes("Expecting Unicode escape sequence")) {
      return null;
    }
    if (errPos === awaitPos + 7 && e.message.includes("Unexpected token")) {
      return null;
    }
    const line = e.loc.line;
    const column = line === 1 ? e.loc.column - wrapPrefix.length : e.loc.column;
    let message =
      "\n" +
      src.split("\n", line)[line - 1] +
      "\n" +
      " ".repeat(column) +
      "^\n\n" +
      e.message.replace(/ \([^)]+\)/, "");
    // V8 unexpected token errors include the token string.
    if (message.endsWith("Unexpected token")) {
      message +=
        " '" +
        // Wrapper end may cause acorn to report error position after the source
        (src[e.pos - wrapPrefix.length] ?? src[src.length - 1]) +
        "'";
    }
    throw new SyntaxError(message);
  }
  const call = (root.body[0] as ExpressionStatement).expression as CallExpression;
  const body = (call.callee as ArrowFunctionExpression).body as BlockStatement;
  const state: AwaitState = {
    body,
    ancestors: [],
    hoistedDeclarationStatements: [],
    replace(from, to, str) {
      for (let i = from; i < to; i++) {
        wrappedArray[i] = "";
      }
      if (from === to) {
        str += wrappedArray[from];
      }
      wrappedArray[from] = str;
    },
    prepend(node, str) {
      wrappedArray[node.start] = str + wrappedArray[node.start];
    },
    append(node, str) {
      wrappedArray[node.end - 1] += str;
    },
    containsAwait: false,
    containsReturn: false,
  };

  walk.recursive(body, state, visitors as unknown as walk.RecursiveVisitors<AwaitState>);

  // Do not transform if
  // 1. False alarm: there isn't actually an await expression.
  // 2. There is a top-level return, which is not allowed.
  if (!state.containsAwait || state.containsReturn) {
    return null;
  }

  for (let i = body.body.length - 1; i >= 0; i--) {
    const node = body.body[i];
    if (node.type === "EmptyStatement") {
      continue;
    }
    if (node.type === "ExpressionStatement") {
      // For an expression statement of the form
      // ( expr ) ;
      // ^^^^^^^^^^   // node
      //   ^^^^       // node.expression
      //
      // We do not want the left parenthesis before the `return` keyword;
      // therefore we prepend the `return (` to `node`.
      //
      // On the other hand, we do not want the right parenthesis after the
      // semicolon. Since there can only be more right parentheses between
      // node.expression.end and the semicolon, appending one more to
      // node.expression should be fine.
      //
      // We also create a wrapper object around the result of the expression.
      // Consider an expression of the form `(await x).y`. If we just return
      // this expression from an async function, the caller will await `y`, too,
      // if it evaluates to a Promise. Instead, we return
      // `{ value: ((await x).y) }`, which allows the caller to retrieve the
      // awaited value correctly.
      state.prepend(node.expression, "{ value: (");
      state.prepend(node, "return ");
      state.append(node.expression, ") }");
    }
    break;
  }

  return state.hoistedDeclarationStatements.join("") + wrappedArray.join("");
}
