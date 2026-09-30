# jco issue 2178

Reproduction for https://github.com/bytecodealliance/jco/issues/2178.

`caller` and `callee` are MoonBit components, both embedded with the `utf16` string
encoding. Once composed, strings passed between them go through a UTF-16 to UTF-16
copy (`Transcode::Copy(FixedEncoding::Utf16)`).
