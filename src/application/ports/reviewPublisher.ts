import type {
    PullRequestContext,
    ReviewResult,
} from "../../domain/review.ts";

export interface ReviewPublisher {
    publish(
        pullRequest: PullRequestContext,
        reviewResult: ReviewResult
    ): Promise<void>;
}