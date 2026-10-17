import { Menu, Notice, TextFileView, WorkspaceLeaf } from "obsidian";
import { App as VueApp, createApp } from "vue";

import LanguageLearner from "@/plugin";
import ReadingArea from "./ReadingArea.vue";
import { t } from "@/lang/helper";
import { providePlugin, provideView } from "@/ui/context";
import { ReadingDocument } from "@/reading/readingDocument";
import { ReadingSession } from "@/reading/readingSession";
import { emitLangrRefresh, emitLangrRefreshStat } from "@/events";

export const READING_VIEW_TYPE: string = "langr-reading";
export const READING_ICON: string = "highlight-glyph";

export class ReadingView extends TextFileView {
    plugin: LanguageLearner;
    actionButtons: Record<string, HTMLElement> = {};
    vueapp: VueApp | null = null;
    firstInit: boolean;
    articleText = "";
    document: ReadingDocument | null = null;
    session: ReadingSession | null = null;
    private closed = false;
    private closing: Promise<void> | null = null;
    private initialization: Promise<void> | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: LanguageLearner) {
        super(leaf);
        this.plugin = plugin;
        this.firstInit = true;
        plugin.registerReadingView(this);
    }

    getIcon() {
        return READING_ICON;
    }

    getViewData(): string {
        return this.data;
    }

    async setViewData(data: string, _clear?: boolean) {
        if (this.closed || this.plugin.isShuttingDown) {
            return;
        }
        if (this.firstInit) {
            this.firstInit = false;
            this.initialization = this.initializeReadingSession(data);
        }
        await this.initialization;
    }

    getViewType(): string {
        return READING_VIEW_TYPE;
    }

    onPaneMenu(menu: Menu): void {
        menu.addItem((item) => {
            item.setTitle(t("Return to Markdown"))
                .setIcon("document")
                .onClick(() => {
                    this.backToMarkdown();
                });
        }).addSeparator();
        super.onPaneMenu(menu, "");
    }

    backToMarkdown(): void {
        this.plugin.setMarkdownView(this.leaf);
    }

    createReadingDocument(): ReadingDocument | null {
        if (!this.file) {
            return null;
        }
        const file = this.file;
        return new ReadingDocument({
            file: {
                read: () => this.plugin.app.vault.read(file),
                write: (text) => this.plugin.app.vault.modify(file, text),
            },
            progressStore: {
                getPosition: () => this.plugin.frontManager.getFrontMatter(file, "langr-pos"),
                setPosition: (position) =>
                    this.plugin.frontManager.setFrontMatter(file, "langr-pos", position),
            },
            expressionLookup: {
                getWordsPhrases: (text) => this.plugin.parser.getWordsPhrases(text),
            },
        });
    }

    private async initializeReadingSession(data: string): Promise<void> {
        const document = this.createReadingDocument();
        if (!document) {
            return;
        }
        this.document = document;
        const articleLines = document.getArticleLines(data);
        this.articleText = articleLines.join("\n");
        const session = new ReadingSession({
            articleLines,
            defaultPageSize: this.plugin.settings.default_paragraphs,
            document: {
                getLastPosition: () => document.getLastPosition(),
                setPosition: (position) => document.setPosition(position),
                publishWordsSection: () => document.publishWordsSection(),
            },
            renderer: {
                render: (text) => this.plugin.parser.parse(text),
            },
            wordCounter: (text) => this.plugin.parser.countWords(text),
            ignoreStore: {
                postIgnoreWords: (words) => this.plugin.db.postIgnoreWords(words),
            },
            onPageCompleted: async () => {
                emitLangrRefreshStat();
                emitLangrRefresh();
            },
        });
        this.session = session;
        await session.initialize();
        if (this.closed) {
            return;
        }

        this.vueapp = createApp(ReadingArea);
        providePlugin(this.vueapp, this.plugin);
        provideView(this.vueapp, this);
        this.vueapp.mount(this.contentEl);
    }

    clear(): void {}

    // 新词面板中提交后，重新渲染当前页以反映最新状态
    refresh = () => {
        void this.session?.act({ type: "refresh" });
    };

    initHeaderButtons() {
        this.addAction("book", t("Return to Markdown"), () => {
            this.backToMarkdown();
        });
    }

    async onOpen() {
        if (this.closed || this.plugin.isShuttingDown) {
            return;
        }
        addEventListener("obsidian-langr-refresh", this.refresh as EventListener);
        this.initHeaderButtons();

        // const contentEl = this.contentEl.createEl("div", {
        //     cls: "langr-reading",
        // })
    }

    onClose(): Promise<void> {
        if (!this.closing) {
            this.closed = true;
            this.closing = this.closeReadingSession().finally(() => {
                this.plugin.unregisterReadingView(this);
            });
        }
        return this.closing;
    }

    private async closeReadingSession(): Promise<void> {
        removeEventListener("obsidian-langr-refresh", this.refresh as EventListener);
        // Start session closure synchronously so navigation cannot accept new work.
        const session = this.session;
        const closingSession = session?.close();
        try {
            this.vueapp?.unmount();
        } catch (error) {
            console.warn("Reading View could not unmount", error);
        }
        this.vueapp = null;
        const [, closedSession] = await Promise.all([
            this.initialization?.catch(() => undefined),
            closingSession,
        ]);
        const result = session ? closedSession : await this.session?.close();
        if (result?.completion.status === "failed") {
            new Notice(
                t(
                    result.completion.error === "ignore_store_incompatible"
                        ? "Reading completion requires a compatible remote database"
                        : "Reading page could not be completed"
                )
            );
        } else if (
            result?.completion.status === "completed" &&
            result.completion.updates === "failed"
        ) {
            new Notice(t("Reading page completed, but some updates failed"));
        }
        if (result?.progress === "failed") {
            console.warn("Reading Session could not save its confirmed position while closing");
            new Notice(t("Reading position has not been saved"));
        }
        if (result?.words === "failed") {
            console.warn("Reading Session could not update the Reading Document words material");
            new Notice(t("Reading Document words could not be updated"));
        }
    }
}
