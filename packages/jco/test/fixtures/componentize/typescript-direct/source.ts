import { greeting } from "./greeting.ts";
import type { Greeting } from "./types.ts";

const message: Greeting = { text: greeting };

export function hello(name: string): string {
    return `${message.text}, ${name}`;
}
