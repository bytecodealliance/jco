import { buffer as consumeBuffer, json as consumeJson, text as consumeText } from "node:stream/consumers";
import {
    Broadcast,
    Share,
    array,
    broadcast,
    bytes,
    from,
    fromSync,
    pipeTo,
    pull,
    push,
    share,
    tap,
    text,
    textSync,
    toReadable,
    toStreamable,
} from "node:stream/iter";

const decoder = new TextDecoder();

export async function run() {
    const consumedText = await consumeText([new Uint8Array([65, 226, 130]), new Uint8Array([172]), "!"]);
    const consumedJson = await consumeJson(['{"value":', "24}"]);
    const consumedBuffer = await consumeBuffer(["buffer"]);

    const syncText = textSync(fromSync(["sync", new Uint8Array([33])]));
    const protocolText = textSync(fromSync({ [toStreamable]: () => ["protocol"] }));
    const sourceBytes = await bytes(from(["iter", new Uint8Array([33])]));
    const chunks = await array(from(["a", "b"]));

    const tapped = [];
    const transformed = await text(
        pull(
            from("component"),
            tap((batch) => {
                tapped.push(batch === null ? 0 : batch.length);
            }),
            (batch) =>
                batch?.map((chunk) => chunk.map((byte) => (byte >= 97 && byte <= 122 ? byte - 32 : byte))) ?? null,
            (batch) => (batch === null ? "!" : batch),
        ),
    );

    const written = [];
    const writtenBytes = await pipeTo(from(["pipe", "d"]), {
        async write(chunk) {
            written.push(chunk);
        },
        async writev(batch) {
            written.push(...batch);
        },
        async end() {
            return 0;
        },
    });

    const pushed = push();
    const pushedText = text(pushed.readable);
    await pushed.writer.write("push");
    await pushed.writer.end();

    const broadcasted = broadcast();
    const broadcastFirst = text(broadcasted.broadcast.push());
    const broadcastSecond = text(broadcasted.broadcast.push());
    await broadcasted.writer.write("broadcast");
    await broadcasted.writer.end();

    const shared = share(from("share"));
    const sharedValues = await Promise.all([text(shared.pull()), text(shared.pull())]);

    let unsupportedCode = "";
    try {
        toReadable(
            new Proxy(
                {},
                {
                    get: () => {
                        throw new Error("input touched");
                    },
                },
            ),
        );
    } catch (error) {
        unsupportedCode = error.code;
    }

    return JSON.stringify({
        consumedText,
        consumedJson: consumedJson.value,
        consumedBuffer: consumedBuffer.toString(),
        syncText,
        protocolText,
        sourceBytes: decoder.decode(sourceBytes),
        arrayChunks: chunks.length,
        transformed,
        tapped: tapped.join(","),
        written: decoder.decode(Uint8Array.from(written.flatMap((chunk) => [...chunk]))),
        writtenBytes,
        pushed: await pushedText,
        broadcast: await Promise.all([broadcastFirst, broadcastSecond]),
        shared: sharedValues,
        classStatics: typeof Broadcast.from === "function" && typeof Share.from === "function",
        unsupportedCode,
    });
}
