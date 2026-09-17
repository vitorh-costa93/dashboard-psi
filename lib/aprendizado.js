// Aprendizado contínuo de preferências de estilo, compartilhado por todo
// gerador de conteúdo por IA do app (documentos, posts/artes, apresentações,
// imagens/atividades) -- cada um usa seu próprio `contexto` na tabela
// ia_preferencias_texto. Extraído de lib/documents.js (14-17/09/2026) para um
// módulo próprio e leve: lib/documents.js importa sharp/pdf-lib/docx/puppeteer
// só para exportação de PDF/DOCX, peso que rotas de geração de imagem (sem
// nenhuma relação com PDF) não deveriam carregar só para reusar isto.
import {supabase} from '../api/_auth.js';
import {fetchComRetentativa} from '../api/_openai-retry.js';

const STRIP_INVISIBLE=new RegExp(`[${String.fromCharCode(0x200b,0x200c,0x200d,0xfeff)}]`,'g');
const DASH_LIKE=new RegExp(`[${String.fromCharCode(0x00ad,0x2010,0x2011,0x2012,0x2013)}]`,'g');
const clean=value=>String(value??'').replace(STRIP_INVISIBLE,'').replace(DASH_LIKE,'-').trim();
const json=async r=>r.json().catch(()=>null);

export async function buscarPreferenciaTexto(contexto){
  try{
    const r=await supabase(`/rest/v1/ia_preferencias_texto?select=notas&contexto=eq.${encodeURIComponent(contexto)}&limit=1`);
    const data=await json(r);
    return r.ok&&Array.isArray(data)&&data[0]?.notas?clean(data[0].notas):'';
  }catch(e){console.error('buscarPreferenciaTexto:',e);return '';}
}
export async function salvarPreferenciaTexto(contexto,notas,autorId){
  try{
    await supabase(`/rest/v1/ia_preferencias_texto?on_conflict=contexto`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({contexto,notas,atualizado_em:new Date().toISOString(),atualizado_por:autorId})});
  }catch(e){console.error('salvarPreferenciaTexto:',e);}
}
// Chamada de aprendizado: roda só quando o pedido é um AJUSTE dentro de uma
// conversa em andamento (não a descrição inicial de um caso, que é sempre
// específica de um paciente/post e nunca uma preferência de estilo geral).
// Deliberadamente síncrona (aguardada antes de responder) em vez de
// "fire-and-forget", porque a função serverless pode ser congelada assim
// que a resposta é enviada -- um disparo sem aguardar arriscaria nunca
// completar. É uma chamada rápida e barata (gpt-5-mini, esforço baixo,
// poucos tokens), então o custo em latência é pequeno.
export async function aprenderComAjusteChat({contexto,pedido,atual,key,autorId}){
  if(!pedido||pedido.length<3)return;
  const instructions='Você mantém uma lista curta e objetiva de preferências de ESTILO, TOM e FORMATO de uma psicóloga brasileira, para orientar conteúdo futuro gerado por IA no aplicativo dela (documentos, posts, apresentações ou imagens/atividades, conforme o contexto). Preferências já registradas (pode estar vazia):\n"""\n'+(atual||'(nenhuma ainda)')+'\n"""\nA psicóloga acabou de pedir este ajuste em um conteúdo gerado por IA:\n"""\n'+pedido.slice(0,2000)+'\n"""\nSe esse pedido revelar uma preferência de ESTILO/TOM/FORMATO geral e reutilizável em conteúdos futuros (não um detalhe específico deste caso/post/imagem), incorpore essa preferência à lista, reescrevendo-a de forma concisa e sem duplicar o que já existe. Se o pedido for apenas um detalhe específico do caso (algo que não se repete em outros conteúdos), responda com a lista atual sem nenhuma mudança. Responda APENAS com a lista final atualizada, em português, uma preferência por linha, sem numeração e sem comentários, no máximo 12 linhas e 2000 caracteres no total.';
  try{
    const r=await fetchComRetentativa('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-5-mini',instructions,input:'Atualize a lista conforme as instruções.',max_output_tokens:600,reasoning:{effort:'low'}})},{tentativas:1,timeoutMs:12000});
    const data=await json(r);if(!r.ok)return;
    const texto=clean((data.output||[]).flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text).slice(0,4000);
    if(!texto||texto===atual)return;
    await salvarPreferenciaTexto(contexto,texto,autorId);
  }catch(e){console.error('aprenderComAjusteChat:',e);}
}
