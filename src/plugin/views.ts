import type { WorkspaceLeaf } from "obsidian";
import type LanguageLearner from "@/plugin";
import { SearchPanelView, SEARCH_ICON, SEARCH_PANEL_VIEW } from "@/views/SearchPanelView";
import { READING_VIEW_TYPE, ReadingView } from "@/views/ReadingView";
import { LearnPanelView, LEARN_ICON, LEARN_PANEL_VIEW } from "@/views/LearnPanelView";
import { StatView, STAT_ICON, STAT_VIEW_TYPE } from "@/views/StatView";
import { DataPanelView, DATA_ICON, DATA_PANEL_VIEW } from "@/views/DataPanelView";
import { t } from "@/lang/helper";

type ViewSide = "left" | "right" | "tab";

function registerPluginViews(plugin: LanguageLearner): void {
    plugin.registerView(SEARCH_PANEL_VIEW, (leaf) => new SearchPanelView(leaf, plugin));
    plugin.addRibbonIcon(SEARCH_ICON, t("Open word search panel"), () => {
        void activatePluginView(plugin, SEARCH_PANEL_VIEW, "left");
    });

    plugin.registerView(LEARN_PANEL_VIEW, (leaf) => new LearnPanelView(leaf, plugin));
    plugin.addRibbonIcon(LEARN_ICON, t("Open new word panel"), () => {
        void activatePluginView(plugin, LEARN_PANEL_VIEW, "right");
    });

    plugin.registerView(READING_VIEW_TYPE, (leaf) => new ReadingView(leaf, plugin));

    plugin.registerView(STAT_VIEW_TYPE, (leaf) => new StatView(leaf, plugin));
    plugin.addRibbonIcon(STAT_ICON, t("Open statistics"), () => {
        void activatePluginView(plugin, STAT_VIEW_TYPE, "right");
    });

    plugin.registerView(DATA_PANEL_VIEW, (leaf) => new DataPanelView(leaf, plugin));
    plugin.addRibbonIcon(DATA_ICON, t("Data Panel"), () => {
        void activatePluginView(plugin, DATA_PANEL_VIEW, "tab");
    });
}

function detachPluginViews(plugin: LanguageLearner): void {
    [
        SEARCH_PANEL_VIEW,
        LEARN_PANEL_VIEW,
        DATA_PANEL_VIEW,
        STAT_VIEW_TYPE,
        READING_VIEW_TYPE,
    ].forEach((viewType) => plugin.app.workspace.detachLeavesOfType(viewType));
}

async function activatePluginView(
    plugin: LanguageLearner,
    viewType: string,
    side: ViewSide
): Promise<void> {
    if (plugin.app.workspace.getLeavesOfType(viewType).length === 0) {
        let leaf: WorkspaceLeaf | null;
        switch (side) {
            case "left":
                leaf = plugin.app.workspace.getLeftLeaf(false);
                break;
            case "right":
                leaf = plugin.app.workspace.getRightLeaf(false);
                break;
            case "tab":
                leaf = plugin.app.workspace.getLeaf("tab");
                break;
        }
        if (!leaf) {
            throw new Error(`Unable to create workspace leaf for ${viewType}`);
        }
        await leaf.setViewState({
            type: viewType,
            active: true,
        });
    }
    plugin.app.workspace.revealLeaf(plugin.app.workspace.getLeavesOfType(viewType)[0]);
}

export { activatePluginView, detachPluginViews, registerPluginViews };
export type { ViewSide };
