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
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/internal/readline/interface.js.
// Local changes: TypeScript types, ES intrinsics, portable errors and scheduling.
// See ./README.md for runtime boundaries and the upstream dependency audit.

import { defer } from "./compat.js";
import { EventEmitter as NodeEventEmitter, addAbortListener } from "node:events";
import { StringDecoder } from "../string-decoder.js";
import {
  AbortError,
  codedError,
  invalidArgType,
  invalidArgValue,
  unsupportedNodeApi,
} from "../errors.js";
import { validateString, validateAbortSignal, validateUint32, inspect } from "./compat.js";
import { charLengthAt, charLengthLeft, commonPrefix, kSubstringSearch } from "./utils.js";
import { clearScreenDown, cursorTo, moveCursor } from "./callbacks.js";
import { emitKeypressEvents } from "./keypress.js";
import { History } from "./history.js";
import { getStringWidth, stripVTControlCharacters } from "./display.js";
import { lineIterator } from "./iterator.js";
import type {
  Emitter,
  ReadableInput,
  WritableOutput,
  InterfaceOptions,
  Key,
  CompleterResult,
  PromiseCompleter,
  CursorPosition,
} from "./types.js";
// Keep the runtime EventEmitter identity without leaking @types/node into declarations.
const EventEmitter: new () => Emitter = NodeEventEmitter as unknown as new () => Emitter;
const kEmptyObject = Object.freeze({});
const kMaxUndoRedoStackSize = 2048;
const kMincrlfDelay = 100;
/**
 * The end of a line is signaled by either one of the following:
 *  - \r\n
 *  - \n
 *  - \r followed by something other than \n
 *  - \u2028 (Unicode 'LINE SEPARATOR')
 *  - \u2029 (Unicode 'PARAGRAPH SEPARATOR')
 */
const lineEnding = /\r?\n|\r(?!\n)|\u2028|\u2029/g;
export const kLineObjectStream = Symbol("line object stream");
export const kQuestionCancel = Symbol("kQuestionCancel");
export const kQuestion = Symbol("kQuestion");
// GNU readline library - keyseq-timeout is 500ms (default)
const ESCAPE_CODE_TIMEOUT = 500;
// Max length of the kill ring
const kMaxLengthOfKillRing = 32;
export const kMultilinePrompt = Symbol("| ");
export const kAddHistory = Symbol("_addHistory");
export const kBeforeEdit = Symbol("_beforeEdit");
export const kDecoder = Symbol("_decoder");
export const kDeleteLeft = Symbol("_deleteLeft");
export const kDeleteLineLeft = Symbol("_deleteLineLeft");
export const kDeleteLineRight = Symbol("_deleteLineRight");
export const kDeleteRight = Symbol("_deleteRight");
export const kDeleteWordLeft = Symbol("_deleteWordLeft");
export const kDeleteWordRight = Symbol("_deleteWordRight");
export const kGetDisplayPos = Symbol("_getDisplayPos");
export const kHistoryNext = Symbol("_historyNext");
export const kMoveDownOrHistoryNext = Symbol("_moveDownOrHistoryNext");
export const kHistoryPrev = Symbol("_historyPrev");
export const kMoveUpOrHistoryPrev = Symbol("_moveUpOrHistoryPrev");
export const kInsertString = Symbol("_insertString");
export const kLine = Symbol("_line");
export const kLine_buffer = Symbol("_line_buffer");
export const kKillRing = Symbol("_killRing");
export const kKillRingCursor = Symbol("_killRingCursor");
export const kMoveCursor = Symbol("_moveCursor");
export const kNormalWrite = Symbol("_normalWrite");
export const kOldPrompt = Symbol("_oldPrompt");
export const kOnLine = Symbol("_onLine");
export const kSetLine = Symbol("_setLine");
export const kPreviousKey = Symbol("_previousKey");
export const kPrompt = Symbol("_prompt");
export const kPushToKillRing = Symbol("_pushToKillRing");
export const kPushToUndoStack = Symbol("_pushToUndoStack");
export const kQuestionCallback = Symbol("_questionCallback");
export const kLastCommandErrored = Symbol("_lastCommandErrored");
export const kQuestionReject = Symbol("_questionReject");
export const kRedo = Symbol("_redo");
export const kRedoStack = Symbol("_redoStack");
export const kRefreshLine = Symbol("_refreshLine");
export const kSawKeyPress = Symbol("_sawKeyPress");
export const kSawReturnAt = Symbol("_sawReturnAt");
export const kSetRawMode = Symbol("_setRawMode");
export const kTabComplete = Symbol("_tabComplete");
export const kTabCompleter = Symbol("_tabCompleter");
export const kTtyWrite = Symbol("_ttyWrite");
export const kUndo = Symbol("_undo");
export const kUndoStack = Symbol("_undoStack");
export const kIsMultiline = Symbol("_isMultiline");
export const kWordLeft = Symbol("_wordLeft");
export const kWordRight = Symbol("_wordRight");
export const kWriteToOutput = Symbol("_writeToOutput");
export const kYank = Symbol("_yank");
export const kYanking = Symbol("_yanking");
export const kYankPop = Symbol("_yankPop");
export const kSavePreviousState = Symbol("_savePreviousState");
export const kRestorePreviousState = Symbol("_restorePreviousState");
export const kPreviousLine = Symbol("_previousLine");
export const kPreviousCursor = Symbol("_previousCursor");
export const kPreviousCursorCols = Symbol("_previousCursorCols");
export const kMultilineMove = Symbol("_multilineMove");
export const kPreviousPrevRows = Symbol("_previousPrevRows");
export const kAddNewLineOnTTY = Symbol("_addNewLineOnTTY");
export class InterfaceCore extends EventEmitter {
  input: ReadableInput;
  output: WritableOutput | null | undefined;
  line = "";
  declare cursor: number;
  terminal: boolean;
  declare closed?: boolean;
  declare paused?: boolean;
  crlfDelay: number;
  completer?: InterfaceOptions["completer"];
  escapeCodeTimeout = ESCAPE_CODE_TIMEOUT;
  tabSize = 8;
  isCompletionEnabled = true;
  declare prevRows: number;
  historyManager: History;
  declare history: string[];
  declare historyIndex: number;
  declare historySize: number;
  declare isFlushing: boolean;
  declare [kSawReturnAt]: number;
  declare [kSawKeyPress]: boolean;
  declare [kPreviousKey]: Key | null;
  declare [kIsMultiline]: boolean;
  declare [kSubstringSearch]: string | null;
  declare [kUndoStack]: { text: string; cursor: number }[];
  declare [kRedoStack]: { text: string; cursor: number }[];
  declare [kPreviousCursorCols]: number;
  declare [kKillRing]: string[];
  declare [kKillRingCursor]: number;
  declare [kLineObjectStream]: AsyncIterableIterator<string> | undefined;
  declare private [kDecoder]: StringDecoder;
  declare [kLine_buffer]: string;
  declare [kPrompt]: string;
  declare [kOldPrompt]: string;
  declare [kQuestionCallback]: ((answer: string) => void) | null;
  declare [kLastCommandErrored]: boolean;
  declare [kQuestionReject]: ((reason: unknown) => void) | null;
  declare [kYanking]: boolean;
  declare [kPreviousLine]: string;
  declare [kPreviousCursor]: number;
  declare [kPreviousPrevRows]: number;

  constructor(
    inputOrOptions: ReadableInput | InterfaceOptions,
    output?: WritableOutput | null,
    completer?: InterfaceOptions["completer"],
    terminal?: boolean,
  ) {
    super();
    this[kSawReturnAt] = 0;
    this[kSawKeyPress] = false;
    this[kPreviousKey] = null;
    let input: ReadableInput;
    let prompt = "> ";
    let signal: AbortSignal | undefined;
    let crlfDelay: number | undefined;
    let historyOptions: { size?: number; history?: string[]; removeHistoryDuplicates?: boolean } =
      {};
    if (inputOrOptions && "input" in inputOrOptions && inputOrOptions.input) {
      const options = inputOrOptions;
      input = options.input;
      output = options.output;
      completer = options.completer;
      terminal = options.terminal;
      signal = options.signal;
      crlfDelay = options.crlfDelay;
      if (options.prompt !== undefined) {
        prompt = options.prompt;
      }
      if (options.tabSize !== undefined) {
        validateUint32(options.tabSize, "tabSize", true);
        this.tabSize = options.tabSize;
      }
      if (options.escapeCodeTimeout !== undefined) {
        if (!Number.isFinite(options.escapeCodeTimeout)) {
          throw invalidArgValue("input.escapeCodeTimeout", this.escapeCodeTimeout);
        }
        this.escapeCodeTimeout = options.escapeCodeTimeout;
      }
      if (signal) {
        validateAbortSignal(signal, "options.signal");
      }
      historyOptions = {
        size: options.historySize,
        history: options.history,
        removeHistoryDuplicates: options.removeHistoryDuplicates,
      };
    } else {
      input = inputOrOptions as ReadableInput;
    }
    this.historyManager = new History(this, historyOptions);
    for (const [name, property] of [
      ["history", "history"],
      ["historyIndex", "index"],
      ["historySize", "size"],
      ["isFlushing", "isFlushing"],
    ] as const) {
      Object.defineProperty(this, name, {
        configurable: true,
        enumerable: true,
        get: () => this.historyManager[property],
        ...(property === "history" || property === "index"
          ? {
              set: (value: unknown) => {
                if (property === "history") {
                  this.historyManager.history = value as string[];
                } else {
                  this.historyManager.index = value as number;
                }
              },
            }
          : {}),
      });
    }
    if (completer !== undefined && typeof completer !== "function") {
      throw invalidArgValue("completer", completer);
    }
    if (terminal === undefined && output != null) {
      terminal = !!output.isTTY;
    }
    // oxlint-disable-next-line typescript/no-this-alias -- Preserve upstream listener closures.
    const self = this;
    this.line = "";
    this[kIsMultiline] = false;
    this[kSubstringSearch] = null;
    this.output = output;
    this.input = input;
    this[kUndoStack] = [];
    this[kRedoStack] = [];
    this[kPreviousCursorCols] = -1;
    // The kill ring is a global list of blocks of text that were previously
    // killed (deleted). If its size exceeds kMaxLengthOfKillRing, the oldest
    // element will be removed to make room for the latest deletion. With kill
    // ring, users are able to recall (yank) or cycle (yank pop) among previously
    // killed texts, quite similar to the behavior of Emacs.
    this[kKillRing] = [];
    this[kKillRingCursor] = 0;
    this.crlfDelay = crlfDelay ? Math.max(kMincrlfDelay, crlfDelay) : kMincrlfDelay;
    this.completer = completer;
    this.setPrompt(prompt);
    this.terminal = !!terminal;
    function onerror(err: Error) {
      self.emit("error", err);
    }
    function ondata(data: string | ArrayBufferView) {
      self[kNormalWrite](data);
    }
    function onend() {
      if (typeof self[kLine_buffer] === "string" && self[kLine_buffer].length > 0) {
        self.emit("line", self[kLine_buffer]);
      }
      self.close();
    }
    function ontermend() {
      if (typeof self.line === "string" && self.line.length > 0) {
        self.emit("line", self.line);
      }
      self.close();
    }
    function onkeypress(s: string, key: Key) {
      self[kTtyWrite](s, key);
      if (key?.sequence) {
        // If the key.sequence is half of a surrogate pair
        // (>= 0xd800 and <= 0xdfff), refresh the line so
        // the character is displayed appropriately.
        const ch = key.sequence.codePointAt(0)!;
        if (ch >= 0xd800 && ch <= 0xdfff) {
          self[kRefreshLine]();
        }
      }
    }
    function onresize() {
      self[kRefreshLine]();
    }
    this[kLineObjectStream] = undefined;
    input.on("error", onerror);
    if (!this.terminal) {
      function onSelfCloseWithoutTerminal() {
        input.removeListener("data", ondata);
        input.removeListener("error", onerror);
        input.removeListener("end", onend);
      }
      input.on("data", ondata);
      input.on("end", onend);
      self.once("close", onSelfCloseWithoutTerminal);
      this[kDecoder] = new StringDecoder("utf8");
    } else {
      function onSelfCloseWithTerminal() {
        input.removeListener("keypress", onkeypress);
        input.removeListener("error", onerror);
        input.removeListener("end", ontermend);
        if (output !== null && output !== undefined) {
          output.removeListener?.("resize", onresize);
        }
      }

      emitKeypressEvents(input, this);
      // `input` usually refers to stdin
      input.on("keypress", onkeypress);
      input.on("end", ontermend);
      this[kSetRawMode](true);
      this.terminal = true;
      // Cursor position on the line.
      this.cursor = 0;
      if (output !== null && output !== undefined) {
        output.on?.("resize", onresize);
      }
      self.once("close", onSelfCloseWithTerminal);
    }
    if (signal) {
      const onAborted = () => self.close();
      if (signal.aborted) {
        defer(onAborted);
      } else {
        const disposable = addAbortListener(signal, onAborted);
        self.once("close", disposable[Symbol.dispose]);
      }
    }
    // Current line
    this[kSetLine]("");
    input.resume();
  }
  get columns() {
    if (this.output?.columns) {
      return this.output.columns;
    }
    return Infinity;
  }
  /**
   * Sets the prompt written to the output.
   * @param {string} prompt
   * @returns {void}
   */
  setPrompt(prompt: string) {
    this[kPrompt] = prompt;
  }
  /**
   * Returns the current prompt used by `rl.prompt()`.
   * @returns {string}
   */
  getPrompt() {
    return this[kPrompt];
  }
  [kSetRawMode](mode: boolean) {
    const wasInRawMode = this.input.isRaw;
    if (typeof this.input.setRawMode === "function") {
      this.input.setRawMode(mode);
    }
    return wasInRawMode;
  }
  /**
   * Writes the configured `prompt` to a new line in `output`.
   * @param {boolean} [preserveCursor]
   * @returns {void}
   */
  prompt(preserveCursor?: boolean) {
    if (this.paused) {
      this.resume();
    }
    if (this.terminal) {
      if (!preserveCursor) {
        this.cursor = 0;
      }
      this[kRefreshLine]();
    } else {
      this[kWriteToOutput](this[kPrompt]);
    }
  }
  [kQuestion](query: string, cb: (answer: string) => void) {
    if (this.closed) {
      throw codedError(new Error("readline was closed"), "ERR_USE_AFTER_CLOSE");
    }
    if (this[kQuestionCallback]) {
      this.prompt();
    } else {
      this[kOldPrompt] = this[kPrompt];
      this.setPrompt(query);
      this[kQuestionCallback] = cb;
      this.prompt();
    }
  }
  [kSetLine](line = "") {
    this.line = line;
    this[kIsMultiline] = line.includes("\n");
  }
  [kOnLine](line: string) {
    if (this[kQuestionCallback]) {
      const cb = this[kQuestionCallback];
      this[kQuestionCallback] = null;
      this.setPrompt(this[kOldPrompt]);
      cb(line);
    } else {
      this.emit("line", line);
    }
  }
  [kBeforeEdit](oldText: string, oldCursor: number) {
    this[kPushToUndoStack](oldText, oldCursor);
  }
  [kQuestionCancel]() {
    if (this[kQuestionCallback]) {
      this[kQuestionCallback] = null;
      this.setPrompt(this[kOldPrompt]);
      this.clearLine();
    }
  }
  [kWriteToOutput](stringToWrite: string) {
    validateString(stringToWrite, "stringToWrite");
    if (this.output !== null && this.output !== undefined) {
      this.output.write(stringToWrite);
    }
  }
  [kAddHistory]() {
    return this.historyManager.addHistory(this[kIsMultiline], this[kLastCommandErrored]);
  }
  [kRefreshLine]() {
    // line length
    const line = this[kPrompt] + this.line;
    const dispPos = this[kGetDisplayPos](line);
    const lineCols = dispPos.cols;
    const lineRows = dispPos.rows;
    // cursor position
    const cursorPos = this.getCursorPos();
    // First move to the bottom of the current line, based on cursor pos
    const prevRows = this.prevRows || 0;
    if (prevRows > 0) {
      moveCursor(this.output, 0, -prevRows);
    }
    // Cursor to left edge.
    cursorTo(this.output, 0);
    // erase data
    clearScreenDown(this.output);
    if (this[kIsMultiline]) {
      const lines = this.line.split("\n");
      // Write first line with normal prompt
      this[kWriteToOutput](this[kPrompt] + lines[0]);
      // For continuation lines, add the "|" prefix
      for (let i = 1; i < lines.length; i++) {
        this[kWriteToOutput](`\n${kMultilinePrompt.description!}` + lines[i]);
      }
    } else {
      // Write the prompt and the current buffer content.
      this[kWriteToOutput](line);
    }
    // Force terminal to allocate a new line
    if (lineCols === 0) {
      this[kWriteToOutput](" ");
    }
    // Move cursor to original position.
    cursorTo(this.output, cursorPos.cols);
    const diff = lineRows - cursorPos.rows;
    if (diff > 0) {
      moveCursor(this.output, 0, -diff);
    }
    this.prevRows = cursorPos.rows;
  }
  /**
   * Closes the `readline.Interface` instance.
   * @returns {void}
   */
  close() {
    if (this.closed) {
      return;
    }
    this.pause();
    if (this.terminal) {
      this[kSetRawMode](false);
    }
    this.closed = true;
    this.emit("close");
  }
  /**
   * Pauses the `input` stream.
   * @returns {void | Interface}
   */
  pause() {
    if (this.closed) {
      throw codedError(new Error("readline was closed"), "ERR_USE_AFTER_CLOSE");
    }
    if (this.paused) {
      return;
    }
    this.input.pause();
    this.paused = true;
    this.emit("pause");
    return this;
  }
  /**
   * Resumes the `input` stream if paused.
   * @returns {void | Interface}
   */
  resume() {
    if (this.closed) {
      throw codedError(new Error("readline was closed"), "ERR_USE_AFTER_CLOSE");
    }
    if (!this.paused) {
      return;
    }
    this.input.resume();
    this.paused = false;
    this.emit("resume");
    return this;
  }
  /**
   * Writes either `data` or a `key` sequence identified by
   * `key` to the `output`.
   * @param {string} d
   * @param {{
   *   ctrl?: boolean;
   *   meta?: boolean;
   *   shift?: boolean;
   *   name?: string;
   *   }} [key]
   * @returns {void}
   */
  write(d: string | ArrayBufferView | null, key?: Key) {
    if (this.closed) {
      throw codedError(new Error("readline was closed"), "ERR_USE_AFTER_CLOSE");
    }
    if (this.paused) {
      this.resume();
    }
    if (this.terminal) {
      this[kTtyWrite](d, key);
    } else {
      this[kNormalWrite](d);
    }
  }
  [kNormalWrite](b: string | ArrayBufferView | null) {
    if (b === undefined) {
      return;
    }
    if (b === null) {
      throw invalidArgType("buf", ["Buffer", "TypedArray", "DataView"], b);
    }
    let string = this[kDecoder].write(b);
    if (this[kSawReturnAt] && Date.now() - this[kSawReturnAt] <= this.crlfDelay) {
      if (string.codePointAt(0)! === 10) {
        string = string.slice(1);
      }
      this[kSawReturnAt] = 0;
    }
    if (!string) {
      return;
    }
    // Split the new string chunk, not the entire line buffer: a single
    // split pass avoids allocating a match object per line ending.
    // When the chunk contains none of the rare line endings, a plain
    // string split is much cheaper than the regular expression.
    const lines =
      string.includes("\r") || string.includes("\u2028") || string.includes("\u2029")
        ? lineEnding[Symbol.split](string)
        : string.split("\n");
    const lastIndex = lines.length - 1;
    if (lastIndex === 0) {
      // No line endings this time, save what we have for next time.
      if (this[kLine_buffer]) {
        this[kLine_buffer] += string;
      } else {
        this[kLine_buffer] = string;
      }
      return;
    }
    this[kSawReturnAt] = string.endsWith("\r") ? Date.now() : 0;
    let first = lines[0];
    if (this[kLine_buffer]) {
      first = this[kLine_buffer] + first;
    }
    // Either '' or (conceivably) the unfinished portion of the next line
    this[kLine_buffer] = lines[lastIndex];
    this[kOnLine](first);
    for (let i = 1; i < lastIndex; i++) {
      this[kOnLine](lines[i]);
    }
  }
  [kInsertString](c: string) {
    this[kBeforeEdit](this.line, this.cursor);
    if (!this.isCompletionEnabled) {
      if (this.cursor < this.line.length) {
        const beg = this.line.slice(0, this.cursor);
        const end = this.line.slice(this.cursor, this.line.length);
        this.line = beg + c + end;
      } else {
        this.line += c;
      }
      this.cursor += c.length;
      this[kWriteToOutput](c);
      return;
    }
    if (this.cursor < this.line.length) {
      const beg = this.line.slice(0, this.cursor);
      const end = this.line.slice(this.cursor, this.line.length);
      this[kSetLine](beg + c + end);
      this.cursor += c.length;
      this[kRefreshLine]();
    } else {
      const oldPos = this.getCursorPos();
      this.line += c;
      this.cursor += c.length;
      const newPos = this.getCursorPos();
      if (oldPos.rows < newPos.rows) {
        this[kRefreshLine]();
      } else {
        this[kWriteToOutput](c);
      }
    }
  }
  async [kTabComplete](lastKeypressWasTab: boolean) {
    this.pause();
    const string = this.line.slice(0, this.cursor);
    let value: CompleterResult;
    try {
      value = await (this.completer as PromiseCompleter)(string);
    } catch (err) {
      this[kWriteToOutput](`Tab completion error: ${inspect(err)}`);
      return;
    } finally {
      this.resume();
    }
    this[kTabCompleter](lastKeypressWasTab, value);
  }
  [kTabCompleter](lastKeypressWasTab: boolean, [completions, completeOn]: CompleterResult) {
    // Result and the text that was completed.
    if (!completions || completions.length === 0) {
      return;
    }
    // If there is a common prefix to all matches, then apply that portion.
    const prefix = commonPrefix(completions.filter((e) => e !== ""));
    if (prefix.startsWith(completeOn) && prefix.length > completeOn.length) {
      this[kInsertString](prefix.slice(completeOn.length));
      return;
    } else if (!completeOn.startsWith(prefix)) {
      this[kSetLine](
        this.line.slice(0, this.cursor - completeOn.length) +
          prefix +
          this.line.slice(this.cursor, this.line.length),
      );
      this.cursor = this.cursor - completeOn.length + prefix.length;
      this[kRefreshLine]();
      return;
    }
    if (!lastKeypressWasTab) {
      return;
    }
    this[kBeforeEdit](this.line, this.cursor);
    // Apply/show completions.
    const completionsWidth = completions.map((e) => getStringWidth(e));
    const width = Math.max(...completionsWidth) + 2; // 2 space padding
    let maxColumns = Math.floor(this.columns / width) || 1;
    if (maxColumns === Infinity) {
      maxColumns = 1;
    }
    let output = "\r\n";
    let lineIndex = 0;
    let whitespace = 0;
    for (let i = 0; i < completions.length; i++) {
      const completion = completions[i];
      if (completion === "" || lineIndex === maxColumns) {
        output += "\r\n";
        lineIndex = 0;
        whitespace = 0;
      } else {
        output += " ".repeat(whitespace);
      }
      if (completion !== "") {
        output += completion;
        whitespace = width - completionsWidth[i];
        lineIndex++;
      } else {
        output += "\r\n";
      }
    }
    if (lineIndex !== 0) {
      output += "\r\n\r\n";
    }
    this[kWriteToOutput](output);
    this[kRefreshLine]();
  }
  [kWordLeft]() {
    if (this.cursor > 0) {
      // Reverse the string and match a word near beginning
      // to avoid quadratic time complexity
      const leading = this.line.slice(0, this.cursor);
      const reversed = Array.from(leading).reverse().join("");
      const match = /^\s*(?:[^\w\s]+|\w+)?/.exec(reversed);
      this[kMoveCursor](-match![0].length);
    }
  }
  [kWordRight]() {
    if (this.cursor < this.line.length) {
      const trailing = this.line.slice(this.cursor);
      const match = /^(?:\s+|[^\w\s]+|\w+)\s*/.exec(trailing);
      this[kMoveCursor](match![0].length);
    }
  }
  [kDeleteLeft]() {
    if (this.cursor > 0 && this.line.length > 0) {
      this[kBeforeEdit](this.line, this.cursor);
      // The number of UTF-16 units comprising the character to the left
      const charSize = charLengthLeft(this.line, this.cursor);
      this.line =
        this.line.slice(0, this.cursor - charSize) + this.line.slice(this.cursor, this.line.length);
      this.cursor -= charSize;
      this[kRefreshLine]();
    }
  }
  [kDeleteRight]() {
    if (this.cursor < this.line.length) {
      this[kBeforeEdit](this.line, this.cursor);
      // The number of UTF-16 units comprising the character to the left
      const charSize = charLengthAt(this.line, this.cursor);
      this.line =
        this.line.slice(0, this.cursor) + this.line.slice(this.cursor + charSize, this.line.length);
      this[kRefreshLine]();
    }
  }
  [kDeleteWordLeft]() {
    if (this.cursor > 0) {
      this[kBeforeEdit](this.line, this.cursor);
      // Reverse the string and match a word near beginning
      // to avoid quadratic time complexity
      let leading = this.line.slice(0, this.cursor);
      const reversed = Array.from(leading).reverse().join("");
      const match = /^\s*(?:[^\w\s]+|\w+)?/.exec(reversed);
      leading = leading.slice(0, leading.length - match![0].length);
      this.line = leading + this.line.slice(this.cursor, this.line.length);
      this.cursor = leading.length;
      this[kRefreshLine]();
    }
  }
  [kDeleteWordRight]() {
    if (this.cursor < this.line.length) {
      this[kBeforeEdit](this.line, this.cursor);
      const trailing = this.line.slice(this.cursor);
      const match = /^(?:\s+|\W+|\w+)\s*/.exec(trailing);
      this.line = this.line.slice(0, this.cursor) + trailing.slice(match![0].length);
      this[kRefreshLine]();
    }
  }
  [kDeleteLineLeft]() {
    this[kBeforeEdit](this.line, this.cursor);
    const del = this.line.slice(0, this.cursor);
    this[kSetLine](this.line.slice(this.cursor));
    this.cursor = 0;
    this[kPushToKillRing](del);
    this[kRefreshLine]();
  }
  [kDeleteLineRight]() {
    this[kBeforeEdit](this.line, this.cursor);
    const del = this.line.slice(this.cursor);
    this[kSetLine](this.line.slice(0, this.cursor));
    this[kPushToKillRing](del);
    this[kRefreshLine]();
  }
  [kPushToKillRing](del: string) {
    if (!del || del === this[kKillRing][0]) {
      return;
    }
    this[kKillRing].unshift(del);
    this[kKillRingCursor] = 0;
    while (this[kKillRing].length > kMaxLengthOfKillRing) {
      this[kKillRing].pop();
    }
  }
  [kYank]() {
    if (this[kKillRing].length > 0) {
      this[kYanking] = true;
      this[kInsertString](this[kKillRing][this[kKillRingCursor]]);
    }
  }
  [kYankPop]() {
    if (!this[kYanking]) {
      return;
    }
    if (this[kKillRing].length > 1) {
      const lastYank = this[kKillRing][this[kKillRingCursor]];
      this[kKillRingCursor]++;
      if (this[kKillRingCursor] >= this[kKillRing].length) {
        this[kKillRingCursor] = 0;
      }
      const currentYank = this[kKillRing][this[kKillRingCursor]];
      const head = this.line.slice(0, this.cursor - lastYank.length);
      const tail = this.line.slice(this.cursor);
      this[kSetLine](head + currentYank + tail);
      this.cursor = head.length + currentYank.length;
      this[kRefreshLine]();
    }
  }
  [kSavePreviousState]() {
    this[kPreviousLine] = this.line;
    this[kPreviousCursor] = this.cursor;
    this[kPreviousPrevRows] = this.prevRows;
  }
  [kRestorePreviousState]() {
    this[kSetLine](this[kPreviousLine]);
    this.cursor = this[kPreviousCursor];
    this.prevRows = this[kPreviousPrevRows];
  }
  clearLine() {
    this[kMoveCursor](+Infinity);
    this[kWriteToOutput]("\r\n");
    this[kSetLine]("");
    this.cursor = 0;
    this.prevRows = 0;
  }
  [kLine]() {
    this[kSavePreviousState]();
    const line = this[kAddHistory]();
    this[kUndoStack] = [];
    this[kRedoStack] = [];
    this.clearLine();
    this[kOnLine](line);
  }
  // TODO(puskin94): edit [kTtyWrite] to make call this function on a new key combination
  //                 to make it add a new line in the middle of a "complete" multiline.
  //                 I tried with shift + enter but it is not detected. Find a new one.
  //                 Make sure to call this[kSavePreviousState](); && this.clearLine();
  //                 before calling this[kAddNewLineOnTTY] to simulate what [kLine] is doing.
  // When this function is called, the actual cursor is at the very end of the whole string,
  // No matter where the new line was entered.
  // This function should only be used when the output is a TTY
  [kAddNewLineOnTTY]() {
    // Restore terminal state and store current line
    this[kRestorePreviousState]();
    const originalLine = this.line;
    // Split the line at the current cursor position
    const beforeCursor = this.line.slice(0, this.cursor);
    let afterCursor = this.line.slice(this.cursor, this.line.length);
    // Add the new line where the cursor is at
    this[kSetLine](`${beforeCursor}\n${afterCursor}`);
    // To account for the new line
    this.cursor += 1;
    const hasContentAfterCursor = afterCursor.length > 0;
    const cursorIsNotOnFirstLine = this.prevRows > 0;
    let needsRewriteFirstLine = false;
    // Handle cursor positioning based on different scenarios
    if (hasContentAfterCursor) {
      const splitBeg = beforeCursor.split("\n");
      // Determine if we need to rewrite the first line
      needsRewriteFirstLine = splitBeg.length < 2;
      // If the cursor is not on the first line
      if (cursorIsNotOnFirstLine) {
        const splitEnd = afterCursor.split("\n");
        // If the cursor when I pressed enter was at least on the second line
        // I need to completely erase the line where the cursor was pressed because it is possible
        // That it was pressed in the middle of the line, hence I need to write the whole line.
        // To achieve that, I need to reach the line above the current line coming from the end
        const dy = splitEnd.length + 1;
        // Calculate how many Xs we need to move on the right to get to the end of the line
        const dxEndOfLineAbove =
          (splitBeg[splitBeg.length - 2] || "").length + kMultilinePrompt.description!.length;
        moveCursor(this.output, dxEndOfLineAbove, -dy);
        // This is the line that was split in the middle
        // Just add it to the rest of the line that will be printed later
        afterCursor = `${splitBeg[splitBeg.length - 1]}\n${afterCursor}`;
      } else {
        // Otherwise, go to the very beginning of the first line and erase everything
        const dy = originalLine.split("\n").length;
        moveCursor(this.output, 0, -dy);
      }
      // Erase from the cursor to the end of the line
      clearScreenDown(this.output);
      if (cursorIsNotOnFirstLine) {
        this[kWriteToOutput]("\n");
      }
    }
    if (needsRewriteFirstLine) {
      this[kWriteToOutput](`${this[kPrompt]}${beforeCursor}\n${kMultilinePrompt.description!}`);
    } else {
      this[kWriteToOutput](kMultilinePrompt.description!);
    }
    // Write the rest and restore the cursor to where the user left it
    if (hasContentAfterCursor) {
      // Save the cursor pos, we need to come back here
      const oldCursor = this.getCursorPos();
      // Write everything after the cursor which has been deleted by clearScreenDown
      const formattedEndContent = afterCursor.replaceAll(
        "\n",
        `\n${kMultilinePrompt.description!}`,
      );
      this[kWriteToOutput](formattedEndContent);
      const newCursor = this[kGetDisplayPos](this.line);
      // Go back to where the cursor was, with relative movement
      moveCursor(this.output, oldCursor.cols - newCursor.cols, oldCursor.rows - newCursor.rows);
      // Setting how many rows we have on top of the cursor
      // Necessary for kRefreshLine
      this.prevRows = oldCursor.rows;
    } else {
      // Setting how many rows we have on top of the cursor
      // Necessary for kRefreshLine
      this.prevRows = this.line.split("\n").length - 1;
    }
  }
  [kPushToUndoStack](text: string, cursor: number) {
    if (this[kUndoStack].push({ text, cursor }) > kMaxUndoRedoStackSize) {
      this[kUndoStack].shift();
    }
  }
  [kUndo]() {
    if (this[kUndoStack].length <= 0) {
      return;
    }
    this[kRedoStack].push({ text: this.line, cursor: this.cursor });
    const entry = this[kUndoStack].pop();
    this[kSetLine](entry!.text);
    this.cursor = entry!.cursor;
    this[kRefreshLine]();
  }
  [kRedo]() {
    if (this[kRedoStack].length <= 0) {
      return;
    }
    this[kUndoStack].push({ text: this.line, cursor: this.cursor });
    const entry = this[kRedoStack].pop();
    this[kSetLine](entry!.text);
    this.cursor = entry!.cursor;
    this[kRefreshLine]();
  }
  [kMultilineMove](direction: number, splitLines: string[], { rows, cols }: CursorPosition) {
    const curr = splitLines[rows];
    const down = direction === 1;
    const adj = splitLines[rows + direction];
    const promptLen = kMultilinePrompt.description!.length;
    let amountToMove;
    // Clamp distance to end of current + prompt + next/prev line + newline
    const clamp = down ? curr.length - cols + promptLen + adj.length + 1 : -cols + 1;
    const shouldClamp = cols > adj.length + 1;
    if (shouldClamp) {
      if (this[kPreviousCursorCols] === -1) {
        this[kPreviousCursorCols] = cols;
      }
      amountToMove = clamp;
    } else {
      if (down) {
        amountToMove = curr.length + 1;
      } else {
        amountToMove = -adj.length - 1;
      }
      if (this[kPreviousCursorCols] !== -1) {
        if (this[kPreviousCursorCols] <= adj.length) {
          amountToMove += this[kPreviousCursorCols] - cols;
          this[kPreviousCursorCols] = -1;
        } else {
          amountToMove = clamp;
        }
      }
    }
    this[kMoveCursor](amountToMove);
  }
  [kMoveDownOrHistoryNext]() {
    const cursorPos = this.getCursorPos();
    const splitLines = this.line.split("\n");
    if (this[kIsMultiline] && cursorPos.rows < splitLines.length - 1) {
      this[kMultilineMove](1, splitLines, cursorPos);
      return;
    }
    this[kPreviousCursorCols] = -1;
    this[kHistoryNext]();
  }
  // TODO(BridgeAR): Add underscores to the search part and a red background in
  // case no match is found. This should only be the visual part and not the
  // actual line content!
  // TODO(BridgeAR): In case the substring based search is active and the end is
  // reached, show a comment how to search the history as before. E.g., using
  // <ctrl> + N. Only show this after two/three UPs or DOWNs, not on the first
  // one.
  [kHistoryNext]() {
    if (!this.historyManager.canNavigateToNext()) {
      return;
    }
    this[kBeforeEdit](this.line, this.cursor);
    this[kSetLine](this.historyManager.navigateToNext(this[kSubstringSearch])!);
    this.cursor = this.line.length; // Set cursor to end of line.
    this[kRefreshLine]();
  }
  [kMoveUpOrHistoryPrev]() {
    const cursorPos = this.getCursorPos();
    if (this[kIsMultiline] && cursorPos.rows > 0) {
      const splitLines = this.line.split("\n");
      this[kMultilineMove](-1, splitLines, cursorPos);
      return;
    }
    this[kPreviousCursorCols] = -1;
    this[kHistoryPrev]();
  }
  [kHistoryPrev]() {
    if (!this.historyManager.canNavigateToPrevious()) {
      return;
    }
    this[kBeforeEdit](this.line, this.cursor);
    this[kSetLine](this.historyManager.navigateToPrevious(this[kSubstringSearch])!);
    this.cursor = this.line.length; // Set cursor to end of line.
    this[kRefreshLine]();
  }
  // Returns the last character's display position of the given string
  [kGetDisplayPos](str: string) {
    let offset = 0;
    const col = this.columns;
    let rows = 0;
    str = stripVTControlCharacters(str);
    for (const char of str) {
      if (char === "\n") {
        // Rows must be incremented by 1 even if offset = 0 or col = +Infinity.
        rows += Math.ceil(offset / col) || 1;
        // Only add prefix offset for continuation lines in user input (not prompts)
        offset = this[kIsMultiline] ? kMultilinePrompt.description!.length : 0;
        continue;
      }
      // Tabs must be aligned by an offset of the tab size.
      if (char === "\t") {
        offset += this.tabSize - (offset % this.tabSize);
        continue;
      }
      const width = getStringWidth(char, false /* stripVTControlCharacters */);
      if (width === 0 || width === 1) {
        offset += width;
      } else {
        // width === 2
        if ((offset + 1) % col === 0) {
          offset++;
        }
        offset += 2;
      }
    }
    const cols = offset % col;
    rows += (offset - cols) / col;
    return { cols, rows };
  }
  /**
   * Returns the real position of the cursor in relation
   * to the input prompt + string.
   * @returns {{
   *   rows: number;
   *   cols: number;
   *   }}
   */
  getCursorPos() {
    const strBeforeCursor = this[kPrompt] + this.line.slice(0, this.cursor);
    return this[kGetDisplayPos](strBeforeCursor);
  }
  // This function moves cursor dx places to the right
  // (-dx for left) and refreshes the line if it is needed.
  [kMoveCursor](dx: number) {
    if (dx === 0) {
      return;
    }
    const oldPos = this.getCursorPos();
    this.cursor += dx;
    // Bounds check
    if (this.cursor < 0) {
      this.cursor = 0;
    } else if (this.cursor > this.line.length) {
      this.cursor = this.line.length;
    }
    const newPos = this.getCursorPos();
    // Check if cursor stayed on the line.
    if (oldPos.rows === newPos.rows) {
      const diffWidth = newPos.cols - oldPos.cols;
      moveCursor(this.output, diffWidth, 0);
    } else {
      this[kRefreshLine]();
    }
  }
  // Handle a write from the tty
  [kTtyWrite](s: string | ArrayBufferView | null, key?: Key) {
    const previousKey = this[kPreviousKey];
    key ||= kEmptyObject;
    this[kPreviousKey] = key;
    let shouldResetPreviousCursorCols = true;
    if (!key.meta || key.name !== "y") {
      // Reset yanking state unless we are doing yank pop.
      this[kYanking] = false;
    }
    // Activate or deactivate substring search.
    if ((key.name === "up" || key.name === "down") && !key.ctrl && !key.meta && !key.shift) {
      if (this[kSubstringSearch] === null && !this[kIsMultiline]) {
        this[kSubstringSearch] = this.line.slice(0, this.cursor);
      }
    } else if (this[kSubstringSearch] !== null) {
      this[kSubstringSearch] = null;
      // Reset the index in case there's no match.
      if (this.history.length === this.historyIndex) {
        this.historyIndex = -1;
      }
    }
    // Undo & Redo
    if (typeof key.sequence === "string") {
      switch (key.sequence.codePointAt(0)!) {
        case 0x1f:
          this[kUndo]();
          return;
        case 0x1e:
          this[kRedo]();
          return;
        default:
          break;
      }
    }
    // Ignore escape key, fixes
    // https://github.com/nodejs/node-v0.x-archive/issues/2876.
    if (key.name === "escape") {
      return;
    }
    if (key.ctrl && key.shift) {
      /* Control and shift pressed */
      switch (key.name) {
        // TODO(BridgeAR): The transmitted escape sequence is `\b` and that is
        // identical to <ctrl>-h. It should have a unique escape sequence.
        case "backspace":
          this[kDeleteLineLeft]();
          break;
        case "delete":
          this[kDeleteLineRight]();
          break;
      }
    } else if (key.ctrl) {
      /* Control key pressed */
      switch (key.name) {
        case "c":
          if (this.listenerCount("SIGINT") > 0) {
            this.emit("SIGINT");
          } else {
            // This readline instance is finished
            this.close();
            this[kQuestionReject]?.(new AbortError("Aborted with Ctrl+C"));
          }
          break;
        case "h": // delete left
          this[kDeleteLeft]();
          break;
        case "d": // delete right or EOF
          if (this.cursor === 0 && this.line.length === 0) {
            // This readline instance is finished
            this.close();
            this[kQuestionReject]?.(new AbortError("Aborted with Ctrl+D"));
          } else if (this.cursor < this.line.length) {
            this[kDeleteRight]();
          }
          break;
        case "u": // Delete from current to start of line
          this[kDeleteLineLeft]();
          break;
        case "k": // Delete from current to end of line
          this[kDeleteLineRight]();
          break;
        case "a": // Go to the start of the line
          this[kMoveCursor](-Infinity);
          break;
        case "e": // Go to the end of the line
          this[kMoveCursor](+Infinity);
          break;
        case "b": // back one character
          this[kMoveCursor](-charLengthLeft(this.line, this.cursor));
          break;
        case "f": // Forward one character
          this[kMoveCursor](+charLengthAt(this.line, this.cursor));
          break;
        case "l": // Clear the whole screen
          cursorTo(this.output, 0, 0);
          clearScreenDown(this.output);
          this[kRefreshLine]();
          break;
        case "n": // next history item
          this[kHistoryNext]();
          break;
        case "p": // Previous history item
          this[kHistoryPrev]();
          break;
        case "y": // Yank killed string
          this[kYank]();
          break;
        case "z":
          if (this.listenerCount("SIGTSTP") > 0) {
            this.emit("SIGTSTP");
          } else {
            throw unsupportedNodeApi(
              "readline SIGTSTP",
              "components cannot suspend the host process",
            );
          }
          break;
        case "w": // Delete backwards to a word boundary
        // TODO(BridgeAR): The transmitted escape sequence is `\b` and that is
        // identical to <ctrl>-h. It should have a unique escape sequence.
        // Falls through
        case "backspace":
          this[kDeleteWordLeft]();
          break;
        case "delete": // Delete forward to a word boundary
          this[kDeleteWordRight]();
          break;
        case "left":
          this[kWordLeft]();
          break;
        case "right":
          this[kWordRight]();
          break;
      }
    } else if (key.meta) {
      /* Meta key pressed */
      switch (key.name) {
        case "b": // backward word
          this[kWordLeft]();
          break;
        case "f": // forward word
          this[kWordRight]();
          break;
        case "d": // delete forward word
        case "delete":
          this[kDeleteWordRight]();
          break;
        case "backspace": // Delete backwards to a word boundary
          this[kDeleteWordLeft]();
          break;
        case "y": // Doing yank pop
          this[kYankPop]();
          break;
      }
    } else {
      /* No modifier keys used */
      // \r bookkeeping is only relevant if a \n comes right after.
      if (this[kSawReturnAt] && key.name !== "enter") {
        this[kSawReturnAt] = 0;
      }
      switch (key.name) {
        case "return": // Carriage return, i.e. \r
          this[kSawReturnAt] = Date.now();
          this[kLine]();
          break;
        case "enter":
          // When key interval > crlfDelay
          if (this[kSawReturnAt] === 0 || Date.now() - this[kSawReturnAt] > this.crlfDelay) {
            this[kLine]();
          }
          this[kSawReturnAt] = 0;
          break;
        case "backspace":
          this[kDeleteLeft]();
          break;
        case "delete":
          this[kDeleteRight]();
          break;
        case "left":
          // Obtain the code point to the left
          this[kMoveCursor](-charLengthLeft(this.line, this.cursor));
          break;
        case "right":
          this[kMoveCursor](+charLengthAt(this.line, this.cursor));
          break;
        case "home":
          this[kMoveCursor](-Infinity);
          break;
        case "end":
          this[kMoveCursor](+Infinity);
          break;
        case "up":
          shouldResetPreviousCursorCols = false;
          this[kMoveUpOrHistoryPrev]();
          break;
        case "down":
          shouldResetPreviousCursorCols = false;
          this[kMoveDownOrHistoryNext]();
          break;
        case "tab":
          // If tab completion enabled, do that...
          if (typeof this.completer === "function" && this.isCompletionEnabled) {
            const lastKeypressWasTab = !!previousKey && previousKey.name === "tab";
            this[kTabComplete](lastKeypressWasTab);
            break;
          }
        // falls through
        default:
          if (typeof s === "string" && s) {
            // Erase state of previous searches.
            lineEnding.lastIndex = 0;
            let nextMatch;
            // Keep track of the end of the last match.
            let lastIndex = 0;
            while ((nextMatch = lineEnding.exec(s)) !== null) {
              this[kInsertString](s.slice(lastIndex, nextMatch.index));
              ({ lastIndex } = lineEnding);
              this[kLine]();
              // Restore lastIndex as the call to kLine could have mutated it.
              lineEnding.lastIndex = lastIndex;
            }
            // This ensures that the last line is written if it doesn't end in a newline.
            // Note that the last line may be the first line, in which case this still works.
            this[kInsertString](s.slice(lastIndex));
          }
      }
    }
    if (shouldResetPreviousCursorCols) {
      this[kPreviousCursorCols] = -1;
    }
  }
  /**
   * Creates an `AsyncIterator` object that iterates through
   * each line in the input stream as a string.
   * @returns {AsyncIterableIterator<string>}
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<string> {
    return (this[kLineObjectStream] ??= lineIterator(this));
  }
  [Symbol.dispose](): void {
    this.close();
  }
}
