import type {
    ReviewJob,
} from "../../domain/review.ts";

import type {
    ReviewJobStore,
} from "../ports/reviewJobStore.ts";

export type GetReviewJob = (
    deliveryId: string
) => Promise<ReviewJob | null>;

export const createGetReviewJob = (
    reviewJobStore: ReviewJobStore
): GetReviewJob => {
    return async (
        deliveryId: string
    ): Promise<ReviewJob | null> => {
        return reviewJobStore
            .findByDeliveryId(
                deliveryId
            );
    };
};