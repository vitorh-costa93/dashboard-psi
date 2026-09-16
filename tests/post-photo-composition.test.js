import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const index=readFileSync(path.join(root,'index.html'),'utf8');

test('foto enviada recebe texto composto pelo app, sem edição de IA',()=>{
  const match=index.match(/if\(fotoDoSlide\)\{([\s\S]*?)\n      \}else\{/);
  assert.ok(match,'ramo de foto enviada deve existir');
  const ramoFoto=match[1];
  assert.match(ramoFoto,/desenharFundoComTexto\(fotoDoSlide,slides\[i\],largura,altura\)/);
  assert.doesNotMatch(ramoFoto,/gerarImagemEdicao|gerarImagem\(/);
  assert.match(index,/não pode posicioná-lo sobre pessoas nem confundir instruções com a/);
});
