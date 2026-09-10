import * as host from "jco:node/tls@0.1.0";
import { createTls } from "./tls/core.js";

const { api: tls, tlsCallbacks } = createTls(host);
export { tlsCallbacks };
export const {
  CLIENT_RENEG_LIMIT,
  CLIENT_RENEG_WINDOW,
  DEFAULT_CIPHERS,
  DEFAULT_ECDH_CURVE,
  DEFAULT_MIN_VERSION,
  DEFAULT_MAX_VERSION,
  SecureContext,
  TLSSocket,
  Server,
  connect,
  createSecureContext,
  createServer,
  getCiphers,
  getCertificateCompressionAlgorithms,
  getCACertificates,
  setDefaultCACertificates,
  convertALPNProtocols,
  checkServerIdentity,
  rootCertificates,
} = tls;
export type * from "./tls/types.js";
export default tls;
