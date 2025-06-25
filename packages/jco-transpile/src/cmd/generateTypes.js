import { runTypesComponent } from '../typegen.js';
import { writeFiles, printFileSummary } from '../common.js';

export async function runGenerateHostTypes(witPath, opts) {
    const files = await runTypesComponent(witPath, opts);
    await writeFiles(files);
    await printFileSummary(files, opts.quiet ? false : 'Generated Type Files');
    return files;
}

export async function runGenerateGuestTypes(witPath, opts) {
    const files = await runTypesComponent(witPath, { ...opts, guest: true });
    await writeFiles(files);
    await printFileSummary(
        files,
        opts.quiet
            ? false
            : 'Generated Guest Typescript Definition Files (.d.ts)'
    );
    return files;
}
