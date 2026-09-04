import { requestUrl, RequestUrlParam } from "obsidian";
import {
    ArticleWords,
    WordsPhrase,
    Sentence,
    ExpressionInfo,
    ExpressionInfoSimple,
    CountInfo,
    WordCount,
} from "./interface";

import DbProvider from "./base";
import { buildDaySpans } from "./spans";
import { moment } from "@/utils/moment";
import { isLearningRecord, LearningRecordStoreError } from "@/learningRecord/intake";
import type { LearningRecordCandidate, LearningRecordCommitReceipt } from "@/learningRecord/intake";

function committedRecordMatchesCandidate(
    record: LearningRecordCommitReceipt["record"],
    candidate: LearningRecordCandidate
): boolean {
    return (
        record.expression === candidate.expression &&
        record.meaning === candidate.meaning &&
        record.status === candidate.status &&
        record.type === candidate.type &&
        JSON.stringify(record.tags) === JSON.stringify(candidate.tags) &&
        JSON.stringify(record.notes) === JSON.stringify(candidate.notes) &&
        JSON.stringify(record.sentences) === JSON.stringify(candidate.sentences)
    );
}

function parseCommitReceipt(
    value: unknown,
    candidate: LearningRecordCandidate
): LearningRecordCommitReceipt {
    if (typeof value !== "object" || value === null) {
        throw new LearningRecordStoreError("record_store_incompatible");
    }
    const receipt = value as Record<string, unknown>;
    if (
        (receipt.operation !== "created" && receipt.operation !== "updated") ||
        !isLearningRecord(receipt.record) ||
        !committedRecordMatchesCandidate(receipt.record, candidate)
    ) {
        throw new LearningRecordStoreError("record_store_incompatible");
    }
    return {
        operation: receipt.operation,
        record: receipt.record,
    };
}

export class WebDb extends DbProvider {
    host: string;
    port: number;
    prefix: string = "/lr";
    https: boolean;
    apiKey: string;

    get baseHeaders(): Record<string, string> {
        return this.apiKey ? { "LR-API-Key": this.apiKey } : {};
    }
    get proto(): string {
        return this.https ? "https" : "http";
    }

    constructor(host: string, port: number, https: boolean, apiKey: string) {
        super();
        this.host = host;
        this.port = port;
        this.https = https;
        this.apiKey = apiKey;
    }

    async open() {}

    close() {}

    // 寻找页面中已经记录过的单词和词组
    async getStoredWords(payload: ArticleWords): Promise<WordsPhrase> {
        let request: RequestUrlParam = {
            url: `${this.proto}://${this.host}:${this.port}${this.prefix}/word_phrase`,
            method: "POST",
            body: JSON.stringify(payload),
            contentType: "application/json",
            headers: this.baseHeaders,
        };

        try {
            let response = await requestUrl(request);
            let data: WordsPhrase = response.json;
            return data;
        } catch (e) {
            console.warn("Error when getting parse info from server:" + e);
            return { words: [], phrases: [] };
        }
    }

    // 获取单词/词组的详细信息
    async getExpression(expression: string): Promise<ExpressionInfo | null> {
        let request: RequestUrlParam = {
            url: `${this.proto}://${this.host}:${this.port}${this.prefix}/word`,
            method: "POST",
            body: JSON.stringify(expression.toLowerCase()),
            contentType: "application/json",
            headers: this.baseHeaders,
        };

        try {
            let response = await requestUrl(request);
            return response.json;
        } catch (e) {
            console.warn("Error while getting data from server." + e);
            return null;
        }
    }

    async getExpressionsSimple(expressions: string[]): Promise<ExpressionInfoSimple[]> {
        expressions = expressions.map((v) => v.toLowerCase());
        let request: RequestUrlParam = {
            url: `${this.proto}://${this.host}:${this.port}${this.prefix}/words_simple`,
            method: "POST",
            body: JSON.stringify(expressions),
            contentType: "application/json",
            headers: this.baseHeaders,
        };

        try {
            let response = await requestUrl(request);
            return response.json;
        } catch (e) {
            console.error("Error getting simple data from server: " + e);
            return [];
        }
    }

    // 获取某一时间之后的所有单词的详细信息
    async getExpressionAfter(time: string): Promise<ExpressionInfo[]> {
        let unixStamp = moment.utc(time).unix();
        let request: RequestUrlParam = {
            url: `${this.proto}://${this.host}:${this.port}${this.prefix}/words/after`,
            method: "POST",
            body: JSON.stringify(unixStamp),
            contentType: "application/json",
            headers: this.baseHeaders,
        };
        try {
            let response = await requestUrl(request);
            return response.json;
        } catch (e) {
            console.warn("Error getting exprs after time from server" + e);
            return [];
        }
    }

    // 通过status查询单词/词组,获取简略信息
    async getAllExpressionSimple(ignores?: boolean): Promise<ExpressionInfoSimple[]> {
        let mode = ignores ? "all" : "no_ignore";

        let request: RequestUrlParam = {
            url: `${this.proto}://${this.host}:${this.port}${this.prefix}/words_simple/${mode}`,
            method: "GET",
            headers: this.baseHeaders,
        };

        try {
            let response = await requestUrl(request);

            return response.json;
        } catch (e) {
            console.warn("Error while getting all simple data from server." + e);
            return [];
        }
    }

    async commitWhole(
        candidate: LearningRecordCandidate,
        firstAcceptedAtIfNew: number
    ): Promise<LearningRecordCommitReceipt> {
        const request: RequestUrlParam = {
            url: `${this.proto}://${this.host}:${this.port}${this.prefix}/update`,
            method: "POST",
            body: JSON.stringify({ record: candidate, firstAcceptedAtIfNew }),
            contentType: "application/json",
            headers: this.baseHeaders,
        };
        try {
            const response = await requestUrl(request);
            return parseCommitReceipt(response.json, candidate);
        } catch (error) {
            if (error instanceof LearningRecordStoreError) {
                throw error;
            }
            throw new LearningRecordStoreError("record_store_unavailable");
        }
    }

    // 获取所有的tag
    async getTags(): Promise<string[]> {
        let request: RequestUrlParam = {
            url: `${this.proto}://${this.host}:${this.port}${this.prefix}/tags`,
            method: "GET",
            headers: this.baseHeaders,
        };

        try {
            let response = await requestUrl(request);
            return response.json;
        } catch (e) {
            console.warn("Error getting tags from server." + e);
            return [];
        }
    }

    // 发送所有忽略的新词
    async postIgnoreWords(payload: string[]) {
        let request: RequestUrlParam = {
            url: `${this.proto}://${this.host}:${this.port}${this.prefix}/ignores`,
            method: "POST",
            body: JSON.stringify(payload),
            contentType: "application/json",
            headers: this.baseHeaders,
        };

        try {
            await requestUrl(request);
        } catch (e) {
            console.warn("Error sending ignore words" + e);
        }
    }

    // 尝试查询已存在的例句
    async tryGetSen(text: string): Promise<Sentence | null> {
        let request: RequestUrlParam = {
            url: `${this.proto}://${this.host}:${this.port}${this.prefix}/sentence`,
            method: "POST",
            body: JSON.stringify(text),
            contentType: "application/json",
            headers: this.baseHeaders,
        };

        try {
            let res = await requestUrl(request);
            return res.json;
        } catch (e) {
            console.warn("Error trying to get sentence" + e);
            return null;
        }
    }

    // 统计部分
    // 获取各种类型的单词/词组类型
    async getCount(): Promise<CountInfo> {
        let request: RequestUrlParam = {
            url: `${this.proto}://${this.host}:${this.port}${this.prefix}/count_all`,
            method: "GET",
            headers: this.baseHeaders,
        };
        try {
            let response = await requestUrl(request);
            let wordsCount: CountInfo = response.json;
            return wordsCount;
        } catch (e) {
            console.warn("Error getting words count" + e);
            return {
                word_count: [0, 0, 0, 0, 0],
                phrase_count: [0, 0, 0, 0, 0],
            };
        }
    }

    // 获取包括今天在内的7天内每一天的新单词量和累计单词量
    async countSeven(): Promise<WordCount[]> {
        const spans = buildDaySpans();

        let request: RequestUrlParam = {
            url: `${this.proto}://${this.host}:${this.port}${this.prefix}/count_time`,
            method: "POST",
            body: JSON.stringify(spans),
            contentType: "application/json",
            headers: this.baseHeaders,
        };

        try {
            let res = await requestUrl(request);
            return res.json;
        } catch (e) {
            console.warn("Error getting seven-day counts" + e);
            return [];
        }
    }
}
