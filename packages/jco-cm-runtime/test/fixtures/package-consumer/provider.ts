import type {
    ResourceModule,
    ConversionModule,
    StringModule,
    WebIdlModule,
    CoreModule,
    ComponentModule,
    AsyncTaskModule,
} from './contract.js';
export const initializeTasksByComponent: AsyncTaskModule['initializeTasksByComponent'] = () => new Map();
export const getCurrentTask: AsyncTaskModule['getCurrentTask'] = ({ tasks, registers }, componentIdx, taskID) => {
    const entries = tasks.get(componentIdx);
    if (!entries?.length) {
        return undefined;
    }
    if (taskID) {
        return entries.find((meta) => meta.task.id() === taskID);
    }
    const current = registers[componentIdx];
    const executing = current && entries.find((meta) => meta.task.id() === current.taskID);
    return executing || entries.at(-1);
};
export const initializeStoreTrap: ComponentModule['initializeStoreTrap'] = () => ({ error: null });
export const checkMayLeave: ComponentModule['checkMayLeave'] = (context, componentIdx) => {
    if (context.instanceFlags.get(componentIdx)?.value !== 1) {
        throw new context.RuntimeError('cannot leave component instance');
    }
};
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
