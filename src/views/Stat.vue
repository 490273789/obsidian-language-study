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

function readCssVar(name: string, fallback: string): string {
    if (typeof window === "undefined") {
        return fallback;
    }

    return window.getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
}

function makeChartTheme(): EChartsOption {
    const accent = readCssVar("--langr-accent", "#00a8d7");
    const hot = readCssVar("--langr-accent-hot", "#e64bbd");
    const warm = readCssVar("--langr-accent-warm", "#c78618");
    const text = readCssVar("--text-normal", "#172126");
    const muted = readCssVar("--text-muted", "#5d6870");
    const grid = readCssVar("--langr-border-strong", "#7ccfe2");
    const surface = readCssVar("--langr-surface-raised", "#f8feff");

    return {
        color: [muted, accent, hot],
        title: {
            textStyle: {
                color: accent,
                fontWeight: 700,
            },
        },
        tooltip: {
            backgroundColor: surface,
            borderColor: accent,
            textStyle: {
                color: text,
            },
        },
        xAxis: {
            axisLine: {
                lineStyle: {
                    color: grid,
                },
            },
            axisLabel: {
                color: muted,
            },
        },
        yAxis: {
            splitLine: {
                lineStyle: {
                    color: grid,
                    opacity: 0.28,
                },
            },
            axisLabel: {
                color: muted,
            },
        },
        series: [
            {
                lineStyle: {
                    color: muted,
                },
                areaStyle: {
                    color: "rgba(128, 128, 128, 0.12)",
                },
            },
            {
                lineStyle: {
                    color: accent,
                },
                areaStyle: {
                    color: "rgba(0, 168, 215, 0.14)",
                },
            },
            {
                lineStyle: {
                    color: hot,
                },
                itemStyle: {
                    color: warm,
                },
            },
        ],
    };
}

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
    sevenDays.setOption(makeChartTheme());
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
    background: transparent;

    .stat-card {
        overflow: hidden;
        min-height: 420px;
        border-color: var(--langr-border-neon);
        box-shadow: var(--langr-shadow-strong);
    }

    .stat-header {
        padding: var(--langr-space-3) var(--langr-space-4);
        border-bottom: 1px solid var(--langr-border-strong);
        background:
            linear-gradient(
                90deg,
                color-mix(in srgb, var(--langr-accent) 12%, transparent),
                transparent 42%
            ),
            var(--langr-surface-glass);
    }

    .stat-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--langr-accent);
        text-transform: uppercase;
    }

    #chart {
        width: 100%;
        min-height: 350px;
        padding: var(--langr-space-3);
    }
}
</style>
