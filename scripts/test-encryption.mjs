// scripts/test-encryption.mjs
// Unit tests for AES-256-GCM Field-Level Encryption

import assert from 'node:assert'
import {
  encryptField,
  decryptField,
  isEncrypted,
  getEncryptionKey,
} from '../payload/src/lib/encryption.ts'

// Setup test key
const TEST_KEY = 'ad517c08c2dbf25f24d18d27a1257b0dfc54e44ca11c2736491e3cb837521a27'
process.env.ENCRYPTION_KEY = TEST_KEY

console.log('--- Running Field-Level Encryption Unit Tests ---')

// Test 1: Key parsing
console.log('Test 1: Master Key parsing')
const keyBuf = getEncryptionKey()
assert.strictEqual(keyBuf.length, 32, 'Key must be 32 bytes')
console.log(' PASS: Master Key is valid 32 bytes (256-bit)')

// Test 2: Encrypt and Decrypt basic string
console.log('\nTest 2: Encrypt and Decrypt basic PII (cardId)')
const originalCardId = '1100400123451'
const encryptedCardId = encryptField(originalCardId)
console.log('  Original:', originalCardId)
console.log('  Encrypted:', encryptedCardId)

assert(isEncrypted(encryptedCardId), 'Output must match encrypted pattern')
assert.notStrictEqual(encryptedCardId, originalCardId, 'Ciphertext must differ from plaintext')

const decryptedCardId = decryptField(encryptedCardId)
assert.strictEqual(decryptedCardId, originalCardId, 'Decrypted value must match original plaintext')
console.log(' PASS: Decrypted cardId matches original')

// Test 3: Encrypt and Decrypt Number (salary)
console.log('\nTest 3: Encrypt and Decrypt numeric PII (salary)')
const originalSalary = 150000
const encryptedSalary = encryptField(originalSalary)
console.log('  Original salary:', originalSalary)
console.log('  Encrypted salary:', encryptedSalary)

assert(isEncrypted(encryptedSalary), 'Output must match encrypted pattern')
const decryptedSalary = decryptField(encryptedSalary)
assert.strictEqual(decryptedSalary, '150000', 'Decrypted salary must match original')
console.log(' PASS: Decrypted salary matches original numeric value')

// Test 4: Idempotency (prevent double encryption)
console.log('\nTest 4: Idempotency')
const doubleEncrypted = encryptField(encryptedCardId)
assert.strictEqual(doubleEncrypted, encryptedCardId, 'Already encrypted field must not be re-encrypted')
console.log(' PASS: Double encryption prevented')

// Test 5: Tamper resistance (Authenticated Encryption)
console.log('\nTest 5: Tamper resistance (Auth Tag check)')
const parts = encryptedCardId.split(':')
// Corrupt the ciphertext slightly
const tamperedCipher = parts[4].slice(0, -2) + (parts[4].endsWith('aa') ? 'bb' : 'aa')
const tamperedEncrypted = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${tamperedCipher}`
const tamperedResult = decryptField(tamperedEncrypted)
assert.strictEqual(tamperedResult, '[DECRYPTION_FAILED]', 'Tampered data must fail decryption')
console.log(' PASS: Tampered ciphertext was detected and rejected')

// Test 6: Fallback for legacy unencrypted data
console.log('\nTest 6: Legacy/unencrypted data fallback')
const legacyData = '0812345678'
const legacyResult = decryptField(legacyData)
assert.strictEqual(legacyResult, legacyData, 'Unencrypted string must pass through unmodified')
console.log(' PASS: Unencrypted legacy data gracefully returned as-is')

// Test 7: Null, undefined, empty handling
console.log('\nTest 7: Edge cases (null, undefined, empty)')
assert.strictEqual(encryptField(null), null)
assert.strictEqual(encryptField(undefined), undefined)
assert.strictEqual(encryptField(''), '')
assert.strictEqual(decryptField(null), null)
assert.strictEqual(decryptField(undefined), undefined)
assert.strictEqual(decryptField(''), '')
console.log(' PASS: Edge cases handled safely')

console.log('\n=================================================')
console.log('ALL 7 ENCRYPTION UNIT TESTS PASSED SUCCESSFULLY!')
console.log('=================================================\n')
