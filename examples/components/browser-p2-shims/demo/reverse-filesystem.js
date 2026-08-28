import { filesystem } from '@bytecodealliance/preview2-shim';

const decoder = new TextDecoder();

/**
 * Example browser filesystem adapter that stores every written byte sequence
 * backwards while presenting normal contents to the component.
 */
export function createReverseFilesystem() {
    const data = { dir: {} };
    const backing = new filesystem.InMemoryFilesystemAdapter();

    return {
        adapter: {
            getRoot(capability) {
                return wrapDescriptor(backing.getRoot(capability));
            },
        },
        data,
        storedText(path) {
            const source = data.dir[path]?.source;
            return source ? decoder.decode(source) : '';
        },
    };
}

function wrapDescriptor(descriptor) {
    return new Proxy(descriptor, {
        get(target, property) {
            if (property === 'openAt') {
                return (...args) => wrapDescriptor(target.openAt(...args));
            }
            if (property === 'read') {
                return (...args) => {
                    const [bytes, ended] = target.read(...args);
                    return [bytes.toReversed(), ended];
                };
            }
            if (property === 'write') {
                return (bytes, offset) => target.write(bytes.toReversed(), offset);
            }
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}
