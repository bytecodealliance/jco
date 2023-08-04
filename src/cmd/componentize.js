import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import c from 'chalk-template';

export async function componentize (jsSource, opts) {
  let componentizeFn;
  try {
    ({ componentize: componentizeFn } = await eval('import("@bytecodealliance/componentize-js")'));
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && e?.message?.includes('\'@bytecodealliance/componentize-js\''))
      throw new Error(`componentize-js must first be installed separately via "npm install @bytecodealliance/componentize-js".`);
    throw e;
  }
  const source = await readFile(jsSource, 'utf8');
  const { component, imports } = await componentizeFn(source, {
    witPath: resolve(opts.wit),
    worldName: opts.worldName,
    enableStdout: opts.enableStdout,
  });
  await writeFile(opts.out, component);
  console.log(c`{green OK} Successfully written {bold ${opts.out}} with imports (${imports.join(', ')}).`);
}
