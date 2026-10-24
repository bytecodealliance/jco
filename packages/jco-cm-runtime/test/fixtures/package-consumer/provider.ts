import type { ResourceModule } from './contract.js';
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
