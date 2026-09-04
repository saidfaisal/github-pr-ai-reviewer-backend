import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = 3000;

const server = createServer(async (request, response) => {
    console.log(
        `${request.method} ${request.url}`
    );

    if(
        request.method === "GET" && 
        request.url === "/health"
    ) {
        response.writeHead(200, {
            "Content-Type": "application/json"
        });

        response.end(
            JSON.stringify({
                status: "ok"
            })
        );

        return;
    }

    // -------------------------------------
    // POST /webhooks/github
    // -------------------------------------

    if(
        request.method === "POST" &&
        request.url === "/webhooks/github"
    ) {
        const chunks: Buffer[] = [];

        for await (const chunk of request) {
            chunks.push(
                Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            );
        }

        const rawBody = Buffer.concat(chunks)

        const bodyText = rawBody.toString("utf8")

        console.log("Raw body:");
        console.log(bodyText)

        try {
            const payload = JSON.parse(bodyText);

            console.log("Parsed payload:");
            console.log(payload)

            response.writeHead(200, {
                "Content-Type": "application/json"
            })

            response.end(
                JSON.stringify({
                    status: "received"
                })
            )
        } catch {
            response.writeHead(400, {
                "Content-Type": "application/json"
            })

            response.end(
                JSON.stringify({
                    error: "Invalid JSON"
                })
            )
        }

        return;
    }

    response.writeHead(404, {
        "Content-Type": "application/json"
    })

    response.end(
        JSON.stringify({
            error: "Not found"
        })
    )
})

server.listen(PORT, HOST, () => {
    console.log(
        `Server running at http://${HOST}:${PORT}`
    )
})