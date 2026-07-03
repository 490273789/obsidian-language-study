import { describe, expect, it, vi } from "vitest";

import { TextParser } from "@/views/parser";
import type { ArticleWords, WordsPhrase } from "@/db/interface";

function makeParser() {
    const getExpressionsSimple = vi.fn(async (expressions: string[]) =>
        expressions.map((expression) => ({
            expression,
            meaning: `${expression} meaning`,
            status: 1 as const,
            t: "WORD" as const,
            tags: [],
            note_num: 0,
            sen_num: 0,
            date: 0,
        }))
    );
    const db = {
        async getStoredWords(payload: ArticleWords): Promise<WordsPhrase> {
            if (payload.article.includes("new york")) {
                return {
                    words: payload.words
                        .filter((word) => word === "alpha" || word === "beta")
                        .map((word) => ({
                            text: word,
                            status: word === "beta" ? (0 as const) : (1 as const),
                        })),
                    phrases: [
                        {
                            text: "new york",
                            status: 2,
                            offset: payload.article.indexOf("new york"),
                        },
                    ],
                };
            }
            if (payload.article.includes("gamma delta")) {
                await new Promise((resolve) => setTimeout(resolve, 5));
                return {
                    words: [],
                    phrases: [
                        {
                            text: "gamma delta",
                            status: 4,
                            offset: payload.article.indexOf("gamma delta"),
                        },
                    ],
                };
            }
            if (payload.words.length > 0) {
                return {
                    words: payload.words
                        .filter((word) => word === "alpha" || word === "beta")
                        .map((word) => ({
                            text: word,
                            status: word === "beta" ? (0 as const) : (1 as const),
                        })),
                    phrases: [],
                };
            }
            return { words: [], phrases: [] };
        },
        getExpressionsSimple,
    };
    return {
        parser: new TextParser({ db } as never),
        getExpressionsSimple,
    };
}

describe("TextParser", () => {
    it("escapes source text before rendering html", async () => {
        const { parser } = makeParser();
        const html = await parser.parse(`<script>alert(1)</script>`);

        expect(html).toContain("&lt;");
        expect(html).not.toContain("<script>");
    });

    it("renders stored words and phrases with status classes", async () => {
        const { parser } = makeParser();
        const html = await parser.parse("alpha visits new york.");

        expect(html).toContain(`class="word learning"`);
        expect(html).toContain(`class="phrase familiar"`);
    });

    it("keeps concurrent parses isolated", async () => {
        const { parser } = makeParser();
        const [first, second] = await Promise.all([
            parser.parse("alpha goes home."),
            parser.parse("gamma delta appears."),
        ]);

        expect(first).toContain(`class="word learning"`);
        expect(first).not.toContain(`class="phrase learned"`);
        expect(second).toContain(`class="phrase learned"`);
    });

    it("counts unknown, learned, and ignored words", async () => {
        const { parser } = makeParser();

        await expect(parser.countWords("Alpha beta gamma.")).resolves.toEqual([1, 1, 1]);
    });

    it("returns only positive-status expressions for collected words and phrases", async () => {
        const { parser, getExpressionsSimple } = makeParser();
        const result = await parser.getWordsPhrases("Alpha meets new york and beta.");

        expect(getExpressionsSimple).toHaveBeenCalledWith(["new york", "alpha"]);
        expect(result.map((item) => item.expression)).toEqual(["new york", "alpha"]);
    });

    it("does not wrap phrase text when the stored offset does not align to parser nodes", async () => {
        const { parser } = makeParser();
        const html = await parser.parse("new yorker arrived.");

        expect(html).not.toContain(`class="phrase`);
        expect(html).toContain(`class="word new"`);
    });
});
