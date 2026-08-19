// Flags: --instantiation --flags-as-bigint

import { strictEqual, throws } from 'node:assert';

import * as helpers from './helpers.js';
// @ts-expect-error generated as part of the runtime test
import { instantiate } from '../js-test-components/flags-bigint/flags-bigint.js';

const wasm = await instantiate(helpers.loadWasm, {});
const { Permissions, roundtrip } = wasm.api;

strictEqual(Object.keys(Permissions).length, 32);
strictEqual(Permissions.Read, 1n);
strictEqual(Permissions.Flag31, 1n << 31n);
strictEqual(Object.isFrozen(Permissions), true);

const value = Permissions.Read | Permissions.Admin | Permissions.Flag31;
strictEqual(roundtrip(value), value);
throws(() => roundtrip({ read: true } as never), /flags must be a bigint/);
throws(() => roundtrip(-1n), /flags have extraneous bits set/);
throws(() => roundtrip(1n << 32n), /flags have extraneous bits set/);
