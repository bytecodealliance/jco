export const RUNTIME_API_VERSION = 1 as const;

export type RuntimeApiVersion = number;
export type AsyncDeterminism = 'random' | 'deterministic';

export type ResourceHandle = number;
export type ResourceRep = number;
export type ResourceScope = number;

export interface RuntimeErrorConstructor {
    new (message?: string): Error;
    readonly prototype: Error;
}

export interface RuntimePlatform {
    readonly WebAssembly: {
        readonly RuntimeError: RuntimeErrorConstructor;
    };
}

export interface RuntimeOptions {
    readonly requestedApiVersion: RuntimeApiVersion;
    readonly strict: boolean;
    readonly flagsAsBigInt: boolean;
    readonly nodejsCompat: boolean;
    readonly asyncDeterminism: AsyncDeterminism;
    readonly platform?: Partial<RuntimePlatform>;
}

export interface ResourceTableEntry {
    readonly rep: ResourceRep;
    readonly scope: ResourceScope;
    readonly own: boolean;
}

export interface ResourceIntrinsics {
    tableGet(table: ArrayLike<number>, handle: ResourceHandle): ResourceTableEntry;
}

export interface RuntimeIntrinsics {
    readonly resource: ResourceIntrinsics;
}

export interface ComponentModelRuntime {
    readonly apiVersion: RuntimeApiVersion;
    readonly intrinsics: RuntimeIntrinsics;
    dispose?(): void;
}

export interface ComponentModelRuntimeProvider {
    readonly apiVersion: RuntimeApiVersion;
    create(options: RuntimeOptions): ComponentModelRuntime;
}
