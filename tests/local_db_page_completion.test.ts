import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { LocalDb } from "@/db/local_db";
import type { ExpressionStatus, ExpressionType } from "@/db/interface";
import { ReadingPageCompletionStoreError } from "@/reading/pageCompletion";

const databases: LocalDb[] = [];

function createDb(): LocalDb {
    const db = new LocalDb({
        settings: { db_name: `page-completion-${crypto.randomUUID()}` },
    } as never);
    databases.push(db);
    return db;
}

type StoredExpression = {
    expression: string;
    meaning: string;
    status: ExpressionStatus;
    t: ExpressionType;
    notes: string[];
    sentences: Set<number>;
    tags: Set<string>;
    connections: Map<string, string>;
    date: number;
};

function expression(overrides: Partial<StoredExpression> = {}): StoredExpression {
    return {
        expression: "beta",
        meaning: "already studied",
        status: 3 as const,
        t: "PHRASE" as const,
        notes: ["keep"],
        sentences: new Set([9]),
        tags: new Set(["tag"]),
        connections: new Map([["related", "word"]]),
        date: 123,
        ...overrides,
    };
}

afterEach(async () => {
    await Promise.all(databases.splice(0).map((db) => db.destroyAll()));
});

describe("LocalDb Reading Page Completion ignore store", () => {
    it("normalizes words and preserves complete existing Learning Records", async () => {
        const db = createDb();
        await db.open();
        await db.idb.expressions.add(expression());

        await db.postIgnoreWords([" Alpha ", "", "BETA", "alpha", "  "]);

        const alpha = await db.idb.expressions.where("expression").equals("alpha").first();
        const beta = await db.idb.expressions.where("expression").equals("beta").first();
        expect(alpha).toEqual(
            expect.objectContaining({ expression: "alpha", meaning: "", status: 0, t: "WORD" })
        );
        expect(beta).toMatchObject(expression());
        expect(beta?.notes).toEqual(["keep"]);
        expect(beta?.sentences).toEqual(new Set([9]));
        expect(beta?.tags).toEqual(new Set(["tag"]));
        expect(beta?.connections).toEqual(new Map([["related", "word"]]));
    });

    it("does not write an empty normalized batch", async () => {
        const db = createDb();
        await db.open();

        await db.postIgnoreWords(["", "  "]);

        expect(await db.idb.expressions.count()).toBe(0);
    });

    it("rolls back the complete batch on a write failure and supports an idempotent retry", async () => {
        const db = createDb();
        await db.open();
        const failSecondInsert = (_key: number, record: { expression: string }) => {
            if (record.expression === "beta") {
                throw new Error("write failed");
            }
        };
        db.idb.expressions.hook("creating", failSecondInsert);

        await expect(db.postIgnoreWords(["alpha", "beta"])).rejects.toEqual(
            new ReadingPageCompletionStoreError("ignore_store_unavailable")
        );
        expect(await db.idb.expressions.count()).toBe(0);

        db.idb.expressions.hook("creating").unsubscribe(failSecondInsert);
        await db.postIgnoreWords(["alpha", "beta", "alpha"]);
        await db.postIgnoreWords(["alpha", "beta"]);

        expect(await db.idb.expressions.count()).toBe(2);
        expect(
            await db.idb.expressions.where("expression").anyOf(["alpha", "beta"]).toArray()
        ).toHaveLength(2);
    });

    it("preserves an accepted Learning Record when completion overlaps its commit", async () => {
        const db = createDb();
        await db.open();
        const candidate = {
            expression: "alpha",
            meaning: "first",
            status: 2 as const,
            type: "WORD" as const,
            tags: ["review"],
            notes: ["note"],
            sentences: [],
        };

        await Promise.all([db.commitWhole(candidate, 456), db.postIgnoreWords(["alpha"])]);

        expect(await db.idb.expressions.where("expression").equals("alpha").first()).toEqual(
            expect.objectContaining({
                expression: "alpha",
                meaning: "first",
                status: 2,
                t: "WORD",
                notes: ["note"],
                tags: new Set(["review"]),
                date: 456,
            })
        );
    });
});
