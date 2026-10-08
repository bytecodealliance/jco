import { unsupportedNodeApi } from "./errors/core.js";
const deny = (): never => {
  throw unsupportedNodeApi("node:crypto host derivation", "map a key derivation provider");
};
export const pbkdf2 = deny;
export const hkdf = deny;
export const scrypt = deny;
