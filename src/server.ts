import {
    createServer,
    type IncomingMessage,
    type ServerResponse,
} from "node:http";

import {
    createEnqueuePullRequestReview,
} from "./application/useCases/enqueuePullRequestReview.ts";

import {
    createGitHubWebhookHandler,
} from "./adapters/inbound/githubWebhook.ts";

import {
    InMemoryReviewQueue,
} from "./adapters/outbound/inMemoryReviewQueue.ts";

import {
    GITHUB_WEBHOOK_SECRET,
    HOST,
    MAX_BODY_BYTES,
    PORT,
} from "./infrastructure/config.ts";

import {
    sendJson,
} from "./infrastructure/http.ts";

// -------------------------------------
// Dependency wiring
// -------------------------------------

const reviewQueue =
    new InMemoryReviewQueue();

const enqueuePullRequestReview =
    createEnqueuePullRequestReview(
        reviewQueue
    );

const handleGitHubWebhook =
    createGitHubWebhookHandler({
        webhookSecret:
            GITHUB_WEBHOOK_SECRET,

        maxBodyBytes:
            MAX_BODY_BYTES,

        enqueuePullRequestReview,
    });

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
// Server
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