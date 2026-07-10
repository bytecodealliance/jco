import type { ResponseEvent } from './llm.js';

export const SECRET_VALUE = 'sk-demo-7f3a9c2e';

// Basic filtering of responses coming from an LLM
//
// WARNING: Exact replacement is not sufficient protection for real LLM output. 
//
// For example, a user could ask the model to put a space between every character 
// of the secret and bypass this filter.
export async function* filterResponse(input: AsyncIterable<ResponseEvent>): AsyncGenerator<ResponseEvent> {
    for await (const event of input) {
        if (event.tag === 'delta') {
            yield { ...event, val: event.val.replaceAll(SECRET_VALUE, '[redacted]') };
        } else {
            yield event;
        }
    }
}
