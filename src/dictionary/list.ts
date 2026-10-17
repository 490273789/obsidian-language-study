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
    readonly Cp: Component;
};

export const dicts = {
    youdao: {
        adapter: youdaoAdapter,
        Cp: Youdao,
    },
    cambridge: {
        adapter: cambridgeAdapter,
        Cp: Cambridge,
    },
    hjdict: {
        adapter: hjdictAdapter,
        Cp: HJdict,
    },
    deepl: {
        adapter: deeplAdapter,
        Cp: DeepL,
    },
};

export const defaultDictionaryHub = new DictionaryHub([
    youdaoAdapter,
    cambridgeAdapter,
    hjdictAdapter,
    deeplAdapter,
]);
