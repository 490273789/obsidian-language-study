import type { ExpressionStatus, ExpressionType } from "@/db/interface";

const dict = {
    NAME: "Language Learner",
};

type Position = {
    x: number;
    y: number;
};

interface EventMap extends GlobalEventHandlersEventMap {
    "obsidian-langr-search": CustomEvent<{
        selection: string;
        target?: HTMLElement;
        evtPosition?: Position;
    }>;
    "obsidian-langr-refresh": CustomEvent<{
        expression: string;
        type: ExpressionType;
        status: ExpressionStatus;
    }>;
    "obsidian-langr-refresh-stat": CustomEvent<{}>;
}

export { dict };
export type { EventMap, Position };
