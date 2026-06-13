import Dexie from "dexie";
import type Plugin from "@/plugin";
import type { ExpressionStatus, ExpressionType } from "./interface";

export default class WordDB extends Dexie {
    declare expressions: Dexie.Table<Expression, number>;
    declare sentences: Dexie.Table<Sentence, number>;
    plugin: Plugin;
    dbName: string;
    constructor(plugin: Plugin) {
        super(plugin.settings.db_name);
        this.plugin = plugin;
        this.dbName = plugin.settings.db_name;
        this.version(1).stores({
            expressions: "++id, &expression, status, t, date, *tags",
            sentences: "++id, &text",
        });
    }
}

interface Expression {
    id?: number;
    expression: string;
    meaning: string;
    status: ExpressionStatus;
    t: ExpressionType;
    date: number;
    notes: string[];
    tags: Set<string>;
    sentences: Set<number>;
    connections: Map<string, string>;
}
interface Sentence {
    id?: number;
    text: string;
    trans: string;
    origin: string;
}
