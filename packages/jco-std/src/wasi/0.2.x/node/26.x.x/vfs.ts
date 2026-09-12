import * as host from "jco:node/fs@0.1.0";
import { createVfs } from "./vfs/core.js";

const vfs = createVfs(host);

export const create = vfs.create;

export const VirtualFileSystem = vfs.VirtualFileSystem;

export const VirtualProvider = vfs.VirtualProvider;

export const MemoryProvider = vfs.MemoryProvider;

export const RealFSProvider = vfs.RealFSProvider;

export default vfs;
