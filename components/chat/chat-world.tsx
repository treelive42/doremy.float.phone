"use client";

// 世界隔离（聊天侧）：共用的「当前世界」状态 + 世界切换器。
// 世界数据（卷宗、成员、关系）在 lib/character-world-storage.ts，
// 这里读写的是同一份「当前世界」记忆——角色 App 的画布 tab 切世界后，
// 聊天会话列表与通讯录会通过 CURRENT_WORLD_CHANGED_EVENT 自动跟上，反之亦然。

import { useEffect, useMemo, useState } from "react";
import {
    CHARACTER_WORLDS_UPDATED_EVENT,
    CURRENT_WORLD_CHANGED_EVENT,
    DEFAULT_CHARACTER_WORLD_ID,
    getCharacterWorldGroupId,
    getCurrentWorldId,
    loadCharacterWorldGroups,
    resolveWorldUserIdentity,
    setCharacterWorldUserIdentity,
    setCurrentWorldId,
    type CharacterWorldGroup,
} from "@/lib/character-world-storage";
import { USER_IDENTITIES_UPDATED_EVENT, loadUserIdentities, resolveUserIdentity } from "@/lib/settings-storage";
import type { UserIdentity } from "@/components/settings/user-identity";

export type ChatWorldState = {
    /** 全部世界卷宗 */
    groups: CharacterWorldGroup[];
    /** 当前世界（世界被删除时已回落到默认世界） */
    currentWorldId: string;
    currentGroup: CharacterWorldGroup | null;
    /** 当前世界的角色 id 集合 */
    memberIds: Set<string>;
    /** 是否真的存在多个世界：只有一个世界时不过滤、不显示切换器 */
    isolationActive: boolean;
    selectWorld: (worldId: string) => void;
    /** 该角色是否属于当前世界（未启用隔离时恒为 true） */
    isInCurrentWorld: (characterId?: string | null) => boolean;
    /** 角色所属的卷宗（找不到时为 null） */
    groupOfCharacter: (characterId?: string | null) => CharacterWorldGroup | null;
    /** 角色所属卷宗的名字（找不到时为空串） */
    worldNameOf: (characterId?: string | null) => string;
    /** 这个世界里的「我」（世界绑定的用户身份；未绑定时为全局默认身份） */
    userIdentity: UserIdentity | null;
};

export function useChatWorld(): ChatWorldState {
    const [groups, setGroups] = useState<CharacterWorldGroup[]>(() => loadCharacterWorldGroups());
    const [storedWorldId, setStoredWorldId] = useState<string>(() => getCurrentWorldId());

    useEffect(() => {
        const reloadGroups = () => {
            setGroups(loadCharacterWorldGroups());
            setStoredWorldId(getCurrentWorldId());
        };
        const reloadCurrent = () => setStoredWorldId(getCurrentWorldId());
        window.addEventListener(CHARACTER_WORLDS_UPDATED_EVENT, reloadGroups);
        window.addEventListener(CURRENT_WORLD_CHANGED_EVENT, reloadCurrent);
        return () => {
            window.removeEventListener(CHARACTER_WORLDS_UPDATED_EVENT, reloadGroups);
            window.removeEventListener(CURRENT_WORLD_CHANGED_EVENT, reloadCurrent);
        };
    }, []);

    const isolationActive = groups.length > 1;
    const currentWorldId = groups.some(group => group.id === storedWorldId)
        ? storedWorldId
        : DEFAULT_CHARACTER_WORLD_ID;
    const currentGroup = groups.find(group => group.id === currentWorldId) ?? null;
    const memberIds = useMemo(() => new Set(currentGroup?.memberIds ?? []), [currentGroup]);
    // 这个世界里的「我」：世界改了绑定身份、或身份本身被编辑后都要重算
    const [identityTick, bumpIdentityTick] = useState(0);
    useEffect(() => {
        const refreshIdentity = () => bumpIdentityTick(tick => tick + 1);
        window.addEventListener(USER_IDENTITIES_UPDATED_EVENT, refreshIdentity);
        return () => window.removeEventListener(USER_IDENTITIES_UPDATED_EVENT, refreshIdentity);
    }, []);
    const userIdentity = useMemo(
        () => resolveWorldUserIdentity(currentWorldId),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [currentWorldId, currentGroup?.userIdentityId, identityTick]
    );

    function selectWorld(worldId: string) {
        setStoredWorldId(worldId);
        setCurrentWorldId(worldId);
    }

    function isInCurrentWorld(characterId?: string | null): boolean {
        if (!isolationActive) return true;
        if (!characterId) return false;
        return memberIds.has(characterId);
    }

    function groupOfCharacter(characterId?: string | null): CharacterWorldGroup | null {
        if (!characterId) return null;
        return groups.find(group => group.memberIds.includes(characterId)) ?? null;
    }

    function worldNameOf(characterId?: string | null): string {
        return groupOfCharacter(characterId)?.name ?? "";
    }

    return {
        groups,
        currentWorldId,
        currentGroup,
        memberIds,
        isolationActive,
        selectWorld,
        isInCurrentWorld,
        groupOfCharacter,
        worldNameOf,
        userIdentity,
    };
}

/**
 * 世界 / 「我」快捷切换器：小胶囊 + 选择弹层。
 * 只有一个世界、且只有一个身份时渲染 null（单世界单身份用户不需要这个概念）。
 *
 * 传 characterId 时按「这个角色所属世界」读写身份绑定——在世界 A 的聊天室里
 * 换「我」，不会误改世界 B 的绑定。不传则作用于当前世界。
 */
export function ChatWorldSwitcher({
    state: providedState,
    characterId,
    compact,
}: {
    /** 显式传入的世界状态；不传则自己订阅（聊天室 / 剧情顶栏直接放一个就行） */
    state?: ChatWorldState;
    /** 正在看的角色：按它所属的世界解析、写入「我」的身份绑定 */
    characterId?: string | null;
    /** 紧凑模式：只显示一枚小胶囊，适合塞进聊天室 / 剧情顶栏 */
    compact?: boolean;
}) {
    const hookState = useChatWorld();
    const state = providedState ?? hookState;
    const [open, setOpen] = useState(false);
    // 身份列表：新增 / 改名 / 换头像后要跟着变
    const [identityTick, bumpIdentityTick] = useState(0);
    useEffect(() => {
        const refresh = () => bumpIdentityTick(tick => tick + 1);
        window.addEventListener(USER_IDENTITIES_UPDATED_EVENT, refresh);
        return () => window.removeEventListener(USER_IDENTITIES_UPDATED_EVENT, refresh);
    }, []);
    const identities = useMemo(() => {
        try { return loadUserIdentities(); } catch { return []; }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [identityTick, state.groups]);
    // 身份绑定写在世界卷宗上：优先用角色所属世界，找不到才回落到当前世界
    const targetWorldId = useMemo(
        () => (characterId ? (getCharacterWorldGroupId(characterId) || state.currentWorldId) : state.currentWorldId),
        [characterId, state.currentWorldId, state.groups],
    );
    const targetWorld = state.groups.find(group => group.id === targetWorldId) ?? state.currentGroup;
    const activeIdentity = useMemo(() => {
        try {
            return characterId ? resolveUserIdentity(characterId) : resolveWorldUserIdentity(targetWorldId);
        } catch {
            return null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [characterId, targetWorldId, identityTick, state.groups]);
    const canSwitchWorld = state.isolationActive;
    const canSwitchUser = identities.length > 1;
    if (!canSwitchWorld && !canSwitchUser) return null;
    const worldLabel = targetWorld?.name || "默认世界";
    const userLabel = activeIdentity?.name?.trim() || identities[0]?.name?.trim() || "用户";
    // 紧凑模式只放一个标签，优先显示世界里换人这件事（身份比世界更难从界面看出来）
    const pillLabel = compact
        ? (canSwitchWorld ? `🌐 ${worldLabel}` : `👤 ${userLabel}`)
        : `${canSwitchWorld ? `🌐 ${worldLabel}` : ""}${canSwitchWorld && canSwitchUser ? " · " : ""}${canSwitchUser ? `👤 ${userLabel}` : ""}`;
    const pillTitle = `当前世界：${worldLabel} / 我：${userLabel}（点击切换）`;

    return (
        <>
            {/* 不依赖主题按钮类的显式样式：任何配色/字号下都能看见这个入口 */}
            <button
                type="button"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                    padding: "5px 11px",
                    borderRadius: 999,
                    border: "1px solid var(--c-card-border, rgba(128,128,128,0.35))",
                    background: "color-mix(in srgb, var(--c-action-blue, #246bfd) 12%, transparent)",
                    color: "var(--c-text-title)",
                    fontSize: "calc(13px*var(--app-text-scale, 1))",
                    fontWeight: 600,
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                    // 紧凑模式（聊天室 / 剧情顶栏）收小一点，别把标题挤掉
                    ...(compact ? {
                        maxWidth: 126,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        padding: "4px 9px",
                        fontSize: "calc(11px*var(--app-text-scale, 1))",
                    } : {}),
                }}
                onClick={() => setOpen(true)}
                title={pillTitle}
            >
                {pillLabel}
            </button>

            {open && (
                <div className="modal-overlay" onClick={() => setOpen(false)}>
                    <div className="modal-dialog" onClick={e => e.stopPropagation()}>
                        <span className="modal-header-title">世界 / 我</span>
                        <p className="ts-12 text-[var(--c-text)] opacity-70 mb-3">
                            切换世界只影响「看到哪些人物」，切换「我」决定角色眼里的你是谁。世界的成员归置、关系与世界观描述在角色 App 的「世界卷宗」里编辑。
                        </p>
                        {canSwitchWorld && (
                        <div className="flex flex-col gap-2 w-full max-h-[34vh] overflow-y-auto mb-3">
                            {state.groups.map(group => {
                                const active = group.id === state.currentWorldId;
                                return (
                                    <button
                                        key={group.id}
                                        type="button"
                                        className="flex items-center gap-3 p-3 rounded-lg text-left"
                                        style={{
                                            background: active
                                                ? "color-mix(in srgb, var(--c-action-blue, #246bfd) 14%, transparent)"
                                                : "var(--c-input)",
                                        }}
                                        onClick={() => {
                                            // 不关弹层：换完世界往往还要顺手换「我」
                                            state.selectWorld(group.id);
                                        }}
                                    >
                                        <div className="flex-1 overflow-hidden">
                                            <div className={`ts-15 truncate text-[var(--c-text-title)] ${active ? "font-bold" : "font-medium"}`}>
                                                {active ? "✓ " : ""}{group.name}
                                            </div>
                                            <div className="ts-12 text-[var(--c-icon)] truncate mt-[2px]">
                                                {group.memberIds.length} 位角色
                                                {group.description ? ` · ${group.description.slice(0, 20)}${group.description.length > 20 ? "…" : ""}` : ""}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        )}

                        {canSwitchUser && (
                            <>
                                <div className="ts-12 font-semibold text-[var(--c-text-title)] self-start mb-1">
                                    这个世界的我{targetWorld ? `（${targetWorld.name}）` : ""}
                                </div>
                                <div className="flex flex-col gap-2 w-full max-h-[30vh] overflow-y-auto mb-2">
                                    {identities.map(identity => {
                                        const active = activeIdentity?.id === identity.id;
                                        const facts = [identity.gender, identity.age, identity.occupation]
                                            .filter((value): value is string => Boolean(value && value.trim()))
                                            .join(" · ");
                                        return (
                                            <button
                                                key={identity.id}
                                                type="button"
                                                className="flex items-center gap-3 p-3 rounded-lg text-left"
                                                style={{
                                                    background: active
                                                        ? "color-mix(in srgb, var(--c-action-blue, #246bfd) 14%, transparent)"
                                                        : "var(--c-input)",
                                                }}
                                                onClick={() => {
                                                    setCharacterWorldUserIdentity(targetWorldId, identity.id);
                                                    bumpIdentityTick(tick => tick + 1);
                                                    setOpen(false);
                                                }}
                                            >
                                                <span className="w-[32px] h-[32px] rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-[var(--c-page-body-bg)]">
                                                    {identity.avatarUrl ? (
                                                        <img src={identity.avatarUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="ts-12 font-semibold text-[var(--c-icon)]">
                                                            {(identity.name || "我").slice(0, 1)}
                                                        </span>
                                                    )}
                                                </span>
                                                <div className="flex-1 overflow-hidden">
                                                    <div className={`ts-14 truncate text-[var(--c-text-title)] ${active ? "font-bold" : "font-medium"}`}>
                                                        {active ? "✓ " : ""}{identity.name || "未命名身份"}
                                                    </div>
                                                    <div className="ts-12 text-[var(--c-icon)] truncate mt-[2px]">
                                                        {facts || identity.bio?.slice(0, 20) || "资料未填写"}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="ts-11 text-[var(--c-icon)] mb-3">
                                    换「我」只改这个世界绑定的身份，历史记录里的文字不会重写。若角色或某个 APP 里单独绑定了「我」，以绑定设置为准。
                                </p>
                            </>
                        )}

                        <button className="ui-btn ui-btn-ghost w-full" onClick={() => setOpen(false)}>
                            关闭
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
