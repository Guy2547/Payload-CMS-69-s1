import crypto from 'node:crypto'

// ============================================================================
// OWASP A04: Field-Level Data Encryption Utility (AES-256-GCM)
// Protects sensitive PII (cardId, salary, etc.) at rest in PostgreSQL.
//
// Security design decisions:
//   - Fail-closed: missing/invalid key → hard throw, never silent fallback.
//   - IV is 96-bit CSPRNG per NIST SP 800-38D §8.2.2 (unique per encryption).
//   - Auth tag is 128-bit (maximum strength for GCM).
//   - No .trim() on plaintext/ciphertext to preserve data integrity.
//   - Structured ciphertext format: enc:v1:<iv_hex>:<authTag_hex>:<cipher_hex>
//   - Decryption errors log a generic audit event; never leak key material,
//     plaintext, ciphertext, or detailed stack traces.
// ============================================================================

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits recommended by NIST SP 800-38D for GCM
const AUTH_TAG_LENGTH = 16 // 128 bits authentication tag
const PREFIX = 'enc:v1'

// Pre-compiled regex for hex validation and encrypted-format detection.
const HEX_64_RE = /^[0-9a-fA-F]{64}$/
const BASE64_44_RE = /^[A-Za-z0-9+/]{43}=$/
const ENCRYPTED_RE = /^enc:v1:[0-9a-fA-F]{24}:[0-9a-fA-F]{32}:[0-9a-fA-F]+$/
const HEX_RE = /^[0-9a-fA-F]+$/

/**
 * Parses and returns the 32-byte encryption key from environment variable.
 * Fails closed if ENCRYPTION_KEY is missing or invalid — never falls back
 * to a default/hardcoded key (Least-Privilege / Secure-by-Design).
 *
 * Accepted formats: 64-char hex string, 44-char base64 (with trailing `=`),
 * or raw 32-byte UTF-8 string. Any other length → hard error.
 */
export function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw || raw.trim().length === 0) {
    throw new Error('[security:crypto] ENCRYPTION_KEY environment variable is not set.')
  }

  // Trim only for format detection; the decoded bytes are what matter.
  const trimmed = raw.trim()

  let buf: Buffer
  if (trimmed.length === 64 && HEX_64_RE.test(trimmed)) {
    buf = Buffer.from(trimmed, 'hex')
  } else if (trimmed.length === 44 && BASE64_44_RE.test(trimmed)) {
    buf = Buffer.from(trimmed, 'base64')
  } else {
    buf = Buffer.from(trimmed, 'utf8')
  }

  if (buf.length !== 32) {
    throw new Error(
      `[security:crypto] ENCRYPTION_KEY must be exactly 32 bytes (got ${buf.length}). ` +
        'Provide a 64-char hex string, a 44-char base64 string, or a 32-byte UTF-8 string.',
    )
  }

  return buf
}

/**
 * Checks whether a given value is already formatted as an AES-256-GCM ciphertext.
 */
export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && ENCRYPTED_RE.test(value)
}

/**
 * Encrypts a plaintext string or number using AES-256-GCM.
 * Format: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * - Idempotent: already-encrypted values pass through unchanged.
 * - Nullish inputs (null / undefined) are returned as-is.
 * - Empty string is returned as-is (nothing to protect).
 * - Numbers are coerced to string WITHOUT .trim() to preserve data integrity.
 *
 * Return type is `string | null | undefined` — every code path satisfies this
 * contract even when the input is `number`, because we coerce before processing.
 */
export function encryptField(
  plaintext: string | number | null | undefined,
): string | null | undefined {
  // Explicit nullish guard — return the exact null/undefined the caller sent.
  if (plaintext === null) return null
  if (plaintext === undefined) return undefined

  // Coerce to string immediately so every subsequent path returns `string`.
  const text = String(plaintext)

  // Empty string: nothing sensitive to protect.
  if (text === '') return text

  // Idempotent: skip already-encrypted values.
  if (isEncrypted(text)) return text

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
 *
 * - Nullish inputs (null / undefined) are returned as-is.
 * - Non-encrypted strings (legacy / plain data) pass through unchanged.
 * - On any decryption failure (integrity, wrong key, malformed payload),
 *   returns '[DECRYPTION_FAILED]' and logs a generic audit event with
 *   zero data leakage (no plaintext, ciphertext, or stack trace in logs).
 */
export function decryptField(
  ciphertext: string | number | null | undefined,
): string | null | undefined {
  // Explicit nullish guard.
  if (ciphertext === null) return null
  if (ciphertext === undefined) return undefined

  // Coerce to string immediately (handles number inputs like salary).
  const text = String(ciphertext)

  // Legacy or unencrypted data: return as-is.
  if (!isEncrypted(text)) return text

  const parts = text.split(':')
  // Structural validation: exactly 5 segments with correct prefix.
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    return text
  }

  const [, , ivHex, authTagHex, cipherHex] = parts

  // Validate hex segment lengths before Buffer allocation to prevent
  // unexpected memory allocation or silent truncation.
  // IV = 12 bytes = 24 hex chars, AuthTag = 16 bytes = 32 hex chars,
  // Ciphertext must be non-empty valid hex (even length).
  if (
    ivHex.length !== IV_LENGTH * 2 ||
    authTagHex.length !== AUTH_TAG_LENGTH * 2 ||
    cipherHex.length === 0 ||
    cipherHex.length % 2 !== 0 ||
    !HEX_RE.test(cipherHex)
  ) {
    // Malformed ciphertext structure — treat as integrity failure.
    console.error('[security:crypto] Decryption rejected: malformed ciphertext structure.')
    return '[DECRYPTION_FAILED]'
  }

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
  } catch {
    // A09/A10: generic audit event only — never log key material, plaintext,
    // ciphertext, or detailed error objects / stack traces.
    console.error('[security:crypto] Decryption failed: integrity check failed or invalid payload.')
    return '[DECRYPTION_FAILED]'
  }
}
