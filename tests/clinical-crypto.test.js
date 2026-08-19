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
