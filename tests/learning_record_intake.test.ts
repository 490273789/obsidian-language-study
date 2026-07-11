import { describe, expect, it, vi } from "vitest";

import {
    LearningRecordIntakeModule,
    LearningRecordStoreError,
    type LearningRecordIntakeDependencies,
} from "@/learningRecord/intake";

function makeHarness(automaticPublicationEnabled = true) {
    const commitWhole = vi.fn<LearningRecordIntakeDependencies["recordStore"]["commitWhole"]>();
    const updateReadingDocument = vi.fn(async () => {});
    const updateStatistics = vi.fn(async () => {});
    const publishWordDatabase = vi.fn(async () => ({
        target: "word" as const,
        status: "published" as const,
    }));
    const publishReviewDatabase = vi.fn(async () => ({
        target: "review" as const,
        status: "published" as const,
    }));

    const intake = new LearningRecordIntakeModule({
        recordStore: { commitWhole },
        updateReadingDocument,
        updateStatistics,
        textDatabasePublication: {
            publishWordDatabase,
            publishReviewDatabase,
        },
        isAutomaticPublicationEnabled: () => automaticPublicationEnabled,
        now: () => 1234,
    });

    return {
        commitWhole,
        intake,
        publishReviewDatabase,
        publishWordDatabase,
        updateReadingDocument,
        updateStatistics,
    };
}

describe("Learning Record Intake", () => {
    it("rejects an invalid candidate without crossing a dependency seam", async () => {
        const harness = makeHarness();

        await expect(
            harness.intake.accept({
                expression: "",
                meaning: "",
                status: 9,
                type: "WORD",
                tags: [],
                notes: [],
                sentences: [],
            })
        ).resolves.toEqual({
            status: "rejected",
            issues: [
                { code: "expression_empty", field: "expression" },
                { code: "meaning_empty", field: "meaning" },
                { code: "status_invalid", field: "status" },
            ],
        });

        expect(harness.commitWhole).not.toHaveBeenCalled();
        expect(harness.updateReadingDocument).not.toHaveBeenCalled();
        expect(harness.updateStatistics).not.toHaveBeenCalled();
        expect(harness.publishWordDatabase).not.toHaveBeenCalled();
        expect(harness.publishReviewDatabase).not.toHaveBeenCalled();
    });

    it("commits a normalized whole Learning Record and reports completed follow-ups", async () => {
        const harness = makeHarness();
        harness.commitWhole.mockImplementation(async (candidate, firstAcceptedAtIfNew) => ({
            operation: "created",
            record: { ...candidate, firstAcceptedAt: firstAcceptedAtIfNew },
        }));

        await expect(
            harness.intake.accept({
                expression: "  Alpha  ",
                meaning: "first letter",
                status: 1,
                type: "WORD",
                tags: ["greek"],
                notes: ["note"],
                sentences: [{ text: "Alpha.", trans: "", origin: "Book" }],
            })
        ).resolves.toEqual({
            status: "committed",
            operation: "created",
            record: {
                expression: "alpha",
                meaning: "first letter",
                status: 1,
                type: "WORD",
                tags: ["greek"],
                notes: ["note"],
                sentences: [{ text: "Alpha.", trans: "", origin: "Book" }],
                firstAcceptedAt: 1234,
            },
            readerUpdate: { status: "updated" },
            statisticsUpdate: { status: "updated" },
            publication: {
                status: "attempted",
                wordDatabase: { status: "published" },
                reviewDatabase: { status: "published" },
            },
        });

        expect(harness.commitWhole).toHaveBeenCalledWith(
            expect.objectContaining({ expression: "alpha" }),
            1234
        );
        expect(harness.updateReadingDocument).toHaveBeenCalledTimes(1);
        expect(harness.updateStatistics).toHaveBeenCalledTimes(1);
    });

    it("reports an expected record-store failure without running post-commit work", async () => {
        const harness = makeHarness();
        harness.commitWhole.mockRejectedValue(
            new LearningRecordStoreError("record_store_unavailable")
        );

        await expect(
            harness.intake.accept({
                expression: "alpha",
                meaning: "first letter",
                status: 1,
                type: "WORD",
                tags: [],
                notes: [],
                sentences: [],
            })
        ).resolves.toEqual({
            status: "notCommitted",
            code: "record_store_unavailable",
        });

        expect(harness.updateReadingDocument).not.toHaveBeenCalled();
        expect(harness.updateStatistics).not.toHaveBeenCalled();
        expect(harness.publishWordDatabase).not.toHaveBeenCalled();
        expect(harness.publishReviewDatabase).not.toHaveBeenCalled();
    });

    it("rejects unexpected record-store errors instead of disguising programming defects", async () => {
        const harness = makeHarness();
        const programmingError = new Error("broken adapter invariant");
        harness.commitWhole.mockRejectedValue(programmingError);

        await expect(
            harness.intake.accept({
                expression: "alpha",
                meaning: "first letter",
                status: 1,
                type: "WORD",
                tags: [],
                notes: [],
                sentences: [],
            })
        ).rejects.toBe(programmingError);
    });

    it("isolates post-commit failures and still attempts both publication targets", async () => {
        const harness = makeHarness();
        harness.commitWhole.mockImplementation(async (candidate, firstAcceptedAtIfNew) => ({
            operation: "updated",
            record: { ...candidate, firstAcceptedAt: firstAcceptedAtIfNew - 100 },
        }));
        harness.updateReadingDocument.mockRejectedValue(new Error("reader failed"));
        harness.publishWordDatabase.mockRejectedValue(new Error("word publication failed"));

        const result = await harness.intake.accept({
            expression: "alpha",
            meaning: "updated meaning",
            status: 2,
            type: "WORD",
            tags: [],
            notes: [],
            sentences: [],
        });

        expect(result).toMatchObject({
            status: "committed",
            operation: "updated",
            record: { firstAcceptedAt: 1134 },
            readerUpdate: { status: "failed", code: "update_failed" },
            statisticsUpdate: { status: "updated" },
            publication: {
                status: "attempted",
                wordDatabase: { status: "failed", code: "publication_failed" },
                reviewDatabase: { status: "published" },
            },
        });
        expect(harness.publishReviewDatabase).toHaveBeenCalledTimes(1);
    });

    it("skips Text Database Publication when automatic publication is disabled", async () => {
        const harness = makeHarness(false);
        harness.commitWhole.mockImplementation(async (candidate, firstAcceptedAtIfNew) => ({
            operation: "created",
            record: { ...candidate, firstAcceptedAt: firstAcceptedAtIfNew },
        }));

        const result = await harness.intake.accept({
            expression: "alpha",
            meaning: "first",
            status: 1,
            type: "WORD",
            tags: [],
            notes: [],
            sentences: [],
        });

        expect(result).toMatchObject({
            status: "committed",
            publication: { status: "disabled" },
        });
        expect(harness.publishWordDatabase).not.toHaveBeenCalled();
        expect(harness.publishReviewDatabase).not.toHaveBeenCalled();
    });

    it("snapshots caller input and serializes complete intake operations", async () => {
        const harness = makeHarness();
        let releaseFirst!: () => void;
        const firstBlocker = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const committedExpressions: string[] = [];
        harness.commitWhole.mockImplementation(async (candidate, firstAcceptedAtIfNew) => {
            committedExpressions.push(candidate.expression);
            if (committedExpressions.length === 1) {
                await firstBlocker;
            }
            return {
                operation: "created",
                record: { ...candidate, firstAcceptedAt: firstAcceptedAtIfNew },
            };
        });

        const first = harness.intake.accept({
            expression: "alpha",
            meaning: "first",
            status: 1,
            type: "WORD",
            tags: [],
            notes: [],
            sentences: [],
        });
        const secondCandidate = {
            expression: "beta",
            meaning: "second",
            status: 1,
            type: "WORD",
            tags: [] as string[],
            notes: [] as string[],
            sentences: [],
        };
        const second = harness.intake.accept(secondCandidate);
        secondCandidate.expression = "changed-after-accept";

        await vi.waitFor(() => expect(committedExpressions).toEqual(["alpha"]));
        releaseFirst();
        await Promise.all([first, second]);

        expect(committedExpressions).toEqual(["alpha", "beta"]);
    });
});
