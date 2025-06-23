import type { TypeGenerationOptions } from '../typegen';

export function runGenerateHostTypes(
    witPath: string,
    opts?: TypeGenerationOptions
): Promise<void>;

export function runGenerateGuestTypes(
    witPath: string,
    opts: TypeGenerationOptions
): Promise<void>;
