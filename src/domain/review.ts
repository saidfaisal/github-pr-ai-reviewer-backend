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

export const SUPPORTED_ACTIONS =
    new Set<SupportedAction>([
        "opened",
        "reopened",
        "synchronize",
    ]);