import { _getPreopens } from "../filesystem.js";
import {
    writeFileAt as writeFileAtImpl,
    readFileAt as readFileAtImpl,
    type WriteFileAtOptions,
} from "../../common/helpers/filesystem.js";

export type { WriteFileAtOptions };

/** Write bytes into a preopened directory's tree from host JS, without a guest. */
export function writeFileAt(
    virtualPath: string,
    path: string,
    data: Uint8Array,
    options: WriteFileAtOptions = {},
): void {
    writeFileAtImpl(_getPreopens(), virtualPath, path, data, options);
}

/** Read the full contents of a file under a preopened directory from host JS, without a guest. */
export function readFileAt(virtualPath: string, path: string): Uint8Array {
    return readFileAtImpl(_getPreopens(), virtualPath, path);
}
