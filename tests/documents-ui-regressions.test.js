import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const documents = await readFile(new URL('../lib/documents.js', import.meta.url), 'utf8');
const migrations = await import('node:fs').then(fs => fs.readdirSync(new URL('../supabase/migrations/', import.meta.url)));

test('abrirDocumento define _docAtual DEPOIS de restaurarEstadoDocumento (que o zera via montarFormularioDocumento)', () => {
  const body = html.match(/function abrirDocumento\(id,button\)\{[\s\S]*?\r?\n\}/)[0];
  const restaurar = body.indexOf('restaurarEstadoDocumento(x)');
  const atribui = body.indexOf('_docAtual=x');
  assert.ok(restaurar > -1 && atribui > -1, 'ambos precisam existir');
  assert.ok(atribui > restaurar, '_docAtual=x precisa vir depois de restaurarEstadoDocumento(x)');
});

test('tipo "declaracao" é aceito pelo código e liberado na constraint do banco', () => {
  assert.match(documents, /const TYPES=new Set\(\[[^\]]*'declaracao'/);
  const sql = migrations.filter(f => f.includes('declaracao_doc_type'));
  assert.equal(sql.length, 1);
});

test('respostas online são separadas por destino: cadastro vs anamnese', () => {
  assert.match(html, /id="anamnese-respostas"/);
  assert.match(html, /id="anamnese-pending-badge"/);
  const fn = html.match(/function renderRespostasFormularios\(rows\)\{[\s\S]*?\r?\n\}/)[0];
  assert.match(fn, /renderListaRespostas\(rows\.filter\(x=>destinoDe\(x\)==='cadastro'\),'form-respostas'/);
  assert.match(fn, /renderListaRespostas\(rows\.filter\(x=>destinoDe\(x\)==='anamnese'\),'anamnese-respostas'/);
});
