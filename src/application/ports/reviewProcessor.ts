import type {
    ReviewTrigger,
} from "../../domain/review.ts";

export interface ReviewProcessor {
    process(
        reviewTrigger: ReviewTrigger
    ): Promise<void>;
}