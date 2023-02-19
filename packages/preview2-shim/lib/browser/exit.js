class FailureExit extends Error {
  code = 1;
  constructor() {
    super("failure-exit");
  }
}

class SuccessfulExit extends Error {
  code = 0;
  constructor() {
    super("successful-exit");
  }
}

export function exit(status) {
  console.log(`[exit] Exit: ${JSON.stringify(status)}`);
  if (status.tag === "err") {
    throw new FailureExit();
  }
  throw new SuccessfulExit();
}
