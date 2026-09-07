import type {
    IncomingMessage,
    ServerResponse,
} from "node:http";

export class BodyTooLargeError
    extends Error {

    constructor() {
        super(
            "Request body exceeds maximum size"
        );

        this.name =
            "BodyTooLargeError";
    }
}

export const sendJson = (
    response: ServerResponse,
    statusCode: number,
    payload: Record<string, unknown>
): void => {
    const body =
        JSON.stringify(payload);

    response.writeHead(
        statusCode,
        {
            "Content-Type":
                "application/json; charset=utf-8",

            "Content-Length":
                Buffer.byteLength(body),
        }
    );

    response.end(body);
};

export const readRawBody = async (
    request: IncomingMessage,
    maxBodyBytes: number
): Promise<Buffer> => {
    const contentLength =
        request.headers[
            "content-length"
        ];

    if (
        typeof contentLength ===
            "string"
    ) {
        const declaredBytes =
            Number(contentLength);

        if (
            Number.isFinite(
                declaredBytes
            ) &&
            declaredBytes >
                maxBodyBytes
        ) {
            throw new BodyTooLargeError();
        }
    }

    const chunks: Buffer[] = [];

    let totalBytes = 0;
    let bodyTooLarge = false;

    for await (
        const chunk of request
    ) {
        const buffer =
            Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(chunk);

        totalBytes +=
            buffer.length;

        if (
            totalBytes >
            maxBodyBytes
        ) {
            bodyTooLarge =
                true;

            continue;
        }

        chunks.push(buffer);
    }

    if (bodyTooLarge) {
        throw new BodyTooLargeError();
    }

    return Buffer.concat(
        chunks,
        totalBytes
    );
};