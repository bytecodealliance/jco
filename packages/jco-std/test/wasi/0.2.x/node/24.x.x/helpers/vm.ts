import { expect } from "vitest";

export function capture(operation: () => unknown): {
  name: string;
  code: unknown;
  message: string;
} {
  try {
    operation();
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    return {
      name: error.name,
      code: "code" in error ? error.code : undefined,
      message: error.message,
    };
  }

  throw new Error("Expected an error");
}

export function expectUnsupported(operation: () => unknown, api: string): void {
  expect(capture(operation)).toMatchObject({
    name: "Error",
    code: "ERR_JCO_UNSUPPORTED_NODE_API",
    message: expect.stringContaining(api),
  });
}

export function poison(): object {
  return new Proxy(
    {},
    {
      get() {
        throw new Error("argument was read");
      },
      ownKeys() {
        throw new Error("argument was enumerated");
      },
    },
  );
}

export const isNode24 = process.versions.node.split(".")[0] === "24";
