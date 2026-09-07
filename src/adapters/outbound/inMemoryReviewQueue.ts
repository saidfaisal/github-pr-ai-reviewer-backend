import type {
    ReviewTrigger,
} from "../../domain/review.ts";

import type {
    ReviewJobStore,
} from "../../application/ports/reviewJobStore.ts";

import type {
    ReviewProcessor,
} from "../../application/ports/reviewProcessor.ts";

import type {
    ReviewQueue,
} from "../../application/ports/reviewQueue.ts";

export class InMemoryReviewQueue
    implements ReviewQueue {

    private readonly queue:
        ReviewTrigger[] = [];

    private workerRunning =
        false;

    private readonly reviewProcessor:
        ReviewProcessor;

    private readonly reviewJobStore:
        ReviewJobStore;

    constructor(
        reviewProcessor: ReviewProcessor,
        reviewJobStore: ReviewJobStore
    ) {
        this.reviewProcessor =
            reviewProcessor;

        this.reviewJobStore =
            reviewJobStore;
    }

    async enqueue(
        reviewTrigger: ReviewTrigger
    ): Promise<void> {
        this.queue.push(
            reviewTrigger
        );

        console.log(
            "[Queue] Review queued:",
            {
                deliveryId:
                    reviewTrigger.deliveryId,

                queueSize:
                    this.queue.length,
            }
        );

        void this.runWorker();
    }

    private runWorker =
        async (): Promise<void> => {
            if (
                this.workerRunning
            ) {
                return;
            }

            this.workerRunning =
                true;

            try {
                while (
                    this.queue.length > 0
                ) {
                    const reviewTrigger =
                        this.queue.shift();

                    if (!reviewTrigger) {
                        continue;
                    }

                    await this.processJob(
                        reviewTrigger
                    );
                }
            } finally {
                this.workerRunning =
                    false;
            }
        };

    private processJob = async (
        reviewTrigger: ReviewTrigger
    ): Promise<void> => {
        try {
            await this.reviewJobStore
                .updateStatus(
                    reviewTrigger.deliveryId,
                    "processing"
                );

            console.log(
                "[Worker] Processing review:",
                {
                    deliveryId:
                        reviewTrigger.deliveryId,
                }
            );

            await this.reviewProcessor
                .process(
                    reviewTrigger
                );

            await this.reviewJobStore
                .updateStatus(
                    reviewTrigger.deliveryId,
                    "completed"
                );

            console.log(
                "[Worker] Review completed:",
                {
                    deliveryId:
                        reviewTrigger.deliveryId,
                }
            );
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "Unknown review error";

            await this.reviewJobStore
                .updateStatus(
                    reviewTrigger.deliveryId,
                    "failed",
                    errorMessage
                );

            console.error(
                "[Worker] Review failed:",
                {
                    deliveryId:
                        reviewTrigger.deliveryId,

                    error:
                        errorMessage,
                }
            );
        }
    };
}