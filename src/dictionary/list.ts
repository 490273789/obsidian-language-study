import type { Component } from "vue";

import type { DictionaryAdapter } from "./interface";
import { DictionaryHub } from "./hub";
import { youdaoAdapter, cambridgeAdapter, deeplAdapter, hjdictAdapter } from "./adapters";
import Youdao from "./youdao/View.vue";
import Cambridge from "./cambridge/View.vue";
import HJdict from "./hjdict/View.vue";
import DeepL from "./deepl/View.vue";

export type DictionaryEntry = {
    readonly adapter: DictionaryAdapter;
    readonly name: string;
    readonly description: string;
    readonly Cp: Component;
};

export const dicts = {
    youdao: {
        adapter: youdaoAdapter,
        get name() {
            return youdaoAdapter.name;
        },
        get description() {
            return youdaoAdapter.description;
        },
        Cp: Youdao,
    },
    cambridge: {
        adapter: cambridgeAdapter,
        get name() {
            return cambridgeAdapter.name;
        },
        get description() {
            return cambridgeAdapter.description;
        },
        Cp: Cambridge,
    },
    hjdict: {
        adapter: hjdictAdapter,
        get name() {
            return hjdictAdapter.name;
        },
        get description() {
            return hjdictAdapter.description;
        },
        Cp: HJdict,
    },
    deepl: {
        adapter: deeplAdapter,
        get name() {
            return deeplAdapter.name;
        },
        get description() {
            return deeplAdapter.description;
        },
        Cp: DeepL,
    },
};

export const defaultDictionaryHub = new DictionaryHub([
    youdaoAdapter,
    cambridgeAdapter,
    hjdictAdapter,
    deeplAdapter,
]);
