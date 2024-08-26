import { readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import c from 'chalk-template';

export async function componentize (jsSource, opts) {
  let componentizeFn;
  try {
    ({ componentize: componentizeFn } = await eval('import("@golemcloud/componentize-js")'));
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && e?.message?.includes('\'@golemcloud/componentize-js\''))
      throw new Error(`componentize-js must first be installed separately via "npm install @golemcloud/componentize-js".`);
    throw e;
  }
  if (opts.disable?.includes('all')) {
    opts.disable = ['stdio', 'random', 'clocks'];
  }
  const source = await readFile(jsSource, 'utf8');
  const { component } = await componentizeFn(source, {
    sourceName: basename(jsSource),
    witPath: resolve(opts.wit),
    worldName: opts.worldName,
    disableFeatures: opts.disable,
    enableFeatures: opts.enable,
    preview2Adapter: opts.preview2Adapter,
  });
  await writeFile(opts.out, component);
  console.log(c`{green OK} Successfully written {bold ${opts.out}}.`);
}
