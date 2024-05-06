#!/usr/bin/env node
import { program, Option } from 'commander';
import { opt } from './cmd/opt.js';
import { transpile, types } from './cmd/transpile.js';
import { run as runCmd, serve as serveCmd } from './cmd/run.js';
import { parse, print, componentNew, componentEmbed, metadataAdd, metadataShow, componentWit } from './cmd/wasm-tools.js';
import { componentize } from './cmd/componentize.js';
import c from 'chalk-template';

program
  .name('jco')
  .description(c`{bold jco - WebAssembly JS Component Tools}\n      JS Component Transpilation Bindgen & Wasm Tools for JS`)
  .usage('<command> [options]')
  .version('1.2.4');

function myParseInt(value) {
  return parseInt(value, 10);
}

program.command('componentize')
  .description('Create a component from a JavaScript module')
  .usage('<js-source> --wit wit-world.wit -o <component-path>')
  .argument('<js-source>', 'JS source file to build')
  .requiredOption('-w, --wit <path>', 'WIT path to build with')
  .option('-n, --world-name <name>', 'WIT world to build')
  .addOption(new Option('-d, --disable <feature...>', 'disable WASI features').choices(['stdio', 'random', 'clocks']))
  .option('--preview2-adapter <adapter>', 'provide a custom preview2 adapter path')
  .requiredOption('-o, --out <out>', 'output component file')
  .action(asyncAction(componentize));

program.command('transpile')
  .description('Transpile a WebAssembly Component to JS + core Wasm for JavaScript execution')
  .usage('<component-path> -o <out-dir>')
  .argument('<component-path>', 'Wasm component binary filepath')
  .option('--name <name>', 'custom output name')
  .requiredOption('-o, --out-dir <out-dir>', 'output directory')
  .option('-m, --minify', 'minify the JS output (--optimize / opt cmd still required)')
  .option('-O, --optimize', 'optimize the component first')
  .option('--no-typescript', 'do not output TypeScript .d.ts types')
  .option('--valid-lifting-optimization', 'optimize component binary validations assuming all lifted values are valid')
  .addOption(new Option('--import-bindings [mode]', 'bindings mode for imports').choices(['js', 'optimized', 'hybrid', 'direct-optimized']).preset('js'))
  .option('--tracing', 'emit `tracing` calls on function entry/exit')
  .option('-b, --base64-cutoff <bytes>', 'set the byte size under which core Wasm binaries will be inlined as base64', myParseInt)
  .option('--tla-compat', 'enables compatibility for JS environments without top-level await support via an async $init promise export')
  .option('--no-nodejs-compat', 'disables compatibility in Node.js without a fetch global')
  .option('-M, --map <mappings...>', 'specifier=./output custom mappings for the component imports')
  .option('--no-wasi-shim', 'disable automatic rewriting of WASI imports to use @bytecodealliance/preview2-shim')
  .option('--stub', 'generate a stub implementation from a WIT file directly')
  .option('--js', 'output JS instead of core WebAssembly')
  .addOption(new Option('-I, --instantiation [mode]', 'output for custom module instantiation').choices(['async', 'sync']).preset('async'))
  .option('-q, --quiet', 'disable output summary')
  .option('--no-namespaced-exports', 'disable namespaced exports for typescript compatibility')
  .option('--multi-memory', 'optimized output for Wasm multi-memory')
  .option('--', 'for --optimize, custom wasm-opt arguments (defaults to best size optimization)')
  .action(asyncAction(transpile));

program.command('types')
  .description('Generate types for the given WIT')
  .usage('<wit-path> -o <out-dir>')
  .argument('<wit-path>', 'path to a WIT file or directory')
  .option('--name <name>', 'custom output name')
  .option('-n, --world-name <world>', 'WIT world to generate types for')
  .requiredOption('-o, --out-dir <out-dir>', 'output directory')
  .option('--tla-compat', 'generates types for the TLA compat output with an async $init promise export')
  .addOption(new Option('-I, --instantiation [mode]', 'type output for custom module instantiation').choices(['async', 'sync']).preset('async'))
  .option('-q, --quiet', 'disable output summary')
  .action(asyncAction(types));

program.command('run')
  .description('Run a WASI Command component')
  .usage('<command.wasm> <args...>')
  .helpOption(false)
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('<command>', 'WASI command binary to run')
  .option('--jco-dir <dir>', 'Instead of using a temporary dir, set the output directory for the run command')
  .option('--jco-trace', 'Enable call tracing')
  .option('--jco-import <module>', 'Custom module to import before the run executes to support custom environment setup')
  .option('--jco-map <mappings...>', 'specifier=./output custom mappings for the component imports')
  .addOption(new Option('--jco-import-bindings [mode]', 'bindings mode for imports').choices(['js', 'optimized', 'hybrid', 'direct-optimized']).preset('js'))
  .argument('[args...]', 'Any CLI arguments for the component')
  .action(asyncAction(async function run (cmd, args, opts, command) {
    // specially only allow help option in first position
    if (cmd === '--help' || cmd === '-h') {
      command.help();
    } else {
      return runCmd(cmd, args, opts);
    }
  }));

program.command('serve')
  .description('Serve a WASI HTTP component')
  .usage('<server.wasm> <args...>')
  .helpOption(false)
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('<server>', 'WASI server binary to run')
  .option('--port <number>')
  .option('--host <host>')
  .option('--jco-dir <dir>', 'Instead of using a temporary dir, set the output directory for the transpiled code')
  .option('--jco-trace', 'Enable call tracing')
  .option('--jco-import <module>', 'Custom module to import before the server executes to support custom environment setup')
  .addOption(new Option('--jco-import-bindings [mode]', 'bindings mode for imports').choices(['js', 'optimized', 'hybrid', 'direct-optimized']).preset('js'))
  .option('--jco-map <mappings...>', 'specifier=./output custom mappings for the component imports')
  .argument('[args...]', 'Any CLI arguments for the component')
  .action(asyncAction(async function serve (cmd, args, opts, command) {
    // specially only allow help option in first position
    if (cmd === '--help' || cmd === '-h') {
      command.help();
    } else {
      return serveCmd(cmd, args, opts);
    }
  }));

program.command('opt')
  .description('optimizes a Wasm component, including running wasm-opt Binaryen optimizations')
  .usage('<component-file> -o <output-file>')
  .argument('<component-file>', 'Wasm component binary filepath')
  .requiredOption('-o, --output <output-file>', 'optimized component output filepath')
  .option('-q, --quiet')
  .option('--', 'custom wasm-opt arguments (defaults to best size optimization)')
  .action(asyncAction(opt));

program.command('wit')
  .description('extract the WIT from a WebAssembly Component [wasm-tools component wit]')
  .argument('<component-path>', 'Wasm component binary filepath')
  .option('-d, --document <name>', 'WIT document of a package to print')
  .option('-o, --output <output-file>', 'WIT output file path')
  .action(asyncAction(componentWit));

program.command('print')
  .description('print the WebAssembly WAT text for a binary file [wasm-tools print]')
  .argument('<input>', 'input file to process')
  .option('-o, --output <output-file>', 'output file path')
  .action(asyncAction(print));

program.command('metadata-show')
  .description('extract the producer metadata for a Wasm binary [wasm-tools metadata show]')
  .argument('[module]', 'Wasm component or core module filepath')
  .option('--json', 'output component metadata as JSON')
  .action(asyncAction(metadataShow));

program.command('metadata-add')
  .description('add producer metadata for a Wasm binary [wasm-tools metadata add]')
  .argument('[module]', 'Wasm component or core module filepath')
  .requiredOption('-m, --metadata <metadata...>', 'field=name[@version] producer metadata to add with the embedding')
  .requiredOption('-o, --output <output-file>', 'output binary path')
  .action(asyncAction(metadataAdd));

program.command('parse')
  .description('parses the Wasm text format into a binary file [wasm-tools parse]')
  .argument('<input>', 'input file to process')
  .requiredOption('-o, --output <output-file>', 'output binary file path')
  .action(asyncAction(parse));

program.command('new')
  .description('create a WebAssembly component adapted from a component core Wasm [wasm-tools component new]')
  .argument('<core-module>', 'Wasm core module filepath')
  .requiredOption('-o, --output <output-file>', 'Wasm component output filepath')
  .option('--name <name>', 'custom output name')
  .option('--adapt <[NAME=]adapter...>', 'component adapters to apply')
  .option('--wasi-reactor', 'build with the WASI Reactor adapter')
  .option('--wasi-command', 'build with the WASI Command adapter')
  .action(asyncAction(componentNew));

program.command('embed')
  .description('embed the component typing section into a core Wasm module [wasm-tools component embed]')
  .argument('[core-module]', 'Wasm core module filepath')
  .requiredOption('-o, --output <output-file>', 'Wasm component output filepath')
  .requiredOption('--wit <wit-world>', 'WIT world path')
  .option('--dummy', 'generate a dummy component')
  .option('--string-encoding <utf8|utf16|compact-utf16>', 'set the component string encoding')
  .option('-n, --world-name <world-name>', 'world name to embed')
  .option('-m, --metadata <metadata...>', 'field=name[@version] producer metadata to add with the embedding')
  .action(asyncAction(componentEmbed));

program.showHelpAfterError();

program.parse();

function asyncAction (cmd) {
  return function () {
    const args = [...arguments];
    (async () => {
      try {
        await cmd.apply(null, args);
      }
      catch (e) {
        process.stdout.write(`(jco ${cmd.name}) `);
        if (typeof e === 'string') {
          console.error(c`{red.bold Error}: ${e}\n`);
        } else {
          console.error(e);
        }
        process.exit(1);
      }
    })();
  };
}
