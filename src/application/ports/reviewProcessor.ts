import type {
    ReviewResult,
    ReviewTrigger,
} from "../../domain/review.ts";

export interface ReviewProcessor {
    process(
        reviewTrigger: ReviewTrigger
    ): Promise<ReviewResult>;
}