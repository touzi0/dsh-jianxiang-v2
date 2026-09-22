/**
 * DeepSeek Harness (DSH) 移动端远程控制与网络安全门禁插件
 *
 * 【插件主入口】
 * 本插件为 DSH 提供完整的远程接入与安全治理体系，包括：
 * 1. RSA 2048 端到端传输加密与防中间人窃听；
 * 2. 6 位一次性安全配对码与 365 天长效会话 Token；
 * 3. 自定义高强度长期密码与加盐哈希存储；
 * 4. Tailscale 虚拟私网与局域网 LAN 智能免密直连切换；
 * 5. 防暴力破解限流与单 IP 异常访问熔断审计；
 * 6. 全链路网络上下文虚拟化桥接与 @linxin666 生态无缝兼容。
 * 7. 接入 DSH Settings 服务，配置统一持久化于 ~/.dsh/settings.yaml 的 dsh-remote-mobile 命名空间。
 */
import { type SessionStoreOptions } from './auth/token.js';
/** Cordis 插件名称标识 */
export declare const name = "dsh-remote-mobile";
/** DSH 设置命名空间 */
export declare const REMOTE_MOBILE_SETTINGS_NAMESPACE = "dsh-remote-mobile";
/** Cordis 依赖注入声明：声明注入底座内置的 webServer 服务 */
export declare const inject: string[];
/**
 * 插件生命周期挂载入口函数
 *
 * @param ctx - Cordis 应用上下文
 * @param config - 插件持久化配置选项 (SessionStoreOptions)
 */
export declare function apply(ctx: any, config?: SessionStoreOptions): void;
export * from './auth/tailscale.js';
export * from './auth/token.js';
export * from './auth/gate.js';
export * from './routes/api.js';
export * from './bridge/compat.js';
export * from './styles/style-snippets.js';
