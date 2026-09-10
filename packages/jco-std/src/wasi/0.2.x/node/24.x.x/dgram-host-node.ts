/**
 * Opt-in Node UDP provider. Maps the typed WIT socket to node:dgram v24.20.0
 * (nodejs/node 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/dgram.js, MIT).
 * Each provider has its own callback queue; no component's listener can be redeemed
 * by another instance. Node objects and resolver callbacks stay on the host.
 */
import * as dgram from "node:dgram";
import { lookup } from "node:dns";
import {
  CallbackResource,
  createCallbackQueue,
  retireCallbacks,
} from "./internal/callback-resource.js";
import { capture } from "./internal/host-error.js";
import { serializeError } from "./dgram/errors.js";
import type {
  AddressInfo,
  DgramCallbacks,
  DgramHost,
  HostOptions,
  HostSocket,
  Membership,
  Result,
  SocketEvent,
  SocketListener,
  SocketOption,
  SocketQuery,
} from "./dgram/types.js";

// These APIs landed in Node 24.20.0 after the installed @types/node 24 declarations.
interface NativeSocket extends dgram.Socket {
  bindSync(options: { address: string; port: number }): AddressInfo;
  connectSync(port: number, address: string): void;
}
export function createDgramHost(getCallbacks: () => DgramCallbacks): DgramHost {
  const enqueue = createCallbackQueue();
  class Socket implements HostSocket {
    #socket: NativeSocket;
    #closed = false;
    #listener: CallbackResource<SocketListener>;
    constructor(
      readonly options: HostOptions,
      listener: number,
    ) {
      this.#socket = dgram.createSocket(options) as NativeSocket;
      if (
        typeof this.#socket.bindSync !== "function" ||
        typeof this.#socket.connectSync !== "function"
      ) {
        this.#socket.close();
        throw Object.assign(
          new Error(
            "The node:dgram host provider requires Node with bindSync/connectSync (Node 24.20.0 or newer on the 24.x line)",
          ),
          { code: "ERR_JCO_DGRAM_HOST_VERSION" },
        );
      }
      this.#listener = new CallbackResource(
        () => getCallbacks().takeSocketListener(listener),
        "ERR_JCO_DGRAM_CALLBACK_REQUIRED",
      );
      this.#socket.on("message", (data, remote) =>
        this.#deliver({ tag: "message", val: { data: new Uint8Array(data), remote } }),
      );
      this.#socket.on("error", (error) =>
        this.#deliver({ tag: "error", val: serializeError(error) }),
      );
    }
    #deliver(event: SocketEvent): void {
      void enqueue(async () => {
        if (!this.#closed || event.tag === "sent") {
          await (await this.#listener.get()).event(event);
        }
      }).catch((error: unknown) => {
        // A trapped component cannot safely receive more events. Release the OS
        // socket and surface the trap to the embedding application's event loop.
        this.close();
        queueMicrotask(() => {
          throw error;
        });
      });
    }
    bind(address: string, port: number): Result<AddressInfo> {
      return capture(() => this.#socket.bindSync({ address, port }), serializeError);
    }
    connect(address: string, port: number): Result<void> {
      return capture(() => this.#socket.connectSync(port, address), serializeError);
    }
    disconnect(): Result<void> {
      return capture(() => this.#socket.disconnect(), serializeError);
    }
    resolve(address: string, id: number): void {
      lookup(address, this.options.type === "udp4" ? 4 : 6, (error, ip) => {
        this.#deliver({
          tag: "resolved",
          val: {
            id,
            result: error ? { tag: "err", val: serializeError(error) } : { tag: "ok", val: ip },
          },
        });
      });
    }
    send(
      data: Uint8Array,
      port: number | undefined,
      address: string | undefined,
      callback: number | undefined,
    ): Result<void> {
      return capture(() => {
        const sent = (error: Error | null, bytes: number): void => {
          if (callback !== undefined) {
            this.#deliver({
              tag: "sent",
              val: {
                id: callback,
                result: error
                  ? { tag: "err", val: serializeError(error) }
                  : { tag: "ok", val: bytes },
              },
            });
          }
        };
        if (port === undefined) {
          this.#socket.send(data, sent);
        } else {
          this.#socket.send(data, port, address, sent);
        }
      }, serializeError);
    }
    address(remote: boolean): Result<AddressInfo> {
      return capture(
        () => (remote ? this.#socket.remoteAddress() : this.#socket.address()),
        serializeError,
      );
    }
    setOption(option: SocketOption): Result<void> {
      return capture(() => {
        switch (option.tag) {
          case "broadcast":
            this.#socket.setBroadcast(option.val);
            break;
          case "multicast-loopback":
            this.#socket.setMulticastLoopback(option.val);
            break;
          case "ttl":
            this.#socket.setTTL(option.val);
            break;
          case "multicast-ttl":
            this.#socket.setMulticastTTL(option.val);
            break;
          case "recv-buffer":
            this.#socket.setRecvBufferSize(option.val);
            break;
          case "send-buffer":
            this.#socket.setSendBufferSize(option.val);
            break;
          case "multicast-interface":
            this.#socket.setMulticastInterface(option.val);
            break;
        }
      }, serializeError);
    }
    query(query: SocketQuery): Result<number> {
      return capture(() => {
        switch (query) {
          case "recv-buffer":
            return this.#socket.getRecvBufferSize();
          case "send-buffer":
            return this.#socket.getSendBufferSize();
          case "send-queue-size":
            return this.#socket.getSendQueueSize();
          case "send-queue-count":
            return this.#socket.getSendQueueCount();
        }
      }, serializeError);
    }
    membership(
      action: Membership,
      group: string,
      source: string | undefined,
      iface: string | undefined,
    ): Result<void> {
      return capture(() => {
        switch (action) {
          case "add":
            this.#socket.addMembership(group, iface);
            break;
          case "drop":
            this.#socket.dropMembership(group, iface);
            break;
          case "add-source":
            this.#socket.addSourceSpecificMembership(source!, group, iface);
            break;
          case "drop-source":
            this.#socket.dropSourceSpecificMembership(source!, group, iface);
            break;
        }
      }, serializeError);
    }
    close(): void {
      if (this.#closed) {
        return;
      }
      this.#closed = true;
      this.#socket.close(() => {
        // Node completes outstanding sends before close. Retire only after their
        // queued guest callbacks (including an in-flight redemption) have run.
        void enqueue(() => retireCallbacks(enqueue, this.#listener));
      });
    }
    setRef(ref: boolean): void {
      if (ref) {
        this.#socket.ref();
      } else {
        this.#socket.unref();
      }
    }
    [Symbol.dispose](): void {
      this.close();
    }
  }
  return {
    Socket,
    createSocket: (options, listener) =>
      capture(() => new Socket(options, listener), serializeError),
  };
}

const callbackRequired = "UDP sockets require createDgramHost(() => instance.dgramCallbacks)";
/** Static mappings retain the WIT module shape but require instance-bound callbacks. */
export const createSocket: DgramHost["createSocket"] = () => ({
  tag: "err",
  val: { name: "Error", code: "ERR_JCO_DGRAM_CALLBACK_REQUIRED", message: callbackRequired },
});
export const Socket: DgramHost["Socket"] = class Socket {
  constructor() {
    throw new Error(callbackRequired);
  }
} as unknown as DgramHost["Socket"];
export default { Socket, createSocket, createDgramHost };
