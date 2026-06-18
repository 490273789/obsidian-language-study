<template>
    <div id="popup-search" ref="popup" :style="style" class="langr-card">
        <header class="pop-handle" ref="handle">
            <div class="pop-title">{{ t("Popup Search Panel") }}</div>
            <button
                type="button"
                class="pin-button"
                :class="{ pinned }"
                @click="pin"
                :title="t('Popup Search Panel')"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 53.011 53.011">
                    <path
                        class=""
                        d="M52.963 21.297c-.068-.33-.297-.603-.61-.727-8.573-3.416-16.172-.665-18.36.288L19.113 8.2C19.634 3.632 17.17.508 17.06.372c-.18-.22-.442-.356-.725-.372-.282-.006-.56.09-.76.292L.32 15.546c-.202.2-.308.48-.29.765.015.285.152.55.375.727 2.775 2.202 6.35 2.167 7.726 2.055l12.722 14.953c-.868 2.23-3.52 10.27-.307 18.337.124.313.397.54.727.61.067.013.135.02.202.02.263 0 .518-.104.707-.293l14.57-14.57 13.57 13.57c.196.194.452.292.708.292s.512-.098.707-.293c.39-.392.39-1.024 0-1.415l-13.57-13.57 14.527-14.528c.237-.238.34-.58.27-.91zm-17.65 15.458L21.89 50.18c-2.437-8.005.993-15.827 1.03-15.91.158-.352.1-.764-.15-1.058L9.31 17.39c-.19-.225-.473-.352-.764-.352-.05 0-.103.004-.154.013-.036.007-3.173.473-5.794-.954l13.5-13.5c.604 1.156 1.39 3.26.964 5.848-.058.346.07.697.338.924l15.785 13.43c.31.262.748.31 1.105.128.077-.04 7.378-3.695 15.87-1.017L35.313 36.754z"
                    />
                </svg>
            </button>
        </header>
        <div class="pop-body">
            <SearchPanel />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useDraggable } from "@vueuse/core";
import store from "@/store";
import { t } from "@/lang/helper";
import SearchPanel from "./SearchPanel.vue";

const props = defineProps<{
    x?: number;
    y?: number;
}>();

let popup = ref<HTMLElement | null>(null);
let handle = ref<HTMLElement | null>(null);
let { x, y, style } = useDraggable(popup, {
    handle,
    initialValue: {
        x: 50,
        y: 50,
    },
    preventDefault: true,
});

watch([() => props.x, () => props.y], ([newX, newY]) => {
    if (!pinned.value) {
        x.value = newX ?? x.value;
        y.value = newY ?? y.value;
    }
});

let pinned = ref(false);
function pin() {
    pinned.value = !pinned.value;
    if (pinned.value) {
        store.searchPinned = true;
    } else {
        store.searchPinned = false;
    }
    window.getSelection()?.collapseToStart();
}

defineExpose({
    pinned,
});
</script>

<style lang="scss">
#popup-search {
    position: fixed;
    z-index: 1000;
    overflow: hidden;
    border-color: var(--langr-border);
    background-color: var(--langr-surface);
    touch-action: none;
    box-shadow: var(--shadow-s);

    .pop-handle {
        display: flex;
        align-items: center;
        height: 32px;
        padding: 0 var(--langr-space-2) 0 var(--langr-space-3);
        color: var(--text-muted);
        border-bottom: 1px solid var(--langr-border);
        background-color: var(--langr-surface-muted);
        cursor: move;

        &:active {
            cursor: grab;
        }

        .pop-title {
            flex: 1;
            overflow: hidden;
            font-size: 12px;
            font-weight: 700;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .pin-button {
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            width: 24px;
            height: 24px;
            padding: 0;
            color: var(--text-muted);
            border: 1px solid transparent;
            border-radius: var(--langr-radius-sm);
            background: transparent;
            box-shadow: none;

            svg {
                width: 12px;
                height: 12px;
                fill: currentColor;
                transition: transform 160ms ease;
            }

            &:hover {
                color: var(--text-normal);
                border-color: var(--langr-border);
                background-color: var(--background-modifier-hover);
                box-shadow: none;
            }

            &.pinned {
                color: var(--langr-accent);

                svg {
                    transform: rotate(45deg);
                }
            }
        }
    }

    .pop-body {
        width: 450px;
        background: var(--background-secondary);

        #langr-search {
            max-height: 500px;
        }
    }
}

.is-mobile #popup-search {
    .pop-body {
        width: 350px;

        #langr-search {
            max-height: 300px;
        }
    }
}
</style>
