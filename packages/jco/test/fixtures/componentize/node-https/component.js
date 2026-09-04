import { get } from "node:https";

function fetchText(url, ca) {
    return new Promise((resolve, reject) => {
        // The fixture certificate names `localhost`; the connection goes to the loopback
        // address, so SNI and identity checks are pinned to the certificate's name.
        const request = get(url, { ca, servername: "localhost" }, (response) => {
            const chunks = [];
            response.setEncoding("utf8");
            response.on("data", (chunk) => chunks.push(chunk));
            response.once("error", reject);
            response.once("end", () => {
                resolve({
                    statusCode: response.statusCode,
                    contentType: response.headers["content-type"],
                    body: chunks.join(""),
                });
            });
        });
        request.once("error", reject);
    });
}

export async function run(url, ca) {
    return fetchText(url, ca);
}
