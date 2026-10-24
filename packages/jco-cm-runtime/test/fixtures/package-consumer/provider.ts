import type { ResourceModule } from './contract.js';
export const tableGet: ResourceModule['tableGet'] = (context, table, handle) => {
    const scope = table[2 * handle];
    const value = table[2 * handle + 1];
    const rep = value & ~(1 << 30);
    if (value === undefined || !rep || scope & (1 << 30)) {
        throw new context.RuntimeError('invalid handle');
    }
    return { rep, scope, own: !!(value & (1 << 30)) };
};
