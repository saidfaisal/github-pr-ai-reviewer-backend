export const HOST =
    "127.0.0.1";

export const PORT =
    3000;

export const MAX_BODY_BYTES =
    2 * 1024 * 1024;

const getRequiredEnv = (
    name: string
): string => {
    const value =
        process.env[name]?.trim();

    if (!value) {
        throw new Error(
            `${name} is not configured`
        );
    }

    return value;
};

export const GITHUB_WEBHOOK_SECRET =
    getRequiredEnv(
        "GITHUB_WEBHOOK_SECRET"
    );