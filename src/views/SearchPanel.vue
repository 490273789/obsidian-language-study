<template>
    <div id="langr-search" @click="handleClick">
        <NConfigProvider :theme="theme" :theme-overrides="themeConfig">
            <div class="search-bar" style="display: flex">
                <NButtonGroup size="tiny">
                    <NButton :disabled="historyIndex <= 0" @click="switchHistory('prev')"
                        >{{ `<` }}
                    </NButton>
                    <NButton :disabled="historyIndex >= lastHistory" @click="switchHistory('next')"
                        >{{ ">" }}
                    </NButton>
                </NButtonGroup>
                <NInput
                    size="tiny"
                    type="text"
                    placeholder="输入单词"
                    v-model:value="inputWord"
                    style="flex: 1"
                    @keydown.enter="handleSearch"
                />
                <NButton size="tiny" @click="handleSearch" style="margin-left: 5px">{{
                    t("Search")
                }}</NButton>
            </div>
        </NConfigProvider>
        <div class="dict-tabs" v-if="components.length > 0">
            <button
                v-for="(cp, i) in components"
                :key="cp.id"
                type="button"
                class="dict-tab"
                :class="{
                    active: activeDictId === cp.id,
                    loading: loadings[i],
                    empty: word && !loadings[i] && !shows[i],
                }"
                @click="activeDictId = cp.id"
            >
                <span :class="['dict-icon', cp.id]"></span>
                <span class="dict-name">{{ cp.name }}</span>
            </button>
        </div>
        <div class="dict-area">
            <section
                v-for="(cp, i) in components"
                :key="cp.id"
                class="dict-panel"
                v-show="activeDictId === cp.id"
            >
                <KeepAlive>
                    <Component
                        @loading="loading"
                        :is="cp.type"
                        :word="word"
                        v-show="shows[i]"
                    ></Component>
                </KeepAlive>
                <div class="dict-state" v-if="loadings[i]">searching...</div>
                <div class="dict-state" v-else-if="word && !shows[i]">No result</div>
            </section>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch } from "vue";
import type { Component } from "vue";
import {
    NConfigProvider,
    NButton,
    NButtonGroup,
    NInput,
    darkTheme,
    GlobalThemeOverrides,
} from "naive-ui";

import { t } from "@/lang/helper";
import { dicts } from "@dict/list";
import { playAudio } from "@/utils/helpers";
import { usePlugin } from "@/ui/context";
import { useEvent } from "@/utils/use";

const plugin = usePlugin();

const themeConfig: GlobalThemeOverrides = {};

type DictComponent = {
    id: keyof typeof dicts;
    name: string;
    type: Component;
};
type DictionaryId = keyof typeof dicts;

let components = shallowRef<DictComponent[]>([]);
let activeDictId = ref<DictionaryId | null>(null);
let map: Partial<Record<DictionaryId, number>> = {};
let loadings = ref<boolean[]>([]);
let shows = ref<boolean[]>([]);
watch(
    () => plugin.store.dictsChange,
    () => {
        let collection = (Object.keys(plugin.settings.dictionaries) as DictionaryId[])
            .map((dict) => {
                return {
                    id: dict,
                    priority: plugin.settings.dictionaries[dict].priority,
                    name: dicts[dict].name,
                };
            })
            .filter((dict) => plugin.settings.dictionaries[dict.id].enable);
        collection.sort((a, b) => a.priority - b.priority);

        components.value = collection.map((dict) => {
            return {
                id: dict.id,
                name: dict.name,
                type: dicts[dict.id].Cp,
            };
        });
        map = {};
        collection.forEach((v, i) => {
            map[v.id] = i;
        });
        loadings.value = Array(collection.length).fill(false);
        shows.value = Array(collection.length).fill(false);
        if (!activeDictId.value || !(activeDictId.value in map)) {
            activeDictId.value = components.value[0]?.id ?? null;
        }
    },
    {
        immediate: true,
    }
);

function loading({ id, loading, result }: { id: string; loading: boolean; result: boolean }) {
    const index = map[id as DictionaryId];
    if (index === undefined) return;

    loadings.value[index] = loading;
    shows.value[index] = result;
}

// 切换明亮/黑暗模式
const theme = computed(() => {
    return plugin.store.dark ? darkTheme : null;
});

// 提供一个前进后退查询记录的功能
let history: string[] = [];
let lastHistory = ref(history.length - 1);
let historyIndex = ref(-1);
function switchHistory(direction: "prev" | "next") {
    historyIndex.value = Math.max(
        0,
        Math.min(historyIndex.value + (direction === "prev" ? -1 : 1), history.length - 1)
    );
    word.value = history[historyIndex.value];
    inputWord.value = history[historyIndex.value];
}
function appendHistory() {
    if (historyIndex.value < history.length - 1) {
        history = history.slice(0, historyIndex.value + 1);
    }
    history.push(word.value);
    lastHistory.value = history.length - 1;
    historyIndex.value++;
}

let inputWord = ref("");
let word = ref("");
const onSearch = async (evt: CustomEvent) => {
    let text = evt.detail.selection;
    word.value = text;
    appendHistory();
};

function handleSearch() {
    word.value = inputWord.value;
    appendHistory();
}

function handleClick(evt: MouseEvent) {
    const target = evt.target as HTMLElement;
    if (target.hasClass("speaker")) {
        evt.preventDefault();
        evt.stopPropagation();
        let url = (target as HTMLAnchorElement).href;
        playAudio(url);
    } else if (target.tagName === "A") {
        evt.preventDefault();
        evt.stopPropagation();
        word.value = target.textContent;
        inputWord.value = target.textContent;
        appendHistory();
    }
}

useEvent(window, "obsidian-langr-search", onSearch);
</script>

<style lang="scss">
#langr-search {
    height: 100%;
    width: 100%;
    overflow: hidden;
    font-size: 0.8em;
    user-select: text;
    display: flex;
    flex-direction: column;

    .search-bar {
        margin-bottom: 5px;

        button {
            margin-right: 5px;
        }
    }

    .dict-tabs {
        display: flex;
        gap: 4px;
        align-items: stretch;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 0 0 6px;
        border-bottom: 1px solid var(--background-modifier-border);
        flex: 0 0 auto;
    }

    .dict-tab {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-width: max-content;
        max-width: 140px;
        height: 28px;
        padding: 3px 8px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 6px 6px 0 0;
        color: var(--text-muted);
        background: var(--background-secondary);
        box-shadow: none;
        cursor: pointer;

        &:hover {
            color: var(--text-normal);
            background: var(--background-modifier-hover);
            box-shadow: none;
        }

        &.active {
            color: var(--text-normal);
            border-color: var(--interactive-accent);
            background: var(--background-primary);
        }

        &.loading .dict-name::after {
            content: "...";
        }

        &.empty:not(.active) {
            opacity: 0.65;
        }

        .dict-icon {
            flex: 0 0 auto;
            width: 18px;
            height: 18px;
            background-size: cover;
        }

        .dict-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            line-height: 18px;
        }
    }

    .dict-area {
        flex: 1;
        overflow: auto;
        padding: 8px 10px 12px;
    }

    .dict-panel {
        min-height: 100%;
    }

    .dict-state {
        color: var(--text-muted);
        padding: 10px 0;
    }
}

.is-mobile #langr-search {
    button:not(.fold-mask) {
        width: auto;
    }

    input[type="text"] {
        padding: 0;
    }
}
</style>
