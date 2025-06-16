import { readFile } from 'node:fs/promises';

import { fileURLToPath } from 'url';

import { transpile, componentNew, componentEmbed } from '../src/api.js';

import { suite, test, beforeAll, assert } from 'vitest';

import { exec } from './helpers.js';
import { NODE_MODULES_TSC_BIN_PATH } from './common.js';

let TS_GEN_PROMISE;
export function tsGenerationPromise() {
    if (TS_GEN_PROMISE) {
        return TS_GEN_PROMISE;
    }
    return (TS_GEN_PROMISE = (async () => {
        const tsConfigPath = fileURLToPath(
            new URL('./tsconfig.json', import.meta.url)
        );
        var { stderr } = await exec(
            NODE_MODULES_TSC_BIN_PATH,
            '-p',
            tsConfigPath
        );
        assert.strictEqual(stderr, '');
    })());
}

suite(`TypeScript`, async () => {
    beforeAll(async () => {
        await tsGenerationPromise();
    });

    test(`TS aliasing`, async () => {
        const witSource = await readFile(
            fileURLToPath(
                new URL(
                    `./fixtures/wits/issue-365/issue-365.wit`,
                    import.meta.url
                )
            ),
            'utf8'
        );
        const component = await componentNew(
            await componentEmbed({
                witSource,
                dummy: true,
            })
        );

        const { files } = await transpile(component, { name: 'issue' });

        const dtsSource = new TextDecoder().decode(files['issue.d.ts']);

        assert.ok(
            dtsSource.includes(
                `export type Bar = import('./interfaces/test-issue-types.js').Bar;`
            )
        );
    });

    test(`TS types`, async () => {
        const witSource = await readFile(
            fileURLToPath(
                new URL(
                    `./fixtures/wits/issue-480/issue-480.wit`,
                    import.meta.url
                )
            ),
            'utf8'
        );
        const component = await componentNew(
            await componentEmbed({
                witSource,
                dummy: true,
            })
        );

        const { files } = await transpile(component, { name: 'issue' });

        const dtsSource = new TextDecoder().decode(
            files['interfaces/test-issue-types.d.ts']
        );

        assert.ok(
            dtsSource.includes(
                `export function foobarbaz(): Array<Value | undefined>;`
            )
        );
    });
});
