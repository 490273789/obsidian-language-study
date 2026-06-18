<template>
    <div id="langr-stat" class="langr-shell">
        <section class="stat-card langr-card">
            <header class="stat-header">
                <div>
                    <div class="stat-title">{{ t("Statistics") }}</div>
                    <div class="langr-subtle">7 days</div>
                </div>
            </header>
            <div id="chart"></div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { t } from "@/lang/helper";
import { moment } from "@/utils/moment";
import { usePlugin, useView } from "@/ui/context";

import * as echarts from "echarts/core";

import {
    GridComponent,
    GridComponentOption,
    TooltipComponent,
    TooltipComponentOption,
    TitleComponent,
    TitleComponentOption,
} from "echarts/components";
import { LineChart, LineSeriesOption } from "echarts/charts";
import { UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
    GridComponent,
    LineChart,
    TooltipComponent,
    TitleComponent,
    CanvasRenderer,
    UniversalTransition,
]);

type EChartsOption = echarts.ComposeOption<
    GridComponentOption | LineSeriesOption | TooltipComponentOption | TitleComponentOption
>;

const plugin = usePlugin();
const { container } = useView<{ container: HTMLElement }>();

let charDom: HTMLElement;
let sevenDays: echarts.EChartsType;
let option: EChartsOption;

onMounted(async () => {
    const chartElement = container.querySelector<HTMLElement>("#chart");
    if (!chartElement) {
        return;
    }
    charDom = chartElement;
    // setTimeout(() => {
    sevenDays = echarts.init(charDom, null, {
        width: Math.max(360, charDom.clientWidth || 400),
        height: 350,
    });
    if (option) {
        sevenDays.setOption(option);
    }
    // },0)
    updateChart();
});

const last7days = [6, 5, 4, 3, 2, 1, 0].map((i) => moment().subtract(i, "days").format("M-D"));

option = {
    title: {
        text: "Words",
    },
    tooltip: {
        trigger: "axis",
    },
    xAxis: {
        type: "category",
        boundaryGap: false,
        data: last7days,
    },
    yAxis: {
        type: "value",
    },
    series: [
        {
            name: t("Day Ignore"),
            data: [],
            type: "line",
            areaStyle: {},
            smooth: true,
            // encode: {
            //   tooltip: ["words"]
            // },
            emphasis: {
                focus: "series",
            },
            stack: "single",
        },
        {
            name: t("Day Non-Ignore"),
            data: [],
            type: "line",
            areaStyle: {},
            smooth: true,
            // encode: {
            //   tooltip: ["words"]
            // },
            emphasis: {
                focus: "series",
            },
            stack: "single",
        },
        {
            name: t("Accumulated"),
            data: [],
            type: "line",
            smooth: true,
            emphasis: {
                focus: "series",
            },
        },
    ],
};

async function updateChart() {
    let data = await plugin.db.countSeven();
    let dayIgnoreWords = data.map((d) => d.today[0]);
    let dayNoIgnoreWords = data.map((d) => d.today.slice(1).reduce((a, b) => a + b));
    let accumAllWords = data.map((d) => d.accumulated.reduce((a, b) => a + b));

    sevenDays.setOption({
        series: [{ data: dayIgnoreWords }, { data: dayNoIgnoreWords }, { data: accumAllWords }],
    });
}

onMounted(() => {
    addEventListener("obsidian-langr-refresh-stat", updateChart);
});

onUnmounted(() => {
    removeEventListener("obsidian-langr-refresh-stat", updateChart);
});
</script>

<style lang="scss">
#langr-stat {
    overflow: auto;
    padding: var(--langr-space-3);
    background: var(--background-secondary);

    .stat-card {
        overflow: hidden;
        min-height: 420px;
    }

    .stat-header {
        padding: var(--langr-space-3) var(--langr-space-4);
        border-bottom: 1px solid var(--langr-border);
    }

    .stat-title {
        font-size: 14px;
        font-weight: 700;
    }

    #chart {
        width: 100%;
        min-height: 350px;
        padding: var(--langr-space-3);
    }
}
</style>
