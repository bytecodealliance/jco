import sample from './access-logs.json';
import { createPipeline } from './shared/pipeline.js';
import { readScript } from './shared/read-script.js';
import { createCustomComponent } from './custom-component.js';
import { mountEditor } from './editor.js';
import customTemplate from './custom-template.ts?raw';

const $ = (selector) => document.querySelector(selector);
const stages = [];
let pipeline;
let busy = true;
let editorView;
let customDownload;

function status(message, state = 'ready') {
    $('#status').textContent = message;
    $('#status').dataset.state = state;
}

function controls() {
    for (const element of document.querySelectorAll('button, input, .stage-options, #source')) {
        element.disabled = busy || !pipeline;
    }
    if (editorView) {
        editorView.dom.inert = busy || !pipeline;
    }
}

function invalidate() {
    $('#output').textContent = '{}';
    $('#steps').replaceChildren();
    $('#count').textContent = 'No run yet';
    $('#output-note').textContent = 'Run the pipeline to see results for this configuration.';
}

function render() {
    $('#empty').hidden = stages.length > 0;
    $('#pipeline').replaceChildren();
    stages.forEach((stage, index) => {
        const row = document.createElement('li');
        const heading = document.createElement('div');
        heading.className = 'stage-heading';
        const title = document.createElement('strong');
        title.textContent = stage.description.name;
        const actions = document.createElement('div');
        actions.className = 'stage-actions';
        for (const [label, delta] of [
            ['Move up', -1],
            ['Move down', 1],
            ['Remove', 0],
        ]) {
            const button = document.createElement('button');
            button.textContent = label;
            button.setAttribute('aria-label', `${label}: ${stage.description.name}`);
            button.addEventListener('click', () => {
                const target = index + delta;
                if (delta && (target < 0 || target >= stages.length)) {
                    return;
                }
                if (delta) {
                    [stages[index], stages[target]] = [stages[target], stages[index]];
                } else {
                    stages.splice(index, 1);
                }
                render();
                invalidate();
                status('Pipeline updated · run to refresh results');
            });
            actions.append(button);
        }
        heading.append(title, actions);
        const detail = document.createElement('p');
        detail.className = 'stage-description';
        detail.textContent = `${stage.script.name} · ${stage.description.description}`;
        const label = document.createElement('label');
        label.textContent = 'Options (JSON)';
        const options = document.createElement('textarea');
        options.className = 'stage-options';
        options.rows = 2;
        options.value = stage.options;
        options.spellcheck = false;
        options.addEventListener('input', () => {
            stage.options = options.value;
            invalidate();
        });
        label.append(options);
        row.append(heading, detail, label);
        $('#pipeline').append(row);
    });
    controls();
}

$('#components').addEventListener('change', async (event) => {
    busy = true;
    controls();
    status('Reading components in the browser…', 'loading');
    try {
        // Validate the whole selection before changing the pipeline.
        const additions = [];
        for (const file of event.target.files) {
            const script = await readScript(new Uint8Array(await file.arrayBuffer()));
            const description = pipeline.describe(script);
            additions.push({ script, description, options: description.defaultOptions });
        }
        stages.push(...additions);
        invalidate();
        status(`Ready · ${stages.length} steps sharing one engine`);
    } catch (error) {
        status(`Could not add component: ${error.message ?? error}`, 'error');
    } finally {
        event.target.value = '';
        busy = false;
        render();
    }
});

$('#run').addEventListener('click', () => {
    invalidate();
    try {
        const result = pipeline.run(
            $('#input').value,
            stages.map((stage) => ({
                script: stage.script,
                options: JSON.parse(stage.options),
            })),
        );
        $('#output').textContent = JSON.stringify({ logs: result.logs, reports: result.reports }, null, 2);
        $('#count').textContent = `${result.logs.length} logs / ${stages.length} steps`;
        $('#output-note').textContent = 'Every run starts with fresh input. Steps share data inside the engine.';
        for (const step of result.steps) {
            const row = document.createElement('li');
            row.textContent = step.summary;
            $('#steps').append(row);
        }
        status('Pipeline complete · shared engine ready for another run');
    } catch (error) {
        status(`Pipeline failed: ${error.message ?? error}`, 'error');
    }
});

$('#clear').addEventListener('click', () => {
    stages.length = 0;
    render();
    invalidate();
    status('Pipeline cleared · upload a component to start again');
});
$('#restore').addEventListener('click', restoreSample);
$('#input').addEventListener('input', invalidate);
function restoreSample() {
    $('#input').value = JSON.stringify(sample, null, 2);
    invalidate();
}
restoreSample();

function clearDownload() {
    if (customDownload) {
        URL.revokeObjectURL(customDownload);
        customDownload = undefined;
    }
    $('#download-custom').hidden = true;
    $('#download-custom').removeAttribute('href');
}

$('#source').value = customTemplate;
$('#source').addEventListener('input', clearDownload);
$('#component-name').addEventListener('input', clearDownload);
$('#reset-source').addEventListener('click', () => {
    $('#source').value = customTemplate;
    editorView?.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: customTemplate } });
    clearDownload();
});
mountEditor($('#source'), $('#source-editor'))
    .then((view) => {
        editorView = view;
        controls();
        $('#editor-status').textContent =
            'TypeScript syntax highlighting by CodeMirror. Editor and compiler load from a CDN.';
    })
    .catch(() => {
        $('#editor-status').textContent =
            'Could not load CodeMirror from the CDN. You can still edit the source in the text area.';
    });

$('#create-component').addEventListener('click', async () => {
    busy = true;
    controls();
    clearDownload();
    const name = $('#component-name').value.trim();
    $('#build-status').textContent = 'Bundling TypeScript and creating a script-only Wasm component…';
    $('#build-status').dataset.state = 'building';
    try {
        const bytes = await createCustomComponent(name, $('#source').value);
        // Take the same Wasm → script → engine path as a file upload.
        const script = await readScript(bytes);
        const description = pipeline.describe(script);
        JSON.parse(description.defaultOptions);
        stages.push({ script, description, options: description.defaultOptions });
        customDownload = URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
        $('#download-custom').href = customDownload;
        $('#download-custom').download = `${name}.wasm`;
        $('#download-custom').hidden = false;
        $('#build-status').textContent = `Created ${name}.wasm (${bytes.length} bytes) and added it to the pipeline.`;
        $('#build-status').dataset.state = 'ready';
        invalidate();
        status(`Ready · ${stages.length} steps sharing one engine`);
    } catch (error) {
        $('#build-status').textContent = `Could not create component: ${error.message ?? error}`;
        $('#build-status').dataset.state = 'error';
    } finally {
        busy = false;
        render();
    }
});

try {
    pipeline = await createPipeline(async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Could not load ${url}: HTTP ${response.status}`);
        }
        return new Uint8Array(await response.arrayBuffer());
    });
    busy = false;
    controls();
    status('Ready · one shared engine, empty pipeline');
} catch (error) {
    status(`Could not start the engine: ${error.message ?? error}`, 'error');
}
