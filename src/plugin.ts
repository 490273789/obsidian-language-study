import {
    Notice,
    Plugin,
    Menu,
    WorkspaceLeaf,
    ViewState,
    MarkdownView,
    TFile,
    Platform,
} from "obsidian";
import { around } from "monkey-around";
import { createApp, App as VueApp } from "vue";

import "./main.css";
import { SEARCH_PANEL_VIEW } from "./views/SearchPanelView";
import { READING_VIEW_TYPE, READING_ICON, ReadingView } from "./views/ReadingView";
import { LEARN_PANEL_VIEW } from "./views/LearnPanelView";
// import { PDFView, PDF_FILE_EXTENSION, VIEW_TYPE_PDF } from "./views/PDFView";

import { t } from "./lang/helper";
import DbProvider from "./db/base";
import { WebDb } from "./db/web_db";
import { LocalDb } from "./db/local_db";
import { TextParser } from "./views/parser";
import { FrontMatterManager } from "./utils/frontmatter";
import type Server from "./api/server";
import {
    TextDatabasePublication,
    type TextDatabasePublicationAllResult,
    type TextDatabasePublicationResult,
    type CompletionReloadResult,
} from "./textDatabase/publication";

import { MyPluginSettings, normalizeSettings, SettingTab } from "./settings";
import store from "./store";
import { playPronunciation } from "./utils/helpers";
import type { Position } from "./constant";
import type { ReadingSelection } from "./reading/readingContext";
import { emitLangrRefresh, emitLangrRefreshStat, emitLangrSearch } from "./events";
import { getVaultBasePath } from "./utils/platform";
import { moment } from "./utils/moment";
import { activatePluginView, detachPluginViews, registerPluginViews } from "./plugin/views";
import { registerPluginCommands } from "./plugin/commands";
import { registerInputHandlers } from "./plugin/input";
import { LearningRecordIntakeModule } from "./learningRecord/intake";

import Global from "./views/Global.vue";
import { providePlugin } from "./ui/context";

const FRONT_MATTER_KEY: string = "langr";

export default class LanguageLearner extends Plugin {
    declare constants: { basePath: string; platform: "mobile" | "desktop" };
    declare settings: MyPluginSettings;
    appEl: HTMLElement | null = null;
    vueApp: VueApp | null = null;
    declare db: DbProvider;
    server: Server | null = null;
    declare parser: TextParser;
    declare textDatabasePublication: TextDatabasePublication<TFile>;
    declare learningRecordIntake: LearningRecordIntakeModule;
    markdownButtons: Record<string, HTMLElement | null> = {};
    declare frontManager: FrontMatterManager;
    store: typeof store = store;
    private shuttingDown = false;
    private shutdown: Promise<void> | null = null;
    private readingViews = new Set<ReadingView>();
    private serverStarting: Promise<void> | null = null;
    private serverStopping: Promise<void> | null = null;

    async onload() {
        // 读取设置
        await this.loadSettings();
        this.addSettingTab(new SettingTab(this.app, this));

        this.registerConstants();

        // 打开数据库
        this.db = this.settings.use_server
            ? new WebDb(
                  this.settings.host,
                  this.settings.port,
                  this.settings.use_https,
                  this.settings.api_key
              )
            : new LocalDb(this);
        await this.db.open();

        // 设置解析器
        this.parser = new TextParser(this.db);
        this.frontManager = new FrontMatterManager(this.app);
        this.textDatabasePublication = this.createTextDatabasePublication();
        this.learningRecordIntake = this.createLearningRecordIntake();

        // 打开内置服务器
        if (this.settings.self_server) {
            await this.startSelfServer();
        }

        // test
        // this.addCommand({
        // 	id: "langr-test",
        // 	name: "Test for langr",
        // 	callback: () => new Notice("hello!")
        // })

        // await this.replacePDF();

        this.initStore();

        this.addCommands();
        this.registerCustomViews();
        this.registerReadingToggle();
        registerInputHandlers(this);
        this.registerEvent(
            this.app.workspace.on("css-change", () => {
                store.dark = document.body.hasClass("theme-dark");
                store.themeChange = !store.themeChange;
            })
        );

        // 创建全局app用于各种浮动元素
        this.appEl = document.body.createDiv({ cls: "langr-app" });
        this.vueApp = createApp(Global);
        providePlugin(this.vueApp, this);
        this.vueApp.mount(this.appEl);
    }

    onunload(): Promise<void> {
        if (this.shutdown) {
            return this.shutdown;
        }
        this.shuttingDown = true;
        this.shutdown = this.closeResources();
        return this.shutdown;
    }

    get isShuttingDown(): boolean {
        return this.shuttingDown;
    }

    registerReadingView(view: ReadingView): void {
        if (this.shuttingDown) {
            void view.onClose().catch((error) => {
                console.warn("Language Learner could not close a late reading view", error);
            });
            return;
        }
        this.readingViews.add(view);
    }

    unregisterReadingView(view: ReadingView): void {
        this.readingViews.delete(view);
    }

    private async closeResources(): Promise<void> {
        const settle = async (operation: () => unknown): Promise<void> => {
            try {
                await operation();
            } catch (error) {
                console.warn("Language Learner resource shutdown failed", error);
            }
        };
        // Keep publication and the DB available to already accepted work.
        const intake = settle(() => this.learningRecordIntake?.close());
        const server = settle(() => this.stopSelfServer());
        const views = new Set(this.readingViews);
        try {
            for (const leaf of this.app.workspace.getLeavesOfType(READING_VIEW_TYPE)) {
                if (leaf.view instanceof ReadingView) {
                    views.add(leaf.view);
                }
            }
        } catch (error) {
            console.warn("Language Learner could not collect reading views", error);
        }
        const reading = [...views].map((view) => settle(() => view.onClose()));
        await settle(() => detachPluginViews(this));
        await Promise.all([intake, server, ...reading]);
        await settle(() => this.textDatabasePublication?.close());
        await settle(() => this.db?.close());
        await settle(() => this.vueApp?.unmount());
        await settle(() => this.appEl?.remove());
        this.appEl = null;
        this.vueApp = null;
    }

    registerConstants() {
        this.constants = {
            basePath: getVaultBasePath(this.app),
            platform: Platform.isMobile ? "mobile" : "desktop",
        };
    }

    startSelfServer(): Promise<void> {
        if (this.shuttingDown) {
            return Promise.resolve();
        }
        if (this.serverStopping) {
            return this.serverStopping.then(() => this.startSelfServer());
        }
        if (!this.serverStarting) {
            this.serverStarting = this.startServer().finally(() => {
                this.serverStarting = null;
            });
        }
        return this.serverStarting;
    }

    private async startServer(): Promise<void> {
        if (!Platform.isDesktopApp) {
            this.settings.self_server = false;
            await this.saveSettings();
            new Notice("Self server is only available on desktop");
            return;
        }
        if (this.server) {
            return;
        }
        const { default: Server } = await import("./api/server");
        if (this.shuttingDown || this.serverStopping) {
            return;
        }
        this.server = new Server(this, this.settings.self_port);
        await this.server.start();
    }

    stopSelfServer(): Promise<void> {
        if (!this.serverStopping) {
            this.serverStopping = this.stopServer().finally(() => {
                this.serverStopping = null;
            });
        }
        return this.serverStopping;
    }

    private async stopServer(): Promise<void> {
        // An accepted start may still be importing Node or waiting for listen().
        await this.serverStarting?.catch(() => undefined);
        const server = this.server;
        if (!server) {
            return;
        }
        await server.close();
        if (this.server === server) {
            this.server = null;
        }
    }

    // async replacePDF() {
    //     if (await app.vault.adapter.exists(
    //         ".obsidian/plugins/obsidian-language-learner/pdf/web/viewer.html"
    //     )) {
    //         this.registerView(VIEW_TYPE_PDF, (leaf) => {
    //             return new PDFView(leaf);
    //         });

    //         (this.app as any).viewRegistry.unregisterExtensions([
    //             PDF_FILE_EXTENSION,
    //         ]);
    //         this.registerExtensions([PDF_FILE_EXTENSION], VIEW_TYPE_PDF);

    //         this.registerDomEvent(window, "message", (evt) => {
    //             if (evt.data.type === "search") {
    //                 // if (evt.data.funckey || this.store.searchPinned)
    //                 this.queryWord(evt.data.selection);
    //             }
    //         });
    //     }
    // }

    initStore() {
        this.store.dark = document.body.hasClass("theme-dark");
        this.store.themeChange = false;
        this.store.fontSize = this.settings.font_size;
        this.store.fontFamily = this.settings.font_family;
        this.store.lineHeight = this.settings.line_height;
        this.store.popupSearch = this.settings.popup_search;
        this.store.searchPinned = false;
        this.store.dictsChange = false;
        this.store.dictHeight = this.settings.dict_height;
    }

    addCommands() {
        registerPluginCommands(this);
    }

    registerCustomViews() {
        registerPluginViews(this);
    }

    async setMarkdownView(leaf: WorkspaceLeaf, focus: boolean = true) {
        await leaf.setViewState(
            {
                type: "markdown",
                state: leaf.view.getState(),
                //popstate: true,
            } as ViewState,
            { focus }
        );
    }

    async setReadingView(leaf: WorkspaceLeaf) {
        if (this.shuttingDown) {
            return;
        }
        await leaf.setViewState({
            type: READING_VIEW_TYPE,
            state: leaf.view.getState(),
            //popstate: true,
        } as ViewState);
    }

    createTextDatabasePublication(): TextDatabasePublication<TFile> {
        return new TextDatabasePublication<TFile>({
            getSettings: () => ({
                wordDatabasePath: this.settings.word_database,
                reviewDatabasePath: this.settings.review_database,
                colDelimiter: this.settings.col_delimiter,
                reviewDelimiter: this.settings.review_delimiter,
            }),
            expressionStore: {
                getAllExpressionSimple: (ignores) => this.db.getAllExpressionSimple(ignores),
                getExpressionAfter: (time) => this.db.getExpressionAfter(time),
            },
            vault: {
                getFile: (path) => {
                    const file = this.app.vault.getAbstractFileByPath(path);
                    return file && !("children" in file) ? (file as TFile) : null;
                },
                getPath: (file) => file.path,
                process: (file, transform) => this.app.vault.process(file, transform),
                write: (file, text) => this.app.vault.modify(file, text),
            },
            completionReloader: {
                reloadCustomDictionaries: () => {
                    return (this.app as any).commands.executeCommandById(
                        "various-complements:reload-custom-dictionaries"
                    );
                },
            },
        });
    }

    createLearningRecordIntake(): LearningRecordIntakeModule {
        return new LearningRecordIntakeModule({
            recordStore: {
                commitWhole: (candidate, firstAcceptedAtIfNew) =>
                    this.db.commitWhole(candidate, firstAcceptedAtIfNew),
            },
            updateReadingDocument: async () => {
                emitLangrRefresh();
            },
            updateStatistics: async () => {
                emitLangrRefreshStat();
            },
            textDatabasePublication: {
                publishWordDatabase: () => this.textDatabasePublication.publishWordDatabase(),
                publishReviewDatabase: () => this.textDatabasePublication.publishReviewDatabase(),
            },
            isAutomaticPublicationEnabled: () => this.settings.auto_refresh_db,
            now: () => moment().unix(),
        });
    }

    reportTextDatabasePublicationResult(result: TextDatabasePublicationResult): void {
        if (result.status === "invalidTarget") {
            new Notice(
                t(
                    result.target === "word"
                        ? "Invalid word database path"
                        : "Invalid review database path"
                )
            );
        } else if (result.status === "pathConflict") {
            new Notice(t("Word and review databases must use different files"));
        } else if (result.status === "failed") {
            new Notice(
                t(
                    result.target === "word"
                        ? "Word database publication failed"
                        : "Review database publication failed"
                )
            );
        } else if (result.status === "published" && result.completionReload?.status === "failed") {
            new Notice(
                t("Word database published, but completion dictionaries could not be reloaded")
            );
        }
    }

    async refreshTextDB(): Promise<TextDatabasePublicationAllResult> {
        if (this.shuttingDown) {
            return {
                word: { target: "word", status: "closed" },
                review: { target: "review", status: "closed" },
            };
        }
        const result = await this.textDatabasePublication.publishAll();
        this.reportTextDatabasePublicationResult(result.word);
        this.reportTextDatabasePublicationResult(result.review);
        return result;
    }

    refreshWordDb = async (): Promise<TextDatabasePublicationResult> => {
        if (this.shuttingDown) {
            return { target: "word", status: "closed" };
        }
        const result = await this.textDatabasePublication.publishWordDatabase();
        this.reportTextDatabasePublicationResult(result);
        return result;
    };

    refreshReviewDb = async (): Promise<TextDatabasePublicationResult> => {
        if (this.shuttingDown) {
            return { target: "review", status: "closed" };
        }
        const result = await this.textDatabasePublication.publishReviewDatabase();
        this.reportTextDatabasePublicationResult(result);
        return result;
    };

    retryCompletionReload = async (): Promise<CompletionReloadResult> => {
        if (this.shuttingDown) {
            return { status: "closed" };
        }
        const result = await this.textDatabasePublication.retryCompletionReload();
        if (result.status === "failed") {
            new Notice(t("Completion dictionaries could not be reloaded"));
        }
        return result;
    };

    // 在MardownView的扩展菜单加一个转为Reading模式的选项
    registerReadingToggle = () => {
        const pluginSelf = this;
        pluginSelf.register(
            around(MarkdownView.prototype, {
                onPaneMenu(next) {
                    return function (this: MarkdownView, m: Menu, source: string) {
                        const file = this.file;
                        const cache = file ? pluginSelf.app.metadataCache.getFileCache(file) : null;

                        if (!file || !cache?.frontmatter || !cache?.frontmatter[FRONT_MATTER_KEY]) {
                            return next.call(this, m, source);
                        }

                        m.addItem((item) => {
                            item.setTitle(t("Open as Reading View"))
                                .setIcon(READING_ICON)
                                .onClick(() => {
                                    void pluginSelf.setReadingView(this.leaf);
                                });
                        });

                        next.call(this, m, source);
                    };
                },
            })
        );

        // 增加标题栏切换阅读模式和mardown模式的按钮
        pluginSelf.register(
            around(WorkspaceLeaf.prototype, {
                setViewState(next) {
                    return function (
                        this: WorkspaceLeaf,
                        state: ViewState,
                        eState?: unknown
                    ): Promise<void> {
                        return next.call(this, state, eState).then(() => {
                            if (state.type === "markdown" && state.state?.file) {
                                const cache = pluginSelf.app.metadataCache.getCache(
                                    state.state.file as string
                                );
                                if (cache?.frontmatter && cache.frontmatter[FRONT_MATTER_KEY]) {
                                    if (!pluginSelf.markdownButtons["reading"]) {
                                        // 在软件初始化的时候，view上面可能没有 addAction 这个方法
                                        setTimeout(() => {
                                            const action = (this.view as MarkdownView).addAction(
                                                "view",
                                                t("Open as Reading View"),
                                                () => {
                                                    void pluginSelf.setReadingView(this);
                                                }
                                            );
                                            pluginSelf.markdownButtons["reading"] = action;
                                            action.addClass("change-to-reading");
                                        });
                                    }
                                } else {
                                    // 在软件初始化的时候，view上面可能没有 actionsEl 这个字段
                                    (
                                        this.view as MarkdownView & {
                                            actionsEl?: HTMLElement;
                                        }
                                    ).actionsEl
                                        ?.querySelectorAll(".change-to-reading")
                                        .forEach((el) => el.remove());
                                    // pluginSelf.markdownButtons["reading"]?.remove();
                                    pluginSelf.markdownButtons["reading"] = null;
                                }
                            } else {
                                pluginSelf.markdownButtons["reading"] = null;
                            }
                        });
                    };
                },
            })
        );
    };

    async queryWord(
        word: string,
        context?: ReadingSelection,
        evtPosition?: Position
    ): Promise<void> {
        if (this.shuttingDown || !word) return;

        if (!this.settings.popup_search) {
            await this.activateView(SEARCH_PANEL_VIEW, "left");
        }

        if (context && Platform.isDesktopApp) {
            await this.activateView(LEARN_PANEL_VIEW, "right");
        }

        emitLangrSearch(word, context, evtPosition);

        if (this.settings.auto_pron) {
            playPronunciation(word, this.settings.review_prons);
        }
    }

    async loadSettings() {
        this.settings = normalizeSettings(await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView(VIEW_TYPE: string, side: "left" | "right" | "tab") {
        await activatePluginView(this, VIEW_TYPE, side);
    }
}
