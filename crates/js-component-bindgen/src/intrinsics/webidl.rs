//! Intrinsics that represent helpers that enable WebIDL integration

use crate::{intrinsics::Intrinsic, source::Source};

/// This enum contains intrinsics that enable WebIDL
#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum WebIdlIntrinsic {
    GlobalThisIdlProxy,
}

impl WebIdlIntrinsic {
    /// Retrieve dependencies for this intrinsic
    pub fn deps() -> &'static [&'static Intrinsic] {
        &[]
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        ["globalThisIdlProxy"]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            WebIdlIntrinsic::GlobalThisIdlProxy => "globalThisIdlProxy",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source) {
        match self {
            Self::GlobalThisIdlProxy => output.push_str(r#"
                var idlProxy;
                function globalThisIdlProxy () {
                    if (idlProxy) return idlProxy;
                    const innerSymbol = Symbol('inner');
                    const isProxySymbol = Symbol('isProxy');
                    const uppercaseRegex = /html|Html|dom|Dom/g;
                    const globalNames = ['Window', 'WorkerGlobalScope'];
                    function proxy(target, fake = {}) {
                        const origTarget = target;
                        return new Proxy(fake, {
                            get: (_, prop, receiver) => {
                                if (prop === innerSymbol) return origTarget;
                                if (prop === isProxySymbol) return true;
                                if (typeof prop !== 'string') return maybeProxy(Reflect.get(origTarget, prop));
                                if (origTarget === globalThis && prop.startsWith('get') && globalNames.includes(prop.slice(3))) {
                                    return () => receiver;
                                }
                                prop = prop.replaceAll(uppercaseRegex, x => x.toUpperCase());
                                if (prop.startsWith('set')) return val => Reflect.set(origTarget, `${prop[3].toLowerCase()}${prop.slice(4)}`, val);
                                if (prop.startsWith('as')) return () => receiver;
                                const res = Reflect.get(origTarget, prop);
                                if (res === undefined && prop[0].toUpperCase() === prop[0]) {
                                    return Object.getPrototypeOf(globalThis[`${prop[0].toLowerCase()}${prop.slice(1)}`]).constructor;
                                }
                                return maybeProxy(res, prop);
                            },
                            apply: (_, thisArg, args) => {
                                if (args.length === 1 && Array.isArray(args[0]) && origTarget.length === 0) args = args[0];
                                const res = Reflect.apply(origTarget, proxyInner(thisArg), args.map(a =>  a[isProxySymbol] ? proxyInner(a) : a));
                                return typeof res === 'object' ? proxy(res) : res;
                            },
                            getPrototypeOf: _ => Reflect.getPrototypeOf(origTarget),
                            construct: (_, argArray, newTarget) => maybeProxy(Reflect.construct(origTarget, argArray, newTarget)),
                            defineProperty: (_, property, attributes) => maybeProxy(Reflect.defineProperty(origTarget, property, attributes)),
                            deleteProperty: (_, p) => maybeProxy(Reflect.deleteProperty(origTarget, p)),
                            getOwnPropertyDescriptor: (_, p) => Reflect.getOwnPropertyDescriptor(origTarget, p),
                            has: (_, p) => maybeProxy(Reflect.has(origTarget, p)),
                            isExtensible: (_) => maybeProxy(Reflect.isExtensible(origTarget)),
                            ownKeys: _ => maybeProxy(Reflect.ownKeys(origTarget)),
                            preventExtensions: _ => maybeProxy(Reflect.preventExtensions(origTarget)),
                            set: (_, p, newValue, receiver) => maybeProxy(Reflect.set(origTarget, p, newValue, receiver)),
                            setPrototypeOf: (_, v) => maybeProxy(Reflect.setPrototypeOf(origTarget, v)),
                        });
                    }
                    function maybeProxy(res, prop) {
                        // Catch Class lookups
                        if (typeof res === "function" && res.prototype?.constructor === res) return res;
                        // Catch "regular" function calls
                        if (typeof res === 'function') return proxy(res, () => {});
                        // Catch all other objects
                        if (typeof res === 'object' && res !== null) return () => proxy(res);
                        return res;
                    }
                    const proxyInner = proxy => proxy ? proxy[innerSymbol] : proxy;
                    return (idlProxy = proxy(globalThis));
                };
            "#),
        }
    }
}
