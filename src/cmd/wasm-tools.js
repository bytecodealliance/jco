import { readFile, writeFile } from "fs/promises";
import {
  $init,
  print as printFn,
  parse as parseFn,
  componentWit as componentWitFn,
  componentNew as componentNewFn,
} from "../../obj/wasm-tools.js";

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
  const source = (await readFile(file)).toString();
  const output = componentWitFn(source);
  if (opts.output) {
    await writeFile(opts.output, output);
  } else {
    console.log(output);
  }
}

export async function componentNew(file, opts) {
  await $init;
  const source = await readFile(file);
  const output = componentNewFn(source, opts);
  await writeFile(opts.output, output);
}
