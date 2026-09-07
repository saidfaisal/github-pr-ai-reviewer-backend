import {
    createHmac,
    timingSafeEqual,
} from "node:crypto";

import type {
    IncomingMessage,
    ServerResponse,
} from "node:http";

import type {
    EnqueuePullRequestReview,
} from "../../application/useCases/enqueuePullRequestReview.ts";

import {
    SUPPORTED_ACTIONS,
    type ReviewTrigger,
    type SupportedAction,
} from "../../domain/review.ts";

import {
    BodyTooLargeError,
    readRawBody,
    sendJson,
} from "../../infrastructure/http.ts";

type GitHubWebhookDependencies = {
    webhookSecret: string;
    maxBodyBytes: number;
    enqueuePullRequestReview:
        EnqueuePullRequestReview;
};

// TODO:
// Replace this GitHub-delivery tracking
// with durable idempotency storage
// before production deployment.
const SEEN_DELIVERIES =
    new Set<string>();

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
        typeof pullNumber !==
            "number" ||
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
        typeof headSha !==
            "string" ||
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
        sender:
            senderLogin,
    };
};

const verifyGitHubSignature = (
    rawBody: Buffer,
    signature: string,
    webhookSecret: string
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
            webhookSecret
        )
            .update(rawBody)
            .digest("hex");

    const expectedBuffer =
        Buffer.from(
            expectedSignature
        );

    const receivedBuffer =
        Buffer.from(
            signature
        );

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

export const createGitHubWebhookHandler = (
    dependencies:
        GitHubWebhookDependencies
) => {
    const {
        webhookSecret,
        maxBodyBytes,
        enqueuePullRequestReview,
    } = dependencies;

    return async (
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

        // Validate required headers.

        if (
            typeof githubEvent !==
                "string" ||
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

        // Read bounded raw body.

        let rawBody: Buffer;

        try {
            rawBody =
                await readRawBody(
                    request,
                    maxBodyBytes
                );
        } catch (
            error: unknown
        ) {
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

        // Authenticate webhook.

        if (
            !verifyGitHubSignature(
                rawBody,
                githubSignature,
                webhookSecret
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

        // Ignore unsupported GitHub events.

        if (
            githubEvent !==
                "pull_request"
        ) {
            sendJson(
                response,
                200,
                {
                    status:
                        "ignored",

                    reason:
                        "Unsupported GitHub event",
                }
            );

            return;
        }

        // Parse JSON.

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

        // Validate basic payload structure.

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

        // Ignore unsupported PR actions.

        if (
            !isSupportedAction(
                parsedPayload.action
            )
        ) {
            sendJson(
                response,
                200,
                {
                    status:
                        "ignored",

                    reason:
                        "Unsupported pull request action",
                }
            );

            return;
        }

        // Convert GitHub JSON
        // into our domain model.

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

        // Duplicate GitHub delivery.

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

        // Call the APPLICATION.
        //
        // The GitHub adapter does not know
        // which queue implementation is used.

        enqueuePullRequestReview(
            reviewTrigger
        );

        // Only mark it accepted after
        // enqueueing succeeded.
        SEEN_DELIVERIES.add(
            githubDelivery
        );

        sendJson(
            response,
            202,
            {
                status: "queued",
                deliveryId:
                    githubDelivery,
            }
        );
    };
};