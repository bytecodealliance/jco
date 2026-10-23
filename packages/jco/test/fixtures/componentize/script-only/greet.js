import { log } from "local:greeter/logger";

class Counter {
    #value;

    constructor(start) {
        this.#value = start;
    }

    static next(start) {
        return new Counter(start + 1);
    }

    get() {
        return this.#value;
    }

    increment() {
        this.#value += 1;
    }
}

export const greeter = {
    Counter,
    greet(name) {
        log(`greeting ${name}`);
        return `Hello, ${name}!`;
    },
};

export function run() {
    return "greet";
}
