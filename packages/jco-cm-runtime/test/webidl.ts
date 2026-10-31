import { expect, test } from 'vitest';

import { globalThisIdlProxy, initializeWebIdlProxyCache } from '../src/intrinsics/webidl.js';

function webidl() {
    const context = initializeWebIdlProxyCache();
    return { globalThisIdlProxy: () => globalThisIdlProxy(context) };
}

test.concurrent('caches the global proxy per store and preserves global aliases', () => {
    const a = webidl();
    const first = a.globalThisIdlProxy();
    expect(a.globalThisIdlProxy()).toBe(first);
    expect(webidl().globalThisIdlProxy()).not.toBe(first);
    expect(Reflect.get(first, 'getWindow')()).toBe(first);
    expect(Reflect.get(first, 'getWorkerGlobalScope')()).toBe(first);
    expect(Reflect.get(first, 'asWindow')()).toBe(first);
    expect(Reflect.get(first, 'URL')).toBe(URL);
});

test.concurrent('adapts accessors, setters, HTML/DOM names and native method receivers', () => {
    const key = Symbol('webidl fixture');
    const symbol = Symbol('value');
    const target = {
        count: 1,
        innerHTML: '<b>hello</b>',
        DOMName: 'node',
        [symbol]: 42,
        increment(value: number) {
            this.count += value;
            return this.count;
        },
    };
    Reflect.set(globalThis, key, target);
    try {
        const proxy = Reflect.get(webidl().globalThisIdlProxy(), key)();
        expect(proxy.count).toBe(1);
        expect(proxy.innerHtml).toBe('<b>hello</b>');
        expect(proxy.domName).toBe('node');
        expect(proxy[symbol]).toBe(42);
        expect(proxy.asNode()).toBe(proxy);
        expect(proxy.setCount(10)).toBe(true);
        expect(proxy.increment(2)).toBe(12);
        expect(target.count).toBe(12);
        expect(Object.getPrototypeOf(proxy)).toBe(Object.getPrototypeOf(target));
        expect('count' in proxy).toBe(true);
    } finally {
        Reflect.deleteProperty(globalThis, key);
    }
});

test.concurrent('unwraps proxy arguments and adapts object results and zero-arity calls', () => {
    const key = Symbol('webidl fixture');
    const value = { id: 7 };
    const target = {
        value,
        matches(candidate: unknown) {
            return candidate === value;
        },
        result() {
            return value;
        },
        variadic(...args: string[]) {
            return args.join(':');
        },
    };
    Reflect.set(globalThis, key, target);
    try {
        const proxy = Reflect.get(webidl().globalThisIdlProxy(), key)();
        expect(proxy.matches(proxy.value())).toBe(true);
        expect(proxy.result().id).toBe(7);
        expect(proxy.variadic(['a', 'b'])).toBe('a:b');
    } finally {
        Reflect.deleteProperty(globalThis, key);
    }
});

test.concurrent('forwards property mutations and descriptors', () => {
    const key = Symbol('webidl fixture');
    const target = { value: 1 };
    Reflect.set(globalThis, key, target);
    try {
        const proxy = Reflect.get(webidl().globalThisIdlProxy(), key)();
        proxy.value = 2;
        expect(target.value).toBe(2);
        expect(Object.getOwnPropertyDescriptor(proxy, 'value')?.value).toBe(2);
        Object.defineProperty(proxy, 'other', { value: 3, configurable: true });
        expect(Reflect.get(target, 'other')).toBe(3);
        expect(Reflect.deleteProperty(proxy, 'other')).toBe(true);
        expect(Reflect.has(target, 'other')).toBe(false);
    } finally {
        Reflect.deleteProperty(globalThis, key);
    }
});

test.concurrent('preserves the native method destructuring limitation', () => {
    const key = Symbol('native method fixture');
    Reflect.set(globalThis, key, new Map([[1, 42]]));
    try {
        const proxy = Reflect.get(webidl().globalThisIdlProxy(), key)();
        expect(proxy.get(1)).toBe(42);
        const get = proxy.get;
        expect(() => get(1)).toThrow(TypeError);
    } finally {
        Reflect.deleteProperty(globalThis, key);
    }
});

test.concurrent('the explicit proxy cache remains the live owner', () => {
    const context = initializeWebIdlProxyCache();
    const first = globalThisIdlProxy(context);
    expect(context.proxy).toBe(first);
    context.proxy = undefined;
    expect(globalThisIdlProxy(context)).not.toBe(first);
    context.proxy = first;
    expect(globalThisIdlProxy(context)).toBe(first);
});
