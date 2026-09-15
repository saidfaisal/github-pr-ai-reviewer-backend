import type {
    ReviewAnalyzer,
} from "../../application/ports/reviewAnalyzer.ts";

import type {
    ReviewResult,
} from "../../domain/review.ts";

export class FakeReviewAnalyzer
    implements ReviewAnalyzer {

    async analyze(
        reviewInput: string
    ): Promise<ReviewResult> {
        if (!reviewInput.trim()) {
            throw new Error(
                "Review input cannot be empty"
            );
        }

        return {
            summary:
                "The calculator contains correctness issues that should be fixed before merging.",

            recommendation:
                "request_changes",

            findings: [
                {
                    filePath:
                        "Calculator/src/Calculator.kt",

                    line:
                        6,

                    severity:
                        "high",

                    title:
                        "Division operands appear reversed",

                    explanation:
                        "The divide function returns second / first, which appears inconsistent with the parameter order.",

                    suggestion:
                        "Return first / second and handle division by zero.",
                },

                {
                    filePath:
                        "Calculator/src/Calculator.kt",

                    line:
                        18,

                    severity:
                        "high",

                    title:
                        "Empty list can cause division by zero",

                    explanation:
                        "values.size becomes zero when calculateAverage receives an empty list.",

                    suggestion:
                        "Handle an empty list before dividing by values.size.",
                },
            ],
        };
    }
}