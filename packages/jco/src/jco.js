#!/usr/bin/env node

import { program, Option } from 'commander';

import { opt } from './cmd/opt.js';
import { transpile } from './cmd/transpile.js';
import { types, guestTypes } from './cmd/types.js';
import { run as runCmd, serve as serveCmd } from './cmd/run.js';
import {
    parse,
    print,
    componentNew,
    componentEmbed,
    metadataAdd,
    metadataShow,
    componentWit,
} from './cmd/wasm-tools.js';
import { componentize } from './cmd/componentize.js';
import { styleText } from './common.js';

program
    .name('jco')
    .description(
        `${styleText('bold', "jco - WebAssembly JS Component Tools")}\n      JS Component Transpilation Bindgen & Wasm Tools for JS`
    )
    .usage('<command> [options]')
    .enablePositionalOptions()
    .version('1.15.4');

function myParseInt(value) {
    return parseInt(value, 10);
}

/**
 * Option parsing that allows for collecting repeated arguments
 *
 * @param {string} value - the new value that is added
 * @param {string[]} previous - the existing list of values
 */
function collectOptions(value, previous) {
    return previous.concat([value]);
}

/** Choices for features (enabling/disabling) */
const FEATURE_CHOICES = [
    'clocks',
    'http',
    'random',
    'stdio',
    'fetch-event',
    'all',
];

program
    .command('componentize')
    .description('Create a component from a JavaScript module')
    .usage('<js-source> --wit wit-world.wit -o <component-path>')
    .argument('<js-source>', 'JS source file to build')
    .requiredOption('-w, --wit <path>', 'WIT path to build with')
    .option('-n, --world-name <name>', 'WIT world to build')
    .option('--aot', 'Enable Weval AOT compilation of JS')
    .option(
        '--aot-min-stack-size-bytes <number>',
        'Set the min stack size to be used during AOT'
    )
    .option('--weval-bin <path>', 'Specify a custom weval binary to use')
    .addOption(
        new Option(
            '-d, --disable <feature...>',
            'disable WASI features'
        ).choices(FEATURE_CHOICES)
    )
    .addOption(
        new Option('--enable <feature...>', 'enable WASI features').choices(
            FEATURE_CHOICES
        )
    )
    .option(
        '--debug',
        'configure jco for debug (e.g. disable all features except stdio, etc)'
    )
    .option(
        '--preview2-adapter <adapter>',
        'provide a custom preview2 adapter path'
    )
    .option(
        '--debug-starlingmonkey-build',
        'use a debug build of StarlingMonkey'
    )
    .option('--engine <path>', 'use a specific StarlingMonkey build')
    .requiredOption('-o, --out <out>', 'output component file')
    .option(
        '--debug-bindings',
        'Output debug bindings and metadata during componentization (by default to stderr)'
    )
    .option(
        '--debug-bindings-dir <dir>',
        'Directory to which to output generated bindings and metadata'
    )
    .option(
        '--debug-binary',
        'Output binary (without component metadata) created during componentization (by default to tmp dir)'
    )
    .option(
        '--debug-binary-path <path>',
        'Path to which to write the generated debug binary'
    )
    .option('--debug-enable-wizer-logging', 'Enable wizer call debugging')
    .action(asyncAction(componentize));

program
    .command('transpile')
    .description(
        'Transpile a WebAssembly Component to JS + core Wasm for JavaScript execution'
    )
    .usage('<component-path> -o <out-dir>')
    .argument('<component-path>', 'Wasm component binary filepath')
    .option('--name <name>', 'custom output name')
    .requiredOption('-o, --out-dir <out-dir>', 'output directory')
    .option(
        '-m, --minify',
        'minify the JS output (--optimize / opt cmd still required)'
    )
    .option(
        '-O, --optimize',
        `optimize the component first (use -- and arguments to wasm-opt)`
    )
    .option('--no-typescript', 'do not output TypeScript .d.ts types')
    .option(
        '--valid-lifting-optimization',
        'optimize component binary validations assuming all lifted values are valid'
    )
    .addOption(
        new Option('--import-bindings [mode]', 'bindings mode for imports')
            .choices(['js', 'optimized', 'hybrid', 'direct-optimized'])
            .preset('js')
    )
    .addOption(
        new Option(
            '--async-mode [mode]',
            'EXPERIMENTAL: use async imports and exports'
        )
            .choices(['sync', 'jspi'])
            .preset('sync')
    )
    .option(
        '--async-wasi-imports',
        'EXPERIMENTAL: async component imports from WASI interfaces'
    )
    .option(
        '--async-wasi-exports',
        'EXPERIMENTAL: async component exports from WASI interfaces'
    )
    .option(
        '--async-imports <imports...>',
        'EXPERIMENTAL: async component imports (examples: "wasi:io/poll@0.2.0#poll", "wasi:io/poll#[method]pollable.block")'
    )
    .option(
        '--async-exports <exports...>',
        'EXPERIMENTAL: async component exports (examples: "wasi:cli/run@#run", "handle")'
    )
    .option('--tracing', 'emit `tracing` calls on function entry/exit')
    .option(
        '-b, --base64-cutoff <bytes>',
        'set the byte size under which core Wasm binaries will be inlined as base64',
        myParseInt
    )
    .option(
        '--tla-compat',
        'enables compatibility for JS environments without top-level await support via an async $init promise export'
    )
    .option(
        '--no-nodejs-compat',
        'disables compatibility in Node.js without a fetch global'
    )
    .option(
        '-M, --map <mappings...>',
        'specifier=./output custom mappings for the component imports'
    )
    .option(
        '--no-wasi-shim',
        'disable automatic rewriting of WASI imports to use @bytecodealliance/preview2-shim'
    )
    .option('--stub', 'generate a stub implementation from a WIT file directly')
    .option('--js', 'output JS instead of core WebAssembly')
    .addOption(
        new Option(
            '-I, --instantiation [mode]',
            'output for custom module instantiation'
        )
            .choices(['async', 'sync'])
            .preset('async')
    )
    .option('-q, --quiet', 'disable output summary')
    .option(
        '--no-namespaced-exports',
        'disable namespaced exports for typescript compatibility'
    )
    .option('--multi-memory', 'optimized output for Wasm multi-memory')
    .allowExcessArguments(true)
    .action(asyncAction(transpile));

program
    .command('types')
    .description('Generate types for the given WIT')
    .usage('<wit-path> -o <out-dir>')
    .argument('[<wit-path>]', 'path to a WIT file or directory')
    .option('--name <name>', 'custom output name')
    .option('-n, --world-name <world>', 'WIT world to generate types for')
    .option('-o, --out-dir <out-dir>', 'output directory')
    .option(
        '--tla-compat',
        'generates types for the TLA compat output with an async $init promise export'
    )
    .addOption(
        new Option(
            '-I, --instantiation [mode]',
            'type output for custom module instantiation'
        )
            .choices(['async', 'sync'])
            .preset('async')
    )
    .addOption(
        new Option(
            '--async-mode [mode]',
            'EXPERIMENTAL: use async imports and exports'
        )
            .choices(['sync', 'jspi'])
            .preset('sync')
    )
    .option(
        '--async-wasi-imports',
        'EXPERIMENTAL: async component imports from WASI interfaces'
    )
    .option(
        '--async-wasi-exports',
        'EXPERIMENTAL: async component exports from WASI interfaces'
    )
    .option(
        '--async-imports <imports...>',
        'EXPERIMENTAL: async component imports (examples: "wasi:io/poll@0.2.0#poll", "wasi:io/poll#[method]pollable.block")'
    )
    .option(
        '--async-exports <exports...>',
        'EXPERIMENTAL: async component exports (examples: "ns:pkg/iface#func", "wasi:cli/run@0.2.3#run", "handle")'
    )
    .option('-q, --quiet', 'disable output summary')
    .option(
        '--feature <feature>',
        'enable one specific WIT feature (repeatable)',
        collectOptions,
        []
    )
    .option('--all-features', 'enable all features')
    .option(
        "--wasm-opt-bin <path-to-wasm-opt>', 'wasm-opt binary path (default: 'binaryen/bin/wasm-opt')"
    )
    .action(asyncAction(types));

program
    .command('guest-types')
    .description('(experimental) Generate guest types for the given WIT')
    .usage('<wit-path> -o <out-dir>')
    .argument('[<wit-path>]', 'path to a WIT file or directory')
    .option('--name <name>', 'custom output name')
    .option('-n, --world-name <world>', 'WIT world to generate types for')
    .option('-o, --out-dir <out-dir>', 'output directory')
    .option('-q, --quiet', 'disable output summary')
    .option(
        '--feature <feature>',
        'enable one specific WIT feature (repeatable)',
        collectOptions,
        []
    )
    .option('--all-features', 'enable all features')
    .option(
        '--async-exports <exports...>',
        'EXPERIMENTAL: generate async exports (examples: "ns:pkg/iface#func", "wasi:cli/run@0.2.3#run", "handle")'
    )
    .addOption(
        new Option(
            '--async-mode [mode]',
            'EXPERIMENTAL: use async imports and exports'
        )
            .choices(['sync', 'jspi'])
            .preset('sync')
    )
    .action(asyncAction(guestTypes));

program
    .command('run')
    .description('Run a WASI Command component')
    .usage('<command.wasm> <args...>')
    .helpOption(false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument('<command>', 'WASI command binary to run')
    .option(
        '--jco-dir <dir>',
        'Instead of using a temporary dir, set the output directory for the run command'
    )
    .option('--jco-trace', 'Enable call tracing')
    .option(
        '--jco-import <module>',
        'Custom module to import before the run executes to support custom environment setup'
    )
    .option(
        '--jco-map <mappings...>',
        'specifier=./output custom mappings for the component imports'
    )
    .addOption(
        new Option('--jco-import-bindings [mode]', 'bindings mode for imports')
            .choices(['js', 'optimized', 'hybrid', 'direct-optimized'])
            .preset('js')
    )
    .argument('[args...]', 'Any CLI arguments for the component')
    .action(
        asyncAction(async function run(cmd, args, opts, command) {
            // specially only allow help option in first position
            if (cmd === '--help' || cmd === '-h') {
                command.help();
            } else {
                return runCmd(cmd, args, opts);
            }
        })
    );

program
    .command('serve')
    .description('Serve a WASI HTTP component')
    .usage('<server.wasm> <args...>')
    .helpOption(false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument('<server>', 'WASI server binary to run')
    .option('--port <number>')
    .option('--host <host>')
    .option(
        '--jco-dir <dir>',
        'Instead of using a temporary dir, set the output directory for the transpiled code'
    )
    .option('--jco-trace', 'Enable call tracing')
    .option(
        '--jco-import <module>',
        'Custom module to import before the server executes to support custom environment setup'
    )
    .addOption(
        new Option('--jco-import-bindings [mode]', 'bindings mode for imports')
            .choices(['js', 'optimized', 'hybrid', 'direct-optimized'])
            .preset('js')
    )
    .option(
        '--jco-map <mappings...>',
        'specifier=./output custom mappings for the component imports'
    )
    .argument('[args...]', 'Any CLI arguments for the component')
    .action(
        asyncAction(async function serve(cmd, args, opts, command) {
            // specially only allow help option in first position
            if (cmd === '--help' || cmd === '-h') {
                command.help();
            } else {
                return serveCmd(cmd, args, opts);
            }
        })
    );

program
    .command('opt')
    .description(
        'optimizes a Wasm component, including running wasm-opt Binaryen optimizations'
    )
    .usage('<component-file> -o <output-file> -- [wasm-opt arguments]')
    .argument('<component-file>', 'Wasm component binary filepath')
    .requiredOption(
        '-o, --output <output-file>',
        'optimized component output filepath'
    )
    .option('--asyncify', 'runs Asyncify pass in wasm-opt')
    .option('-q, --quiet')
    .option(
        "--wasm-opt-bin <path-to-wasm-opt>', 'wasm-opt binary path (default: 'binaryen/bin/wasm-opt')"
    )
    .allowExcessArguments(true)
    .action(asyncAction(opt));

program
    .command('wit')
    .description(
        'extract the WIT from a WebAssembly Component [wasm-tools component wit]'
    )
    .argument('<component-path>', 'Wasm component binary filepath')
    .option('-d, --document <name>', 'WIT document of a package to print')
    .option('-o, --output <output-file>', 'WIT output file path')
    .action(asyncAction(componentWit));

program
    .command('print')
    .description(
        'print the WebAssembly WAT text for a binary file [wasm-tools print]'
    )
    .argument('<input>', 'input file to process')
    .option('-o, --output <output-file>', 'output file path')
    .action(asyncAction(print));

program
    .command('metadata-show')
    .description(
        'extract the producer metadata for a Wasm binary [wasm-tools metadata show]'
    )
    .argument('[module]', 'Wasm component or core module filepath')
    .option('--json', 'output component metadata as JSON')
    .action(asyncAction(metadataShow));

program
    .command('metadata-add')
    .description(
        'add producer metadata for a Wasm binary [wasm-tools metadata add]'
    )
    .argument('[module]', 'Wasm component or core module filepath')
    .requiredOption(
        '-m, --metadata <metadata...>',
        'field=name[@version] producer metadata to add with the embedding'
    )
    .requiredOption('-o, --output <output-file>', 'output binary path')
    .action(asyncAction(metadataAdd));

program
    .command('parse')
    .description(
        'parses the Wasm text format into a binary file [wasm-tools parse]'
    )
    .argument('<input>', 'input file to process')
    .requiredOption('-o, --output <output-file>', 'output binary file path')
    .action(asyncAction(parse));

program
    .command('new')
    .description(
        'create a WebAssembly component adapted from a component core Wasm [wasm-tools component new]'
    )
    .argument('<core-module>', 'Wasm core module filepath')
    .requiredOption(
        '-o, --output <output-file>',
        'Wasm component output filepath'
    )
    .option('--name <name>', 'custom output name')
    .option('--adapt <[NAME=]adapter...>', 'component adapters to apply')
    .option('--wasi-reactor', 'build with the WASI Reactor adapter')
    .option('--wasi-command', 'build with the WASI Command adapter')
    .action(asyncAction(componentNew));

program
    .command('embed')
    .description(
        'embed the component typing section into a core Wasm module [wasm-tools component embed]'
    )
    .argument('[core-module]', 'Wasm core module filepath')
    .requiredOption(
        '-o, --output <output-file>',
        'Wasm component output filepath'
    )
    .requiredOption('--wit <wit-world>', 'WIT world path')
    .option('--dummy', 'generate a dummy component')
    .option(
        '--string-encoding <utf8|utf16|compact-utf16>',
        'set the component string encoding'
    )
    .option('-n, --world-name <world-name>', 'world name to embed')
    .option(
        '-m, --metadata <metadata...>',
        'field=name[@version] producer metadata to add with the embedding'
    )
    .action(asyncAction(componentEmbed));

program.showHelpAfterError();

program.parse();

function asyncAction(cmd) {
    return function() {
        const args = [...arguments];
        (async () => {
            try {
                await cmd.apply(null, args);
            } catch (e) {
                process.stdout.write(`(jco ${cmd.name}) `);
                if (typeof e === 'string') {
                    console.error(`${styleText(['red', 'bold'], "Error")}: ${e}\n`);
                } else {
                    console.error(e);
                }
                process.exit(1);
            }
        })();
    };
}
