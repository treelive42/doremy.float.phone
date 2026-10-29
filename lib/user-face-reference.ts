// lib/user-face-reference.ts
// 「我」（用户）的锁脸参考图：与角色参考图共用同一份存储（image 设置里的
// characterReferences），只是用保留 id 作键，因此无需改数据结构、老数据零迁移。
//
// 用法：给用户生成图片时把 characterId 传 USER_FACE_REFERENCE_ID，
// 参考图、脸部选区、人物特征提示词就会像角色一样生效。
//
// 多身份（A 档世界隔离）扩展：
// 每个用户身份（UserIdentity）可以各有一张脸 —— 键是 `__user_self__::<identityId>`。
// 老的 `__user_self__` 继续作为「所有身份的默认脸」使用：
// 某个身份没单独配过图时自动回落到它，所以存量用户完全不用迁移。

import type { ImageGenerationSettings } from "./settings-types";
import { loadImageGenerationSettings, resolveUserIdentity } from "./settings-storage";

/** 用户参考图在 characterReferences 里的保留键（不会和角色 id 冲突） */
export const USER_FACE_REFERENCE_ID = "__user_self__";
/** 按身份分脸的键前缀：`__user_self__::identity-1` */
const USER_FACE_REFERENCE_PREFIX = `${USER_FACE_REFERENCE_ID}::`;

type CharacterReferenceEntry = ImageGenerationSettings["characterReferences"][string];

/** 这个键是不是「我」（用户）的参考图键（含按身份分脸的键） */
export function isUserFaceReferenceId(id?: string | null): boolean {
    if (!id) return false;
    return id === USER_FACE_REFERENCE_ID || id.startsWith(USER_FACE_REFERENCE_PREFIX);
}

/** 某个用户身份对应的参考图键（不传身份 = 老的全局默认键） */
export function userFaceReferenceIdForIdentity(identityId?: string | null): string {
    const id = (identityId ?? "").trim();
    return id ? `${USER_FACE_REFERENCE_PREFIX}${id}` : USER_FACE_REFERENCE_ID;
}

/** 从参考图键反查身份 id（全局默认键返回 null） */
export function identityIdOfUserFaceReference(id?: string | null): string | null {
    if (!id || !id.startsWith(USER_FACE_REFERENCE_PREFIX)) return null;
    return id.slice(USER_FACE_REFERENCE_PREFIX.length) || null;
}

/**
 * 当前该用哪个「我」的参考图键：
 * 优先显式传入的身份 id，否则按角色所属世界解析（世界绑定的「我」→ 默认身份）。
 */
export function resolveUserFaceReferenceId(characterId?: string | null, identityId?: string | null): string {
    const explicit = (identityId ?? "").trim();
    if (explicit) return userFaceReferenceIdForIdentity(explicit);
    try {
        const identity = resolveUserIdentity(characterId ?? undefined);
        return userFaceReferenceIdForIdentity(identity?.id);
    } catch {
        return USER_FACE_REFERENCE_ID;
    }
}

/** 按身份键取条目；该身份没单独配过就回落到全局默认条目 */
function pickUserReferenceEntry(
    settings: ImageGenerationSettings,
    referenceKey: string,
): CharacterReferenceEntry | undefined {
    const refs = settings.characterReferences;
    const own = refs?.[referenceKey];
    if (own && (own.assetId || own.featurePrompt?.trim())) return own;
    if (referenceKey !== USER_FACE_REFERENCE_ID) {
        return refs?.[USER_FACE_REFERENCE_ID] ?? own;
    }
    return own;
}

/**
 * 按「我」的参考图键取条目（含回落）：
 * 生成侧拿到 subjectId 后用它取参考图，不必自己判断身份键还是默认键。
 */
export function getUserFaceReferenceByKey(
    settings: ImageGenerationSettings,
    referenceKey: string,
): CharacterReferenceEntry | undefined {
    return pickUserReferenceEntry(settings, referenceKey);
}

/**
 * 用户参考图条目（未设置时返回 undefined）。
 * 传 characterId 时按该角色所属世界的「我」取脸；不传时用默认身份 / 全局默认键。
 */
export function getUserFaceReference(settings?: ImageGenerationSettings, characterId?: string | null) {
    const source = settings ?? loadImageGenerationSettings();
    return pickUserReferenceEntry(source, resolveUserFaceReferenceId(characterId));
}

/** 是否已上传用户参考图（且未被关闭） */
export function hasUserFaceReference(characterId?: string | null): boolean {
    try {
        const ref = getUserFaceReference(undefined, characterId);
        return Boolean(ref?.assetId) && ref?.enabled !== false;
    } catch {
        return false;
    }
}

/** 任意一个「我」的参考图/特征是否配置过（用于设置页列表展示与合照勾选） */
export function hasAnyUserFaceReference(): boolean {
    try {
        const refs = loadImageGenerationSettings().characterReferences;
        if (!refs) return false;
        return Object.entries(refs).some(([key, entry]) =>
            isUserFaceReferenceId(key)
            && entry?.enabled !== false
            && Boolean(entry?.assetId || entry?.featurePrompt?.trim())
        );
    } catch {
        return false;
    }
}

/** 用户的「固定外观特征」提示词（会自动追加到含用户的生图提示词里） */
export function getUserFaceFeaturePrompt(characterId?: string | null): string {
    try {
        const ref = getUserFaceReference(undefined, characterId);
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
export function withUserFacePrompt(description: string, force = false, characterId?: string | null): string {
    const feature = getUserFaceFeaturePrompt(characterId);
    if (!feature) return description;
    if (!force && !/(我|自己|用户|自拍|合照)/.test(description)) return description;
    if (description.includes("【用户固定外观】")) return description;
    return `${description}\n\n【用户固定外观】${feature}`;
}
