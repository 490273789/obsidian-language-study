import { inject, type App, type InjectionKey } from "vue";
import type LanguageLearner from "@/plugin";

type ViewContext = object;

const pluginKey: InjectionKey<LanguageLearner> = Symbol("language-learner-plugin");
const viewKey: InjectionKey<ViewContext> = Symbol("language-learner-view");

function providePlugin(app: App, plugin: LanguageLearner): void {
    app.provide(pluginKey, plugin);
}

function provideView<T extends ViewContext>(app: App, view: T): void {
    app.provide(viewKey, view);
}

function usePlugin(): LanguageLearner {
    const plugin = inject(pluginKey);
    if (!plugin) {
        throw new Error("Language Learner plugin context is not available");
    }
    return plugin;
}

function useView<T extends ViewContext>(): T {
    const view = inject(viewKey);
    if (!view) {
        throw new Error("Language Learner view context is not available");
    }
    return view as T;
}

export { providePlugin, provideView, usePlugin, useView };
