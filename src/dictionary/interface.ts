export type DictionaryLookupStatus = "success" | "empty" | "error";

export type DictionaryLookupReceipt<T = unknown> = Readonly<{
    id: string;
    status: DictionaryLookupStatus;
    data?: T;
    error?: string;
}>;

export interface DictionaryAdapter<T = unknown> {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    lookup(word: string): Promise<DictionaryLookupReceipt<T>>;
    translate?(sentence: string): Promise<string>;
}
