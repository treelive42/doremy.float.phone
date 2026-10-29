// lib/user-face-reference.ts
// 「我」（用户）的锁脸参考图：与角色参考图共用同一份存储（image 设置里的
// characterReferences），只是用一个保留 id 作键，因此无需改数据结构、老数据零迁移。
//
// 用法：给用户生成图片时把 characterId 传 USER_FACE_REFERENCE_ID，
// 参考图、脸部选区、人物特征提示词就会像角色一样生效。

import type { ImageGenerationSettings } from "./settings-types";
import { loadImageGenerationSettings } from "./settings-storage";

/** 用户参考图在 characterReferences 里的保留键（不会和角色 id 冲突） */
export const USER_FACE_REFERENCE_ID = "__user_self__";

/** 用户参考图条目（未设置时返回 undefined） */
export function getUserFaceReference(settings?: ImageGenerationSettings) {
    const source = settings ?? loadImageGenerationSettings();
    return source.characterReferences?.[USER_FACE_REFERENCE_ID];
}

/** 是否已上传用户参考图（且未被关闭） */
export function hasUserFaceReference(): boolean {
    try {
        const ref = getUserFaceReference();
        return Boolean(ref?.assetId) && ref?.enabled !== false;
    } catch {
        return false;
    }
}

/** 用户的「固定外观特征」提示词（会自动追加到含用户的生图提示词里） */
export function getUserFaceFeaturePrompt(): string {
    try {
        const ref = getUserFaceReference();
        if (!ref || ref.enabled === false) return "";
        return ref.featurePrompt?.trim() || "";
    } catch {
        return "";
    }
}

/**
 * 把用户的外观特征拼进提示词：
 * 描述里出现「我 / 用户 / 自拍」这类指向用户的词，或显式要求时追加上。
 */
export function withUserFacePrompt(description: string, force = false): string {
    const feature = getUserFaceFeaturePrompt();
    if (!feature) return description;
    if (!force && !/(我|自己|用户|自拍|合照)/.test(description)) return description;
    if (description.includes("【用户固定外观】")) return description;
    return `${description}\n\n【用户固定外观】${feature}`;
}
