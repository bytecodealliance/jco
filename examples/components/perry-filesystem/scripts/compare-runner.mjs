import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const jco = fileURLToPath(new URL('jco.js', import.meta.resolve('@bytecodealliance/jco')));
const requireJco = createRequire(jco);
const host = (name) =>
    import(pathToFileURL(requireJco.resolve(`@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/${name}`)).href);
const [fs, console, http] = await Promise.all([host('fs/host/node'), host('console/host/node'), host('http/host')]);
const input = fileURLToPath(new URL('../data/input.txt', import.meta.url));
const mapPath = (path) => (path.tag === 'text' && path.val === '/data/input.txt' ? { ...path, val: input } : path);
const wasi = new WASIShim({ sandbox: { preopens: { '/data': fileURLToPath(new URL('../data/', import.meta.url)) } } });
const imports = {
    ...wasi.getImportObject(),
    'jco:node/fs': {
        ...fs,
        readFile: (file, options) =>
            fs.readFile(file.tag === 'path' ? { ...file, val: mapPath(file.val) } : file, options),
        stat: (path, options) => fs.stat(mapPath(path), options),
    },
    'jco:node/console': console,
    'jco:node/http': http,
};
const start = process.hrtime.bigint();
const { instantiate } = await import(pathToFileURL(process.argv[2]).href);
const { run } = await instantiate(undefined, imports);
const runStart = process.hrtime.bigint();
await run.run();
const end = process.hrtime.bigint();
const runMs = Number(end - runStart) / 1e6;
const loadAndRunMs = Number(end - start) / 1e6;
process.stderr.write(`${JSON.stringify({ runMs, loadAndRunMs })}\n`);
