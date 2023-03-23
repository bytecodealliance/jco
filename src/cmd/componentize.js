import { readFile, writeFile } from 'node:fs/promises';
import c from 'chalk-template';

export async function componentize (jsSource, opts) {
  let componentizeFn;
  try {
    ({ componentize: componentizeFn } = await import('@bytecodealliance/componentize-js'));
  } catch (e) {
    throw new Error(`componentize-js must first be installed separately via "npm install @bytecodealliance/componentize-js".`);
  }
  const source = await readFile(jsSource, 'utf8');
  const wit = await readFile(opts.wit, 'utf8');
  const { component, imports } = await componentizeFn(source, wit);
  await writeFile(opts.out, component);
  console.log(c`{green OK} Successfully written {bold ${opts.out}} with imports (${imports.join(', ')}).`);
}
