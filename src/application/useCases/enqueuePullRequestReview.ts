import {
    createReviewKey,
    type ReviewJob,
    type ReviewTrigger,
} from "../../domain/review.ts";

import type {
    ReviewJobStore,
} from "../ports/reviewJobStore.ts";

import type {
    ReviewQueue,
} from "../ports/reviewQueue.ts";

export type EnqueuePullRequestReviewResult =
    | {
        status: "queued";
        reviewKey: string;
    }
    | {
        status: "duplicate";
        reviewKey: string;
    };

export type EnqueuePullRequestReview = (
    reviewTrigger: ReviewTrigger
) => Promise<EnqueuePullRequestReviewResult>;

type Dependencies = {
    reviewQueue: ReviewQueue;
    reviewJobStore: ReviewJobStore;
};

export const createEnqueuePullRequestReview = (
    dependencies: Dependencies
): EnqueuePullRequestReview => {
    const {
        reviewQueue,
        reviewJobStore,
    } = dependencies;

    return async (
        reviewTrigger: ReviewTrigger
    ): Promise<EnqueuePullRequestReviewResult> => {
        const reviewKey =
            createReviewKey({
                repository:
                    reviewTrigger.repository,

                pullNumber:
                    reviewTrigger.pullNumber,

                headSha:
                    reviewTrigger.headSha,
            });

        const existingJob =
            await reviewJobStore
                .findByReviewKey(
                    reviewKey
                );

        if (existingJob) {
            return {
                status: "duplicate",
                reviewKey,
            };
        }

        const now =
            new Date().toISOString();

        const job: ReviewJob = {
            reviewKey,
            trigger:
                reviewTrigger,
            status:
                "queued",
            error:
                null,
            createdAt:
                now,
            updatedAt:
                now,
        };

        await reviewJobStore.save(
            job
        );

        await reviewQueue.enqueue(
            reviewTrigger
        );

        return {
            status: "queued",
            reviewKey,
        };
    };
};