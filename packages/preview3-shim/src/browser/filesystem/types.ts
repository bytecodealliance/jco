import type {
  Descriptor as DescriptorT,
  Advice,
  DescriptorFlags,
  DescriptorStat,
  DescriptorType,
  DirectoryEntry,
  ErrorCode,
  Filesize,
  MetadataHashValue,
  NewTimestamp,
  OpenFlags,
  PathFlags,
  Result,
} from "../../../types/interfaces/wasi-filesystem-types.d.ts";
import { readableFromPreview2Input, writeToPreview2Output } from "../streams.js";

const symbolDispose = Symbol.dispose ?? Symbol.for("dispose");

type Preview2Descriptor = {
  readViaStream(offset: Filesize): Parameters<typeof readableFromPreview2Input>[0];
  writeViaStream(offset: Filesize): Parameters<typeof writeToPreview2Output>[1];
  appendViaStream(): Parameters<typeof writeToPreview2Output>[1];
  advise(offset: Filesize, length: Filesize, advice: Advice): void;
  syncData(): void;
  getFlags(): DescriptorFlags;
  getType(): string;
  setSize(size: Filesize): void;
  setTimes(dataAccessTimestamp: NewTimestamp, dataModificationTimestamp: NewTimestamp): void;
  readDirectory(): { readDirectoryEntry(): { type: string; name: string } | undefined };
  sync(): void;
  createDirectoryAt(path: string): void;
  stat(): Omit<DescriptorStat, "type"> & { type: string };
  statAt(pathFlags: PathFlags, path: string): Omit<DescriptorStat, "type"> & { type: string };
  setTimesAt(
    pathFlags: PathFlags,
    path: string,
    dataAccessTimestamp: NewTimestamp,
    dataModificationTimestamp: NewTimestamp,
  ): void;
  linkAt(
    oldPathFlags: PathFlags,
    oldPath: string,
    newDescriptor: Preview2Descriptor,
    newPath: string,
  ): void;
  openAt(
    pathFlags: PathFlags,
    path: string,
    openFlags: OpenFlags,
    flags: DescriptorFlags,
  ): Preview2Descriptor;
  readlinkAt(path: string): string;
  removeDirectoryAt(path: string): void;
  renameAt(oldPath: string, newDescriptor: Preview2Descriptor, newPath: string): void;
  symlinkAt(oldPath: string, newPath: string): void;
  unlinkFileAt(path: string): void;
  isSameObject(other: Preview2Descriptor): boolean;
  metadataHash(): MetadataHashValue;
  metadataHashAt(pathFlags: PathFlags, path: string): MetadataHashValue;
  [symbolDispose]?: () => void;
};

const TYPE_TAGS = new Set([
  "block-device",
  "character-device",
  "directory",
  "fifo",
  "symbolic-link",
  "regular-file",
  "socket",
]);

function descriptorType(type: string): DescriptorType {
  if (TYPE_TAGS.has(type)) {
    return { tag: type } as DescriptorType;
  }
  return { tag: "other", val: type === "unknown" ? undefined : type };
}

export function filesystemErrorCode(error: unknown): ErrorCode {
  let tag = typeof error === "string" ? error : (error as { tag?: string })?.tag;
  if (!tag && error instanceof Error) {
    tag = error.message;
  }
  if (tag === "would-block") {
    return { tag: "other", val: tag };
  }
  if (tag) {
    return { tag } as ErrorCode;
  }
  return { tag: "other", val: String(error) };
}

class FilesystemError extends Error {
  readonly payload: ErrorCode;

  constructor(error: unknown) {
    const payload = filesystemErrorCode(error);
    super(payload.tag);
    this.name = "FilesystemError";
    this.payload = payload;
  }
}

function filesystemCall<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw error instanceof FilesystemError ? error : new FilesystemError(error);
  }
}

function stat(value: Omit<DescriptorStat, "type"> & { type: string }): DescriptorStat {
  return { ...value, type: descriptorType(value.type) };
}

export class Descriptor implements DescriptorT {
  #descriptor!: Preview2Descriptor;

  static _wrap(descriptor: Preview2Descriptor): Descriptor {
    const wrapped = new Descriptor();
    wrapped.#descriptor = descriptor;
    return wrapped;
  }

  readViaStream(offset: Filesize): [ReadableStream<number>, Promise<Result<void, ErrorCode>>] {
    return readableFromPreview2Input(this.#descriptor.readViaStream(offset), filesystemErrorCode);
  }

  async writeViaStream(
    data: ReadableStream<number>,
    offset: Filesize,
  ): Promise<Result<void, ErrorCode>> {
    try {
      await writeToPreview2Output(data, this.#descriptor.writeViaStream(offset));
      return { tag: "ok", val: undefined };
    } catch (error) {
      return { tag: "err", val: filesystemErrorCode(error) };
    }
  }

  async appendViaStream(data: ReadableStream<number>): Promise<Result<void, ErrorCode>> {
    try {
      await writeToPreview2Output(data, this.#descriptor.appendViaStream());
      return { tag: "ok", val: undefined };
    } catch (error) {
      return { tag: "err", val: filesystemErrorCode(error) };
    }
  }

  async advise(offset: Filesize, length: Filesize, advice: Advice): Promise<void> {
    filesystemCall(() => this.#descriptor.advise(offset, length, advice));
  }

  async syncData(): Promise<void> {
    filesystemCall(() => this.#descriptor.syncData());
  }

  async getFlags(): Promise<DescriptorFlags> {
    return filesystemCall(() => this.#descriptor.getFlags());
  }

  async getType(): Promise<DescriptorType> {
    return descriptorType(filesystemCall(() => this.#descriptor.getType()));
  }

  async setSize(size: Filesize): Promise<void> {
    filesystemCall(() => this.#descriptor.setSize(size));
  }

  async setTimes(
    dataAccessTimestamp: NewTimestamp,
    dataModificationTimestamp: NewTimestamp,
  ): Promise<void> {
    filesystemCall(() => this.#descriptor.setTimes(dataAccessTimestamp, dataModificationTimestamp));
  }

  readDirectory(): [ReadableStream<DirectoryEntry>, Promise<Result<void, ErrorCode>>] {
    const directory = this.#descriptor.readDirectory();
    const stream = new ReadableStream<DirectoryEntry>({
      pull(controller) {
        try {
          const entry = directory.readDirectoryEntry();
          if (!entry) {
            controller.close();
            return;
          }
          controller.enqueue({ ...entry, type: descriptorType(entry.type) });
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return [stream, Promise.resolve({ tag: "ok", val: undefined })];
  }

  async sync(): Promise<void> {
    filesystemCall(() => this.#descriptor.sync());
  }

  async createDirectoryAt(path: string): Promise<void> {
    filesystemCall(() => this.#descriptor.createDirectoryAt(path));
  }

  async stat(): Promise<DescriptorStat> {
    return stat(filesystemCall(() => this.#descriptor.stat()));
  }

  async statAt(pathFlags: PathFlags, path: string): Promise<DescriptorStat> {
    return stat(filesystemCall(() => this.#descriptor.statAt(pathFlags, path)));
  }

  async setTimesAt(
    pathFlags: PathFlags,
    path: string,
    dataAccessTimestamp: NewTimestamp,
    dataModificationTimestamp: NewTimestamp,
  ): Promise<void> {
    filesystemCall(() =>
      this.#descriptor.setTimesAt(pathFlags, path, dataAccessTimestamp, dataModificationTimestamp),
    );
  }

  async linkAt(
    oldPathFlags: PathFlags,
    oldPath: string,
    newDescriptor: Descriptor,
    newPath: string,
  ): Promise<void> {
    filesystemCall(() =>
      this.#descriptor.linkAt(oldPathFlags, oldPath, newDescriptor.#descriptor, newPath),
    );
  }

  async openAt(
    pathFlags: PathFlags,
    path: string,
    openFlags: OpenFlags,
    flags: DescriptorFlags,
  ): Promise<Descriptor> {
    return Descriptor._wrap(
      filesystemCall(() => this.#descriptor.openAt(pathFlags, path, openFlags, flags)),
    );
  }

  async readlinkAt(path: string): Promise<string> {
    return filesystemCall(() => this.#descriptor.readlinkAt(path));
  }

  async removeDirectoryAt(path: string): Promise<void> {
    filesystemCall(() => this.#descriptor.removeDirectoryAt(path));
  }

  async renameAt(oldPath: string, newDescriptor: Descriptor, newPath: string): Promise<void> {
    filesystemCall(() => this.#descriptor.renameAt(oldPath, newDescriptor.#descriptor, newPath));
  }

  async symlinkAt(oldPath: string, newPath: string): Promise<void> {
    filesystemCall(() => this.#descriptor.symlinkAt(oldPath, newPath));
  }

  async unlinkFileAt(path: string): Promise<void> {
    filesystemCall(() => this.#descriptor.unlinkFileAt(path));
  }

  async isSameObject(other: Descriptor): Promise<boolean> {
    return filesystemCall(() => this.#descriptor.isSameObject(other.#descriptor));
  }

  async metadataHash(): Promise<MetadataHashValue> {
    return filesystemCall(() => this.#descriptor.metadataHash());
  }

  async metadataHashAt(pathFlags: PathFlags, path: string): Promise<MetadataHashValue> {
    return filesystemCall(() => this.#descriptor.metadataHashAt(pathFlags, path));
  }

  [symbolDispose](): void {
    this.#descriptor[symbolDispose]?.();
  }
}

export function wrapDescriptor(descriptor: unknown): Descriptor {
  return Descriptor._wrap(descriptor as Preview2Descriptor);
}

export default {
  Descriptor,
} satisfies typeof import("../../../types/interfaces/wasi-filesystem-types.d.ts");
export type * from "../../../types/interfaces/wasi-filesystem-types.d.ts";
