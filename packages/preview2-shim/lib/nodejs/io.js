import { Io } from '../common/io.js';

export const _io = new Io(
  {
    write (buf) {
      process.stdout.write(buf);
    }
  },
  {
    write (buf) {
      process.stderr.write(buf);
    }
  }
);

export const streams = _io.streams;
