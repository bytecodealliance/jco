import assert from "node:assert/strict";
import { EHOSTUNREACH, EMFILE, EMSGSIZE, ENETDOWN, ENETUNREACH, ENFILE } from "node:constants";

import { suite, test } from "vitest";

import { convertSocketError, convertSocketErrorCode } from "../src/io/worker-sockets.js";

suite("socket error-code mapping", () => {
    test.each([
        ["EMFILE", "new-socket-limit"],
        ["ENFILE", "new-socket-limit"],
        ["EHOSTUNREACH", "remote-unreachable"],
        ["EHOSTDOWN", "remote-unreachable"],
        ["ENETUNREACH", "remote-unreachable"],
        ["ENETDOWN", "remote-unreachable"],
        ["EMSGSIZE", "datagram-too-large"],
    ])("convertSocketError maps %s to %s", (code, expected) => {
        assert.equal(convertSocketError({ code }), expected);
    });

    test.each([
        [EMFILE, "new-socket-limit"],
        [ENFILE, "new-socket-limit"],
        [EHOSTUNREACH, "remote-unreachable"],
        [ENETUNREACH, "remote-unreachable"],
        [ENETDOWN, "remote-unreachable"],
        [EMSGSIZE, "datagram-too-large"],
    ])("convertSocketErrorCode maps %s to %s", (code, expected) => {
        assert.equal(convertSocketErrorCode(code), expected);
    });
});
