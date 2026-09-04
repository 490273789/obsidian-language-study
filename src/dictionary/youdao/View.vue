<template>
    <div id="youdao">
        <h2>{{ word }}</h2>
        <div class="pronunces">
            <span class="pron" v-for="i in prons.length" @click="playAudio(prons[i - 1].url)">{{
                prons[i - 1].phsym
            }}</span>
        </div>
        <div class="meaning" style="margin-bottom: 10px" v-html="meaningHTML"></div>
        <div class="translation" v-html="translationHTML" />
        <button
            v-for="sub in ['柯林斯', '辨析', '词组', '同根词']"
            @click="curPanel = sub"
            :style="curPanel === sub ? 'background-color:#483699;color:white;' : ''"
        >
            {{ sub }}
        </button>
        <Collins class="collins" v-if="curPanel === '柯林斯'" :mydata="collins" />
        <div
            class="discrimination"
            v-else-if="curPanel === '辨析'"
            v-html="discriminationHTML"
        ></div>
        <div class="word-group" v-else-if="curPanel === '词组'" v-html="wordGroupHTML"></div>
        <div class="rel-word" v-else-if="curPanel === '同根词'" v-html="relWordHTML"></div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

import Collins from "./YDCollins.vue";
import type { YoudaoResult, YoudaoResultLex } from "./engine";
import { playAudio } from "@/utils/helpers";
import { EMPTY_SAFE_HTML } from "@/utils/safeHtml";

const props = defineProps<{
    result?: YoudaoResult | null;
}>();

const lex = computed<YoudaoResultLex | null>(() => {
    if (props.result && props.result.type === "lex") {
        return props.result as YoudaoResultLex;
    }
    return null;
});

const word = computed(() => lex.value?.title ?? "");
const meaningHTML = computed(() => lex.value?.basic ?? EMPTY_SAFE_HTML);
const translationHTML = computed(() => lex.value?.translation ?? EMPTY_SAFE_HTML);
const prons = computed(() => lex.value?.prons ?? []);
const collins = computed(() => lex.value?.collins ?? []);
const discriminationHTML = computed(() => lex.value?.discrimination ?? EMPTY_SAFE_HTML);
const wordGroupHTML = computed(() => lex.value?.wordGroup ?? EMPTY_SAFE_HTML);
const relWordHTML = computed(() => lex.value?.relWord ?? EMPTY_SAFE_HTML);

const curPanel = ref("柯林斯");
</script>

<style lang="scss">
#youdao {
    h2 {
        font-size: 1.3em;
        font-weight: 700;
    }

    .pron {
        margin-right: 15px;
        color: deeppink;
        font-size: 1.1em;
        cursor: pointer;
    }

    .meaning ul {
        padding-left: 0;
    }

    h1,
    h2,
    h3,
    h4 {
        margin-top: 0.2em;
        margin-bottom: 0.2em;
    }

    p {
        margin-top: 0.2em;
        margin-bottom: 0.2em;
    }

    ul {
        padding-left: 20px;
        margin-top: 0.2em;
        margin-bottom: 0.2em;
    }

    ul,
    ol,
    li {
        list-style-type: none;
    }

    .collins {
        h4 {
            span,
            em {
                margin-right: 5px;
            }
        }

        .collinsMajorTrans .additional {
            color: lightsalmon;
        }

        .exampleLists {
            margin: 5px 0 5px 0px;
            padding-left: 20px;
            border-left: 1px solid #d9d9d9;
        }

        .collinsOrder {
            float: left;
            margin-left: -15px;
        }
    }

    .discrimination {
        .title {
            font-size: 1.2em;
            font-weight: bold;
        }

        .wordGroup {
            margin-left: 10px;
        }

        .wt-container {
            margin-top: 0.5em;
        }
    }
}

.theme-light #youdao {
    .collins .collinsMajorTrans,
    .discrimination .wt-container {
        background-color: #c7e2ef;
    }
}

.theme-dark #youdao {
    .collins .collinsMajorTrans,
    .discrimination .wt-container {
        background-color: #282a36;
    }
}
</style>
