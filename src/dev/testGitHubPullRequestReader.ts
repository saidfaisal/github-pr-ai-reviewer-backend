import {
    GitHubRestPullRequestReader,
} from "../adapters/outbound/githubRestPullRequestReader.ts";

import {
    GITHUB_TOKEN,
} from "../infrastructure/config.ts";

import type {
    ReviewTrigger,
} from "../domain/review.ts";

const pullRequestReader =
    new GitHubRestPullRequestReader({
        token: GITHUB_TOKEN,
    });

const reviewTrigger: ReviewTrigger = {
    deliveryId:
        "manual-test",

    action:
        "opened",

    repository:
        "saidfaisal/github-pr-ai-reviewer-test",

    pullNumber:
        1,

    headSha:
        "manual-test",

    sender:
        null,
};

const run = async (): Promise<void> => {
    const pullRequest =
        await pullRequestReader.getPullRequest(
            reviewTrigger
        );

    console.log(
        `Repository: ${pullRequest.repository}`
    );

    console.log(
        `PR: #${pullRequest.pullNumber}`
    );

    console.log(
        `Title: ${pullRequest.title}`
    );

    console.log(
        `Author: ${pullRequest.author ?? "unknown"}`
    );

    console.log(
        `Base: ${pullRequest.baseBranch}`
    );

    console.log(
        `Head: ${pullRequest.headBranch}`
    );

    console.log(
        `Head SHA: ${pullRequest.headSha}`
    );

    console.log(
        `Changed files: ${pullRequest.changedFiles.length}`
    );

    for (
        const file
        of pullRequest.changedFiles
    ) {
        console.log(
            `- ${file.filename}`
        );
    }
};

run().catch(
    (error: unknown) => {
        console.error(
            "Failed to read Pull Request:",
            error
        );

        process.exitCode =
            1;
    }
);