import { moment } from "@/utils/moment";
import type { Span } from "./interface";

// 返回最近 7 天（含今天）每一天的 [from, to] Unix 秒区间
function buildDaySpans(): Span[] {
    return [0, 1, 2, 3, 4, 5, 6].map((i) => {
        const from = moment().subtract(6, "days").startOf("day").add(i, "days");
        return {
            from: from.unix(),
            to: from.endOf("day").unix(),
        };
    });
}

export { buildDaySpans };
