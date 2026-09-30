import { describe, expect, it, vi } from "vitest";

import { TextDatabasePublication } from "@/textDatabase/publication";
import type { TextDatabasePublicationSettings } from "@/textDatabase/publication";
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
    const targets = new Map(validFiles.map((path) => [path, { path }]));
    const settings: TextDatabasePublicationSettings = {
        wordDatabasePath: wordPath,
        reviewDatabasePath: reviewPath,
        colDelimiter: ",",
        reviewDelimiter: "?",
    };
    const getSettings = vi.fn(() => settings);
    const reloadCustomDictionaries = vi.fn<() => void | boolean | Promise<void | boolean>>();
    const writes: Array<{ path: string; text: string }> = [];
    const expressionStore = {
        getAllExpressionSimple: vi.fn(async () => wordExpressions),
        getExpressionAfter: vi.fn(async () => reviewExpressions),
    };
    const vault = {
        getFile: vi.fn((path: string) => targets.get(path) ?? null),
        getPath: vi.fn((file: FileRef) => file.path),
        write: vi.fn(async (file: FileRef, text: string) => {
            files.set(file.path, text);
            writes.push({ path: file.path, text });
        }),
        process: vi.fn(async (file: FileRef, transform: (text: string) => string) => {
            const text = transform(files.get(file.path) ?? "");
            files.set(file.path, text);
            writes.push({ path: file.path, text });
        }),
    };
    const publication = new TextDatabasePublication<FileRef>({
        getSettings,
        expressionStore,
        vault,
        completionReloader: { reloadCustomDictionaries },
    });

    return {
        files,
        targets,
        settings,
        getSettings,
        expressionStore,
        vault,
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
            completionReload: { status: "reloaded" },
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

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return { promise, resolve, reject };
}

describe("publication coordination", () => {
    it("re-queries each queued request at execution and pins accepted settings", async () => {
        const h = makePublicationHarness({ validFiles: ["word.md", "review.md", "next.md"] });
        const started = deferred<void>();
        const source = deferred<ExpressionInfoSimple[]>();
        h.expressionStore.getAllExpressionSimple.mockImplementationOnce(() => {
            started.resolve();
            return source.promise;
        });
        const first = h.publication.publishWordDatabase();
        await started.promise;
        h.settings.wordDatabasePath = "next.md";
        h.settings.colDelimiter = "|";
        const second = h.publication.publishWordDatabase();
        h.settings.wordDatabasePath = "missing.md";
        h.settings.colDelimiter = "\t";
        expect(h.expressionStore.getAllExpressionSimple).toHaveBeenCalledTimes(1);
        h.expressionStore.getAllExpressionSimple.mockResolvedValueOnce([
            makeSimpleExpression("fresh", "second", 1),
        ]);
        source.resolve([makeSimpleExpression("old", "first", 1)]);
        await Promise.all([first, second]);
        expect(h.writes.map((write) => write.path)).toEqual(["word.md", "next.md"]);
        expect(h.files.get("word.md")).toContain("old,    first");
        expect(h.files.get("next.md")).toContain("fresh|    second");
        expect(h.expressionStore.getAllExpressionSimple).toHaveBeenNthCalledWith(2, false);
    });

    it("uses one configuration snapshot for publishAll", async () => {
        const h = makePublicationHarness({ reviewExpressions: [makeExpression("alpha", "first")] });
        const result = h.publication.publishAll();
        h.settings.wordDatabasePath = "missing.md";
        h.settings.reviewDatabasePath = "missing.md";
        h.settings.reviewDelimiter = "changed";
        await expect(result).resolves.toMatchObject({
            word: { status: "published" },
            review: { status: "published" },
        });
        expect(h.getSettings).toHaveBeenCalledTimes(1);
        expect(h.files.get("review.md")).toContain("\n?\n");
    });

    it("serializes the same canonical file when target roles swap paths", async () => {
        const h = makePublicationHarness({
            reviewExpressions: [makeExpression("review", "meaning")],
        });
        const started = deferred<void>();
        const source = deferred<ExpressionInfoSimple[]>();
        h.expressionStore.getAllExpressionSimple.mockImplementationOnce(() => {
            started.resolve();
            return source.promise;
        });
        const word = h.publication.publishWordDatabase();
        await started.promise;
        h.settings.wordDatabasePath = "review.md";
        h.settings.reviewDatabasePath = "word.md";
        const review = h.publication.publishReviewDatabase();
        expect(h.expressionStore.getExpressionAfter).not.toHaveBeenCalled();
        source.resolve([]);
        await Promise.all([word, review]);
        expect(h.writes.map((write) => write.path)).toEqual(["word.md", "word.md"]);
        expect(h.files.get("word.md")).toContain("#### review");
    });

    it("lets different files publish independently when another source is blocked and fails", async () => {
        const h = makePublicationHarness({ reviewExpressions: [makeExpression("alpha", "first")] });
        const started = deferred<void>();
        const source = deferred<ExpressionInfoSimple[]>();
        h.expressionStore.getAllExpressionSimple.mockImplementationOnce(() => {
            started.resolve();
            return source.promise;
        });
        const word = h.publication.publishWordDatabase();
        await started.promise;
        await expect(h.publication.publishReviewDatabase()).resolves.toEqual({
            target: "review",
            status: "published",
        });
        source.reject(new Error("source unavailable"));
        await expect(word).resolves.toEqual({ target: "word", status: "failed", stage: "source" });
    });

    it.each([false, true])(
        "rejects colliding target paths (alias: %s) before reading sources",
        async (alias) => {
            const h = makePublicationHarness();
            h.settings.reviewDatabasePath = alias ? "alias.md" : "word.md";
            if (alias) h.targets.set("alias.md", h.targets.get("word.md")!);
            await expect(h.publication.publishAll()).resolves.toEqual({
                word: { target: "word", status: "pathConflict" },
                review: { target: "review", status: "pathConflict" },
            });
            expect(h.expressionStore.getAllExpressionSimple).not.toHaveBeenCalled();
            expect(h.expressionStore.getExpressionAfter).not.toHaveBeenCalled();
            expect(h.writes).toEqual([]);
        }
    );

    it.each(["word", "review"] as const)(
        "preserves the %s file on source failure and releases its queue",
        async (target) => {
            const h = makePublicationHarness({
                initialFiles: { "word.md": "original", "review.md": "original" },
                reviewExpressions: [makeExpression("alpha", "first")],
            });
            const query =
                target === "word"
                    ? h.expressionStore.getAllExpressionSimple
                    : h.expressionStore.getExpressionAfter;
            query.mockRejectedValueOnce(new Error("source failed"));
            const publish = () =>
                target === "word"
                    ? h.publication.publishWordDatabase()
                    : h.publication.publishReviewDatabase();
            const failed = publish();
            const next = publish();
            await expect(failed).resolves.toEqual({ target, status: "failed", stage: "source" });
            await expect(next).resolves.toMatchObject({ target, status: "published" });
            expect(h.writes).toHaveLength(1);
        }
    );

    it.each(["word", "review"] as const)(
        "leaves existing %s text unchanged when its source fails",
        async (target) => {
            const h = makePublicationHarness({
                initialFiles: { "word.md": "original", "review.md": "original" },
            });
            const query =
                target === "word"
                    ? h.expressionStore.getAllExpressionSimple
                    : h.expressionStore.getExpressionAfter;
            query.mockRejectedValueOnce(new Error("source unavailable"));
            const result =
                target === "word"
                    ? h.publication.publishWordDatabase()
                    : h.publication.publishReviewDatabase();
            await expect(result).resolves.toEqual({ target, status: "failed", stage: "source" });
            expect(h.files.get(`${target}.md`)).toBe("original");
            expect(h.writes).toEqual([]);
            expect(h.vault.process).not.toHaveBeenCalled();
        }
    );

    it("reports atomic review write failures and lets later requests proceed", async () => {
        const h = makePublicationHarness({
            initialFiles: { "review.md": "original" },
            reviewExpressions: [makeExpression("alpha", "first")],
        });
        h.vault.process.mockRejectedValueOnce(new Error("process failed"));
        await expect(h.publication.publishReviewDatabase()).resolves.toEqual({
            target: "review",
            status: "failed",
            stage: "write",
        });
        expect(h.files.get("review.md")).toBe("original");
        await expect(h.publication.publishReviewDatabase()).resolves.toEqual({
            target: "review",
            status: "published",
        });
        expect(h.reloadCustomDictionaries).not.toHaveBeenCalled();
    });

    it("writes the headers for an empty word source", async () => {
        const h = makePublicationHarness({ initialFiles: { "word.md": "old words" } });
        await expect(h.publication.publishWordDatabase()).resolves.toMatchObject({
            status: "published",
        });
        expect(h.files.get("word.md")).toContain("#### Learning");
        expect(h.files.get("word.md")).toContain("#### Learned");
        expect(h.files.get("word.md")).not.toContain("old words");
    });

    it("orders review output without mutating the source array", async () => {
        const beta = makeExpression("beta", "second");
        const alpha = makeExpression("alpha", "first");
        const expressions = [beta, alpha];
        const h = makePublicationHarness({ reviewExpressions: expressions });
        await h.publication.publishReviewDatabase();
        expect(expressions).toEqual([beta, alpha]);
        const text = h.files.get("review.md")!;
        expect(text.indexOf("#### alpha")).toBeLessThan(text.indexOf("#### beta"));
    });

    it.each(["delete", "repath"] as const)(
        "avoids writing a target that is changed during the source query: %s",
        async (change) => {
            const h = makePublicationHarness();
            const started = deferred<void>();
            const source = deferred<ExpressionInfoSimple[]>();
            h.expressionStore.getAllExpressionSimple.mockImplementationOnce(() => {
                started.resolve();
                return source.promise;
            });
            const result = h.publication.publishWordDatabase();
            await started.promise;
            if (change === "delete") h.targets.delete("word.md");
            else h.targets.get("word.md")!.path = "moved.md";
            source.resolve([]);
            await expect(result).resolves.toEqual({ target: "word", status: "invalidTarget" });
            expect(h.writes).toEqual([]);
            expect(h.reloadCustomDictionaries).not.toHaveBeenCalled();
        }
    );

    it("preserves review metadata edited while the fresh source is being queried", async () => {
        const h = makePublicationHarness();
        const started = deferred<void>();
        const source = deferred<ExpressionInfo[]>();
        h.expressionStore.getExpressionAfter.mockImplementationOnce(() => {
            started.resolve();
            return source.promise;
        });
        const result = h.publication.publishReviewDatabase();
        await started.promise;
        h.files.set("review.md", "#word\n#### alpha\n?\nold\n<!--SR:!2026-09-30,5,260-->\n");
        source.resolve([makeExpression("alpha", "fresh")]);
        await result;
        expect(h.files.get("review.md")).toContain("<!--SR:!2026-09-30,5,260-->");
        expect(h.files.get("review.md")).toContain("fresh");
        expect(h.vault.process).toHaveBeenCalledTimes(1);
        expect(h.vault.write).not.toHaveBeenCalled();
    });

    it("does not reload completion after a failed word write", async () => {
        const h = makePublicationHarness({ initialFiles: { "word.md": "original" } });
        h.vault.write.mockRejectedValueOnce(new Error("write failed"));
        await expect(h.publication.publishWordDatabase()).resolves.toEqual({
            target: "word",
            status: "failed",
            stage: "write",
        });
        expect(h.files.get("word.md")).toBe("original");
        expect(h.reloadCustomDictionaries).not.toHaveBeenCalled();
        await expect(h.publication.publishWordDatabase()).resolves.toMatchObject({
            status: "published",
        });
    });

    it("reports reload failure separately and retries only reload, including absent completion", async () => {
        const h = makePublicationHarness();
        h.reloadCustomDictionaries.mockRejectedValueOnce(new Error("reload failed"));
        await expect(h.publication.publishWordDatabase()).resolves.toEqual({
            target: "word",
            status: "published",
            completionReload: { status: "failed" },
        });
        await expect(h.publication.retryCompletionReload()).resolves.toEqual({
            status: "reloaded",
        });
        h.reloadCustomDictionaries.mockReturnValueOnce(false);
        await expect(h.publication.retryCompletionReload()).resolves.toEqual({ status: "skipped" });
        expect(h.writes).toHaveLength(1);
        expect(h.expressionStore.getAllExpressionSimple).toHaveBeenCalledTimes(1);
    });

    it("closes intake immediately and drains accepted publication and reload retry", async () => {
        const h = makePublicationHarness();
        const sourceStarted = deferred<void>();
        const source = deferred<ExpressionInfoSimple[]>();
        const retryStarted = deferred<void>();
        const retryReload = deferred<void>();
        h.expressionStore.getAllExpressionSimple.mockImplementationOnce(() => {
            sourceStarted.resolve();
            return source.promise;
        });
        h.reloadCustomDictionaries
            .mockImplementationOnce(() => undefined)
            .mockImplementationOnce(() => {
                retryStarted.resolve();
                return retryReload.promise;
            });
        const publication = h.publication.publishWordDatabase();
        await sourceStarted.promise;
        const retry = h.publication.retryCompletionReload();
        const close = h.publication.close();
        let drained = false;
        void close.then(() => {
            drained = true;
        });
        expect(h.publication.close()).toBe(close);
        await expect(h.publication.publishWordDatabase()).resolves.toEqual({
            target: "word",
            status: "closed",
        });
        await expect(h.publication.publishReviewDatabase()).resolves.toEqual({
            target: "review",
            status: "closed",
        });
        await expect(h.publication.retryCompletionReload()).resolves.toEqual({ status: "closed" });
        await expect(h.publication.publishAll()).resolves.toEqual({
            word: { target: "word", status: "closed" },
            review: { target: "review", status: "closed" },
        });
        expect(h.getSettings).toHaveBeenCalledTimes(1);
        expect(drained).toBe(false);
        source.resolve([]);
        await publication;
        await retryStarted.promise;
        expect(drained).toBe(false);
        retryReload.resolve();
        await retry;
        await close;
        expect(drained).toBe(true);
    });

    it("reports settings, target, and render failures through the public result", async () => {
        const settings = makePublicationHarness();
        settings.getSettings.mockImplementation(() => {
            throw new Error("settings failed");
        });
        await expect(settings.publication.publishAll()).resolves.toEqual({
            word: { target: "word", status: "failed", stage: "settings" },
            review: { target: "review", status: "failed", stage: "settings" },
        });
        const target = makePublicationHarness();
        target.vault.getPath.mockImplementation(() => {
            throw new Error("target failed");
        });
        await expect(target.publication.publishWordDatabase()).resolves.toEqual({
            target: "word",
            status: "failed",
            stage: "target",
        });
        const expression = makeSimpleExpression("alpha", "first", 1);
        Object.defineProperty(expression, "meaning", {
            get() {
                throw new Error("render failed");
            },
        });
        const render = makePublicationHarness({ wordExpressions: [expression] });
        await expect(render.publication.publishWordDatabase()).resolves.toEqual({
            target: "word",
            status: "failed",
            stage: "render",
        });
        expect(render.writes).toEqual([]);
    });
});

describe("review metadata preservation", () => {
    it("preserves multiline SR comments after blank paragraphs without crossing card boundaries", async () => {
        const alpha = makeExpression("alpha", "fresh alpha");
        alpha.notes = ["first paragraph\n\nsecond paragraph"];
        const beta = makeExpression("beta", "fresh beta");
        const alphaMetadata = "<!--SR:!2026-09-30,5,260\n!2026-10-01,6,270-->";
        const betaMetadata = "<!--SR:!2026-10-02,7,280-->";
        const h = makePublicationHarness({
            reviewExpressions: [beta, alpha],
            initialFiles: {
                "review.md": [
                    "#flashcards",
                    "",
                    "#word",
                    "#### alpha",
                    "?",
                    "old alpha",
                    "**Notes**:",
                    "first paragraph",
                    "",
                    "second paragraph",
                    alphaMetadata,
                    "",
                    "#word",
                    "#### beta",
                    "?",
                    "old beta",
                    betaMetadata,
                    "",
                ].join("\n"),
            },
        });

        await expect(h.publication.publishReviewDatabase()).resolves.toEqual({
            target: "review",
            status: "published",
        });

        const text = h.files.get("review.md")!;
        const [alphaCard, betaCard] = text.split("#word\n").slice(1);
        expect(alphaCard).toContain("first paragraph\n\nsecond paragraph");
        expect(alphaCard).toContain(alphaMetadata);
        expect(alphaCard).not.toContain(betaMetadata);
        expect(betaCard).toContain(betaMetadata);
        expect(betaCard).not.toContain(alphaMetadata);
    });

    it("preserves real SR metadata for reserved expression names in CRLF files", async () => {
        const constructorMetadata = "<!--SR:!2026-09-30,2,250-->";
        const protoMetadata = "<!--SR:!2026-10-01,3,260-->";
        const h = makePublicationHarness({
            reviewExpressions: [
                makeExpression("constructor", "construct"),
                makeExpression("__proto__", "prototype"),
            ],
            initialFiles: {
                "review.md": [
                    "#flashcards",
                    "",
                    "#word",
                    "#### constructor",
                    "?",
                    "old construct",
                    constructorMetadata,
                    "",
                    "#word",
                    "#### __proto__",
                    "?",
                    "old prototype",
                    protoMetadata,
                    "",
                ].join("\r\n"),
            },
        });

        await expect(h.publication.publishReviewDatabase()).resolves.toEqual({
            target: "review",
            status: "published",
        });

        const cards = h.files.get("review.md")!.split("#word\n").slice(1);
        const constructorCard = cards.find((card) => card.startsWith("#### constructor\n"))!;
        const protoCard = cards.find((card) => card.startsWith("#### __proto__\n"))!;
        expect(constructorCard).toContain(constructorMetadata);
        expect(constructorCard).not.toContain(protoMetadata);
        expect(protoCard).toContain(protoMetadata);
        expect(protoCard).not.toContain(constructorMetadata);
    });

    it("does not invent metadata for reserved expression names without existing SR comments", async () => {
        const h = makePublicationHarness({
            reviewExpressions: [
                makeExpression("constructor", "construct"),
                makeExpression("__proto__", "prototype"),
            ],
            initialFiles: {
                "review.md":
                    "#word\n#### constructor\n?\nold construct\n\n#word\n#### __proto__\n?\nold prototype\n",
            },
        });

        await expect(h.publication.publishReviewDatabase()).resolves.toEqual({
            target: "review",
            status: "published",
        });

        expect(h.files.get("review.md")).toBe(
            "#flashcards\n\n#word\n#### __proto__\n?\nprototype\n\n#word\n#### constructor\n?\nconstruct\n\n"
        );
    });
});
