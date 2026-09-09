import sqlite, { DatabaseSync, StatementSync, Session, backup, constants } from "node:sqlite";
import * as namespace from "node:sqlite";
export function run() {
    const report = {
        identity: sqlite.DatabaseSync === DatabaseSync && namespace.default === sqlite,
        exports: Object.keys(sqlite).sort(),
        constant: constants.SQLITE_CHANGESET_ABORT,
    };
    let db;
    try {
        db = new DatabaseSync(":memory:");
    } catch (error) {
        return JSON.stringify({ ...report, denied: error.code });
    }
    try {
        report.open = db.isOpen;
        db.exec("CREATE TABLE t(id INTEGER PRIMARY KEY, value TEXT, blob BLOB)");
        const session = db.createSession();
        report.session = session instanceof Session;
        const insert = db.prepare("INSERT INTO t VALUES ($id, ?, ?)");
        report.statement = insert instanceof StatementSync;
        report.insert = insert.run({ id: 1 }, "hello", new Uint8Array([0, 255]));
        insert.run({ id: 2 }, "world", null);
        const stmt = db.prepare("SELECT * FROM t ORDER BY id");
        report.rows = stmt.all().map((r) => ({ ...r, blob: r.blob && Array.from(r.blob) }));
        report.nullPrototype = Object.getPrototypeOf(stmt.get()) === null;
        report.columns = stmt.columns().map((c) => c.name);
        report.source = stmt.sourceSQL;
        report.iterated = [];
        for (const r of stmt.iterate()) {
            report.iterated.push(r.id);
            break;
        }
        report.afterReturn = stmt.all().length;
        stmt.setReturnArrays(true);
        stmt.setReadBigInts(true);
        report.arrayBigInt = String(stmt.get()[0]);
        report.missing = db.prepare("SELECT 1 WHERE 0").get() === undefined;
        db.exec("BEGIN");
        report.transaction = db.isTransaction;
        db.exec("ROLLBACK");
        const target = new DatabaseSync(":memory:");
        target.exec("CREATE TABLE t(id INTEGER PRIMARY KEY, value TEXT, blob BLOB)");
        report.changeset = target.applyChangeset(session.changeset());
        report.copied = target.prepare("SELECT count(*) AS n FROM t").get().n;
        report.patchset = session.patchset().length > 0;
        session.close();
        const tags = db.createTagStore(2);
        report.tag = tags.get`SELECT ${"'; DROP TABLE t; --"} AS value`.value;
        report.tagState = [tags.size, tags.capacity, tags.db === db];
        tags.clear();
        report.cleared = tags.size;
        report.limit = db.limits.column > 0;
        const image = db.serialize();
        const restored = new DatabaseSync(":memory:");
        restored.deserialize(image);
        report.restored = restored.prepare("SELECT count(*) AS n FROM t").get().n;
        restored.close();
        target.close();
        try {
            db.exec("INSERT INTO t(id) VALUES (1)");
        } catch (error) {
            report.sqlError = { name: error.name, code: error.code, errcode: error.errcode, errstr: error.errstr };
        }
        try {
            db.function("f", () => 1);
        } catch (error) {
            report.callback = error.code;
        }
        db.close();
        report.closed = !db.isOpen;
        try {
            stmt.get();
        } catch (error) {
            report.closedStatement = error.code;
        }
        return JSON.stringify(report);
    } finally {
        db[Symbol.dispose]();
    }
}
export async function backupTest(path) {
    const db = new DatabaseSync(":memory:");
    try {
        db.exec("CREATE TABLE backup_data(value); INSERT INTO backup_data VALUES (42)");
        return JSON.stringify({ pages: await backup(db, path) });
    } finally {
        db.close();
    }
}
