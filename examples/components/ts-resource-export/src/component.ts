/// <reference path="../generated/types/guest/export/exported.d.ts" />
import type { Example, ExampleNoDispose } from 'test:component/resources';

class LocalExample implements Example {
    hello(s: string) {
        return `[LocalExample] Hello ${s}!`;
    }

    [Symbol.dispose]() {
        console.error('[LocalExample] disposing...');
    }
}

class LocalExampleNoDispose implements ExampleNoDispose {
    hello(s: string) {
        return `[LocalExampleNoDispose] Hello ${s}!`;
    }
}

export const resources = {
    Example: LocalExample,
    ExampleNoDispose: LocalExampleNoDispose,
};
