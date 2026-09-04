import type { ReadingSelection } from "@/reading/readingContext";

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
        context?: ReadingSelection;
        evtPosition?: Position;
    }>;
    "obsidian-langr-refresh": CustomEvent<{}>;
    "obsidian-langr-refresh-stat": CustomEvent<{}>;
}

export { dict };
export type { EventMap, Position };
