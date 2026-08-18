import type { NewPackageManager } from "../new.js";

export interface PackageManagerAdapter {
    name: NewPackageManager;
    executable: string;
    packageManager: string;
    lockfile: string;
    install: string;
    run(script: string): string;
}

export const DEFAULT_PNPM_VERSION = "11.0.0";
export const DEFAULT_NPM_VERSION = "12.0.2";
export const DEFAULT_YARN_VERSION = "4.18.0";

const PACKAGE_MANAGERS: Record<NewPackageManager, PackageManagerAdapter> = {
    pnpm: {
        name: "pnpm",
        executable: "pnpm",
        packageManager: `pnpm@${DEFAULT_PNPM_VERSION}`,
        lockfile: "pnpm-lock.yaml",
        install: "pnpm install",
        run: (script) => `pnpm run ${script}`,
    },
    npm: {
        name: "npm",
        executable: "npm",
        packageManager: `npm@${DEFAULT_NPM_VERSION}`,
        lockfile: "package-lock.json",
        install: "npm install",
        run: (script) => `npm run ${script}`,
    },
    yarn: {
        name: "yarn",
        executable: "yarn",
        packageManager: `yarn@${DEFAULT_YARN_VERSION}`,
        lockfile: "yarn.lock",
        install: "yarn install",
        run: (script) => `yarn run ${script}`,
    },
};

export function packageManagerAdapter(name: NewPackageManager): PackageManagerAdapter {
    return PACKAGE_MANAGERS[name];
}
