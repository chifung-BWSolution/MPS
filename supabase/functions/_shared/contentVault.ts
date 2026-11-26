import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * 站點憑證加密（PRD §7.4、M1-01）
 *
 * AES-256-GCM + WebCrypto（Deno 內建），密文格式：
 *   v1.<base64(iv)>.<base64(ciphertext)>
 *
 * 密鑰來源：CONTENT_VAULT_KEY secret（≥ 32 字元）。
 * 為了讓任意長度的 secret 都能當 256-bit key，金鑰以 SHA-256 派生。
 *
 * 輪換密鑰 = 舊密文永久失效（無法解密），需重存憑證（PRD 回滾表）。
 */

const ENV_KEY = "CONTENT_VAULT_KEY";
const VERSION = "v1";
const IV_BYTES = 12;
const MIN_SECRET_LENGTH = 32;

export class ContentVaultError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ContentVaultError";
    this.code = code;
  }
}

export function vaultConfigured(): boolean {
  return (Deno.env.get(ENV_KEY) || "").trim().length >= MIN_SECRET_LENGTH;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(): Promise<CryptoKey> {
  const secret = (Deno.env.get(ENV_KEY) || "").trim();
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new ContentVaultError(
      "vault_not_configured",
      `缺少 ${ENV_KEY}（至少 ${MIN_SECRET_LENGTH} 字元），請先執行 supabase secrets set ${ENV_KEY}=...`,
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** 只顯示尾碼，永不回傳明文（PRD M1-04） */
export function credentialFingerprint(secret: string): string {
  const clean = String(secret || "");
  const tail = clean.slice(-4);
  return tail ? `••••${tail}` : "";
}

export interface SealedCredential {
  ciphertext: string;
  fingerprint: string;
}

export async function sealCredential(
  secret: string,
  /** 顯示用指紋來源；JSON 憑證可傳 email，避免只看到 JSON 尾字元 */
  fingerprintSource?: string,
): Promise<SealedCredential> {
  const plaintext = String(secret || "");
  if (!plaintext.trim()) {
    throw new ContentVaultError("empty_secret", "憑證內容不可為空");
  }
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: `${VERSION}.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`,
    fingerprint: credentialFingerprint(fingerprintSource?.trim() || plaintext),
  };
}

export async function unsealCredential(ciphertext: string): Promise<string> {
  const raw = String(ciphertext || "").trim();
  const [version, ivPart, cipherPart] = raw.split(".");
  if (version !== VERSION || !ivPart || !cipherPart) {
    throw new ContentVaultError("invalid_ciphertext", "憑證格式不正確（預期 v1.iv.cipher）");
  }
  const key = await deriveKey();
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(ivPart) },
      key,
      base64ToBytes(cipherPart),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new ContentVaultError(
      "decrypt_failed",
      "憑證無法解密：CONTENT_VAULT_KEY 可能已輪換，請重新儲存憑證",
    );
  }
}

/** 健康檢查用：能解密就算通過（不呼叫外部服務） */
export async function verifyCredentialCiphertext(ciphertext: string): Promise<boolean> {
  try {
    await unsealCredential(ciphertext);
    return true;
  } catch {
    return false;
  }
}
