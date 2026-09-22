/**
 * 移动端样式片段注册表 (Mobile Style Snippets Store)
 *
 * 【设计职责】
 * 本模块是插件内部的「样式小插件」体系：把 DSH Web 界面的样式适配拆分成
 * 一个个可独立启停的 CSS 片段（Snippet）。
 *
 * - 内置预设片段（Builtin Presets）：随插件分发，按界面区域划分为三份——
 *   侧边栏（preset-sidebar）、设置面板（preset-settings）、正文（preset-main）；
 * - 用户自定义片段（Custom Snippets）：通过设置面板或 API 动态增删改，持久化于
 *   ~/.dsh/remote-mobile/style-snippets.json，无需修改插件代码、无需重启；
 * - 每个片段（含内置预设）支持【PC 端 / 移动端】分别启停，且按【视口宽度】判定而非设备 UA：
 *   mobileEnabled → 包装 @media (max-width: 900px)，窄视口生效（PC 拉小窗口同样生效）；
 *   pcEnabled     → 包装 @media (min-width: 901px)，宽视口生效；两端都开 → 全宽度原样生效。
 *
 * 注入发生在网关层响应拦截（见 bridge/compat.ts 的 patchHttpServerWithVirtualizer），
 * 对主工作区 index.html 与 /auth 登录页统一生效。
 */
/** 用户自定义样式片段持久化文件 */
export declare const DEFAULT_STYLE_FILE: string;
/** 移动端 User-Agent 识别正则 */
export declare const MOBILE_UA_REGEX: RegExp;
/** 单片段 CSS 长度上限（防配置膨胀） */
export declare const MAX_CSS_LENGTH = 200000;
/** 片段名称长度上限 */
export declare const MAX_NAME_LENGTH = 80;
/** 内置预设 id 保留前缀（自定义片段不得占用） */
export declare const BUILTIN_ID_PREFIX = "preset-";
export interface StyleSnippet {
    /** 稳定唯一 id（内置片段为 preset-xxx，自定义片段为 custom-xxx） */
    id: string;
    /** 片段名称（list(lang) 按语言本地化；自定义片段为用户填写原文） */
    name: string;
    /** 可选说明文案 */
    description?: string;
    /** CSS 代码片段本体 */
    css: string;
    /** 桌面端（PC 浏览器）是否注入 */
    pcEnabled: boolean;
    /** 移动端（手机/平板浏览器）是否注入 */
    mobileEnabled: boolean;
    /** 是否为内置预设（内置不可删除，仅可启停） */
    builtin?: boolean;
    createdAt?: number;
    updatedAt?: number;
}
export interface BuiltinStylePreset {
    id: string;
    name: {
        zh: string;
        en: string;
    };
    description: {
        zh: string;
        en: string;
    };
    css: string;
    /** 桌面端默认启停（默认 false：预设主要面向移动端） */
    defaultPcEnabled?: boolean;
    /** 移动端默认启停（默认 true） */
    defaultMobileEnabled?: boolean;
}
export interface UpsertStyleInput {
    id?: string;
    name: string;
    description?: string;
    css: string;
    pcEnabled?: boolean;
    mobileEnabled?: boolean;
}
/**
 * 内置官方预设：按界面区域划分的三段预设。
 * 默认【移动端启用（≤900px 窄视口）、PC 关闭（>900px 宽视口）】——预设面向窄屏优化，宽屏按需开启。
 */
export declare const BUILTIN_PRESETS: BuiltinStylePreset[];
/** 持久化文件的结构版本（v2：双端开关 presetStates + custom.pcEnabled/mobileEnabled） */
export declare const STORE_VERSION = 2;
/** 判断请求是否来自移动端浏览器 */
export declare function isMobileUserAgent(ua?: string): boolean;
/** 给 <html> 打上 data-dsh-mobile 标记（幂等） */
export declare function applyDataMobileAttr(html: string): string;
/** 把收集到的 CSS 包装成 <style> 注入标签（空内容返回空串） */
export declare function buildMobileStyleTag(css: string): string;
/** 内置预设某 id 的启停状态。
 * 落盘时按「三个预设分组齐全」写出：每组两条字段齐全（用户覆盖 ?? 代码默认值），
 * 不再只写被操作过的端；内存与读取端允许字段缺省（回落预设默认值）。 */
export interface PresetState {
    pc?: boolean;
    mobile?: boolean;
}
/**
 * 样式片段存储：内置预设 + 用户自定义的启停状态与内容管理。
 * 采用防抖 + 原子写盘，与 SessionStore 的持久化策略保持一致。
 */
export declare class StyleSnippetStore {
    private filePath;
    private presetStates;
    private custom;
    private customOrder;
    private persistTimer;
    private dirty;
    constructor(filePath?: string);
    /** 文件路径（用于界面展示） */
    get persistPath(): string;
    /** 读取持久化文件（自动迁移 v1 → v2 双端开关格式） */
    load(): void;
    /** 触发防抖持久化 */
    private schedulePersist;
    /** 立即落盘（进程退出前也会被调用） */
    flushPersistedData(): void;
    /** 全部片段：内置预设（按注册序）+ 自定义片段（按 customOrder）。lang 决定内置预设名称/描述的本地化。 */
    list(lang?: 'zh' | 'en'): StyleSnippet[];
    /** 按 id 获取片段（内置或自定义） */
    get(id: string, lang?: 'zh' | 'en'): StyleSnippet | undefined;
    /**
     * 按端启停任意片段（内置与自定义均可）。
     * @param scope - pc：桌面端开关；mobile：移动端开关
     */
    setEnabled(id: string, scope: 'pc' | 'mobile', enabled: boolean): boolean;
    /** 重置所有片段的启停状态：内置恢复各自默认（移动端开/PC 关），自定义恢复为移动端开/PC 关 */
    resetEnabled(): void;
    /** 新增或更新一个自定义片段 */
    upsertCustom(input: UpsertStyleInput): StyleSnippet;
    /** 删除一个用户自定义片段（内置预设不可删除） */
    removeCustom(id: string): boolean;
    /**
     * 收集最终注入的 CSS（与设备 UA 无关，按视口宽度档生效）：
     * - mobileEnabled && !pcEnabled → 包 @media (max-width: 900px)，窄视口（≤900px）生效；
     * - pcEnabled && !mobileEnabled → 包 @media (min-width: 901px)，宽视口（>900px）生效；
     * - 两端都开 → 原样注入，全宽度生效。
     */
    collectCss(): string;
}
