import {
    createHmac,
    timingSafeEqual,
} from "node:crypto";

import {
    createServer,
    type IncomingMessage,
    type ServerResponse,
} from "node:http";

// -------------------------------------
// Types
// -------------------------------------

type SupportedAction =
    | "opened"
    | "reopened"
    | "synchronize";

type ReviewTrigger = {
    deliveryId: string;
    action: SupportedAction;
    repository: string;
    pullNumber: number;
    headSha: string;
    sender: string | null;
};

// -------------------------------------
// Constants
// -------------------------------------

const HOST = "127.0.0.1";
const PORT = 3000;

const MAX_BODY_BYTES =
    2 * 1024 * 1024;

const SUPPORTED_ACTIONS =
    new Set<SupportedAction>([
        "opened",
        "reopened",
        "synchronize",
    ]);

// TODO:
// Replace in-memory delivery tracking
// with durable idempotency storage
// before production deployment.
const SEEN_DELIVERIES =
    new Set<string>();

// -------------------------------------
// Errors
// -------------------------------------

class BodyTooLargeError extends Error {
    constructor() {
        super(
            "Request body exceeds maximum size"
        );

        this.name =
            "BodyTooLargeError";
    }
}

// -------------------------------------
// Configuration
// -------------------------------------

const getRequiredEnv = (
    name: string
): string => {
    const value =
        process.env[name]?.trim();

    if (!value) {
        throw new Error(
            `${name} is not configured`
        );
    }

    return value;
};

const WEBHOOK_SECRET =
    getRequiredEnv(
        "GITHUB_WEBHOOK_SECRET"
    );

// -------------------------------------
// HTTP helpers
// -------------------------------------

const sendJson = (
    response: ServerResponse,
    statusCode: number,
    payload: Record<string, unknown>
): void => {
    const body =
        JSON.stringify(payload);

    response.writeHead(
        statusCode,
        {
            "Content-Type":
                "application/json; charset=utf-8",

            "Content-Length":
                Buffer.byteLength(body),
        }
    );

    response.end(body);
};

const readRawBody = async (
    request: IncomingMessage,
    maxBodyBytes: number
): Promise<Buffer> => {
    const contentLength =
        request.headers[
            "content-length"
        ];

    if (
        typeof contentLength === "string"
    ) {
        const declaredBytes =
            Number(contentLength);

        if (
            Number.isFinite(
                declaredBytes
            ) &&
            declaredBytes >
                maxBodyBytes
        ) {
            throw new BodyTooLargeError();
        }
    }

    const chunks: Buffer[] = [];

    let totalBytes = 0;
    let bodyTooLarge = false;

    for await (
        const chunk of request
    ) {
        const buffer =
            Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(chunk);

        totalBytes +=
            buffer.length;

        if (
            totalBytes >
            maxBodyBytes
        ) {
            bodyTooLarge = true;

            continue;
        }

        chunks.push(buffer);
    }

    if (bodyTooLarge) {
        throw new BodyTooLargeError();
    }

    return Buffer.concat(
        chunks,
        totalBytes
    );
};

// -------------------------------------
// Type guards
// -------------------------------------

const isRecord = (
    value: unknown
): value is Record<string, unknown> => {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
};

const isSupportedAction = (
    value: unknown
): value is SupportedAction => {
    return (
        typeof value === "string" &&
        SUPPORTED_ACTIONS.has(
            value as SupportedAction
        )
    );
};

// -------------------------------------
// GitHub payload validation
// -------------------------------------

const parseReviewTrigger = (
    value: unknown,
    deliveryId: string
): ReviewTrigger | null => {
    if (!isRecord(value)) {
        return null;
    }

    const {
        action,
        number: pullNumber,
        repository,
        pull_request: pullRequest,
        sender,
    } = value;

    if (
        !isSupportedAction(action)
    ) {
        return null;
    }

    if (
        typeof pullNumber !== "number" ||
        !Number.isSafeInteger(
            pullNumber
        ) ||
        pullNumber <= 0
    ) {
        return null;
    }

    if (
        !isRecord(repository) ||
        typeof repository.full_name !==
            "string" ||
        repository.full_name.length ===
            0
    ) {
        return null;
    }

    if (
        !isRecord(pullRequest) ||
        !isRecord(
            pullRequest.head
        )
    ) {
        return null;
    }

    const headSha =
        pullRequest.head.sha;

    if (
        typeof headSha !== "string" ||
        headSha.length === 0
    ) {
        return null;
    }

    const senderLogin =
        isRecord(sender) &&
        typeof sender.login ===
            "string"
            ? sender.login
            : null;

    return {
        deliveryId,
        action,
        repository:
            repository.full_name,
        pullNumber,
        headSha,
        sender: senderLogin,
    };
};

// -------------------------------------
// GitHub signature verification
// -------------------------------------

const verifyGitHubSignature = (
    rawBody: Buffer,
    signature: string
): boolean => {
    const isValidFormat =
        /^sha256=[a-f0-9]{64}$/.test(
            signature
        );

    if (!isValidFormat) {
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
        Buffer.from(
            expectedSignature
        );

    const receivedBuffer =
        Buffer.from(signature);

    if (
        expectedBuffer.length !==
        receivedBuffer.length
    ) {
        return false;
    }

    return timingSafeEqual(
        expectedBuffer,
        receivedBuffer
    );
};

// -------------------------------------
// GitHub webhook handler
// -------------------------------------

const handleGitHubWebhook = async (
    request: IncomingMessage,
    response: ServerResponse
): Promise<void> => {
    const githubEvent =
        request.headers[
            "x-github-event"
        ];

    const githubDelivery =
        request.headers[
            "x-github-delivery"
        ];

    const githubSignature =
        request.headers[
            "x-hub-signature-256"
        ];

    // -------------------------------------
    // Validate required headers
    // -------------------------------------

    if (
        typeof githubEvent !== "string" ||
        typeof githubDelivery !==
            "string" ||
        typeof githubSignature !==
            "string"
    ) {
        sendJson(
            response,
            400,
            {
                error:
                    "Missing required GitHub headers",
            }
        );

        return;
    }

    // -------------------------------------
    // Read bounded raw request body
    // -------------------------------------

    let rawBody: Buffer;

    try {
        rawBody =
            await readRawBody(
                request,
                MAX_BODY_BYTES
            );
    } catch (error: unknown) {
        if (
            error instanceof
            BodyTooLargeError
        ) {
            sendJson(
                response,
                413,
                {
                    error:
                        "Webhook payload is too large",
                }
            );

            return;
        }

        throw error;
    }

    // -------------------------------------
    // Authenticate webhook
    // -------------------------------------

    if (
        !verifyGitHubSignature(
            rawBody,
            githubSignature
        )
    ) {
        sendJson(
            response,
            401,
            {
                error:
                    "Invalid webhook signature",
            }
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
    // Filter GitHub event type
    // -------------------------------------

    if (
        githubEvent !==
        "pull_request"
    ) {
        sendJson(
            response,
            200,
            {
                status: "ignored",
                reason:
                    "Unsupported GitHub event",
            }
        );

        return;
    }

    // -------------------------------------
    // Parse JSON
    // -------------------------------------

    let parsedPayload: unknown;

    try {
        parsedPayload =
            JSON.parse(
                rawBody.toString(
                    "utf8"
                )
            );
    } catch {
        sendJson(
            response,
            400,
            {
                error:
                    "Invalid JSON",
            }
        );

        return;
    }

    // -------------------------------------
    // Validate basic payload structure
    // -------------------------------------

    if (
        !isRecord(
            parsedPayload
        ) ||
        typeof parsedPayload.action !==
            "string"
    ) {
        sendJson(
            response,
            400,
            {
                error:
                    "Invalid pull request payload",
            }
        );

        return;
    }

    // -------------------------------------
    // Filter supported PR actions
    // -------------------------------------

    if (
        !isSupportedAction(
            parsedPayload.action
        )
    ) {
        sendJson(
            response,
            200,
            {
                status: "ignored",
                reason:
                    "Unsupported pull request action",
            }
        );

        return;
    }

    // -------------------------------------
    // Build validated review trigger
    // -------------------------------------

    const reviewTrigger =
        parseReviewTrigger(
            parsedPayload,
            githubDelivery
        );

    if (
        reviewTrigger === null
    ) {
        sendJson(
            response,
            400,
            {
                error:
                    "Invalid pull request payload",
            }
        );

        return;
    }

    // -------------------------------------
    // Duplicate delivery protection
    // -------------------------------------

    if (
        SEEN_DELIVERIES.has(
            githubDelivery
        )
    ) {
        sendJson(
            response,
            200,
            {
                status:
                    "duplicate",
            }
        );

        return;
    }

    SEEN_DELIVERIES.add(
        githubDelivery
    );

    // -------------------------------------
    // Review trigger accepted
    // -------------------------------------

    console.log(
        "Review trigger:",
        reviewTrigger
    );

    sendJson(
        response,
        200,
        {
            status:
                "received",
        }
    );
};

// -------------------------------------
// Routing
// -------------------------------------

const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse
): Promise<void> => {
    console.log(
        `${request.method} ${request.url}`
    );

    if (
        request.method === "GET" &&
        request.url === "/health"
    ) {
        sendJson(
            response,
            200,
            {
                status: "ok",
            }
        );

        return;
    }

    if (
        request.method === "POST" &&
        request.url ===
            "/webhooks/github"
    ) {
        await handleGitHubWebhook(
            request,
            response
        );

        return;
    }

    sendJson(
        response,
        404,
        {
            error: "Not found",
        }
    );
};

// -------------------------------------
// Server lifecycle
// -------------------------------------

const server =
    createServer(
        (
            request,
            response
        ) => {
            void handleRequest(
                request,
                response
            ).catch(
                (
                    error: unknown
                ) => {
                    console.error(
                        "Unhandled request error:",
                        error
                    );

                    if (
                        !response.headersSent &&
                        !response.destroyed
                    ) {
                        sendJson(
                            response,
                            500,
                            {
                                error:
                                    "Internal server error",
                            }
                        );

                        return;
                    }

                    if (
                        !response.destroyed
                    ) {
                        response.end();
                    }
                }
            );
        }
    );

server.listen(
    PORT,
    HOST,
    () => {
        console.log(
            `Server running at http://${HOST}:${PORT}`
        );
    }
);