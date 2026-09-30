//! Intrinsics that represent helpers that manipulate strings
use std::fmt::Write;

use crate::intrinsics::RenderIntrinsicsArgs;
use crate::uwriteln;
use crate::{intrinsics::Intrinsic, source::Source};

/// This enum contains intrinsics for manipulating strings
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum StringIntrinsic {
    /// UTF16 Decoder (a JS `TextDecoder`)
    ///
    /// Decoding throws on unpaired surrogates, and keeps a leading U+FEFF.
    Utf16Decoder,

    Utf16Encode,

    Utf16EncodeAsync,

    /// Copy UTF-16 code units between two equal-length `Uint16Array`s,
    /// throwing on unpaired surrogates
    ///
    /// Returns whether every code unit copied fits in latin1.
    Utf16ValidatingCopy,

    /// UTF8 Decoder (a JS `TextDecoder`)
    ///
    /// Decoding throws on invalid UTF-8, and keeps a leading U+FEFF.
    GlobalTextDecoderUtf8,

    /// UTF8 Encoder (a JS `TextEncoder`)
    GlobalTextEncoderUtf8,

    /// Encode a single string to memory
    Utf8Encode,

    Utf8EncodeAsync,

    ValidateGuestChar,

    ValidateHostChar,
}

impl StringIntrinsic {
    /// Retrieve all global names for this intrinsic
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        [
            Self::Utf16Decoder.name(),
            Self::Utf16Encode.name(),
            Self::Utf16EncodeAsync.name(),
            Self::Utf16ValidatingCopy.name(),
            Self::GlobalTextDecoderUtf8.name(),
            Self::GlobalTextEncoderUtf8.name(),
            Self::Utf8Encode.name(),
            Self::Utf8EncodeAsync.name(),
            Self::ValidateGuestChar.name(),
            Self::ValidateHostChar.name(),
        ]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::Utf16Decoder => "utf16Decoder",
            Self::Utf16Encode => "_utf16AllocateAndEncode",
            Self::Utf16EncodeAsync => "_utf16AllocateAndEncodeAsync",
            Self::Utf16ValidatingCopy => "_utf16ValidatingCopy",
            Self::GlobalTextDecoderUtf8 => "TEXT_DECODER_UTF8",
            Self::GlobalTextEncoderUtf8 => "TEXT_ENCODER_UTF8",
            Self::Utf8Encode => "_utf8AllocateAndEncode",
            Self::Utf8EncodeAsync => "_utf8AllocateAndEncodeAsync",
            Self::ValidateGuestChar => "validateGuestChar",
            Self::ValidateHostChar => "validateHostChar",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source, render_args: &RenderIntrinsicsArgs<'_>) {
        let name = self.name();
        match self {
            // NOTE: strings that are lifted must be passed on exactly as they were provided,
            // so the decoders neither replace invalid sequences nor drop a leading U+FEFF
            Self::Utf16Decoder => uwriteln!(
                output,
                "const {name} = new TextDecoder('utf-16', {{ fatal: true, ignoreBOM: true }});"
            ),

            Self::Utf16Encode | Self::Utf16EncodeAsync => {
                let is_le = render_args.require_intrinsic(Intrinsic::IsLE);

                let (fn_preamble, realloc_call) = match self {
                    Self::Utf16Encode => ("", "realloc"),
                    Self::Utf16EncodeAsync => ("async ", "await realloc"),
                    _ => unreachable!("unexpected intrinsic"),
                };
                uwriteln!(
                    output,
                    r#"
                      {fn_preamble}function {name}(str, realloc, memory) {{
                          if (typeof str !== 'string') {{
                              throw new TypeError('expected a string, received [' + typeof str + ']');
                          }}
                          const len = str.length;
                          const ptr = {realloc_call}(0, 0, 2, len * 2);
                          const out = new Uint16Array(memory.buffer, ptr, len);
                          const put = {is_le}
                              ? (i, ch) => {{ out[i] = ch; }}
                              : (i, ch) => {{ out[i] = (ch & 0xff) << 8 | ch >>> 8; }};
                          for (let i = 0; i < len; i++) {{
                              let ch = str.charCodeAt(i);
                              if ((ch & 0xf800) === 0xd800) {{
                                  if (ch < 0xdc00 && i + 1 < len && (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {{
                                      put(i++, ch);
                                      ch = str.charCodeAt(i);
                                  }} else {{
                                      // Unpaired surrogates are replaced, as when converting to a `USVString`
                                      ch = 0xfffd;
                                  }}
                              }}
                              put(i, ch);
                          }}
                          return {{ ptr, len, codepoints: [...str].length }};
                      }}
                    "#
                );
            }

            Self::Utf16ValidatingCopy => uwriteln!(
                output,
                r#"
                  function {name}(from, to) {{
                      let allLatin1 = true;
                      let highSurrogate = false;
                      for (let i = 0; i < from.length; i++) {{
                          const unit = from[i];
                          if (highSurrogate !== ((unit & 0xfc00) === 0xdc00)) {{ throw new Error('invalid utf16 encoding'); }}
                          highSurrogate = (unit & 0xfc00) === 0xd800;
                          if (unit > 0xff) {{ allLatin1 = false; }}
                          to[i] = unit;
                      }}
                      if (highSurrogate) {{ throw new Error('invalid utf16 encoding'); }}
                      return allLatin1;
                  }}
                "#
            ),

            Self::GlobalTextDecoderUtf8 => uwriteln!(
                output,
                "const {name} = new TextDecoder('utf-8', {{ fatal: true, ignoreBOM: true }});"
            ),
            Self::GlobalTextEncoderUtf8 => uwriteln!(output, "const {name} = new TextEncoder();"),

            Self::Utf8Encode | Self::Utf8EncodeAsync => {
                let encoder = render_args.require_intrinsic(Self::GlobalTextEncoderUtf8);
                let (fn_preamble, realloc_call) = match self {
                    Self::Utf8Encode => ("", "realloc"),
                    Self::Utf8EncodeAsync => ("async ", "await realloc"),
                    _ => unreachable!("unexpected intrinsic"),
                };
                uwriteln!(
                    output,
                    r#"
                      {fn_preamble}function {name}(s, realloc, memory) {{
                          if (typeof s !== 'string') {{
                              throw new TypeError('expected a string, received [' + typeof s + ']');
                          }}
                          if (s.length === 0) {{ return {{ ptr: 1, len: 0 }}; }}
                          // Compute the exact allocation size up front. Some older preview1
                          // adapters only support an initial allocation, not a subsequent shrink.
                          let len = 0;
                          let codepoints = 0;
                          for (let i = 0; i < s.length; i++) {{
                              const ch = s.charCodeAt(i);
                              codepoints++;
                              if (ch < 0x80) {{ len += 1; }}
                              else if (ch < 0x800) {{ len += 2; }}
                              else if (ch >= 0xd800 && ch <= 0xdbff &&
                                       i + 1 < s.length &&
                                       (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {{
                                  len += 4;
                                  i++;
                              }} else {{ len += 3; }}
                          }}
                          const ptr = {realloc_call}(0, 0, 1, len);
                          const {{ read, written }} = {encoder}.encodeInto(
                              s,
                              new Uint8Array(memory.buffer, ptr, len),
                          );
                          if (read !== s.length || written !== len) {{
                              throw new Error('failed to encode whole string');
                          }}
                          const res = {{ ptr, len, codepoints }};
                          return res;
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
