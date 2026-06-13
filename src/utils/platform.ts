import { App, normalizePath, Platform } from "obsidian";

type AdapterWithBasePath = {
    basePath?: string;
};

type ElectronRequire = {
    (module: "electron"): {
        ipcRenderer?: {
            sendSync(channel: string): string;
        };
    };
};

declare const require: ElectronRequire | undefined;

function getVaultBasePath(app: App): string {
    const adapter = app.vault.adapter as unknown as AdapterWithBasePath;
    return adapter.basePath ? normalizePath(adapter.basePath) : "";
}

function getLocalFilePrefix(): string {
    if (!Platform.isDesktopApp) {
        return "http://localhost/_capacitor_file_";
    }

    try {
        if (typeof require === "function") {
            return require("electron").ipcRenderer?.sendSync("file-url") ?? "app://local/";
        }
    } catch {
        // Fall through to Obsidian desktop's stable local file URL prefix.
    }
    return "app://local/";
}

function resolveLocalResourcePath(source: string, basePath: string): string {
    if (!source) {
        return "";
    }
    if (/^(https?:|app:\/\/|file:\/\/)/.test(source)) {
        return source;
    }

    const prefix = getLocalFilePrefix();
    if (source.startsWith("~/")) {
        return `${prefix}${basePath}${source.slice(1)}`;
    }
    return `${prefix}${source}`;
}

export { getLocalFilePrefix, getVaultBasePath, resolveLocalResourcePath };
