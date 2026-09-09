import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {decryptClinicalData, encryptClinicalData} from '../api/_clinical-crypto.js';

test('criptografa e recupera um registro clínico sem texto legível', () => {
  process.env.CLINICAL_DATA_KEY = randomBytes(32).toString('base64');
  const original = {nome:'Paciente Teste', relato:'Informação confidencial'};
  const encrypted = encryptClinicalData(original);
  assert.equal(encrypted.alg, 'A256GCM');
  assert.equal(JSON.stringify(encrypted).includes(original.relato), false);
  assert.deepEqual(decryptClinicalData(encrypted), original);
});

test('recusa descriptografia quando o conteúdo foi adulterado', () => {
  process.env.CLINICAL_DATA_KEY = randomBytes(32).toString('base64');
  const encrypted = encryptClinicalData({relato:'sigiloso'});
  encrypted.ciphertext = `${encrypted.ciphertext.slice(0,-2)}AA`;
  assert.throws(() => decryptClinicalData(encrypted));
});

test('mantém leitura de registros anteriores ainda não criptografados', () => {
  const legacy = {campo:'valor'};
  assert.equal(decryptClinicalData(legacy), legacy);
});

// Bug real: prontuarios.relato é `text`, não `jsonb` -- ao gravar o
// envelope (um objeto) numa coluna texto, o Supabase serializa para uma
// STRING JSON, e sem essa checagem o envelope nunca era reconhecido (a
// string não tem propriedade .v), então o relato aparecia na tela como o
// JSON cru em vez do texto decifrado.
test('descriptografa envelope que veio como string JSON (coluna text)', () => {
  process.env.CLINICAL_DATA_KEY = randomBytes(32).toString('base64');
  const original = 'Relato da sessão';
  const encryptedAsString = JSON.stringify(encryptClinicalData(original));
  assert.equal(decryptClinicalData(encryptedAsString), original);
});

test('mantém leitura de texto legado que não é JSON válido', () => {
  const legacy = 'Relato antigo em texto puro, salvo antes da criptografia';
  assert.equal(decryptClinicalData(legacy), legacy);
});
