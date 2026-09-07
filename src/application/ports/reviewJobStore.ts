import type {
    ReviewJob,
    ReviewStatus
} from "../../domain/review.ts";

export interface ReviewJobStore {
    save(
        job: ReviewJob
    ): Promise<void>;

    findByDeliveryId(
        deliveryId: string
    ): Promise<ReviewJob | null>;

     findByReviewKey(
        reviewKey: string
    ): Promise<ReviewJob | null>;

    updateStatus(
        deliveryId: string,
        status: ReviewStatus,
        error?: string | null
    ): Promise<void>;
}