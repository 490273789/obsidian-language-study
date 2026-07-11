import { describe, expect, it, vi } from "vitest";
import Dexie from "dexie";

import { LocalDb } from "@/db/local_db";
import { LearningRecordStoreError } from "@/learningRecord/intake";

describe("LocalDb Learning Record commit adapter", () => {
    it("maps a whole-record update while preserving its first accepted date", async () => {
        const expressionUpdate = vi.fn(async () => 1);
        const sentenceAdd = vi.fn(async () => 11);
        const db = Object.create(LocalDb.prototype) as LocalDb;
        Object.assign(db, {
            idb: {
                expressions: {
                    where(field: string) {
                        expect(field).toBe("expression");
                        return {
                            equals(expression: string) {
                                expect(expression).toBe("alpha");
                                return {
                                    async first() {
                                        return { id: 7, date: 100 };
                                    },
                                };
                            },
                        };
                    },
                    update: expressionUpdate,
                    add: vi.fn(),
                },
                sentences: {
                    where() {
                        return {
                            equals() {
                                return { async first() {} };
                            },
                        };
                    },
                    add: sentenceAdd,
                    update: vi.fn(),
                },
                async transaction(
                    _mode: string,
                    _expressions: unknown,
                    _sentences: unknown,
                    work: () => Promise<unknown>
                ) {
                    return work();
                },
            },
        });

        await expect(
            db.commitWhole(
                {
                    expression: "alpha",
                    meaning: "updated",
                    status: 2,
                    type: "WORD",
                    tags: ["greek"],
                    notes: ["note"],
                    sentences: [{ text: "Alpha.", trans: "", origin: "Book" }],
                },
                999
            )
        ).resolves.toMatchObject({
            operation: "updated",
            record: {
                expression: "alpha",
                firstAcceptedAt: 100,
            },
        });

        expect(expressionUpdate).toHaveBeenCalledWith(
            7,
            expect.objectContaining({ date: 100, meaning: "updated" })
        );
        expect(sentenceAdd).toHaveBeenCalledTimes(1);
    });

    it("maps an IndexedDB failure to an expected record-store outcome", async () => {
        const db = Object.create(LocalDb.prototype) as LocalDb;
        Object.assign(db, {
            idb: {
                expressions: {},
                sentences: {},
                async transaction() {
                    throw new Dexie.DatabaseClosedError();
                },
            },
        });

        await expect(
            db.commitWhole(
                {
                    expression: "alpha",
                    meaning: "first",
                    status: 1,
                    type: "WORD",
                    tags: [],
                    notes: [],
                    sentences: [],
                },
                1234
            )
        ).rejects.toEqual(new LearningRecordStoreError("record_store_unavailable"));
    });
});
