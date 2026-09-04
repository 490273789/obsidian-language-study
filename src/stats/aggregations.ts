import { moment } from "@/utils/moment";
import type { DailyLearningStat, LearningRecordTimeItem, WordCount } from "@/db/interface";

export type DailyTimeWindow = Readonly<{
    dateLabel: string;
    from: number; // Unix timestamp in seconds (start of day)
    to: number; // Unix timestamp in seconds (end of day)
}>;

/**
 * 生成最近 `days` 天（包含当天）的每日时间区间，从最早的一天到当天升序排列。
 * 支持确定性时间注入，以便在单元测试中稳定验证。
 */
export function buildDailyTimeWindows(
    days = 7,
    now?: number | string | Date
): readonly DailyTimeWindow[] {
    const safeDays = Math.max(1, Math.floor(days));
    const base = now !== undefined ? moment(now) : moment();

    const windows: DailyTimeWindow[] = [];
    for (let i = safeDays - 1; i >= 0; i--) {
        const current = moment(base).subtract(i, "days");
        windows.push({
            dateLabel: current.format("M-D"),
            from: moment(current).startOf("day").unix(),
            to: moment(current).endOf("day").unix(),
        });
    }

    return windows;
}

/**
 * 纯内存单次扫描聚合学习记录时序数据。
 * @param items 所有待统计的记录项（时间戳 + 状态），无序或有序皆可
 * @param windows 目标时间区间序列（需按时间升序）
 * @returns 对应每个窗口的 DailyLearningStat 统计台账
 */
export function aggregateDailyLearningStats(
    items: readonly LearningRecordTimeItem[],
    windows: readonly DailyTimeWindow[]
): readonly DailyLearningStat[] {
    if (windows.length === 0) {
        return [];
    }

    const firstWindow = windows[0];
    const lastWindow = windows[windows.length - 1];

    // 初始化各个窗口的当天明细统计容器
    const windowBreakdowns = windows.map(() => new Array<number>(5).fill(0));
    // 统计早于第一个窗口的所有存量记录（用于计算初始累计基数，按状态细分）
    const priorBreakdown = new Array<number>(5).fill(0);

    for (const item of items) {
        // 过滤非 WORD 类型的项（如果调用方混入了其他类型）
        if (item.type && item.type !== "WORD") {
            continue;
        }

        const date = item.date;
        const status = item.status;
        if (status < 0 || status > 4) {
            continue;
        }

        // 如果超出统计区间最右侧（未来的记录），忽略
        if (date > lastWindow.to) {
            continue;
        }

        // 如果早于整个统计窗口的最开始时刻，计入窗口前存量
        if (date < firstWindow.from) {
            priorBreakdown[status]++;
            continue;
        }

        // 查找归属窗口
        for (let w = 0; w < windows.length; w++) {
            const win = windows[w];
            if (date >= win.from && date <= win.to) {
                windowBreakdowns[w][status]++;
                break;
            }
        }
    }

    // 滑动累计计算（按状态及总数）
    const runningAccumulatedBreakdown = [...priorBreakdown];
    const result: DailyLearningStat[] = [];

    for (let w = 0; w < windows.length; w++) {
        const win = windows[w];
        const breakdown = windowBreakdowns[w];
        for (let s = 0; s < 5; s++) {
            runningAccumulatedBreakdown[s] += breakdown[s];
        }
        const dayIgnore = breakdown[0];
        const dayLearned = breakdown.slice(1).reduce((acc, count) => acc + count, 0);
        const accumulated = runningAccumulatedBreakdown.reduce((acc, count) => acc + count, 0);

        result.push({
            dateLabel: win.dateLabel,
            timestamp: win.to,
            dayIgnore,
            dayLearned,
            accumulated,
            statusBreakdown: [...breakdown],
            accumulatedBreakdown: [...runningAccumulatedBreakdown],
        });
    }

    return result;
}

/**
 * 将远端历史 API 返回的 WordCount[] 归一化转换为标准 DailyLearningStat[]
 */
export function convertLegacyWordCounts(
    counts: readonly WordCount[],
    windows: readonly DailyTimeWindow[]
): readonly DailyLearningStat[] {
    return counts.map((count, index) => {
        const win = windows[index] ?? {
            dateLabel: `${index + 1}`,
            from: 0,
            to: 0,
        };

        const today = count.today ?? [0, 0, 0, 0, 0];
        const accumulatedArr = count.accumulated ?? [0, 0, 0, 0, 0];

        const dayIgnore = today[0] ?? 0;
        const dayLearned = today.slice(1).reduce((sum, n) => sum + (n ?? 0), 0);
        const accumulated = accumulatedArr.reduce((sum, n) => sum + (n ?? 0), 0);

        return {
            dateLabel: win.dateLabel,
            timestamp: win.to,
            dayIgnore,
            dayLearned,
            accumulated,
            statusBreakdown: [...today],
            accumulatedBreakdown: [...accumulatedArr],
        };
    });
}
