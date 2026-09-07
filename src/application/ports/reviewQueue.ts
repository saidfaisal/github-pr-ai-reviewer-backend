import type {
    ReviewTrigger,
} from "../../domain/review.ts";

export interface ReviewQueue {
    enqueue(
        reviewTrigger: ReviewTrigger
    ): void;
}