import { strictEqual } from 'node:assert';
import { readFile, rm, writeFile, mkdtemp } from 'node:fs/promises';
import { createServer} from 'node:http';
import { tmpdir } from 'node:os';
import { normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'url';
import { componentNew, preview1AdapterCommandPath } from '../src/api.js';
import { exec, jcoPath } from './helpers.js';

export async function preview2Test () {
  suite('Preview 2', () => {
    /**
     * Securely creates a temporary directory and returns its path.
     *
     * The new directory is created using `fsPromises.mkdtemp()`.
     */
    async function getTmpDir () {
      return await mkdtemp(normalize(tmpdir() + sep));
    }

    var tmpDir;
    var outFile;
    suiteSetup(async function() {
      tmpDir = await getTmpDir();
      outFile = resolve(tmpDir, 'out-component-file');
    });
    suiteTeardown(async function () {
      try {
        await rm(tmpDir, { recursive: true });
      }
      catch {}
    });

    teardown(async function () {
      try {
        await rm(outFile);
      }
      catch {}
    })

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
        if (req.url == '/api/examples') { 
          res.writeHead(200, {
            'Content-Type': 'text/plain',
            'X-Wasi': 'mock-server',
            'Date': null,
          });
          if (req.method === 'GET') {
            res.write('hello world');
          } else {
            req.pipe(res);
            return;
          }
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
          const { stderr } = await exec(jcoPath, 'transpile', outFile, '--name', runtimeName, '--tracing', '-o', outDir);
          strictEqual(stderr, '');
        }

        await exec(`test/output/${runtimeName}.js`);
      }
      finally {
        server.close();
      }
    });
  });
}
