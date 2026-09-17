import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const index=readFileSync(path.join(root,'index.html'),'utf8');

test('foto enviada recebe direção visual por IA e texto composto pelo app',()=>{
  // index.html está com terminadores de linha CRLF -- \r?\n em vez de \n
  // evita que esses regexes quebrem por causa só do estilo de quebra de
  // linha do arquivo (achado ao investigar uma falha real deste teste em
  // 17/09/2026, sem nenhuma mudança de comportamento no código verificado).
  const match=index.match(/if\(fotoDoSlide\)\{([\s\S]*?)\r?\n      \}else\{/);
  assert.ok(match,'ramo de foto enviada deve existir');
  const ramoFoto=match[1];
  assert.match(ramoFoto,/gerarImagemEdicao\(fotoDoSlide,promptFoto,imgSize\)/);
  assert.match(ramoFoto,/desenharFundoComTexto\(fundoCriativo,slides\[i\],largura,altura\)/);
  const promptFoto=index.match(/const promptFoto=`([\s\S]*?)`;\r?\n        let fundoCriativo/);
  assert.ok(promptFoto,'brief visual da foto deve existir');
  assert.match(promptFoto[1],/Creative theme: \$\{_postAtual\.tema\}/);
  assert.match(promptFoto[1],/render absolutely no words, letters, numbers/);
  assert.doesNotMatch(promptFoto[1],/slides\[i\]|listaFrases|coverRule/);
});
