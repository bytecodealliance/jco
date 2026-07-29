let disposeCount = 0;

class Example {
    constructor(id) {
        this.id = id;
    }

    getId() {
        return this.id;
    }

    [Symbol.dispose]() {
        disposeCount += 1;
    }
}

export const resources = {
    Example,
    disposeCount() {
        return disposeCount;
    },
};
