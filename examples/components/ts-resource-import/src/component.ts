/// <reference path="../generated/types/guest/import/imported.d.ts" />
import { Example } from 'test:component/resources';

export const run = {
    run() {
        using ex = new Example();
        console.error(ex.hello('WORLD'));
    },
};
