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
  // Colunas `jsonb` (documentos_clinicos, anamneses_versoes,
  // formularios_respostas) guardam o envelope como objeto de verdade, mas
  // `prontuarios.relato` é `text` -- ao gravar um objeto num campo texto, o
  // Supabase serializa para uma STRING JSON (`'{"v":1,...}'`), e sem isso
  // aqui o envelope nunca era reconhecido (não é um objeto, `envelope.v` é
  // undefined), então o relato aparecia na tela como o JSON cru em vez do
  // texto decifrado. O conteúdo cifrado em si nunca esteve corrompido --
  // só a forma de armazenamento -- então nenhuma migração de dados é
  // necessária, isso já corrige tudo que já estava salvo.
  let env = envelope;
  if (typeof env === 'string') {
    try { env = JSON.parse(env); } catch { return envelope; }
  }
  if (!env || env.v !== 1 || env.alg !== 'A256GCM') {
    // Compatibilidade temporária com respostas anteriores à criptografia.
    return envelope;
  }
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(env.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(env.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}
