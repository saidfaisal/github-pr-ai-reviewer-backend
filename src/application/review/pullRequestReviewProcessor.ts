import {
    buildReviewInput,
} from "./buildReviewInput.ts";

import type {
    PullRequestReader,
} from "../ports/pullRequestReader.ts";

import type {
    ReviewAnalyzer,
} from "../ports/reviewAnalyzer.ts";

import type {
    ReviewProcessor,
} from "../ports/reviewProcessor.ts";

import type {
    ReviewPublisher,
} from "../ports/reviewPublisher.ts";

import type {
    ReviewResult,
    ReviewTrigger,
} from "../../domain/review.ts";

type PullRequestReviewProcessorDependencies = {
    pullRequestReader:
        PullRequestReader;

    reviewAnalyzer:
        ReviewAnalyzer;

    reviewPublisher:
        ReviewPublisher;
};

export class PullRequestReviewProcessor
    implements ReviewProcessor {

    private readonly pullRequestReader:
        PullRequestReader;

    private readonly reviewAnalyzer:
        ReviewAnalyzer;

    private readonly reviewPublisher:
        ReviewPublisher;

    constructor(
        dependencies:
            PullRequestReviewProcessorDependencies
    ) {
        this.pullRequestReader =
            dependencies.pullRequestReader;

        this.reviewAnalyzer =
            dependencies.reviewAnalyzer;

        this.reviewPublisher = 
            dependencies.reviewPublisher
    }

    async process(
        reviewTrigger: ReviewTrigger
    ): Promise<ReviewResult> {
        const pullRequest =
            await this.pullRequestReader
                .getPullRequest(
                    reviewTrigger
                );

        const reviewInput =
            buildReviewInput(
                pullRequest
            );

        const reviewResult =
            await this.reviewAnalyzer
                .analyze(
                    reviewInput
                );

        await this.reviewPublisher
            .publish(
                pullRequest,
                reviewResult
            );

        console.log(
            `[review] PR #${pullRequest.pullNumber} analyzed: ${reviewResult.recommendation}`
        );

        return reviewResult;
    }
}