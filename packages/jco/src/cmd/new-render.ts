import type ts from "typescript-compiler-api";

import type { ComponentImplementationModel, FunctionModel, ResourceModel } from "./new-model.js";

export function renderComponent(
    typescript: typeof ts,
    model: ComponentImplementationModel,
    language: "typescript" | "javascript",
): string {
    const f = typescript.factory;
    const statements: ts.Statement[] = [];
    statements.push(
        f.createImportDeclaration(
            undefined,
            f.createImportClause(true, undefined, f.createNamespaceImport(f.createIdentifier("World"))),
            f.createStringLiteral(model.world),
        ),
    );
    for (const fn of model.functions) {
        const localName = safeLocalName(fn.name);
        const statement = exportedFunction(typescript, fn, localName, f.createTypeQueryNode(worldMember(f, fn.name)));
        if (language === "javascript") {
            addJavaScriptType(typescript, statement, model.world, fn.name);
        }
        statements.push(statement);
        if (localName !== fn.name) {
            statements.push(exportAlias(typescript, localName, fn.name));
        }
    }
    for (const iface of model.interfaces) {
        const classNames: Array<{ exportName: string; localName: string }> = [];
        for (const resource of iface.resources) {
            const className = `${upperFirst(iface.name)}${resource.name}`;
            classNames.push({ exportName: resource.name, localName: className });
            statements.push(resourceClass(typescript, resource, className));
        }
        const members: ts.ObjectLiteralElementLike[] = [
            ...iface.functions.map((fn) => objectMethod(typescript, fn)),
            ...classNames.map(({ exportName, localName }) =>
                f.createPropertyAssignment(propertyName(f, exportName), f.createIdentifier(localName)),
            ),
        ];
        const localInterfaceName = safeLocalName(iface.name);
        const statement = f.createVariableStatement(
            [f.createModifier(typescript.SyntaxKind.ExportKeyword)],
            f.createVariableDeclarationList(
                [
                    f.createVariableDeclaration(
                        f.createIdentifier(localInterfaceName),
                        undefined,
                        f.createTypeQueryNode(worldMember(f, iface.name)),
                        f.createObjectLiteralExpression(members, true),
                    ),
                ],
                typescript.NodeFlags.Const,
            ),
        );
        if (language === "javascript") {
            addJavaScriptType(typescript, statement, model.world, iface.name);
        }
        statements.push(statement);
        if (localInterfaceName !== iface.name) {
            statements.push(exportAlias(typescript, localInterfaceName, iface.name));
        }
    }
    const source = f.createSourceFile(
        statements,
        f.createToken(typescript.SyntaxKind.EndOfFileToken),
        typescript.NodeFlags.None,
    );
    const printed = typescript.createPrinter({ newLine: typescript.NewLineKind.LineFeed }).printFile(source) + "\n";
    if (language === "typescript") {
        return printed;
    }
    return (
        "// @ts-check\n" +
        typescript.transpileModule(printed, {
            compilerOptions: { module: typescript.ModuleKind.ESNext, target: typescript.ScriptTarget.ES2022 },
        }).outputText
    );
}

export function renderComponentTest(
    typescript: typeof ts,
    model: ComponentImplementationModel,
    language: "typescript" | "javascript",
): string {
    const f = typescript.factory;
    const assertions: ts.Statement[] = [];
    for (const fn of model.functions) {
        assertions.push(typeofAssertion(typescript, componentMember(typescript, fn.name), "function"));
    }
    for (const iface of model.interfaces) {
        const interfaceExpression = componentMember(typescript, iface.name);
        assertions.push(typeofAssertion(typescript, interfaceExpression, "object"));
        for (const fn of iface.functions) {
            assertions.push(
                typeofAssertion(
                    typescript,
                    f.createElementAccessExpression(interfaceExpression, f.createStringLiteral(fn.name)),
                    "function",
                ),
            );
        }
        for (const resource of iface.resources) {
            assertions.push(
                typeofAssertion(
                    typescript,
                    f.createElementAccessExpression(interfaceExpression, f.createStringLiteral(resource.name)),
                    "function",
                ),
            );
        }
    }
    const sourceExtension = language === "javascript" ? ".js" : "";
    const statements: ts.Statement[] = [
        f.createImportDeclaration(
            undefined,
            f.createImportClause(
                false,
                undefined,
                f.createNamedImports(
                    ["describe", "expect", "test"].map((name) =>
                        f.createImportSpecifier(false, undefined, f.createIdentifier(name)),
                    ),
                ),
            ),
            f.createStringLiteral("vitest"),
        ),
        f.createImportDeclaration(
            undefined,
            f.createImportClause(false, undefined, f.createNamespaceImport(f.createIdentifier("component"))),
            f.createStringLiteral(`../src/component${sourceExtension}`),
        ),
        f.createExpressionStatement(
            f.createCallExpression(f.createIdentifier("describe"), undefined, [
                f.createStringLiteral("component implementation"),
                f.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    f.createToken(typescript.SyntaxKind.EqualsGreaterThanToken),
                    f.createBlock(
                        [
                            f.createExpressionStatement(
                                f.createCallExpression(f.createIdentifier("test"), undefined, [
                                    f.createStringLiteral("matches the selected WIT world"),
                                    f.createArrowFunction(
                                        undefined,
                                        undefined,
                                        [],
                                        undefined,
                                        f.createToken(typescript.SyntaxKind.EqualsGreaterThanToken),
                                        f.createBlock(assertions, true),
                                    ),
                                ]),
                            ),
                        ],
                        true,
                    ),
                ),
            ]),
        ),
    ];
    const source = f.createSourceFile(
        statements,
        f.createToken(typescript.SyntaxKind.EndOfFileToken),
        typescript.NodeFlags.None,
    );
    return typescript.createPrinter({ newLine: typescript.NewLineKind.LineFeed }).printFile(source) + "\n";
}

function componentMember(typescript: typeof ts, name: string): ts.Expression {
    return typescript.factory.createElementAccessExpression(
        typescript.factory.createIdentifier("component"),
        typescript.factory.createStringLiteral(name),
    );
}

function typeofAssertion(typescript: typeof ts, expression: ts.Expression, expected: string): ts.Statement {
    const f = typescript.factory;
    return f.createExpressionStatement(
        f.createCallExpression(
            f.createPropertyAccessExpression(
                f.createCallExpression(f.createIdentifier("expect"), undefined, [f.createTypeOfExpression(expression)]),
                f.createIdentifier("toBe"),
            ),
            undefined,
            [f.createStringLiteral(expected)],
        ),
    );
}

function addJavaScriptType(typescript: typeof ts, node: ts.Node, world: string, name: string): void {
    typescript.addSyntheticLeadingComment(
        node,
        typescript.SyntaxKind.MultiLineCommentTrivia,
        `* @type {typeof import(${JSON.stringify(world)}).${name}} `,
        true,
    );
}

function exportedFunction(
    typescript: typeof ts,
    fn: FunctionModel,
    localName: string,
    type: ts.TypeNode,
): ts.Statement {
    const f = typescript.factory;
    return f.createVariableStatement(
        [f.createModifier(typescript.SyntaxKind.ExportKeyword)],
        f.createVariableDeclarationList(
            [
                f.createVariableDeclaration(
                    f.createIdentifier(localName),
                    undefined,
                    type,
                    f.createArrowFunction(
                        undefined,
                        undefined,
                        parameters(typescript, fn.parameters),
                        undefined,
                        f.createToken(typescript.SyntaxKind.EqualsGreaterThanToken),
                        todoBlock(typescript),
                    ),
                ),
            ],
            typescript.NodeFlags.Const,
        ),
    );
}

function exportAlias(typescript: typeof ts, localName: string, exportName: string): ts.ExportDeclaration {
    const f = typescript.factory;
    return f.createExportDeclaration(
        undefined,
        false,
        f.createNamedExports([
            f.createExportSpecifier(false, f.createIdentifier(localName), f.createIdentifier(exportName)),
        ]),
    );
}

function objectMethod(typescript: typeof ts, fn: FunctionModel): ts.MethodDeclaration {
    return typescript.factory.createMethodDeclaration(
        undefined,
        undefined,
        propertyName(typescript.factory, fn.name),
        undefined,
        undefined,
        parameters(typescript, fn.parameters),
        undefined,
        todoBlock(typescript),
    );
}

function resourceClass(typescript: typeof ts, resource: ResourceModel, className: string): ts.ClassDeclaration {
    const f = typescript.factory;
    const members: ts.ClassElement[] = [];
    if (resource.constructorParameters) {
        members.push(
            f.createConstructorDeclaration(
                undefined,
                parameters(typescript, resource.constructorParameters),
                todoBlock(typescript),
            ),
        );
    }
    for (const method of resource.methods) {
        members.push(classMethod(typescript, method, false));
    }
    for (const method of resource.staticMethods) {
        members.push(classMethod(typescript, method, true));
    }
    return f.createClassDeclaration(undefined, f.createIdentifier(className), undefined, undefined, members);
}

function classMethod(typescript: typeof ts, method: FunctionModel, isStatic: boolean): ts.MethodDeclaration {
    const f = typescript.factory;
    const declaration = f.createMethodDeclaration(
        isStatic ? [f.createModifier(typescript.SyntaxKind.StaticKeyword)] : undefined,
        undefined,
        propertyName(f, method.name),
        undefined,
        undefined,
        parameters(typescript, method.parameters),
        f.createKeywordTypeNode(typescript.SyntaxKind.NeverKeyword),
        todoBlock(typescript),
    );
    typescript.addSyntheticLeadingComment(
        declaration,
        typescript.SyntaxKind.MultiLineCommentTrivia,
        `*${method.parameters.map((name) => `\n     * @param {any} ${name}`).join("")}\n     * @returns {never}\n     `,
        true,
    );
    return declaration;
}

function parameters(typescript: typeof ts, names: string[]): ts.ParameterDeclaration[] {
    return names.map((name) =>
        typescript.factory.createParameterDeclaration(
            undefined,
            undefined,
            typescript.factory.createIdentifier(name),
            undefined,
            typescript.factory.createKeywordTypeNode(typescript.SyntaxKind.AnyKeyword),
        ),
    );
}

function todoBlock(typescript: typeof ts): ts.Block {
    const f = typescript.factory;
    return f.createBlock(
        [
            f.createThrowStatement(
                f.createNewExpression(f.createIdentifier("Error"), undefined, [f.createStringLiteral("TODO")]),
            ),
        ],
        true,
    );
}

function worldMember(f: ts.NodeFactory, name: string): ts.EntityName {
    return f.createQualifiedName(f.createIdentifier("World"), propertyName(f, name));
}

function propertyName(f: ts.NodeFactory, name: string): ts.Identifier {
    return f.createIdentifier(name);
}

function upperFirst(value: string): string {
    return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

const RESERVED_WORDS = new Set([
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "export",
    "extends",
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
    "static",
    "super",
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

function safeLocalName(name: string): string {
    return RESERVED_WORDS.has(name) || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? `_${name}` : name;
}
