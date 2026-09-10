import url, {
    URL,
    URLSearchParams,
    URLPattern,
    Url,
    domainToASCII,
    domainToUnicode,
    fileURLToPath,
    fileURLToPathBuffer,
    pathToFileURL,
    urlToHttpOptions,
    format,
} from "node:url";
import * as namespace from "node:url";
import { Buffer } from "node:buffer";
import { peer } from "./peer.js";

function errorOf(fn) {
    try {
        fn();
        return null;
    } catch (error) {
        return { name: error.name, code: error.code, message: error.message, input: error.input, base: error.base };
    }
}

// This same function runs in Node 24 as a differential oracle and in both
// component engines. Each named observation covers an application-visible API.
export function run() {
    const report = {};
    report.identity = [
        namespace.default === url,
        peer.url === url,
        peer.URL === URL,
        peer.URLSearchParams === URLSearchParams,
        URL === globalThis.URL,
        URLSearchParams === globalThis.URLSearchParams,
        Object.keys(url).every((key) => namespace[key] === url[key]),
        new URL("https://example.com").searchParams instanceof URLSearchParams,
        new URL("https://example.com").constructor === URL,
        new URLSearchParams().constructor === URLSearchParams,
    ];
    report.exports = Object.keys(url).sort();
    report.legacyConstructorName = Url.name;
    const value = new URL("../a b?x=1&x=2#top", "https://user:pass@BÜCHER.de:8443/base/");
    report.parts = Object.fromEntries(
        [
            "href",
            "origin",
            "protocol",
            "username",
            "password",
            "host",
            "hostname",
            "port",
            "pathname",
            "search",
            "hash",
        ].map((key) => [key, value[key]]),
    );
    report.serialization = [String(value), value.toJSON(), JSON.stringify(value)];
    const savedParams = value.searchParams;
    value.protocol = "http:";
    value.username = "two words";
    value.password = "p@ss";
    value.hostname = "EXAMPLE.COM";
    value.port = "80";
    value.pathname = "/c d/✓";
    value.search = "?a=1&a=2";
    value.hash = "last part";
    report.setters = [value.href, value.origin, value.port, value.searchParams === savedParams];
    savedParams.append("a", "3");
    savedParams.set("space", "two words");
    report.live = [value.href, savedParams.getAll("a")];
    value.href = "https://other.example/?z=9";
    report.reassigned = [savedParams === value.searchParams, savedParams.get("z"), savedParams.has("a")];
    report.static = [
        URL.canParse("../x", "https://example.com/a/"),
        URL.canParse("invalid"),
        URL.parse("invalid"),
        URL.parse("/x", "https://example.com").href,
    ];
    let calls = [];
    const coerced = new URL(
        {
            toString() {
                calls.push("input");
                return "/x";
            },
        },
        {
            toString() {
                calls.push("base");
                return "https://example.com";
            },
        },
    );
    report.coercion = [coerced.href, calls];
    class ChildURL extends URL {}
    const child = new ChildURL("https://example.com");
    report.subclass = [child instanceof ChildURL, child instanceof URL];
    report.special = [
        "http://0x7f.1/",
        "https://[2001:db8::1]:443/a/../b",
        "file:///tmp/a%20b",
        "data:text/plain,hello%20world",
        "mailto:a@example.com",
        "https://example.com/%2e%2e/b",
    ].map((text) => {
        const parsed = new URL(text);
        return [parsed.href, parsed.origin];
    });

    const params = new URLSearchParams("?b=two+words&a=1&a=2&empty=&flag&bad=%E0%A4%A&bom=%EF%BB%BF");
    report.paramsInitial = [
        params.size,
        [...params],
        params.get("missing"),
        params.getAll("a"),
        params.has("a", "2"),
        params.has("a", "3"),
    ];
    params.delete("a", "1");
    params.append("a", "3");
    params.set("b", "a+b & c");
    params.sort();
    const visited = [];
    const context = { prefix: "ctx:" };
    params.forEach(function (v, k, self) {
        visited.push([this.prefix + k, v, self === params]);
    }, context);
    report.paramsMutation = [
        params.toString(),
        [...params.keys()],
        [...params.values()],
        [...params.entries()],
        visited,
    ];
    report.paramsConstructors = [
        new URLSearchParams({ list: [1, 2], empty: "", flag: true }).toString(),
        new URLSearchParams(
            new Map([
                ["x", "✓"],
                ["y", "z"],
            ]),
        ).toString(),
        new URLSearchParams([
            ["x", "1"],
            ["x", "2"],
        ]).toString(),
        new URLSearchParams(params).toString(),
        new URLSearchParams(null).toString(),
        new URLSearchParams(123).toString(),
    ];
    const stable = new URLSearchParams("z=1&a=2&a=1&z=0");
    stable.sort();
    report.stableSort = stable.toString();
    stable.delete("a");
    report.deleteAll = [stable.size, stable.getAll("a")];

    report.domains = [
        "BÜCHER.de",
        "mañana.com",
        "測試",
        "EXAMPLE.COM",
        "faß.de",
        "ｅｘａｍｐｌｅ.com",
        "xn--bcher-kva.de",
        "bad host",
        "a@b",
        "a:80",
        "%65xample.com",
        "0x7f.1",
        "[::1]",
        "",
        "a/b",
    ].map((d) => [domainToASCII(d), domainToUnicode(d)]);
    report.posixFiles = ["/tmp/a b#c?d%é", "/tmp/back\\slash", "/tmp/a\nb\tc\rd", "/a/../b/", "/"].map((p) => {
        const parsed = pathToFileURL(p);
        return [
            parsed.href,
            fileURLToPath(parsed),
            Buffer.isBuffer(fileURLToPathBuffer(parsed)),
            fileURLToPathBuffer(parsed).toString("hex"),
        ];
    });
    report.windowsFiles = [
        "C:\\Program Files\\a#b?c.txt",
        "C:/a/../b/",
        "\\\\server\\share\\a b",
        "\\\\?\\UNC\\server\\share\\a",
    ].map((p) => {
        const parsed = pathToFileURL(p, { windows: true });
        return [
            parsed.href,
            fileURLToPath(parsed, { windows: true }),
            fileURLToPathBuffer(parsed, { windows: true }).toString("hex"),
        ];
    });
    report.fileBytes = ["file:///a/%FF%FE%80", "file:///a/%2F%5c", "file:///a/%ZZ%1", "file:///C:/%FF%2F%5c"].map(
        (s) => [...fileURLToPathBuffer(s, { windows: s.includes("C:") })],
    );
    report.uncUnicode = fileURLToPath("file://xn--bcher-kva.de/share/file", { windows: true });
    const formatted = new URL("https://u%20s:p%40ss@xn--bcher-kva.de:8443/a?b=1#c");
    report.format = [
        {},
        { auth: false },
        { fragment: false },
        { search: false },
        { unicode: true },
        { unicode: true, auth: false, search: false, fragment: false },
    ].map((options) => format(formatted, options));
    report.formatOriginal = formatted.href;
    report.legacyFormat = [
        {
            protocol: "https",
            hostname: "example.com",
            port: 8443,
            pathname: "a?b#c",
            query: { a: [1, 2], space: "a b" },
            hash: "end",
        },
        { protocol: "http:", hostname: "::1", auth: "u s:p@ss", pathname: "/" },
        { protocol: "file:", pathname: "/tmp/a" },
        { protocol: "mailto:", pathname: "a@example.com" },
        { host: "example.com", slashes: true, search: "x=#y", hash: "z" },
    ].map((input) => format(input));
    const legacy = new Url();
    report.legacyFields = Object.entries(legacy);
    Object.assign(legacy, {
        protocol: "https:",
        host: "example.com:443",
        pathname: "/base/file",
        href: "https://example.com:443/base/file",
    });
    legacy.parseHost();
    report.legacyObject = [
        legacy.hostname,
        legacy.port,
        legacy.format(),
        legacy.resolveObject({ pathname: "../next", hash: "#end", href: "../next#end" }).href,
    ];

    const http = new URL("https://u%20s:p%40ss@[::1]:8443/a?b=1#c");
    http.extra = "kept";
    const token = Symbol("token");
    http[token] = 42;
    const options = urlToHttpOptions(http);
    report.http = [options, Object.getPrototypeOf(options) === null, options[token]];
    const minimalHttp = urlToHttpOptions(new URL("https://example.com"));
    report.httpAbsent = [
        Object.hasOwn(minimalHttp, "port"),
        Object.hasOwn(minimalHttp, "auth"),
        Object.keys(minimalHttp).sort(),
    ];

    const pattern = new URLPattern("https://*.example.com/books/:id");
    const match = pattern.exec("https://api.example.com/books/42");
    report.pattern = [
        pattern.test("https://api.example.com/books/42"),
        pattern.test("https://api.example.com/other/42"),
        match.hostname.groups,
        match.pathname.groups,
        pattern.protocol,
        pattern.pathname,
    ];
    const relativePattern = new URLPattern("/books/:id", "https://example.com");
    report.relativePattern = [
        relativePattern.test("/books/1", "https://example.com"),
        relativePattern.exec("/books/1", "https://example.com").pathname.groups,
    ];
    const objectPattern = new URLPattern({ pathname: "/items/:name" });
    report.objectPattern = [
        objectPattern.test({ pathname: "/items/coffee" }),
        objectPattern.exec({ pathname: "/items/coffee" }).pathname.groups,
    ];
    const insensitive = new URLPattern({ pathname: "/BOOKS/:id" }, { ignoreCase: true });
    const regexPattern = new URLPattern({ pathname: "/books/:id(\\d+)" });
    report.patternOptions = [
        insensitive.test({ pathname: "/books/A" }),
        regexPattern.hasRegExpGroups,
        regexPattern.test({ pathname: "/books/123" }),
        regexPattern.test({ pathname: "/books/abc" }),
        pattern.hasRegExpGroups,
    ];
    report.errors = [
        () => new URL("invalid"),
        () => new URL("/x", "invalid"),
        () => new URL(),
        () => URL.canParse(),
        () => URL.parse(),
        () => domainToASCII(),
        () => domainToUnicode(),
        () => fileURLToPath("https://example.com"),
        () => fileURLToPath("file:///a%2Fb"),
        () => fileURLToPath("file:///C:/a%5Cb", { windows: true }),
        () => fileURLToPath("file:///relative", { windows: true }),
        () => fileURLToPath("file:///a/%FF"),
        () => pathToFileURL(42),
        () => format(new URL("https://example.com"), []),
        () => urlToHttpOptions(null),
    ].map(errorOf);
    return JSON.stringify(report);
}

export function policy() {
    let touched = false;
    const poison = new Proxy(
        {},
        {
            get() {
                touched = true;
                throw new Error("input accessed");
            },
        },
    );
    const errors = [
        () => url.parse(poison),
        () => url.resolve(poison, poison),
        () => url.resolveObject(poison, poison),
        () => url.format("https://example.com", poison),
        () => new Url().parse(poison),
        () => new Url().resolve(poison),
        () => URL.createObjectURL(poison),
        () => URL.revokeObjectURL(poison),
    ].map(errorOf);
    return JSON.stringify({ touched, errors, missingCwd: errorOf(() => pathToFileURL("relative"))?.message });
}
