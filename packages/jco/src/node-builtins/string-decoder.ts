import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";

const STRING_DECODER_SPECIFIER = "node:string_decoder";

/** Source of the capability-free `node:string_decoder` ESM facade. */
function stringDecoderAdapter(stringDecoderModule: string): string {
    return `
import stringDecoder from ${JSON.stringify(stringDecoderModule)};
export default stringDecoder;
export { StringDecoder } from ${JSON.stringify(stringDecoderModule)};
`;
}

export function createStringDecoderBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(STRING_DECODER_SPECIFIER, () =>
        stringDecoderAdapter(stdModule(options.stringDecoderModule, "string-decoder")),
    );
}
