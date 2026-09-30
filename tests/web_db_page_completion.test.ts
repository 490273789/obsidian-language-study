import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
    ...(await importOriginal<typeof import("obsidian")>()),
    requestUrl: vi.fn(),
}));

import { requestUrl } from "obsidian";
import { WebDb } from "@/db/web_db";
import { ReadingPageCompletionStoreError } from "@/reading/pageCompletion";

const mockedRequestUrl = vi.mocked(requestUrl);

describe("WebDb Reading Page Completion ignore store", () => {
    beforeEach(() => {
        mockedRequestUrl.mockReset();
    });

    it("uses the atomic protocol with normalized words and validates its receipt", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 201,
            json: {
                protocol: "create-ignores-if-absent-v1",
                created: ["alpha"],
                existing: ["beta"],
            },
        } as never);
        const db = new WebDb("localhost", 8086, false, "key");

        await expect(db.postIgnoreWords([" Alpha ", "beta", "ALPHA", ""])).resolves.toBeUndefined();

        expect(mockedRequestUrl).toHaveBeenCalledWith(
            expect.objectContaining({
                url: "http://localhost:8086/lr/ignores-if-absent",
                method: "POST",
                body: JSON.stringify({ words: ["alpha", "beta"] }),
                headers: { "LR-API-Key": "key" },
                throw: false,
            })
        );
    });

    it("does not make a request for an empty normalized batch", async () => {
        const db = new WebDb("localhost", 8086, false, "");

        await db.postIgnoreWords(["", "  "]);

        expect(mockedRequestUrl).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: "a legacy response",
            receipt: { protocol: "create-ignores-if-absent-v1", created: ["alpha"] },
        },
        {
            name: "a receipt with duplicate entries",
            receipt: {
                protocol: "create-ignores-if-absent-v1",
                created: ["alpha", "alpha"],
                existing: [],
            },
        },
        {
            name: "a receipt with an unexpected entry",
            receipt: {
                protocol: "create-ignores-if-absent-v1",
                created: ["alpha", "beta"],
                existing: [],
            },
        },
    ])("rejects $name as incompatible", async ({ receipt }) => {
        mockedRequestUrl.mockResolvedValue({ status: 200, json: receipt } as never);
        const db = new WebDb("localhost", 8086, false, "");

        await expect(db.postIgnoreWords(["alpha"])).rejects.toEqual(
            new ReadingPageCompletionStoreError("ignore_store_incompatible")
        );
    });

    it.each([404, 405])("treats HTTP %i as an incompatible remote adapter", async (status) => {
        mockedRequestUrl.mockResolvedValue({ status, json: null } as never);
        const db = new WebDb("localhost", 8086, false, "");

        await expect(db.postIgnoreWords(["alpha"])).rejects.toEqual(
            new ReadingPageCompletionStoreError("ignore_store_incompatible")
        );
    });

    it("treats other HTTP and transport failures as unavailable without legacy fallback", async () => {
        mockedRequestUrl.mockResolvedValueOnce({ status: 500, json: null } as never);
        const db = new WebDb("localhost", 8086, false, "");

        await expect(db.postIgnoreWords(["alpha"])).rejects.toEqual(
            new ReadingPageCompletionStoreError("ignore_store_unavailable")
        );

        mockedRequestUrl.mockRejectedValueOnce(new Error("network down"));
        await expect(db.postIgnoreWords(["alpha"])).rejects.toEqual(
            new ReadingPageCompletionStoreError("ignore_store_unavailable")
        );

        expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
        expect(mockedRequestUrl.mock.calls).toEqual(
            expect.arrayContaining([
                [expect.objectContaining({ url: expect.stringContaining("/ignores-if-absent") })],
            ])
        );
        expect(mockedRequestUrl.mock.calls).not.toEqual(
            expect.arrayContaining([
                [expect.objectContaining({ url: expect.stringMatching(/\/ignores$/) })],
            ])
        );
    });

    it("requires an explicit 2xx status", async () => {
        mockedRequestUrl.mockResolvedValue({
            json: {
                protocol: "create-ignores-if-absent-v1",
                created: ["alpha"],
                existing: [],
            },
        } as never);
        const db = new WebDb("localhost", 8086, false, "");

        await expect(db.postIgnoreWords(["alpha"])).rejects.toEqual(
            new ReadingPageCompletionStoreError("ignore_store_unavailable")
        );
    });

    it("treats a successful response with invalid JSON as incompatible", async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            get json() {
                throw new SyntaxError("invalid JSON");
            },
        } as never);
        const db = new WebDb("localhost", 8086, false, "");
        await expect(db.postIgnoreWords(["alpha"])).rejects.toEqual(
            new ReadingPageCompletionStoreError("ignore_store_incompatible")
        );
        expect(mockedRequestUrl).toHaveBeenCalledTimes(1);
    });
});
