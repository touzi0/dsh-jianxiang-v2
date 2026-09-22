export declare const RSA_KEY_FILE: string;
/**
 * 获取服务端的持久化 RSA 公钥 (PEM 格式)
 */
export declare function getPublicKeyPem(): string;
/**
 * 使用 RSA 私钥解密客户端发来的 Base64 密文 (多填充算法自适应兼容)
 */
export declare function decryptWithPrivateKey(encryptedBase64: string): string;
/**
 * 校验长期密码强度：必须 >= 6 位且包含字母与数字
 */
export declare function validateSecretStrength(secret: string): {
    valid: boolean;
    reason?: string;
};
/**
 * 将明文密码转换为加盐哈希（采用 scrypt 慢哈希算法，杜绝彩虹表与 GPU 暴力破解）
 */
export declare function hashSecret(plainSecret: string): string;
/**
 * 比对明文密码与存储的加盐哈希（恒定时间比对，抵御时序侧信道攻击）
 */
export declare function verifySecretHash(plainSecret: string, storedHashOrPlain: string): boolean;
