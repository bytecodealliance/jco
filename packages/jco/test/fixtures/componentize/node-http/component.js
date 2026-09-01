import { get } from "node:http";

function fetchText(url) {
    return new Promise((resolve, reject) => {
        const request = get(url, (response) => {
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

export async function run(url) {
    return fetchText(url);
}
