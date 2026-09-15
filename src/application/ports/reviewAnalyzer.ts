import type {
    ReviewResult,
} from "../../domain/review.ts";

export interface ReviewAnalyzer {
    analyze(
        reviewInput: string
    ): Promise<ReviewResult>;
}