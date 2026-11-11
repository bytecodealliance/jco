/** Declaration contracts that Jco keeps stable independently of jco-transpile. */
export interface TypegenOptions {
    /** Require nominal identities for generated resource instances. Implies separateInterfaceTypes. */
    nominalResources?: boolean;
    /** Allow host async imports to return a value without a Promise. Implies separateInterfaceTypes. */
    asyncImportsMayReturnSync?: boolean;
    /** Export named result error classes when error wrapping is enabled. Implies separateInterfaceTypes. */
    typedErrorClasses?: boolean;
    /** Generate separate import-side and export-side interface declarations. */
    separateInterfaceTypes?: boolean;
    /** Make result arms without a payload optional; changes generic Result narrowing. */
    optionalResultPayloads?: boolean;
}

/** Apply Jco's declaration compatibility defaults while preserving explicit opt-ins. */
export function typegenOptions(opts: TypegenOptions): Required<TypegenOptions> {
    return {
        // TODO(breaking): enable nominal resource types in the next breaking Jco release.
        // Structural mocks and values annotated with legacy interface types need migration.
        nominalResources: opts.nominalResources ?? false,
        // TODO(breaking): widen host async return types in the next breaking Jco release.
        // Existing consumers may call Promise methods directly on these results.
        asyncImportsMayReturnSync: opts.asyncImportsMayReturnSync ?? false,
        // TODO(breaking): enable named error classes in the next breaking Jco release.
        // Adding runtime exports also changes exhaustive mappings of interface keys.
        typedErrorClasses: opts.typedErrorClasses ?? false,
        // TODO(breaking): split interface declarations in the next breaking Jco release.
        // Existing annotations and shallow declaration-copying scripts use the flat layout.
        separateInterfaceTypes: opts.separateInterfaceTypes ?? false,
        // TODO(breaking): enable optional result payloads in the next breaking Jco release.
        // The conditional Result helper changes narrowing in generic consumers.
        optionalResultPayloads: opts.optionalResultPayloads ?? false,
    };
}
