import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
    ...(await importOriginal<typeof import("obsidian")>()),
    requestUrl: vi.fn(),
}));

import { requestUrl } from "obsidian";
import { LocalDb } from "@/db/local_db";
import { WebDb } from "@/db/web_db";
import { moment } from "@/utils/moment";

const mockedRequestUrl = vi.mocked(requestUrl);

describe("Database Learning Record Statistics Adapters", () => {
    const fixedNow = moment("2026-09-04T12:00:00Z").valueOf();

    describe("LocalDb stats adapter", () => {
        it("aggregates expressions from idb into daily stats using pure aggregation", async () => {
            const db = Object.create(LocalDb.prototype) as LocalDb;

            // 模拟 9-4 当天 startOf / endOf 附近的记录
            const winFrom = moment(fixedNow).startOf("day").unix();
            const expressions = [
                { t: "WORD", status: 0, date: winFrom + 10 },
                { t: "WORD", status: 1, date: winFrom + 20 },
                { t: "PHRASE", status: 2, date: winFrom + 30 }, // 非 WORD 应被忽略
                { t: "WORD", status: 3, date: winFrom - 10000 }, // 前一天/存量
            ];

            Object.assign(db, {
                idb: {
                    expressions: {
                        filter: (predicate: (item: (typeof expressions)[0]) => boolean) => ({
                            each: async (callback: (item: (typeof expressions)[0]) => void) => {
                                for (const item of expressions) {
                                    if (predicate(item)) {
                                        callback(item);
                                    }
                                }
                            },
                        }),
                    },
                },
            });

            const stats = await db.getDailyLearningStats(2, fixedNow);

            expect(stats).toHaveLength(2);
            // 9-3
            expect(stats[0].dateLabel).toBe("9-3");
            expect(stats[0].accumulated).toBe(1);
            expect(stats[0].accumulatedBreakdown).toEqual([0, 0, 0, 1, 0]);
            // 9-4
            expect(stats[1].dateLabel).toBe("9-4");
            expect(stats[1].dayIgnore).toBe(1);
            expect(stats[1].dayLearned).toBe(1);
            expect(stats[1].accumulated).toBe(3); // 1 存量 + 2 当天 WORD
            expect(stats[1].accumulatedBreakdown).toEqual([1, 1, 0, 1, 0]);
        });

        it("countSeven delegates to getDailyLearningStats and maps legacy WordCount structure with 5-element arrays", async () => {
            const db = Object.create(LocalDb.prototype) as LocalDb;
            vi.spyOn(db, "getDailyLearningStats").mockResolvedValue([
                {
                    dateLabel: "9-3",
                    timestamp: 123456,
                    dayIgnore: 1,
                    dayLearned: 2,
                    accumulated: 5,
                    statusBreakdown: [1, 2, 0, 0, 0],
                    accumulatedBreakdown: [2, 3, 0, 0, 0],
                },
            ]);

            const counts = await db.countSeven();
            expect(counts).toEqual([
                {
                    today: [1, 2, 0, 0, 0],
                    accumulated: [2, 3, 0, 0, 0],
                },
            ]);
        });
    });

    describe("WebDb stats adapter", () => {
        beforeEach(() => {
            mockedRequestUrl.mockReset();
        });

        it("calls /count_time and normalizes legacy WordCount response into DailyLearningStat", async () => {
            mockedRequestUrl.mockResolvedValue({
                status: 200,
                json: [
                    { today: [1, 2, 0, 0, 0], accumulated: [5, 10, 0, 0, 0] },
                    { today: [2, 1, 1, 0, 0], accumulated: [7, 11, 1, 0, 0] },
                ],
            } as never);

            const db = new WebDb("localhost", 8086, false, "");
            const stats = await db.getDailyLearningStats(2, fixedNow);

            expect(stats).toHaveLength(2);
            expect(stats[0].dateLabel).toBe("9-3");
            expect(stats[0].dayIgnore).toBe(1);
            expect(stats[0].dayLearned).toBe(2);
            expect(stats[0].accumulated).toBe(15);

            expect(stats[1].dateLabel).toBe("9-4");
            expect(stats[1].dayIgnore).toBe(2);
            expect(stats[1].dayLearned).toBe(2);
            expect(stats[1].accumulated).toBe(19);

            expect(mockedRequestUrl).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: "POST",
                    url: "http://localhost:8086/lr/count_time",
                })
            );
        });

        it("returns empty zeroed daily stats when request fails", async () => {
            mockedRequestUrl.mockRejectedValue(new Error("Network error"));

            const db = new WebDb("localhost", 8086, false, "");
            const stats = await db.getDailyLearningStats(2, fixedNow);

            expect(stats).toHaveLength(2);
            expect(stats[0].accumulated).toBe(0);
            expect(stats[1].accumulated).toBe(0);
        });
    });
});
