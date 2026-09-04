import { describe, expect, it } from "vitest";

import {
    countWordStatuses,
    collectArticleWords,
    renderArticle,
    selectPositiveExpressions,
} from "@/views/renderArticle";

describe("renderArticle (pure)", () => {
    it("escapes source text before rendering html", () => {
        const html = renderArticle(`<script>alert(1)</script>`, {
            phrases: [],
            wordStatuses: new Map(),
        });

        expect(html).toContain("&lt;");
        expect(html).not.toContain("<script>");
    });

    it("renders stored words and phrases with status classes", () => {
        const html = renderArticle("alpha visits new york.", {
            phrases: [{ text: "new york", status: 2, offset: 13 }],
            wordStatuses: new Map([
                ["alpha", 1],
                ["beta", 0],
            ]),
        });

        expect(html).toContain(`class="word learning"`);
        expect(html).toContain(`class="phrase familiar"`);
    });

    it("does not wrap phrase text when the stored offset does not align to parser nodes", () => {
        const html = renderArticle("new yorker arrived.", {
            phrases: [{ text: "new york", status: 2, offset: 0 }],
            wordStatuses: new Map(),
        });

        expect(html).not.toContain(`class="phrase`);
        expect(html).toContain(`class="word new"`);
    });

    it("collects unique lowercased words, filtering numbers and CJK", () => {
        expect(collectArticleWords("Alpha alpha beta 123")).toEqual(["alpha", "beta"]);
        expect(collectArticleWords("hello 你好 world")).toEqual(["hello", "world"]);
    });

    it("counts unknown, learned, and ignored words", () => {
        expect(
            countWordStatuses(
                ["alpha", "beta", "gamma"],
                [
                    { text: "alpha", status: 1 },
                    { text: "beta", status: 0 },
                ]
            )
        ).toEqual([1, 1, 1]);
    });

    it("selects only positive-status expressions, phrases first", () => {
        expect(
            selectPositiveExpressions({
                phrases: [{ text: "new york", status: 2, offset: 0 }],
                words: [
                    { text: "alpha", status: 1 },
                    { text: "beta", status: 0 },
                ],
            })
        ).toEqual(["new york", "alpha"]);
    });
});
