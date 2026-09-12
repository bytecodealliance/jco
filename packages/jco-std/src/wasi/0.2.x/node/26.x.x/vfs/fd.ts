/**
 * Adapted from nodejs/node v26.8.2, commit
 * f2f2c2f246c36bd74f082cb43ecfe830657d81c9, lib/internal/vfs/fd.js.
 * Copyright Node.js contributors. MIT license (see jco-std/LICENSE).
 * Local changes: typed guest-local virtual descriptor registry.
 */
import type { VirtualFileHandle } from "./file-handle.js";

let nextFd = 0;

const openFiles = new Map<number, { entry: VirtualFileHandle }>();

export function openVirtualFd(entry: VirtualFileHandle): number {
  const fd = 0x40000000 | nextFd++;
  openFiles.set(fd, { entry });
  return fd;
}

export function getVirtualFd(fd: number): { entry: VirtualFileHandle } | undefined {
  return openFiles.get(fd);
}

export function closeVirtualFd(fd: number): boolean {
  return openFiles.delete(fd);
}
