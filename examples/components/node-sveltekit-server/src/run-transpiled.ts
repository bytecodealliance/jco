import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import fsHost from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/fs/host/node';
import { createHttpHost } from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/http/host/node';
import processHost from '@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host/node';
import type { Component, ImportObject } from '../generated/types/component.js';

type Instantiate = (getCoreModule: undefined, imports: Record<string, unknown>) => Promise<Component>;

type DirectHttpCallbacks = ReturnType<Parameters<typeof createHttpHost>[0]>;
type NodeImportName = Extract<keyof ImportObject, `jco:node/${string}`>;
type TtyHost = ImportObject['jco:node/tty@0.1.0'];
const componentModule = '../dist/transpiled/component.js';
const { instantiate } = (await import(componentModule)) as { instantiate: Instantiate };

const requestedPort = Number(process.env.PORT ?? 3000);

const adapterDefaults = {
    ADDRESS_HEADER: '',
    BODY_SIZE_LIMIT: '512K',
    HOST_HEADER: '',
    PORT_HEADER: '',
    PROTOCOL_HEADER: '',
    XFF_DEPTH: '1',
} as const;

for (const [name, value] of Object.entries(adapterDefaults)) {
    process.env[name] ??= value;
}

let component: Component | undefined;

const httpHost = createHttpHost(() => {
    if (!component) {
        throw new Error('HTTP callback received before the component finished instantiating');
    }

    // Generated component types describe the guest side of the WIT boundary;
    // the direct host provider wraps the same resources in result envelopes.
    return component.httpCallbacks as unknown as DirectHttpCallbacks;
});

// Node constructs its stdio streams while initializing `process`, even when an
// application never uses them. Supply a non-terminal host so initialization also
// works when this runner's standard streams are pipes.
const ttyHost = {
    isTty: () => false,
    open: () => undefined,
    close: () => undefined,
    windowSize: () => ({ columns: 0, rows: 0 }),
    setRawMode: () => undefined,
    read: () => new Uint8Array(),
    write: () => undefined,
    environment: () => [],
} satisfies TtyHost;

const nodeImports: Partial<Record<NodeImportName, unknown>> = {
    'jco:node/fs@0.1.0': fsHost,
    'jco:node/http@0.1.0': httpHost,
    'jco:node/process@0.1.0': processHost,
    'jco:node/tty@0.1.0': ttyHost,
};

const wasiImports = new WASIShim().getImportObject();

const imports: Record<string, unknown> = {
    ...wasiImports,
    ...nodeImports,
};

component = await instantiate(undefined, imports);

const port = await component.start(requestedPort);

console.log(`SvelteKit TODO server (StarlingMonkey component) listening at http://127.0.0.1:${port}`);
process.once('SIGTERM', () => void component?.stop());
process.once('SIGINT', () => void component?.stop());
