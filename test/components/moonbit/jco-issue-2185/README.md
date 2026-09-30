# jco issue 2185

Reproduction for https://github.com/bytecodealliance/jco/issues/2185.

A MoonBit component, embedded with the `utf16` string encoding, whose async exports
return a `string` and a `list<string>`. Their results are lifted from `task.return`
by `_liftFlatStringUTF16`, from the params and from memory respectively.
