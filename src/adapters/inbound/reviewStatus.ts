import type {
    ServerResponse,
} from "node:http";

import type {
    GetReviewJob,
} from "../../application/useCases/getReviewJob.ts";

import {
    sendJson,
} from "../../infrastructure/http.ts";

type Dependencies = {
    getReviewJob: GetReviewJob;
};

export const createReviewStatusHandler = (
    dependencies: Dependencies
) => {
    const {
        getReviewJob,
    } = dependencies;

    return async (
        deliveryId: string,
        response: ServerResponse
    ): Promise<void> => {
        const reviewJob =
            await getReviewJob(
                deliveryId
            );

        if (!reviewJob) {
            sendJson(
                response,
                404,
                {
                    error:
                        "Review job not found",
                }
            );

            return;
        }

        sendJson(
            response,
            200,
            {
                deliveryId:
                    reviewJob.trigger.deliveryId,

                status:
                    reviewJob.status,

                repository:
                    reviewJob.trigger.repository,

                pullNumber:
                    reviewJob.trigger.pullNumber,

                headSha:
                    reviewJob.trigger.headSha,

                error:
                    reviewJob.error,

                createdAt:
                    reviewJob.createdAt,

                updatedAt:
                    reviewJob.updatedAt,
            }
        );
    };
};