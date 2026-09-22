import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionStore } from './token.js';
/**
 * 判断请求是否来自本机回环
 */
export declare function isLoopbackRequest(req: IncomingMessage): boolean;
/**
 * 判断请求是否携带浏览器跨站信号（用于回环 CSRF / drive-by 防御）。
 *
 * Origin 与 Sec-Fetch-Site 由浏览器强制填写，页面脚本无法伪造或隐藏；
 * 恶意网页驱使浏览器向本机回环发起的写请求必然携带这些信号。
 * 不带这些头的客户端（curl / 本机脚本 / 旧内核 WebView）不受影响，保持向后兼容。
 *
 * 说明（有意取舍，非缺陷）：
 * - 仅比较 host:port，不比较 scheme：插件主要运行于 HTTP 局域网/回环场景，
 *   同 host:port 下出现 HTTPS 恶意来源的现实可能性极低；
 * - 无 Origin 时仅将 Sec-Fetch-Site: cross-site 判为跨站，same-site 不拦截：
 *   回环场景无域名层级概念，子域场景不适用；收紧为「非 same-origin 即拦截」
 *   会误伤不发送这些头的旧内核 WebView，与向后兼容目标冲突。
 */
export declare function hasCrossSiteSignal(req: IncomingMessage): boolean;
/**
 * 判断是否为无需鉴权的公开静态/登录路径
 */
export declare function isPublicPath(url?: string): boolean;
/**
 * 构造全局 HTTP & WebSocket 门禁拦截处理器
 */
export declare function createGlobalAuthGate(store: SessionStore): (req: IncomingMessage, res: ServerResponse, next?: () => void) => boolean;
