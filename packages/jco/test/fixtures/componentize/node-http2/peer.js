import http2 from "node:http2";
import { argv, stdout } from "node:process";

if (argv[2] === "server") {
    const server = http2.createServer();
    server.on("stream", (stream, headers) => {
        const chunks = [];
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => {
            stream.respond({ ":status": 201, "content-type": "text/plain" });
            const body = chunks.join("");
            stream.end(
                headers[":path"] === "/large"
                    ? `large:${headers[":method"]}:${headers[":path"]}:${body.length}:${body[0]}:${body.at(-1)}`
                    : `local:${headers[":method"]}:${headers[":path"]}:${body}`,
            );
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    stdout.write(`${server.address().port}\n`);
} else if (argv[2] === "request") {
    const session = http2.connect(argv[3]);
    const stream = session.request({ ":method": "POST", ":path": argv[4] });
    const chunks = [];
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.end(argv[5]);
    await new Promise((resolve, reject) => {
        stream.once("end", resolve);
        stream.once("error", reject);
        session.once("error", reject);
    });
    session.close();
    stdout.write(chunks.join(""));
} else {
    throw new Error(`Unknown peer mode: ${argv[2]}`);
}
