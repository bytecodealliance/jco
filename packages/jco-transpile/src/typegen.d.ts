import type { FileBytes } from './common';

type TypeGenerationOptions = {
    name?: string;
    worldName?: string;
    instantiation?: 'async' | 'sync';
    tlaCompat?: bool;
    asyncMode?: string;
    asyncImports?: string[];
    asyncExports?: string[];
    outDir?: string;
    features?: string[] | 'all';
    allFeatures?: boolean;
    asyncWasiImports?: boolean;
    asyncWasiExports?: boolean;
    guest?: bool;
};

export function generateHostTypes(
    witPath: string,
    opts?: TypeGenerationOptions
): Promise<FileBytes>;

export function generateGuestTypes(
    witPath: string,
    opts: TypeGenerationOptions
): Promise<FileBytes>;

export function runTypesComponent(
    witPath: string,
    opts: TypeGenerationOptions
): Promise<FileBytes>;
