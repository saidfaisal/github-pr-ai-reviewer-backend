import type {
    ReviewPublisher,
} from "../../application/ports/reviewPublisher.ts";

import type {
    PullRequestContext,
    ReviewFinding,
    ReviewResult,
} from "../../domain/review.ts";


type GitHubRestReviewPublisherDependencies = {
    token: string;
};

type GitHubReviewComment = {
    path: string;
    line: number;
    side: "RIGHT";
    body: string;
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

        const {
            comments,
            nonInlineFindings,
        } = this.buildInlineComments(
            pullRequest,
            reviewResult
        );

        const body =
            this.buildReviewBody(
                reviewResult,
                nonInlineFindings
            );

        const payload = {
            commit_id:
                pullRequest.headSha,

            body,

            event:
                "COMMENT",

            ...(
                comments.length > 0
                    ? {
                        comments,
                    }
                    : {}
            ),
        };

        const response =
            await fetch(
                url,
                {
                    method:
                        "POST",

                    headers:
                        this.createHeaders(),

                    body:
                        JSON.stringify(
                            payload
                        ),
                }
            );

        if (!response.ok) {
            const responseBody =
                await response.text();

            throw new Error(
                [
                    "GitHub review publish failed.",
                    `Status: ${response.status}.`,
                    `Response: ${responseBody}`,
                ].join(" ")
            );
        }

        console.log(
            `[review] Published ${comments.length} inline comment(s)`
        );
    }


    // -------------------------------------
    // GitHub review mapping
    // -------------------------------------

    private buildInlineComments = (
        pullRequest: PullRequestContext,
        reviewResult: ReviewResult
    ): {
        comments: GitHubReviewComment[];
        nonInlineFindings:
            ReviewResult["findings"];
    } => {
        const comments:
            GitHubReviewComment[] = [];

        const nonInlineFindings:
            ReviewResult["findings"] = [];

        for (
            const finding
            of reviewResult.findings
        ) {
            if (finding.line === null) {
                nonInlineFindings.push(
                    finding
                );

                continue;
            }

            const file =
                pullRequest.changedFiles.find(
                    (
                        changedFile
                    ) =>
                        changedFile.filename ===
                        finding.filePath
                );

            if (
                !file ||
                !file.patch
            ) {
                nonInlineFindings.push(
                    finding
                );

                continue;
            }

            const reviewableLines =
                this.getReviewableRightSideLines(
                    file.patch
                );

            if (
                !reviewableLines.has(
                    finding.line
                )
            ) {
                nonInlineFindings.push(
                    finding
                );

                continue;
            }

            comments.push({
                path:
                    finding.filePath,

                line:
                    finding.line,

                side:
                    "RIGHT",

                body:
                    this.buildInlineCommentBody(
                        finding
                    ),
            });
        }

        return {
            comments,
            nonInlineFindings,
        };
    };


    private buildInlineCommentBody = (
        finding: ReviewFinding
    ): string => {
        const sections = [
            `**${finding.severity.toUpperCase()} — ${finding.title}**`,
            "",
            finding.explanation,
        ];

        if (finding.suggestion) {
            sections.push(
                "",
                `**Suggestion:** ${finding.suggestion}`
            );
        }

        return sections.join(
            "\n"
        );
    };


    // -------------------------------------
    // Unified diff parsing
    // -------------------------------------

    private getReviewableRightSideLines = (
        patch: string
    ): Set<number> => {
        const reviewableLines =
            new Set<number>();

        let newLine:
            number | null = null;

        for (
            const patchLine
            of patch.split("\n")
        ) {
            const hunkMatch =
                patchLine.match(
                    /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/
                );

            if (hunkMatch) {
                const startLine =
                    hunkMatch[1];

                if (!startLine) {
                    continue;
                }

                newLine =
                    Number(
                        startLine
                    );

                continue;
            }

            if (newLine === null) {
                continue;
            }

            if (
                patchLine.startsWith(
                    "+"
                ) &&
                !patchLine.startsWith(
                    "+++"
                )
            ) {
                reviewableLines.add(
                    newLine
                );

                newLine++;

                continue;
            }

            if (
                patchLine.startsWith(
                    "-"
                ) &&
                !patchLine.startsWith(
                    "---"
                )
            ) {
                continue;
            }

            if (
                patchLine.startsWith(
                    " "
                )
            ) {
                reviewableLines.add(
                    newLine
                );

                newLine++;

                continue;
            }

            if (
                patchLine.startsWith(
                    "\\"
                )
            ) {
                continue;
            }
        }

        return reviewableLines;
    };


    // -------------------------------------
    // Review summary
    // -------------------------------------

    private buildReviewBody = (
        reviewResult: ReviewResult,
        nonInlineFindings:
            ReviewResult["findings"]
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
                "",
                `**Findings:** ${reviewResult.findings.length}`,
            ].join("\n")
        );

        if (
            nonInlineFindings.length > 0
        ) {
            const findings =
                nonInlineFindings.map(
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
                            .filter(
                                Boolean
                            )
                            .join(
                                "\n"
                            );
                    }
                );

            sections.push(
                [
                    "## Findings without inline location",
                    "",
                    findings.join(
                        "\n\n"
                    ),
                ].join("\n")
            );
        }

        return sections.join(
            "\n\n---\n\n"
        );
    };


    // -------------------------------------
    // GitHub REST helpers
    // -------------------------------------

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
}