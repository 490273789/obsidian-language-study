<template>
    <div id="langr-data" class="langr-shell">
        <NConfigProvider class="data-provider" :theme="theme" :theme-overrides="themeOverrides">
            <div class="data-panel-layout">
                <section class="data-toolbar langr-card">
                    <div class="data-filter-row">
                        <span class="data-filter-label">Search</span>
                        <NInput size="small" v-model:value="searchText" />
                    </div>
                    <div class="data-filter-row tag-row">
                        <span class="data-filter-label">Tags</span>
                        <select class="tag-mode" v-model="mode">
                            <option value="and">And</option>
                            <option value="or">Or</option>
                        </select>
                        <div class="tag-list">
                            <NTag
                                v-for="(tag, i) in tags"
                                :key="tag"
                                size="small"
                                checkable
                                v-model:checked="checkedTags[i]"
                            >
                                {{ "#" + tag }}
                            </NTag>
                        </div>
                    </div>
                </section>
                <section class="data-table-card langr-card">
                    <NDataTable
                        ref="table"
                        size="small"
                        :loading="loading"
                        :data="data"
                        :columns="collumns"
                        :row-key="makeRowKey"
                        @update:checked-row-keys="handleCheck"
                        :pagination="{ pageSize: 10 }"
                    />
                </section>
            </div>
        </NConfigProvider>
    </div>
</template>

<script setup lang="ts">
import { h, ref, reactive, watch, watchEffect, Suspense, defineAsyncComponent } from "vue";
import { NConfigProvider, NDataTable, NTag, NInput } from "naive-ui";
import { t } from "@/lang/helper";
import { moment } from "@/utils/moment";
import { usePlugin } from "@/ui/context";
import { useLangrNaiveTheme, useLangrNaiveThemeOverrides } from "@/ui/theme";

import type { DataTableColumns, DataTableRowKey } from "naive-ui";

const WordMore = defineAsyncComponent(() => import("@comp/WordMore.vue"));

const plugin = usePlugin();

const theme = useLangrNaiveTheme(() => plugin.store.dark);
const themeOverrides = useLangrNaiveThemeOverrides();

interface Row {
    expr: string;
    status: string;
    meaning: string;
    tags: string[];
    date: string;
    senNum: number;
    noteNum: number;
}

const statusMap = [t("Ignore"), t("Learning"), t("Familiar"), t("Known"), t("Learned")];

let loading = ref(true);
let data = ref<Row[]>([]);
let table = ref<InstanceType<typeof NDataTable> | null>(null);
let mode = ref("and");
let tags = ref<string[]>([]);
let checkedTags = ref<boolean[]>([]);
let selectedTags = ref<string[]>([]);

watchEffect(async () => {
    let rawData = await plugin.db.getAllExpressionSimple(false);
    data.value = rawData.map((entry, i): Row => {
        return {
            expr: entry.expression,
            status: statusMap[entry.status],
            meaning: entry.meaning,
            tags: entry.tags,
            noteNum: entry.note_num,
            senNum: entry.sen_num,
            date: moment.unix(entry.date).format("YYYY-MM-DD"),
        };
    });
    tags.value = await plugin.db.getTags();
    checkedTags.value = Array.from({ length: tags.value.length }, () => false);
    loading.value = false;
});
watchEffect(() => {
    let selected = tags.value.filter((tag, i) => checkedTags.value[i]);
    table.value?.filter({
        tags: selected,
    });
    selectedTags.value = selected;
});

// 搜索框
let searchText = ref("");
watch(searchText, (text) => {
    table.value?.filter({
        expr: text,
    });
});

// 选中行
let rowKeysRef = ref<DataTableRowKey[]>([]);
let makeRowKey = (row: Row) => row.expr;
function handleCheck(rowKeys: DataTableRowKey[]) {
    rowKeysRef.value = rowKeys;
}

let collumns = reactive<DataTableColumns<Row>>([
    // {
    //     type: "selection",
    // },
    {
        type: "expand",
        expandable: (row: Row) => row.noteNum + row.senNum > 0,
        renderExpand: (row: Row) => {
            return h(Suspense, [h(WordMore, { word: row.expr })]);
        },
    },
    // 表达
    {
        title: "Expr",
        key: "expr",
        sorter: "default" as const,
        filter(_: string | number, row: Row) {
            if (!searchText.value) return true;

            return row.expr.contains(searchText.value);
        },
    },
    // 学习状态
    {
        title: "Status",
        key: "status",
        width: "70",
        defaultFilterOptionValues: statusMap.slice(1),
        filterOptions: [
            { label: t("Ignore"), value: t("Ignore") },
            { label: t("Learning"), value: t("Learning") },
            { label: t("Familiar"), value: t("Familiar") },
            { label: t("Known"), value: t("Known") },
            { label: t("Learned"), value: t("Learned") },
        ],
        filter(value: string | number, row: Row) {
            return row.status === value;
        },
    },
    // 含义
    {
        title: "Meaning",
        key: "meaning",
    },
    // 标签
    {
        title: "Tags",
        key: "tags",
        render(row: Row) {
            return row.tags.map((tag: string) =>
                h(
                    NTag,
                    {
                        style: { marginRight: "6px" },
                        type: "info",
                        size: "tiny",
                    },
                    { default: () => tag }
                )
            );
        },
        filter(value: string | number, row: Row) {
            if (selectedTags.value.length === 0) {
                return true;
            }
            return mode.value === "and"
                ? selectedTags.value.every((tag) => row.tags.contains(tag))
                : selectedTags.value.some((tag) => row.tags.contains(tag));
        },
    },
    // 修改日期
    {
        title: "Date",
        key: "date",
        sorter(row1: Row, row2: Row) {
            return moment.utc(row1.date).unix() - moment.utc(row2.date).unix();
        },
    },
]);
</script>

<style lang="scss">
#langr-data {
    overflow: hidden;
    background: transparent;

    .data-provider {
        height: 100%;
    }

    .data-panel-layout {
        display: flex;
        flex-direction: column;
        gap: var(--langr-space-3);
        height: 100%;
        min-height: 0;
        padding: var(--langr-space-3);
    }

    .data-toolbar {
        display: flex;
        flex: 0 0 auto;
        flex-direction: column;
        gap: var(--langr-space-2);
        padding: var(--langr-space-3);
        border-color: var(--langr-border-neon);
        background:
            linear-gradient(
                90deg,
                color-mix(in srgb, var(--langr-accent-hot) 10%, transparent),
                transparent 42%
            ),
            var(--langr-surface-glass);
        box-shadow: var(--langr-shadow-strong);
    }

    .data-filter-row {
        display: flex;
        align-items: center;
        gap: var(--langr-space-2);
        min-width: 0;
    }

    .data-filter-label {
        width: 58px;
        flex: 0 0 auto;
        color: var(--langr-accent);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
    }

    .tag-row {
        align-items: flex-start;
    }

    .tag-mode {
        height: 26px;
        color: var(--text-normal);
        border: 1px solid var(--langr-border-strong);
        border-radius: var(--langr-radius-sm);
        background: var(--langr-surface-inset);
        box-shadow: var(--langr-glow-cyan);
    }

    .tag-list {
        display: flex;
        flex: 1;
        flex-wrap: wrap;
        gap: var(--langr-space-1);
        min-width: 0;
    }

    .data-table-card {
        flex: 1;
        min-height: 0;
        overflow: hidden;
        padding: var(--langr-space-2);
        border-color: var(--langr-border-neon);
        background: var(--langr-surface-raised);
        box-shadow: var(--langr-shadow-strong);
    }

    .n-data-table-filter {
        width: 19px;
    }

    .n-data-table-th--filterable {
        width: 19px;
    }

    .n-data-table__pagination {
        justify-content: center;
    }

    .n-data-table {
        --n-merged-border-color: var(--langr-border-strong);
        --n-border-color: var(--langr-border-strong);
        --n-td-color: var(--langr-surface);
        --n-td-color-hover: color-mix(in srgb, var(--langr-accent) 8%, var(--langr-surface));
        --n-td-text-color: var(--text-normal);
        --n-th-color: var(--langr-surface-inset);
        --n-th-color-hover: color-mix(in srgb, var(--langr-accent) 10%, var(--langr-surface-inset));
        --n-th-text-color: var(--text-muted);
        --n-th-font-weight: 700;
        --n-resizable-container-size: 0;
        background: var(--langr-surface);
    }

    .n-data-table .n-data-table-base-table,
    .n-data-table .n-data-table-base-table-body,
    .n-data-table .n-data-table-table,
    .n-data-table .n-data-table-thead,
    .n-data-table .n-data-table-tbody {
        color: var(--text-normal);
        background: var(--langr-surface);
    }

    .n-data-table .n-data-table-th {
        color: var(--text-muted);
        background: var(--langr-surface-inset);
        border-color: var(--langr-border-strong);
    }

    .n-data-table .n-data-table-td {
        color: var(--text-normal);
        background: var(--langr-surface);
        border-color: var(--langr-border-strong);
    }

    .n-data-table .n-data-table-tr,
    .n-data-table .n-data-table-tr .n-data-table-td {
        background: var(--langr-surface);
    }

    .n-data-table .n-data-table-tr:hover,
    .n-data-table .n-data-table-tr:hover .n-data-table-td {
        background: color-mix(in srgb, var(--langr-accent) 8%, var(--langr-surface));
    }

    .n-data-table .n-data-table-td--last-row {
        border-bottom-color: var(--langr-border-strong);
    }

    .data-more {
        padding: var(--langr-space-2);

        h2 {
            margin: 0.5em 0;
        }

        .data-notes {
            p {
                white-space: pre-line;
                margin: 0.5em 0;
                padding: var(--langr-space-2);
                border: 1px solid var(--langr-border-strong);
                border-radius: var(--langr-radius-sm);
                background: var(--langr-surface-inset);
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--langr-accent) 7%, transparent);
            }
        }

        .data-sens {
            .data-sen {
                margin-bottom: var(--langr-space-2);
                border: 1px solid var(--langr-border-strong);
                border-radius: var(--langr-radius-sm);
                background: var(--langr-surface-inset);
                box-shadow: inset 0 0 0 1px
                    color-mix(in srgb, var(--langr-accent-hot) 6%, transparent);

                p {
                    &:first-child {
                        font-style: italic;
                    }

                    margin: 0.5em var(--langr-space-2);
                }
            }
        }
    }
}

.is-mobile #langr-data {
    .data-panel-layout {
        padding: var(--langr-space-2);
    }

    .data-filter-row {
        align-items: stretch;
        flex-direction: column;
    }

    .data-filter-label {
        width: auto;
    }
}
</style>
