import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App, PluginManifest, WorkspaceLeaf } from "obsidian";
import type { ReadingDocument } from "@/reading/readingDocument";
import { DEFAULT_SETTINGS } from "@/settings";
import type { ReadingSession } from "@/reading/readingSession";
import type { LearningRecordIntakeModule } from "@/learningRecord/intake";
import type { TextDatabasePublication } from "@/textDatabase/publication";
import type { TFile } from "obsidian";
import type DbProvider from "@/db/base";

const mocks = vi.hoisted(() => ({
    detach: vi.fn(),
    notices: [] as string[],
    serverStart: vi.fn(),
    serverClose: vi.fn(),
    serverConstruct: vi.fn(),
}));
vi.mock("@/api/server", () => ({
    default: class {
        constructor() {
            mocks.serverConstruct();
        }
        start = mocks.serverStart;
        close = mocks.serverClose;
    },
}));
vi.mock("@/plugin/views", () => ({
    activatePluginView: vi.fn(),
    registerPluginViews: vi.fn(),
    detachPluginViews: mocks.detach,
}));
vi.mock("@/views/ReadingArea.vue", () => ({ default: {} }));
vi.mock("@/views/Global.vue", () => ({ default: {} }));
vi.mock("obsidian", async () => {
    const original = await vi.importActual<typeof import("obsidian")>("obsidian");
    return {
        ...original,
        Notice: class {
            constructor(message: string) {
                mocks.notices.push(message);
            }
        },
    };
});

import LanguageLearner from "@/plugin";
import { ReadingView } from "@/views/ReadingView";

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
async function flush() {
    for (let i = 0; i < 12; i++) await Promise.resolve();
}
function plugin() {
    const result = new LanguageLearner({} as App, {} as PluginManifest);
    result.app = { workspace: { getLeavesOfType: () => [] } } as unknown as App;
    return result;
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.detach.mockReset();
    mocks.notices.length = 0;
    mocks.serverStart.mockResolvedValue(undefined);
    mocks.serverClose.mockResolvedValue(undefined);
});

describe("publication plugin lifecycle", () => {
    it("waits for an accepted server startup before closing it and the DB", async () => {
        const instance = plugin();
        instance.settings = { ...DEFAULT_SETTINGS };
        const startup = deferred();
        const stop = deferred();
        const closeDB = vi.fn();
        instance.db = { close: closeDB } as unknown as DbProvider;
        mocks.serverStart.mockReturnValue(startup.promise);
        mocks.serverClose.mockReturnValue(stop.promise);
        const starting = instance.startSelfServer();
        expect(instance.startSelfServer()).toBe(starting);
        await vi.waitFor(() => expect(mocks.serverStart).toHaveBeenCalledOnce());
        const shutdown = instance.onunload();
        const stopping = instance.stopSelfServer();
        expect(instance.stopSelfServer()).toBe(stopping);
        await flush();
        expect(mocks.serverClose).not.toHaveBeenCalled();
        expect(closeDB).not.toHaveBeenCalled();
        await instance.startSelfServer();
        expect(mocks.serverConstruct).toHaveBeenCalledOnce();
        startup.resolve();
        await starting;
        await flush();
        expect(mocks.serverClose).toHaveBeenCalledOnce();
        expect(closeDB).not.toHaveBeenCalled();
        stop.resolve();
        await Promise.all([shutdown, stopping]);
        expect(closeDB).toHaveBeenCalledOnce();
        expect(instance.server).toBeNull();
    });

    it("coalesces repeated starts after an ordinary stop finishes", async () => {
        const instance = plugin();
        instance.settings = { ...DEFAULT_SETTINGS };
        await instance.startSelfServer();
        const close = deferred();
        mocks.serverClose.mockReturnValueOnce(close.promise);
        const stopping = instance.stopSelfServer();
        const restart = instance.startSelfServer();
        const duplicateRestart = instance.startSelfServer();
        await flush();
        expect(mocks.serverConstruct).toHaveBeenCalledOnce();
        expect(mocks.serverClose).toHaveBeenCalledOnce();
        close.resolve();
        await Promise.all([stopping, restart, duplicateRestart]);
        expect(mocks.serverConstruct).toHaveBeenCalledTimes(2);
        expect(mocks.serverStart).toHaveBeenCalledTimes(2);
        await instance.stopSelfServer();
    });

    it("cancels startup when shutdown begins during the server import", async () => {
        const instance = plugin();
        instance.settings = { ...DEFAULT_SETTINGS };
        const starting = instance.startSelfServer();
        const shutdown = instance.onunload();
        await Promise.all([starting, shutdown]);
        expect(mocks.serverConstruct).not.toHaveBeenCalled();
        expect(mocks.serverStart).not.toHaveBeenCalled();
        expect(mocks.serverClose).not.toHaveBeenCalled();
    });

    it("blocks manual publication immediately and drains accepted work before closing publication and DB", async () => {
        const instance = plugin();
        const intake = deferred();
        const server = deferred();
        const reading = deferred();
        const events: string[] = [];
        instance.learningRecordIntake = {
            close: () => {
                events.push("intake");
                return intake.promise;
            },
        } as unknown as LearningRecordIntakeModule;
        instance.stopSelfServer = () => {
            events.push("server");
            return server.promise;
        };
        instance.textDatabasePublication = {
            close: vi.fn(async () => {
                events.push("publication");
            }),
            publishWordDatabase: vi.fn(),
            publishReviewDatabase: vi.fn(),
            publishAll: vi.fn(),
            retryCompletionReload: vi.fn(),
        } as unknown as TextDatabasePublication<TFile>;
        instance.db = {
            close: () => {
                events.push("db");
            },
        } as unknown as DbProvider;
        const view = new ReadingView({} as WorkspaceLeaf, instance);
        view.session = {
            close: vi.fn(() => {
                events.push("reading");
                return reading.promise;
            }),
        } as unknown as ReadingSession;
        mocks.detach.mockImplementation(() => {
            void view.onClose();
            events.push("detach");
        });
        const shutdown = instance.onunload();
        expect(instance.onunload()).toBe(shutdown);
        expect(events).toEqual(["intake", "server", "reading", "detach"]);
        expect(await instance.refreshWordDb()).toEqual({ target: "word", status: "closed" });
        expect(await instance.refreshReviewDb()).toEqual({ target: "review", status: "closed" });
        expect(await instance.refreshTextDB()).toEqual({
            word: { target: "word", status: "closed" },
            review: { target: "review", status: "closed" },
        });
        expect(await instance.retryCompletionReload()).toEqual({ status: "closed" });
        expect(instance.textDatabasePublication.publishWordDatabase).not.toHaveBeenCalled();
        expect(instance.textDatabasePublication.publishReviewDatabase).not.toHaveBeenCalled();
        expect(instance.textDatabasePublication.publishAll).not.toHaveBeenCalled();
        expect(instance.textDatabasePublication.retryCompletionReload).not.toHaveBeenCalled();
        intake.resolve();
        server.resolve();
        await flush();
        expect(events).not.toContain("publication");
        reading.resolve();
        await shutdown;
        expect(events.slice(-2)).toEqual(["publication", "db"]);
        expect(view.session.close).toHaveBeenCalledOnce();
    });

    it("waits for a view already closing after its leaf disappeared", async () => {
        const instance = plugin();
        const reading = deferred();
        const closeDB = vi.fn();
        instance.db = { close: closeDB } as unknown as DbProvider;
        const view = new ReadingView({} as WorkspaceLeaf, instance);
        view.session = { close: vi.fn(() => reading.promise) } as unknown as ReadingSession;
        const firstClose = view.onClose();
        expect(view.onClose()).toBe(firstClose);
        const shutdown = instance.onunload();
        await flush();
        expect(closeDB).not.toHaveBeenCalled();
        reading.resolve();
        await shutdown;
        expect(closeDB).toHaveBeenCalledOnce();
    });

    it("drains a reading session still initializing without mounting its Vue root", async () => {
        const instance = plugin();
        instance.settings = { ...DEFAULT_SETTINGS };
        const initialization = deferred();
        const publishWords = vi.fn(async () => "published" as const);
        const view = new ReadingView({} as WorkspaceLeaf, instance);
        vi.spyOn(view, "createReadingDocument").mockReturnValue({
            getArticleLines: () => ["alpha"],
            getLastPosition: () => initialization.promise.then(() => 0),
            publishWordsSection: publishWords,
        } as unknown as ReadingDocument);
        const opening = view.setViewData("alpha");
        const closing = view.onClose();
        expect(view.session?.snapshot().status).toBe("closed");
        await flush();
        expect(publishWords).not.toHaveBeenCalled();
        initialization.resolve();
        await Promise.all([opening, closing]);
        expect(publishWords).toHaveBeenCalledOnce();
        expect(view.vueapp).toBeNull();
        expect(view.onClose()).toBe(closing);
    });

    it("rejects a reading view created by a deferred leaf change after shutdown", async () => {
        const instance = plugin();
        const leafChange = deferred();
        const closeDB = vi.fn();
        instance.db = { close: closeDB } as unknown as DbProvider;
        const unregister = vi.spyOn(instance, "unregisterReadingView");
        const attachListener = vi.spyOn(globalThis, "addEventListener");
        let lateView: ReadingView | null = null;
        const leaf = {
            view: { getState: () => ({}) },
            setViewState: async () => {
                await leafChange.promise;
                const view = new ReadingView(leaf as unknown as WorkspaceLeaf, instance);
                lateView = view;
                const createDocument = vi.spyOn(view, "createReadingDocument");
                const initializeButtons = vi.spyOn(view, "initHeaderButtons");
                await view.onOpen();
                await view.setViewData("alpha");
                expect(createDocument).not.toHaveBeenCalled();
                expect(initializeButtons).not.toHaveBeenCalled();
            },
        };
        const opening = instance.setReadingView(leaf as unknown as WorkspaceLeaf);
        await instance.onunload();
        expect(closeDB).toHaveBeenCalledOnce();
        leafChange.resolve();
        await opening;
        expect(lateView).not.toBeNull();
        const view = lateView as unknown as ReadingView;
        const closing = view.onClose();
        expect(view.onClose()).toBe(closing);
        await closing;
        expect(view.session).toBeNull();
        expect(view.document).toBeNull();
        expect(view.vueapp).toBeNull();
        expect(unregister).toHaveBeenCalledOnce();
        expect(attachListener).not.toHaveBeenCalledWith(
            "obsidian-langr-refresh",
            expect.anything()
        );
        expect(closeDB).toHaveBeenCalledOnce();
        vi.restoreAllMocks();
    });

    it("still closes the DB and removes global roots after teardown failures", async () => {
        const instance = plugin();
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const closeDB = vi.fn();
        const remove = vi.fn();
        instance.learningRecordIntake = {
            close: () => Promise.reject(new Error("intake")),
        } as unknown as LearningRecordIntakeModule;
        instance.textDatabasePublication = {
            close: () => Promise.reject(new Error("publication")),
        } as unknown as TextDatabasePublication<TFile>;
        instance.stopSelfServer = () => Promise.reject(new Error("server"));
        instance.db = { close: closeDB } as unknown as DbProvider;
        instance.vueApp = {
            unmount: () => {
                throw new Error("unmount");
            },
        } as unknown as typeof instance.vueApp;
        instance.appEl = { remove } as unknown as HTMLElement;
        mocks.detach.mockImplementation(() => {
            throw new Error("detach");
        });
        await instance.onunload();
        expect(closeDB).toHaveBeenCalledOnce();
        expect(remove).toHaveBeenCalledOnce();
        expect(instance.appEl).toBeNull();
        expect(instance.vueApp).toBeNull();
        vi.restoreAllMocks();
    });

    it("reports target failures correctly and retries only dictionary reload", async () => {
        const instance = plugin();
        instance.reportTextDatabasePublicationResult({ target: "word", status: "invalidTarget" });
        instance.reportTextDatabasePublicationResult({ target: "review", status: "invalidTarget" });
        instance.reportTextDatabasePublicationResult({
            target: "word",
            status: "published",
            completionReload: { status: "failed" },
        });
        expect(mocks.notices).toEqual([
            "Invalid word database path",
            "Invalid review database path",
            "Word database published, but completion dictionaries could not be reloaded",
        ]);
        instance.textDatabasePublication = {
            retryCompletionReload: vi.fn(async () => ({ status: "reloaded" })),
        } as unknown as TextDatabasePublication<TFile>;
        expect(await instance.retryCompletionReload()).toEqual({ status: "reloaded" });
        expect(instance.textDatabasePublication.retryCompletionReload).toHaveBeenCalledOnce();
    });
});
