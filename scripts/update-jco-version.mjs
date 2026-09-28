import { readFile, writeFile } from 'node:fs/promises';
import { argv, env } from 'node:process';
import { pathToFileURL } from 'node:url';

export async function main() {
    const { CURRENT_VERSION, NEXT_VERSION } = env;
    if (!CURRENT_VERSION || !NEXT_VERSION) {
        throw new Error('CURRENT_VERSION and NEXT_VERSION must be set');
    }

    const path = 'src/jco.ts';
    const current = `version("${CURRENT_VERSION}")`;
    const next = `version("${NEXT_VERSION}")`;
    const source = await readFile(path, 'utf8');
    if (!source.includes(current)) throw new Error(`Missing ${current} in ${path}`);
    await writeFile(path, source.replace(current, next));
}

if (import.meta.main ?? (argv[1] && import.meta.url === pathToFileURL(argv[1]).href)) {
    main().then(
        () => console.log('Updated jco CLI version'),
        (error) => {
            console.error(error);
            process.exitCode = 1;
        },
    );
}
