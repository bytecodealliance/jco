import type { NewPackageManager } from "./new.js";

export interface PackageManagerAdapter {
    name: NewPackageManager;
    executable: string;
    packageManager: string;
    lockfile: string;
    install: string;
    run(script: string): string;
}

const PACKAGE_MANAGERS: Record<NewPackageManager, PackageManagerAdapter> = {
    pnpm: {
        name: "pnpm",
        executable: "pnpm",
        packageManager: "pnpm@11.0.0",
        lockfile: "pnpm-lock.yaml",
        install: "pnpm install",
        run: (script) => `pnpm run ${script}`,
    },
    npm: {
        name: "npm",
        executable: "npm",
        packageManager: "npm@11.0.0",
        lockfile: "package-lock.json",
        install: "npm install",
        run: (script) => `npm run ${script}`,
    },
    yarn: {
        name: "yarn",
        executable: "yarn",
        packageManager: "yarn@4.9.2",
        lockfile: "yarn.lock",
        install: "yarn install",
        run: (script) => `yarn run ${script}`,
    },
};

export function packageManagerAdapter(name: NewPackageManager): PackageManagerAdapter {
    return PACKAGE_MANAGERS[name];
}
