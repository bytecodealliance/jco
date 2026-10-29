/** Enhance the source textarea without making the rest of the demo depend on a CDN. */
export async function mountEditor(textarea, parent) {
    const modules = ['codemirror', '@codemirror/lang-javascript'];
    const [{ EditorView, basicSetup }, { javascript }] = await Promise.all(
        modules.map((name) => import(/* @vite-ignore */ name)),
    );
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
