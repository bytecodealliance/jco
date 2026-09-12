import vfs, { create, MemoryProvider, RealFSProvider, VirtualProvider } from "node:vfs";
import * as namespace from "node:vfs";
import { Buffer } from "node:buffer";

function exerciseSync(fs) {
    fs.mkdirSync("/dir/sub", { recursive: true });
    fs.writeFileSync("/dir/sub/file", "hello");
    fs.appendFileSync("/dir/sub/file", " world");
    const sync = fs.readFileSync("/dir/sub/file", "utf8");
    const fd = fs.openSync("/dir/sub/file", "r+");
    const bytes = Buffer.alloc(5);
    fs.readSync(fd, bytes, 0, 5, 6);
    fs.writeSync(fd, Buffer.from("H"), 0, 1, 0);
    const descriptorSize = fs.fstatSync(fd).size;
    fs.closeSync(fd);
    fs.copyFileSync("/dir/sub/file", "/dir/copied");
    fs.renameSync("/dir/copied", "/dir/moved");
    fs.linkSync("/dir/moved", "/dir/hardlink");
    fs.symlinkSync("sub/file", "/dir/link");
    const realpath = fs.realpathSync("/dir/link");
    const symlink = fs.lstatSync("/dir/link").isSymbolicLink();
    const readlink = fs.readlinkSync("/dir/link");
    const directory = fs.opendirSync("/dir/sub");
    const directoryEntry = directory.readSync().name;
    directory.closeSync();
    const listing = fs.readdirSync("/dir").sort();
    fs.truncateSync("/dir/sub/file", 5);
    const truncated = fs.readFileSync("/dir/sub/file", "utf8");
    const temp = fs.mkdtempSync("/temp-");
    const temporary = fs.statSync(temp).isDirectory();
    fs.rmdirSync(temp);
    let missing;
    try {
        fs.readFileSync("/missing");
    } catch (error) {
        missing = error.code;
    }
    fs.rmSync("/dir", { recursive: true });
    return {
        sync,

        bytes: bytes.toString(),
        descriptorSize,
        realpath,
        symlink,
        readlink,
        directoryEntry,
        listing,
        truncated,
        temporary,
        missing,
        removed: !fs.existsSync("/dir"),
    };
}

async function exercise(fs) {
    const report = exerciseSync(fs);
    await fs.promises.writeFile("/async", "hello world");
    const callback = await new Promise((resolve, reject) => {
        fs.readFile("/async", "utf8", (error, data) => (error ? reject(error) : resolve(data)));
    });
    const promise = await fs.promises.readFile("/async", "utf8");
    await fs.promises.unlink("/async");
    return { ...report, callback, promise };
}

async function memoryReport() {
    const provider = new MemoryProvider();
    const fs = create(provider);
    const report = await exercise(fs);
    fs.writeFileSync("/retained", "memory");
    provider.setReadOnly();
    let readOnlyError;
    try {
        fs.writeFileSync("/retained", "changed");
    } catch (error) {
        readOnlyError = error.code;
    }
    return JSON.stringify({
        ...report,
        namespace: vfs.create === create && namespace.MemoryProvider === MemoryProvider,
        provider: provider instanceof VirtualProvider,
        isolated: !vfs.create().existsSync("/retained"),
        readOnlyError,
    });
}

async function filesystemReport(root) {
    const fs = create(new RealFSProvider(root));
    const report = await exercise(fs);
    fs.writeFileSync("/placement.txt", "vfs contents");
    return JSON.stringify(report);
}

export function denied() {
    try {
        create(new RealFSProvider("/denied")).readFileSync("/file");
    } catch (error) {
        return error.code;
    }
    return "unexpected success";
}

let report = "";

function start(operation) {
    report = "";
    operation().then(
        (value) => {
            report = value;
        },
        (error) => {
            report = JSON.stringify({ error: String(error), stack: error.stack });
        },
    );
}

export function startMemory() {
    start(memoryReport);
}

export function startFilesystem(root) {
    start(() => filesystemReport(root));
}

export function takeReport() {
    return report;
}

export function syncMemory() {
    return JSON.stringify(exerciseSync(create()));
}

export function syncFilesystem(root) {
    const fs = create(new RealFSProvider(root));
    const report = exerciseSync(fs);
    fs.writeFileSync("/placement.txt", "vfs contents");
    return JSON.stringify(report);
}
