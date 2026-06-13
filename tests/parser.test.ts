import { describe, expect, it } from "vitest";

import { TextParser } from "@/views/parser";
import type { ArticleWords, WordsPhrase } from "@/db/interface";

function makeParser() {
    const db = {
        async getStoredWords(payload: ArticleWords): Promise<WordsPhrase> {
            if (payload.article.includes("new york")) {
                return {
                    words: [],
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
                        .filter((word) => word === "alpha")
                        .map((word) => ({ text: word, status: 1 })),
                    phrases: [],
                };
            }
            return { words: [], phrases: [] };
        },
        async getExpressionsSimple() {
            return [];
        },
    };
    return new TextParser({ db } as never);
}

describe("TextParser", () => {
    it("escapes source text before rendering html", async () => {
        const html = await makeParser().parse(`<script>alert(1)</script>`);

        expect(html).toContain("&lt;");
        expect(html).not.toContain("<script>");
    });

    it("renders stored words and phrases with status classes", async () => {
        const html = await makeParser().parse("alpha visits new york.");

        expect(html).toContain(`class="word learning"`);
        expect(html).toContain(`class="phrase familiar"`);
    });

    it("keeps concurrent parses isolated", async () => {
        const parser = makeParser();
        const [first, second] = await Promise.all([
            parser.parse("alpha goes home."),
            parser.parse("gamma delta appears."),
        ]);

        expect(first).toContain(`class="word learning"`);
        expect(first).not.toContain(`class="phrase learned"`);
        expect(second).toContain(`class="phrase learned"`);
    });
});
