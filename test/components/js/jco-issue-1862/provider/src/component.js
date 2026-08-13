class NamedResource {
    constructor(name) {
        this.name = name;
    }

    getName() {
        return this.name;
    }
}

export const resources = {
    NamedResource,
    roundtripOwned(value) {
        return value;
    },
};

export const run = {
    run() {},
};
