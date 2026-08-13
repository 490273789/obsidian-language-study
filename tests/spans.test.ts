import { describe, expect, it } from "vitest";

import { buildDaySpans } from "@/db/spans";

describe("buildDaySpans", () => {
    it("returns seven daily spans, each from before to", () => {
        const spans = buildDaySpans();

        expect(spans).toHaveLength(7);
        spans.forEach((span) => {
            expect(span.from).toBeLessThanOrEqual(span.to);
        });
    });

    it("returns spans in ascending chronological order", () => {
        const spans = buildDaySpans();

        for (let i = 1; i < spans.length; i++) {
            expect(spans[i].from).toBeGreaterThan(spans[i - 1].from);
        }
    });
});
