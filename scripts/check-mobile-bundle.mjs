import { builtinModules } from "node:module";
import { readFile } from "node:fs/promises";

import ts from "typescript";

const bundleUrl = new URL("../main.js", import.meta.url);
const source = await readFile(bundleUrl, "utf8");
const sourceFile = ts.createSourceFile(
    bundleUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
);
const nodeBuiltins = new Set([
    ...builtinModules,
    ...builtinModules.map((moduleName) => `node:${moduleName}`),
]);
const eagerNodeDependencies = new Set();

function visitEagerCode(node) {
    if (ts.isFunctionLike(node)) {
        return;
    }

    if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require" &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0]) &&
        nodeBuiltins.has(node.arguments[0].text)
    ) {
        eagerNodeDependencies.add(node.arguments[0].text);
    }

    ts.forEachChild(node, visitEagerCode);
}

visitEagerCode(sourceFile);

if (eagerNodeDependencies.size > 0) {
    console.error(
        `Mobile bundle check failed: eager Node dependencies: ${[...eagerNodeDependencies].join(", ")}`
    );
    process.exit(1);
}

console.log("Mobile bundle check passed: no eager Node dependencies");
