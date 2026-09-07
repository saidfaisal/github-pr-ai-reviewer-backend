import type {
    ReviewTrigger,
} from "../../domain/review.ts";

import type {
    ReviewQueue,
} from "../../application/ports/reviewQueue.ts";

const sleep = (
    milliseconds: number
): Promise<void> => {
    return new Promise(
        (resolve) => {
            setTimeout(
                resolve,
                milliseconds
            );
        }
    );
};

export class InMemoryReviewQueue
    implements ReviewQueue {

    private readonly queue:
        ReviewTrigger[] = [];

    private workerRunning =
        false;

    enqueue(
        reviewTrigger: ReviewTrigger
    ): void {
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
                    this.queue.length >
                    0
                ) {
                    const reviewTrigger =
                        this.queue.shift();

                    if (
                        !reviewTrigger
                    ) {
                        continue;
                    }

                    try {
                        await this.processReviewJob(
                            reviewTrigger
                        );
                    } catch (
                        error: unknown
                    ) {
                        console.error(
                            "[Worker] Review failed:",
                            error
                        );
                    }
                }
            } finally {
                this.workerRunning =
                    false;
            }
        };

    private processReviewJob =
        async (
            reviewTrigger:
                ReviewTrigger
        ): Promise<void> => {
            console.log(
                "[Worker] Starting review:",
                {
                    deliveryId:
                        reviewTrigger.deliveryId,

                    repository:
                        reviewTrigger.repository,

                    pullNumber:
                        reviewTrigger.pullNumber,

                    headSha:
                        reviewTrigger.headSha,
                }
            );

            // Temporary fake AI work.
            await sleep(3000);

            console.log(
                "[Worker] Review completed:",
                {
                    deliveryId:
                        reviewTrigger.deliveryId,

                    repository:
                        reviewTrigger.repository,

                    pullNumber:
                        reviewTrigger.pullNumber,

                    headSha:
                        reviewTrigger.headSha,
                }
            );
        };
}