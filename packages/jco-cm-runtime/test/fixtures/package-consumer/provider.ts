import type { ResourceModule, ConversionModule, StringModule, WebIdlModule, CoreModule } from './contract.js';
export const initializeTaskRegisters: CoreModule['initializeTaskRegisters'] = () => ({});
export const clampGuest: CoreModule['clampGuest'] = (value, min, max) => {
    if (value < min || value > max) {
        throw new TypeError('out of range');
    }
    return value;
};
export const initializeWebIdlProxyCache: WebIdlModule['initializeWebIdlProxyCache'] = () => ({ proxy: undefined });
export const validateHostChar: StringModule['validateHostChar'] = (value) => {
    if (typeof value !== 'string') {
        throw new TypeError('must be a string');
    }
    return value.codePointAt(0);
};
export const toUint32: ConversionModule['toUint32'] = (context, value) => {
    if (context.strict && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffffffff)) {
        throw new TypeError('invalid u32');
    }
    return (value as number) >>> 0;
};
export const tableGet: ResourceModule['tableGet'] = (context, table, handle) => {
    const scope = table[2 * handle];
    const value = table[2 * handle + 1];
    const own = value >= 2 ** 32;
    const rep = own ? value - 2 ** 32 : value;
    if (value === undefined || scope & (1 << 30)) {
        throw new context.RuntimeError('invalid handle');
    }
    return { rep, scope, own };
};
