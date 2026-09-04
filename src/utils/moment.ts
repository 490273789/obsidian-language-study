import { moment as obsidianMoment } from "obsidian";

type MomentLike = {
    add(value: number, unit: string): MomentLike;
    endOf(unit: string): MomentLike;
    format(format: string): string;
    startOf(unit: string): MomentLike;
    subtract(value: number, unit: string): MomentLike;
    unix(): number;
    valueOf(): number;
};

type MomentFactory = {
    (input?: unknown): MomentLike;
    unix(timestamp: number): MomentLike;
    utc(input?: unknown): MomentLike;
};

export type { MomentLike, MomentFactory };
export const moment = obsidianMoment as unknown as MomentFactory;
