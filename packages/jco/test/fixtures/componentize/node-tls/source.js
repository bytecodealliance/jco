import tls, { connect, createServer, createSecureContext } from "node:tls";
import { Buffer } from "node:buffer";
import https from "node:https";

// Adapted from Node's tls.connect/createServer examples: PEM material and a finite
// input replace filesystem reads and process.stdin, so the guest needs only TLS.
export async function run(key, cert) {
    const server = createServer({ key, cert, requestCert: true, ca: [cert], ALPNProtocols: ["echo"] }, (socket) => {
        socket.write("welcome!\n");
        socket.pipe(socket);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const secureContext = createSecureContext({ key, cert, ca: [cert] });
    let inspection;
    const client = connect(
        port,
        "127.0.0.1",
        { secureContext, servername: "localhost", ALPNProtocols: ["echo"] },
        () => {
            const peer = client.getPeerCertificate(true);
            inspection = {
                buffer: Buffer.isBuffer(client.getSession()),
                authorized: client.authorized,
                alpn: client.alpnProtocol,
                encrypted: client.encrypted,
                protocol: client.getProtocol(),
                cipher: Boolean(client.getCipher().name),
                certificate: Boolean(peer.raw.length),
                issuerCycle: peer.issuerCertificate === peer,
                verified: tls.checkServerIdentity("localhost", peer) === undefined,
                mismatch: tls.checkServerIdentity("wrong.example", peer).code,
                keyingMaterial: client.exportKeyingMaterial(32, "component example").length,
                maxFragment: client.setMaxSendFragment(1024),
                localPort: client.localPort > 0,
                remotePort: client.remotePort === port,
            };
            client.end("hello from a component\n");
        },
    );
    client.setEncoding("utf8");
    let echo = "";
    client.on("data", (data) => {
        echo += data;
    });
    try {
        await new Promise((resolve, reject) => {
            client.on("end", resolve);
            client.on("error", reject);
        });
    } finally {
        client.destroy();
        await new Promise((resolve) => server.close(resolve));
    }
    return JSON.stringify({
        echo,
        inspection,
        ticketKeys: server.getTicketKeys().length,
        identities: tls.connect === connect && tls.createServer === createServer,
        ciphers: tls.getCiphers().length > 0,
        roots: tls.rootCertificates.length > 0,
    });
}

export function denied() {
    try {
        tls.createSecureContext();
    } catch (error) {
        return error.code;
    }
    return "unexpected success";
}

let result = "";
export function start(key, cert) {
    void run(key, cert).then(
        (value) => {
            result = value;
        },
        (error) => {
            result = JSON.stringify({ error: String(error), stack: error.stack });
        },
    );
}
export function status() {
    return result;
}

let httpsServer;

export function startHttps(key, cert) {
    httpsServer = https.createServer({ key, cert }, (_request, response) => response.end("component HTTPS"));
    httpsServer.listen(0, "127.0.0.1");
    return httpsServer.address().port;
}

export function stopHttps() {
    httpsServer.close();
}

export function fetchHttps(port, cert) {
    return new Promise((resolve, reject) => {
        const request = https.get({ hostname: "127.0.0.1", port, servername: "localhost", ca: [cert] }, (response) => {
            let text = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
                text += chunk;
            });
            response.on("end", () => resolve(text));
            response.on("error", reject);
        });
        request.on("error", reject);
    });
}
