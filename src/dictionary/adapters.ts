import { t } from "@/lang/helper";
import type { DictionaryAdapter, DictionaryLookupReceipt } from "./interface";

import { search as youdaoSearch, type YoudaoResult } from "@dict/youdao/engine";
import { search as cambridgeSearch, type CambridgeResult } from "@dict/cambridge/engine";
import { search as deeplSearch } from "@dict/deepl/engine";
import { search as hjdictSearch, type HjdictResult } from "@dict/hjdict/engine";
import { translateSentence } from "./translation";

export const youdaoAdapter: DictionaryAdapter<YoudaoResult> = {
    id: "youdao",
    get name() {
        return t("Youdao");
    },
    get description() {
        return `${t("English")} <=> ${t("Chinese")}`;
    },
    async lookup(word: string): Promise<DictionaryLookupReceipt<YoudaoResult>> {
        const query = word.trim();
        if (!query) {
            return { id: "youdao", status: "empty" };
        }
        try {
            const res = await youdaoSearch(query);
            if (res && res.result) {
                return {
                    id: "youdao",
                    status: "success",
                    data: res.result,
                };
            }
            return { id: "youdao", status: "empty" };
        } catch (error) {
            return {
                id: "youdao",
                status: "error",
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
    async translate(sentence: string): Promise<string> {
        return translateSentence(sentence, youdaoSearch);
    },
};

export const cambridgeAdapter: DictionaryAdapter<CambridgeResult> = {
    id: "cambridge",
    get name() {
        return t("Cambridge");
    },
    get description() {
        return `${t("English")} => ${t("Chinese")}`;
    },
    async lookup(word: string): Promise<DictionaryLookupReceipt<CambridgeResult>> {
        const query = word.trim();
        if (!query) {
            return { id: "cambridge", status: "empty" };
        }
        try {
            const res = await cambridgeSearch(query);
            if (res && res.result && res.result.length > 0) {
                return {
                    id: "cambridge",
                    status: "success",
                    data: res.result,
                };
            }
            return { id: "cambridge", status: "empty" };
        } catch (error) {
            return {
                id: "cambridge",
                status: "error",
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
};

export const deeplAdapter: DictionaryAdapter<string> = {
    id: "deepl",
    get name() {
        return "DeepL";
    },
    get description() {
        return `All <=> ${t("Chinese")}`;
    },
    async lookup(word: string): Promise<DictionaryLookupReceipt<string>> {
        const query = word.trim();
        if (!query) {
            return { id: "deepl", status: "empty" };
        }
        try {
            const res = await deeplSearch(query);
            if (res && typeof res === "string" && res.trim().length > 0) {
                return {
                    id: "deepl",
                    status: "success",
                    data: res,
                };
            }
            return { id: "deepl", status: "empty" };
        } catch (error) {
            return {
                id: "deepl",
                status: "error",
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
    async translate(sentence: string): Promise<string> {
        const query = sentence.trim();
        if (!query) {
            return "";
        }
        try {
            const res = await deeplSearch(query);
            return res ? res.trim() : "";
        } catch {
            return "";
        }
    },
};

export const hjdictAdapter: DictionaryAdapter<HjdictResult> = {
    id: "hjdict",
    get name() {
        return t("Hujiang");
    },
    get description() {
        return `${t("English")},${t("Japanese")}, ${t("Korean")}, ${t("Spanish")}, ${t("French")}, ${t("Deutsch")} <=> ${t("Chinese")}`;
    },
    async lookup(word: string): Promise<DictionaryLookupReceipt<HjdictResult>> {
        const query = word.trim();
        if (!query) {
            return { id: "hjdict", status: "empty" };
        }
        try {
            const res = await hjdictSearch(query, { lang: "en" });
            if (res && res.result) {
                return {
                    id: "hjdict",
                    status: "success",
                    data: res.result,
                };
            }
            return { id: "hjdict", status: "empty" };
        } catch (error) {
            return {
                id: "hjdict",
                status: "error",
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
};
