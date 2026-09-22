/**
 * 判断 IP 是否为 Tailscale 官方虚拟私网 IP (CGNAT 网段 100.64.0.0/10)
 * 范围: 100.64.0.0 ~ 100.127.255.255
 */
export declare function isTailscaleIp(rawIp?: string): boolean;
/**
 * 判断 IP 是否为局域网私有 IP (RFC 1918 规范: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 */
export declare function isLanIp(rawIp?: string): boolean;
/**
 * 提取请求的客户端真实 IP（基于底层 Socket 连接，防止外部伪造 X-Forwarded-For，且兼容虚拟化场景）
 */
export declare function getClientIp(req: {
    socket?: {
        remoteAddress?: string;
        __dsh_real_remote_address__?: string;
    };
    headers?: Record<string, string | string[] | undefined>;
}): string;
/**
 * 获取当前本机的 Tailscale IP
 */
export declare function getLocalTailscaleIp(): string | null;
/**
 * 获取当前本机局域网 IP (优先常见 en0 / eth0 / wlan0 等)
 */
export declare function getLocalLanIp(): string | null;
/**
 * 获取本机所有可用的网络 IP
 */
export declare function getAllNetworkIps(): {
    name: string;
    ip: string;
    isTailscale: boolean;
    isLan: boolean;
}[];
