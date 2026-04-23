import { describe, expect, it } from 'vitest'
import {
  adjustKeyUtf8,
  decryptWithSymmetricCrypto,
  describeCryptoKey,
  detectCipherFormatAuto,
  encryptWithSymmetricCrypto
} from '../src/renderer/src/features/tools/utils/core-crypto'

describe('crypto tool utilities', () => {
  it('auto adjusts key length by zero-padding or truncation', () => {
    expect(adjustKeyUtf8('abc', 8, true)).toHaveLength(8)
    expect(() => adjustKeyUtf8('abc', 8, false)).toThrow('key 长度必须为 8 字节（UTF-8）')
  })

  it('encrypts AES-128 ECB PKCS7 compatible with legacy output', () => {
    const result = encryptWithSymmetricCrypto({
      algorithm: 'aes',
      aesKeySize: 128,
      keyText: '1234567890abcdef',
      plainText: 'doggy-toolbox',
      autoAdjustKey: false,
      outputFormat: 'base64'
    })
    expect(result.output).toBe('wte6un79KSSYibkIWpxN7g==')
  })

  it('encrypts AES-256 and DES with stable legacy vectors', () => {
    const aes256 = encryptWithSymmetricCrypto({
      algorithm: 'aes',
      aesKeySize: 256,
      keyText: '1234567890abcdef1234567890abcdef',
      plainText: '你好, doggy',
      autoAdjustKey: false,
      outputFormat: 'hex'
    })
    const des = encryptWithSymmetricCrypto({
      algorithm: 'des',
      keyText: '12345678',
      plainText: 'doggy',
      autoAdjustKey: false,
      outputFormat: 'base64'
    })
    expect(aes256.output).toBe('7d032ad56860081bb3930c2566de2416')
    expect(des.output).toBe('1qzH5tkYwCc=')
  })

  it('decrypts using auto detected input format', () => {
    const result = decryptWithSymmetricCrypto({
      algorithm: 'aes',
      aesKeySize: 128,
      keyText: '1234567890abcdef',
      cipherText: 'wte6un79KSSYibkIWpxN7g==',
      autoAdjustKey: false,
      inputFormat: 'auto'
    })
    expect(result.output).toBe('doggy-toolbox')
    expect(result.resolvedInputFormat).toBe('base64')
  })

  it('describes key policy and detects hex/base64 automatically', () => {
    expect(describeCryptoKey('des', 128, 'abc', true).hint).toContain('不足右补 0x00')
    expect(detectCipherFormatAuto('61626364')).toBe('hex')
    expect(detectCipherFormatAuto('YWJjZA==')).toBe('base64')
  })
})
