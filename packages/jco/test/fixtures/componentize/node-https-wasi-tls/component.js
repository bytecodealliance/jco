import https from "node:https";
import http from "node:http";

export async function run(url, body, servername) {
    try {
        return await new Promise((resolve, reject) => {
            const protocol = url.startsWith("http:") ? http : https;
            const request = protocol.request(
                url,
                {
                    method: body ? "POST" : "GET",
                    ...(servername ? { servername } : {}),
                },
                (response) => {
                    let text = "";
                    response.setEncoding("utf8");
                    response.on("data", (chunk) => {
                        text += chunk;
                    });
                    response.once("error", reject);
                    response.once("end", () => resolve({ status: response.statusCode, body: text, error: "" }));
                },
            );
            request.once("error", reject);
            request.end(body);
        });
    } catch (error) {
        return { status: 0, body: "", error: `${error.code ?? "Error"}: ${error.message}` };
    }
}
