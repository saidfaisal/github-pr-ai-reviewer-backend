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

