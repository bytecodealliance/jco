#!/usr/bin/env node
import { program } from 'commander';
import { opt } from './cmd/opt.js';
import { transpile } from './cmd/transpile.js';
import { parse, print, componentNew, componentWit } from './cmd/wasm-tools.js';
import c from 'chalk-template';

program
  .name('jsct')
  .description(c`{bold JSCT - WebAssembly JS Component Tools}\n       JS Component Transpilation Bindgen & Wasm Tools for JS`)
  .usage('<command> [options]')
  .version('0.1.0');

function myParseInt(value) {
  return parseInt(value, 10);
}

program.command('transpile')
  .description('Transpile a WebAssembly Component to JS + core Wasm for JavaScript execution')
  .usage('<component-path> -o <out-dir>')
  .argument('<component-path>', 'Wasm component binary filepath')
  .option('--name <name>', 'custom output name')
  .requiredOption('-o, --out-dir <out-dir>', 'output directory')
  .option('-m, --minify', 'minify the JS output (--optimize / opt cmd still required)')
  .option('-O, --optimize', 'optimize the component first')
  .option('-a, --args', 'when using --optimize, custom binaryen argument flags to pass')
  .option('--no-typescript', 'do not output TypeScript .d.ts types')
  .option('--valid-lifting-optimization', 'optimize component binary validations assuming all lifted values are valid')
  .option('-b, --base64-cutoff <bytes>', 'set the byte size under which core Wasm binaries will be inlined as base64', myParseInt)
  .option('--tla-compat', 'enables compatibility for JS environments without top-level await support via an async $init promise export')
  .option('--no-nodejs-compat', 'disables compatibility in Node.js without a fetch global')
  .option('-m, --map <mappings...>', 'specifier=./output custom mappings for the component imports')
  .option('-a, --asm', 'output asm.js instead of core WebAssembly')
  .option('-I, --instantiation', 'output for custom module instantiation')
  .option('-q, --quiet', 'disable logging')
  .option('--', 'for --optimize, custom wasm-opt arguments (defaults to best size optimization)')
  .action(asyncAction(transpile));

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
  .option('-o, --output <output-file>', 'WIT output file path')
  .action(asyncAction(componentWit));

program.command('print')
  .description('print the WebAssembly WAT text for a binary file [wasm-tools print]')
  .argument('<input>', 'input file to process')
  .option('-o, --output <output-file>', 'output file path')
  .action(asyncAction(print));

program.command('parse')
  .description('parses the Wasm text format into a binary file [wasm-tools parse]')
  .argument('<input>', 'input file to process')
  .requiredOption('-o, --output <output-file>', 'output binary file path')
  .action(asyncAction(parse));

program.command('new')
  .description('create a WebAssembly component adapted from a component core Wasm [wasm-tools component new]')
  .argument('[module]', 'Wasm core module filepath')
  .requiredOption('-o, --output <output-file>', 'Wasm component output filepath')
  .option('--name <name>', 'custom output name')
  .option('--wit <wit>', 'WIT file to use')
  .option('--types-only', 'types only component generation')
  .option('--adapt <[NAME=]adapter...>', 'component adapters to apply')
  .option('--encoding <utf8|utf16|compact-utf6>', 'string encoding for WIT')
  .action(asyncAction(componentNew));

program.parse();

function asyncAction (cmd) {
  return function () {
    const args = [...arguments];
    (async () => {
      try {
        await cmd.apply(null, args);
      }
      catch (e) {
        process.stdout.write(`(jsct ${cmd.name}) `);
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
