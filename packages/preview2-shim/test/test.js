import { ok, strictEqual } from 'node:assert';
import { fileURLToPath } from 'node:url';

suite('Node.js Preview2', async () => {
  test('Stdio', async () => {
    const { cli } = await import('@bytecodealliance/preview2-shim');
    // todo: wrap in a process call to not spill to test output
    cli.stdout.getStdout().blockingWriteAndFlush(new TextEncoder().encode('test stdout'));
    cli.stderr.getStderr().blockingWriteAndFlush(new TextEncoder().encode('test stderr'));
  });

  test('Fs read', async () => {
    const { filesystem, io } = await import('@bytecodealliance/preview2-shim');
    const [[rootDescriptor]] = filesystem.preopens.getDirectories();
    const childDescriptor = rootDescriptor.openAt({}, fileURLToPath(import.meta.url), {}, {}, {});
    const stream = childDescriptor.readViaStream(0);
    const buf = stream.blockingRead(1_000_000);
    const source = new TextDecoder().decode(buf);
    ok(source.includes('UNIQUE STRING'));
    stream[Symbol.dispose]();
  });
});
