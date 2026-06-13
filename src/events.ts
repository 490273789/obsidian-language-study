import type { EventMap, Position } from "@/constant";
import type { ExpressionStatus, ExpressionType } from "@/db/interface";

function emitLangrSearch(selection: string, target?: HTMLElement, evtPosition?: Position): void {
    dispatchEvent(
        new CustomEvent("obsidian-langr-search", {
            detail: { selection, target, evtPosition },
        }) satisfies EventMap["obsidian-langr-search"]
    );
}

function emitLangrRefresh(
    expression: string,
    type: ExpressionType,
    status: ExpressionStatus
): void {
    dispatchEvent(
        new CustomEvent("obsidian-langr-refresh", {
            detail: { expression, type, status },
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
