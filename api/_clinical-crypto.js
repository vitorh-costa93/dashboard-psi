import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function key() {
  const value = process.env.CLINICAL_DATA_KEY;
  if (!value) throw new Error('Chave de dados clínicos não configurada');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) throw new Error('Chave de dados clínicos inválida');
  return decoded;
}

export function encryptClinicalData(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return {
    v: 1,
    alg: 'A256GCM',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptClinicalData(envelope) {
  if (!envelope || envelope.v !== 1 || envelope.alg !== 'A256GCM') {
    // Compatibilidade temporária com respostas anteriores à criptografia.
    return envelope;
  }
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}
