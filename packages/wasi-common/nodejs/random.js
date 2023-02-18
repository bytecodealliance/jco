import { randomBytes } from "node:crypto";

export function getRandomBytes(len) {
  return randomBytes(len);
}
