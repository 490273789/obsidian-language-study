import { createAutomaton } from "ac-auto";
import { exportDB, importInto } from "dexie-export-import";
import download from "downloadjs";

import {
    ArticleWords,
    Word,
    Phrase,
    WordsPhrase,
    Sentence,
    ExpressionInfo,
    ExpressionInfoSimple,
    CountInfo,
    WordCount,
    Span,
    ExpressionStatus,
} from "./interface";
import DbProvider from "./base";
import WordDB from "./idb";
import type Plugin from "@/plugin";
import { moment } from "@/utils/moment";

type PhraseAutomaton = {
    search(article: string): Promise<[number, string][]>;
};

type PhraseCache = {
    automaton: PhraseAutomaton | null;
    statuses: Map<string, ExpressionStatus>;
};

export class LocalDb extends DbProvider {
    idb: WordDB;
    plugin: Plugin;
    private phraseCache: PhraseCache | null = null;
    constructor(plugin: Plugin) {
        super();
        this.plugin = plugin;
        this.idb = new WordDB(plugin);
    }

    async open() {
        this.invalidatePhraseCache();
        await this.idb.open();
        return;
    }

    close() {
        this.idb.close();
    }

    private invalidatePhraseCache(): void {
        this.phraseCache = null;
    }

    private async getPhraseCache(): Promise<PhraseCache> {
        if (this.phraseCache) {
            return this.phraseCache;
        }

        const statuses = new Map<string, ExpressionStatus>();
        await this.idb.expressions
            .where("t")
            .equals("PHRASE")
            .each((expr) => statuses.set(expr.expression, expr.status));

        this.phraseCache = {
            statuses,
            automaton: statuses.size > 0 ? await createAutomaton([...statuses.keys()]) : null,
        };
        return this.phraseCache;
    }

    // 寻找页面中已经记录过的单词和词组
    async getStoredWords(payload: ArticleWords): Promise<WordsPhrase> {
        let storedWords = (
            await this.idb.expressions.where("expression").anyOf(payload.words).toArray()
        ).map((expr) => {
            return { text: expr.expression, status: expr.status } as Word;
        });

        let searchedPhrases: Phrase[] = [];
        if (payload.article) {
            const phraseCache = await this.getPhraseCache();
            searchedPhrases = phraseCache.automaton
                ? (await phraseCache.automaton.search(payload.article)).map((match) => {
                      return {
                          text: match[1],
                          status: phraseCache.statuses.get(match[1]) ?? 0,
                          offset: match[0],
                      } as Phrase;
                  })
                : [];
        }

        return { words: storedWords, phrases: searchedPhrases };
    }

    async getExpression(expression: string): Promise<ExpressionInfo | null> {
        expression = expression.toLowerCase();
        let expr = await this.idb.expressions.where("expression").equals(expression).first();

        if (!expr) {
            return null;
        }

        let sentences = await this.idb.sentences
            .where("id")
            .anyOf([...expr.sentences.values()])
            .toArray();

        return {
            expression: expr.expression,
            meaning: expr.meaning,
            status: expr.status,
            t: expr.t,
            notes: expr.notes,
            sentences,
            tags: [...expr.tags.keys()],
        };
    }

    async getExpressionsSimple(expressions: string[]): Promise<ExpressionInfoSimple[]> {
        expressions = expressions.map((e) => e.toLowerCase());

        let exprs = await this.idb.expressions.where("expression").anyOf(expressions).toArray();

        return exprs.map((v) => {
            return {
                expression: v.expression,
                meaning: v.meaning,
                status: v.status,
                t: v.t,
                tags: [...v.tags.keys()],
                sen_num: v.sentences.size,
                note_num: v.notes.length,
                date: v.date,
            };
        });
    }

    async getExpressionAfter(time: string): Promise<ExpressionInfo[]> {
        let unixStamp = moment.utc(time).unix();
        let wordsAfter = await this.idb.expressions
            .where("status")
            .above(0)
            .and((expr) => expr.date > unixStamp)
            .toArray();

        let res: ExpressionInfo[] = [];
        for (let expr of wordsAfter) {
            let sentences = await this.idb.sentences
                .where("id")
                .anyOf([...expr.sentences.values()])
                .toArray();

            res.push({
                expression: expr.expression,
                meaning: expr.meaning,
                status: expr.status,
                t: expr.t,
                notes: expr.notes,
                sentences,
                tags: [...expr.tags.keys()],
            });
        }
        return res;
    }
    async getAllExpressionSimple(ignores?: boolean): Promise<ExpressionInfoSimple[]> {
        let exprs: ExpressionInfoSimple[];
        let bottomStatus = ignores ? -1 : 0;
        exprs = (await this.idb.expressions.where("status").above(bottomStatus).toArray()).map(
            (expr): ExpressionInfoSimple => {
                return {
                    expression: expr.expression,
                    status: expr.status,
                    meaning: expr.meaning,
                    t: expr.t,
                    tags: [...expr.tags.keys()],
                    note_num: expr.notes.length,
                    sen_num: expr.sentences.size,
                    date: expr.date,
                };
            }
        );

        return exprs;
    }

    async postExpression(payload: ExpressionInfo): Promise<number> {
        let stored = await this.idb.expressions
            .where("expression")
            .equals(payload.expression)
            .first();

        let sentences = new Set<number>();
        for (let sen of payload.sentences) {
            let searched = await this.idb.sentences.where("text").equals(sen.text).first();
            if (searched?.id !== undefined) {
                await this.idb.sentences.update(searched.id, sen);
                sentences.add(searched.id);
            } else {
                let id = await this.idb.sentences.add(sen);
                sentences.add(id);
            }
        }

        let updatedWord = {
            expression: payload.expression,
            meaning: payload.meaning,
            status: payload.status,
            t: payload.t,
            notes: payload.notes,
            sentences,
            tags: new Set<string>(payload.tags),
            connections: new Map<string, string>(),
            date: moment().unix(),
        };
        if (stored?.id !== undefined) {
            await this.idb.expressions.update(stored.id, updatedWord);
        } else {
            await this.idb.expressions.add(updatedWord);
        }
        this.invalidatePhraseCache();

        return 200;
    }

    async getTags(): Promise<string[]> {
        let allTags = new Set<string>();
        await this.idb.expressions.each((expr) => {
            for (let t of expr.tags.values()) {
                allTags.add(t);
            }
        });

        return [...allTags.values()];
    }

    async postIgnoreWords(payload: string[]): Promise<void> {
        await this.idb.expressions.bulkPut(
            payload.map((expr) => {
                return {
                    expression: expr,
                    meaning: "",
                    status: 0,
                    t: "WORD",
                    notes: [] as string[],
                    sentences: new Set(),
                    tags: new Set(),
                    connections: new Map<string, string>(),
                    date: moment().unix(),
                };
            })
        );
        this.invalidatePhraseCache();
        return;
    }

    async tryGetSen(text: string): Promise<Sentence | null> {
        let stored = await this.idb.sentences.where("text").equals(text).first();
        return stored ?? null;
    }

    async getCount(): Promise<CountInfo> {
        let counts: { WORD: number[]; PHRASE: number[] } = {
            WORD: new Array(5).fill(0),
            PHRASE: new Array(5).fill(0),
        };
        await this.idb.expressions.each((expr) => {
            counts[expr.t as "WORD" | "PHRASE"][expr.status]++;
        });

        return {
            word_count: counts.WORD,
            phrase_count: counts.PHRASE,
        };
    }

    async countSeven(): Promise<WordCount[]> {
        let spans: Span[] = [];
        spans = [0, 1, 2, 3, 4, 5, 6].map((i) => {
            let start = moment().subtract(6, "days").startOf("day");
            let from = start.add(i, "days");
            return {
                from: from.unix(),
                to: from.endOf("day").unix(),
            };
        });

        let res: WordCount[] = [];

        // 对每一天计算
        for (let span of spans) {
            // 当日
            let today = new Array(5).fill(0);
            await this.idb.expressions
                .filter((expr) => {
                    return expr.t == "WORD" && expr.date >= span.from && expr.date <= span.to;
                })
                .each((expr) => {
                    today[expr.status]++;
                });
            // 累计
            let accumulated = new Array(5).fill(0);
            await this.idb.expressions
                .filter((expr) => {
                    return expr.t == "WORD" && expr.date <= span.to;
                })
                .each((expr) => {
                    accumulated[expr.status]++;
                });

            res.push({ today, accumulated });
        }

        return res;
    }

    async importDB(file: File) {
        await this.idb.delete();
        await this.idb.open();
        await importInto(this.idb, file, {
            acceptNameDiff: true,
        });
        this.invalidatePhraseCache();
    }

    async exportDB() {
        let blob = await exportDB(this.idb);
        try {
            download(blob, `${this.idb.dbName}.json`, "application/json");
        } catch (e) {
            console.error("error exporting database");
        }
    }

    async destroyAll() {
        this.invalidatePhraseCache();
        return this.idb.delete();
    }
}
