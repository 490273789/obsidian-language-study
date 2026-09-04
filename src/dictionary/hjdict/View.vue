<template>
    <div id="hjdict">
        <div v-for="(en, index) in entries" :key="index" v-html="en"></div>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { HjdictResult } from "./engine";
import type { SafeHtml } from "@/utils/safeHtml";

const props = defineProps<{
    result?: HjdictResult | null;
}>();

const entries = computed<SafeHtml[]>(() => {
    if (props.result && props.result.type === "lex") {
        return props.result.entries;
    }
    return [];
});
</script>

<style lang="scss">
#hjdict {
    font-size: 1.1em;

    dd {
        margin-inline-start: 15px;
    }

    ul {
        padding-inline-start: 20px;
    }

    h3 {
        font-size: 1.3em;
        line-height: 1.3;
        font-weight: 700;
        padding: 0;
    }

    p {
        margin: 0.5em 0;

        &.detail-source {
            span {
                font-size: 0.8em;
                color: white;
                line-height: 1.2;
                display: inline-block;
                border-radius: 2px;
                text-align: center;
                margin-left: 7px;
                padding: 1px 3px;

                &.collins-icon {
                    background-color: #c94444;
                }

                &.wys-icon {
                    background-color: #414585;
                }
            }
        }
    }

    h2 {
        font-size: 1.4em;
        font-weight: 500;
        padding-bottom: 5px;
        border-bottom: 1px solid gray;
        margin-bottom: 10px;
    }

    .word-info {
        h2 {
            font-size: 1.3em;
            font-weight: 700;
        }
    }

    .detail-tags-en {
        display: block;
        list-style-type: none;
        overflow: hidden;
        padding: 0;

        li {
            height: 16px;
            line-height: 1.2;
            background-color: #f0f0f0;
            border-radius: 2px;
            text-align: center;
            color: gray;
            float: left;
            font-size: 1em;
            padding: 0 4px;
            margin-right: 8px;
        }
    }

    .detail-groups {
        margin-top: 1em;

        dt {
            font-size: 1.1em;
            margin-bottom: 0.8em;
            font-weight: 700;
            line-height: 1.2;
        }

        dd {
            margin: 0 0 1em 1.5em;
            display: list-item;
            list-style-type: decimal;

            &:first-of-type:last-of-type {
                list-style-type: none;
            }

            ul {
                padding-inline-start: 15px;
            }

            h3 {
                font-size: 1em;
                font-weight: 400;
                line-height: 1.2;
                margin: 0 0 0.5em;
                padding: 0;
            }
        }
    }
}
</style>
