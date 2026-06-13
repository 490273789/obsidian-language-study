import { describe, expect, it, vi } from "vitest";

import { LocalDb } from "@/db/local_db";

function createLocalDbHarness() {
    let phraseQueryCount = 0;
    const phraseEntries = [
        {
            expression: "new york",
            status: 2,
        },
    ];

    const expressions = {
        where(field: string) {
            return {
                equals(value: string) {
                    return {
                        async each(
                            callback: (expr: { expression: string; status: number }) => void
                        ) {
                            if (field === "t" && value === "PHRASE") {
                                phraseQueryCount++;
                                phraseEntries.forEach(callback);
                            }
                        },
                        async first() {
                            return undefined;
                        },
                    };
                },
                anyOf() {
                    return {
                        async toArray() {
                            return [];
                        },
                    };
                },
            };
        },
        async bulkPut() {},
    };

    const db = Object.create(LocalDb.prototype) as LocalDb;
    Object.assign(db, {
        idb: {
            expressions,
            sentences: {
                where: vi.fn(),
            },
        },
    });

    return {
        db,
        get phraseQueryCount() {
            return phraseQueryCount;
        },
    };
}

describe("LocalDb phrase cache", () => {
    it("reuses the phrase automaton between reads and invalidates after ignore writes", async () => {
        const harness = createLocalDbHarness();

        await harness.db.getStoredWords({ article: "new york is large", words: [] });
        await harness.db.getStoredWords({ article: "new york is busy", words: [] });
        expect(harness.phraseQueryCount).toBe(1);

        await harness.db.postIgnoreWords(["ignored"]);
        await harness.db.getStoredWords({ article: "new york again", words: [] });
        expect(harness.phraseQueryCount).toBe(2);
    });
});
