/**
 * Opt-in Node host adapter for the Node-compatible OS capability.
 *
 * Values are obtained from Node.js rather than captured when this package is
 * built, so the guest observes the machine that instantiates the component.
 */
import nodeOs from "node:os";

import {
  captureOsCall,
  serializeNetworkInterfaces,
  serializeOsCpus,
  serializeOsStaticProperties,
  serializeUserInfo,
} from "./os/host-utils.js";
import type { OsHost } from "./os/types.js";

export const getStaticProperties: OsHost["getStaticProperties"] = () =>
  captureOsCall(() => serializeOsStaticProperties(nodeOs.EOL, nodeOs.devNull, nodeOs.constants));

export const arch: OsHost["arch"] = () => captureOsCall(() => nodeOs.arch());

export const availableParallelism: OsHost["availableParallelism"] = () =>
  captureOsCall(() => nodeOs.availableParallelism());

export const cpus: OsHost["cpus"] = () => captureOsCall(() => serializeOsCpus(nodeOs.cpus()));

export const endianness: OsHost["endianness"] = () =>
  captureOsCall(() => (nodeOs.endianness() === "BE" ? "be" : "le"));

export const freemem: OsHost["freemem"] = () => captureOsCall(() => BigInt(nodeOs.freemem()));

export const getPriority: OsHost["getPriority"] = (pid) =>
  captureOsCall(() => nodeOs.getPriority(pid));

export const homedir: OsHost["homedir"] = () => captureOsCall(() => nodeOs.homedir());

export const hostname: OsHost["hostname"] = () => captureOsCall(() => nodeOs.hostname());

export const loadavg: OsHost["loadavg"] = () =>
  captureOsCall(() => {
    const [one, five, fifteen] = nodeOs.loadavg();
    return { one, five, fifteen };
  });

export const machine: OsHost["machine"] = () => captureOsCall(() => nodeOs.machine());

export const networkInterfaces: OsHost["networkInterfaces"] = () =>
  captureOsCall(() => serializeNetworkInterfaces(nodeOs.networkInterfaces()));

export const platform: OsHost["platform"] = () => captureOsCall(() => nodeOs.platform());

export const release: OsHost["release"] = () => captureOsCall(() => nodeOs.release());

export const setPriority: OsHost["setPriority"] = (pid, priority) =>
  captureOsCall(() => nodeOs.setPriority(pid, priority));

export const tmpdir: OsHost["tmpdir"] = () => captureOsCall(() => nodeOs.tmpdir());

export const totalmem: OsHost["totalmem"] = () => captureOsCall(() => BigInt(nodeOs.totalmem()));

export const type: OsHost["type"] = () => captureOsCall(() => nodeOs.type());

export const uptime: OsHost["uptime"] = () => captureOsCall(() => nodeOs.uptime());

export const userInfo: OsHost["userInfo"] = (encoding) =>
  captureOsCall(() => {
    // Node intentionally accepts unknown encoding strings and falls back to
    // UTF-8; the guest facade preserves that runtime behavior.
    const value = encoding
      ? nodeOs.userInfo({ encoding: encoding as BufferEncoding | "buffer" })
      : nodeOs.userInfo();
    return serializeUserInfo(value);
  });

export const version: OsHost["version"] = () => captureOsCall(() => nodeOs.version());

const host: OsHost = {
  getStaticProperties,
  arch,
  availableParallelism,
  cpus,
  endianness,
  freemem,
  getPriority,
  homedir,
  hostname,
  loadavg,
  machine,
  networkInterfaces,
  platform,
  release,
  setPriority,
  tmpdir,
  totalmem,
  type,
  uptime,
  userInfo,
  version,
};

export default host;
