import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
import { instantiate } from './transpiled/component.js';

const status = document.querySelector('#status');
const stdoutMessage = document.querySelector('#stdout-message');
const stderrMessage = document.querySelector('#stderr-message');
const writeStdout = document.querySelector('#write-stdout');
const writeStderr = document.querySelector('#write-stderr');
const clearStderr = document.querySelector('#clear-stderr');
const stderrOutput = document.querySelector('#stderr-output');

let hasStderrOutput = false;
const decoder = new TextDecoder();
const coreModules = new Map();

const pageStderr = {
    write(bytes) {
        appendStderr(decoder.decode(bytes, { stream: true }));
    },
    flush() {
        appendStderr(decoder.decode());
    },
    blockingFlush() {
        this.flush();
    },
};

try {
    const defaultInstance = await instantiate(loadCoreModule, new WASIShim().getImportObject());
    const customizedInstance = await instantiate(
        loadCoreModule,
        new WASIShim({ stderr: pageStderr }).getImportObject(),
    );

    writeStdout.addEventListener('click', () => {
        defaultInstance.cliDemo.writeToStdout(stdoutMessage.value);
    });
    writeStderr.addEventListener('click', () => {
        customizedInstance.cliDemo.writeToStderr(stderrMessage.value);
    });
    clearStderr.addEventListener('click', resetStderr);

    for (const button of [writeStdout, writeStderr]) {
        button.disabled = false;
    }
    status.dataset.state = 'ready';
    status.textContent = 'Component ready';
} catch (error) {
    status.dataset.state = 'error';
    status.textContent = `Failed to load component: ${error.message}`;
    console.error(error);
}

async function loadCoreModule(path) {
    let module = coreModules.get(path);
    if (!module) {
        const response = fetch(new URL(`./transpiled/${path}`, import.meta.url));
        module = WebAssembly.compileStreaming(response);
        coreModules.set(path, module);
    }
    return module;
}

function appendStderr(text) {
    if (!text) {
        return;
    }
    if (!hasStderrOutput) {
        stderrOutput.textContent = '';
        hasStderrOutput = true;
    }
    stderrOutput.append(document.createTextNode(text));
}

function resetStderr() {
    hasStderrOutput = false;
    stderrOutput.replaceChildren();
    const empty = document.createElement('span');
    empty.className = 'empty-output';
    empty.textContent = 'No stderr output yet.';
    stderrOutput.append(empty);
}
