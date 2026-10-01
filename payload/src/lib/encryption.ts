import crypto from 'node:crypto'

// ============================================================================
// OWASP A04: Field-Level Data Encryption Utility (AES-256-GCM)
// Protects sensitive PII (cardId, salary, etc.) at rest in PostgreSQL.
// ============================================================================

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits recommended by NIST SP 800-38D for GCM
const AUTH_TAG_LENGTH = 16 // 128 bits authentication tag
const PREFIX = 'enc:v1'

/**
 * Parses and returns the 32-byte encryption key from environment variable.
 * Fails closed if ENCRYPTION_KEY is missing or invalid.
 */
export function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim()
  if (!raw) throw new Error('[security:crypto] ENCRYPTION_KEY environment variable is not set.')
  const buf =
    raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)
      ? Buffer.from(raw, 'hex')
      : raw.length === 44
        ? Buffer.from(raw, 'base64')
        : Buffer.from(raw, 'utf8')
  if (buf.length === 32) return buf
  throw new Error(`[security:crypto] ENCRYPTION_KEY must be exactly 32 bytes (got ${buf.length}).`)
}

/**
 * Checks whether a given value is already formatted as an AES-256-GCM ciphertext.
 */
export function isEncrypted(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return /^enc:v1:[0-9a-fA-F]{24}:[0-9a-fA-F]{32}:[0-9a-fA-F]+$/.test(value)
}

/**
 * Encrypts a plaintext string or number using AES-256-GCM.
 * Format: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 * Idempotent: If already encrypted, returns the value unchanged.
 */
export function encryptField(
  plaintext: string | number | null | undefined,
): string | null | undefined {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return plaintext
  }

  const text = String(plaintext).trim()
  if (isEncrypted(text)) {
    return text
  }

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${PREFIX}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypts an AES-256-GCM formatted ciphertext back to plaintext.
 * Gracefully falls back to original string if not encrypted (supports legacy data).
 */
export function decryptField(
  ciphertext: string | number | null | undefined,
): string | null | undefined {
  if (ciphertext === null || ciphertext === undefined || ciphertext === '') {
    return ciphertext
  }

  const text = String(ciphertext).trim()
  if (!isEncrypted(text)) {
    // Legacy or unencrypted data: return as-is
    return text
  }

  const parts = text.split(':')
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    return text
  }

  const [, , ivHex, authTagHex, cipherHex] = parts

  try {
    const key = getEncryptionKey()
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const cipherBuf = Buffer.from(cipherHex, 'hex')

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    })
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([decipher.update(cipherBuf), decipher.final()])
    return decrypted.toString('utf8')
  } catch (error) {
    // In case of integrity failure (auth tag mismatch) or key error
    console.error('[security:crypto] Decryption error (possible data tampering or bad key):', error)
    return '[DECRYPTION_FAILED]'
  }
}
