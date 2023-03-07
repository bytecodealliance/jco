import { readFile, writeFile } from 'node:fs/promises';
import { componentize as componentizeFn } from '@bytecodealliance/componentize-js';
import c from 'chalk-template';

export async function componentize (jsSource, opts) {
  const source = await readFile(jsSource, 'utf8');
  const wit = await readFile(opts.wit, 'utf8');
  const { component, imports } = await componentizeFn(source, wit);
  await writeFile(opts.out, component);
  console.log(c`{green OK} Successfully written {bold ${opts.out}} with imports (${imports.join(', ')}).`);
}
