import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = 3000;

const supportedActions = [
        "opened",
        "reopened",
        "synchronize"
    ];

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
        const githubEvent = request.headers["x-github-event"];

        const githubDelivery = request.headers["x-github-delivery"];

        console.log("Github Event:", githubEvent);
        console.log("Github Delivery", githubDelivery)

        if (githubEvent !== "pull_request") {
            response.writeHead(200, {
                "Content-Type": "application/json",
            });

            response.end(
                JSON.stringify({
                    status: "ignored",
                    reason: "Unsupported GitHub event",
                })
            );

            return;
        }

        const chunks: Buffer[] = [];

        for await (const chunk of request) {
            chunks.push(
                Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            );
        }

        const rawBody = Buffer.concat(chunks)

        const bodyText = rawBody.toString("utf8")

        try {
            const payload = JSON.parse(bodyText);

            console.log("Parsed payload:");
            console.log(payload)

            response.writeHead(200, {
                "Content-Type": "application/json"
            })

            if (!supportedActions.includes(payload.action)) {
                response.end(
                    JSON.stringify({
                        status: "ignored",
                        reason: "Unsupported GitHub event"
                    })
                )
            } else {
                response.end(
                    JSON.stringify({
                        status: "received"
                    })
                )
            }
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