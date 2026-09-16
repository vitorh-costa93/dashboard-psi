import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const index=readFileSync(path.join(root,'index.html'),'utf8');

test('foto enviada recebe direção visual por IA e texto composto pelo app',()=>{
  const match=index.match(/if\(fotoDoSlide\)\{([\s\S]*?)\n      \}else\{/);
  assert.ok(match,'ramo de foto enviada deve existir');
  const ramoFoto=match[1];
  assert.match(ramoFoto,/gerarImagemEdicao\(fotoDoSlide,promptFoto,imgSize\)/);
  assert.match(ramoFoto,/desenharFundoComTexto\(fundoCriativo,slides\[i\],largura,altura\)/);
  const promptFoto=index.match(/const promptFoto=`([\s\S]*?)`;\n        let fundoCriativo/);
  assert.ok(promptFoto,'brief visual da foto deve existir');
  assert.match(promptFoto[1],/Creative theme: \$\{_postAtual\.tema\}/);
  assert.match(promptFoto[1],/render absolutely no words, letters, numbers/);
  assert.doesNotMatch(promptFoto[1],/slides\[i\]|listaFrases|coverRule/);
});
