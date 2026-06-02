class FileImpl {
  constructor(path) {
    this.path = path;
  }

  size() {
    return this.path.length <= 1 ? 101n : 202n;
  }
}

export const fsProviderReadBorrow = {
  File: FileImpl,
  readBorrow(f) {
    return f.path.length <= 1 ? "f1" : "f2";
  },
};

export const run = {
  run() {},
};
