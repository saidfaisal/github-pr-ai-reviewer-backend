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
    InMemoryReviewJobStore,
} from "./adapters/outbound/inMemoryReviewJobStore.ts";

import {
    FakeReviewProcessor,
} from "./adapters/outbound/fakeReviewProcessor.ts";

import {
    createGetReviewJob,
} from "./application/useCases/getReviewJob.ts";

import {
    createReviewStatusHandler,
} from "./adapters/inbound/reviewStatus.ts";

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

const reviewJobStore =
    new InMemoryReviewJobStore();

const reviewProcessor =
    new FakeReviewProcessor();

const reviewQueue =
    new InMemoryReviewQueue(
        reviewProcessor,
        reviewJobStore
    );

const enqueuePullRequestReview =
    createEnqueuePullRequestReview({
        reviewQueue,
        reviewJobStore,
    });
const handleGitHubWebhook =
    createGitHubWebhookHandler({
        webhookSecret:
            GITHUB_WEBHOOK_SECRET,

        maxBodyBytes:
            MAX_BODY_BYTES,

        enqueuePullRequestReview,
    });

const getReviewJob =
    createGetReviewJob(
        reviewJobStore
    );

const handleReviewStatus =
    createReviewStatusHandler({
        getReviewJob,
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

    const url =
        new URL(
            request.url ?? "/",
            `http://${HOST}`
        );

    // -------------------------------------
    // Health
    // -------------------------------------

    if (
        request.method === "GET" &&
        url.pathname === "/health"
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

    // -------------------------------------
    // GitHub webhook
    // -------------------------------------

    if (
        request.method === "POST" &&
        url.pathname ===
            "/webhooks/github"
    ) {
        await handleGitHubWebhook(
            request,
            response
        );

        return;
    }

    // -------------------------------------
    // Review status
    // -------------------------------------

    const reviewStatusMatch =
        url.pathname.match(
            /^\/reviews\/([^/]+)$/
        );

    if (
        request.method === "GET" &&
        reviewStatusMatch
    ) {
        const deliveryId =
            decodeURIComponent(
                reviewStatusMatch[1]
            );

        await handleReviewStatus(
            deliveryId,
            response
        );

        return;
    }

    // -------------------------------------
    // Not found
    // -------------------------------------

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