import { strictEqual } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer} from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'url';
import { componentNew, preview1AdapterCommandPath } from '../src/api.js';
import { tsGenerationPromise } from './codegen.js';
import { exec, jcoPath } from './helpers.js';

export async function preview2Test () {
  suite('Preview 2', () => {
    const outFile = resolve(tmpdir(), 'out-component-file');

    async function cleanup() {
      try {
        await rm(outFile);
      }
      catch {}
    }

    test('hello_stdout', async () => {
      const component = await readFile(`test/fixtures/modules/hello_stdout.wasm`);
      const generatedComponent = await componentNew(component, [['wasi_snapshot_preview1', await readFile(preview1AdapterCommandPath())]]);
      await writeFile('test/output/hello_stdout.component.wasm', generatedComponent);

      const { stdout, stderr } = await exec(jcoPath, 'run', 'test/output/hello_stdout.component.wasm');
      strictEqual(stdout, 'writing to stdout: hello, world\n');
      strictEqual(stderr, 'writing to stderr: hello, world\n');
    });

    test('wasi-http-proxy', async () => {

      const server = createServer(async (req, res) => {
        if (req.url == '/api/example-get') { 
          res.writeHead(200, {
            'Content-Type': 'text/plain',
            'X-Wasi': 'mock-server',
            'Date': null,
          });
          res.write('hello world');
        } else {
          res.statusCode(500);
        }
        res.end();
      }).listen(8080);

      const runtimeName = 'wasi-http-proxy';
      try {
        const { stderr } = await exec(jcoPath,
            'componentize',
            'test/fixtures/componentize/wasi-http-proxy/source.js',
            '-w',
            'test/fixtures/wit',
            '--world-name',
            'test:jco/command-extended',
            '--enable-stdout',
            '-o',
            outFile);
        strictEqual(stderr, '');
        const outDir = fileURLToPath(new URL(`./output/${runtimeName}`, import.meta.url));
        {
          const wasiMap = {
            'wasi:cli/*': 'cli#*',
            'wasi:clocks/*': 'clocks#*',
            'wasi:filesystem/*': 'filesystem#*',
            'wasi:http/*': 'http#*',
            'wasi:io/*': 'io#*',
            'wasi:logging/*': 'logging#*',
            'wasi:poll/*': 'poll#*',
            'wasi:random/*': 'random#*',
            'wasi:sockets/*': 'sockets#*',
          };
          const { stderr } = await exec(jcoPath, 'transpile', outFile, '--name', runtimeName, '--instantiation', ...Object.entries(wasiMap).flatMap(([k, v]) => ['--map', `${k}=${v}`]), '-o', outDir);
          strictEqual(stderr, '');
        }
        {
          await tsGenerationPromise().catch((_) => {});
        }

        await exec(process.argv[0], `test/output/${runtimeName}.js`);
      }
      finally {
        server.close();
        await cleanup();
      }
    });
  });
}
