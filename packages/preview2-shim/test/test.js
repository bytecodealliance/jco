import { ok, strictEqual } from 'node:assert';
import { fileURLToPath } from 'node:url';

suite('Node.js Preview2', async () => {
  test('Stdio', async () => {
    const { io, cli } = await import('@bytecodealliance/preview2-shim');
    // todo: wrap in a process call to not spill to test output
    io.streams.blockingWriteAndFlush(cli.stdout.getStdout(), new TextEncoder().encode('test stdout'));
    io.streams.blockingWriteAndFlush(cli.stderr.getStderr(), new TextEncoder().encode('test stderr'));
  });

  test('Fs read', async () => {
    const { filesystem, io } = await import('@bytecodealliance/preview2-shim');
    const [rootFd] = filesystem.preopens.getDirectories()[0];
    const fd = filesystem.types.openAt(rootFd, {}, fileURLToPath(import.meta.url), {}, {}, {});
    const stream = filesystem.types.readViaStream(fd, 0);
    const buf = io.streams.blockingRead(stream, 1_000_000);
    const source = new TextDecoder().decode(buf);
    ok(source.includes('UNIQUE STRING'));
    io.streams.dropOutputStream(stream);
  });
});
