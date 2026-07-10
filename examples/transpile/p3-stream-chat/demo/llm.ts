import { SECRET_VALUE } from "./filter.js";
import { waitMs } from "./all.js";

export interface MessageChunk {
    role: 'system' | 'user' | 'assistant';
    text: string;
}

export type ResponseEvent =
    | { tag: 'delta'; val: string }
    | { tag: 'complete' }
    | { tag: 'error'; val: string };

export const observedPrompts: MessageChunk[] = [];

export async function* generate(input: AsyncIterable<MessageChunk>): AsyncGenerator<ResponseEvent> {
    let shouldFail = false;

    // Process all chunks of input
    for await (const chunk of input) {
        observedPrompts.push(chunk);
        if (chunk.role !== 'user') {
            continue;
        }

        shouldFail ||= chunk.text.includes('[fail]');
        await waitMs(10);

        // For this value to run offline we pretend that the secret value was used in the response text
        yield { tag: 'delta', val: `${SECRET_VALUE}:${chunk.text}` };
    }

    yield shouldFail ? { tag: 'error', val: 'mock generation failed' } : { tag: 'complete' };
}
