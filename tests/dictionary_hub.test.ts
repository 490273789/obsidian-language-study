import { describe, expect, it } from "vitest";

import { DictionaryHub } from "@/dictionary/hub";
import type { DictionaryAdapter, DictionaryLookupReceipt } from "@/dictionary/interface";

function createMockAdapter(
    id: string,
    delayMs: number = 0,
    resultPayload?: unknown,
    translateFn?: (text: string) => Promise<string>
): DictionaryAdapter {
    return {
        id,
        name: `Mock ${id}`,
        description: `Description for ${id}`,
        async lookup(word: string): Promise<DictionaryLookupReceipt> {
            if (delayMs > 0) {
                await new Promise((r) => setTimeout(r, delayMs));
            }
            if (!word.trim()) {
                return { id, status: "empty" };
            }
            if (word === "error") {
                return { id, status: "error", error: "Boom" };
            }
            return {
                id,
                status: "success",
                data: resultPayload ?? { word, from: id },
            };
        },
        translate: translateFn,
    };
}

describe("DictionaryHub", () => {
    it("registers and retrieves adapters", () => {
        const hub = new DictionaryHub();
        const adapter = createMockAdapter("test");
        hub.register(adapter);

        expect(hub.getAdapter("test")).toBe(adapter);
        expect(hub.getAllAdapters()).toHaveLength(1);
    });

    it("executes single lookup", async () => {
        const hub = new DictionaryHub([createMockAdapter("youdao")]);
        const receipt = await hub.lookup("youdao", "test");

        expect(receipt.status).toBe("success");
        expect(receipt.data).toEqual({ word: "test", from: "youdao" });
    });

    it("returns error receipt when adapter does not exist", async () => {
        const hub = new DictionaryHub();
        const receipt = await hub.lookup("missing", "test");

        expect(receipt.status).toBe("error");
        expect(receipt.error).toContain("missing");
    });

    it("runs lookupAll in parallel and reports progress", async () => {
        const hub = new DictionaryHub([createMockAdapter("a", 10), createMockAdapter("b", 20)]);

        const progressUpdates: { id: string; isCurrent: boolean }[] = [];
        const result = await hub.lookupAll("hello", ["a", "b"], (receipt, isCurrent) => {
            progressUpdates.push({ id: receipt.id, isCurrent });
        });

        expect(result.isCurrent).toBe(true);
        expect(result.receipts.a.status).toBe("success");
        expect(result.receipts.b.status).toBe("success");
        expect(progressUpdates).toHaveLength(2);
        expect(progressUpdates.every((p) => p.isCurrent)).toBe(true);
    });

    it("intercepts outdated race-condition queries via isCurrent flag", async () => {
        const hub = new DictionaryHub([createMockAdapter("slow", 50)]);

        const callbacks: { word: string; isCurrent: boolean }[] = [];

        // Start slow query 1
        const p1 = hub.lookupAll("first", ["slow"], (_, isCurrent) => {
            callbacks.push({ word: "first", isCurrent });
        });

        // Immediately start fast query 2, superseding query 1
        const p2 = hub.lookupAll("second", ["slow"], (_, isCurrent) => {
            callbacks.push({ word: "second", isCurrent });
        });

        const [r1, r2] = await Promise.all([p1, p2]);

        expect(r1.isCurrent).toBe(false);
        expect(r2.isCurrent).toBe(true);
        expect(callbacks.find((c) => c.word === "first")?.isCurrent).toBe(false);
        expect(callbacks.find((c) => c.word === "second")?.isCurrent).toBe(true);
    });

    it("handles partial failure without rejecting lookupAll", async () => {
        const throwingAdapter: DictionaryAdapter = {
            id: "faulty",
            name: "Faulty",
            description: "Throws",
            async lookup() {
                throw new Error("Network crash");
            },
        };

        const hub = new DictionaryHub([createMockAdapter("ok"), throwingAdapter]);

        const result = await hub.lookupAll("word");
        expect(result.receipts.ok.status).toBe("success");
        expect(result.receipts.faulty.status).toBe("error");
        expect(result.receipts.faulty.error).toBe("Network crash");
    });

    it("translates sentence using capable adapter", async () => {
        const youdao = createMockAdapter("youdao", 0, null, async (text) => `[YD] ${text}`);
        const deepl = createMockAdapter("deepl", 0, null, async (text) => `[DL] ${text}`);

        const hub = new DictionaryHub([youdao, deepl]);

        // Default routes to first capable (youdao)
        expect(await hub.translateSentence("Hello")).toBe("[YD] Hello");

        // Can route to preferred (deepl)
        expect(await hub.translateSentence("Hello", "deepl")).toBe("[DL] Hello");

        // Returns empty string for empty input
        expect(await hub.translateSentence("   ")).toBe("");
    });
});
