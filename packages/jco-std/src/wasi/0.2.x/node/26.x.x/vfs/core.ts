/**
 * Factory overload adapted from nodejs/node v26.8.2, commit
 * f2f2c2f246c36bd74f082cb43ecfe830657d81c9, lib/vfs.js (MIT).
 * The real provider is injected; memory never consults host capabilities.
 */
import { FsCore } from "../../24.x.x/fs/core.js";
import type { FsHost } from "../../24.x.x/fs/types.js";
import type { HostImports } from "../../24.x.x/internal/wit-types.js";
import { VirtualFileSystem } from "./file-system.js";
import { VirtualProvider } from "./provider.js";
import { MemoryProvider } from "./memory.js";
import { createRealFSProvider } from "./real.js";
import type { RealProviderConstructor } from "./real.js";
import type { VfsOptions } from "./types.js";

export interface VfsModule {
  create: typeof create;

  VirtualFileSystem: typeof VirtualFileSystem;

  VirtualProvider: typeof VirtualProvider;

  MemoryProvider: typeof MemoryProvider;

  RealFSProvider: RealProviderConstructor;
}

export function create(provider?: VirtualProvider | null, options?: VfsOptions): VirtualFileSystem;
export function create(options: VfsOptions): VirtualFileSystem;
export function create(
  provider?: VirtualProvider | VfsOptions | null,
  options?: VfsOptions,
): VirtualFileSystem {
  if (provider != null && !(provider instanceof VirtualProvider) && typeof provider === "object") {
    options = provider;
    provider = undefined;
  }
  return new VirtualFileSystem(provider, options);
}

export function createVfs(
  host: HostImports<FsHost> | ((rootPath: string) => HostImports<FsHost>),
): VfsModule {
  const RealFSProvider = createRealFSProvider(
    (rootPath) => new FsCore(typeof host === "function" ? host(rootPath) : host),
  );
  return { create, VirtualFileSystem, VirtualProvider, MemoryProvider, RealFSProvider };
}
