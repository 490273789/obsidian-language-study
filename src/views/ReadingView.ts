import { Menu, Notice, TextFileView, WorkspaceLeaf } from "obsidian";
import { App as VueApp, createApp } from "vue";

import LanguageLearner from "@/plugin";
import ReadingArea from "./ReadingArea.vue";
import { t } from "@/lang/helper";
import { providePlugin, provideView } from "@/ui/context";
import type { EventMap } from "@/constant";
import { ReadingDocument } from "@/reading/readingDocument";
import { ReadingSession } from "@/reading/readingSession";

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
    private initialization: Promise<void> | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: LanguageLearner) {
        super(leaf);
        this.plugin = plugin;
        this.firstInit = true;
    }

    getIcon() {
        return READING_ICON;
    }

    getViewData(): string {
        return this.data;
    }

    async setViewData(data: string, _clear?: boolean) {
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

    // 新词面板中提交后，刷新阅读页面中单词的状态
    refresh = (evt: EventMap["obsidian-langr-refresh"]) => {
        let expression: string = evt.detail.expression.toLowerCase();
        let type: string = evt.detail.type;
        let status: number = evt.detail.status;
        const statusMap = ["ignore", "learning", "familiar", "known", "learned"];

        if (type === "WORD") {
            let wordEls = this.contentEl.querySelectorAll(".word");
            if (wordEls.length === 0) {
                return;
            }
            wordEls.forEach((el) => {
                if (el.textContent?.toLowerCase() === expression) {
                    el.className = `word ${statusMap[status]}`;
                }
            });
        } else if (type === "PHRASE") {
            let phraseEls = this.contentEl.querySelectorAll(".phrase");
            let isExist = false;
            if (phraseEls.length > 0) {
                phraseEls.forEach((el) => {
                    if (el.textContent?.toLowerCase() === expression) {
                        isExist = true;
                        el.className = `phrase ${statusMap[status]}`;
                    }
                });
            }

            this.removeSelect();
            if (isExist) {
                return;
            }

            // 词组拆分成单词和空格
            let words: string[] = [];
            expression.split(" ").forEach((w) => {
                if (w !== "") {
                    words.push(w, " ");
                }
            });
            words.pop();

            let isMatch = (startEl: Element, words: string[]) => {
                let el: Element | null = startEl;
                let container: Element[] = [];
                for (let word of words) {
                    if (!el || el.textContent?.toLowerCase() !== word) {
                        return null;
                    }
                    container.push(el);
                    el = el.nextElementSibling;
                }

                return container;
            };

            // 在匹配词组的单词元素外面包一个span.phrase
            let sentencesEls = this.containerEl.querySelectorAll(".stns");
            sentencesEls.forEach((senEl) => {
                let children = senEl.children;
                let idx = -1;
                while (idx++ < children.length) {
                    let container;
                    if ((container = isMatch(children[idx], words))) {
                        let phraseEl = createSpan({ cls: `phrase ${statusMap[status]}` });
                        senEl.insertBefore(phraseEl, children[idx]);
                        container.forEach((el) => {
                            el.remove();
                            phraseEl.appendChild(el);
                        });
                        idx += words.length - 1;
                    }
                }
            });
        }
    };

    wrapSelect(elStart: HTMLElement, elEnd: HTMLElement) {
        this.removeSelect();
        if (
            !elStart.matchParent(".stns") ||
            !elEnd.matchParent(".stns") ||
            elStart.parentElement !== elEnd.parentElement
        ) {
            return null;
        }
        let parent = elStart.parentNode;
        if (!parent) {
            return null;
        }
        let selectSpan = document.body.createSpan({ cls: "select" });
        parent.insertBefore(selectSpan, elStart);
        for (let el: Node | null = elStart; el && el !== elEnd;) {
            const next: ChildNode | null = el.nextSibling;
            selectSpan.appendChild(el);
            el = next;
        }
        selectSpan.appendChild(elEnd);
        return selectSpan;
    }

    removeSelect() {
        //把span.select里面的东西拿出来
        let selects = this.contentEl.querySelectorAll<HTMLElement>("span.select");
        selects.forEach((el) => {
            let parent = el.parentElement;
            if (!parent) {
                return;
            }
            let children: Node[] = [];
            el.childNodes.forEach((child) => {
                children.push(child);
            });
            for (let c of children) {
                parent.insertBefore(c, el);
            }
            el.remove();
        });
    }

    initHeaderButtons() {
        this.addAction("book", t("Return to Markdown"), () => {
            this.backToMarkdown();
        });
    }

    async onOpen() {
        addEventListener("obsidian-langr-refresh", this.refresh as EventListener);
        this.initHeaderButtons();

        // const contentEl = this.contentEl.createEl("div", {
        //     cls: "langr-reading",
        // })
    }

    async onClose() {
        this.closed = true;
        removeEventListener("obsidian-langr-refresh", this.refresh as EventListener);
        this.vueapp?.unmount();
        this.vueapp = null;
        const result = await this.session?.close();
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
