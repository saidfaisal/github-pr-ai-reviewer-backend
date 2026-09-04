import {
    createHmac,
    timingSafeEqual,
} from "node:crypto";

import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = 3000;

const SUPPORTED_ACTIONS = new Set([
    "opened",
    "reopened",
    "synchronize",
]);

const getRequiredEnv = (
    name: string
): string => {
    const value = process.env[name];

    if (!value) {
        throw new Error(
            `${name} is not configured`
        );
    }

    return value;
};

const WEBHOOK_SECRET = getRequiredEnv(
    "GITHUB_WEBHOOK_SECRET"
);

const verifyGitHubSignature = (
    rawBody: Buffer,
    signature: string
): boolean => {
    if (
        !/^sha256=[a-f0-9]{64}$/.test(
            signature
        )
    ) {
        return false;
    }

    const expectedSignature =
        "sha256=" +
        createHmac(
            "sha256",
            WEBHOOK_SECRET
        )
            .update(rawBody)
            .digest("hex");

    const expectedBuffer =
        Buffer.from(expectedSignature);

    const receivedBuffer =
        Buffer.from(signature);

    return timingSafeEqual(
        expectedBuffer,
        receivedBuffer
    );
};

const server = createServer(
    async (request, response) => {
        console.log(
            `${request.method} ${request.url}`
        );

        // -------------------------------------
        // GET /health
        // -------------------------------------

        if (
            request.method === "GET" &&
            request.url === "/health"
        ) {
            response.writeHead(200, {
                "Content-Type": "application/json",
            });

            response.end(
                JSON.stringify({
                    status: "ok",
                })
            );

            return;
        }

        // -------------------------------------
        // POST /webhooks/github
        // -------------------------------------

        if (
            request.method === "POST" &&
            request.url === "/webhooks/github"
        ) {
            const githubEvent =
                request.headers["x-github-event"];

            const githubDelivery =
                request.headers["x-github-delivery"];

            const githubSignature =
                request.headers["x-hub-signature-256"];

            if (
                typeof githubEvent !== "string" ||
                typeof githubDelivery !== "string" ||
                typeof githubSignature !== "string"
            ) {
                response.writeHead(400, {
                    "Content-Type": "application/json",
                });

                response.end(
                    JSON.stringify({
                        error:
                            "Missing required GitHub headers",
                    })
                );

                return;
            }

            const chunks: Buffer[] = [];

            for await (const chunk of request) {
                chunks.push(
                    Buffer.isBuffer(chunk)
                        ? chunk
                        : Buffer.from(chunk)
                );
            }

            const rawBody =
                Buffer.concat(chunks);

            // -------------------------------------
            // Authenticate first
            // -------------------------------------

            if (
                !verifyGitHubSignature(
                    rawBody,
                    githubSignature
                )
            ) {
                response.writeHead(401, {
                    "Content-Type": "application/json",
                });

                response.end(
                    JSON.stringify({
                        error:
                            "Invalid webhook signature",
                    })
                );

                return;
            }

            console.log(
                "GitHub Event:",
                githubEvent
            );

            console.log(
                "GitHub Delivery:",
                githubDelivery
            );

            // -------------------------------------
            // Event filtering
            // -------------------------------------

            if (
                githubEvent !== "pull_request"
            ) {
                response.writeHead(200, {
                    "Content-Type": "application/json",
                });

                response.end(
                    JSON.stringify({
                        status: "ignored",
                        reason:
                            "Unsupported GitHub event",
                    })
                );

                return;
            }

            const bodyText =
                rawBody.toString("utf8");

            try {
                const payload =
                    JSON.parse(bodyText);

                console.log(
                    "Parsed payload:"
                );

                console.log(payload);

                if (
                    !SUPPORTED_ACTIONS.has(
                        payload.action
                    )
                ) {
                    response.writeHead(200, {
                        "Content-Type":
                            "application/json",
                    });

                    response.end(
                        JSON.stringify({
                            status: "ignored",
                            reason:
                                "Unsupported pull request action",
                        })
                    );

                    return;
                }

                response.writeHead(200, {
                    "Content-Type":
                        "application/json",
                });

                response.end(
                    JSON.stringify({
                        status: "received",
                    })
                );
            } catch {
                response.writeHead(400, {
                    "Content-Type":
                        "application/json",
                });

                response.end(
                    JSON.stringify({
                        error: "Invalid JSON",
                    })
                );
            }

            return;
        }

        // -------------------------------------
        // 404
        // -------------------------------------

        response.writeHead(404, {
            "Content-Type": "application/json",
        });

        response.end(
            JSON.stringify({
                error: "Not found",
            })
        );
    }
);

server.listen(PORT, HOST, () => {
    console.log(
        `Server running at http://${HOST}:${PORT}`
    );
});