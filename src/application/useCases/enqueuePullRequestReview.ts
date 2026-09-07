import type {
    ReviewJob,
    ReviewTrigger,
} from "../../domain/review.ts";

import type {
    ReviewJobStore,
} from "../ports/reviewJobStore.ts";

import type {
    ReviewQueue,
} from "../ports/reviewQueue.ts";

export type EnqueuePullRequestReview = (
    reviewTrigger: ReviewTrigger
) => Promise<void>;

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
    ): Promise<void> => {
        const now =
            new Date().toISOString();

        const job: ReviewJob = {
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
    };
};