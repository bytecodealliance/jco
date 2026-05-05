/** Map fs.Dirent -> WASI type */
export function wasiTypeFromDirent(obj) {
  if (obj.isFile()) {
    return { tag: "regular-file" };
  } else if (obj.isSocket()) {
    return { tag: "socket" };
  } else if (obj.isSymbolicLink()) {
    return { tag: "symbolic-link" };
  } else if (obj.isFIFO()) {
    return { tag: "fifo" };
  } else if (obj.isDirectory()) {
    return { tag: "directory" };
  } else if (obj.isCharacterDevice()) {
    return { tag: "character-device" };
  } else if (obj.isBlockDevice()) {
    return { tag: "block-device" };
  }
  return { tag: "other", val: undefined };
}
