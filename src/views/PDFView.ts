import { WorkspaceLeaf, FileView, TFile, Menu } from "obsidian";
import { getLocalFilePrefix, getVaultBasePath } from "@/utils/platform";

export const PDF_FILE_EXTENSION = "pdf";
export const VIEW_TYPE_PDF = "langr-pdf";
export const ICON_EPUB = "pdf";

export class PDFView extends FileView {
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    onPaneMenu(menu: Menu): void {
        // menu.addItem((item) => {
        //     item.setTitle("Create new epub note")
        //         .setIcon("document")
        //         .onClick(async () => {
        //             const fileName = this.getFileName();
        //             let file = this.app.vault.getAbstractFileByPath(fileName);
        //             if (file == null || !(file instanceof TFile)) {
        //                 file = await this.app.vault.create(fileName, this.getFileContent());
        //             }
        //             const fileLeaf = this.app.workspace.createLeafBySplit(this.leaf);
        //             fileLeaf.openFile(file as TFile, {
        //                 active: true
        //             });
        //         });
        // });
        // menu.addSeparator();
        super.onPaneMenu(menu, "");
    }

    getFileName() {
        return this.file?.name ?? "";
    }

    getFileContent() {}

    async onLoadFile(file: TFile): Promise<void> {
        this.contentEl.empty();

        // const contents = await this.app.vault.adapter.readBinary(file.path);
        // console.log(file)

        let basePath = getVaultBasePath(this.app);
        const prefix = getLocalFilePrefix();
        const viewerPath = `${prefix}${basePath}/%2Eobsidian/plugins/obsidian-language-learner/pdf/web/viewer.html`;
        const iframe = this.contentEl.createEl("iframe", { cls: "pdf" });
        iframe.style.height = "100%";
        iframe.style.width = "100%";
        iframe.src = `${viewerPath}?file=${prefix}${basePath}/${encodeURI(file.path)}`;
    }

    onunload(): void {}

    getDisplayText() {
        if (this.file) {
            return this.file.basename;
        } else {
            return "No File";
        }
    }

    canAcceptExtension(extension: string) {
        return extension == PDF_FILE_EXTENSION;
    }

    getViewType() {
        return VIEW_TYPE_PDF;
    }

    getIcon() {
        return "pdf";
    }
}
