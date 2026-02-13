declare module 'test:flavorful/flavorful' {
    export type * as TestFlavorfulTest from 'test:flavorful/test'; // import test:flavorful/test
    export * as test from 'test:flavorful/test'; // export test:flavorful/test
    export function testImports(): void;
}
