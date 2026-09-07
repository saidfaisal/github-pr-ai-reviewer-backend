import type {
    ReviewTrigger,
} from "../../domain/review.ts";

import type {
    ReviewQueue,
} from "../ports/reviewQueue.ts";

export type EnqueuePullRequestReview = (
    reviewTrigger: ReviewTrigger
) => void;

export const createEnqueuePullRequestReview = (
    reviewQueue: ReviewQueue
): EnqueuePullRequestReview => {
    return (
        reviewTrigger: ReviewTrigger
    ): void => {
        reviewQueue.enqueue(
            reviewTrigger
        );
    };
};