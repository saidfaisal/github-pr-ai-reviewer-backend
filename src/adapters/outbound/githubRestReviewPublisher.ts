import type {
    ReviewPublisher,
} from "../../application/ports/reviewPublisher.ts";

import type {
    PullRequestContext,
    ReviewResult,
} from "../../domain/review.ts";

type GitHubRestReviewPublisherDependencies = {
    token: string;
};

export class GitHubRestReviewPublisher
    implements ReviewPublisher {

    private readonly token: string;

    constructor(
        dependencies:
            GitHubRestReviewPublisherDependencies
    ) {
        this.token =
            dependencies.token;
    }

    async publish(
        pullRequest: PullRequestContext,
        reviewResult: ReviewResult
    ): Promise<void> {
        const {
            owner,
            repositoryName,
        } = this.parseRepository(
            pullRequest.repository
        );

        const url =
            `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/pulls/${pullRequest.pullNumber}/reviews`;

        const body =
            this.buildReviewBody(
                reviewResult
            );

        const response =
            await fetch(
                url,
                {
                    method:
                        "POST",

                    headers:
                        this.createHeaders(),

                    body:
                        JSON.stringify({
                            commit_id:
                                pullRequest.headSha,

                            body,

                            event:
                                "COMMENT",
                        }),
                }
            );

        if (!response.ok) {
            const responseBody =
                await response.text();

            throw new Error(
                [
                    "GitHub review publish failed.",
                    `Status: ${response.status}`,
                    `Response: ${responseBody}`,
                ].join(" ")
            );
        }
    }

    private parseRepository = (
        repository: string
    ): {
        owner: string;
        repositoryName: string;
    } => {
        const parts =
            repository.split("/");

        if (parts.length !== 2) {
            throw new Error(
                `Invalid repository name: ${repository}`
            );
        }

        const [
            owner,
            repositoryName,
        ] = parts;

        if (
            !owner ||
            !repositoryName
        ) {
            throw new Error(
                `Invalid repository name: ${repository}`
            );
        }

        return {
            owner,
            repositoryName,
        };
    };

    private createHeaders = (): HeadersInit => {
        return {
            Accept:
                "application/vnd.github+json",

            Authorization:
                `Bearer ${this.token}`,

            "Content-Type":
                "application/json",

            "X-GitHub-Api-Version":
                "2026-03-10",

            "User-Agent":
                "github-pr-ai-reviewer",
        };
    };

    private buildReviewBody = (
        reviewResult: ReviewResult
    ): string => {
        const sections:
            string[] = [];

        sections.push(
            [
                "## AI Code Review",
                "",
                `**Recommendation:** ${reviewResult.recommendation}`,
                "",
                reviewResult.summary,
            ].join("\n")
        );

        if (
            reviewResult.findings.length > 0
        ) {
            const findings =
                reviewResult.findings.map(
                    (
                        finding,
                        index
                    ) => {
                        return [
                            `### ${index + 1}. ${finding.title}`,
                            "",
                            `**Severity:** ${finding.severity}`,
                            `**File:** \`${finding.filePath}\``,
                            `**Line:** ${finding.line ?? "n/a"}`,
                            "",
                            finding.explanation,
                            "",
                            finding.suggestion
                                ? `**Suggestion:** ${finding.suggestion}`
                                : "",
                        ]
                            .filter(Boolean)
                            .join("\n");
                    }
                );

            sections.push(
                findings.join(
                    "\n\n"
                )
            );
        }

        return sections.join(
            "\n\n---\n\n"
        );
    };
}