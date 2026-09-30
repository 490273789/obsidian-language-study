import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
    ...(await importOriginal<typeof import("obsidian")>()),
    requestUrl: vi.fn(),
}));

import { requestUrl } from "obsidian";
import { WebDb } from "@/db/web_db";

const mockedRequestUrl = vi.mocked(requestUrl);
const expression = {
    expression: "alpha",
    meaning: "",
    status: 0,
    t: "WORD",
    tags: [],
    notes: [],
    sentences: [{ text: "Alpha appears.", trans: "", origin: "" }],
};
const sentence = { text: "Exact sentence.", trans: "Translation", origin: "Book" };

describe("WebDb lookup contract", () => {
    const db = new WebDb("localhost", 8086, false, "key");

    beforeEach(() => {
        mockedRequestUrl.mockReset();
    });

    it("accepts complete stored records, including empty meanings, by normalized identity", async () => {
        const record = { ...expression, expression: " Alpha ", status: 2 };
        mockedRequestUrl.mockResolvedValue({ status: 200, json: record } as never);
        await expect(db.getExpression(" ALPHA ")).resolves.toEqual(record);
        expect(mockedRequestUrl).toHaveBeenCalledWith(
            expect.objectContaining({ body: JSON.stringify("alpha"), throw: false })
        );
    });

    it("accepts an ignored record with empty meaning", async () => {
        mockedRequestUrl.mockResolvedValue({ status: 200, json: expression } as never);
        await expect(db.getExpression("alpha")).resolves.toEqual(expression);
    });

    it("accepts only explicit null on successful responses as absence", async () => {
        mockedRequestUrl.mockResolvedValue({ status: 200, json: null } as never);
        await expect(db.getExpression("alpha")).resolves.toBeNull();
        await expect(db.tryGetSen(sentence.text)).resolves.toBeNull();
    });

    it.each([
        undefined,
        {},
        [],
        "alpha",
        { ...expression, expression: "beta" },
        { ...expression, status: 5 },
        { ...expression, status: 1.5 },
        { ...expression, t: "OTHER" },
        { ...expression, meaning: null },
        { ...expression, tags: [1] },
        { ...expression, notes: null },
        { ...expression, sentences: [{ text: "Alpha", trans: "" }] },
    ])("rejects malformed or mismatched expression payload %#", async (json) => {
        mockedRequestUrl.mockResolvedValue({ status: 200, json } as never);
        await expect(db.getExpression("alpha")).rejects.toThrow();
    });

    it("accepts a sentence only with its exact requested text", async () => {
        mockedRequestUrl.mockResolvedValue({ status: 201, json: sentence } as never);
        await expect(db.tryGetSen(sentence.text)).resolves.toEqual(sentence);
        expect(mockedRequestUrl).toHaveBeenCalledWith(
            expect.objectContaining({ body: JSON.stringify(sentence.text), throw: false })
        );
    });

    it.each([
        undefined,
        {},
        [],
        { ...sentence, text: "exact sentence." },
        { ...sentence, trans: 1 },
        { ...sentence, origin: null },
    ])("rejects malformed or mismatched sentence payload %#", async (json) => {
        mockedRequestUrl.mockResolvedValue({ status: 200, json } as never);
        await expect(db.tryGetSen(sentence.text)).rejects.toThrow();
    });

    it.each([undefined, 199, 300, 404, 500, 200.5])(
        "rejects non-success HTTP status %s even with null",
        async (status) => {
            mockedRequestUrl.mockResolvedValue({ status, json: null } as never);
            await expect(db.getExpression("alpha")).rejects.toThrow();
            await expect(db.tryGetSen(sentence.text)).rejects.toThrow();
        }
    );

    it("rejects transport and JSON failures for both lookups", async () => {
        mockedRequestUrl.mockRejectedValue(new Error("offline"));
        await expect(db.getExpression("alpha")).rejects.toThrow("offline");
        await expect(db.tryGetSen(sentence.text)).rejects.toThrow("offline");
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            get json() {
                throw new SyntaxError("invalid JSON");
            },
        } as never);
        await expect(db.getExpression("alpha")).rejects.toThrow("invalid JSON");
        await expect(db.tryGetSen(sentence.text)).rejects.toThrow("invalid JSON");
    });
});
