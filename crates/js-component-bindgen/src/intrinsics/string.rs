//! Intrinsics that represent helpers that manipulate strings
use std::fmt::Write;

use crate::uwriteln;
use crate::{intrinsics::Intrinsic, source::Source};

/// This enum contains intrinsics for manipulating strings
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum StringIntrinsic {
    Utf16Decoder,
    Utf16Encode,
    /// UTF8 Decoder (a JS `TextDecoder`)
    GlobalTextDecoderUtf8,
    /// UTF8 Encoder (a JS `TextEncoder`)
    GlobalTextEncoderUtf8,
    /// Encode a single string to memory
    Utf8Encode,
    ValidateGuestChar,
    ValidateHostChar,
}

impl StringIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve all global names for this intrinsic
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            Self::Utf16Decoder.name(),
            Self::Utf16Encode.name(),
            Self::GlobalTextDecoderUtf8.name(),
            Self::GlobalTextEncoderUtf8.name(),
            Self::Utf8Encode.name(),
            Self::ValidateGuestChar.name(),
            Self::ValidateHostChar.name(),
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::Utf16Decoder => "utf16Decoder",
            Self::Utf16Encode => "_utf16AllocateAndEncode",
            Self::GlobalTextDecoderUtf8 => "TEXT_DECODER_UTF8",
            Self::GlobalTextEncoderUtf8 => "TEXT_ENCODER_UTF8",
            Self::Utf8Encode => "_utf8AllocateAndEncode",
            Self::ValidateGuestChar => "validateGuestChar",
            Self::ValidateHostChar => "validateHostChar",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        let name = self.name();
        match self {
            Self::Utf16Decoder => uwriteln!(output, "const {name} = new TextDecoder('utf-16');"),

            Self::Utf16Encode => {
                let is_le = Intrinsic::IsLE.name();
                uwriteln!(
                    output,
                    r#"
                      function {name}(str, realloc, memory) {{
                          const len = str.length;
                          const ptr = realloc(0, 0, 2, len * 2);
                          const out = new Uint16Array(memory.buffer, ptr, len);
                          let i = 0;
                          if ({is_le}) {{
                              while (i < len) {{ out[i] = str.charCodeAt(i++); }}
                          }} else {{
                              while (i < len) {{
                                  const ch = str.charCodeAt(i);
                                  out[i++] = (ch & 0xff) << 8 | ch >>> 8;
                              }}
                          }}
                          return {{ ptr, len, codepoints: [...str].length }};
                      }}
                    "#
                );
            }

            Self::GlobalTextDecoderUtf8 => uwriteln!(output, "const {name} = new TextDecoder();"),
            Self::GlobalTextEncoderUtf8 => uwriteln!(output, "const {name} = new TextEncoder();"),

            Self::Utf8Encode => {
                let encoder = Self::GlobalTextEncoderUtf8.name();
                uwriteln!(
                    output,
                    r#"
                      function {name}(s, realloc, memory) {{
                          if (typeof s !== 'string') {{
                              throw new TypeError('expected a string, received [' + typeof s + ']');
                          }}
                          if (s.length === 0) {{ return {{ ptr: 1, len: 0 }}; }}
                          let buf = {encoder}.encode(s);
                          let ptr = realloc(0, 0, 1, buf.length);
                          new Uint8Array(memory.buffer).set(buf, ptr);
                          return {{ ptr, len: buf.length, codepoints: [...s].length }};
                      }}
                    "#
                );
            }

            Self::ValidateGuestChar => uwriteln!(
                output,
                r#"
                  function {name}(i) {{
                      if ((i > 0x10ffff) || (i >= 0xd800 && i <= 0xdfff)) {{ throw new TypeError(`not a valid char`); }}
                      return String.fromCodePoint(i);
                  }}
                "#,
            ),

            Self::ValidateHostChar => uwriteln!(
                output,
                r#"
                  function {name}(s) {{
                      if (typeof s !== 'string') {{ throw new TypeError(`must be a string`); }}
                      return s.codePointAt(0);
                  }}
                "#
            ),
        }
    }
}
