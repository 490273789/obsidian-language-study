import {
    Notice,
    Plugin,
    Menu,
    WorkspaceLeaf,
    ViewState,
    MarkdownView,
    Editor,
    TFile,
    Platform,
} from "obsidian";
import { around } from "monkey-around";
import { createApp, App as VueApp } from "vue";

import "./main.css";
import { SEARCH_PANEL_VIEW } from "./views/SearchPanelView";
import { READING_VIEW_TYPE, READING_ICON } from "./views/ReadingView";
import { LEARN_PANEL_VIEW } from "./views/LearnPanelView";
// import { PDFView, PDF_FILE_EXTENSION, VIEW_TYPE_PDF } from "./views/PDFView";

import { t } from "./lang/helper";
import DbProvider from "./db/base";
import { WebDb } from "./db/web_db";
import { LocalDb } from "./db/local_db";
import { TextParser } from "./views/parser";
import { FrontMatterManager } from "./utils/frontmatter";
import type Server from "./api/server";

import { MyPluginSettings, normalizeSettings, SettingTab } from "./settings";
import store from "./store";
import { playAudio } from "./utils/helpers";
import type { Position } from "./constant";
import { emitLangrSearch } from "./events";
import { getVaultBasePath } from "./utils/platform";
import { activatePluginView, detachPluginViews, registerPluginViews } from "./plugin/views";
import { registerPluginCommands } from "./plugin/commands";

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
    markdownButtons: Record<string, HTMLElement | null> = {};
    declare frontManager: FrontMatterManager;
    store: typeof store = store;

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
        this.parser = new TextParser(this);
        this.frontManager = new FrontMatterManager(this.app);

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
        this.registerContextMenu();
        this.registerLeftClick();
        this.registerMouseup();
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

    async onunload() {
        detachPluginViews(this);

        this.db.close();
        await this.stopSelfServer();
        // if (await app.vault.adapter.exists(".obsidian/plugins/obsidian-language-learner/pdf/web/viewer.html")) {
        //     this.registerExtensions([PDF_FILE_EXTENSION], "pdf");
        // }

        this.vueApp?.unmount();
        this.appEl?.remove();
        this.appEl = null;
        this.vueApp = null;
    }

    registerConstants() {
        this.constants = {
            basePath: getVaultBasePath(this.app),
            platform: Platform.isMobile ? "mobile" : "desktop",
        };
    }

    async startSelfServer(): Promise<void> {
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
        this.server = new Server(this, this.settings.self_port);
        await this.server.start();
    }

    async stopSelfServer(): Promise<void> {
        if (!this.server) {
            return;
        }
        await this.server.close();
        this.server = null;
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
        await leaf.setViewState({
            type: READING_VIEW_TYPE,
            state: leaf.view.getState(),
            //popstate: true,
        } as ViewState);
    }

    async refreshTextDB() {
        await this.refreshWordDb();
        await this.refreshReviewDb();
        (this.app as any).commands.executeCommandById(
            "various-complements:reload-custom-dictionaries"
        );
    }

    refreshWordDb = async () => {
        if (!this.settings.word_database) {
            return;
        }

        let dataBase = this.app.vault.getAbstractFileByPath(this.settings.word_database);
        if (!dataBase || dataBase.hasOwnProperty("children")) {
            new Notice("Invalid refresh database path");
            return;
        }
        // 获取所有非无视单词的简略信息
        let words = await this.db.getAllExpressionSimple(false);

        let classified: number[][] = Array(5)
            .fill(0)
            .map((): number[] => []);
        words.forEach((word, i) => {
            classified[word.status].push(i);
        });

        const statusMap = [t("Ignore"), t("Learning"), t("Familiar"), t("Known"), t("Learned")];

        let del = this.settings.col_delimiter;

        // 正向查询
        let classified_texts = classified.map((w, idx) => {
            return (
                `#### ${statusMap[idx]}\n` +
                w.map((i) => `${words[i].expression}${del}    ${words[i].meaning}`).join("\n") +
                "\n"
            );
        });
        classified_texts.shift();
        let word2Meaning = classified_texts.join("\n");

        // 反向查询
        let meaning2Word = classified
            .flat()
            .map((i) => `${words[i].meaning}  ${del}  ${words[i].expression}`)
            .join("\n");

        let text = word2Meaning + "\n\n" + "#### 反向查询\n" + meaning2Word;
        let db = dataBase as TFile;
        this.app.vault.modify(db, text);
    };

    refreshReviewDb = async () => {
        if (!this.settings.review_database) {
            return;
        }

        let dataBase = this.app.vault.getAbstractFileByPath(this.settings.review_database);
        if (!dataBase || "children" in dataBase) {
            new Notice("Invalid word database path");
            return;
        }

        let db = dataBase as TFile;
        let text = await this.app.vault.read(db);
        let oldRecord = {} as { [K in string]: string };
        text.match(/#word(\n.+)+\n(<!--SR.*?-->)/g)
            ?.map((v) => v.match(/#### (.+)[\s\S]+(<!--SR.*-->)/))
            ?.forEach((v) => {
                if (v?.[1] && v[2]) {
                    oldRecord[v[1]] = v[2];
                }
            });

        // let data = await this.db.getExpressionAfter(this.settings.last_sync)
        let data = await this.db.getExpressionAfter("1970-01-01T00:00:00Z");
        if (data.length === 0) {
            // new Notice("Nothing new")
            return;
        }

        data.sort((a, b) => a.expression.localeCompare(b.expression));

        let newText =
            data
                .map((word) => {
                    let notes =
                        word.notes.length === 0
                            ? ""
                            : "**Notes**:\n" + word.notes.join("\n").trim() + "\n";
                    let sentences =
                        word.sentences.length === 0
                            ? ""
                            : "**Sentences**:\n" +
                              word.sentences
                                  .map((sen) => {
                                      return (
                                          `*${sen.text.trim()}*` +
                                          "\n" +
                                          (sen.trans ? sen.trans.trim() + "\n" : "") +
                                          (sen.origin ? sen.origin.trim() : "")
                                      );
                                  })
                                  .join("\n")
                                  .trim() +
                              "\n";

                    return (
                        `#word\n` +
                        `#### ${word.expression}\n` +
                        `${this.settings.review_delimiter}\n` +
                        `${word.meaning}\n` +
                        `${notes}` +
                        `${sentences}` +
                        (oldRecord[word.expression] ? oldRecord[word.expression] + "\n" : "")
                    );
                })
                .join("\n") + "\n";

        newText = "#flashcards\n\n" + newText;
        await this.app.vault.modify(db, newText);

        this.saveSettings();
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
                                        this.view as MarkdownView & { actionsEl?: HTMLElement }
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

    async queryWord(word: string, target?: HTMLElement, evtPosition?: Position): Promise<void> {
        if (!word) return;

        if (!this.settings.popup_search) {
            await this.activateView(SEARCH_PANEL_VIEW, "left");
        }

        if (target && Platform.isDesktopApp) {
            await this.activateView(LEARN_PANEL_VIEW, "right");
        }

        emitLangrSearch(word, target, evtPosition);

        if (this.settings.auto_pron) {
            let accent = this.settings.review_prons;
            let wordUrl =
                `https://dict.youdao.com/dictvoice?type=${accent}&audio=` +
                encodeURIComponent(word);
            playAudio(wordUrl);
        }
    }

    // 管理所有的右键菜单
    registerContextMenu() {
        let addMemu = (mu: Menu, selection: string) => {
            mu.addItem((item) => {
                item.setTitle(t("Search word"))
                    .setIcon("info")
                    .onClick(async () => {
                        this.queryWord(selection);
                    });
            });
        };
        // markdown 编辑模式 右键菜单
        this.registerEvent(
            (this.app.workspace.on as any)(
                "editor-menu",
                (menu: Menu, editor: Editor, view: MarkdownView) => {
                    let selection = editor.getSelection();
                    if (selection.trim()) {
                        addMemu(menu, selection);
                    }
                }
            )
        );
        // markdown 预览模式 右键菜单
        this.registerDomEvent(document.body, "contextmenu", (evt) => {
            if ((evt.target as HTMLElement).matchParent(".markdown-preview-view")) {
                const selection = window.getSelection()?.toString().trim() ?? "";
                if (!selection) return;

                evt.preventDefault();
                let menu = new Menu();

                addMemu(menu, selection);

                menu.showAtMouseEvent(evt);
            }
        });
    }

    // 管理所有的左键抬起
    registerMouseup() {
        this.registerDomEvent(document.body, "pointerup", (evt) => {
            const target = evt.target as HTMLElement;
            if (!target.matchParent(".stns")) {
                // 处理普通模式
                const funcKey = this.settings.function_key;
                if (
                    (funcKey === "disable" || evt[funcKey] === false) &&
                    !(
                        this.store.searchPinned &&
                        !target.matchParent("#langr-search,#langr-learn-panel")
                    )
                )
                    return;

                let selection = window.getSelection()?.toString().trim() ?? "";
                if (!selection) return;

                evt.stopImmediatePropagation();
                void this.queryWord(selection, undefined, { x: evt.pageX, y: evt.pageY });
                return;
            }
        });
    }

    // 管理所有的鼠标左击
    registerLeftClick() {
        this.registerDomEvent(document.body, "click", (evt) => {
            let target = evt.target as HTMLElement;
            if (target.tagName === "H4" && target.matchParent(".sr-modal-content")) {
                let word = target.textContent;
                if (!word) {
                    return;
                }
                let accent = this.settings.review_prons;
                let wordUrl =
                    `https://dict.youdao.com/dictvoice?type=${accent}&audio=` +
                    encodeURIComponent(word);
                playAudio(wordUrl);
            }
        });
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
