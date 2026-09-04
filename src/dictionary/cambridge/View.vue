<template>
    <div id="cambridge" ref="cambridgeEl">
        <section v-for="entry in entries" :key="entry.id" :id="entry.id">
            <div v-html="entry.html"></div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import type { CambridgeResult } from "./engine";

const props = defineProps<{
    result?: CambridgeResult | null;
}>();

const cambridgeEl = ref<HTMLElement | null>(null);

const entries = computed<CambridgeResult>(() => props.result ?? []);

function handleClick(evt: MouseEvent) {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    if (
        (target.tagName === "HEADER" && target.hasClass("ca_h")) ||
        target.matchParent("header.ca_h")
    ) {
        const section = target.matchParent("section");
        if (!section) return;
        if (section.hasClass("expand")) {
            section.removeClass("expand");
        } else {
            section.addClass("expand");
        }
    }
}

onMounted(() => {
    cambridgeEl.value?.addEventListener("click", handleClick);
});

onUnmounted(() => {
    cambridgeEl.value?.removeEventListener("click", handleClick);
});
</script>

<style lang="scss">
#cambridge {
    font-size: 1.1em;

    .dgram a {
        color: inherit;
    }

    section[id^="d-cambridge-entry"] {
        margin-bottom: 20px;
    }

    h3.dsense_h {
        color: inherit;
        font-size: 1.1em;
        margin-top: 10px;
        margin-bottom: 3px;
    }

    .di-title {
        font-size: 1.3em;
        font-weight: 700;
        line-height: 1.3;

        h2 {
            font-size: inherit;
            font-weight: inherit;
            line-height: inherit;
            color: inherit;
        }
    }

    .pos {
        font-style: italic;
        font-weight: 500;
    }

    .dpron-i .region {
        color: #e84427;
        text-transform: uppercase;
        font-weight: 700;
    }

    .dwl {
        margin-top: 5px;
        // border-top: 1px solid #c76e06;
        border-top: 1px solid #fec400;
    }

    .dxref {
        padding: 1px 5px;
        color: white;
        font-weight: 700;
        font-size: 0.8em;
        text-align: center;
        background-color: #444;
        border-radius: 8px;
    }

    .query {
        color: inherit;
        font-weight: inherit;

        &:hover {
            text-decoration: underline;
        }
    }

    .examp {
        margin-left: 1.3em;
        display: list-item;
        font-style: italic;
        margin-top: 5px;
    }

    .trans {
        display: block;
    }

    li.dexamp.eg {
        font-style: italic;
        display: list-item;
        list-style-type: disc;
        margin-bottom: 5px;

        &::marker {
            text-transform: none;
            color: black;
        }
    }

    .db {
        font-weight: 700;
    }

    .lab {
        font-size: 1.1em;
        font-variant: small-caps;
        font-weight: 500;
    }

    .daccord {
        margin: 10px 0;
        background-color: #fff8e4d7;
        color: black;
        border-radius: 3px;

        header {
            font-weight: 500;
            cursor: pointer;
            line-height: 1.6em;
        }

        section {
            i {
                margin-right: 3px;
            }

            i::before {
                content: "+";
            }

            & > :last-child {
                display: none;
            }

            &.expand {
                i::before {
                    content: "-";
                }

                & > :last-child {
                    display: block;
                }
            }
        }

        span.ti {
            margin-left: 10px;

            .dexample {
                font-style: italic;
            }
        }
    }
}
</style>
