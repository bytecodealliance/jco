import { unsupported } from "./errors.js";

/**
 * Node's `Module` class -- the object `require("node:module")` itself is.
 *
 * Constructing one is allowed and matches Node's own-property shape. It is cheap, harmless, and
 * real code builds these for bookkeeping without ever loading anything. The methods are what need
 * a loader, so that is where the refusal lives.
 */
export class Module {
  id: string;
  path: string;
  exports: Record<string, unknown>;
  filename: string | null;
  loaded: boolean;
  children: Module[];

  constructor(id = "", parent?: Module) {
    this.id = id;
    this.path = ".";
    this.exports = {};
    this.filename = null;
    this.loaded = false;
    this.children = [];
    void parent;
  }

  /**
   * Node exposes the deprecated parent link on the prototype.
   *
   * `undefined`, not `null`: that is what Node 24 reports for a module with no parent, and the two
   * are distinguishable to a caller.
   */
  get parent(): Module | undefined {
    return undefined;
  }

  /** Node reports whether a module is running during preload; nothing preloads here. */
  get isPreloading(): boolean {
    return false;
  }

  require(specifier: string): unknown {
    throw unsupported(
      `module.require(${JSON.stringify(specifier)})`,
      "Use a static `import` instead, which the bundler can resolve at build time",
    );
  }

  load(filename: string): void {
    throw unsupported(`module.load(${JSON.stringify(filename)})`);
  }

  _compile(content: string, filename: string): unknown {
    void content;
    throw unsupported(`module._compile(..., ${JSON.stringify(filename)})`);
  }
}
