import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { DEFAULT_GROUPS, DEFAULT_RUNTIME_BASE, runRuntimeConformance } from './cm-runtime-conformance/index.mjs';

export { runRuntimeConformance } from './cm-runtime-conformance/index.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { values } = parseArgs({
        options: {
            'runtime-base': { type: 'string', default: DEFAULT_RUNTIME_BASE },
            group: { type: 'string', multiple: true },
            help: { type: 'boolean', short: 'h' },
        },
    });
    if (values.help) {
        console.log(`Usage: node test-jco-cm-runtime-release.mjs [--runtime-base <package-or-directory>] [--group <name>]...

Runtime base defaults to ${DEFAULT_RUNTIME_BASE}.
Available groups: ${DEFAULT_GROUPS.join(', ')}. All groups run by default.
Relative directory bases resolve from the working directory.`);
    } else {
        const result = await runRuntimeConformance({ base: values['runtime-base'], groups: values.group });
        console.log(`CM runtime conformance passed: ${result.base} (${result.groups.join(', ')})`);
    }
}
