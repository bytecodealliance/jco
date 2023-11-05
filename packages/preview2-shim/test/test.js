import { ok, strictEqual } from 'node:assert';
import { fileURLToPath } from 'node:url';

suite('Node.js Preview2', async () => {
  test('Stdio', async () => {
    const { cli } = await import('@bytecodealliance/preview2-shim');
    // todo: wrap in a process call to not spill to test output
    cli.stdout.getStdout().blockingWriteAndFlush(new TextEncoder().encode('test stdout'));
    cli.stderr.getStderr().blockingWriteAndFlush(new TextEncoder().encode('test stderr'));
  });

  test('FS read', async () => {
    const { filesystem } = await import('@bytecodealliance/preview2-shim');
    const [[rootDescriptor]] = filesystem.preopens.getDirectories();
    const childDescriptor = rootDescriptor.openAt({}, fileURLToPath(import.meta.url), {}, {}, {});
    const stream = childDescriptor.readViaStream(0);
    const poll = stream.subscribe();
    poll.block();
    const buf = stream.read();
    const source = new TextDecoder().decode(buf);
    ok(source.includes('UNIQUE STRING'));
    stream[Symbol.dispose]();
  });

  test.skip('WASI HTTP', async () => {
    const { http } = await import('@bytecodealliance/preview2-shim');
    const { handle } = http.outgoingHandler;
    const { OutgoingRequest, OutgoingBody, Fields } = http.types;
    const encoder = new TextEncoder();
    const request = new OutgoingRequest(
      { tag: 'GET' },
      '/',
      { tag: 'HTTPS' },
      'webassembly.org',
      new Fields([
        ['User-agent', encoder.encode('WASI-HTTP/0.0.1')],
        ['Content-type', encoder.encode('application/json')],
      ])
    );

    const outgoingBody = request.write();
    // TODO: we should explicitly drop the bodyStream here
    //       when we have support for Symbol.dispose
    OutgoingBody.finish(outgoingBody);

    const futureIncomingResponse = handle(request);
    const incomingResponse = futureIncomingResponse.get().val.val;

    const status = incomingResponse.status();
    const responseHeaders = incomingResponse.headers().entries();

    const decoder = new TextDecoder();
    const headers = Object.fromEntries(responseHeaders.map(([k, v]) => [k, decoder.decode(v)]));

    let responseBody;
    const incomingBody = incomingResponse.consume();
    {
      const bodyStream = incomingBody.stream();
      // const bodyStreamPollable = bodyStream.subscribe();
      const buf = bodyStream.read(50n);
      // TODO: actual streaming
      // TODO: explicit drops
      responseBody = buf.length > 0 ? new TextDecoder().decode(buf) : undefined;
    }

    strictEqual(status, 200);
    ok(headers['content-type'].startsWith('text/html'));
    ok(responseBody.includes('WebAssembly'));
  });
});
