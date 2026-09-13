import type {
    PullRequestContext,
    ReviewTrigger
} from "../../domain/review.ts"

export interface PullRequestReader {
    getPullRequest(
        reviewTrigger: ReviewTrigger
    ): Promise<PullRequestContext>
}