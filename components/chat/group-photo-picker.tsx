"use client";

// 「合照锁脸」选择器：挑 2~3 个一起入镜的人（角色 + 「我」），写一句画面描述，
// 直接生成一张多人同框图。锁脸走 image-generation-service 的多参考图能力：
// 第一个角色是主参考，其余角色与「我」作为附加参考图一起提交。

import { useMemo, useState } from "react";
import { loadChatContacts } from "@/lib/chat-storage";
import { loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import { ChatFallbackAvatar } from "./chat-fallback-avatar";
import { useChatWorld } from "./chat-world";
import { hasUserFaceReference } from "@/lib/user-face-reference";

const MAX_SUBJECTS = 3;

const QUICK_PROMPTS = [
    "我们一起拍了一张合照，并肩站着，都在笑",
    "手臂搂在一起自拍，背景是傍晚的街灯",
    "坐在同一张沙发上靠在一起，室内暖光",
];

export function GroupPhotoPickerModal({
    currentCharacterId,
    onSend,
    onClose,
}: {
    /** 当前会话的角色：默认勾上，方便「我和 TA 的合照」一键成图 */
    currentCharacterId?: string;
    onSend: (payload: { description: string; characterIds: string[]; includeUser: boolean }) => void;
    onClose: () => void;
}) {
    const world = useChatWorld();
    const [description, setDescription] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>(() => (currentCharacterId ? [currentCharacterId] : []));
    const [includeUser, setIncludeUser] = useState(() => hasUserFaceReference());
    const [busy, setBusy] = useState(false);

    const contacts = useMemo(() => {
        const contactIds = new Set(loadChatContacts().map(c => c.characterId));
        const chars = loadCharacters();
        return chars
            .filter(c => contactIds.has(c.id))
            // 世界隔离：只能选当前世界的人一起入镜
            .filter(c => world.isInCurrentWorld(c.id))
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }, [world]);

    const userSelfName = world.userIdentity?.name?.trim() || "我";
    const userHasReference = hasUserFaceReference();
    const totalSelected = selectedIds.length + (includeUser ? 1 : 0);
    const canSend = Boolean(description.trim()) && totalSelected > 0 && !busy;

    const toggleCharacter = (id: string) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) return prev.filter(item => item !== id);
            if (prev.length + (includeUser ? 1 : 0) >= MAX_SUBJECTS) return prev;
            return [...prev, id];
        });
    };

    const handleSend = () => {
        if (!canSend) return;
        setBusy(true);
        onSend({
            description: description.trim(),
            characterIds: selectedIds,
            includeUser,
        });
    };

    return (
        <div className="modal-overlay" onClick={busy ? undefined : onClose}>
            <div className="modal-dialog" onClick={e => e.stopPropagation()}>
                <div className="ts-16 font-semibold text-center text-[var(--c-text-title)]">合照锁脸</div>
                <p className="menu-desc text-center">
                    选 2~3 个人一起入镜，会把各自的脸都锁定进画面（最多 {MAX_SUBJECTS} 个）。
                </p>

                {/* 人物选择 */}
                <div className="flex flex-col gap-1 w-full max-h-[34vh] overflow-y-auto">
                    <button
                        type="button"
                        className={`menu-item w-full text-left ${includeUser ? "bg-[var(--c-input)]" : ""}`}
                        onClick={() => {
                            if (includeUser) {
                                setIncludeUser(false);
                                return;
                            }
                            if (selectedIds.length >= MAX_SUBJECTS) return;
                            setIncludeUser(true);
                        }}
                    >
                        <span className="w-[36px] h-[36px] rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-[var(--c-input)]">
                            {world.userIdentity?.avatarUrl ? (
                                <img src={world.userIdentity.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="ts-13 font-semibold text-[var(--c-icon)]">{userSelfName.slice(0, 1)}</span>
                            )}
                        </span>
                        <span className="min-w-0 flex flex-1 flex-col">
                            <span className="menu-label truncate">{userSelfName}（我）</span>
                            <span className="menu-desc truncate">
                                {userHasReference ? "已配置锁脸参考图" : "还没配参考图，到生图设置里上传"}
                            </span>
                        </span>
                        {includeUser && <span className="ts-12 text-[var(--c-action-blue,#246bfd)] font-semibold">已选</span>}
                    </button>

                    {contacts.length === 0 && (
                        <span className="menu-desc py-3 text-center">当前世界还没有可选的联系人</span>
                    )}
                    {contacts.map((char: Character) => {
                        const selected = selectedIds.includes(char.id);
                        return (
                            <button
                                key={char.id}
                                type="button"
                                className={`menu-item w-full text-left ${selected ? "bg-[var(--c-input)]" : ""}`}
                                onClick={() => toggleCharacter(char.id)}
                            >
                                <span className="w-[36px] h-[36px] rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-[var(--c-input)]">
                                    {char.avatar ? (
                                        <img src={char.avatar} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <ChatFallbackAvatar />
                                    )}
                                </span>
                                <span className="min-w-0 flex flex-1 flex-col">
                                    <span className="menu-label truncate">{char.name || "未命名角色"}</span>
                                    <span className="menu-desc truncate">
                                        {char.id === currentCharacterId ? "本会话角色" : "同世界联系人"}
                                    </span>
                                </span>
                                {selected && <span className="ts-12 text-[var(--c-action-blue,#246bfd)] font-semibold">已选</span>}
                            </button>
                        );
                    })}
                </div>

                {/* 画面描述 */}
                <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="描述这张合照：场景、姿势、光线…"
                    className="ui-textarea ui-input-inline w-full min-h-[70px]"
                />
                <div className="flex flex-wrap gap-1.5">
                    {QUICK_PROMPTS.map(prompt => (
                        <button
                            key={prompt}
                            type="button"
                            className="ts-11 px-2 py-1 rounded-full border border-[var(--c-card-border)] text-[var(--c-text)]"
                            onClick={() => setDescription(prompt)}
                        >
                            {prompt.slice(0, 10)}…
                        </button>
                    ))}
                </div>

                <div className="ts-12 text-center text-[var(--c-icon)]">
                    已选 {totalSelected} 人 · 参考图越多，越依赖你的生图接口是否支持多图
                </div>

                <div className="flex gap-3 w-full">
                    <button onClick={onClose} disabled={busy} className="ui-btn ui-btn-ghost ui-btn-bordered-ghost flex-1">取消</button>
                    <button
                        onClick={handleSend}
                        disabled={!canSend}
                        className="ui-btn ui-btn-success flex-1"
                    >{busy ? "生成中…" : "生成合照"}</button>
                </div>
            </div>
        </div>
    );
}
