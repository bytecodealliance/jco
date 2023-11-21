/**
 * @typedef {import("../../../types/interfaces/wasi-sockets-network").IpAddress} IpAddress
 */

import { isIP } from "net";
import { SOCKET_RESOLVE_NEXT_ADDRESS } from "../../io/calls.js";
import { ioCall, pollableCreate } from "../../io/worker-io.js";
import { deserializeIpAddress } from "./socket-common.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

export class ResolveAddressStreamImpl {
  _pollId = 0;
  _addressIterator = null;
  constructor() {}

  /**
   *
   * @returns {IpAddress}
   * @throws {name-unresolvable} Name does not exist or has no suitable associated IP addresses. (EAI_NONAME, EAI_NODATA, EAI_ADDRFAMILY)
   * @throws {temporary-resolver-failure} A temporary failure in name resolution occurred. (EAI_AGAIN)
   * @throws {permanent-resolver-failure} A permanent failure in name resolution occurred. (EAI_FAIL)
   * @throws {would-block} A result is not available yet. (EWOULDBLOCK, EAGAIN)
   */
  resolveNextAddress() {
    const pollId = this._pollId;
    if (!pollId) return null;

    // FIXME: addresses is undefined
    let addresses = ioCall(SOCKET_RESOLVE_NEXT_ADDRESS, pollId, null);
    if (!addresses) return null;

    addresses = addresses.map((address) => {
      const family = `ipv${isIP(address)}`;
      return {
        tag: family,
        val: deserializeIpAddress(address, family),
      };
    });

    const ip = addresses[this._addressIterator++];

    return ip;
  }

  subscribe() {
    if (this._pollId) return pollableCreate(this._pollId);
    // 0 poll is immediately resolving
    return pollableCreate(0);
  }

  [symbolDispose]() {
    // if (this._pollId) ioCall(FUTURE_DISPOSE, this._pollId);
  }
}
