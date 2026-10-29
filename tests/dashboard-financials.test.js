import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('KPI de valor recebido usa o valor final salvo, sem recalcular por sessões', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /r\._valorRecebido\s*=\s*r\['Valor histórico'\][\s\S]{0,80}:pVal\(r\['Valor final'\]\)/);
  assert.doesNotMatch(html, /r\._valorTotal\s*=\s*[^\n]*_sessoesCob\s*\*\s*r\._valorSessao/);
  assert.match(html, /fat:r\.reduce\(\(s,x\)=>s\+x\._valorRecebido,0\)/);
});
