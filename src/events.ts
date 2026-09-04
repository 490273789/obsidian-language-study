import type { EventMap, Position } from "@/constant";
import type { ReadingSelection } from "@/reading/readingContext";

function emitLangrSearch(
    selection: string,
    context?: ReadingSelection,
    evtPosition?: Position
): void {
    dispatchEvent(
        new CustomEvent("obsidian-langr-search", {
            detail: { selection, context, evtPosition },
        }) satisfies EventMap["obsidian-langr-search"]
    );
}

function emitLangrRefresh(): void {
    dispatchEvent(
        new CustomEvent("obsidian-langr-refresh", {
            detail: {},
        }) satisfies EventMap["obsidian-langr-refresh"]
    );
}

function emitLangrRefreshStat(): void {
    dispatchEvent(
        new CustomEvent(
            "obsidian-langr-refresh-stat"
        ) satisfies EventMap["obsidian-langr-refresh-stat"]
    );
}

export { emitLangrRefresh, emitLangrRefreshStat, emitLangrSearch };
