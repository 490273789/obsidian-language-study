import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
    ...(await importOriginal<typeof import("obsidian")>()),
    requestUrl: vi.fn(),
}));

import { requestUrl } from "obsidian";
import { WebDb } from "@/db/web_db";

const mockedRequestUrl = vi.mocked(requestUrl);
const fields = {
    expression: "alpha",
    meaning: "",
    status: 0,
    t: "WORD",
    tags: ["tag"],
};
const simple = { ...fields, note_num: 0, sen_num: 1, date: 0 };
const full = {
    ...fields,
    notes: ["note"],
    sentences: [{ text: "Alpha appears.", trans: "", origin: "" }],
};

describe("WebDb publication source contract", () => {
    const db = new WebDb("localhost", 8086, false, "key");
    const sources = [
        { name: "simple", read: () => db.getAllExpressionSimple(true), record: simple },
        { name: "full", read: () => db.getExpressionAfter("2000-01-01"), record: full },
    ];

    beforeEach(() => {
        mockedRequestUrl.mockReset();
    });

    it.each(sources)("accepts a genuine empty $name source on a 2xx response", async ({ read }) => {
        mockedRequestUrl.mockResolvedValue({ status: 201, json: [] } as never);
        await expect(read()).resolves.toEqual([]);
        expect(mockedRequestUrl).toHaveBeenCalledWith(expect.objectContaining({ throw: false }));
    });

    it.each(sources)(
        "accepts complete $name domain records including ignores and empty meanings",
        async ({ read, record }) => {
            const records = [
                record,
                { ...record, expression: " A phrase ", t: "PHRASE", status: 4 },
            ];
            mockedRequestUrl.mockResolvedValue({ status: 200, json: records } as never);
            await expect(read()).resolves.toEqual(records);
        }
    );

    it("retains source query methods, payloads, and authentication", async () => {
        mockedRequestUrl.mockResolvedValue({ status: 200, json: [] } as never);
        await db.getAllExpressionSimple();
        expect(mockedRequestUrl).toHaveBeenLastCalledWith(
            expect.objectContaining({
                url: "http://localhost:8086/lr/words_simple/no_ignore",
                method: "GET",
                headers: { "LR-API-Key": "key" },
            })
        );
        await db.getAllExpressionSimple(true);
        expect(mockedRequestUrl).toHaveBeenLastCalledWith(
            expect.objectContaining({ url: "http://localhost:8086/lr/words_simple/all" })
        );
        await db.getExpressionAfter("2000-01-01");
        expect(mockedRequestUrl).toHaveBeenLastCalledWith(
            expect.objectContaining({
                url: "http://localhost:8086/lr/words/after",
                method: "POST",
                body: "946684800",
                contentType: "application/json",
                headers: { "LR-API-Key": "key" },
            })
        );
    });

    it.each(sources)(
        "rejects non-array $name payloads and malformed elements",
        async ({ read, record }) => {
            for (const json of [null, undefined, {}, "[]", record, [record, null]]) {
                mockedRequestUrl.mockResolvedValue({ status: 200, json } as never);
                await expect(read()).rejects.toThrow("Invalid Learning Record source response");
            }
        }
    );

    it.each(sources)("rejects invalid shared $name fields", async ({ read, record }) => {
        for (const patch of [
            { expression: " " },
            { expression: 1 },
            { meaning: null },
            { status: -1 },
            { status: 5 },
            { status: 1.5 },
            { status: "1" },
            { t: "OTHER" },
            { tags: [1] },
            { tags: null },
        ]) {
            mockedRequestUrl.mockResolvedValue({
                status: 200,
                json: [{ ...record, ...patch }],
            } as never);
            await expect(read()).rejects.toThrow();
        }
    });

    it.each(["note_num", "sen_num", "date"])("rejects invalid simple %s", async (field) => {
        for (const value of [undefined, "0", -1, 0.5, NaN, Infinity]) {
            mockedRequestUrl.mockResolvedValue({
                status: 200,
                json: [{ ...simple, [field]: value }],
            } as never);
            await expect(db.getAllExpressionSimple()).rejects.toThrow();
        }
    });

    it.each([
        { notes: null },
        { notes: [1] },
        { sentences: null },
        { sentences: [{ text: "Alpha", trans: "" }] },
        { sentences: [{ text: "Alpha", trans: 1, origin: "" }] },
        { sentences: [{ text: 1, trans: "", origin: "" }] },
        { sentences: [{ text: "Alpha", trans: "", origin: null }] },
    ])("rejects malformed full record %#", async (patch) => {
        mockedRequestUrl.mockResolvedValue({ status: 200, json: [{ ...full, ...patch }] } as never);
        await expect(db.getExpressionAfter("2000-01-01")).rejects.toThrow();
    });

    it.each(sources)("rejects failed HTTP, JSON, and transport $name reads", async ({ read }) => {
        for (const status of [undefined, 199, 300, 404, 500, 200.5]) {
            mockedRequestUrl.mockResolvedValue({ status, json: [] } as never);
            await expect(read()).rejects.toThrow();
        }
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            get json() {
                throw new SyntaxError("invalid JSON");
            },
        } as never);
        await expect(read()).rejects.toThrow("invalid JSON");
        mockedRequestUrl.mockRejectedValue(new Error("offline"));
        await expect(read()).rejects.toThrow("offline");
    });
});
