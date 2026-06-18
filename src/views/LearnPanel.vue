<template>
    <div id="langr-learn-panel" class="langr-shell">
        <NConfigProvider class="learn-provider" :theme="theme" :theme-overrides="themeOverrides">
            <div class="learn-panel-scroll">
                <NForm
                    class="learn-form"
                    :model="model"
                    label-placement="top"
                    label-width="auto"
                    :rules="rules"
                    require-mark-placement="right-hanging"
                >
                    <section class="learn-section langr-card">
                        <header class="learn-section-header">
                            <div>
                                <div class="learn-section-title">{{ t("Expression") }}</div>
                                <div class="langr-subtle">{{ t("A word or a phrase") }}</div>
                            </div>
                        </header>
                        <NFormItem :label="t('Expression')" path="expression">
                            <NInput
                                size="small"
                                v-model:value="model.expression"
                                :placeholder="t('A word or a phrase')"
                            />
                        </NFormItem>
                        <NFormItem :label="t('Meaning')" path="meaning">
                            <NInput
                                size="small"
                                v-model:value="model.meaning"
                                :placeholder="t('A short definition')"
                                type="textarea"
                                autosize
                            />
                        </NFormItem>
                        <div class="learn-choice-stack">
                            <NFormItem :label="t('Type')" path="t">
                                <NRadioGroup v-model:value="model.t">
                                    <NRadio value="WORD">{{ t("Word") }}</NRadio>
                                    <NRadio value="PHRASE">{{ t("Phrase") }}</NRadio>
                                </NRadioGroup>
                            </NFormItem>
                            <NFormItem :label="t('Status')" path="status">
                                <NRadioGroup
                                    class="learn-status-group"
                                    v-model:value="model.status"
                                    size="small"
                                >
                                    <NRadioButton v-for="(s, i) in status" :key="i" :value="i">
                                        {{ s.text }}
                                    </NRadioButton>
                                </NRadioGroup>
                            </NFormItem>
                        </div>
                        <NFormItem :label="t('Tags')" path="tags">
                            <NSelect
                                size="small"
                                v-model:value="model.tags"
                                filterable
                                multiple
                                tag
                                :placeholder="t('Input or select some tags')"
                                :loading="tagLoading"
                                :options="tagOptions"
                                @search="tagSearch"
                            ></NSelect>
                        </NFormItem>
                    </section>

                    <section class="learn-section langr-card">
                        <header class="learn-section-header">
                            <div class="learn-section-title">{{ t("Notes") }}</div>
                        </header>
                        <NFormItem :show-label="false" path="notes">
                            <NDynamicInput
                                v-model:value="model.notes"
                                :create-button-props="{ size: 'small' }"
                            >
                                <template #create-button-default>
                                    {{ t("Create") }}
                                </template>
                                <template #="{ index }">
                                    <NInput
                                        size="small"
                                        type="textarea"
                                        :placeholder="t('Write a new note')"
                                        v-model:value="model.notes[index]"
                                    />
                                </template>
                            </NDynamicInput>
                        </NFormItem>
                    </section>

                    <section class="learn-section langr-card">
                        <header class="learn-section-header">
                            <div class="learn-section-title">{{ t("Sentences") }}</div>
                        </header>
                        <NDynamicInput
                            class="sentence-input"
                            v-model:value="model.sentences"
                            :create-button-props="{ size: 'small' }"
                            :on-create="onCreateSentence"
                        >
                            <template #create-button-default>
                                {{ t("Create") }}
                            </template>
                            <template #="{ index }">
                                <div class="sentence-card">
                                    <NFormItem
                                        :show-label="false"
                                        :path="`sentences[${index}].text`"
                                        :rule="sourceRule"
                                    >
                                        <NInput
                                            size="small"
                                            type="textarea"
                                            v-model:value="model.sentences[index].text"
                                            :placeholder="t('Origin sentence')"
                                            :autosize="{ minRows: 1, maxRows: 3 }"
                                        />
                                    </NFormItem>
                                    <NFormItem
                                        :show-feedback="false"
                                        :show-label="false"
                                        :path="`sentences[${index}].trans`"
                                    >
                                        <NInput
                                            size="small"
                                            type="textarea"
                                            v-model:value="model.sentences[index].trans"
                                            :placeholder="t('Translation (Optional)')"
                                            :autosize="{ minRows: 1, maxRows: 3 }"
                                        />
                                    </NFormItem>
                                    <NFormItem
                                        :show-feedback="false"
                                        :show-label="false"
                                        :path="`sentences[${index}].origin`"
                                    >
                                        <NInput
                                            size="small"
                                            type="textarea"
                                            v-model:value="model.sentences[index].origin"
                                            :placeholder="t('Origin (Optional)')"
                                            :autosize="{ minRows: 1, maxRows: 3 }"
                                        />
                                    </NFormItem>
                                </div>
                            </template>
                        </NDynamicInput>
                    </section>
                </NForm>

                <section class="learn-submit langr-card">
                    <NButton
                        class="submit-button"
                        size="small"
                        type="primary"
                        attr-type="submit"
                        @click="submit"
                        :loading="submitLoading"
                    >
                        <NIconWrapper
                            v-if="successing"
                            class="submit-state-icon"
                            :size="18"
                            :border-radius="6"
                        >
                            <NIcon :size="16">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    xmlns:xlink="http://www.w3.org/1999/xlink"
                                    viewBox="0 0 16 16"
                                >
                                    <g fill="none">
                                        <path
                                            d="M14.046 3.486a.75.75 0 0 1-.032 1.06l-7.93 7.474a.85.85 0 0 1-1.188-.022l-2.68-2.72a.75.75 0 1 1 1.068-1.053l2.234 2.267l7.468-7.038a.75.75 0 0 1 1.06.032z"
                                            fill="currentColor"
                                        ></path>
                                    </g>
                                </svg>
                            </NIcon>
                        </NIconWrapper>
                        <NIconWrapper
                            v-if="failing"
                            class="submit-state-icon failing"
                            :size="18"
                            :border-radius="6"
                        >
                            <NIcon :size="16">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    xmlns:xlink="http://www.w3.org/1999/xlink"
                                    viewBox="0 0 16 16"
                                >
                                    <g fill="none">
                                        <path
                                            d="M2.397 2.554l.073-.084a.75.75 0 0 1 .976-.073l.084.073L8 6.939l4.47-4.47a.75.75 0 1 1 1.06 1.061L9.061 8l4.47 4.47a.75.75 0 0 1 .072.976l-.073.084a.75.75 0 0 1-.976.073l-.084-.073L8 9.061l-4.47 4.47a.75.75 0 0 1-1.06-1.061L6.939 8l-4.47-4.47a.75.75 0 0 1-.072-.976l.073-.084l-.073.084z"
                                            fill="currentColor"
                                        ></path>
                                    </g>
                                </svg>
                            </NIcon>
                        </NIconWrapper>

                        {{ t("Submit") }}
                    </NButton>
                </section>
            </div>
        </NConfigProvider>
    </div>
</template>

<script setup lang="ts">
import { Notice } from "obsidian";
import { ref } from "vue";
import {
    NIcon,
    NIconWrapper,
    NForm,
    NFormItem,
    NInput,
    NRadio,
    NRadioButton,
    NRadioGroup,
    NButton,
    NDynamicInput,
    NSelect,
    SelectOption,
    NConfigProvider,
} from "naive-ui";

import { ExpressionInfo, ExpressionType, Sentence } from "@/db/interface";
import { t } from "@/lang/helper";
import { useEvent } from "@/utils/use";
import { LearnPanelView } from "./LearnPanelView";
import { ReadingView } from "./ReadingView";
import { search } from "@dict/youdao/engine";
import store from "@/store";
import { usePlugin, useView } from "@/ui/context";
import { emitLangrRefresh, emitLangrRefreshStat } from "@/events";
import { useLangrNaiveTheme, useLangrNaiveThemeOverrides } from "@/ui/theme";

const view = useView<LearnPanelView>();
const plugin = usePlugin();

const theme = useLangrNaiveTheme(() => store.dark);
const themeOverrides = useLangrNaiveThemeOverrides();

//表单数据
let model = ref<ExpressionInfo>({
    expression: "",
    meaning: "",
    status: 0,
    t: "WORD",
    tags: [],
    notes: [],
    sentences: [],
});

// 表单检查规则
let rules = {
    expression: {
        required: true,
        trigger: ["blur", "input"],
        message: t("Please input a word/phrase"),
    },
    meaning: {
        required: true,
        trigger: ["blur", "input"],
        message: t("A short definition is needed"),
    },
    t: {
        required: true,
        trigger: "change",
        message: "Expression can be a word or phrase",
    },
    status: {
        required: true,
    },
};

let sourceRule = {
    required: true,
    trigger: ["blur", "input"],
    message: "At least input a source sentence",
};

function onCreateSentence() {
    return {
        text: "",
        trans: "",
        origin: "",
    };
}

// 单词状态样式
const status = [
    { text: t("Ignore") },
    { text: t("Learning") },
    { text: t("Familiar") },
    { text: t("Known") },
    { text: t("Learned") },
];

// 异步获取数据库中所有tag
let tagOptions = ref<SelectOption[]>([]);
let tagLoading = ref(false);
let tags: string[] = [];

async function tagSearch(query: string) {
    tagLoading.value = true;
    if (query.length < 2) {
        tags = await plugin.db.getTags();
    }
    tagLoading.value = false;

    if (!query.length) {
        tagOptions.value = tags.map((v) => {
            return { label: v, value: v };
        });
        return;
    }
    tagOptions.value = tags
        .filter((v) => ~v.indexOf(query))
        .map((v) => {
            return { label: v, value: v };
        });
}

// 提交信息到数据库的加载状态
let successing = ref(false);
async function success() {
    successing.value = true;
    await sleep(2000);
    successing.value = false;
}
let failing = ref(false);
async function fail() {
    failing.value = true;
    await sleep(2000);
    failing.value = false;
}

let submitLoading = ref(false);

async function submit() {
    // 表单内容检查
    if (!model.value.expression) {
        new Notice(t("Expression is empty!"));
        return;
    }
    if (!model.value.meaning) {
        new Notice(t("Meaning is empty!"));
        return;
    }
    if (model.value.expression.trim().split(" ").length > 1 && model.value.t === "WORD") {
        new Notice(t("It looks more like a PHRASE than a WORD"));
        return;
    }

    submitLoading.value = true;
    let data = JSON.parse(JSON.stringify(model.value));
    (data as any).expression = (data as any).expression.trim().toLowerCase();
    // 超过1条例句时，sentences中的对象会变成Proxy，尚不知原因，因此用JSON转换一下
    let statusCode = 0;
    try {
        statusCode = await plugin.db.postExpression(data);
    } catch (error) {
        console.warn("Submit failed, please check server status", error);
    } finally {
        submitLoading.value = false;
    }

    if (statusCode !== 200) {
        new Notice("Submit failed");
        fail();
        return;
    }

    success();

    emitLangrRefresh(model.value.expression, model.value.t, model.value.status);
    emitLangrRefreshStat();

    //自动刷新数据库
    if (plugin.settings.auto_refresh_db) {
        // setTimeout(() => {
        plugin.refreshTextDB();
        // }, 0);
    }
}

// 查询词汇时自动填充新词表单
useEvent(window, "obsidian-langr-search", async (evt: CustomEvent) => {
    let selection = evt.detail.selection as string;
    let expr = await plugin.db.getExpression(selection);

    let exprType: ExpressionType = "WORD";
    if (selection.trim().contains(" ")) {
        exprType = "PHRASE";
    }

    let target = evt.detail.target as HTMLElement;

    let sentenceText = "";
    let storedSen: Sentence | null = null;
    let defaultOrigin = "";
    let filledTrans = "";

    if (target) {
        let sentenceEl = target.parentElement?.hasClass("stns")
            ? target.parentElement
            : target.parentElement?.parentElement;
        if (!sentenceEl) {
            return;
        }
        sentenceText = sentenceEl.textContent ?? "";

        storedSen = await plugin.db.tryGetSen(sentenceText);

        let reading = view.app.workspace.getActiveViewOfType(ReadingView);

        if (reading?.file) {
            let presetOrigin = view.app.metadataCache.getFileCache(reading.file)?.frontmatter?.[
                "langr-origin"
            ];
            defaultOrigin = presetOrigin ? presetOrigin : reading.file.name;
        }

        if (plugin.settings.use_machine_trans) {
            try {
                let res = await search(sentenceText);
                if (res && (res.result as any).translation) {
                    let html = (res.result as any).translation as string;
                    const paragraphs = html.match(/<p>([^<>]+)<\/p>/g);
                    filledTrans = paragraphs?.[1]?.match(/<p>(.*)<\/p>/)?.[1] ?? "";
                }
            } catch (e) {
                filledTrans = "";
            }
        }
    }

    if (expr) {
        if (sentenceText) {
            if (!storedSen) {
                expr.sentences = expr.sentences.concat({
                    text: sentenceText,
                    trans: filledTrans,
                    origin: defaultOrigin,
                });
            } else {
                let added = expr.sentences.find((sen) => sen.text === sentenceText);
                if (!added) {
                    expr.sentences = expr.sentences.concat(storedSen);
                }
            }
        }
        model.value = expr;
        return;
    } else {
        if (!target) {
            model.value = {
                expression: selection,
                meaning: "",
                status: 1,
                t: exprType,
                tags: [],
                notes: [],
                sentences: [],
            };
            return;
        }

        model.value = {
            expression: selection,
            meaning: "",
            status: 1,
            t: exprType,
            tags: [],
            notes: [],
            sentences: storedSen
                ? [storedSen]
                : [
                      {
                          text: sentenceText,
                          trans: filledTrans,
                          origin: defaultOrigin,
                      },
                  ],
        };
    }
});
</script>

<style lang="scss">
#langr-learn-panel {
    overflow: hidden;
    background: var(--langr-page);
    padding-bottom: 18px;

    .learn-provider {
        height: 100%;
    }

    .learn-panel-scroll {
        height: 100%;
        min-height: 0;
        overflow: auto;
        padding: var(--langr-space-3);
    }

    .learn-form {
        display: flex;
        flex-direction: column;
        gap: var(--langr-space-3);
    }

    .learn-section {
        padding: var(--langr-space-3);
        border-color: var(--langr-border-strong);
        background: var(--langr-surface-raised);
        box-shadow: var(--langr-shadow);
    }

    .learn-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--langr-space-2);
        margin-bottom: var(--langr-space-2);
        padding-bottom: var(--langr-space-2);
        border-bottom: 1px solid var(--langr-border-subtle);
    }

    .learn-section-title {
        font-size: 13px;
        font-weight: 700;
        color: var(--text-normal);
    }

    .learn-choice-stack {
        display: flex;
        flex-direction: column;
        gap: var(--langr-space-2);
    }

    .learn-status-group {
        max-width: 100%;
        overflow-x: auto;
        overflow-y: hidden;

        .n-radio-button {
            min-width: 56px;
            text-align: center;
        }
    }

    .n-input {
        margin: 1px 0;
    }

    .n-form-item {
        margin-bottom: 4px;
    }

    .n-form-item-label {
        font-weight: 650;
    }

    .n-radio-group .n-radio-button {
        border-color: var(--langr-border-strong);
        background: var(--langr-surface-inset);
    }

    .sentence-input {
        width: 100%;
    }

    .sentence-card {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: var(--langr-space-2);
        min-width: 0;
        padding: var(--langr-space-2);
        border: 1px solid var(--langr-border-strong);
        border-radius: var(--langr-radius-sm);
        background: var(--langr-surface-inset);
        box-shadow: inset 0 1px 0 color-mix(in srgb, var(--background-primary) 72%, transparent);
    }

    .n-dynamic-input .n-button-group {
        flex-direction: column;

        button {
            height: 26px;
            width: 26px;

            &:nth-child(1) {
                border-top-left-radius: 34px !important;
                border-top-right-radius: 34px !important;
                border-bottom-left-radius: 0 !important;
                border-bottom-right-radius: 0 !important;
            }

            &:nth-child(2) {
                border-top-left-radius: 0 !important;
                border-top-right-radius: 0 !important;
                border-bottom-left-radius: 34px !important;
                border-bottom-right-radius: 34px !important;
            }
        }
    }

    .learn-submit {
        position: sticky;
        bottom: 0;
        z-index: 1;
        margin-top: var(--langr-space-3);
        padding: var(--langr-space-2);
        border: 1px solid var(--langr-border-strong);
        border-radius: var(--langr-radius-md);
        background: var(--langr-surface-raised);
        box-shadow: var(--langr-shadow-strong);
    }

    .submit-button {
        width: 100%;
    }

    .submit-state-icon {
        margin-right: var(--langr-space-2);
    }

    .submit-state-icon.failing {
        color: var(--text-error);
    }
}

.is-mobile #langr-learn-panel {
    .learn-panel-scroll {
        padding: var(--langr-space-2);
    }
}
</style>
