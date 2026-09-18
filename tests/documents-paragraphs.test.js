import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {Document, Packer} from 'docx';
import JSZip from 'jszip';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
const {blocosDeTexto, paragrafosHtml, segmentosNegrito} = await import('../lib/doc-texto.js');
const {documentPdfHtml, documentChildren} = await import('../lib/documents.js');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

test('linha em branco separa parágrafos (nada de vão gigante dentro de um <p>)', () => {
  const html = paragrafosHtml('Primeiro.\n\nSegundo.', esc);
  assert.equal((html.match(/<p /g) || []).length, 2);
  assert.doesNotMatch(html, /\n/);
});

test('listas não recebem recuo; parágrafos recebem', () => {
  const b = blocosDeTexto('Texto normal.\n\n- item um\n- item dois\n\n1) primeiro\n2) segundo');
  assert.deepEqual(b.map(x => x.lista), [false, true, true]);
  const html = paragrafosHtml('Texto.\n\n- item', esc);
  assert.match(html, /class="par"/);
  assert.match(html, /class="lista"/);
});

test('**negrito** vira <strong> e o resto é escapado', () => {
  assert.equal(paragrafosHtml('Eu **Ana <b>** foi.', esc), '<p class="par">Eu <strong>Ana &lt;b&gt;</strong> foi.</p>');
  assert.deepEqual(segmentosNegrito('a **b** c'), [{text: 'a ', bold: false}, {text: 'b', bold: true}, {text: ' c', bold: false}]);
});

const item = {
  tipo: 'declaracao', titulo: 'Declaração', emitido_em: '2026-08-06',
  conteudo: {estilo: 'colorido', campos: {Paciente: 'Otávio Baptista', 'Início dos atendimentos': '2024-12-06'}, secoes: [
    {titulo: '', texto: 'Eu, Jaqueline, declaro que:\n\n**Otávio Baptista** encontra-se em acompanhamento desde **06/12/2024**.'},
    {titulo: '', texto: 'Segundo bloco.\n\n- objetivo um\n- objetivo dois'},
  ]},
};

test('PDF: parágrafos com recuo, negrito nas informações iniciais e sem pre-wrap nos parágrafos', () => {
  const html = documentPdfHtml(item);
  assert.match(html, /p\.par\{text-indent:1\.25cm\}/);
  assert.match(html, /p\.par,p\.lista\{white-space:normal\}/);
  assert.match(html, /<p class="par">Eu, Jaqueline, declaro que:<\/p><p class="par"><strong>Otávio Baptista<\/strong>/);
  assert.match(html, /<strong>06\/12\/2024<\/strong>/);
  assert.match(html, /<p class="lista">- objetivo um<br>- objetivo dois<\/p>/);
});

test('PDF: valores dos campos iniciais em negrito (documentos comuns)', () => {
  const html = documentPdfHtml({...item, tipo: 'relatorio_psicologico'});
  assert.match(html, /<p class="campo"><strong>Paciente: Otávio Baptista<\/strong><\/p>/);
  assert.match(html, /<strong>Início dos atendimentos: 06\/12\/2024<\/strong>/);
});

test('DOCX: recuo de primeira linha nos parágrafos e negrito nas informações', async () => {
  const doc = new Document({sections: [{children: documentChildren({...item, tipo: 'relatorio_psicologico'})}]});
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /<w:ind w:firstLine="709"/);
  assert.match(xml, /<w:b\/>[^]*?Otávio Baptista/);
});

test('cópia do cliente (index.html) gera o mesmo HTML que o servidor', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const grab = n => { const i = html.indexOf(`function ${n}(`); return html.slice(i, html.indexOf('\n', i)); };
  const escHtml = esc;
  const client = new Function('escHtml', `${grab('blocosDeTexto')};${grab('paragrafosDocHtml')};return paragrafosDocHtml;`)(escHtml);
  for (const t of ['a\n\nb', 'x **y** z\n\n- l1\n- l2\n\n\n1) k', '', 'só um', 'linha1\nlinha2\n\nfim  ']) {
    assert.equal(client(t), paragrafosHtml(t, esc), JSON.stringify(t));
  }
});
