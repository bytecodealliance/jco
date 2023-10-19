use heck::ToLowerCamelCase;
use std::collections::hash_map::RandomState;
use std::collections::{HashMap, HashSet};
use std::hash::{BuildHasher, Hash, Hasher};

#[derive(Default)]
pub struct LocalNames {
    // map from exact name to generated local name
    local_name_ids: HashMap<u64, String>,
    local_names: HashSet<String>,
    random_state: RandomState,
}

impl<'a> LocalNames {
    /// provide known global identifier names to exclude from being assigned
    pub fn exclude_globals(&mut self, globals: &[&str]) {
        for name in globals {
            self.local_names.insert(name.to_string());
        }
    }

    /// get a unique identifier name for a string once (can't be looked up again)
    pub fn create_once(&'a mut self, goal_name: &str) -> &'a str {
        let goal_name = if let Some(last_char) = goal_name.rfind('/') {
            &goal_name[last_char + 1..]
        } else {
            &goal_name
        };
        let mut goal = to_js_identifier(goal_name);
        if self.local_names.contains(&goal) {
            let mut idx = 1;
            loop {
                let valid_name_suffixed = format!("{goal}${}", idx.to_string());
                if !self.local_names.contains(&valid_name_suffixed) {
                    goal = valid_name_suffixed;
                    break;
                }
                idx += 1;
            }
        }
        self.local_names.insert(goal.to_string());
        self.local_names.get(&goal).unwrap()
    }

    pub fn get<H: Hash>(&'a self, unique_id: H) -> &'a str {
        let mut new_s = self.random_state.build_hasher();
        unique_id.hash(&mut new_s);
        let hash = new_s.finish();
        if !self.local_name_ids.contains_key(&hash) {
            panic!("Internal error, no name defined for {}", hash);
        }
        &self.local_name_ids[&hash]
    }

    /// get or create a unique identifier for a string while storing the lookup by unique id
    pub fn get_or_create<H: Hash>(&'a mut self, unique_id: H, goal_name: &str) -> (&'a str, bool) {
        let mut new_s = self.random_state.build_hasher();
        unique_id.hash(&mut new_s);
        let hash = new_s.finish();
        let mut seen = true;
        if !self.local_name_ids.contains_key(&hash) {
            let goal = self.create_once(goal_name).to_string();
            self.local_name_ids.insert(hash, goal);
            seen = false;
        }
        (self.local_name_ids.get(&hash).unwrap(), seen)
    }
}

// Convert an arbitrary string to a similar close js identifier
pub fn to_js_identifier(goal_name: &str) -> String {
    if is_js_identifier(goal_name) {
        goal_name.to_string()
    } else {
        let goal = goal_name.to_lower_camel_case();
        let mut identifier = String::new();
        for char in goal.chars() {
            let valid_char = if identifier.len() == 0 {
                is_js_identifier_start(char)
            } else {
                is_js_identifier_char(char)
            };
            if valid_char {
                identifier.push(char);
            } else {
                identifier.push(match char {
                    '.' => '_',
                    _ => '$',
                });
            }
        }
        if !is_js_identifier(&identifier) {
            identifier = format!("_{identifier}");
            if !is_js_identifier(&identifier) {
                panic!("Unable to generate valid identifier {identifier} for '{goal_name}'");
            }
        }
        identifier
    }
}

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
    RESERVED_KEYWORDS.binary_search(&s).is_err()
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

pub(crate) const RESERVED_KEYWORDS: &'static [&'static str] = &[
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
