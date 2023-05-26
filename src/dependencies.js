import crypto from 'node:crypto';
import { resolve, basename, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { argv0 } from 'node:process';
import { fileURLToPath } from 'url';

export default {
    crypto,
    resolve,
    tmpdir,
    readFile,
    writeFile,
    unlink,
    spawn,
    argv0,
    basename,
    extname,
    dirname,
    mkdir,
    fileURLToPath
}