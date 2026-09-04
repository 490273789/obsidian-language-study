import { describe, expect, it } from "vitest";
import { moment } from "@/utils/moment";
import {
    buildDailyTimeWindows,
    aggregateDailyLearningStats,
    convertLegacyWordCounts,
} from "@/stats/aggregations";
import type { LearningRecordTimeItem, WordCount } from "@/db/interface";

describe("stats aggregations (pure domain)", () => {
    // 2026-09-04 12:00:00 UTC
    const fixedNow = moment("2026-09-04T12:00:00Z").valueOf();

    describe("buildDailyTimeWindows", () => {
        it("generates continuous chronological windows ending on the target day", () => {
            const windows = buildDailyTimeWindows(7, fixedNow);

            expect(windows).toHaveLength(7);
            expect(windows.map((w) => w.dateLabel)).toEqual([
                "8-29",
                "8-30",
                "8-31",
                "9-1",
                "9-2",
                "9-3",
                "9-4",
            ]);

            // 检查区间起止时间是否连续且为当天边界
            for (let i = 0; i < windows.length; i++) {
                const win = windows[i];
                expect(win.to).toBeGreaterThan(win.from);
                // 距结束不超过 86400 秒 (1天)
                expect(win.to - win.from).toBe(86399);

                if (i > 0) {
                    expect(win.from).toBe(windows[i - 1].to + 1);
                }
            }
        });

        it("handles 1 day window correctly", () => {
            const windows = buildDailyTimeWindows(1, fixedNow);
            expect(windows).toHaveLength(1);
            expect(windows[0].dateLabel).toBe("9-4");
        });
    });

    describe("aggregateDailyLearningStats", () => {
        it("returns zero counts and correct labels when given empty items", () => {
            const windows = buildDailyTimeWindows(3, fixedNow);
            const result = aggregateDailyLearningStats([], windows);

            expect(result).toHaveLength(3);
            expect(result.map((r) => r.dateLabel)).toEqual(["9-2", "9-3", "9-4"]);
            for (const item of result) {
                expect(item.dayIgnore).toBe(0);
                expect(item.dayLearned).toBe(0);
                expect(item.accumulated).toBe(0);
                expect(item.statusBreakdown).toEqual([0, 0, 0, 0, 0]);
                expect(item.accumulatedBreakdown).toEqual([0, 0, 0, 0, 0]);
            }
        });

        it("aggregates items into correct days, separating ignored and learned words, and accumulates correctly", () => {
            const windows = buildDailyTimeWindows(3, fixedNow);
            // windows:
            // 0: 9-2
            // 1: 9-3
            // 2: 9-4
            const win92 = windows[0];
            const win93 = windows[1];
            const win94 = windows[2];

            const items: LearningRecordTimeItem[] = [
                // 9-1 以前的存量（早于窗口）
                { date: win92.from - 1000, status: 1 },
                { date: win92.from - 500, status: 0 },

                // 9-2: 1个 ignore (0), 2个 learned (1, 3)
                { date: win92.from + 100, status: 0 },
                { date: win92.from + 200, status: 1 },
                { date: win92.to - 50, status: 3 },

                // 9-3: 0个 ignore, 1个 learned (4)
                { date: win93.from + 500, status: 4 },

                // 9-4: 2个 ignore (0, 0), 1个 learned (2)
                { date: win94.from + 10, status: 0 },
                { date: win94.from + 20, status: 0 },
                { date: win94.to - 10, status: 2 },

                // 未来的记录（超出窗口），应当被忽略
                { date: win94.to + 1000, status: 1 },
            ];

            const stats = aggregateDailyLearningStats(items, windows);

            expect(stats).toHaveLength(3);

            // 9-2:
            // 当日: ignore = 1, learned = 2.
            // 累计: 存量(2) + 当日(3) = 5
            expect(stats[0]).toMatchObject({
                dateLabel: "9-2",
                dayIgnore: 1,
                dayLearned: 2,
                accumulated: 5,
                statusBreakdown: [1, 1, 0, 1, 0],
                accumulatedBreakdown: [2, 2, 0, 1, 0],
            });

            // 9-3:
            // 当日: ignore = 0, learned = 1.
            // 累计: 前日(5) + 当日(1) = 6
            expect(stats[1]).toMatchObject({
                dateLabel: "9-3",
                dayIgnore: 0,
                dayLearned: 1,
                accumulated: 6,
                statusBreakdown: [0, 0, 0, 0, 1],
                accumulatedBreakdown: [2, 2, 0, 1, 1],
            });

            // 9-4:
            // 当日: ignore = 2, learned = 1.
            // 累计: 前日(6) + 当日(3) = 9
            expect(stats[2]).toMatchObject({
                dateLabel: "9-4",
                dayIgnore: 2,
                dayLearned: 1,
                accumulated: 9,
                statusBreakdown: [2, 0, 1, 0, 0],
                accumulatedBreakdown: [4, 2, 1, 1, 1],
            });
        });

        it("filters out non-WORD records if present", () => {
            const windows = buildDailyTimeWindows(1, fixedNow);
            const win = windows[0];

            const items: LearningRecordTimeItem[] = [
                { date: win.from + 10, status: 1, type: "WORD" },
                { date: win.from + 20, status: 2, type: "PHRASE" },
            ];

            const stats = aggregateDailyLearningStats(items, windows);
            expect(stats[0].dayLearned).toBe(1);
            expect(stats[0].accumulated).toBe(1);
            expect(stats[0].accumulatedBreakdown).toEqual([0, 1, 0, 0, 0]);
        });
    });

    describe("convertLegacyWordCounts", () => {
        it("normalizes legacy WordCount array into DailyLearningStat array", () => {
            const windows = buildDailyTimeWindows(2, fixedNow);
            const legacy: WordCount[] = [
                {
                    today: [3, 1, 2, 0, 0],
                    accumulated: [10, 5, 2, 0, 0],
                },
                {
                    today: [1, 0, 0, 1, 1],
                    accumulated: [11, 5, 2, 1, 1],
                },
            ];

            const result = convertLegacyWordCounts(legacy, windows);

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                dateLabel: "9-3",
                timestamp: windows[0].to,
                dayIgnore: 3,
                dayLearned: 3, // 1 + 2
                accumulated: 17, // 10 + 5 + 2
                statusBreakdown: [3, 1, 2, 0, 0],
                accumulatedBreakdown: [10, 5, 2, 0, 0],
            });
            expect(result[1]).toEqual({
                dateLabel: "9-4",
                timestamp: windows[1].to,
                dayIgnore: 1,
                dayLearned: 2, // 1 + 1
                accumulated: 20, // 11 + 5 + 2 + 1 + 1
                statusBreakdown: [1, 0, 0, 1, 1],
                accumulatedBreakdown: [11, 5, 2, 1, 1],
            });
        });
    });
});
