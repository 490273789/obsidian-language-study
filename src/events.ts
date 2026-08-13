import type { EventMap, Position } from "@/constant";

function emitLangrSearch(
    selection: string,
    target?: HTMLElement,
    evtPosition?: Position,
): void {
    dispatchEvent(
        new CustomEvent("obsidian-langr-search", {
            detail: { selection, target, evtPosition },
        }) satisfies EventMap["obsidian-langr-search"],
    );
}

function emitLangrRefresh(): void {
    dispatchEvent(
        new CustomEvent("obsidian-langr-refresh", {
            detail: {},
        }) satisfies EventMap["obsidian-langr-refresh"],
    );
}

function emitLangrRefreshStat(): void {
    dispatchEvent(
        new CustomEvent(
            "obsidian-langr-refresh-stat",
        ) satisfies EventMap["obsidian-langr-refresh-stat"],
    );
}

export { emitLangrRefresh, emitLangrRefreshStat, emitLangrSearch };
