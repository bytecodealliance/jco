/* global TextDecoder */
import { readFile } from "node:fs/promises";

import { fileURLToPath, URL } from "node:url";

import { transpile, componentNew, componentEmbed } from "../src/api.js";
import { typesComponent } from "../src/cmd/types.js";

import { suite, test, assert } from "vitest";

suite(`TypeScript`, async () => {
    test.concurrent(`TS aliasing`, async () => {
        const witSource = await readFile(
            fileURLToPath(new URL(`./fixtures/wits/issue-365/issue-365.wit`, import.meta.url)),
            "utf8",
        );
        const component = await componentNew(
            await componentEmbed({
                witSource,
                dummy: true,
            }),
        );

        const { files } = await transpile(component, { name: "issue" });

        const dtsSource = new TextDecoder().decode(files["issue.d.ts"]);

        assert.ok(dtsSource.includes(`export type Bar = import('./interfaces/test-issue-types.js').Bar;`));
    });

    test.concurrent(`TS types`, async () => {
        const witSource = await readFile(
            fileURLToPath(new URL(`./fixtures/wits/issue-480/issue-480.wit`, import.meta.url)),
            "utf8",
        );
        const component = await componentNew(
            await componentEmbed({
                witSource,
                dummy: true,
            }),
        );

        const { files } = await transpile(component, { name: "issue" });

        const dtsSource = new TextDecoder().decode(files["interfaces/test-issue-types.d.ts"]);

        assert.ok(dtsSource.includes(`export function foobarbaz(): Array<Value | undefined>;`));
    });

    // NOTE: somewhat confusingly, host generation of resources should *not*
    // generation Disposable, because the embedder may or may not choose to make
    // the implemented resource import disposable or not.
    //
    test.concurrent(`Disposable interface generation (host-types, import) `, async () => {
        const witSource = await readFile(
            fileURLToPath(new URL(`./fixtures/wits/disposable-resources/disposable-resources.wit`, import.meta.url)),
            "utf8",
        );
        const component = await componentNew(
            await componentEmbed({
                witSource,
                dummy: true,
            }),
        );

        const { files } = await transpile(component, { name: "disposable" });

        const mainDtsSource = new TextDecoder().decode(files["disposable.d.ts"]);
        assert(
            [`export class Database implements Disposable {`, `[Symbol.dispose](): void;`].every(
                (s) => !mainDtsSource.includes(s),
            ),
            "Database resource should not implement Disposable interface",
        );

        const interfaceDtsSource = new TextDecoder().decode(
            files["interfaces/test-disposable-resources-resources.d.ts"],
        );
        assert(
            [
                `export class FileHandle implements Disposable {`,
                `export class Connection implements Disposable {`,
                `[Symbol.dispose](): void;`,
            ].every((s) => !interfaceDtsSource.includes(s)),
            "FileHandle/Connection resources should not implement Disposable interface",
        );
    });

    // NOTE: When generating guest types, the generated import shims provided *will*
    // have automatically generated disposal code, and thus we should have Disposable implementations
    test.concurrent(`Disposable interface generation (guest-types, import) `, async () => {
        const witPath = fileURLToPath(
            new URL(`./fixtures/wits/disposable-resources/disposable-resources.wit`, import.meta.url),
        );

        const files = await typesComponent(witPath, { guest: true });

        const mainDtsSource = new TextDecoder().decode(files["disposable.d.ts"]);
        assert.isFalse(
            [`export class Database implements Disposable {`, `[Symbol.dispose](): void;`].every((s) =>
                mainDtsSource.includes(s),
            ),
            "Database resource should implement Disposable interface",
        );

        const interfaceDtsSource = new TextDecoder().decode(
            files["interfaces/test-disposable-resources-resources.d.ts"],
        );
        assert(
            [
                `export class FileHandle implements Disposable {`,
                `export class Connection implements Disposable {`,
                `[Symbol.dispose](): void;`,
            ].every((s) => interfaceDtsSource.includes(s)),
            "FileHandle/Connection resources should implement Disposable interface",
        );
    });

    // Regression test for https://github.com/bytecodealliance/jco/issues/1708
    //
    // In `--instantiation` mode the world's exports are wrapped in an
    // `export interface {World} { ... }`. The `Result`/`Option` helper type
    // aliases required by exported functions must be emitted at the top level,
    // outside that interface, otherwise the generated `.d.ts` is invalid
    // TypeScript (a type alias is not a valid interface member).
    test.concurrent(`helper type aliases stay at top level in instantiation mode (issue 1708)`, async () => {
        const witSource = await readFile(
            fileURLToPath(new URL(`./fixtures/wits/issue-1708/issue-1708.wit`, import.meta.url)),
            "utf8",
        );
        const component = await componentNew(
            await componentEmbed({
                witSource,
                dummy: true,
            }),
        );

        const { files } = await transpile(component, {
            name: "issue",
            instantiation: "async",
        });

        const dtsSource = new TextDecoder().decode(files["issue.d.ts"]);

        // Both the `Result` (from the `result<...>` export) and the `Option`
        // (from the `option<...>` export) helper aliases must be present...
        assert.ok(
            dtsSource.includes(`export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };`),
            "Result helper type alias should be emitted",
        );
        assert.ok(
            dtsSource.includes(`export type Option<T> = { tag: 'none' } | { tag: 'some', val: T };`),
            "Option helper type alias should be emitted",
        );

        // ...and both must appear after the closing brace of the world
        // interface, i.e. at the top level rather than nested inside the
        // interface body.
        const interfaceOpen = dtsSource.indexOf(`export interface Root {`);
        const interfaceClose = dtsSource.indexOf(`}`, interfaceOpen);
        const resultAlias = dtsSource.indexOf(`export type Result<T, E>`);
        const optionAlias = dtsSource.indexOf(`export type Option<T>`);
        assert.ok(interfaceOpen !== -1, "world interface should be generated in instantiation mode");
        assert.ok(resultAlias > interfaceClose, "Result helper type alias must be emitted outside the world interface");
        assert.ok(optionAlias > interfaceClose, "Option helper type alias must be emitted outside the world interface");
    });

    // Companion to the issue 1708 test above: the default (non-instantiation)
    // mode shares the helper-alias emission path, so guard against regressions
    // there too. In this mode the world exports are top-level `export function`
    // declarations (no `export interface {World}` wrapper), and the helper
    // aliases are likewise emitted at the top level.
    test.concurrent(`helper type aliases stay at top level in default mode (issue 1708)`, async () => {
        const witSource = await readFile(
            fileURLToPath(new URL(`./fixtures/wits/issue-1708/issue-1708.wit`, import.meta.url)),
            "utf8",
        );
        const component = await componentNew(
            await componentEmbed({
                witSource,
                dummy: true,
            }),
        );

        const { files } = await transpile(component, { name: "issue" });

        const dtsSource = new TextDecoder().decode(files["issue.d.ts"]);

        // Exports are plain top-level functions, not interface members.
        assert.ok(
            dtsSource.includes(`export function parseConfig(source: string): string;`),
            "exported functions should be emitted as top-level declarations",
        );
        // The default mode does not wrap exports in an interface.
        assert.ok(
            !dtsSource.includes(`export interface Root {`),
            "default mode should not generate a world interface wrapper",
        );
        // Both helper aliases are present (and therefore at the top level).
        assert.ok(
            dtsSource.includes(`export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };`),
            "Result helper type alias should be emitted",
        );
        assert.ok(
            dtsSource.includes(`export type Option<T> = { tag: 'none' } | { tag: 'some', val: T };`),
            "Option helper type alias should be emitted",
        );
    });

    // Async-lifted functions that are sync lowered must return promises
    // that callers can resolve however they choose to.
    test.concurrent(`sync lowered async fn returns Promse<T> (guest-types)`, async () => {
        const witPath = fileURLToPath(new URL(`./fixtures/wits/async-flat-param-adder/test.wit`, import.meta.url));
        const files = await typesComponent(witPath, { guest: true });
        const interfaceDtsSource = new TextDecoder().decode(files["interfaces/test1-test2-test3.d.ts"]);
        assert(interfaceDtsSource.includes("test4(a: number, b: number): Promise<number>"), "test4 returns a Promise");
    });
});
