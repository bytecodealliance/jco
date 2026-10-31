import type { WebIdlModule } from '../runtime.js';

export const initializeWebIdlProxyCache: WebIdlModule['initializeWebIdlProxyCache'] = () => ({ proxy: undefined });

export const globalThisIdlProxy: WebIdlModule['globalThisIdlProxy'] = (context) => {
    if (context.proxy) {
        return context.proxy;
    }
    const innerSymbol = Symbol('inner');
    const isProxySymbol = Symbol('isProxy');
    const uppercaseRegex = /html|Html|dom|Dom/g;
    const globalNames = ['Window', 'WorkerGlobalScope'];

    function proxy(target: object, fake: object = {}): object {
        const origTarget = target;
        return new Proxy(fake, {
            get: (_, prop, receiver) => {
                if (prop === innerSymbol) {
                    return origTarget;
                }
                if (prop === isProxySymbol) {
                    return true;
                }
                if (typeof prop !== 'string') {
                    return maybeProxy(Reflect.get(origTarget, prop));
                }
                if (origTarget === globalThis && prop.startsWith('get') && globalNames.includes(prop.slice(3))) {
                    return () => receiver;
                }
                prop = prop.replaceAll(uppercaseRegex, (x) => x.toUpperCase());
                if (prop.startsWith('set')) {
                    return (val: unknown) => Reflect.set(origTarget, `${prop[3].toLowerCase()}${prop.slice(4)}`, val);
                }
                if (prop.startsWith('as')) {
                    return () => receiver;
                }
                const res = Reflect.get(origTarget, prop);
                if (res === undefined && prop[0].toUpperCase() === prop[0]) {
                    const key = `${prop[0].toLowerCase()}${prop.slice(1)}`;
                    const obj = Reflect.get(globalThis, key);
                    if (obj) {
                        return Object.getPrototypeOf(obj).constructor;
                    }
                }
                return maybeProxy(res);
            },
            apply: (_, thisArg, args) => {
                if (args.length === 1 && Array.isArray(args[0]) && Reflect.get(origTarget, 'length') === 0) {
                    args = args[0];
                }
                const res = Reflect.apply(
                    origTarget as (...args: unknown[]) => unknown,
                    proxyInner(thisArg),
                    args.map((a) => (a[isProxySymbol] ? proxyInner(a) : a)),
                );
                return typeof res === 'object' ? proxy(res as object) : res;
            },
            getPrototypeOf: () => Reflect.getPrototypeOf(origTarget),
            construct: (_, args, newTarget) =>
                maybeProxy(
                    Reflect.construct(origTarget as new (...args: unknown[]) => object, args, newTarget),
                ) as object,
            defineProperty: (_, property, attributes) => Reflect.defineProperty(origTarget, property, attributes),
            deleteProperty: (_, property) => Reflect.deleteProperty(origTarget, property),
            getOwnPropertyDescriptor: (_, property) => Reflect.getOwnPropertyDescriptor(origTarget, property),
            has: (_, property) => Reflect.has(origTarget, property),
            isExtensible: () => Reflect.isExtensible(origTarget),
            // Preserve the inline proxy's reflection behavior as well as its
            // ordinary property and call paths.
            ownKeys: () => maybeProxy(Reflect.ownKeys(origTarget)) as ArrayLike<string | symbol>,
            preventExtensions: () => Reflect.preventExtensions(origTarget),
            set: (_, property, value, receiver) => Reflect.set(origTarget, property, value, receiver),
            setPrototypeOf: (_, value) => Reflect.setPrototypeOf(origTarget, value),
        });
    }

    function maybeProxy(res: unknown): unknown {
        if (typeof res === 'function' && res.prototype?.constructor === res) {
            return res;
        }
        if (typeof res === 'function') {
            return proxy(res, () => {});
        }
        if (typeof res === 'object' && res !== null) {
            return () => proxy(res);
        }
        return res;
    }

    function proxyInner(value: unknown): unknown {
        return value ? (value as Record<symbol, unknown>)[innerSymbol] : value;
    }

    return (context.proxy = proxy(globalThis));
};
