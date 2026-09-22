import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
export declare const AUTH_COOKIE_NAME = "dsh_mobile_token";
export declare const DEFAULT_PERSIST_FILE: string;
export declare const GLOBAL_SETTINGS_FILE: string;
/**
 * 从 ~/.dsh/settings.yaml 中安全读取 dsh-remote-mobile 命名空间的最新配置
 */
export declare function readFromSettingsYaml(filePath?: string): Partial<SessionStoreOptions>;
/**
 * 从 ~/.dsh/settings.yaml 中读取全局语言偏好 (locale.preference)
 */
export declare function readGlobalLocale(filePath?: string): 'zh' | 'en';
/**
 * 将最新的插件配置安全原子写回 ~/.dsh/settings.yaml 中的 dsh-remote-mobile 命名空间
 */
export declare function writeBackToSettingsYaml(options: SessionStoreOptions, filePath?: string): boolean;
export interface SessionRecord {
    token: string;
    createdAt: number;
    lastSeenAt: number;
    ip?: string;
    deviceName?: string;
    userAgent?: string;
    authType?: string;
    isBypass?: boolean;
}
export interface ShortCodeRecord {
    code: string;
    token: string;
    createdAt: number;
    expiresAt: number;
}
export interface IpSecurityStat {
    ip: string;
    authVisits: number;
    authVisitsInWindow: number;
    windowStart: number;
    failedAttempts: number;
    totalAttempts: number;
    lockedUntil: number;
    lastAttemptAt: number;
    lastSeenAt: number;
    authType?: string;
    deviceName?: string;
    userAgent?: string;
}
export interface SessionStoreOptions {
    allowTailscale?: boolean;
    allowLan?: boolean;
    secret?: string;
    secretHash?: string;
    devicesFile?: string;
    maxFailedAttempts?: number;
    lockDurationMs?: number;
    maxVisitsPerMinute?: number;
}
/**
 * 将 User-Agent 字符串解析为人类友好的设备名称
 */
export declare function parseDeviceName(ua?: string): string;
export declare class SessionStore extends EventEmitter {
    private sessions;
    private shortCodes;
    private ipStats;
    private options;
    private settingsMutator?;
    private debounceTimer;
    readonly persistPath: string;
    readonly settingsFilePath: string | null;
    constructor(options?: SessionStoreOptions);
    getOptions(): Required<SessionStoreOptions>;
    hasSecret(): boolean;
    setSettingsMutator(mutator: (patch: Partial<SessionStoreOptions>) => void): void;
    updateOptions(newOpts: Partial<SessionStoreOptions>, syncToSettings?: boolean): void;
    /**
     * 记录 IP 打开 /auth 页面的计数并进行限频判定与设备指纹解析
     */
    recordAuthVisit(ip: string, userAgent?: string): {
        allowed: boolean;
        lockedUntil?: number;
        reason?: string;
    };
    /**
     * 检查 IP 是否被防暴力破解锁定
     */
    isIpLocked(ip: string): {
        locked: boolean;
        lockedUntil?: number;
        remainingSeconds?: number;
    };
    /**
     * 获取所有 IP 的安全审计统计数据
     */
    getIpSecurityStats(): IpSecurityStat[];
    /**
     * 管理员手动解锁某个 IP
     */
    unlockIp(ip: string): boolean;
    generateShortCode(): {
        code: string;
        token: string;
        expiresAt: number;
    };
    verify(credential: string, userAgent?: string, clientIp?: string): {
        success: boolean;
        token?: string;
        reason?: string;
        locked?: boolean;
        remainingSeconds?: number;
    };
    private handleFailedAttempt;
    validateToken(token: string, clientIp?: string): boolean;
    extractTokenFromRequest(req: IncomingMessage): string | null;
    /**
     * 自动登记并归因免密直连设备（Tailscale / LAN）
     */
    registerBypassDevice(ip: string, userAgent: string | undefined, type: 'Tailscale' | 'LAN'): SessionRecord;
    getSessionsList(): {
        count: number;
        devices: Array<Omit<SessionRecord, 'userAgent'>>;
    };
    revokeDevice(token: string): boolean;
    revokeAllSessions(): void;
    /**
     * 清空所有 IP 安全审计与防暴破统计记录
     */
    clearAllIpSecurityStats(): void;
    loadPersistedData(): void;
    /**
     * 同步立即持久化落盘（由关键路径调用：配对成功、密码认证、撤销设备、手动改密/配置等）
     */
    savePersistedData(): void;
    /**
     * 500ms 防抖持久化落盘（由高频访问路径调用：每次打开 /auth、validateToken 重连时间戳更新等）
     */
    savePersistedDataDebounced(): void;
    /**
     * 立即执行待写的持久化数据落盘并清理定时器
     */
    flushPersistedData(): void;
}
