import assert from 'node:assert/strict';
import ts from 'typescript-compiler-api';

export interface DiagnosticEdit {
    code: string;
    changedNodes: number;
}

function parse(code: string) {
    return ts.createSourceFile('diagnostic.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

// Splice only selected AST spans: unrelated bodies and array elisions stay exact.
function edit(code: string, select: (node: ts.Node, source: ts.SourceFile) => string | undefined): DiagnosticEdit {
    const source = parse(code);
    const edits: { start: number; end: number; text: string }[] = [];
    function visit(node: ts.Node) {
        const text = select(node, source);
        if (text !== undefined) {
            edits.push({ start: node.getStart(source), end: node.end, text });
        } else {
            ts.forEachChild(node, visit);
        }
    }
    visit(source);
    for (const item of edits.toSorted((a, b) => b.start - a.start)) {
        code = code.slice(0, item.start) + item.text + code.slice(item.end);
    }
    return { code, changedNodes: edits.length };
}

/** Factory-control bindings only; named imports have no namespace member table. */
export function requestedFactoryMembers(code: string) {
    const source = parse(code);
    const members = new Set<string>();
    function visit(node: ts.Node) {
        if (ts.isPropertyAccessExpression(node)) {
            const path = node.getText(source).replaceAll('?.', '.');
            const member = path.match(/^_jcoIntrinsics\.([a-zA-Z]+\.[a-zA-Z0-9]+)/)?.[1];
            if (member) {
                members.add(member);
            }
        }
        if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'receiver' && node.initializer) {
            const namespace = node.initializer.getText(source).match(/^_jcoIntrinsics\?\.([a-zA-Z]+)$/)?.[1];
            const block = node.parent.parent.parent;
            const member = block.getText(source).match(/const intrinsic = receiver\?\.([a-zA-Z0-9]+)/)?.[1];
            if (namespace && member) {
                members.add(namespace + '.' + member);
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    return [...members].toSorted();
}

export function namedImports(code: string) {
    const source = parse(code);
    return source.statements.filter(ts.isImportDeclaration).flatMap((node) => {
        if (!ts.isStringLiteral(node.moduleSpecifier) || !node.moduleSpecifier.text.includes('/intrinsics/')) {
            return [];
        }
        const bindings = node.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) {
            return [];
        }
        return [
            {
                specifier: node.moduleSpecifier.text,
                names: bindings.elements.map((binding) => ({
                    exported: (binding.propertyName ?? binding.name).text,
                    local: binding.name.text,
                })),
            },
        ];
    });
}

/** Unsafe closed-world diagnostic. Never apply to the named provider or production. */
export function omitUnusedNamespaces(code: string, needed: Set<string>) {
    assert(
        parse(code).statements.some((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'createRuntime'),
        'Factory-only transform requires createRuntime',
    );
    return edit(code, (node, source) => {
        if (ts.isVariableStatement(node)) {
            const name = node.declarationList.declarations[0]?.name.getText(source);
            if (name === 'waitable' && !needed.has('waitable')) {
                return '';
            }
            if (name === 'host' && !needed.has('host') && !needed.has('waitable')) {
                return '';
            }
        }
        if (
            ts.isPropertyAssignment(node) &&
            node.name.getText(source) === 'intrinsics' &&
            ts.isObjectLiteralExpression(node.initializer)
        ) {
            const properties = node.initializer.properties.filter(
                (property) => property.name && needed.has(property.name.getText(source)),
            );
            return `intrinsics: { ${properties.map((property) => property.getText(source)).join(',')} }`;
        }
    });
}

export function omitBindingChecks(code: string) {
    assert(requestedFactoryMembers(code).length, 'Factory-only transform requires v1 namespace bindings');
    return edit(code, (node, source) => {
        if (
            ts.isIfStatement(node) &&
            /throw new (TypeError|Error)\(['`](Jco Component Model runtime|incompatible Jco JavaScript Component Model runtime API)/.test(
                node.thenStatement.getText(source),
            )
        ) {
            return '';
        }
    });
}

export function omitReceiverBinding(code: string) {
    assert(requestedFactoryMembers(code).length, 'Factory-only transform requires v1 namespace bindings');
    return edit(code, (node, source) => {
        if (ts.isReturnStatement(node) && node.expression?.getText(source) === 'intrinsic.bind(receiver)') {
            return 'return intrinsic;';
        }
    });
}

/** Counter hooks are solely for separate instrumented allocation diagnostics. */
export function countFactoryCalls(code: string) {
    return edit(code, (node, source) => {
        if (
            ts.isFunctionDeclaration(node) &&
            node.name?.text.startsWith('create') &&
            node.body &&
            ts.isSourceFile(node.parent)
        ) {
            const body = node.body.getText(source);
            return node
                .getText(source)
                .replace(
                    body,
                    `{ globalThis.__jcoFactoryCounts?.(${JSON.stringify(node.name.text)}); ${body.slice(1, -1)} }`,
                );
        }
    });
}

/** Readable source spans explain retention; they are not additive transfer sizes. */
export function factorySizes(code: string) {
    const source = parse(code);
    return Object.fromEntries(
        source.statements
            .filter(ts.isFunctionDeclaration)
            .filter((node) => node.name?.text.startsWith('create'))
            .map((node) => [node.name!.text, Buffer.byteLength(node.getText(source))]),
    );
}
