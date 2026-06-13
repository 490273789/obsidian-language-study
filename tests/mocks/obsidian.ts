class Plugin {
    app: unknown;
}

class PluginSettingTab {
    app: unknown;
    plugin: unknown;

    constructor(app: unknown, plugin: unknown) {
        this.app = app;
        this.plugin = plugin;
    }
}

class Setting {
    constructor(public containerEl?: HTMLElement) {}
    setName() {
        return this;
    }
    setDesc() {
        return this;
    }
    addToggle() {
        return this;
    }
    addText() {
        return this;
    }
    addDropdown() {
        return this;
    }
    addButton() {
        return this;
    }
}

class Notice {
    constructor(public message: string) {}
}

class Modal {
    contentEl = document.createElement("div");
    constructor(public app: unknown) {}
    open() {}
    close() {}
}

class Menu {}
class WorkspaceLeaf {}
class MarkdownView {}
class TextFileView {}
class FileView {}
class ItemView {}
class TFile {}

const Platform = {
    isDesktopApp: true,
    isMobile: false,
    isMobileApp: false,
};

function debounce<T extends (...args: never[]) => unknown>(fn: T): T {
    return fn;
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/");
}

function sanitizeHTMLToDom(html: string): DocumentFragment {
    const template = document.createElement("template");
    template.innerHTML = html;
    template.content.querySelectorAll("script").forEach((el) => el.remove());
    template.content.querySelectorAll<HTMLElement>("*").forEach((el) => {
        [...el.attributes].forEach((attr) => {
            if (/^on/i.test(attr.name)) {
                el.removeAttribute(attr.name);
            }
        });
    });
    return template.content;
}

function request(): Promise<string> {
    return Promise.resolve("");
}

function requestUrl(): Promise<{ json: unknown; status: number }> {
    return Promise.resolve({ json: null, status: 200 });
}

function parseYaml(): Record<string, unknown> {
    return {};
}

function stringifyYaml(value: unknown): string {
    return `${JSON.stringify(value)}\n`;
}

function createMoment() {
    return {
        unix: () => Math.floor(Date.now() / 1000),
        subtract: () => createMoment(),
        startOf: () => createMoment(),
        add: () => createMoment(),
        endOf: () => createMoment(),
        format: () => "",
    };
}

const moment = Object.assign(() => createMoment(), {
    utc: () => createMoment(),
    unix: () => createMoment(),
});

export {
    FileView,
    ItemView,
    MarkdownView,
    Menu,
    Modal,
    Notice,
    Platform,
    Plugin,
    PluginSettingTab,
    Setting,
    TFile,
    TextFileView,
    WorkspaceLeaf,
    debounce,
    moment,
    normalizePath,
    parseYaml,
    request,
    requestUrl,
    sanitizeHTMLToDom,
    stringifyYaml,
};
