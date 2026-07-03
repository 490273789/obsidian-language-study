import { describe, expect, it, vi } from "vitest";

import { LocalDb } from "@/db/local_db";

function createLocalDbHarness() {
    let phraseQueryCount = 0;
    const expressionAdd = vi.fn(async () => 1);
    const expressionUpdate = vi.fn(async () => 1);
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
        add: expressionAdd,
        update: expressionUpdate,
        async bulkPut() {},
    };

    const db = Object.create(LocalDb.prototype) as LocalDb;
    Object.assign(db, {
        idb: {
            async open() {},
            close() {},
            expressions,
            sentences: {
                where() {
                    return {
                        equals() {
                            return {
                                async first() {
                                    return undefined;
                                },
                            };
                        },
                    };
                },
                async add() {
                    return 1;
                },
            },
        },
    });

    return {
        db,
        get phraseQueryCount() {
            return phraseQueryCount;
        },
        expressionAdd,
        expressionUpdate,
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

    it("invalidates cached phrases after expression writes and opening the database", async () => {
        const harness = createLocalDbHarness();

        await harness.db.getStoredWords({ article: "new york is large", words: [] });
        expect(harness.phraseQueryCount).toBe(1);

        await harness.db.postExpression({
            expression: "alpha",
            meaning: "a",
            status: 1,
            t: "WORD",
            tags: [],
            notes: [],
            sentences: [],
        });
        await harness.db.getStoredWords({ article: "new york again", words: [] });
        expect(harness.expressionAdd).toHaveBeenCalledTimes(1);
        expect(harness.expressionUpdate).not.toHaveBeenCalled();
        expect(harness.phraseQueryCount).toBe(2);

        await harness.db.open();
        await harness.db.getStoredWords({ article: "new york once more", words: [] });
        expect(harness.phraseQueryCount).toBe(3);
    });
});
