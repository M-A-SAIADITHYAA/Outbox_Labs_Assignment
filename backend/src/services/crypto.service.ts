import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export class CryptoService {
  private static getKey(): Buffer {
    // env.ENCRYPTION_KEY is a 64-char hex string representing 32 bytes
    return Buffer.from(env.ENCRYPTION_KEY, 'hex');
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   * Returns formatted string: "iv:authTag:ciphertext" (all hex).
   */
  public static encrypt(plainText: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.getKey(), iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts ciphertext formatted as "iv:authTag:ciphertext".
   */
  public static decrypt(cipherTextWithMeta: string): string {
    const parts = cipherTextWithMeta.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format. Expected iv:authTag:ciphertext');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, this.getKey(), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
