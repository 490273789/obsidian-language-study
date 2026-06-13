<template>
    <div id="deepl">
        <p class="origin">
            <strong>原文: </strong>
            {{ word }}
        </p>
        <p class="trans">
            <strong>结果: </strong>
            {{ result }}
        </p>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useLoading } from "@dict/uses";
import { search } from "./engine";
import { usePlugin } from "@/ui/context";

const plugin = usePlugin();

const props = defineProps<{
    word: string;
}>();
const emits = defineEmits<{
    (event: "loading", status: { id: string; loading: boolean; result: boolean }): void;
}>();

let result = ref("");

async function onSearch(): Promise<boolean> {
    let res = await search(props.word, plugin.settings.foreign);
    if (!res) return false;

    result.value = res;
    return true;
}

useLoading(() => props.word, "deepl", onSearch, emits);
</script>

<style lang="scss">
#deepl {
    p {
        margin-top: 2px;
        margin-bottom: 4px;
    }
}
</style>
