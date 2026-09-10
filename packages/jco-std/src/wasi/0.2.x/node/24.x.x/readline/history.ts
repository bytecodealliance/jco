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
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/internal/repl/history.js (in-memory history only).
// Local changes: TypeScript types, ES intrinsics, portable errors and scheduling.
// See ./README.md for runtime boundaries.

import { reverseString } from "./utils.js";
import { invalidArgType, outOfRange } from "../errors.js";

export class History {
  history: string[];
  index = -1;
  size: number;
  isFlushing = false;
  private removeHistoryDuplicates: boolean;

  constructor(
    private context: { line: string; emit(event: string, ...args: unknown[]): boolean },
    options: { history?: string[]; size?: number; removeHistoryDuplicates?: boolean } = {},
  ) {
    if (options.history !== undefined && !Array.isArray(options.history)) {
      throw invalidArgType("history", "Array", options.history);
    }
    if (options.size !== undefined) {
      if (typeof options.size !== "number") {
        throw invalidArgType("size", "number", options.size);
      }
      if (options.size < 0) {
        throw outOfRange("size", ">= 0", options.size);
      }
    }
    this.history = options.history ?? [];
    this.size = options.size ?? 30;
    this.removeHistoryDuplicates = options.removeHistoryDuplicates || false;
  }

  addHistory(isMultiline: boolean, lastCommandErrored: boolean): string {
    const line = this.context.line;
    if (line.length === 0) {
      return "";
    }
    // If the history is disabled then return the line
    if (this.size === 0) {
      return line;
    }
    // If the trimmed line is empty then return the line
    if (line.trim().length === 0) {
      return line;
    }
    // This is necessary because each line would be saved in the history while creating
    // a new multiline, and we don't want that.
    if (isMultiline && this.index === -1) {
      this.history.shift();
    } else if (lastCommandErrored) {
      // If the last command errored and we are trying to edit the history to fix it
      // remove the broken one from the history
      this.history.shift();
    }
    const normalizedLine = reverseString(line, "\n", "\r");
    if (this.history.length === 0 || this.history[0] !== normalizedLine) {
      if (this.removeHistoryDuplicates) {
        // Remove older history line if identical to new one
        const dupIndex = this.history.indexOf(normalizedLine);
        if (dupIndex !== -1) {
          this.history.splice(dupIndex, 1);
        }
      }
      // Add the new line to the history
      this.history.unshift(normalizedLine);
      // Only store so many
      if (this.history.length > this.size) {
        this.history.pop();
      }
    }
    this.index = -1;
    const finalLine = isMultiline ? reverseString(this.history[0]) : this.history[0];
    // The listener could change the history object, possibly
    // to remove the last added entry if it is sensitive and should
    // not be persisted in the history, like a password
    // Emit history event to notify listeners of update
    this.context.emit("history", this.history);
    return finalLine;
  }

  canNavigateToNext() {
    return this.index > -1 && this.history.length > 0;
  }

  navigateToNext(substringSearch: string | null): string | null {
    if (!this.canNavigateToNext()) {
      return null;
    }
    const search = substringSearch || "";
    let index = this.index - 1;
    while (
      index >= 0 &&
      (!this.history[index].startsWith(search) || this.context.line === this.history[index])
    ) {
      index--;
    }
    this.index = index;
    if (index === -1) {
      return search;
    }
    return reverseString(this.history[index], "\r", "\n");
  }

  canNavigateToPrevious() {
    return this.history.length !== this.index && this.history.length > 0;
  }

  navigateToPrevious(substringSearch: string | null = "") {
    if (!this.canNavigateToPrevious()) {
      return null;
    }
    const search = substringSearch || "";
    let index = this.index + 1;
    while (
      index < this.history.length &&
      (!this.history[index].startsWith(search) || this.context.line === this.history[index])
    ) {
      index++;
    }
    this.index = index;
    if (index === this.history.length) {
      return search;
    }
    return reverseString(this.history[index], "\r", "\n");
  }
}
