import { invalidArgType } from "./errors.js";

/**
 * Node's `module.SourceMap`.
 *
 * The one part of `node:module` that is pure arithmetic rather than loading, so it is implemented
 * in full rather than refused: decoding the mappings and answering position queries needs no
 * filesystem, no loader, and no host.
 */

/** A decoded mapping, in the flattened order Node searches. */
interface Mapping {
  generatedLine: number;
  generatedColumn: number;
  originalSource?: number;
  originalLine?: number;
  originalColumn?: number;
  name?: number;
}

/** What `findEntry` reports. Absent fields are omitted, as Node omits them. */
export interface SourceMapEntry {
  generatedLine?: number;
  generatedColumn?: number;
  originalSource?: string;
  originalLine?: number;
  originalColumn?: number;
  name?: string;
}

/** What `findOrigin` reports, one-based on both axes. */
export interface SourceMapOrigin {
  name?: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
}

/** The source map payload, as the spec defines it. */
export interface SourceMapPayload {
  version?: number;
  file?: string;
  sourceRoot?: string;
  sources?: string[];
  sourcesContent?: (string | null)[];
  names?: string[];
  mappings?: string;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Reverse lookup for base64 VLQ digits, built once. */
const DIGITS = new Map<string, number>(
  Array.from(BASE64, (character, index) => [character, index]),
);

/**
 * Decode one base64 VLQ value, advancing the cursor.
 *
 * Continuation bit is 0x20; the low bit of the assembled value is the sign.
 */
function decodeValue(segment: string, cursor: { at: number }): number {
  let result = 0;
  let shift = 0;
  let digit: number;
  do {
    const character = segment[cursor.at++];
    const value = DIGITS.get(character);
    if (value === undefined) {
      throw invalidArgType("payload.mappings", "a valid base64 VLQ string", segment);
    }
    digit = value;
    result += (digit & 0x1f) << shift;
    shift += 5;
  } while (digit & 0x20);
  // The sign lives in the low bit rather than in two's complement.
  return result & 1 ? -(result >> 1) : result >> 1;
}

/**
 * Decode a `mappings` string into the flat, generated-order list Node searches.
 *
 * Fields are deltas: generated column resets per line, the rest carry across lines.
 */
function decodeMappings(mappings: string): Mapping[] {
  const decoded: Mapping[] = [];
  let generatedLine = 0;
  let generatedColumn = 0;
  let source = 0;
  let originalLine = 0;
  let originalColumn = 0;
  let name = 0;

  for (const line of mappings.split(";")) {
    generatedColumn = 0;
    if (line.length === 0) {
      generatedLine += 1;
      continue;
    }
    for (const segment of line.split(",")) {
      if (segment.length === 0) {
        continue;
      }
      const cursor = { at: 0 };
      generatedColumn += decodeValue(segment, cursor);
      const mapping: Mapping = { generatedLine, generatedColumn };
      if (cursor.at < segment.length) {
        source += decodeValue(segment, cursor);
        originalLine += decodeValue(segment, cursor);
        originalColumn += decodeValue(segment, cursor);
        mapping.originalSource = source;
        mapping.originalLine = originalLine;
        mapping.originalColumn = originalColumn;
        if (cursor.at < segment.length) {
          name += decodeValue(segment, cursor);
          mapping.name = name;
        }
      }
      decoded.push(mapping);
    }
    generatedLine += 1;
  }
  return decoded;
}

/** Order two generated positions. */
function before(line: number, column: number, mapping: Mapping): boolean {
  return (
    mapping.generatedLine < line ||
    (mapping.generatedLine === line && mapping.generatedColumn <= column)
  );
}

export class SourceMap {
  readonly #payload: SourceMapPayload;
  readonly #mappings: Mapping[];
  readonly #lineLengths: number[] | undefined;

  constructor(payload: SourceMapPayload, options?: { lineLengths?: number[] }) {
    if (typeof payload !== "object" || payload === null) {
      throw invalidArgType("payload", "an object", payload);
    }
    // Node hands back a copy, not the object it was given.
    this.#payload = { ...payload };
    this.#mappings = decodeMappings(payload.mappings ?? "");
    this.#lineLengths = options?.lineLengths;
  }

  get payload(): SourceMapPayload {
    return this.#payload;
  }

  get lineLengths(): number[] | undefined {
    return this.#lineLengths;
  }

  /**
   * Node's `findEntry(lineOffset, columnOffset)`, both zero-based.
   *
   * Searches the whole flattened list rather than one line, so a position past the last mapping
   * answers with the last entry rather than nothing -- matching Node, which surprises people.
   */
  findEntry(lineOffset: number, columnOffset: number): SourceMapEntry {
    let low = 0;
    let high = this.#mappings.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (before(lineOffset, columnOffset, this.#mappings[middle])) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (found < 0) {
      return {};
    }
    const mapping = this.#mappings[found];
    const entry: SourceMapEntry = {
      generatedLine: mapping.generatedLine,
      generatedColumn: mapping.generatedColumn,
    };
    if (mapping.originalSource !== undefined) {
      entry.originalSource = this.#payload.sources?.[mapping.originalSource];
      entry.originalLine = mapping.originalLine;
      entry.originalColumn = mapping.originalColumn;
    }
    if (mapping.name !== undefined) {
      entry.name = this.#payload.names?.[mapping.name];
    }
    return entry;
  }

  /**
   * Node's `findOrigin(lineNumber, columnNumber)`, one-based on both axes in and out.
   *
   * Not simply the matched entry's origin: Node keeps the caller's offset *within* the mapped
   * region, so the result is the entry's original position shifted by how far the query sat past
   * the entry's generated position. A query beyond the last mapping therefore extrapolates, and can
   * report a negative column -- which is Node's behaviour, verified against it, not a rounding slip.
   *
   * @param lineNumber - one-based line in the generated source
   * @param columnNumber - one-based column in the generated source
   */
  findOrigin(lineNumber: number, columnNumber: number): SourceMapOrigin {
    const entry = this.findEntry(lineNumber - 1, columnNumber - 1);
    if (entry.originalSource === undefined) {
      return {};
    }
    return {
      // Key order follows Node's, so the objects compare equal however they are serialised.
      name: entry.name,
      fileName: entry.originalSource,
      lineNumber: lineNumber - (entry.generatedLine ?? 0) + (entry.originalLine ?? 0),
      columnNumber: columnNumber - (entry.generatedColumn ?? 0) + (entry.originalColumn ?? 0),
    };
  }
}
