/**
 * App 内「边缘横滑返回」手势的统一事件。
 *
 * 由桌面壳（desktop-shell）在打开某个 App 时识别左/右边缘向内横滑并派发；
 * 各 App 按自身返回栈逐级处理，处理完把 detail.handled 置 true。
 * 若没有任何 App 处理（或已到顶层），壳层兜底关闭 App 回桌面。
 */
export const APP_BACK_SWIPE_EVENT = "phone-swipe-back";

export type AppBackSwipeDetail = {
  /** 前台 App 图标 id，供同类型多实例（如主聊天 / 迷你聊天窗）区分自己是否为前台 */
  appId: string;
  /** 监听方若已处理本次返回，置为 true，避免壳层兜底关闭 */
  handled: boolean;
};
