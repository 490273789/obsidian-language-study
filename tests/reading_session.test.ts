import { describe, expect, it, vi } from "vitest";

import { ReadingSession, type ReadingSessionDependencies } from "@/reading/readingSession";
import { unsafeMarkSafeHtml } from "@/utils/safeHtml";
import { ReadingPageCompletionStoreError } from "@/reading/pageCompletion";

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

function makeHarness({
    articleLines = ["one", "two", "three", "four", "five", "six"],
    defaultPageSize = "2",
    lastPosition = 1,
} = {}) {
    let position = `${lastPosition}`;
    const setPosition = vi.fn(async (next: string) => {
        position = next;
    });
    const publishWordsSection = vi.fn(async () => "published" as const);
    const postIgnoreWords = vi.fn(async (_words: string[]) => {});
    const onPageCompleted = vi.fn(async () => {});
    const render = vi.fn(async (text: string) => ({
        html: unsafeMarkSafeHtml(`<p>${text}</p>`),
        newWords: text ? text.split(/\s+/).filter(Boolean) : [],
    }));
    const dependencies: ReadingSessionDependencies = {
        articleLines,
        defaultPageSize,
        document: {
            getLastPosition: async () => Number.parseInt(position, 10) || 0,
            setPosition,
            publishWordsSection,
        },
        renderer: { render },
        ignoreStore: { postIgnoreWords },
        onPageCompleted,
    };
    const session = new ReadingSession(dependencies);

    return {
        dependencies,
        publishWordsSection,
        postIgnoreWords,
        onPageCompleted,
        render,
        session,
        setPosition,
        get position() {
            return position;
        },
    };
}

describe("Reading Session", () => {
    it("initializes one complete confirmed page from the saved first visible line", async () => {
        const harness = makeHarness({ lastPosition: 3 });

        await harness.session.initialize();

        expect(harness.session.snapshot()).toMatchObject({
            status: "ready",
            desired: { page: 2, pageSize: 2 },
            confirmed: {
                page: 2,
                pageSize: 2,
                range: { startLine: 2, endLine: 4, totalLines: 6 },
                renderedText: "<p>three\nfour</p>",
            },
            progress: "saved",
        });
        expect(harness.setPosition).not.toHaveBeenCalled();
    });

    it("preserves the desired first visible line while resizing without a redundant save", async () => {
        const harness = makeHarness({ lastPosition: 5 });
        await harness.session.initialize();

        await harness.session.act({ type: "resize", pageSize: 4 });

        expect(harness.session.snapshot()).toMatchObject({
            status: "ready",
            desired: { page: 2, pageSize: 4 },
            confirmed: {
                page: 2,
                pageSize: 4,
                range: { startLine: 4, endLine: 6, totalLines: 6 },
            },
            progress: "saved",
        });
        expect(harness.setPosition).not.toHaveBeenCalled();
    });

    it("lets the latest desired page win and discards a stale render", async () => {
        const harness = makeHarness();
        await harness.session.initialize();
        const pageTwo = deferred<{
            html: ReturnType<typeof unsafeMarkSafeHtml>;
            newWords: string[];
        }>();
        const pageThree = deferred<{
            html: ReturnType<typeof unsafeMarkSafeHtml>;
            newWords: string[];
        }>();
        harness.render.mockImplementationOnce(() => pageTwo.promise);
        harness.render.mockImplementationOnce(() => pageThree.promise);

        const secondPageResult = harness.session.act({ type: "navigate", page: 2 });
        const thirdPageResult = harness.session.act({ type: "navigate", page: 3 });
        expect(harness.session.snapshot()).toMatchObject({
            status: "rendering",
            desired: { page: 3 },
            confirmed: { page: 1 },
        });

        pageThree.resolve({
            html: unsafeMarkSafeHtml("page three"),
            newWords: ["page", "three"],
        });
        await thirdPageResult;
        pageTwo.resolve({
            html: unsafeMarkSafeHtml("stale page two"),
            newWords: ["stale", "page", "two"],
        });
        await secondPageResult;

        expect(harness.session.snapshot()).toMatchObject({
            status: "ready",
            desired: { page: 3 },
            confirmed: { page: 3, renderedText: "page three" },
        });
        expect(harness.setPosition).toHaveBeenCalledTimes(1);
        expect(harness.setPosition).toHaveBeenCalledWith("5");
    });

    it("keeps the confirmed page after a render failure and retries the desired page", async () => {
        const harness = makeHarness();
        await harness.session.initialize();
        harness.render.mockImplementationOnce(() => {
            throw new Error("render failed");
        });

        await harness.session.act({ type: "navigate", page: 2 });

        expect(harness.session.snapshot()).toMatchObject({
            status: "renderFailed",
            desired: { page: 2 },
            confirmed: { page: 1 },
            error: "render_failed",
        });

        harness.render.mockResolvedValueOnce({
            html: unsafeMarkSafeHtml("retried page two"),
            newWords: ["retried", "page", "two"],
        });
        await harness.session.act({ type: "retry" });

        expect(harness.session.snapshot()).toMatchObject({
            status: "ready",
            confirmed: { page: 2, renderedText: "retried page two" },
            progress: "saved",
        });
        expect(harness.setPosition).toHaveBeenCalledWith("3");
    });

    it("publishes immutable rendering snapshots until the listener unsubscribes", async () => {
        const harness = makeHarness();
        const snapshots = [harness.session.snapshot()];
        const unsubscribe = harness.session.subscribe((state) => snapshots.push(state));

        await harness.session.initialize();

        expect(snapshots.map((state) => state.status)).toEqual([
            "initializing",
            "rendering",
            "ready",
        ]);
        expect(snapshots[0]).not.toBe(snapshots[1]);

        unsubscribe();
        await harness.session.act({ type: "navigate", page: 2 });
        expect(snapshots).toHaveLength(3);
    });

    it("keeps visible content when saving fails and saves the latest page on next navigation", async () => {
        const harness = makeHarness();
        await harness.session.initialize();
        harness.setPosition.mockRejectedValueOnce(new Error("frontmatter unavailable"));

        await harness.session.act({ type: "navigate", page: 2 });

        expect(harness.session.snapshot()).toMatchObject({
            status: "ready",
            confirmed: { page: 2 },
            progress: "unsaved",
        });

        await harness.session.act({ type: "navigate", page: 3 });

        expect(harness.session.snapshot()).toMatchObject({
            confirmed: { page: 3 },
            progress: "saved",
        });
        expect(harness.setPosition).toHaveBeenLastCalledWith("5");
    });

    it("clamps an out-of-range saved position only after a successful render", async () => {
        const harness = makeHarness({ articleLines: ["one", "two", "three"], lastPosition: 99 });

        await harness.session.initialize();

        expect(harness.session.snapshot()).toMatchObject({
            confirmed: {
                page: 2,
                range: { startLine: 2, endLine: 3, totalLines: 3 },
            },
        });
        expect(harness.setPosition).toHaveBeenCalledWith("3");
    });

    it("renders an empty article without persisting a fake position", async () => {
        const harness = makeHarness({ articleLines: [], lastPosition: 99 });

        await harness.session.initialize();

        expect(harness.session.snapshot()).toMatchObject({
            status: "ready",
            desired: { page: 1 },
            confirmed: { range: { startLine: 0, endLine: 0, totalLines: 0 } },
        });
        expect(harness.render).toHaveBeenCalledWith("");
        expect(harness.setPosition).not.toHaveBeenCalled();
    });

    it("closes idempotently, retries unsaved progress once, and settles words independently", async () => {
        const harness = makeHarness();
        await harness.session.initialize();
        harness.setPosition.mockRejectedValueOnce(new Error("first save failed"));
        await harness.session.act({ type: "navigate", page: 2 });
        harness.publishWordsSection.mockRejectedValueOnce(new Error("words failed"));

        const firstClose = harness.session.close();
        const secondClose = harness.session.close();

        await expect(firstClose).resolves.toEqual({
            progress: "saved",
            words: "failed",
            completion: { status: "idle" },
        });
        await expect(secondClose).resolves.toEqual({
            progress: "saved",
            words: "failed",
            completion: { status: "idle" },
        });
        expect(harness.setPosition).toHaveBeenCalledTimes(2);
        expect(harness.publishWordsSection).toHaveBeenCalledTimes(1);
        expect(harness.session.snapshot().status).toBe("closed");
    });

    it("invalidates a pending render and waits for it before closing", async () => {
        const harness = makeHarness();
        await harness.session.initialize();
        const pending = deferred<{
            html: ReturnType<typeof unsafeMarkSafeHtml>;
            newWords: string[];
        }>();
        harness.render.mockImplementationOnce(() => pending.promise);
        const navigation = harness.session.act({ type: "navigate", page: 2 });

        const closing = harness.session.close();
        pending.resolve({
            html: unsafeMarkSafeHtml("late page"),
            newWords: ["late", "page"],
        });

        await navigation;
        await expect(closing).resolves.toEqual({
            progress: "notNeeded",
            words: "published",
            completion: { status: "idle" },
        });
        expect(harness.session.snapshot()).toMatchObject({
            status: "closed",
            confirmed: { page: 1 },
        });
        expect(harness.setPosition).not.toHaveBeenCalled();
    });

    describe("finishPage action", () => {
        it("retains later navigation and ignores duplicate completion on another page", async () => {
            const harness = makeHarness();
            await harness.session.initialize();
            const write = deferred<void>();
            harness.postIgnoreWords.mockReturnValueOnce(write.promise);

            const finishing = harness.session.act({ type: "finishPage" });
            await harness.session.act({ type: "navigate", page: 3 });
            await harness.session.act({ type: "finishPage" });
            expect(harness.session.snapshot().completion).toMatchObject({
                status: "pending",
                page: 1,
            });
            expect(harness.postIgnoreWords).toHaveBeenCalledTimes(1);
            write.resolve();
            await finishing;

            expect(harness.postIgnoreWords).toHaveBeenCalledWith(["one", "two"]);
            expect(harness.session.snapshot()).toMatchObject({
                confirmed: { page: 3 },
                completion: { status: "completed", page: 1, updates: "updated" },
            });
            expect(harness.onPageCompleted).toHaveBeenCalledTimes(1);
            expect(harness.position).toBe("5");
        });

        it("retains resizing while completion is pending", async () => {
            const harness = makeHarness();
            await harness.session.initialize();
            const write = deferred<void>();
            harness.postIgnoreWords.mockReturnValueOnce(write.promise);
            const finishing = harness.session.act({ type: "finishPage" });
            await harness.session.act({ type: "resize", pageSize: 4 });
            write.resolve();
            await finishing;

            expect(harness.session.snapshot()).toMatchObject({
                confirmed: { page: 1, pageSize: 4 },
                completion: { status: "completed", page: 1, pageSize: 2 },
            });
        });

        it("does not resume auto-navigation after navigating away and back", async () => {
            const harness = makeHarness();
            await harness.session.initialize();
            const write = deferred<void>();
            harness.postIgnoreWords.mockReturnValueOnce(write.promise);
            const finishing = harness.session.act({ type: "finishPage" });
            await harness.session.act({ type: "navigate", page: 3 });
            await harness.session.act({ type: "navigate", page: 1 });
            write.resolve();
            await finishing;
            expect(harness.session.snapshot().confirmed?.page).toBe(1);
        });

        it("still advances after a record refresh on the captured page", async () => {
            const harness = makeHarness();
            await harness.session.initialize();
            const write = deferred<void>();
            harness.postIgnoreWords.mockReturnValueOnce(write.promise);
            const finishing = harness.session.act({ type: "finishPage" });
            await harness.session.act({ type: "refresh" });
            write.resolve();
            await finishing;
            expect(harness.session.snapshot().confirmed?.page).toBe(2);
        });

        it("preserves progress when completion supersedes a pending navigation render", async () => {
            const harness = makeHarness();
            await harness.session.initialize();
            const write = deferred<void>();
            const render = deferred<{
                html: ReturnType<typeof unsafeMarkSafeHtml>;
                newWords: string[];
            }>();
            harness.postIgnoreWords.mockReturnValueOnce(write.promise);
            const finishing = harness.session.act({ type: "finishPage" });
            harness.render.mockReturnValueOnce(render.promise);
            const navigating = harness.session.act({ type: "navigate", page: 3 });
            await Promise.resolve();
            write.resolve();
            await finishing;
            render.resolve({ html: unsafeMarkSafeHtml("stale"), newWords: [] });
            await navigating;
            expect(harness.session.snapshot()).toMatchObject({
                confirmed: { page: 3 },
                progress: "saved",
            });
            expect(harness.position).toBe("5");
        });

        it("waits for accepted completion before publishing words on close", async () => {
            const harness = makeHarness();
            await harness.session.initialize();
            const write = deferred<void>();
            harness.postIgnoreWords.mockReturnValueOnce(write.promise);
            const finishing = harness.session.act({ type: "finishPage" });
            const closing = harness.session.close();
            await Promise.resolve();
            expect(harness.publishWordsSection).not.toHaveBeenCalled();
            await harness.session.act({ type: "finishPage" });
            write.resolve();
            await finishing;
            await expect(closing).resolves.toMatchObject({
                completion: { status: "completed", page: 1 },
                words: "published",
            });
            expect(harness.session.snapshot()).toMatchObject({
                status: "closed",
                confirmed: { page: 1 },
            });
            expect(harness.postIgnoreWords).toHaveBeenCalledTimes(1);
            expect(harness.publishWordsSection).toHaveBeenCalledTimes(1);
        });

        it("reports a closing completion failure while still settling publication", async () => {
            const harness = makeHarness();
            await harness.session.initialize();
            const write = deferred<void>();
            harness.postIgnoreWords.mockReturnValueOnce(write.promise);
            const finishing = harness.session.act({ type: "finishPage" });
            const closing = harness.session.close();
            write.reject(new ReadingPageCompletionStoreError("ignore_store_incompatible"));
            await finishing;
            await expect(closing).resolves.toMatchObject({
                completion: { status: "failed", error: "ignore_store_incompatible" },
                words: "published",
            });
            expect(harness.onPageCompleted).not.toHaveBeenCalled();
        });

        it("retries the failed captured page without overriding later navigation", async () => {
            const harness = makeHarness();
            await harness.session.initialize();
            harness.postIgnoreWords.mockRejectedValueOnce(new Error("offline"));
            await harness.session.act({ type: "finishPage" });
            expect(harness.session.snapshot()).toMatchObject({
                confirmed: { page: 1 },
                completion: { status: "failed", page: 1, error: "ignore_store_unavailable" },
            });
            expect(harness.onPageCompleted).not.toHaveBeenCalled();
            await harness.session.act({ type: "navigate", page: 3 });
            expect(harness.session.snapshot().canFinishPage).toBe(false);
            await harness.session.act({ type: "finishPage" });
            expect(harness.session.snapshot().completion).toMatchObject({
                status: "failed",
                page: 1,
            });
            expect(harness.postIgnoreWords).toHaveBeenCalledTimes(1);
            await harness.session.act({ type: "retryCompletion" });

            expect(harness.postIgnoreWords.mock.calls).toEqual([
                [["one", "two"]],
                [["one", "two"]],
            ]);
            expect(harness.session.snapshot()).toMatchObject({
                confirmed: { page: 3 },
                completion: { status: "completed", page: 1 },
                canFinishPage: true,
            });
        });

        it("advances after retry when the reader has not navigated", async () => {
            const harness = makeHarness();
            await harness.session.initialize();
            harness.postIgnoreWords.mockRejectedValueOnce(new Error("offline"));
            await harness.session.act({ type: "finishPage" });
            await harness.session.act({ type: "retryCompletion" });
            expect(harness.session.snapshot().confirmed?.page).toBe(2);
            expect(harness.onPageCompleted).toHaveBeenCalledTimes(1);
        });

        it("does not resubmit committed words when follow-up updates fail", async () => {
            const harness = makeHarness();
            await harness.session.initialize();
            harness.onPageCompleted.mockRejectedValueOnce(new Error("updates failed"));
            await harness.session.act({ type: "finishPage" });
            await harness.session.act({ type: "retryCompletion" });
            expect(harness.session.snapshot()).toMatchObject({
                confirmed: { page: 2 },
                completion: { status: "completed", updates: "failed" },
            });
            expect(harness.postIgnoreWords).toHaveBeenCalledTimes(1);
        });

        it("does not resubmit committed words when the next page render fails", async () => {
            const harness = makeHarness();
            await harness.session.initialize();
            harness.render.mockRejectedValueOnce(new Error("render failed"));
            await harness.session.act({ type: "finishPage" });
            expect(harness.session.snapshot()).toMatchObject({
                status: "renderFailed",
                completion: { status: "completed" },
            });
            await harness.session.act({ type: "retry" });
            expect(harness.postIgnoreWords).toHaveBeenCalledTimes(1);
            expect(harness.session.snapshot().confirmed?.page).toBe(2);
        });

        it("does not finish while a desired page is still rendering", async () => {
            const harness = makeHarness();
            await harness.session.initialize();
            const render = deferred<{
                html: ReturnType<typeof unsafeMarkSafeHtml>;
                newWords: string[];
            }>();
            harness.render.mockReturnValueOnce(render.promise);
            const navigating = harness.session.act({ type: "navigate", page: 2 });
            await harness.session.act({ type: "finishPage" });
            expect(harness.postIgnoreWords).not.toHaveBeenCalled();
            render.resolve({ html: unsafeMarkSafeHtml("two"), newWords: [] });
            await navigating;
        });

        it("posts newWords to ignoreStore and navigates to next page when not on last page", async () => {
            const harness = makeHarness({
                articleLines: ["alpha", "beta", "gamma", "delta"],
                defaultPageSize: "2",
            });
            await harness.session.initialize();

            expect(harness.session.snapshot().confirmed?.newWords).toEqual(["alpha", "beta"]);

            await harness.session.act({ type: "finishPage" });

            expect(harness.postIgnoreWords).toHaveBeenCalledWith(["alpha", "beta"]);
            expect(harness.session.snapshot()).toMatchObject({
                status: "ready",
                desired: { page: 2, pageSize: 2 },
                confirmed: {
                    page: 2,
                    newWords: ["gamma", "delta"],
                },
            });
            expect(harness.setPosition).toHaveBeenCalledWith("3");
        });

        it("posts newWords and refreshes current page when on last page", async () => {
            const harness = makeHarness({
                articleLines: ["alpha", "beta"],
                defaultPageSize: "2",
            });
            await harness.session.initialize();

            expect(harness.session.snapshot().confirmed?.page).toBe(1);

            await harness.session.act({ type: "finishPage" });

            expect(harness.postIgnoreWords).toHaveBeenCalledWith(["alpha", "beta"]);
            expect(harness.session.snapshot()).toMatchObject({
                status: "ready",
                desired: { page: 1, pageSize: 2 },
                confirmed: { page: 1 },
            });
        });

        it("does not call postIgnoreWords if current page has no new words", async () => {
            const harness = makeHarness({
                articleLines: ["", ""],
                defaultPageSize: "2",
            });
            await harness.session.initialize();

            await harness.session.act({ type: "finishPage" });

            expect(harness.postIgnoreWords).not.toHaveBeenCalled();
        });
    });

    describe("wordCounts management", () => {
        it("computes wordCounts upon initialization and refresh", async () => {
            const wordCounter = vi.fn(async (_text: string): Promise<[number, number, number]> => [
                5, 2, 1,
            ]);
            const harness = makeHarness();
            const session = new ReadingSession({
                ...harness.dependencies,
                wordCounter,
            });

            await session.initialize();

            expect(wordCounter).toHaveBeenCalledTimes(1);
            expect(wordCounter).toHaveBeenCalledWith(harness.dependencies.articleLines.join("\n"));
            expect(session.snapshot().wordCounts).toEqual({
                unknown: 5,
                learn: 2,
                ignore: 1,
            });

            wordCounter.mockResolvedValueOnce([4, 3, 1]);
            await session.act({ type: "refresh" });

            expect(wordCounter).toHaveBeenCalledTimes(2);
            expect(session.snapshot().wordCounts).toEqual({
                unknown: 4,
                learn: 3,
                ignore: 1,
            });
        });
    });
});
