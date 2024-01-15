import { writeFile } from "node:fs/promises";
import { readFile, isWindows } from '../common.js';
import { $init, tools } from "../../obj/wasm-tools.js";
const { print: printFn, parse: parseFn, componentWit: componentWitFn, componentNew: componentNewFn, componentEmbed: componentEmbedFn, metadataAdd: metadataAddFn, metadataShow: metadataShowFn } = tools;
import { resolve, basename, extname } from 'node:path';
import c from 'chalk-template';

export async function parse(file, opts) {
  await $init;
  const source = (await readFile(file)).toString();
  const output = parseFn(source);
  await writeFile(opts.output, output);
}

export async function print(file, opts) {
  await $init;
  const source = await readFile(file);
  const output = printFn(source);
  if (opts.output) {
    await writeFile(opts.output, output);
  } else {
    console.log(output);
  }
}

export async function componentWit(file, opts) {
  await $init;
  const source = await readFile(file);
  const output = componentWitFn(source, opts.document);
  if (opts.output) {
    await writeFile(opts.output, output);
  } else {
    console.log(output);
  }
}

export async function componentNew(file, opts) {
  await $init;
  const source = file ? await readFile(file) : null;
  let adapters = [];
  if (opts.wasiReactor && opts.wasiCommand)
    throw new Error('Must select one of --wasi-command or --wasi-reactor');
  if (opts.wasiReactor)
    adapters = [['wasi_snapshot_preview1', (await readFile(new URL('../../lib/wasi_snapshot_preview1.reactor.wasm', import.meta.url))).buffer]];
  else if (opts.wasiCommand)
    adapters = [['wasi_snapshot_preview1', (await readFile(new URL('../../lib/wasi_snapshot_preview1.command.wasm', import.meta.url))).buffer]];
  if (opts.adapt)
    adapters = adapters.concat(await Promise.all(opts.adapt.map(async adapt => {
      let adapter;
      if (adapt.includes('='))
        adapter = adapt.split('=');
      else 
        adapter = [basename(adapt).slice(0, -extname(adapt).length), adapt];
      adapter[1] = await readFile(adapter[1]);
      return adapter;
    })));
  const output = componentNewFn(source, adapters);
  await writeFile(opts.output, output);
}

export async function componentEmbed(file, opts) {
  await $init;
  if (opts.metadata)
    opts.metadata = opts.metadata.map(meta => {
      const [field, data = ''] = meta.split('=');
      const [name, version = ''] = data.split('@');
      return [field, [[name, version]]];
    });
  const source = file ? await readFile(file) : null;
  opts.binary = source;
  opts.witPath = (isWindows ? '//?/' : '') + resolve(opts.wit);
  const output = componentEmbedFn(opts);
  await writeFile(opts.output, output);
}

export async function metadataAdd(file, opts) {
  await $init;
  const metadata = opts.metadata.map(meta => {
    const [field, data = ''] = meta.split('=');
    const [name, version = ''] = data.split('@');
    return [field, [[name, version]]];
  });
  const source = await readFile(file);
  const output = metadataAddFn(source, metadata);
  await writeFile(opts.output, output);
}

export async function metadataShow(file, opts) {
  await $init;
  const source = await readFile(file);
  let output = '', stack = [1];
  const meta = metadataShowFn(source);
  if (opts.json) {
    console.log(JSON.stringify(meta, null, 2));
  }
  else {
    for (const { name, metaType, producers } of meta) {
      output += '  '.repeat(stack.length - 1);
      const indent = '  '.repeat(stack.length);
      if (metaType.tag === 'component') {
        output += c`{bold [component${name ? ' ' + name : ''}]}\n`;
        if (metaType.val > 0)
          stack.push(metaType.val);
      } else {
        output += c`{bold [module${name ? ' ' + name : ''}]}\n`;
      }
      if (producers.length === 0)
        output += `${indent}(no metadata)\n`;
      for (const [field, items] of producers) {
        for (const [name, version] of items) {
          output += `${indent}${(field + ':').padEnd(13, ' ')} ${name}${version ? c`{cyan  ${version}}` : ''}\n`;
        }
      }
      output += '\n';
      if (stack[stack.length - 1] === 0)
        stack.pop();
      stack[stack.length - 1]--;
    }
    process.stdout.write(output);
  }
}
