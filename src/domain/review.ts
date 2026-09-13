export type SupportedAction =
    | "opened"
    | "reopened"
    | "synchronize";

export type ReviewTrigger = {
    deliveryId: string;
    action: SupportedAction;
    repository: string;
    pullNumber: number;
    headSha: string;
    sender: string | null;
};

export type ReviewStatus = 
    | "queued"
    | "processing"
    | "completed"
    | "failed";

export type ReviewJob = {
    reviewKey: string;
    trigger: ReviewTrigger;
    status: ReviewStatus;
    error: string | null;
    createdAt: string;
    updatedAt: string;
}

export type ReviewIdentity = {
    repository: string;
    pullNumber: number;
    headSha: string;
}

export type PullRequestContext = {
    repository: string;
    pullNumber: number;
    title: string;
    body: string | null;
    baseBranch: string;
    headBranch: string;
    headSha: string;
    author: string | null;
    changedFiles: PullRequestFile[];
}

export type PullRequestFile = {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch: string | null;
}

export const createReviewKey = (
    identity: ReviewIdentity
): string => {
    return [
        identity.repository,
        identity.pullNumber,
        identity.headSha
    ].join(":");
}

export const SUPPORTED_ACTIONS =
    new Set<SupportedAction>([
        "opened",
        "reopened",
        "synchronize",
    ]);