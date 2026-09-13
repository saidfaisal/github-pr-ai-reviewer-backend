import type {
    PullRequestReader,
} from "../../application/ports/pullRequestReader.ts";

import type {
    ReviewProcessor,
} from "../../application/ports/reviewProcessor.ts";

import {
    buildReviewInput,
} from "../../application/review/buildReviewInput.ts";

import type {
    ReviewTrigger,
} from "../../domain/review.ts";

type FakeReviewProcessorDependencies = {
    pullRequestReader: PullRequestReader;
};

export class FakeReviewProcessor
    implements ReviewProcessor {

    private readonly pullRequestReader:
        PullRequestReader;

    constructor(
        dependencies:
            FakeReviewProcessorDependencies
    ) {
        this.pullRequestReader =
            dependencies.pullRequestReader;
    }

    async process(
        reviewTrigger: ReviewTrigger
    ): Promise<void> {
        const pullRequest =
            await this.pullRequestReader
                .getPullRequest(
                    reviewTrigger
                );

        const reviewInput =
            buildReviewInput(
                pullRequest
            );

        console.log(
            "\n========== REVIEW INPUT ==========\n"
        );

        console.log(
            reviewInput
        );

        console.log(
            "\n======== END REVIEW INPUT ========\n"
        );

        for (
            const file
            of pullRequest.changedFiles
        ) {
            console.log(
                `[review] - ${file.filename}`
            );
        }

        await new Promise<void>(
            (resolve) => {
                setTimeout(
                    resolve,
                    3000
                );
            }
        );
    }
}