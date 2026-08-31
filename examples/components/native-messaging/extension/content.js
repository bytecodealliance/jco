const extensionRuntime = globalThis.browser?.runtime ?? globalThis.chrome.runtime;
document.documentElement.dataset.nativeMessagingExtension = 'loaded';

async function report(result) {
    await fetch(`${TEST_CONFIG.resultUrl}?result=${encodeURIComponent(JSON.stringify(result))}`);
}

extensionRuntime.sendMessage({ action: 'run-native-messaging-test' }).then(report, (error) =>
    report({
        browser: TEST_CONFIG.browser,
        message: error?.stack ?? String(error),
        ok: false,
    }),
);
