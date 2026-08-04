import type { PluginContext } from "rollup";

/** Rewrite a core URL to a build-produced file */
export function rewriteCoreUrl(
    context: PluginContext,
    source: string,
    file: string,
    referenceId: string,
    componentPath: string,
): string {
    const relativeFile = file.startsWith("./") ? file : `./${file}`;
    const escapedFile = escapeRegExp(relativeFile);
    let replacements = 0;
    const assetUrl = `new URL(import.meta.ROLLUP_FILE_URL_${referenceId})`;
    const urlPattern = new RegExp(`new\\s+URL\\(\\s*(['"])${escapedFile}\\1\\s*,\\s*import\\.meta\\.url\\s*\\)`, "g");
    let rewritten = source.replace(urlPattern, () => {
        replacements++;
        return assetUrl;
    });

    // In custom-instantiation mode Jco passes core filenames to the caller's
    // loader instead of constructing the URL itself.
    const bareFile = relativeFile.slice(2);
    const loaderPattern = new RegExp(`getCoreModule\\(\\s*(['"])${escapeRegExp(bareFile)}\\1\\s*\\)`, "g");
    rewritten = rewritten.replace(loaderPattern, () => {
        replacements++;
        return `getCoreModule(${assetUrl})`;
    });
    if (replacements === 0) {
        return context.error({
            id: componentPath,
            message: `Jco emitted ${file}, but its URL could not be located in the generated JavaScript`,
        });
    }
    return rewritten;
}

/** Check if a given URL has a query that is supported by the plugin (i.e. `component`) */
export function hasSupportedQuery(query: string): boolean {
    if (!query) {
        return true;
    }
    const params = new URLSearchParams(query.slice(1));
    return params.size === 1 && params.has("component");
}

/** Escape a regular expression */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
