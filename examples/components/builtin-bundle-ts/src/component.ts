import { makeGreeting } from './greeting.ts';
import type { Greeter } from './types.ts';

export const greeter: Greeter = {
    greet(name: string): string {
        return makeGreeting(name);
    },
};
