just := env_var_or_default("JUST", "just")
just_dir := env_var_or_default("JUST_DIR", justfile_directory())
cargo := env_var_or_default("CARGO", "cargo")
npm := env_var_or_default("NPM", "npm")

@_default:
    {{just}} --list

# Run current jco build under preview2 tests
[group("test")]
test-preview2:
    {{npm}} run build
    {{cargo}} xtask generate preview2-tests
    {{cargo}} test -p jco node_
    {{cargo}} test -p jco deno_
