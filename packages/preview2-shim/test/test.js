import { ok } from 'node:assert';

suite('Node.js', async () => {
  test('Basic importing', async () => {
    const filesystem = await import('@bytecodealliance/preview2-shim/filesystem');
    ok(filesystem.stat);
  });
});
