import querystring, { decode, encode, escape, parse, stringify, unescape, unescapeBuffer } from "node:querystring";

export function run() {
    const parsed = parse("value=one&value=two+words&empty=&flag&bad=%E0%A4%A");
    const custom = decode("first:one;second:two+words", ";", ":");
    const limited = parse("first=1&second=2&third=3", undefined, undefined, { maxKeys: 2 });
    const encoded = stringify({ value: ["one", "two words"], empty: "", enabled: true, nil: null });
    const customEncoded = encode({ first: "one", second: "two words" }, ";", ":", {
        encodeURIComponent: (value) => `[${value}]`,
    });

    return {
        repeated: parsed.value,
        empty: parsed.empty,
        flag: parsed.flag,
        malformedFallback: typeof parsed.bad === "string" && parsed.bad.endsWith("%A"),
        customFirst: custom.first,
        customSecond: custom.second,
        limitedKeys: Object.keys(limited).length,
        encoded,
        customEncoded,
        escaped: escape("a b+c/✓"),
        unescaped: unescape("a+b%2Bc%2F%E2%9C%93"),
        bufferBytes: [...unescapeBuffer("%41+%42", true)],
        nullPrototype: Object.getPrototypeOf(parsed) === null,
        namespaceChecks:
            Number(querystring.parse === parse) +
            Number(querystring.decode === decode) +
            Number(querystring.stringify === stringify) +
            Number(querystring.encode === encode),
    };
}
