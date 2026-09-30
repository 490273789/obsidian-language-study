import type { SafeHtml } from "@/utils/safeHtml";
import type { RenderArticleResult } from "@/views/renderArticle";
import {
    ReadingPageCompletionStoreError,
    type ReadingPageCompletionStoreErrorCode,
} from "./pageCompletion";

type ReadingSessionStatus = "initializing" | "rendering" | "ready" | "renderFailed" | "closed";

type ReadingProgressStatus = "saved" | "unsaved";

type ReadingSessionSelection = Readonly<{
    page: number;
    pageSize: number;
}>;

type ReadingPageRange = Readonly<{
    startLine: number;
    endLine: number;
    totalLines: number;
}>;

type ConfirmedReadingPage = ReadingSessionSelection &
    Readonly<{
        range: ReadingPageRange;
        renderedText: SafeHtml;
        newWords: readonly string[];
    }>;

type ReadingSessionError = "render_failed";

type ReadingPageCompletionState =
    | Readonly<{ status: "idle" }>
    | Readonly<{ status: "pending"; page: number; pageSize: number }>
    | Readonly<{
          status: "failed";
          page: number;
          pageSize: number;
          error: ReadingPageCompletionStoreErrorCode;
      }>
    | Readonly<{
          status: "completed";
          page: number;
          pageSize: number;
          updates: "updated" | "failed";
      }>;

type ReadingPageCompletionTarget = Readonly<{
    page: ConfirmedReadingPage;
    navigationVersion: number;
}>;

type ReadingSessionState = Readonly<{
    status: ReadingSessionStatus;
    desired: ReadingSessionSelection;
    confirmed: ConfirmedReadingPage | null;
    totalLines: number;
    progress: ReadingProgressStatus;
    error: ReadingSessionError | null;
    completion: ReadingPageCompletionState;
    canFinishPage: boolean;
}>;

type ReadingSessionAction =
    | Readonly<{ type: "navigate"; page: number }>
    | Readonly<{ type: "resize"; pageSize: number }>
    | Readonly<{ type: "refresh" }>
    | Readonly<{ type: "retry" }>
    | Readonly<{ type: "finishPage" }>
    | Readonly<{ type: "retryCompletion" }>;

type ReadingSessionDocument = Readonly<{
    getLastPosition(): Promise<number>;
    setPosition(position: string): Promise<void>;
    publishWordsSection(): Promise<"skipped" | "published">;
}>;

type ReadingSessionRenderer = Readonly<{
    render(text: string): Promise<RenderArticleResult>;
}>;

type ReadingSessionIgnoreStore = Readonly<{
    postIgnoreWords(words: string[]): Promise<void>;
}>;

type ReadingSessionDependencies = Readonly<{
    articleLines: readonly string[];
    defaultPageSize: string;
    document: ReadingSessionDocument;
    renderer: ReadingSessionRenderer;
    ignoreStore?: ReadingSessionIgnoreStore;
    onPageCompleted?(): Promise<void>;
}>;

type ReadingSessionCloseResult = Readonly<{
    progress: "saved" | "notNeeded" | "failed";
    words: "published" | "skipped" | "failed";
    completion: ReadingPageCompletionState;
}>;

type ReadingSessionListener = (state: ReadingSessionState) => void;

function normalizePageSize(value: string | number): number {
    if (value === "all" || value === Number.MAX_VALUE) {
        return Number.MAX_VALUE;
    }
    const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}

function pageCount(totalLines: number, pageSize: number): number {
    return totalLines === 0 ? 1 : Math.ceil(totalLines / pageSize);
}

function clampSelection(
    selection: ReadingSessionSelection,
    totalLines: number
): ReadingSessionSelection {
    const pageSize = normalizePageSize(selection.pageSize);
    return {
        page: clamp(Math.floor(selection.page) || 1, 1, pageCount(totalLines, pageSize)),
        pageSize,
    };
}

function rangeForSelection(
    selection: ReadingSessionSelection,
    totalLines: number
): ReadingPageRange {
    if (totalLines === 0) {
        return { startLine: 0, endLine: 0, totalLines };
    }
    const startLine = (selection.page - 1) * selection.pageSize;
    return {
        startLine,
        endLine: Math.min(startLine + selection.pageSize, totalLines),
        totalLines,
    };
}

function positionForSelection(selection: ReadingSessionSelection): string {
    return `${(selection.page - 1) * selection.pageSize + 1}`;
}

class ReadingSession {
    private readonly articleLines: readonly string[];
    private readonly defaultPageSize: string;
    private readonly document: ReadingSessionDocument;
    private readonly renderer: ReadingSessionRenderer;
    private readonly ignoreStore?: ReadingSessionIgnoreStore;
    private readonly onPageCompleted?: () => Promise<void>;
    private readonly listeners = new Set<ReadingSessionListener>();
    private readonly activeRenders = new Set<Promise<unknown>>();

    private state: Omit<ReadingSessionState, "canFinishPage">;
    private requestId = 0;
    private navigationVersion = 0;
    private confirmedVersion = 0;
    private lastSavedPosition: string | null = null;
    private retryNeedsPersistence = false;
    private progressQueue: Promise<void> = Promise.resolve();
    private initializePromise: Promise<ReadingSessionState> | null = null;
    private closePromise: Promise<ReadingSessionCloseResult> | null = null;
    private activeCompletion: Promise<ReadingSessionState> | null = null;
    private completionTarget: ReadingPageCompletionTarget | null = null;

    constructor(dependencies: ReadingSessionDependencies) {
        this.articleLines = [...dependencies.articleLines];
        this.defaultPageSize = dependencies.defaultPageSize;
        this.document = dependencies.document;
        this.renderer = dependencies.renderer;
        this.ignoreStore = dependencies.ignoreStore;
        this.onPageCompleted = dependencies.onPageCompleted;
        this.state = {
            status: "initializing",
            desired: { page: 1, pageSize: normalizePageSize(this.defaultPageSize) },
            confirmed: null,
            totalLines: this.articleLines.length,
            progress: "saved",
            error: null,
            completion: { status: "idle" },
        };
    }

    initialize(): Promise<ReadingSessionState> {
        if (!this.initializePromise) {
            this.initializePromise = this.doInitialize();
        }
        return this.initializePromise;
    }

    snapshot(): ReadingSessionState {
        return {
            ...this.state,
            canFinishPage: this.canFinishPage,
            desired: { ...this.state.desired },
            completion: { ...this.state.completion },
            confirmed: this.state.confirmed
                ? {
                      ...this.state.confirmed,
                      range: { ...this.state.confirmed.range },
                      newWords: [...this.state.confirmed.newWords],
                  }
                : null,
        };
    }

    subscribe(listener: ReadingSessionListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async act(action: ReadingSessionAction): Promise<ReadingSessionState> {
        if (this.state.status === "closed" || this.state.status === "initializing") {
            return this.snapshot();
        }

        switch (action.type) {
            case "navigate": {
                this.navigationVersion++;
                const desired = clampSelection(
                    { page: action.page, pageSize: this.state.desired.pageSize },
                    this.articleLines.length
                );
                return this.renderDesired(desired, true);
            }
            case "resize": {
                this.navigationVersion++;
                const previous = this.state.desired;
                const anchor = (previous.page - 1) * previous.pageSize + 1;
                const pageSize = normalizePageSize(action.pageSize);
                const desired = clampSelection(
                    { page: Math.ceil(anchor / pageSize), pageSize },
                    this.articleLines.length
                );
                return this.renderDesired(desired, true);
            }
            case "refresh":
                return this.renderDesired(this.state.desired, false);
            case "retry":
                if (this.state.status !== "renderFailed") {
                    return this.snapshot();
                }
                return this.renderDesired(this.state.desired, this.retryNeedsPersistence);
            case "finishPage":
                if (!this.canFinishPage || !this.state.confirmed) {
                    return this.snapshot();
                }
                return this.startCompletion({
                    page: {
                        ...this.state.confirmed,
                        range: { ...this.state.confirmed.range },
                        newWords: [...this.state.confirmed.newWords],
                    },
                    navigationVersion: this.navigationVersion,
                });
            case "retryCompletion":
                if (this.state.completion.status !== "failed" || !this.completionTarget) {
                    return this.snapshot();
                }
                return this.startCompletion(this.completionTarget);
        }
    }

    close(): Promise<ReadingSessionCloseResult> {
        if (!this.closePromise) {
            this.closePromise = this.doClose();
        }
        return this.closePromise;
    }

    private get canFinishPage(): boolean {
        return (
            this.state.status === "ready" &&
            this.state.confirmed !== null &&
            this.state.completion.status !== "pending" &&
            this.state.completion.status !== "failed"
        );
    }

    private startCompletion(target: ReadingPageCompletionTarget): Promise<ReadingSessionState> {
        if (this.activeCompletion) {
            return Promise.resolve(this.snapshot());
        }
        this.completionTarget = target;
        this.state = {
            ...this.state,
            completion: {
                status: "pending",
                page: target.page.page,
                pageSize: target.page.pageSize,
            },
        };
        // Install the pending work before notifying listeners, which may navigate or close.
        this.activeCompletion = Promise.resolve()
            .then(() => this.completePage(target))
            .finally(() => {
                this.activeCompletion = null;
            });
        this.notify();
        return this.activeCompletion;
    }

    private async completePage(target: ReadingPageCompletionTarget): Promise<ReadingSessionState> {
        const confirmed = target.page;
        try {
            if (confirmed.newWords.length > 0) {
                if (!this.ignoreStore) {
                    throw new ReadingPageCompletionStoreError("ignore_store_unavailable");
                }
                await this.ignoreStore.postIgnoreWords([...confirmed.newWords]);
            }
        } catch (error) {
            this.state = {
                ...this.state,
                completion: {
                    status: "failed",
                    page: confirmed.page,
                    pageSize: confirmed.pageSize,
                    error:
                        error instanceof ReadingPageCompletionStoreError
                            ? error.code
                            : "ignore_store_unavailable",
                },
            };
            this.notify();
            return this.snapshot();
        }

        let updates: "updated" | "failed" = "updated";
        try {
            await this.onPageCompleted?.();
        } catch {
            // The ignore write already committed; a follow-up failure must not resubmit it.
            updates = "failed";
        }

        if (this.state.status !== "closed") {
            if (
                this.navigationVersion === target.navigationVersion &&
                confirmed.range.endLine < this.articleLines.length
            ) {
                await this.renderDesired(
                    { page: confirmed.page + 1, pageSize: confirmed.pageSize },
                    true
                );
            } else {
                await this.renderDesired(this.state.desired, false);
            }
        }
        this.completionTarget = null;
        this.state = {
            ...this.state,
            completion: {
                status: "completed",
                page: confirmed.page,
                pageSize: confirmed.pageSize,
                updates,
            },
        };
        this.notify();
        return this.snapshot();
    }

    private async doInitialize(): Promise<ReadingSessionState> {
        let lastPosition = 0;
        let positionReadFailed = false;
        try {
            lastPosition = await this.document.getLastPosition();
            this.lastSavedPosition = lastPosition > 0 ? `${lastPosition}` : null;
        } catch {
            positionReadFailed = true;
            this.lastSavedPosition = null;
            this.state = { ...this.state, progress: "unsaved" };
        }

        if (this.state.status === "closed") {
            return this.snapshot();
        }

        const totalLines = this.articleLines.length;
        const pageSize = normalizePageSize(this.defaultPageSize);
        const requestedPosition = lastPosition > 0 ? lastPosition : 1;
        const clampedPosition = totalLines === 0 ? 1 : clamp(requestedPosition, 1, totalLines);
        const desired = clampSelection(
            { page: Math.ceil(clampedPosition / pageSize), pageSize },
            totalLines
        );
        const positionWasClamped = totalLines > 0 && clampedPosition !== requestedPosition;

        return this.renderDesired(desired, positionReadFailed || positionWasClamped);
    }

    private async renderDesired(
        desiredInput: ReadingSessionSelection,
        needsPersistence: boolean
    ): Promise<ReadingSessionState> {
        if (this.state.status === "closed") {
            return this.snapshot();
        }

        // A refresh superseding navigation must retain its pending progress write.
        needsPersistence ||=
            (this.state.status === "rendering" || this.state.status === "renderFailed") &&
            this.retryNeedsPersistence;
        const desired = clampSelection(desiredInput, this.articleLines.length);
        const range = rangeForSelection(desired, this.articleLines.length);
        const pageText = this.articleLines.slice(range.startLine, range.endLine).join("\n");
        const requestId = ++this.requestId;
        this.retryNeedsPersistence = needsPersistence;
        this.state = {
            ...this.state,
            status: "rendering",
            desired,
            error: null,
        };
        this.notify();

        const render = Promise.resolve().then(() => this.renderer.render(pageText));
        this.activeRenders.add(render);
        let renderResult: RenderArticleResult;
        try {
            renderResult = await render;
        } catch {
            if (requestId === this.requestId && this.state.status !== "closed") {
                this.state = { ...this.state, status: "renderFailed", error: "render_failed" };
                this.notify();
            }
            return this.snapshot();
        } finally {
            this.activeRenders.delete(render);
        }

        if (requestId !== this.requestId || this.state.status === "closed") {
            return this.snapshot();
        }

        const confirmedVersion = ++this.confirmedVersion;
        const position = this.articleLines.length > 0 ? positionForSelection(desired) : null;
        const shouldSave =
            position !== null &&
            position !== this.lastSavedPosition &&
            (needsPersistence || this.state.progress === "unsaved");
        this.state = {
            ...this.state,
            status: "ready",
            confirmed: {
                ...desired,
                range,
                renderedText: renderResult.html,
                newWords: renderResult.newWords,
            },
            progress: shouldSave ? "unsaved" : this.state.progress,
            error: null,
        };
        this.notify();

        if (shouldSave && position) {
            await this.savePosition(position, confirmedVersion);
        }
        return this.snapshot();
    }

    private async savePosition(position: string, version: number): Promise<void> {
        const save = this.progressQueue.then(async () => {
            try {
                await this.document.setPosition(position);
                return true;
            } catch {
                return false;
            }
        });
        this.progressQueue = save.then(() => undefined);
        const saved = await save;

        if (saved) {
            this.lastSavedPosition = position;
        }
        if (version === this.confirmedVersion) {
            this.state = { ...this.state, progress: saved ? "saved" : "unsaved" };
            this.notify();
        }
    }

    private async doClose(): Promise<ReadingSessionCloseResult> {
        this.requestId++;
        this.state = { ...this.state, status: "closed", error: null };
        this.notify();

        await Promise.allSettled([
            this.initializePromise ?? Promise.resolve(),
            ...this.activeRenders,
            this.progressQueue,
            this.activeCompletion ?? Promise.resolve(),
        ]);

        const progressPromise = this.retryUnsavedPosition();
        const wordsPromise = this.document.publishWordsSection().then(
            (result): ReadingSessionCloseResult["words"] => result,
            (): ReadingSessionCloseResult["words"] => "failed"
        );
        const [progress, words] = await Promise.all([progressPromise, wordsPromise]);
        this.listeners.clear();
        return { progress, words, completion: { ...this.state.completion } };
    }

    private async retryUnsavedPosition(): Promise<ReadingSessionCloseResult["progress"]> {
        const confirmed = this.state.confirmed;
        if (this.state.progress !== "unsaved" || !confirmed || this.articleLines.length === 0) {
            return "notNeeded";
        }

        const position = positionForSelection(confirmed);
        try {
            await this.document.setPosition(position);
            this.lastSavedPosition = position;
            this.state = { ...this.state, progress: "saved" };
            return "saved";
        } catch {
            return "failed";
        }
    }

    private notify(): void {
        const snapshot = this.snapshot();
        this.listeners.forEach((listener) => listener(snapshot));
    }
}

export { ReadingSession };
export type {
    ReadingSessionAction,
    ReadingSessionCloseResult,
    ReadingSessionDependencies,
    ReadingSessionState,
};
