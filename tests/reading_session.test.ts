import { describe, expect, it, vi } from "vitest";

import { ReadingSession, type ReadingSessionDependencies } from "@/reading/readingSession";
import { unsafeMarkSafeHtml } from "@/utils/safeHtml";

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
    const render = vi.fn(async (text: string) => unsafeMarkSafeHtml(`<p>${text}</p>`));
    const dependencies: ReadingSessionDependencies = {
        articleLines,
        defaultPageSize,
        document: {
            getLastPosition: async () => Number.parseInt(position, 10) || 0,
            setPosition,
            publishWordsSection,
        },
        renderer: { render },
    };
    const session = new ReadingSession(dependencies);

    return {
        dependencies,
        publishWordsSection,
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
        const pageTwo = deferred<ReturnType<typeof unsafeMarkSafeHtml>>();
        const pageThree = deferred<ReturnType<typeof unsafeMarkSafeHtml>>();
        harness.render.mockImplementationOnce(() => pageTwo.promise);
        harness.render.mockImplementationOnce(() => pageThree.promise);

        const secondPageResult = harness.session.act({ type: "navigate", page: 2 });
        const thirdPageResult = harness.session.act({ type: "navigate", page: 3 });
        expect(harness.session.snapshot()).toMatchObject({
            status: "rendering",
            desired: { page: 3 },
            confirmed: { page: 1 },
        });

        pageThree.resolve(unsafeMarkSafeHtml("page three"));
        await thirdPageResult;
        pageTwo.resolve(unsafeMarkSafeHtml("stale page two"));
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

        harness.render.mockResolvedValueOnce(unsafeMarkSafeHtml("retried page two"));
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

        await expect(firstClose).resolves.toEqual({ progress: "saved", words: "failed" });
        await expect(secondClose).resolves.toEqual({ progress: "saved", words: "failed" });
        expect(harness.setPosition).toHaveBeenCalledTimes(2);
        expect(harness.publishWordsSection).toHaveBeenCalledTimes(1);
        expect(harness.session.snapshot().status).toBe("closed");
    });

    it("invalidates a pending render and waits for it before closing", async () => {
        const harness = makeHarness();
        await harness.session.initialize();
        const pending = deferred<ReturnType<typeof unsafeMarkSafeHtml>>();
        harness.render.mockImplementationOnce(() => pending.promise);
        const navigation = harness.session.act({ type: "navigate", page: 2 });

        const closing = harness.session.close();
        pending.resolve(unsafeMarkSafeHtml("late page"));

        await navigation;
        await expect(closing).resolves.toEqual({ progress: "notNeeded", words: "published" });
        expect(harness.session.snapshot()).toMatchObject({
            status: "closed",
            confirmed: { page: 1 },
        });
        expect(harness.setPosition).not.toHaveBeenCalled();
    });
});
