import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";

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

const HOST = "127.0.0.1";
const PORT = 3000;

const SUPPORTED_ACTIONS = new Set<SupportedAction>([
    "opened",
    "reopened",
    "synchronize",
]);

// -------------------------------------
// Configuration
// -------------------------------------

const getRequiredEnv = (name: string): string => {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not configured`);
    }

    return value;
};

const WEBHOOK_SECRET = getRequiredEnv(
    "GITHUB_WEBHOOK_SECRET"
);

// -------------------------------------
// Response helper
// -------------------------------------

const sendJson = (
    response: ServerResponse,
    statusCode: number,
    payload: Record<string, unknown>
): void => {
    response.writeHead(statusCode, {
        "Content-Type": "application/json",
    });

    response.end(JSON.stringify(payload));
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
        SUPPORTED_ACTIONS.has(value as SupportedAction)
    );
};

// -------------------------------------
// Payload validation
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

    if (!isSupportedAction(action)) {
        return null;
    }

    if (
        typeof pullNumber !== "number" ||
        !Number.isSafeInteger(pullNumber) ||
        pullNumber <= 0
    ) {
        return null;
    }

    if (
        !isRecord(repository) ||
        typeof repository.full_name !== "string" ||
        repository.full_name.length === 0
    ) {
        return null;
    }

    if (
        !isRecord(pullRequest) ||
        !isRecord(pullRequest.head)
    ) {
        return null;
    }

    const headSha = pullRequest.head.sha;

    if (
        typeof headSha !== "string" ||
        headSha.length === 0
    ) {
        return null;
    }

    const senderLogin =
        isRecord(sender) &&
        typeof sender.login === "string"
            ? sender.login
            : null;

    return {
        deliveryId,
        action,
        repository: repository.full_name,
        pullNumber,
        headSha,
        sender: senderLogin,
    };
};

// -------------------------------------
// Signature verification
// -------------------------------------

const verifyGitHubSignature = (
    rawBody: Buffer,
    signature: string
): boolean => {
    if (!/^sha256=[a-f0-9]{64}$/.test(signature)) {
        return false;
    }

    const expectedSignature =
        "sha256=" +
        createHmac("sha256", WEBHOOK_SECRET)
            .update(rawBody)
            .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(signature);

    if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
    }

    return timingSafeEqual(expectedBuffer, receivedBuffer);
};

// -------------------------------------
// HTTP server
// -------------------------------------

const server = createServer(async (request, response) => {
    console.log(`${request.method} ${request.url}`);

    // GET /health
    if (
        request.method === "GET" &&
        request.url === "/health"
    ) {
        sendJson(response, 200, {
            status: "ok",
        });

        return;
    }

    // Reject unmatched routes.
    if (
        request.method !== "POST" ||
        request.url !== "/webhooks/github"
    ) {
        sendJson(response, 404, {
            error: "Not found",
        });

        return;
    }

    // Validate required headers.
    const githubEvent = request.headers["x-github-event"];
    const githubDelivery = request.headers["x-github-delivery"];
    const githubSignature = request.headers["x-hub-signature-256"];

    if (
        typeof githubEvent !== "string" ||
        typeof githubDelivery !== "string" ||
        typeof githubSignature !== "string"
    ) {
        sendJson(response, 400, {
            error: "Missing required GitHub headers",
        });

        return;
    }

    // Read the original request bytes for signature verification.
    const chunks: Buffer[] = [];

    try {
        for await (const chunk of request) {
            chunks.push(
                Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk)
            );
        }
    } catch {
        if (!response.destroyed) {
            sendJson(response, 400, {
                error: "Unable to read request body",
            });
        }

        return;
    }

    const rawBody = Buffer.concat(chunks);

    // Authenticate before processing the payload.
    if (!verifyGitHubSignature(rawBody, githubSignature)) {
        sendJson(response, 401, {
            error: "Invalid webhook signature",
        });

        return;
    }

    console.log("GitHub Event:", githubEvent);
    console.log("GitHub Delivery:", githubDelivery);

    // Ignore unsupported events.
    if (githubEvent !== "pull_request") {
        sendJson(response, 200, {
            status: "ignored",
            reason: "Unsupported GitHub event",
        });

        return;
    }

    // Parse JSON separately from payload validation.
    let parsedPayload: unknown;

    try {
        parsedPayload = JSON.parse(rawBody.toString("utf8"));
    } catch {
        sendJson(response, 400, {
            error: "Invalid JSON",
        });

        return;
    }

    // Validate the payload structure and action type.
    if (
        !isRecord(parsedPayload) ||
        typeof parsedPayload.action !== "string"
    ) {
        sendJson(response, 400, {
            error: "Invalid pull request payload",
        });

        return;
    }

    // Ignore actions that should not trigger a review.
    if (!isSupportedAction(parsedPayload.action)) {
        sendJson(response, 200, {
            status: "ignored",
            reason: "Unsupported pull request action",
        });

        return;
    }

    // Validate required fields and build the review trigger.
    const reviewTrigger = parseReviewTrigger(
        parsedPayload,
        githubDelivery
    );

    if (reviewTrigger === null) {
        sendJson(response, 400, {
            error: "Invalid pull request payload",
        });

        return;
    }

    console.log("Review trigger:", reviewTrigger);

    sendJson(response, 200, {
        status: "received",
    });
});

server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
});