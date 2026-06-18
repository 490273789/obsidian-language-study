<template>
    <div id="langr-reading" ref="reading" class="langr-shell">
        <NConfigProvider class="reading-provider" :theme="theme" :theme-overrides="themeOverrides">
            <div class="reading-desk">
                <section class="reading-card langr-card">
                    <header class="reading-header">
                        <div class="reading-heading">
                            <div class="reading-title">{{ t("Reading Mode") }}</div>
                            <div class="langr-subtle">{{ pageSummary }}</div>
                        </div>
                        <audio
                            class="reading-audio"
                            controls
                            v-if="audioSource"
                            :src="audioSource"
                        />
                        <div class="reading-actions">
                            <button class="reading-action" @click="activeNotes = true">
                                {{ t("Notes") }}
                            </button>
                            <button
                                v-if="page * pageSize < totalLines"
                                class="reading-action finish-reading"
                                @click="addIgnores"
                            >
                                {{ t("Finish Reading") }}
                            </button>
                            <button
                                v-else
                                class="reading-action finish-reading"
                                @click="addIgnores"
                            >
                                {{ t("Finish Reading") }}
                            </button>
                        </div>
                    </header>
                    <div
                        class="reading-progress langr-card-muted"
                        v-if="plugin.settings.word_count"
                    >
                        <CountBar :unknown="unknown" :learn="learn" :ignore="ignore" />
                        <div class="reading-progress-labels">
                            <span class="langr-status-chip is-new">{{ t("New") }}</span>
                            <span class="langr-status-chip is-learning">{{ t("Learning") }}</span>
                            <span class="langr-status-chip is-ignore">{{ t("Ignore") }}</span>
                        </div>
                    </div>

                    <div
                        class="text-area reading-text"
                        :style="{
                            fontSize: store.fontSize,
                            fontFamily: store.fontFamily,
                            lineHeight: store.lineHeight,
                        }"
                        v-html="renderedText"
                    />

                    <footer class="pagination reading-pagination">
                        <NPagination
                            v-model:page="page"
                            v-model:page-size="pageSize"
                            :item-count="totalLines"
                            show-size-picker
                            :page-sizes="pageSizes"
                            :page-slot="pageSlot"
                        />
                    </footer>
                </section>
            </div>
            <NDrawer
                v-model:show="activeNotes"
                :placement="'bottom'"
                :close-on-esc="true"
                :auto-focus="true"
                :on-after-enter="afterNoteEnter"
                :on-after-leave="afterNoteLeave"
                to="#langr-reading"
                :default-height="250"
                resizable
            >
                <NDrawerContent :title="t('Notes')">
                    <div class="note-area">
                        <NInput
                            class="note-input"
                            v-model:value="notes"
                            type="textarea"
                            :autosize="{ minRows: 5 }"
                        />
                        <div
                            class="note-rendered"
                            @mouseover="onMouseOver"
                            ref="renderedNote"
                        ></div>
                    </div>
                </NDrawerContent>
            </NDrawer>
        </NConfigProvider>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, watchEffect } from "vue";
import { NPagination, NConfigProvider, NDrawer, NDrawerContent, NInput } from "naive-ui";
import { MarkdownRenderer, Platform } from "obsidian";
import PluginType from "@/plugin";
import { t } from "@/lang/helper";
import { useEvent } from "@/utils/use";
import store from "@/store";
import { ReadingView } from "./ReadingView";
import CountBar from "./CountBar.vue";
import { useView } from "@/ui/context";
import { emitLangrRefreshStat } from "@/events";
import { resolveLocalResourcePath } from "@/utils/platform";
import { useLangrNaiveTheme, useLangrNaiveThemeOverrides } from "@/ui/theme";

let view = useView<ReadingView>();
let plugin = view.plugin as PluginType;
let contentEl = view.contentEl as HTMLElement;
if (!view.file) {
    throw new Error("Reading view requires an active file");
}
const currentFile = view.file;

const theme = useLangrNaiveTheme(() => store.dark);
const themeOverrides = useLangrNaiveThemeOverrides();

let frontMatter = plugin.app.metadataCache.getFileCache(currentFile)?.frontmatter ?? {};
let audioSource = (frontMatter["langr-audio"] || "") as string;
audioSource = resolveLocalResourcePath(audioSource, plugin.constants.basePath);

// 记笔记
let activeNotes = ref(false);
let notes = ref("");
async function afterNoteEnter() {
    notes.value = (await view.readContent("notes", true)) ?? "";
}
async function afterNoteLeave() {
    view.writeContent("notes", notes.value);
}

let renderedNote = ref<HTMLElement>();
watchEffect(async (clean) => {
    if (!renderedNote.value) return;
    await MarkdownRenderer.renderMarkdown(notes.value, renderedNote.value, currentFile.path, view);
    clean(() => {
        renderedNote.value?.empty();
    });
});

function onMouseOver(e: MouseEvent) {
    let target = e.target as HTMLElement;
    if (target.hasClass("internal-link")) {
        app.workspace.trigger("hover-link", {
            event: e,
            source: "preview",
            hoverParent: { hoverPopover: null },
            targetEl: target,
            linktext: target.getAttr("href") ?? "",
            soursePath: currentFile.path,
        });
    }
}

// 拆分文本
let lines = view.text.split("\n");
let segments = view.divide(lines);

let article = lines.slice(segments["article"].start, segments["article"].end);
let totalLines = article.length;

// 计数
let unknown = ref(0);
let learn = ref(0);
let ignore = ref(0);
let countChange = ref(true);
let refreshCount = () => {
    countChange.value = !countChange.value;
};

if (plugin.settings.word_count) {
    watch(
        [countChange],
        async () => {
            [unknown.value, learn.value, ignore.value] = await plugin.parser.countWords(
                article.join("\n")
            );
        },
        { immediate: true }
    );

    onMounted(() => {
        addEventListener("obsidian-langr-refresh", refreshCount);
    });
    onUnmounted(() => {
        removeEventListener("obsidian-langr-refresh", refreshCount);
    });
}

// 分页渲染文本

const pageSizes = [
    { label: `1 ${t("paragraph")} / ${t("page")}`, value: 2 },
    { label: `2 ${t("paragraph")} / ${t("page")}`, value: 4 },
    { label: `4 ${t("paragraph")} / ${t("page")}`, value: 8 },
    { label: `8 ${t("paragraph")} / ${t("page")}`, value: 16 },
    { label: `16 ${t("paragraph")} / ${t("page")}`, value: 32 },
    { label: `${t("All")}`, value: Number.MAX_VALUE },
];

const pageSlot = Platform.isMobileApp ? 5 : undefined;

let dp = plugin.settings.default_paragraphs;
let pageSize = dp === "all" ? ref(Number.MAX_VALUE) : ref(parseInt(dp));
let page = view.lastPos ? ref(Math.ceil(view.lastPos / pageSize.value)) : ref(1);
const pageSummary = computed(() => {
    if (totalLines === 0) {
        return `0 ${t("paragraph")}`;
    }
    const start = (page.value - 1) * pageSize.value + 1;
    const end = Math.min(page.value * pageSize.value, totalLines);
    return `${start}-${end} / ${totalLines} ${t("paragraph")}`;
});

let renderedText = ref("");
let psChange = ref(true); // 标志pageSize的改变
let refreshHandle = ref(true);
let renderRequestId = 0;

// pageSize变化应该使page同时进行调整以尽量保持原阅读位置
// 同时page和pageSize的改变都应该引起langr-pos的改变，但应只修改一次
// 因此引入psChange这个变量
watch([pageSize], async ([ps], [prev_ps]) => {
    let oldPage = page.value;
    page.value = Math.ceil(((page.value - 1) * prev_ps + 1) / ps);
    if (oldPage === page.value) {
        psChange.value = !psChange.value;
    }
});

watch(
    [page, psChange, refreshHandle],
    async ([p, pc], [prev_p, prev_pc]) => {
        const requestId = ++renderRequestId;
        let start = (p - 1) * pageSize.value;
        let end = start + pageSize.value > totalLines ? totalLines : start + pageSize.value;

        const html = await plugin.parser.parse(article.slice(start, end).join("\n"));
        if (requestId !== renderRequestId) {
            return;
        }
        renderedText.value = html;

        if (p !== prev_p || pc != prev_pc) {
            await plugin.frontManager.setFrontMatter(
                currentFile,
                "langr-pos",
                `${(p - 1) * pageSize.value + 1}`
            );
        }
    },
    { immediate: true }
);

// 设置阅读文字样式

// 添加无视单词
async function addIgnores() {
    let ignores = contentEl.querySelectorAll(".word.new") as unknown as HTMLElement[];
    let ignore_words: Set<string> = new Set();
    ignores.forEach((el) => {
        ignore_words.add(el.textContent.toLowerCase());
    });
    await plugin.db.postIgnoreWords([...ignore_words]);
    // this.setViewData(this.data)
    refreshHandle.value = !refreshHandle.value;
    emitLangrRefreshStat();

    if (page.value * pageSize.value < totalLines) {
        page.value++;
    }

    refreshCount();
}

let reading = ref<HTMLElement | null>(null);
let prevEl: HTMLElement | null = null;
if (plugin.constants.platform === "mobile") {
    useEvent(reading, "click", (e) => {
        let target = e.target as HTMLElement;
        if (target.hasClass("word") || target.hasClass("phrase")) {
            e.preventDefault();
            e.stopPropagation();
            if (prevEl) {
                let selectSpan = view.wrapSelect(prevEl, target);
                if (selectSpan) {
                    plugin.queryWord(selectSpan.textContent ?? "", selectSpan, {
                        x: e.pageX,
                        y: e.pageY,
                    });
                }
                prevEl = null;
            } else {
                prevEl = target;
            }
        } else {
            view.removeSelect();
            prevEl = null;
        }
    });
} else {
    useEvent(reading, "pointerdown", (e) => {
        let target = e.target as HTMLElement;
        if (target.hasClass("word") || target.hasClass("phrase") || target.hasClass("select")) {
            prevEl = target;
        }
    });
    useEvent(reading, "pointerup", (e) => {
        let target = e.target as HTMLElement;
        if (target.hasClass("word") || target.hasClass("phrase") || target.hasClass("select")) {
            e.preventDefault();
            e.stopPropagation();
            if (prevEl) {
                let selectSpan = view.wrapSelect(prevEl, target);
                if (selectSpan) {
                    plugin.queryWord(selectSpan.textContent ?? "", selectSpan, {
                        x: e.pageX,
                        y: e.pageY,
                    });
                }
                prevEl = null;
            }
        } else {
            view.removeSelect();
        }
    });
}
</script>

<style lang="scss">
#langr-reading {
    background: var(--background-secondary);
    user-select: none;

    .reading-provider {
        height: 100%;
    }

    .reading-desk {
        display: flex;
        height: 100%;
        min-height: 0;
        padding: var(--langr-space-3);
    }

    .reading-card {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
    }

    .reading-header {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: var(--langr-space-3);
        min-height: 48px;
        padding: var(--langr-space-3) var(--langr-space-4);
        border-bottom: 1px solid var(--langr-border);
        background: var(--langr-surface);
    }

    .reading-heading {
        min-width: 130px;
    }

    .reading-title {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.25;
    }

    .reading-audio {
        width: min(360px, 38vw);
        height: 30px;
    }

    .reading-actions {
        display: flex;
        gap: var(--langr-space-2);
        margin-left: auto;
    }

    .reading-action {
        width: auto;
        min-height: 28px;
        padding: 0 10px;
        color: var(--text-normal);
        border: 1px solid var(--langr-border);
        border-radius: var(--langr-radius-sm);
        background: var(--langr-surface-muted);
        box-shadow: none;
        cursor: pointer;
    }

    .reading-action:hover {
        border-color: var(--langr-border-hover);
        background: var(--background-modifier-hover);
        box-shadow: none;
    }

    .finish-reading {
        color: var(--text-on-accent);
        border-color: var(--langr-accent);
        background: var(--langr-accent);
    }

    .finish-reading:hover {
        color: var(--text-on-accent);
        background: var(--langr-accent-hover);
    }

    .reading-progress {
        display: grid;
        grid-template-columns: minmax(160px, 1fr) auto;
        gap: var(--langr-space-3);
        align-items: center;
        margin: var(--langr-space-3) var(--langr-space-4) 0;
        padding: var(--langr-space-2) var(--langr-space-3);
    }

    .reading-progress-labels {
        display: flex;
        flex-wrap: wrap;
        gap: var(--langr-space-1);
        justify-content: flex-end;
    }

    .text-area {
        flex: 1;
        min-height: 0;
        margin: var(--langr-space-3) var(--langr-space-4) 0;
        padding: clamp(18px, 3vw, 36px);
        overflow: auto;
        color: var(--text-normal);
        border: 1px solid var(--langr-border);
        border-radius: var(--langr-radius-md);
        background: var(--background-primary);
        font-family: var(--langr-font-reading);
        touch-action: none;

        span.word {
            user-select: contain;
            border: 1px solid transparent;
            cursor: pointer;
            border-radius: var(--langr-radius-xs);
            transition:
                background-color 120ms ease,
                border-color 120ms ease;

            &:hover {
                border-color: var(--langr-accent);
                background: var(--background-modifier-hover);
            }
        }

        span.phrase {
            background-color: transparent;
            padding-top: 3px;
            padding-bottom: 3px;
            cursor: pointer;
            border: 1px solid transparent;
            border-radius: var(--langr-radius-xs);
            transition:
                background-color 120ms ease,
                border-color 120ms ease;

            &:hover {
                border-color: var(--langr-accent);
                background: var(--background-modifier-hover);
            }
        }

        span.stns {
            border: 1px solid transparent;
        }

        span {
            .new {
                background-color: var(--langr-status-new-bg);
            }

            .learning {
                background-color: var(--langr-status-learning-bg);
            }

            .familiar {
                background-color: var(--langr-status-familiar-bg);
            }

            .known {
                background-color: var(--langr-status-known-bg);
            }

            .learned {
                background-color: var(--langr-status-learned-bg);
            }
        }

        span.other {
            user-select: text;
        }

        .select {
            background-color: var(--langr-status-learned-bg);
            padding-top: 3px;
            padding-bottom: 3px;
            cursor: pointer;
            border: 1px solid transparent;
            border-radius: var(--langr-radius-xs);

            &:hover {
                border-color: var(--langr-status-learned-fg);
            }
        }
    }

    .reading-pagination {
        display: flex;
        flex: 0 0 auto;
        justify-content: center;
        padding: var(--langr-space-3) var(--langr-space-4);
        border-top: 1px solid var(--langr-border);
        background: var(--langr-surface);
    }

    .note-area {
        display: flex;
        gap: var(--langr-space-2);
        height: 100%;
        width: 100%;

        .note-input {
            flex: 1;
        }

        .note-rendered {
            border: 1px solid var(--langr-border);
            border-radius: var(--langr-radius-sm);
            flex: 1;
            padding: var(--langr-space-2);
            overflow: auto;
            background: var(--langr-surface-muted);
        }
    }
}

.is-mobile #langr-reading {
    .reading-desk {
        padding: var(--langr-space-2);
    }

    .reading-header {
        align-items: stretch;
        flex-direction: column;
        gap: var(--langr-space-2);
    }

    .reading-audio {
        width: 100%;
    }

    .reading-actions {
        margin-left: 0;
    }

    .reading-progress {
        grid-template-columns: 1fr;
    }

    .reading-progress-labels {
        justify-content: flex-start;
    }

    .text-area {
        margin: var(--langr-space-2);
        padding: var(--langr-space-4);
    }

    .pagination {
        padding-bottom: 48px;
    }

    .note-area {
        flex-direction: column;
    }
}
</style>
