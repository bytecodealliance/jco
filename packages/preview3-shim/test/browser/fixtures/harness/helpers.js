import * as filesystem from "@bytecodealliance/preview3-shim/filesystem";

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export async function runComponent(component) {
  const run = component["wasi:cli/run@0.3.0"] ?? component.run;
  if (!run || typeof run.run !== "function") {
    throw new Error("wasi:cli/run export missing");
  }
  await run.run();
}

export async function configureOpfs(directory) {
  filesystem._clearPreopens();
  const capability = await filesystem.loadOpfsCapability(directory);
  const adapter = new filesystem.OpfsFilesystemAdapter();
  filesystem._addPreopenWithAdapter("/", adapter, capability);
  filesystem._setCwd("/");
  return adapter;
}

export async function withOpfsScratch(callback) {
  const opfsRoot = await navigator.storage.getDirectory();
  const scratchName = `preview3-shim-${crypto.randomUUID()}`;
  const directory = await opfsRoot.getDirectoryHandle(scratchName, { create: true });
  try {
    return await callback(directory);
  } finally {
    filesystem._clearPreopens();
    await opfsRoot.removeEntry(scratchName, { recursive: true });
  }
}

export function byteStream(text) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (const byte of bytes) {
        controller.enqueue(byte);
      }
      controller.close();
    },
  });
}

export async function readText(descriptor) {
  const [stream, completed] = descriptor.readViaStream(0n);
  const bytes = [];
  for await (const byte of stream) {
    bytes.push(byte);
  }
  const result = await completed;
  assert(result.tag === "ok", `file read failed: ${JSON.stringify(result)}`);
  return new TextDecoder().decode(Uint8Array.from(bytes));
}
