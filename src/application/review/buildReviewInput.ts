import type {
    PullRequestContext,
} from "../../domain/review.ts";

export const buildReviewInput = (
    pullRequest: PullRequestContext
): string => {
    const sections: string[] = [];

    sections.push(
        [
            `Repository: ${pullRequest.repository}`,
            `Pull Request: #${pullRequest.pullNumber}`,
            `Title: ${pullRequest.title}`,
            `Author: ${pullRequest.author ?? "unknown"}`,
            `Base Branch: ${pullRequest.baseBranch}`,
            `Head Branch: ${pullRequest.headBranch}`,
            `Head SHA: ${pullRequest.headSha}`,
        ].join("\n")
    );

    if (pullRequest.body) {
        sections.push(
            [
                "Pull Request Description:",
                pullRequest.body,
            ].join("\n")
        );
    }

    const filesWithPatch =
        pullRequest.changedFiles.filter(
            (file) =>
                file.patch !== null
        );

    sections.push(
        `Changed Files: ${filesWithPatch.length}`
    );

    for (const file of filesWithPatch) {
        sections.push(
            [
                `File: ${file.filename}`,
                `Status: ${file.status}`,
                `Additions: ${file.additions}`,
                `Deletions: ${file.deletions}`,
                `Changes: ${file.changes}`,
                "",
                "Patch:",
                file.patch ?? "",
            ].join("\n")
        );
    }

    return sections.join(
        "\n\n---\n\n"
    );
};