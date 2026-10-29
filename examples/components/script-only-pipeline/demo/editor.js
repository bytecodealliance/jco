const CODEMIRROR_URL = 'https://esm.sh/codemirror@6.0.2';
const JAVASCRIPT_URL = 'https://esm.sh/@codemirror/lang-javascript@6.2.4';

/** Enhance the source textarea without making the rest of the demo depend on a CDN. */
export async function mountEditor(textarea, parent) {
    const [{ EditorView, basicSetup }, { javascript }] = await Promise.all([
        import(/* @vite-ignore */ CODEMIRROR_URL),
        import(/* @vite-ignore */ JAVASCRIPT_URL),
    ]);
    const view = new EditorView({
        parent,
        doc: textarea.value,
        extensions: [
            basicSetup,
            javascript({ typescript: true }),
            EditorView.contentAttributes.of({ 'aria-label': 'Custom processor TypeScript source' }),
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    textarea.value = update.state.doc.toString();
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }),
        ],
    });
    textarea.hidden = true;
    parent.dataset.ready = 'true';
    return view;
}
