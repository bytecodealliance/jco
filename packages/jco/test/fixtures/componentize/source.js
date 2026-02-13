class Bar {
    constructor(name) {
        this.name = name;
    }
}

export const foo = {
    Bar,
};

let idx = 1;

export function createBar() {
    return new Bar("bar" + idx++);
}

export function consumeBar(bar) {
    return bar.name;
}

export function hello() {
    return "world";
}
