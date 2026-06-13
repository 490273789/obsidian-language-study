import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            "@": resolve(rootDir, "src"),
            "@dict": resolve(rootDir, "src/dictionary"),
            "@comp": resolve(rootDir, "src/component"),
            obsidian: resolve(rootDir, "tests/mocks/obsidian.ts"),
        },
    },
    test: {
        environment: "happy-dom",
        include: ["tests/**/*.test.ts"],
        setupFiles: ["tests/setup.ts"],
    },
});
