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
    const pattern = new RegExp(`new\\s+URL\\(\\s*(['"])${escapedFile}\\1\\s*,\\s*import\\.meta\\.url\\s*\\)`, "g");
    let replacements = 0;
    const rewritten = source.replace(pattern, () => {
        replacements++;
        return `new URL(import.meta.ROLLUP_FILE_URL_${referenceId})`;
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
