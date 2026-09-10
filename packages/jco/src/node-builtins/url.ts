import { urlPatternSource } from "./url-pattern.js";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
    builtin,
    composeBuiltins,
    stdModule,
    VIRTUAL_PREFIX,
    type BuiltinAdapter,
    type BuiltinContext,
} from "./shared.js";

/** URL operations are pure except relative path resolution, which reads WASI cwd. */
export function createUrlBuiltin({ options, worldMetadata }: BuiltinContext): BuiltinAdapter {
    let patternModule: string | undefined;
    let idnaModule: string | undefined;
    const idnaId = `${VIRTUAL_PREFIX}url-idna`;
    const patternId = `${VIRTUAL_PREFIX}url-pattern.cjs`;
    const publicAdapter = builtin("node:url", () => {
        const environments = (worldMetadata?.imports ?? []).filter(
            (iface) =>
                iface.namespace === "wasi" &&
                iface.package === "cli" &&
                iface.interface === "environment" &&
                iface.version?.major === 0n &&
                iface.version?.minor === 2n,
        );
        let providerSource: string;
        if (environments.length === 1) {
            const { major, minor, patch, pre } = environments[0].version!;
            providerSource = `import { initialCwd, getEnvironment } from "wasi:cli/environment@${major}.${minor}.${patch}${pre ? `-${pre}` : ""}";`;
        } else {
            const message =
                environments.length === 0
                    ? "node:url relative pathToFileURL requires wasi:cli/environment@0.2.x"
                    : "node:url relative pathToFileURL cannot select among multiple wasi:cli/environment@0.2.x versions";
            providerSource = `function initialCwd() { throw new Error(${JSON.stringify(message)}); }\nconst getEnvironment = initialCwd;`;
        }
        return `
import { createUrl } from ${JSON.stringify(stdModule(options.urlFactory, "url"))};
${providerSource}
const url = createUrl({ initialCwd, getEnvironment });
// The Node module and global web APIs must share classes and search-param state.
globalThis.URL = url.URL;
globalThis.URLSearchParams = url.URLSearchParams;
globalThis.URLPattern = url.URLPattern;
export default url;
export const { Url, parse, resolve, resolveObject, format, URL, URLPattern, URLSearchParams,
    domainToASCII, domainToUnicode, pathToFileURL, fileURLToPath, fileURLToPathBuffer, urlToHttpOptions } = url;
`;
    });
    // Resolve only the audited dependency graph. Lexical prefilters avoid even
    // resolving packages when an unrelated application import is encountered.
    const factoryRequire = () => createRequire(stdModule(options.urlFactory, "url"));
    const whatwgDirectory = () => dirname(factoryRequire().resolve("whatwg-url/lib/encoding.js"));
    const tr46Path = () => createRequire(factoryRequire().resolve("whatwg-url")).resolve("tr46");
    return composeBuiltins([
        publicAdapter,
        {
            resolveId(id, importer) {
                if (
                    id === "urlpattern-polyfill/urlpattern" &&
                    importer &&
                    /[/\\]url[/\\]whatwg\.js$/.test(importer) &&
                    importer === join(dirname(stdModule(options.urlFactory, "url")), "url", "whatwg.js")
                ) {
                    patternModule = createRequire(importer).resolve(id);
                    return patternId;
                }
                if (
                    id === "tr46" &&
                    importer &&
                    /[/\\]whatwg-url[/\\]lib[/\\]url-state-machine\.js$/.test(importer) &&
                    dirname(importer) === whatwgDirectory()
                ) {
                    idnaModule = tr46Path();
                    return idnaId;
                }
                if (
                    importer &&
                    ((id === "webidl-conversions" &&
                        /[/\\]whatwg-url[/\\]lib[/\\][^/\\]+$/.test(importer) &&
                        dirname(importer) === whatwgDirectory()) ||
                        (id === "punycode/" && /[/\\]tr46[/\\]index\.js$/.test(importer) && importer === tr46Path()))
                ) {
                    return createRequire(importer).resolve(id);
                }
                if (!importer || !/[/\\]whatwg-url[/\\]lib[/\\][^/\\]+$/.test(importer)) {
                    return null;
                }
                if (id !== "./encoding" && id !== "./encoding.js") {
                    return null;
                }
                if (dirname(importer) !== whatwgDirectory()) {
                    return null;
                }
                return stdModule(options.urlEncodingModule, "url/encoding");
            },
            load(id) {
                if (id === patternId && patternModule) {
                    return urlPatternSource(patternModule);
                }
                if (id === idnaId && idnaModule) {
                    return `
import fallback from ${JSON.stringify(idnaModule)};
import { createIDNA } from ${JSON.stringify(stdModule(undefined, "url/idna"))};
const idna = createIDNA(fallback);
export const toASCII = idna.toASCII;
export default idna;
`;
                }
                return null;
            },
        },
    ]);
}
