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
    getCurrentWorldId,
    loadCharacterWorldGroups,
    resolveWorldUserIdentity,
    setCurrentWorldId,
    type CharacterWorldGroup,
} from "@/lib/character-world-storage";
import { USER_IDENTITIES_UPDATED_EVENT } from "@/lib/settings-storage";
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
 * 世界切换器：小胶囊 + 选择弹层。
 * 只有一个世界时渲染 null（单世界用户不需要这个概念）。
 */
export function ChatWorldSwitcher({ state }: { state: ChatWorldState }) {
    const [open, setOpen] = useState(false);
    if (!state.isolationActive) return null;

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
                }}
                onClick={() => setOpen(true)}
                title="切换世界：只显示该世界下的人物"
            >
                🌐 {state.currentGroup?.name || "默认世界"}
            </button>

            {open && (
                <div className="modal-overlay" onClick={() => setOpen(false)}>
                    <div className="modal-dialog" onClick={e => e.stopPropagation()}>
                        <span className="modal-header-title">切换世界</span>
                        <p className="ts-12 text-[var(--c-text)] opacity-70 mb-3">
                            切到哪份卷宗，聊天与通讯录就只显示那个世界的人物。世界的成员归置、关系与世界观描述在角色 App 的「世界卷宗」里编辑。
                        </p>
                        <div className="flex flex-col gap-2 w-full max-h-[45vh] overflow-y-auto mb-3">
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
                                            state.selectWorld(group.id);
                                            setOpen(false);
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
                        <button className="ui-btn ui-btn-ghost w-full" onClick={() => setOpen(false)}>
                            关闭
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
