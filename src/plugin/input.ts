import { Editor, MarkdownView, Menu } from "obsidian";

import type LanguageLearner from "@/plugin";
import { t } from "@/lang/helper";
import { playPronunciation } from "@/utils/helpers";

function registerInputHandlers(plugin: LanguageLearner): void {
    registerContextMenu(plugin);
    registerMouseup(plugin);
    registerLeftClick(plugin);
}

// 管理所有的右键菜单
function registerContextMenu(plugin: LanguageLearner) {
    let addMemu = (mu: Menu, selection: string) => {
        mu.addItem((item) => {
            item.setTitle(t("Search word"))
                .setIcon("info")
                .onClick(async () => {
                    plugin.queryWord(selection);
                });
        });
    };
    // markdown 编辑模式 右键菜单
    plugin.registerEvent(
        (plugin.app.workspace.on as any)(
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
    plugin.registerDomEvent(document.body, "contextmenu", (evt) => {
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
function registerMouseup(plugin: LanguageLearner) {
    plugin.registerDomEvent(document.body, "pointerup", (evt) => {
        const target = evt.target as HTMLElement;
        if (!target.matchParent(".stns")) {
            // 处理普通模式
            const funcKey = plugin.settings.function_key;
            if (
                (funcKey === "disable" || evt[funcKey] === false) &&
                !(
                    plugin.store.searchPinned &&
                    !target.matchParent("#langr-search,#langr-learn-panel")
                )
            )
                return;

            let selection = window.getSelection()?.toString().trim() ?? "";
            if (!selection) return;

            evt.stopImmediatePropagation();
            void plugin.queryWord(selection, undefined, {
                x: evt.pageX,
                y: evt.pageY,
            });
            return;
        }
    });
}

// 管理所有的鼠标左击
function registerLeftClick(plugin: LanguageLearner) {
    plugin.registerDomEvent(document.body, "click", (evt) => {
        let target = evt.target as HTMLElement;
        if (target.tagName === "H4" && target.matchParent(".sr-modal-content")) {
            let word = target.textContent;
            if (!word) {
                return;
            }
            playPronunciation(word, plugin.settings.review_prons);
        }
    });
}

export { registerInputHandlers };
