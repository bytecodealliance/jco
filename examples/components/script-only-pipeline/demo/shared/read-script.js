import { generate } from '@bytecodealliance/jco/component';

/** Turn an uploaded script-only component into source and metadata, on either host. */
export async function readScript(bytes) {
    const output = await generate(bytes, {
        name: 'uploaded',
        instantiation: { tag: 'async' },
        noTypescript: true,
        noNodejsCompat: true,
        base64Cutoff: 0,
    });
    if (output.imports.length || !output.exports.some(([name]) => name === 'jco:script/script@0.1.0')) {
        throw new Error('Upload a script-only component exporting jco:script/script@0.1.0');
    }
    const files = new Map(output.files);
    // Instantiation bindings have no static imports. Supplying the core modules
    // explicitly lets the same data URL work in Node.js and the browser.
    const source = new TextDecoder().decode(files.get('uploaded.js'));
    const { instantiate } = await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`);
    const { script } = await instantiate((name) => WebAssembly.compile(files.get(name)), {});
    return {
        name: script.name(),
        source: script.source(),
        exports: script.exports(),
        engineWorld: script.engineWorld(),
    };
}
