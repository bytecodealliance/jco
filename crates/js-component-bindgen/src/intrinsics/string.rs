//! Intrinsics that represent helpers that manipulate strings
use std::fmt::Write;

use crate::uwrite;
use crate::{intrinsics::Intrinsic, source::Source};

/// This enum contains intrinsics for manipulating strings
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum StringIntrinsic {
    Utf16Decoder,
    Utf16Encode,
    Utf8Decoder,
    Utf8Encode,
    Utf8EncodedLen,
    ValidateGuestChar,
    ValidateHostChar,
}

impl StringIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            "utf16Decoder",
            "utf16Encode",
            "utf8Decoder",
            "utf8Encode",
            "utf8EncodedLen",
            "validateGuestChar",
            "validateHostChar",
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::Utf16Decoder => "utf16Decoder",
            Self::Utf16Encode => "utf16Encode",
            Self::Utf8Decoder => "utf8Decoder",
            Self::Utf8Encode => "utf8Encode",
            Self::Utf8EncodedLen => "utf8EncodedLen",
            Self::ValidateGuestChar => "validateGuestChar",
            Self::ValidateHostChar => "validateHostChar",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::Utf16Decoder => output.push_str(
                "
                const utf16Decoder = new TextDecoder('utf-16');
            ",
            ),

            Self::Utf16Encode => {
                let is_le = Intrinsic::IsLE.name();
                uwrite!(output, "
                    function utf16Encode (str, realloc, memory) {{
                        const len = str.length, ptr = realloc(0, 0, 2, len * 2), out = new Uint16Array(memory.buffer, ptr, len);
                        let i = 0;
                        if ({is_le}) {{
                            while (i < len) out[i] = str.charCodeAt(i++);
                        }} else {{
                            while (i < len) {{
                                const ch = str.charCodeAt(i);
                                out[i++] = (ch & 0xff) << 8 | ch >>> 8;
                            }}
                        }}
                        return ptr;
                    }}
                ");
            }

            Self::Utf8Decoder => output.push_str(
                "
                const utf8Decoder = new TextDecoder();
            ",
            ),

            Self::Utf8EncodedLen => {}

            Self::Utf8Encode => output.push_str(
                "
                const utf8Encoder = new TextEncoder();
                let utf8EncodedLen = 0;
                function utf8Encode(s, realloc, memory) {
                    if (typeof s !== 'string') \
                    throw new TypeError('expected a string, received [' + typeof s + ']');
                    if (s.length === 0) {
                        utf8EncodedLen = 0;
                        return 1;
                    }
                    let buf = utf8Encoder.encode(s);
                    let ptr = realloc(0, 0, 1, buf.length);
                    new Uint8Array(memory.buffer).set(buf, ptr);
                    utf8EncodedLen = buf.length;
                    return ptr;
                }
            ",
            ),

            Self::ValidateGuestChar => output.push_str(
                "
                function validateGuestChar(i) {
                    if ((i > 0x10ffff) || (i >= 0xd800 && i <= 0xdfff)) \
                    throw new TypeError(`not a valid char`);
                    return String.fromCodePoint(i);
                }
            ",
            ),

            Self::ValidateHostChar => output.push_str(
                "
                function validateHostChar(s) {
                    if (typeof s !== 'string') \
                    throw new TypeError(`must be a string`);
                    return s.codePointAt(0);
                }
            ",
            ),
        }
    }
}
