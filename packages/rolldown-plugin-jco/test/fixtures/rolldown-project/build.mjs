import { rolldown } from "rolldown";

import config from "./rolldown.config.mjs";

const bundle = await rolldown({
    input: config.input,
    external: config.external,
    plugins: config.plugins,
});

await bundle.write(config.output);
await bundle.close();
