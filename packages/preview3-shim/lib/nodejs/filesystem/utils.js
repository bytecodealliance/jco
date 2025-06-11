/** Map fs.Dirent -> WASI type */
export function wasiTypeFromDirent(obj) {
    if (obj.isFile()) {
        return 'regular-file';
    } else if (obj.isSocket()) {
        return 'socket';
    } else if (obj.isSymbolicLink()) {
        return 'symbolic-link';
    } else if (obj.isFIFO()) {
        return 'fifo';
    } else if (obj.isDirectory()) {
        return 'directory';
    } else if (obj.isCharacterDevice()) {
        return 'character-device';
    } else if (obj.isBlockDevice()) {
        return 'block-device';
    }
    return 'unknown';
}
