import { describe, expect, it, vi } from "vitest";

import { TextDatabasePublication } from "@/textDatabase/publication";
import type { ExpressionInfo, ExpressionInfoSimple } from "@/db/interface";

type FileRef = {
    path: string;
};

function makeSimpleExpression(
    expression: string,
    meaning: string,
    status: ExpressionInfoSimple["status"]
): ExpressionInfoSimple {
    return {
        expression,
        meaning,
        status,
        t: "WORD",
        tags: [],
        note_num: 0,
        sen_num: 0,
        date: 0,
    };
}

function makeExpression(expression: string, meaning: string): ExpressionInfo {
    return {
        expression,
        meaning,
        status: 1,
        t: "WORD",
        tags: [],
        notes: [],
        sentences: [],
    };
}

function makePublicationHarness({
    wordPath = "word.md",
    reviewPath = "review.md",
    validFiles = ["word.md", "review.md"],
    wordExpressions = [] as ExpressionInfoSimple[],
    reviewExpressions = [] as ExpressionInfo[],
    initialFiles = {} as Record<string, string>,
} = {}) {
    const files = new Map<string, string>(Object.entries(initialFiles));
    const reloadCustomDictionaries = vi.fn();
    const writes: Array<{ path: string; text: string }> = [];

    const publication = new TextDatabasePublication<FileRef>({
        getSettings: () => ({
            wordDatabasePath: wordPath,
            reviewDatabasePath: reviewPath,
            colDelimiter: ",",
            reviewDelimiter: "?",
        }),
        expressionStore: {
            getAllExpressionSimple: vi.fn(async () => wordExpressions),
            getExpressionAfter: vi.fn(async () => reviewExpressions),
        },
        vault: {
            getFile: (path) => (validFiles.includes(path) ? { path } : null),
            read: async (file) => files.get(file.path) ?? "",
            write: async (file, text) => {
                files.set(file.path, text);
                writes.push({ path: file.path, text });
            },
        },
        completionReloader: {
            reloadCustomDictionaries,
        },
    });

    return {
        files,
        publication,
        reloadCustomDictionaries,
        writes,
    };
}

describe("TextDatabasePublication", () => {
    it("publishes the word database with the existing lookup format", async () => {
        const { files, publication, reloadCustomDictionaries } = makePublicationHarness({
            wordExpressions: [
                makeSimpleExpression("alpha", "first", 1),
                makeSimpleExpression("beta", "second", 3),
            ],
        });

        await expect(publication.publishWordDatabase()).resolves.toEqual({
            target: "word",
            status: "published",
        });

        expect(files.get("word.md")).toBe(
            [
                "#### Learning",
                "alpha,    first",
                "",
                "#### Familiar",
                "",
                "",
                "#### Known",
                "beta,    second",
                "",
                "#### Learned",
                "",
                "",
                "",
                "#### \u53cd\u5411\u67e5\u8be2",
                "first  ,  alpha",
                "second  ,  beta",
            ].join("\n")
        );
        expect(reloadCustomDictionaries).toHaveBeenCalledTimes(1);
    });

    it("publishes the review database and preserves existing spaced-repetition metadata", async () => {
        const alpha = makeExpression("alpha", "new meaning");
        alpha.notes = ["note one"];
        alpha.sentences = [
            {
                text: " Alpha appears. ",
                trans: " \u963f\u5c14\u6cd5\u51fa\u73b0\u3002 ",
                origin: " Book ",
            },
        ];
        const beta = makeExpression("beta", "second");
        const { files, publication } = makePublicationHarness({
            reviewExpressions: [beta, alpha],
            initialFiles: {
                "review.md": [
                    "#flashcards",
                    "",
                    "#word",
                    "#### alpha",
                    "?",
                    "old meaning",
                    "<!--SR:!2026-01-01,1,250-->",
                    "",
                ].join("\n"),
            },
        });

        await expect(publication.publishReviewDatabase()).resolves.toEqual({
            target: "review",
            status: "published",
        });

        expect(files.get("review.md")).toBe(
            [
                "#flashcards",
                "",
                "#word",
                "#### alpha",
                "?",
                "new meaning",
                "**Notes**:",
                "note one",
                "**Sentences**:",
                "*Alpha appears.*",
                "\u963f\u5c14\u6cd5\u51fa\u73b0\u3002",
                "Book",
                "<!--SR:!2026-01-01,1,250-->",
                "",
                "#word",
                "#### beta",
                "?",
                "second",
                "",
                "",
            ].join("\n")
        );
    });

    it("leaves the review database untouched when there is no source data", async () => {
        const { files, publication, writes } = makePublicationHarness({
            reviewExpressions: [],
            initialFiles: {
                "review.md": "#flashcards\n\nunchanged",
            },
        });

        await expect(publication.publishReviewDatabase()).resolves.toEqual({
            target: "review",
            status: "emptySource",
        });

        expect(files.get("review.md")).toBe("#flashcards\n\nunchanged");
        expect(writes).toEqual([]);
    });

    it("reloads completion dictionaries after publishAll only when the word database is written", async () => {
        const published = makePublicationHarness({
            wordExpressions: [makeSimpleExpression("alpha", "first", 1)],
            reviewExpressions: [],
        });

        await expect(published.publication.publishAll()).resolves.toMatchObject({
            word: { target: "word", status: "published" },
            review: { target: "review", status: "emptySource" },
        });
        expect(published.reloadCustomDictionaries).toHaveBeenCalledTimes(1);

        const skipped = makePublicationHarness({
            wordPath: "",
            reviewExpressions: [makeExpression("alpha", "first")],
        });

        await expect(skipped.publication.publishAll()).resolves.toMatchObject({
            word: { target: "word", status: "skipped" },
            review: { target: "review", status: "published" },
        });
        expect(skipped.reloadCustomDictionaries).not.toHaveBeenCalled();
    });

    it("returns invalidTarget for configured paths that are not writable files", async () => {
        const { publication } = makePublicationHarness({
            validFiles: [],
        });

        await expect(publication.publishWordDatabase()).resolves.toEqual({
            target: "word",
            status: "invalidTarget",
        });
        await expect(publication.publishReviewDatabase()).resolves.toEqual({
            target: "review",
            status: "invalidTarget",
        });
    });
});
