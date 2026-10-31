import { collectMatched } from '../bench/external-runtime/investigation/matched-collector.mjs';

await collectMatched(process.argv.slice(2));
