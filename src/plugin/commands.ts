import type LanguageLearner from "@/plugin";
import { SEARCH_PANEL_VIEW } from "@/views/SearchPanelView";
import { LEARN_PANEL_VIEW } from "@/views/LearnPanelView";
import { InputModal } from "@/modals";
import { t } from "@/lang/helper";

function registerPluginCommands(plugin: LanguageLearner): void {
    plugin.addCommand({
        id: "langr-refresh-word-database",
        name: t("Refresh Word Database"),
        callback: plugin.refreshWordDb,
    });

    plugin.addCommand({
        id: "langr-refresh-review-database",
        name: t("Refresh Review Database"),
        callback: plugin.refreshReviewDb,
    });

    plugin.addCommand({
        id: "langr-search-word-select",
        name: t("Translate Select"),
        callback: () => {
            const selection = window.getSelection()?.toString().trim() ?? "";
            void plugin.queryWord(selection);
        },
    });

    plugin.addCommand({
        id: "langr-search-word-input",
        name: t("Translate Input"),
        callback: () => {
            const modal = new InputModal(plugin.app, (text) => {
                void plugin.queryWord(text);
            });
            modal.open();
        },
    });
}

export { LEARN_PANEL_VIEW, SEARCH_PANEL_VIEW, registerPluginCommands };
