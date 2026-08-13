import { copyFile, rm } from "node:fs/promises";
import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const outDir = resolve(rootDir, ".vite-output");
const nodeBuiltins = new Set([
    ...builtinModules,
    ...builtinModules.map((moduleName) => `node:${moduleName}`),
]);

function isExternal(id: string) {
    return (
        id === "obsidian" ||
        id === "electron" ||
        id.startsWith("@codemirror/") ||
        nodeBuiltins.has(id)
    );
}

function obsidianOutputPlugin() {
    return {
        name: "obsidian-output",
        async closeBundle() {
            await Promise.all(
                ["main.js", "styles.css"].map((fileName) =>
                    copyFile(resolve(outDir, fileName), resolve(rootDir, fileName))
                )
            );
            await rm(outDir, { recursive: true, force: true });
        },
    };
}

export default defineConfig(({ mode }) => ({
    plugins: [vue(), obsidianOutputPlugin()],
    resolve: {
        alias: {
            "@": resolve(rootDir, "src"),
            "@dict": resolve(rootDir, "src/dictionary"),
            "@comp": resolve(rootDir, "src/component"),
        },
    },
    build: {
        lib: {
            entry: resolve(rootDir, "src/plugin.ts"),
            formats: ["cjs"],
            fileName: () => "main.js",
            cssFileName: "styles",
        },
        outDir,
        emptyOutDir: true,
        copyPublicDir: false,
        cssCodeSplit: false,
        sourcemap: mode === "production" ? false : "inline",
        minify: mode === "production" ? "oxc" : false,
        target: "es2018",
        rolldownOptions: {
            checks: {
                invalidAnnotation: false,
            },
            external: isExternal,
            treeshake: {
                annotations: false,
            },
            output: {
                codeSplitting: false,
                exports: "default",
            },
        },
    },
}));
