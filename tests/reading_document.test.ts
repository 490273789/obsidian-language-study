import { describe, expect, it, vi } from "vitest";

import { ReadingDocument, divideReadingSections } from "@/reading/readingDocument";
import type { ExpressionInfoSimple } from "@/db/interface";

function makeExpression(expression: string, meaning: string): ExpressionInfoSimple {
    return {
        expression,
        meaning,
        status: 1,
        t: "WORD",
        tags: [],
        note_num: 0,
        sen_num: 0,
        date: 0,
    };
}

function makeReadingDocument(initialText: string, lastPosition = "") {
    let text = initialText;
    let position = lastPosition;
    const getWordsPhrases = vi.fn(async () => [
        makeExpression("alpha", "first"),
        makeExpression("new york", "city"),
    ]);
    const document = new ReadingDocument({
        file: {
            read: async () => text,
            write: async (newText) => {
                text = newText;
            },
        },
        progressStore: {
            getPosition: async () => position,
            setPosition: async (newPosition) => {
                position = newPosition;
            },
        },
        expressionLookup: {
            getWordsPhrases,
        },
    });

    return {
        document,
        get text() {
            return text;
        },
        get position() {
            return position;
        },
        getWordsPhrases,
    };
}

describe("ReadingDocument", () => {
    it("divides known reading sections without creating missing article content", () => {
        const lines = [
            "title",
            "^^^notes",
            "note line",
            "^^^article",
            "one",
            "two",
            "^^^words",
            "old",
        ];

        expect(divideReadingSections(lines)).toEqual({
            notes: { start: 2, end: 3 },
            article: { start: 4, end: 6 },
            words: { start: 7, end: 8 },
        });

        const { document } = makeReadingDocument("plain note without marker");
        expect(document.getArticleLines("plain note without marker")).toEqual([]);
    });

    it("reads sections and creates notes on demand", async () => {
        const harness = makeReadingDocument("^^^article\nalpha\n^^^words\n");

        await expect(harness.document.readSection("article")).resolves.toBe("alpha");
        await expect(harness.document.readSection("notes")).resolves.toBeNull();
        await expect(harness.document.readSection("notes", true)).resolves.toBe("");

        expect(harness.text).toBe("^^^article\nalpha\n^^^words\n\n^^^notes\n\n");
    });

    it("writes existing sections with the current trim and spacing behavior", async () => {
        const harness = makeReadingDocument("^^^article\nalpha\n^^^notes\nold\n^^^words\nword");

        await harness.document.writeSection("notes", "\n new note \n");

        expect(harness.text).toBe("^^^article\nalpha\n^^^notes\nnew note\n\n^^^words\nword");
    });

    it("reads and writes the confirmed reading position", async () => {
        const harness = makeReadingDocument("", "9");
        await expect(harness.document.getLastPosition()).resolves.toBe(9);
        await harness.document.setPosition("5");
        expect(harness.position).toBe("5");
    });

    it("publishes the words section on close when both article and words sections exist", async () => {
        const harness = makeReadingDocument("^^^article\nalpha visits new york.\n^^^words\nold\n");

        await expect(harness.document.publishWordsSection()).resolves.toBe("published");

        expect(harness.getWordsPhrases).toHaveBeenCalledWith("alpha visits new york.");
        expect(harness.text).toBe(
            "^^^article\nalpha visits new york.\n^^^words\n+ **alpha** : first\n+ **new york** : city\n\n"
        );
    });

    it("skips words publication when the article or words section is missing", async () => {
        const noWords = makeReadingDocument("^^^article\nalpha\n");
        await expect(noWords.document.publishWordsSection()).resolves.toBe("skipped");
        expect(noWords.getWordsPhrases).not.toHaveBeenCalled();

        const noArticle = makeReadingDocument("^^^words\nold\n");
        await expect(noArticle.document.publishWordsSection()).resolves.toBe("skipped");
        expect(noArticle.getWordsPhrases).not.toHaveBeenCalled();
    });
});
