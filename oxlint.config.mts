import { defineConfig } from "oxlint";

export default defineConfig({
    env: {
        browser: true,
        es2022: true,
        node: true,
    },
    globals: {
        app: "readonly",
    },
    ignorePatterns: [
        "node_modules/**",
        ".vite-output/**",
        "main.js",
        "styles.css",
        "pdf/**",
        "*.map",
    ],
    plugins: ["import", "vue"],
    rules: {
        "no-empty-function": "off",
        "no-prototype-builtins": "off",
        "no-unused-vars": [
            "error",
            {
                args: "none",
                caughtErrors: "none",
            },
        ],
    },
});
