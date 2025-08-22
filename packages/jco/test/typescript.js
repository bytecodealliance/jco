/* global TextDecoder */
import { readFile } from 'node:fs/promises';

import { fileURLToPath, URL } from 'node:url';

import { transpile, componentNew, componentEmbed } from '../src/api.js';
import { typesComponent } from '../src/cmd/types.js';

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

    // NOTE: somewhat confusingly, host generation of resources should *not*
    // generation Disposable, because the embedder may or may not choose to make
    // the implemented resource import disposable or not.
    //
    test(`(host-types, import) Disposable interface generation`, async () => {
        const witSource = await readFile(
            fileURLToPath(
                new URL(
                    `./fixtures/wits/disposable-resources/disposable-resources.wit`,
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

        const { files } = await transpile(component, { name: 'disposable' });

        const mainDtsSource = new TextDecoder().decode(
            files['disposable.d.ts']
        );
        assert(
            [
                `export class Database implements Disposable {`,
                `[Symbol.dispose](): void;`,
            ].every((s) => !mainDtsSource.includes(s)),
            'Database resource should not implement Disposable interface'
        );

        const interfaceDtsSource = new TextDecoder().decode(
            files['interfaces/test-disposable-resources-resources.d.ts']
        );
        assert(
            [
                `export class FileHandle implements Disposable {`,
                `export class Connection implements Disposable {`,
                `[Symbol.dispose](): void;`,
            ].every((s) => !interfaceDtsSource.includes(s)),
            'FileHandle/Connection resources should not implement Disposable interface'
        );
    });

    // NOTE: When generating guest types, the generated import shims provided *will*
    // have automatically generated disposal code, and thus we should have Disposable implementations
    test(`(guest-types, import) Disposable interface generation`, async () => {
        const witPath = fileURLToPath(
            new URL(
                `./fixtures/wits/disposable-resources/disposable-resources.wit`,
                import.meta.url
            )
        );

        const files = await typesComponent(witPath, { guest: true });

        const mainDtsSource = new TextDecoder().decode(
            files['disposable.d.ts']
        );
        assert.isFalse(
            [
                `export class Database implements Disposable {`,
                `[Symbol.dispose](): void;`,
            ].every((s) => mainDtsSource.includes(s)),
            'Database resource should implement Disposable interface'
        );

        const interfaceDtsSource = new TextDecoder().decode(
            files['interfaces/test-disposable-resources-resources.d.ts']
        );
        assert(
            [
                `export class FileHandle implements Disposable {`,
                `export class Connection implements Disposable {`,
                `[Symbol.dispose](): void;`,
            ].every((s) => interfaceDtsSource.includes(s)),
            'FileHandle/Connection resources should implement Disposable interface'
        );
    });
});
