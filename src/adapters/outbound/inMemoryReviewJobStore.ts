import type {
    ReviewJob,
    ReviewStatus,
} from "../../domain/review.ts";

import type {
    ReviewJobStore,
} from "../../application/ports/reviewJobStore.ts";

export class InMemoryReviewJobStore
    implements ReviewJobStore {

    private readonly jobs =
        new Map<string, ReviewJob>();

    async save(
        job: ReviewJob
    ): Promise<void> {
        this.jobs.set(
            job.trigger.deliveryId,
            job
        );
    }

    async findByDeliveryId(
        deliveryId: string
    ): Promise<ReviewJob | null> {
        return (
            this.jobs.get(
                deliveryId
            ) ?? null
        );
    }

    async updateStatus(
        deliveryId: string,
        status: ReviewStatus,
        error: string | null = null
    ): Promise<void> {
        const existingJob =
            this.jobs.get(
                deliveryId
            );

        if (!existingJob) {
            return;
        }

        this.jobs.set(
            deliveryId,
            {
                ...existingJob,
                status,
                error,
                updatedAt:
                    new Date().toISOString(),
            }
        );
    }
}