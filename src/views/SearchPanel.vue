<template>
    <div id="langr-search" class="langr-shell" @click="handleClick">
        <NConfigProvider class="search-provider" :theme="theme" :theme-overrides="themeOverrides">
            <div class="search-layout">
                <div class="search-bar langr-card">
                    <div class="history-controls" :aria-label="t('Search')">
                        <button
                            class="history-button"
                            type="button"
                            :disabled="historyIndex <= 0"
                            title="Previous"
                            aria-label="Previous"
                            @click="switchHistory('prev')"
                        >
                            <svg viewBox="0 0 16 16" aria-hidden="true">
                                <path
                                    d="M10.7 3.3a1 1 0 0 1 0 1.4L7.41 8l3.3 3.3a1 1 0 0 1-1.42 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.42 0z"
                                    fill="currentColor"
                                />
                            </svg>
                        </button>
                        <button
                            class="history-button"
                            type="button"
                            :disabled="historyIndex >= lastHistory"
                            title="Next"
                            aria-label="Next"
                            @click="switchHistory('next')"
                        >
                            <svg viewBox="0 0 16 16" aria-hidden="true">
                                <path
                                    d="M5.3 12.7a1 1 0 0 1 0-1.4L8.59 8l-3.3-3.3A1 1 0 1 1 6.7 3.3l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.42 0z"
                                    fill="currentColor"
                                />
                            </svg>
                        </button>
                    </div>
                    <label class="search-field">
                        <input
                            type="text"
                            placeholder="输入单词"
                            v-model="inputWord"
                            class="search-input"
                            @keydown.enter="handleSearch"
                        />
                    </label>
                    <NButton class="search-submit" size="tiny" type="primary" @click="handleSearch">
                        <span>{{ t("Search") }}</span>
                    </NButton>
                </div>
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
                        class="dict-panel langr-card"
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
                        <div class="dict-state langr-state" v-if="loadings[i]">searching...</div>
                        <div class="dict-state langr-state" v-else-if="word && !shows[i]">
                            No result
                        </div>
                    </section>
                </div>
            </div>
        </NConfigProvider>
    </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, watch } from "vue";
import type { Component } from "vue";
import { NConfigProvider, NButton } from "naive-ui";

import { t } from "@/lang/helper";
import { dicts } from "@dict/list";
import { playAudio } from "@/utils/helpers";
import { usePlugin } from "@/ui/context";
import { useEvent } from "@/utils/use";
import { useLangrNaiveTheme, useLangrNaiveThemeOverrides } from "@/ui/theme";

const plugin = usePlugin();

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

const theme = useLangrNaiveTheme(() => plugin.store.dark);
const themeOverrides = useLangrNaiveThemeOverrides();

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
    background: transparent;

    .search-provider {
        height: 100%;
    }

    .search-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }

    .search-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: var(--langr-space-3);
        min-height: 46px;
        padding: var(--langr-space-2);
        border-color: var(--langr-border-neon);
        border-radius: var(--langr-radius-md);
        background:
            linear-gradient(
                90deg,
                color-mix(in srgb, var(--langr-accent) 8%, transparent),
                transparent 46%
            ),
            var(--langr-surface-raised);
        box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--langr-accent) 7%, transparent),
            var(--langr-shadow);
        transition:
            border-color 150ms ease,
            box-shadow 150ms ease;

        &:focus-within {
            border-color: var(--langr-border-neon);
            box-shadow:
                inset 0 0 0 1px color-mix(in srgb, var(--langr-accent) 16%, transparent),
                var(--langr-glow-cyan),
                var(--langr-shadow);
        }

        .history-controls {
            display: inline-flex;
            flex: 0 0 auto;
            align-items: center;
            gap: 2px;
            height: 32px;
            padding: 3px;
            border: 1px solid var(--langr-border-strong);
            border-radius: var(--langr-radius-sm);
            background: var(--langr-surface-inset);
        }

        .history-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 24px;
            padding: 0;
            color: var(--text-muted);
            border: 0;
            border-radius: 5px;
            background: transparent;
            cursor: pointer;
            transition:
                background-color 120ms ease,
                color 120ms ease,
                transform 120ms ease;

            svg {
                width: 16px;
                height: 16px;
            }

            &:hover:not(:disabled),
            &:focus-visible:not(:disabled) {
                color: var(--langr-accent);
                background: color-mix(in srgb, var(--langr-accent) 9%, transparent);
                transform: translateY(-1px);
            }

            &:focus-visible {
                outline: 1px solid var(--langr-accent);
                outline-offset: 1px;
            }

            &:disabled {
                cursor: default;
                opacity: 0.34;
            }
        }

        .search-field {
            display: flex;
            flex: 1 1 auto;
            min-width: 92px;
            height: 32px;
            align-items: center;
            padding: 0 12px;
            border: 1px solid var(--langr-border-strong);
            border-radius: var(--langr-radius-sm);
            background: var(--langr-surface-inset);
            box-shadow: none;
            transition:
                border-color 150ms ease,
                background-color 150ms ease,
                box-shadow 150ms ease;

            &:focus-within {
                border-color: var(--langr-accent);
                background: color-mix(in srgb, var(--langr-accent) 6%, var(--langr-surface-inset));
                box-shadow: 0 0 0 1px color-mix(in srgb, var(--langr-accent) 12%, transparent);
            }
        }

        .search-input {
            flex: 1;
            min-width: 0;
            width: 100%;
            height: 30px;
            padding: 0;
            color: var(--text-normal);
            border: 0;
            outline: 0;
            background: transparent;
            box-shadow: none;
            font: inherit;
            font-weight: 650;
            line-height: 30px;

            &::placeholder {
                color: var(--text-muted);
                opacity: 0.82;
            }
        }

        .search-submit {
            flex: 0 0 auto;
            min-width: 72px;
            height: 32px;
            padding: 0 14px;
            border-radius: var(--langr-radius-sm);
            box-shadow:
                inset 0 1px 0 color-mix(in srgb, white 9%, transparent),
                0 0 0 1px color-mix(in srgb, var(--langr-accent) 10%, transparent);
        }
    }

    .dict-tabs {
        display: flex;
        gap: var(--langr-space-2);
        align-items: stretch;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 0 var(--langr-space-3) var(--langr-space-2);
        flex: 0 0 auto;
    }

    .dict-tab {
        display: inline-flex;
        align-items: center;
        gap: var(--langr-space-2);
        min-width: max-content;
        max-width: 140px;
        height: 28px;
        padding: 3px 9px;
        border: 1px solid var(--langr-border-strong);
        border-radius: var(--langr-radius-sm);
        color: var(--text-muted);
        background: var(--langr-surface-glass);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--langr-accent) 8%, transparent);
        cursor: pointer;
        transition:
            border-color 120ms ease,
            background-color 120ms ease,
            color 120ms ease,
            transform 120ms ease,
            box-shadow 120ms ease;

        &:hover {
            color: var(--langr-accent);
            border-color: var(--langr-border-hover);
            background: color-mix(in srgb, var(--langr-accent) 10%, var(--langr-surface-raised));
            box-shadow: var(--langr-glow-cyan);
            transform: translateY(-1px);
        }

        &.active {
            color: var(--langr-accent-hot);
            border-color: var(--langr-border-neon);
            background: linear-gradient(
                90deg,
                color-mix(in srgb, var(--langr-accent-hot) 16%, transparent),
                color-mix(in srgb, var(--langr-accent) 10%, var(--langr-surface-raised))
            );
            box-shadow:
                inset 0 -2px 0 var(--langr-accent-hot),
                var(--langr-glow-hot);
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
        padding: 0 var(--langr-space-3) var(--langr-space-3);
    }

    .dict-panel {
        padding: var(--langr-space-3);
        min-height: 100%;
        border-color: var(--langr-border-neon);
        background: var(--langr-scanline), var(--langr-surface-raised);
        background-size:
            100% 4px,
            auto;
        box-shadow: var(--langr-shadow-strong);
    }

    .dict-state {
        margin: var(--langr-space-3) 0;
    }
}

.is-mobile #langr-search {
    .search-bar {
        flex-wrap: wrap;
        margin: var(--langr-space-2);
        gap: var(--langr-space-2);

        .search-field {
            order: 1;
            flex-basis: calc(100% - 112px);
        }

        .history-controls {
            order: 0;
        }

        .search-submit {
            order: 2;
            flex: 1 0 86px;
        }
    }

    button:not(.fold-mask) {
        width: auto;
    }

    input[type="text"] {
        padding: 0;
    }

    .dict-area {
        padding: 0 var(--langr-space-2) var(--langr-space-2);
    }
}
</style>
