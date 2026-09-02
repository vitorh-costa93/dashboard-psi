// Testa lib/post-art-pure.js exatamente como ele é servido ao navegador --
// carregado como <script> comum (function declarations no escopo global,
// sem export/import), não como módulo ESM. Por isso o teste lê o arquivo e
// executa via `new Function` para extrair as funções, em vez de um import
// direto -- garante que o teste cobre o arquivo real, byte a byte, e não
// uma cópia com sintaxe de módulo que o navegador nunca vê.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/post-art-pure.js');
const source = readFileSync(filePath, 'utf8');
const {escHtml, escHtmlAttr, assinaturaGeracao, quebrarEmFrases, quebrarLinhas} =
  new Function(`${source}\nreturn {escHtml, escHtmlAttr, assinaturaGeracao, quebrarEmFrases, quebrarLinhas};`)();

test('escHtml escapa os cinco caracteres perigosos de HTML', () => {
  assert.equal(escHtml(`<script>&"'</script>`), '&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;');
});

test('escHtml trata null/undefined como string vazia', () => {
  assert.equal(escHtml(null), '');
  assert.equal(escHtml(undefined), '');
});

test('escHtmlAttr escapa igual escHtml e tambem o crase (usado em template strings)', () => {
  assert.equal(escHtmlAttr('nome`com`crase'), 'nome&#96;com&#96;crase');
  assert.equal(escHtmlAttr('<b>'), '&lt;b&gt;');
});

test('assinaturaGeracao combina formato, fonte e slides de forma unica e estavel', () => {
  const a = assinaturaGeracao(['Slide 1', 'Slide 2'], 'Carrossel', 'ia');
  const b = assinaturaGeracao(['Slide 1', 'Slide 2'], 'Carrossel', 'ia');
  assert.equal(a, b);
  const diferente = assinaturaGeracao(['Slide 1', 'Slide 2'], 'Carrossel', 'upload');
  assert.notEqual(a, diferente);
});

test('quebrarEmFrases so separa em fronteira de frase completa (ponto/exclamacao/interrogacao), nunca por virgula', () => {
  const texto = 'Estar sempre disponível no digital pode ocupar espaços internos que também precisam de silêncio, pausa e presença.';
  assert.deepEqual(quebrarEmFrases(texto), [texto]);
});

test('quebrarEmFrases separa multiplas sentencas reais', () => {
  const texto = 'A volta às aulas mexe com todo mundo. É normal sentir um friozinho na barriga. Respire fundo.';
  assert.deepEqual(quebrarEmFrases(texto), [
    'A volta às aulas mexe com todo mundo.',
    'É normal sentir um friozinho na barriga.',
    'Respire fundo.'
  ]);
});

test('quebrarEmFrases respeita o limite maximo de frases', () => {
  const texto = 'Um. Dois. Três. Quatro. Cinco.';
  assert.equal(quebrarEmFrases(texto, 2).length, 2);
});

function ctxFake(largComPorChar = 7) {
  // simula ctx.measureText: cada caractere "pesa" um numero fixo de pixels,
  // suficiente pra testar a logica de quebra sem precisar de canvas real.
  return {measureText: (s) => ({width: s.length * largComPorChar})};
}

test('quebrarLinhas nao quebra quando o texto cabe inteiro na largura', () => {
  const linhas = quebrarLinhas(ctxFake(), 'texto curto', 1000);
  assert.deepEqual(linhas, ['texto curto']);
});

test('quebrarLinhas quebra em varias linhas sem espremer nenhuma palavra', () => {
  const ctx = ctxFake(10); // cada char = 10px
  const linhas = quebrarLinhas(ctx, 'uma frase razoavelmente longa para quebrar', 150);
  assert.ok(linhas.length > 1);
  // nenhuma linha deve ultrapassar a largura maxima
  linhas.forEach(l => assert.ok(ctx.measureText(l).width <= 150));
  // reconstituir as linhas reproduz o texto original (nenhuma palavra perdida)
  assert.equal(linhas.join(' '), 'uma frase razoavelmente longa para quebrar');
});

test('quebrarLinhas nunca deixa uma linha vazia mesmo com espacos repetidos', () => {
  const linhas = quebrarLinhas(ctxFake(), '  texto   com   espacos  ', 1000);
  assert.deepEqual(linhas, ['texto com espacos']);
});
