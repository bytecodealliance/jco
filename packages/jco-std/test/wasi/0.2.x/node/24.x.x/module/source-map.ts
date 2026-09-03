import { SourceMap as NodeSourceMap } from "node:module";

import { describe, expect, test } from "vitest";

import { SourceMap } from "../../../../../../src/wasi/0.2.x/node/24.x.x/module/source-map.js";

/**
 * A small map with two sources, two names, and a line whose second segment jumps source.
 *
 * Hand-built so the interesting cases are reachable: a segment with no original position, one with
 * a name, and a query past the last mapping.
 */
const PAYLOAD = {
  version: 3,
  file: "out.js",
  sources: ["a.ts", "b.ts"],
  names: ["alpha", "beta"],
  mappings: "AAAA,SAASA;AACT,ICAAC",
};

describe("SourceMap matches Node", () => {
  const mine = new SourceMap(PAYLOAD);
  const theirs = new NodeSourceMap(PAYLOAD);

  test.concurrent("payload is a copy, not the object passed in", () => {
    expect(mine.payload).toEqual(PAYLOAD);
    expect(mine.payload).not.toBe(PAYLOAD);
    expect(theirs.payload).not.toBe(PAYLOAD);
  });

  test.concurrent("lineLengths is undefined unless supplied, and echoed when it is", () => {
    expect(mine.lineLengths).toBe(theirs.lineLengths);
    expect(new SourceMap(PAYLOAD, { lineLengths: [10, 20] }).lineLengths).toEqual(
      new NodeSourceMap(PAYLOAD, { lineLengths: [10, 20] }).lineLengths,
    );
  });

  test.concurrent("findEntry and findOrigin agree across a grid of positions", () => {
    // Includes positions before the first mapping and past the last, where the two easy mistakes
    // live: returning {} instead of the last entry, and snapping findOrigin to the entry's origin
    // instead of preserving the caller's offset within it.
    const mismatches: string[] = [];
    for (let line = -1; line <= 6; line += 1) {
      for (let column = -1; column <= 14; column += 1) {
        const entry = [mine.findEntry(line, column), theirs.findEntry(line, column)];
        if (JSON.stringify(entry[0]) !== JSON.stringify(entry[1])) {
          mismatches.push(`findEntry(${line}, ${column})`);
        }
        const origin = [mine.findOrigin(line, column), theirs.findOrigin(line, column)];
        if (JSON.stringify(origin[0]) !== JSON.stringify(origin[1])) {
          mismatches.push(`findOrigin(${line}, ${column})`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  test.concurrent("findOrigin keeps the offset within the mapped region", () => {
    // Node does not snap to the entry's original position: it shifts by how far the query sat past
    // the entry, so a query beyond the last mapping extrapolates and can report a negative column.
    expect(mine.findOrigin(100, 1)).toEqual(theirs.findOrigin(100, 1));
    expect(mine.findOrigin(100, 1).columnNumber).toBeLessThan(0);
  });

  test.concurrent("a query before any mapping yields nothing", () => {
    expect(mine.findEntry(0, -1)).toEqual(theirs.findEntry(0, -1));
    expect(mine.findEntry(0, -1)).toEqual({});
  });

  test.each([
    ["a string", "nope"],
    ["a number", 42],
    ["null", null],
  ])("rejects %s payload as Node does", (_name, payload) => {
    const construct = () => new SourceMap(payload as unknown as typeof PAYLOAD);
    const theirConstruct = () => new NodeSourceMap(payload as unknown as typeof PAYLOAD);
    expect(construct).toThrowError(expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }));
    expect(theirConstruct).toThrowError(expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }));
  });

  test.concurrent("an empty mappings string decodes to no entries", () => {
    const empty = { version: 3, sources: [], names: [], mappings: "" };
    expect(new SourceMap(empty).findEntry(0, 0)).toEqual(new NodeSourceMap(empty).findEntry(0, 0));
  });
});
