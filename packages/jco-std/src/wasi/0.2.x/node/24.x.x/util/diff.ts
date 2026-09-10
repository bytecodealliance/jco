// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// Adapted from nodejs/node v24.20.0, commit
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/internal/util/diff.js and lib/internal/assert/myers_diff.js.
// Local changes: explicit TypeScript contracts, shared Jco errors, ECMAScript intrinsics.
import { outOfRange, invalidArgType } from "../errors/core.js";

export type Difference = [operation: -1 | 0 | 1, value: string];

const kOperations = {
  DELETE: -1,
  NOP: 0,
  INSERT: 1,
} as const;

function areLinesEqual(actual: string, expected: string, checkCommaDisparity: boolean): boolean {
  if (actual === expected) {
    return true;
  }
  if (checkCommaDisparity) {
    return actual + "," === expected || actual === expected + ",";
  }
  return false;
}

function myersDiff(
  actual: string | string[],
  expected: string | string[],
  checkCommaDisparity = false,
): Difference[] {
  const actualLength = actual.length;
  const expectedLength = expected.length;
  const max = actualLength + expectedLength;
  if (max > 2 ** 31 - 1) {
    throw outOfRange("myersDiff input size", "< 2^31", max);
  }
  const v = new Int32Array(2 * max + 1);
  const trace: Int32Array[] = [];
  for (let diffLevel = 0; diffLevel <= max; diffLevel++) {
    trace.push(new Int32Array(v)); // Clone the current state of `v`
    for (let diagonalIndex = -diffLevel; diagonalIndex <= diffLevel; diagonalIndex += 2) {
      const offset = diagonalIndex + max;
      const previousOffset = v[offset - 1];
      const nextOffset = v[offset + 1];
      let x =
        diagonalIndex === -diffLevel || (diagonalIndex !== diffLevel && previousOffset < nextOffset)
          ? nextOffset
          : previousOffset + 1;
      let y = x - diagonalIndex;
      while (
        x < actualLength &&
        y < expectedLength &&
        areLinesEqual(actual[x], expected[y], checkCommaDisparity)
      ) {
        x++;
        y++;
      }
      v[offset] = x;
      if (x >= actualLength && y >= expectedLength) {
        return backtrack(trace, actual, expected, checkCommaDisparity);
      }
    }
  }
  throw new Error("Unreachable Myers diff state");
}

function backtrack(
  trace: Int32Array[],
  actual: string | string[],
  expected: string | string[],
  checkCommaDisparity: boolean,
): Difference[] {
  const actualLength = actual.length;
  const expectedLength = expected.length;
  const max = actualLength + expectedLength;
  let x = actualLength;
  let y = expectedLength;
  const result: Difference[] = [];
  for (let diffLevel = trace.length - 1; diffLevel >= 0; diffLevel--) {
    const v = trace[diffLevel];
    const diagonalIndex = x - y;
    const offset = diagonalIndex + max;
    let prevDiagonalIndex: number;
    if (
      diagonalIndex === -diffLevel ||
      (diagonalIndex !== diffLevel && v[offset - 1] < v[offset + 1])
    ) {
      prevDiagonalIndex = diagonalIndex + 1;
    } else {
      prevDiagonalIndex = diagonalIndex - 1;
    }
    const prevX = v[prevDiagonalIndex + max];
    const prevY = prevX - prevDiagonalIndex;
    while (x > prevX && y > prevY) {
      const actualItem = actual[x - 1];
      const value = checkCommaDisparity && !actualItem.endsWith(",") ? expected[y - 1] : actualItem;
      result.push([kOperations.NOP, value]);
      x--;
      y--;
    }
    if (diffLevel > 0) {
      if (x > prevX) {
        result.push([kOperations.INSERT, actual[--x]]);
      } else {
        result.push([kOperations.DELETE, expected[--y]]);
      }
    }
  }
  return result;
}

function validateInput(value: unknown, name: string): asserts value is string | string[] {
  if (typeof value === "string") {
    return;
  }
  if (!Array.isArray(value)) {
    throw invalidArgType(name, "string", value);
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string") {
      throw invalidArgType(`${name}[${i}]`, "string", value[i]);
    }
  }
}

export function diff(actual: string | string[], expected: string | string[]): Difference[] {
  if (actual === expected) {
    return [];
  }
  validateInput(actual, "actual");
  validateInput(expected, "expected");
  if (actual.length + expected.length === 0) {
    return [];
  }
  return myersDiff(actual, expected).reverse();
}
