pub fn is_js_identifier(s: &str) -> bool {
    let mut chars = s.chars();
    if let Some(char) = chars.next() {
        if !is_js_identifier_start(char) {
            return false;
        }
    } else {
        return false;
    }
    while let Some(char) = chars.next() {
        if !is_js_identifier_char(char) {
            return false;
        }
    }
    NOT_IDENTIFIERS.binary_search(&s).is_err()
}

// https://tc39.es/ecma262/#prod-IdentifierStartChar
// Unicode ID_Start | "$" | "_"
fn is_js_identifier_start(code: char) -> bool {
    return match code {
        'A'..='Z' | 'a'..='z' | '$' | '_' => true,
        // leaving out non-ascii for now...
        _ => false,
    };
}

// https://tc39.es/ecma262/#prod-IdentifierPartChar
// Unicode ID_Continue | "$" | U+200C | U+200D
fn is_js_identifier_char(code: char) -> bool {
    return match code {
        '0'..='9' | 'A'..='Z' | 'a'..='z' | '$' | '_' => true,
        // leaving out non-ascii for now...
        _ => false,
    };
}

pub fn maybe_quote_id(name: &str) -> String {
    if is_js_identifier(name) {
        name.to_string()
    } else {
        format!("'{name}'")
    }
}

pub fn maybe_quote_member(name: &str) -> String {
    if name == "*" {
        "".to_string()
    } else if is_js_identifier(name) {
        format!(".{name}")
    } else {
        format!("['{name}']")
    }
}

const NOT_IDENTIFIERS: &'static [&'static str] = &[
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
    "implements",
    "import",
    "in",
    "instanceof",
    "interface",
    "let",
    "new",
    "null",
    "package",
    "private",
    "protected",
    "public",
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
];
