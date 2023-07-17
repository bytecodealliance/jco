import { readSync as fsReadSync } from 'node:fs';

function _convertFsError (e) {
  switch (e.code) {
    case 'EACCES': throw 'access';
    case 'EAGAIN':
    case 'EWOULDBLOCK': throw 'would-block';
    case 'EALREADY': throw 'already';
    case 'EBADF': throw 'bad-descriptor';
    case 'EBUSY': throw 'busy';
    case 'EDEADLK': throw 'deadlock';
    case 'EDQUOT': throw 'quota';
    case 'EEXIST': throw 'exist';
    case 'EFBIG': throw 'file-too-large';
    case 'EILSEQ': throw 'illegal-byte-sequence';
    case 'EINPROGRESS': throw 'in-progress';
    case 'EINTR': throw 'interrupted';
    case 'EINVAL': throw 'invalid';
    case 'EIO': throw 'io';
    case 'EISDIR': throw 'is-directory';
    case 'ELOOP': throw 'loop';
    case 'EMLINK': throw 'too-many-links';
    case 'EMSGSIZE': throw 'message-size';
    case 'ENAMETOOLONG': throw 'name-too-long'
    case 'ENODEV': throw 'no-device';
    case 'ENOENT': throw 'no-entry';
    case 'ENOLCK': throw 'no-lock';
    case 'ENOMEM': throw 'insufficient-memory';
    case 'ENOSPC': throw 'insufficient-space';
    case 'ENOTDIR': throw 'not-directory';
    case 'ENOTEMPTY': throw 'not-empty';
    case 'ENOTRECOVERABLE': throw 'not-recoverable';
    case 'ENOTSUP': throw 'unsupported';
    case 'ENOTTY': throw 'no-tty';
    case 'ENXIO': throw 'no-such-device';
    case 'EOVERFLOW': throw 'overflow';
    case 'EPERM': throw 'not-permitted';
    case 'EPIPE': throw 'pipe';
    case 'EROFS': throw 'read-only';
    case 'ESPIPE': throw 'invalid-seek';
    case 'ETXTBSY': throw 'text-file-busy';
    case 'EXDEV': throw 'cross-device';
    default: throw e;
  }
}

export let _streams = {};
let streamCnt = 0;
export function _createFsStream(fd, type, context) {
  _streams[streamCnt] = {
    type,
    fd,
    context
  };
  return streamCnt++;
}

export function _getFsStreamContext(stream, type) {
  const entry = _streams[stream];
  if (!entry)
    throw new Error(`No '${type}' stream found at stream ${stream}`);
  if (entry.type !== type)
    throw new Error(`Unexpected '${entry.type}' stream found at stream ${stream}, expected '${type}'`);
  return entry.context;
}

export function _dropFsStream(stream) {
  // TODO: recycling?
  delete _streams[stream];
}

export const streams = {
  read(s, len) {
    return streams.blockingRead(s, len);
  },
  blockingRead(s, len) {
    len = Number(len);
    const stream = _streams[s];
    switch (stream?.type) {
      case 'file': {
        const buf = Buffer.alloc(Number(len));
        try {
          const readBytes = fsReadSync(stream.fd, buf, 0, Number(len));
          if (readBytes < Number(len)) {
            return [new Uint8Array(buf.buffer, 0, readBytes), 'ended'];
          }
          return [new Uint8Array(buf.buffer, 0, readBytes), 'open'];
        }
        catch (e) {
          _convertFsError(e);
        }
        break;
      }
    }
    throw null;
  },
  skip(s, _len) {
    console.log(`[streams] Skip ${s}`);
  },
  blockingSkip(s, _len) {
    console.log(`[streams] Blocking skip ${s}`);
  },
  subscribeToInputStream(s) {
    console.log(`[streams] Subscribe to input stream ${s}`);
  },
  dropInputStream(s) {
    delete _streams[s];
  },
  write(s, buf) {
    return streams.blockingWrite(s, buf);
  },
  blockingWrite(s, buf) {
    switch (s) {
      case 0:
        throw new Error(`TODO: write stdin`);
      case 1: {
        process.stdout.write(buf);
        return [BigInt(buf.byteLength), 'ended'];
      }
      case 2: {
        process.stderr.write(buf);
        return [BigInt(buf.byteLength), 'ended'];
      }
      default:
        throw new Error(`TODO: write ${s}`);
    }
  },
  writeZeroes(s, _len) {
    console.log(`[streams] Write zeroes ${s}`);
  },
  blockingWriteZeroes(s, _len) {
    console.log(`[streams] Blocking write zeroes ${s}`);
  },
  splice(s, _src, _len) {
    console.log(`[streams] Splice ${s}`);
  },
  blockingSplice(s, _src, _len) {
    console.log(`[streams] Blocking splice ${s}`);
  },
  forward(s, _src) {
    console.log(`[streams] Forward ${s}`);
  },
  subscribeToOutputStream(s) {
    console.log(`[streams] Subscribe to output stream ${s}`);
  },
  dropOutputStream(s) {
    console.log(`[streams] Drop output stream ${s}`);
  }
};
