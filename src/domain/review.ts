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
    trigger: ReviewTrigger;
    status: ReviewStatus;
    error: string | null;
    createdAt: string;
    updatedAt: string;
}

export const SUPPORTED_ACTIONS =
    new Set<SupportedAction>([
        "opened",
        "reopened",
        "synchronize",
    ]);