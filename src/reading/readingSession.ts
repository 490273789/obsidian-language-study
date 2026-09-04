import type { SafeHtml } from "@/utils/safeHtml";
import type { RenderArticleResult } from "@/views/renderArticle";

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

type ReadingSessionState = Readonly<{
    status: ReadingSessionStatus;
    desired: ReadingSessionSelection;
    confirmed: ConfirmedReadingPage | null;
    totalLines: number;
    progress: ReadingProgressStatus;
    error: ReadingSessionError | null;
}>;

type ReadingSessionAction =
    | Readonly<{ type: "navigate"; page: number }>
    | Readonly<{ type: "resize"; pageSize: number }>
    | Readonly<{ type: "refresh" }>
    | Readonly<{ type: "retry" }>
    | Readonly<{ type: "finishPage" }>;

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
}>;

type ReadingSessionCloseResult = Readonly<{
    progress: "saved" | "notNeeded" | "failed";
    words: "published" | "skipped" | "failed";
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
    private readonly listeners = new Set<ReadingSessionListener>();
    private readonly activeRenders = new Set<Promise<unknown>>();

    private state: ReadingSessionState;
    private requestId = 0;
    private confirmedVersion = 0;
    private lastSavedPosition: string | null = null;
    private retryNeedsPersistence = false;
    private progressQueue: Promise<void> = Promise.resolve();
    private initializePromise: Promise<ReadingSessionState> | null = null;
    private closePromise: Promise<ReadingSessionCloseResult> | null = null;

    constructor(dependencies: ReadingSessionDependencies) {
        this.articleLines = [...dependencies.articleLines];
        this.defaultPageSize = dependencies.defaultPageSize;
        this.document = dependencies.document;
        this.renderer = dependencies.renderer;
        this.ignoreStore = dependencies.ignoreStore;
        this.state = {
            status: "initializing",
            desired: { page: 1, pageSize: normalizePageSize(this.defaultPageSize) },
            confirmed: null,
            totalLines: this.articleLines.length,
            progress: "saved",
            error: null,
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
            desired: { ...this.state.desired },
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
                const desired = clampSelection(
                    { page: action.page, pageSize: this.state.desired.pageSize },
                    this.articleLines.length
                );
                return this.renderDesired(desired, true);
            }
            case "resize": {
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
            case "finishPage": {
                const confirmed = this.state.confirmed;
                if (!confirmed) {
                    return this.snapshot();
                }
                if (confirmed.newWords.length > 0 && this.ignoreStore) {
                    await this.ignoreStore.postIgnoreWords([...confirmed.newWords]);
                }
                if (confirmed.range.endLine < this.articleLines.length) {
                    const desired = clampSelection(
                        { page: confirmed.page + 1, pageSize: confirmed.pageSize },
                        this.articleLines.length
                    );
                    return this.renderDesired(desired, true);
                }
                return this.renderDesired(this.state.desired, false);
            }
        }
    }

    close(): Promise<ReadingSessionCloseResult> {
        if (!this.closePromise) {
            this.closePromise = this.doClose();
        }
        return this.closePromise;
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

        const wordsPromise = this.document.publishWordsSection().then(
            (result): ReadingSessionCloseResult["words"] => result,
            (): ReadingSessionCloseResult["words"] => "failed"
        );

        await Promise.allSettled([
            this.initializePromise ?? Promise.resolve(),
            ...this.activeRenders,
            this.progressQueue,
        ]);

        const progressPromise = this.retryUnsavedPosition();
        const [progress, words] = await Promise.all([progressPromise, wordsPromise]);
        this.listeners.clear();
        return { progress, words };
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
