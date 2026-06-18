<template>
    <div class="word-more">
        <div class="word-notes" v-if="notes.length > 0">
            <h2>Notes:</h2>
            <p v-for="n in notes">{{ n }}</p>
        </div>
        <div class="word-sens" v-if="sentences.length > 0">
            <h2>Sentences:</h2>
            <div class="word-sen" v-for="sen in sentences">
                <p v-html="highlightExpression(sen.text, props.word)"></p>
                <p>{{ sen.trans }}</p>
                <p>{{ sen.origin }}</p>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { usePlugin } from "@/ui/context";
import { highlightExpression } from "@/utils/safeHtml";

const plugin = usePlugin();

const props = defineProps<{
    word: string;
}>();

let expressionInfo = await plugin.db.getExpression(props.word);
let sentences = expressionInfo?.sentences ?? [];
let notes = expressionInfo?.notes ?? [];
</script>

<style lang="scss">
.word-more {
    h2 {
        margin: 0.5em 0;
        color: var(--langr-accent);
        font-size: 13px;
        text-transform: uppercase;
    }

    .word-notes {
        user-select: text;

        p {
            white-space: pre-line;
            margin: 0.5em 0;
            padding: var(--langr-space-2);
            border: 1px solid var(--langr-border-strong);
            border-radius: var(--langr-radius-sm);
            background:
                linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--langr-accent) 8%, transparent),
                    transparent
                ),
                var(--langr-surface-inset);
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--langr-accent) 7%, transparent);
        }
    }

    .word-sens {
        user-select: text;

        .word-sen {
            margin-bottom: var(--langr-space-2);
            border: 1px solid var(--langr-border-strong);
            border-radius: var(--langr-radius-sm);
            background:
                linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--langr-accent-hot) 8%, transparent),
                    transparent
                ),
                var(--langr-surface-inset);
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--langr-accent-hot) 6%, transparent);

            p {
                &:first-child {
                    font-style: italic;

                    em {
                        font-weight: bold;
                        color: var(--langr-accent-hot);
                    }
                }

                margin: 0.5em var(--langr-space-2);
            }
        }
    }
}
</style>
