import type {
    ReviewJob,
    ReviewStatus,
} from "../../domain/review.ts";

import type {
    ReviewJobStore,
} from "../../application/ports/reviewJobStore.ts";

export class InMemoryReviewJobStore
    implements ReviewJobStore {

    private readonly jobsByDeliveryId = 
        new Map<string, ReviewJob>();

    private readonly jobsByReviewKey = 
        new Map<string, ReviewJob>();

    async save(
        job: ReviewJob
    ): Promise<void> {
        this.jobsByDeliveryId.set(
            job.trigger.deliveryId,
            job
        );

        this.jobsByReviewKey.set(
            job.reviewKey,
            job
        )
    }

    async findByDeliveryId(
        deliveryId: string
    ): Promise<ReviewJob | null> {
        return (
            this.jobsByDeliveryId.get(
                deliveryId
            ) ?? null
        );
    }

    async findByReviewKey(
    reviewKey: string
    ): Promise<ReviewJob | null> {
        return (
            this.jobsByReviewKey.get(
                reviewKey
            ) ?? null
        );
    }

    async updateStatus(
        deliveryId: string,
        status: ReviewStatus,
        error: string | null = null
    ): Promise<void> {
        const existingJob =
            this.jobsByDeliveryId.get(
                deliveryId
            );

        if (!existingJob) {
            return;
        }

        const updatedJob: ReviewJob = {
            ...existingJob,
            status,
            error,
            updatedAt:
                new Date().toISOString(),
        };

        this.jobsByDeliveryId.set(
            deliveryId,
            updatedJob
        );

        this.jobsByReviewKey.set(
            updatedJob.reviewKey,
            updatedJob
        );
    }
}