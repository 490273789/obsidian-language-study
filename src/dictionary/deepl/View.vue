<template>
    <div id="deepl">
        <p class="origin" v-if="word">
            <strong>原文: </strong>
            {{ word }}
        </p>
        <p class="trans">
            <strong>结果: </strong>
            {{ resultText }}
        </p>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
    word?: string;
    result?: string | null;
}>();

const resultText = computed(() => props.result ?? "");
</script>

<style lang="scss">
#deepl {
    p {
        margin-top: 2px;
        margin-bottom: 4px;
    }
}
</style>
