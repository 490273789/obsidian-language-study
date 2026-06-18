<template>
    <div class="count-bar" @click="changeUnit">
        <div class="b1" :style="styleA">
            {{ percent(props.unknown) }}
        </div>
        <div class="b2" :style="styleB">
            {{ percent(props.learn) }}
            <!-- {{props.learn}} -->
        </div>
        <div class="b3" :style="styleC">
            {{ percent(props.ignore) }}
            <!-- {{props.ignore}} -->
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
const props = withDefaults(
    defineProps<{
        unknown?: number;
        learn?: number;
        ignore?: number;
    }>(),
    {
        unknown: 0,
        learn: 0,
        ignore: 0,
    }
);

let isPercent = ref(true);

function percent(num: number) {
    if (!isPercent.value) {
        return num;
    }
    let total = props.unknown + props.learn + props.ignore;
    if (total === 0) {
        return "0%";
    }
    let res = num / total;
    return ((Math.round(res * 1000) * 100) / 1000).toString() + "%";
}

function changeUnit() {
    isPercent.value = !isPercent.value;
}
// let a = ref(10)p
// let b = ref(10)
// let c = ref(50)
let styleA = computed(() => {
    return { flex: props.unknown };
});
let styleB = computed(() => {
    return { flex: props.learn };
});
let styleC = computed(() => {
    return { flex: props.ignore };
});
</script>

<style lang="scss">
/*计数条*/
.count-bar {
    overflow: hidden;
    border: 1px solid var(--langr-border-strong);
    height: 18px;
    width: 100%;
    min-width: 160px;
    display: flex;
    text-align: center;
    color: var(--text-normal);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    line-height: 18px;
    border-radius: 999px;
    background: var(--langr-surface-inset);
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--background-primary) 72%, transparent);

    .b1 {
        min-width: fit-content;
        padding: 0 6px;
        background-color: var(--langr-status-new-bg);
        box-shadow: inset -1px 0 0 color-mix(in srgb, var(--langr-border-strong) 70%, transparent);
    }

    .b2 {
        min-width: fit-content;
        padding: 0 6px;
        background-color: var(--langr-status-learning-bg);
        box-shadow: inset -1px 0 0 color-mix(in srgb, var(--langr-border-strong) 70%, transparent);
    }

    .b3 {
        min-width: fit-content;
        padding: 0 6px;
        background-color: var(--langr-status-ignore-bg);
    }
}
</style>
