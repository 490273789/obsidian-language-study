import { moment as obsidianMoment } from "obsidian";

type MomentLike = {
    add(value: number, unit: string): MomentLike;
    endOf(unit: string): MomentLike;
    format(format: string): string;
    startOf(unit: string): MomentLike;
    subtract(value: number, unit: string): MomentLike;
    unix(): number;
};

type MomentFactory = {
    (): MomentLike;
    unix(timestamp: number): MomentLike;
    utc(input?: unknown): MomentLike;
};

export const moment = obsidianMoment as unknown as MomentFactory;
