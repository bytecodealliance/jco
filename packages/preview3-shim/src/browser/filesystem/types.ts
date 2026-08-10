import { Todo } from "../../common/errors.js";
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

class Descriptor implements DescriptorT {
  readViaStream(offset: Filesize): [ReadableStream<number>, Promise<Result<void, ErrorCode>>] {
    throw new Todo();
  }

  writeViaStream(data: ReadableStream<number>, offset: Filesize): Promise<Result<void, ErrorCode>> {
    throw new Todo();
  }

  appendViaStream(data: ReadableStream<number>): Promise<Result<void, ErrorCode>> {
    throw new Todo();
  }

  advise(offset: Filesize, length: Filesize, advice: Advice): Promise<void> {
    throw new Todo();
  }

  syncData(): Promise<void> {
    throw new Todo();
  }

  getFlags(): Promise<DescriptorFlags> {
    throw new Todo();
  }

  getType(): Promise<DescriptorType> {
    throw new Todo();
  }

  setSize(size: Filesize): Promise<void> {
    throw new Todo();
  }

  setTimes(
    dataAccessTimestamp: NewTimestamp,
    dataModificationTimestamp: NewTimestamp,
  ): Promise<void> {
    throw new Todo();
  }

  readDirectory(): [ReadableStream<DirectoryEntry>, Promise<Result<void, ErrorCode>>] {
    throw new Todo();
  }

  sync(): Promise<void> {
    throw new Todo();
  }

  createDirectoryAt(path: string): Promise<void> {
    throw new Todo();
  }

  stat(): Promise<DescriptorStat> {
    throw new Todo();
  }

  statAt(pathFlags: PathFlags, path: string): Promise<DescriptorStat> {
    throw new Todo();
  }

  setTimesAt(
    pathFlags: PathFlags,
    path: string,
    dataAccessTimestamp: NewTimestamp,
    dataModificationTimestamp: NewTimestamp,
  ): Promise<void> {
    throw new Todo();
  }

  linkAt(
    oldPathFlags: PathFlags,
    oldPath: string,
    newDescriptor: Descriptor,
    newPath: string,
  ): Promise<void> {
    throw new Todo();
  }

  openAt(
    pathFlags: PathFlags,
    path: string,
    openFlags: OpenFlags,
    flags: DescriptorFlags,
  ): Promise<Descriptor> {
    throw new Todo();
  }

  readlinkAt(path: string): Promise<string> {
    throw new Todo();
  }

  removeDirectoryAt(path: string): Promise<void> {
    throw new Todo();
  }

  renameAt(oldPath: string, newDescriptor: Descriptor, newPath: string): Promise<void> {
    throw new Todo();
  }

  symlinkAt(oldPath: string, newPath: string): Promise<void> {
    throw new Todo();
  }

  unlinkFileAt(path: string): Promise<void> {
    throw new Todo();
  }

  isSameObject(other: Descriptor): Promise<boolean> {
    throw new Todo();
  }

  metadataHash(): Promise<MetadataHashValue> {
    throw new Todo();
  }

  metadataHashAt(pathFlags: PathFlags, path: string): Promise<MetadataHashValue> {
    throw new Todo();
  }
}

export default {
  Descriptor,
} satisfies typeof import("../../../types/interfaces/wasi-filesystem-types.d.ts");
export type * from "../../../types/interfaces/wasi-filesystem-types.d.ts";
