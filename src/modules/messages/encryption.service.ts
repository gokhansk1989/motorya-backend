import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly masterKey: Buffer;
  private readonly ALGORITHM = 'aes-256-gcm';

  constructor() {
    const key = process.env.MESSAGE_MASTER_KEY;
    if (!key) throw new Error('MESSAGE_MASTER_KEY env var is required');
    // 32 byte hex key
    this.masterKey = Buffer.from(key, 'hex');
  }

  // Her konuşma için rastgele 32 byte AES key üret, master key ile şifrele
  generateConversationKey(): { conversationKey: Buffer; encryptedKey: string } {
    const conversationKey = crypto.randomBytes(32);
    const encryptedKey = this.wrapKey(conversationKey);
    return { conversationKey, encryptedKey };
  }

  // Saklanan encryptedKey'i çöz → konuşma anahtarını döndür
  unwrapKey(encryptedKey: string): Buffer {
    const raw = Buffer.from(encryptedKey, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);

    const decipher = crypto.createDecipheriv(this.ALGORITHM, this.masterKey, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  // Mesaj metnini konuşma anahtarıyla şifrele
  encryptMessage(text: string, conversationKey: Buffer): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.ALGORITHM, conversationKey, iv) as crypto.CipherGCM;
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // iv (12) + tag (16) + ciphertext
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  // Şifreli mesajı konuşma anahtarıyla çöz
  decryptMessage(encryptedBody: string, conversationKey: Buffer): string {
    const raw = Buffer.from(encryptedBody, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);

    const decipher = crypto.createDecipheriv(this.ALGORITHM, conversationKey, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  private wrapKey(key: Buffer): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.masterKey, iv) as crypto.CipherGCM;
    const encrypted = Buffer.concat([cipher.update(key), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }
}
