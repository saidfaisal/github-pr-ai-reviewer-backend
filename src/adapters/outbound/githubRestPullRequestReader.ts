import type {
    PullRequestReader,
} from "../../application/ports/pullRequestReader.ts";

import type {
    GitHubAppTokenProvider
} from "../outbound/githubAppTokenProvider.ts";

import type {
    PullRequestContext,
    PullRequestFile,
    ReviewTrigger,
} from "../../domain/review.ts";

type GitHubRestPullRequestReaderDependencies = {
    tokenProvider: GitHubAppTokenProvider;
};

type GitHubPullRequestResponse = {
    title: string;
    body: string | null;

    user: {
        login: string;
    } | null;

    base: {
        ref: string;
    };

    head: {
        ref: string;
        sha: string;
    };
};

type GitHubPullRequestFileResponse = {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
};

const isRecord = (
    value: unknown
): value is Record<string, unknown> => {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
};

export class GitHubRestPullRequestReader
    implements PullRequestReader {

    private readonly tokenProvider: GitHubAppTokenProvider;

    constructor(
        dependencies:
            GitHubRestPullRequestReaderDependencies
    ) {
        this.tokenProvider =
            dependencies.tokenProvider;
    }

    async getPullRequest(
        reviewTrigger: ReviewTrigger
    ): Promise<PullRequestContext> {
        const {
            repository,
            pullNumber,
        } = reviewTrigger;

        const repositoryParts =
            repository.split("/");

        if (
            repositoryParts.length !== 2
        ) {
            throw new Error(
                `Invalid repository name: ${repository}`
            );
        }

        const [
            owner,
            repositoryName,
        ] = repositoryParts;

        if (
            !owner ||
            !repositoryName
        ) {
            throw new Error(
                `Invalid repository name: ${repository}`
            );
        }

        const pullRequestUrl =
            `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/pulls/${pullNumber}`;

        const metadata =
            await this.fetchMetadata(
                pullRequestUrl
            );

        const changedFiles =
            await this.fetchChangedFiles(
                pullRequestUrl
            );

        return {
            repository,
            pullNumber,

            title:
                metadata.title,

            body:
                metadata.body,

            baseBranch:
                metadata.base.ref,

            headBranch:
                metadata.head.ref,

            headSha:
                metadata.head.sha,

            author:
                metadata.user?.login ??
                null,

            changedFiles,
        };
    }

    private createHeaders = async (): Promise<HeadersInit> => {
        const token = await this.tokenProvider
            .getToken();

        return {
            Accept:
                "application/vnd.github+json",

            Authorization:
                `Bearer ${token}`,

            "X-GitHub-Api-Version":
                "2026-03-10",

            "User-Agent":
                "github-pr-ai-reviewer",
        };
    };

    private fetchMetadata = async (
        url: string
    ): Promise<GitHubPullRequestResponse> => {
        const response =
            await fetch(
                url,
                {
                    method:
                        "GET",

                    headers:
                        await this.createHeaders(),
                }
            );

        if (!response.ok) {
            throw new Error(
                `GitHub PR metadata request failed: ${response.status} ${response.statusText}`
            );
        }

        const value: unknown =
            await response.json();

        if (
            !this.isGitHubPullRequestResponse(
                value
            )
        ) {
            throw new Error(
                "GitHub returned an invalid Pull Request response"
            );
        }

        return value;
    };

    private fetchChangedFiles = async (
        pullRequestUrl: string
    ): Promise<PullRequestFile[]> => {
        const response =
            await fetch(
                `${pullRequestUrl}/files?per_page=100`,
                {
                    method:
                        "GET",

                    headers:
                        await this.createHeaders(),
                }
            );

        if (!response.ok) {
            throw new Error(
                `GitHub PR files request failed: ${response.status} ${response.statusText}`
            );
        }

        const value: unknown =
            await response.json();

        if (!Array.isArray(value)) {
            throw new Error(
                "GitHub returned an invalid Pull Request files response"
            );
        }

        const files:
            PullRequestFile[] = [];

        for (const item of value) {
            if (
                !this.isGitHubPullRequestFileResponse(
                    item
                )
            ) {
                throw new Error(
                    "GitHub returned an invalid Pull Request file"
                );
            }

            files.push({
                filename:
                    item.filename,

                status:
                    item.status,

                additions:
                    item.additions,

                deletions:
                    item.deletions,

                changes:
                    item.changes,

                patch:
                    item.patch ??
                    null,
            });
        }

        return files;
    };

    private isGitHubPullRequestResponse = (
        value: unknown
    ): value is GitHubPullRequestResponse => {
        if (!isRecord(value)) {
            return false;
        }

        const {
            title,
            body,
            user,
            base,
            head,
        } = value;

        if (
            typeof title !== "string" ||
            !(
                typeof body === "string" ||
                body === null
            )
        ) {
            return false;
        }

        if (
            !this.isGitHubUser(
                user
            )
        ) {
            return false;
        }

        if (
            !this.isGitReference(
                base
            )
        ) {
            return false;
        }

        if (
            !this.isGitHead(
                head
            )
        ) {
            return false;
        }

        return true;
    };

    private isGitHubPullRequestFileResponse = (
        value: unknown
    ): value is GitHubPullRequestFileResponse => {
        if (!isRecord(value)) {
            return false;
        }

        const {
            filename,
            status,
            additions,
            deletions,
            changes,
            patch,
        } = value;

        if (
            typeof filename !== "string" ||
            typeof status !== "string" ||
            typeof additions !== "number" ||
            typeof deletions !== "number" ||
            typeof changes !== "number"
        ) {
            return false;
        }

        if (
            patch !== undefined &&
            typeof patch !== "string"
        ) {
            return false;
        }

        return true;
    };

    private isGitHubUser = (
        value: unknown
    ): value is {
        login: string;
    } | null => {
        if (value === null) {
            return true;
        }

        if (!isRecord(value)) {
            return false;
        }

        return (
            typeof value.login ===
            "string"
        );
    };

    private isGitReference = (
        value: unknown
    ): value is {
        ref: string;
    } => {
        if (!isRecord(value)) {
            return false;
        }

        return (
            typeof value.ref ===
            "string"
        );
    };

    private isGitHead = (
        value: unknown
    ): value is {
        ref: string;
        sha: string;
    } => {
        if (!isRecord(value)) {
            return false;
        }

        return (
            typeof value.ref ===
                "string" &&
            typeof value.sha ===
                "string"
        );
    };
}