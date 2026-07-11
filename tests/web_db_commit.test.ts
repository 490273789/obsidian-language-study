import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
    ...(await importOriginal<typeof import("obsidian")>()),
    requestUrl: vi.fn(),
}));

import { requestUrl } from "obsidian";
import { WebDb } from "@/db/web_db";
import { LearningRecordStoreError } from "@/learningRecord/intake";

const mockedRequestUrl = vi.mocked(requestUrl);

const candidate = {
    expression: "alpha",
    meaning: "first",
    status: 1 as const,
    type: "WORD" as const,
    tags: [] as string[],
    notes: [] as string[],
    sentences: [],
};

describe("WebDb Learning Record commit adapter", () => {
    beforeEach(() => {
        mockedRequestUrl.mockReset();
    });

    it("accepts an atomic commit receipt from the owned remote adapter", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                operation: "created",
                record: { ...candidate, firstAcceptedAt: 1234 },
            },
        } as never);
        const db = new WebDb("localhost", 8086, false, "");

        await expect(db.commitWhole(candidate, 1234)).resolves.toMatchObject({
            operation: "created",
            record: { expression: "alpha", firstAcceptedAt: 1234 },
        });
        expect(mockedRequestUrl).toHaveBeenCalledWith(
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ record: candidate, firstAcceptedAtIfNew: 1234 }),
            })
        );
    });

    it("rejects a legacy 200 response that lacks an atomic commit receipt", async () => {
        mockedRequestUrl.mockResolvedValue({ status: 200, json: null } as never);
        const db = new WebDb("localhost", 8086, false, "");

        await expect(db.commitWhole(candidate, 1234)).rejects.toEqual(
            new LearningRecordStoreError("record_store_incompatible")
        );
    });

    it("rejects a malformed or mismatched committed Learning Record", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            json: {
                operation: "created",
                record: {
                    ...candidate,
                    expression: "different",
                    tags: [42],
                    firstAcceptedAt: Number.NaN,
                },
            },
        } as never);
        const db = new WebDb("localhost", 8086, false, "");

        await expect(db.commitWhole(candidate, 1234)).rejects.toEqual(
            new LearningRecordStoreError("record_store_incompatible")
        );
    });
});
