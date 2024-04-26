import { getTmpDir } from '../common.js';
import { transpile } from './transpile.js';
import { rm, stat, mkdir, writeFile, symlink } from 'node:fs/promises';
import { basename, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import c from 'chalk-template';

export async function run (componentPath, args, opts) {
  // Ensure that `args` is an array
  args = [...args];
  return runComponent(componentPath, args, opts, `
    if (!mod.run || !mod.run.run) {
      console.error('Not a valid command component to execute.');
      process.exit(1);
    }
    try {
      mod.run.run();
      // for stdout flushing
      await new Promise(resolve => setTimeout(resolve));
      process.exit(0);
    }
    catch (e) {
      console.error(e);
      process.exit(1);
    }
  `);
}

export async function serve (componentPath, args, opts) {
  let tryFindPort = false;
  let { port, host } = opts;
  if (port === undefined) {
    tryFindPort = true;
    port = '8000';
  }
  // Ensure that `args` is an array
  args = [...args];
  return runComponent(componentPath, args, opts, `
    import { HTTPServer } from '@bytecodealliance/preview2-shim/http';
    const server = new HTTPServer(mod.incomingHandler);
    ${tryFindPort ? `
    let port = ${port};
    while (true) {
      try {
        server.listen(port, ${JSON.stringify(host)});
        break;
      } catch (e) {
        if (e.code !== 'EADDRINUSE')
          throw e;
      }
      port++;
    }
    ` : `server.listen(${port}, ${JSON.stringify(host)})`}
    console.error(\`Server listening on \${port}...\`);
  `);
}

async function runComponent (componentPath, args, opts, executor) {
  const jcoImport = opts.jcoImport ? resolve(opts.jcoImport) : null;

  const name = basename(componentPath.slice(0, -extname(componentPath).length || Infinity));
  const outDir = opts.jcoDir || await getTmpDir();
  if (opts.jcoDir) {
    await mkdir(outDir, { recursive: true });
  }

  try {
    try {
      await transpile(componentPath, {
        name,
        quiet: true,
        noTypescript: true,
        wasiShim: true,
        outDir,
        tracing: opts.jcoTrace,
        map: opts.jcoMap,
        importBindings: opts.jcoImportBindings,
      });
    }
    catch (e) {
      throw new Error('Unable to transpile command for execution', { cause: e });
    }

    await writeFile(resolve(outDir, 'package.json'), JSON.stringify({ type: 'module' }));

    let preview2ShimPath = fileURLToPath(new URL('../../node_modules/@bytecodealliance/preview2-shim', import.meta.url));
    while (true) {
      try {
        if ((await stat(preview2ShimPath)).isDirectory()) {
          break;
        }
      }
      catch {
        // empty
      }
      let len = preview2ShimPath.length;
      preview2ShimPath = resolve(preview2ShimPath, '..', '..', '..', 'node_modules', '@bytecodealliance', 'preview2-shim');
      if (preview2ShimPath.length === len) {
        throw c`Unable to locate the {bold @bytecodealliance/preview2-shim} package, make sure it is installed.`;
      }
    }

    const modulesDir = resolve(outDir, 'node_modules', '@bytecodealliance');
    await mkdir(modulesDir, { recursive: true });

    try {
      await symlink(preview2ShimPath, resolve(modulesDir, 'preview2-shim'), 'dir');
    } catch (e) {
      if (e.code !== 'EEXIST')
        throw e;
    }

    const runPath = resolve(outDir, '_run.js');
    await writeFile(runPath, `
      ${jcoImport ? `import ${JSON.stringify(pathToFileURL(jcoImport))}` : ''}
      import process from 'node:process';
      try {
        process.argv[1] = "${name}";
      } catch {}
      const mod = await import('./${name}.js');
      ${executor}
    `);

    const nodePath = process.env.JCO_RUN_PATH || process.argv[0];

    process.exitCode = await new Promise((resolve, reject) => {
      const cp = spawn(nodePath, [...process.env.JCO_RUN_ARGS ? process.env.JCO_RUN_ARGS.split(' ') : [], runPath, ...args], { stdio: 'inherit' });

      cp.on('error', reject);
      cp.on('exit', resolve);
    });
  }
  finally {
    try {
      if (!opts.jcoDir)
        await rm(outDir, { recursive: true });
    } catch {
      // empty
    }
  }
}