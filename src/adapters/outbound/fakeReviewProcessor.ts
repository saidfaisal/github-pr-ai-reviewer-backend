import type {
    ReviewProcessor,
} from "../../application/ports/reviewProcessor.ts";

import type {
    ReviewTrigger,
} from "../../domain/review.ts";

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

export class FakeReviewProcessor
    implements ReviewProcessor {

    async process(
        reviewTrigger: ReviewTrigger
    ): Promise<void> {
        console.log(
            "[Reviewer] Starting review:",
            {
                repository:
                    reviewTrigger.repository,
                pullNumber:
                    reviewTrigger.pullNumber,
                headSha:
                    reviewTrigger.headSha,
            }
        );

        // Simulate slow AI work.
        await sleep(3000);

        console.log(
            "[Reviewer] Review completed:",
            {
                repository:
                    reviewTrigger.repository,
                pullNumber:
                    reviewTrigger.pullNumber,
                headSha:
                    reviewTrigger.headSha,
            }
        );
    }
}