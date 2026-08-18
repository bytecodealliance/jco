import type ts from "typescript-compiler-api";

import type { ComponentImplementationModel, FunctionModel, InterfaceModel, ResourceModel } from "./model.js";

export function declarationModel(
    typescript: typeof ts,
    files: Record<string, Uint8Array>,
    hostMode = false,
): ComponentImplementationModel {
    const decoder = new TextDecoder();
    const virtualFiles = Object.fromEntries(
        Object.entries(files).map(([name, bytes]) => [`/${name.replaceAll("\\", "/")}`, decoder.decode(bytes)]),
    );

    const options: ts.CompilerOptions = {
        module: typescript.ModuleKind.ESNext,
        moduleResolution: typescript.ModuleResolutionKind.Bundler,
        noLib: true,
        skipLibCheck: true,
    };

    const baseHost = typescript.createCompilerHost(options);

    const host: ts.CompilerHost = {
        ...baseHost,
        fileExists: (name) => virtualFiles[name] !== undefined,
        readFile: (name) => virtualFiles[name],
        getCurrentDirectory: () => "/",
        getDefaultLibFileName: () => "/lib.d.ts",
        getSourceFile: (name, languageVersion) => {
            const source = virtualFiles[name];
            return source === undefined
                ? undefined
                : typescript.createSourceFile(name, source, languageVersion, true, typescript.ScriptKind.TS);
        },
    };

    const program = typescript.createProgram(Object.keys(virtualFiles), options, host);
    const checker = program.getTypeChecker();
    if (hostMode) {
        return hostDeclarationModel(typescript, program, checker);
    }
    const modules = new Map<string, ts.Symbol>();
    const rootModules: string[] = [];

    // Build graph for typechecking
    for (const sourceFile of program.getSourceFiles()) {
        for (const statement of sourceFile.statements) {
            if (typescript.isModuleDeclaration(statement) && typescript.isStringLiteral(statement.name)) {
                const symbol = checker.getSymbolAtLocation(statement.name);
                if (symbol) {
                    modules.set(statement.name.text, symbol);
                    if (!sourceFile.fileName.includes("/interfaces/")) {
                        rootModules.push(statement.name.text);
                    }
                }
            }
        }
    }
    if (rootModules.length !== 1) {
        throw new Error(`Expected one generated world declaration, found ${rootModules.length}`);
    }
    const world = rootModules[0];
    const worldSymbol = modules.get(world)!;
    const functions: FunctionModel[] = [];
    const interfaces: InterfaceModel[] = [];

    // Gather interfaces and functions
    for (const exported of checker.getExportsOfModule(worldSymbol)) {
        const declaration = exported.declarations?.[0];
        if (
            declaration &&
            typescript.isNamespaceExport(declaration) &&
            typescript.isExportDeclaration(declaration.parent) &&
            declaration.parent.isTypeOnly
        ) {
            continue;
        }
        const target = exported.flags & typescript.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
        if (target.flags & typescript.SymbolFlags.Function) {
            functions.push(functionFromSymbol(typescript, checker, target));
        } else if (target.flags & typescript.SymbolFlags.ValueModule) {
            interfaces.push(interfaceFromSymbol(typescript, checker, exported.name, target));
        }
    }

    return { world, functions, interfaces };
}

function hostDeclarationModel(
    typescript: typeof ts,
    program: ts.Program,
    checker: ts.TypeChecker,
): ComponentImplementationModel {
    const root = program.getSourceFiles().find((source) => !source.fileName.includes("/interfaces/"));
    if (!root) {
        throw new Error("Expected one generated host world declaration");
    }
    const world = root.getFullText().match(/\/\/ world ([^\s]+)/)?.[1];
    if (!world) {
        throw new Error("Could not determine the generated host world");
    }
    const interfaces: InterfaceModel[] = [];
    for (const statement of root.statements) {
        if (
            !typescript.isExportDeclaration(statement) ||
            !statement.isTypeOnly ||
            !statement.exportClause ||
            !typescript.isNamespaceExport(statement.exportClause)
        ) {
            continue;
        }
        const exported = checker.getSymbolAtLocation(statement.exportClause.name);
        if (!exported) {
            continue;
        }
        const moduleSpecifier = typescript.isStringLiteral(statement.moduleSpecifier!)
            ? statement.moduleSpecifier.text
            : undefined;
        const interfaceFile = moduleSpecifier
            ? program.getSourceFile(`/${moduleSpecifier.replace(/^\.\//, "").replace(/\.js$/, ".d.ts")}`)
            : undefined;
        const importName = interfaceFile?.getFullText().match(/@module Interface ([^\s*]+)/)?.[1];
        const target = interfaceFile && checker.getSymbolAtLocation(interfaceFile);
        if (!importName || !target) {
            throw new Error(`Could not determine the WIT import for ${exported.name}`);
        }
        interfaces.push({ ...interfaceFromSymbol(typescript, checker, exported.name, target), importName });
    }
    return {
        world,
        typeModule: `../types/generated/${root.fileName
            .split("/")
            .pop()!
            .replace(/\.d\.ts$/, ".js")}`,
        functions: [],
        interfaces,
    };
}

export function validateComponentSource(
    typescript: typeof ts,
    files: Record<string, Uint8Array>,
    source: string,
    language: "typescript" | "javascript",
): void {
    const decoder = new TextDecoder();
    const sourceName = language === "typescript" ? "/src/component.ts" : "/src/component.js";
    const virtualFiles: Record<string, string> = {
        [sourceName]: source,
        ...Object.fromEntries(
            Object.entries(files).map(([name, bytes]) => [
                `/types/generated/${name.replaceAll("\\", "/")}`,
                decoder.decode(bytes),
            ]),
        ),
    };

    const options: ts.CompilerOptions = {
        allowJs: language === "javascript",
        checkJs: language === "javascript",
        module: typescript.ModuleKind.ESNext,
        moduleResolution: typescript.ModuleResolutionKind.Bundler,
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        noImplicitAny: language === "typescript",
        target: typescript.ScriptTarget.ES2022,
    };

    const baseHost = typescript.createCompilerHost(options);

    const host: ts.CompilerHost = {
        ...baseHost,
        fileExists: (name) => virtualFiles[name] !== undefined || baseHost.fileExists(name),
        directoryExists: (name) =>
            Object.keys(virtualFiles).some((file) => file.startsWith(`${name}/`)) ||
            (baseHost.directoryExists?.(name) ?? false),
        readFile: (name) => virtualFiles[name] ?? baseHost.readFile(name),
        getCurrentDirectory: () => "/",
        getSourceFile: (name, languageVersion) => {
            const contents = virtualFiles[name];
            return contents === undefined
                ? baseHost.getSourceFile(name, languageVersion)
                : typescript.createSourceFile(
                      name,
                      contents,
                      languageVersion,
                      true,
                      name.endsWith(".js") ? typescript.ScriptKind.JS : typescript.ScriptKind.TS,
                  );
        },
    };
    const program = typescript.createProgram(Object.keys(virtualFiles), options, host);

    // Perform type checking
    const diagnostics = typescript
        .getPreEmitDiagnostics(program)
        .filter((diagnostic) => diagnostic.file === undefined || diagnostic.file.fileName === sourceName);
    if (diagnostics.length > 0) {
        const message = typescript.formatDiagnostics(diagnostics, {
            getCanonicalFileName: (name) => name,
            getCurrentDirectory: () => "/",
            getNewLine: () => "\n",
        });
        throw new Error(`Generated component failed type checking:\n${message}`);
    }
}

function interfaceFromSymbol(
    typescript: typeof ts,
    checker: ts.TypeChecker,
    name: string,
    symbol: ts.Symbol,
): InterfaceModel {
    const functions: FunctionModel[] = [];
    const resources: ResourceModel[] = [];
    for (const exported of checker.getExportsOfModule(symbol)) {
        if (exported.flags & typescript.SymbolFlags.Function) {
            functions.push(functionFromSymbol(typescript, checker, exported));
        } else if (exported.flags & typescript.SymbolFlags.Class) {
            resources.push(resourceFromSymbol(typescript, exported));
        }
    }
    return { name, functions, resources };
}

function functionFromSymbol(typescript: typeof ts, checker: ts.TypeChecker, symbol: ts.Symbol): FunctionModel {
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (!declaration) {
        throw new Error(`Missing declaration for ${symbol.name}`);
    }
    const signature = checker.getSignatureFromDeclaration(declaration as ts.SignatureDeclaration);
    return {
        name: symbol.name,
        parameters:
            signature?.parameters.map((parameter, index) => safeParameterName(typescript, parameter.name, index)) ?? [],
    };
}

function resourceFromSymbol(typescript: typeof ts, symbol: ts.Symbol): ResourceModel {
    const declaration = symbol.declarations?.find(typescript.isClassDeclaration);
    if (!declaration) {
        throw new Error(`Missing class declaration for ${symbol.name}`);
    }
    let constructorParameters: string[] | undefined;
    const methods: FunctionModel[] = [];
    const staticMethods: FunctionModel[] = [];
    for (const member of declaration.members) {
        if (typescript.isConstructorDeclaration(member)) {
            if (!member.modifiers?.some((modifier) => modifier.kind === typescript.SyntaxKind.PrivateKeyword)) {
                constructorParameters = member.parameters.map((parameter, index) =>
                    safeParameterName(typescript, parameter.name.getText(), index),
                );
            }
        } else if (typescript.isMethodDeclaration(member) && typescript.isIdentifier(member.name)) {
            const method = {
                name: member.name.text,
                parameters: member.parameters.map((parameter, index) =>
                    safeParameterName(typescript, parameter.name.getText(), index),
                ),
            };
            if (member.modifiers?.some((modifier) => modifier.kind === typescript.SyntaxKind.StaticKeyword)) {
                staticMethods.push(method);
            } else {
                methods.push(method);
            }
        }
    }
    return { name: symbol.name, constructorParameters, methods, staticMethods };
}

function safeParameterName(_typescript: typeof ts, name: string, index: number): string {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `arg${index}`;
}
