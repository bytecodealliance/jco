// Reuse the cross-platform runtime suite runner with embedding selected.
process.env.JCO_TEST_RUNTIME = 'embedded';
await import('./test-external-runtime.mjs');
