import { defineConfig } from "oxfmt";

export default defineConfig({
    bracketSpacing: true,
    ignorePatterns: [
        "node_modules/**",
        ".vite-output/**",
        "main.js",
        "styles.css",
        "pdf/**",
        "*.map",
    ],
    printWidth: 100,
    semi: true,
    singleQuote: false,
    sortPackageJson: false,
    tabWidth: 4,
    trailingComma: "es5",
    useTabs: false,
});
