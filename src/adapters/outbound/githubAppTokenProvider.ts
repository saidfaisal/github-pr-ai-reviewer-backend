import {
    readFile,
} from "node:fs/promises";

import {
    createSign,
} from "node:crypto";

type GitHubAppTokenProviderDependencies = {
    appId: string;
    installationId: string;
    privateKeyPath: string;
};

type InstallationTokenResponse = {
    token: string;
    expires_at: string;
};

export class GitHubAppTokenProvider {

    private readonly appId:
        string;

    private readonly installationId:
        string;

    private readonly privateKeyPath:
        string;

    private cachedToken:
        string | null = null;

    private cachedTokenExpiresAt:
        number | null = null;

    constructor(
        dependencies:
            GitHubAppTokenProviderDependencies
    ) {
        this.appId =
            dependencies.appId;

        this.installationId =
            dependencies.installationId;

        this.privateKeyPath =
            dependencies.privateKeyPath;
    }

    async getToken(): Promise<string> {
        if (
            this.cachedToken &&
            this.cachedTokenExpiresAt &&
            Date.now() <
                this.cachedTokenExpiresAt -
                    5 * 60 * 1000
        ) {
            return this.cachedToken;
        }

        const jwt =
            await this.createJwt();

        const tokenResponse =
            await this.createInstallationToken(
                jwt
            );

        this.cachedToken =
            tokenResponse.token;

        this.cachedTokenExpiresAt =
            Date.parse(
                tokenResponse.expires_at
            );

        return tokenResponse.token;
    }

    private createJwt = async (): Promise<string> => {
        const privateKey =
            await readFile(
                this.privateKeyPath,
                "utf8"
            );

        const now =
            Math.floor(
                Date.now() / 1000
            );

        const header = {
            alg: "RS256",
            typ: "JWT",
        };

        const payload = {
            iat:
                now - 60,

            exp:
                now + 9 * 60,

            iss:
                this.appId,
        };

        const encodedHeader =
            this.base64UrlEncode(
                JSON.stringify(
                    header
                )
            );

        const encodedPayload =
            this.base64UrlEncode(
                JSON.stringify(
                    payload
                )
            );

        const signingInput =
            `${encodedHeader}.${encodedPayload}`;

        const signer =
            createSign(
                "RSA-SHA256"
            );

        signer.update(
            signingInput
        );

        signer.end();

        const signature =
            signer.sign(
                privateKey
            );

        return [
            signingInput,
            signature.toString(
                "base64url"
            ),
        ].join(".");
    };

    private createInstallationToken = async (
        jwt: string
    ): Promise<InstallationTokenResponse> => {
        const url =
            `https://api.github.com/app/installations/${encodeURIComponent(this.installationId)}/access_tokens`;

        const response =
            await fetch(
                url,
                {
                    method:
                        "POST",

                    headers: {
                        Accept:
                            "application/vnd.github+json",

                        Authorization:
                            `Bearer ${jwt}`,

                        "X-GitHub-Api-Version":
                            "2026-03-10",

                        "User-Agent":
                            "github-pr-ai-reviewer",
                    },
                }
            );

        if (!response.ok) {
            const responseBody =
                await response.text();

            throw new Error(
                [
                    "GitHub installation token request failed.",
                    `Status: ${response.status}.`,
                    `Response: ${responseBody}`,
                ].join(" ")
            );
        }

        const value: unknown =
            await response.json();

        if (
            !this.isInstallationTokenResponse(
                value
            )
        ) {
            throw new Error(
                "GitHub returned an invalid installation token response"
            );
        }

        return value;
    };

    private isInstallationTokenResponse = (
        value: unknown
    ): value is InstallationTokenResponse => {
        if (
            typeof value !== "object" ||
            value === null ||
            Array.isArray(
                value
            )
        ) {
            return false;
        }

        const record =
            value as Record<
                string,
                unknown
            >;

        return (
            typeof record.token ===
                "string" &&
            typeof record.expires_at ===
                "string"
        );
    };

    private base64UrlEncode = (
        value: string
    ): string => {
        return Buffer
            .from(
                value,
                "utf8"
            )
            .toString(
                "base64url"
            );
    };
}