// Gera conteúdo educativo para posts. A publicação no Instagram não é feita.
import { requireAuth } from './_auth.js';
import { fetchComRetentativa } from './_openai-retry.js';
import { PERFIL_JAQUELINE } from '../lib/perfil-jaqueline.js';

// Structured Outputs (json_schema + strict:true) em vez do antigo
// response_format:{type:'json_object'}: json_object só garante "isto é JSON
// válido", não garante que os campos certos existem com o tipo certo --
// strict:true fecha essa lacuna (nunca falta campo, nunca vem tipo errado),
// sem custo adicional.
const POST_SCHEMA = {
  name: 'post_content',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      titulo: {type: 'string'},
      gancho: {type: 'string'},
      slides: {type: 'array', items: {type: 'string'}, minItems: 1, maxItems: 8},
      legenda: {type: 'string'},
      hashtags: {type: 'array', items: {type: 'string'}},
      cta: {type: 'string'}
    },
    required: ['titulo', 'gancho', 'slides', 'legenda', 'hashtags', 'cta'],
    additionalProperties: false
  }
};

export default async function handler(req,res){
  if (!await requireAuth(req, res)) return;
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const apiKey=process.env.OPENAI_KEY;
  if(!apiKey) return res.status(500).json({error:'OPENAI_KEY não configurada no Vercel'});
  const {tema,formato,publico,contexto,faixa,historico:historicoBruto,ajuste}=req.body||{};
  if(!tema) return res.status(400).json({error:'Tema obrigatório'});
  if(historicoBruto!==undefined&&!Array.isArray(historicoBruto))return res.status(400).json({error:'Histórico inválido'});
  const historico=(historicoBruto||[]).map(h=>({papel:h?.papel==='assistente'?'assistente':'usuario',texto:String(h?.texto||'').trim().slice(0,4000)})).filter(h=>h.texto).slice(-20);
  const system=`Você cria conteúdo para o Instagram de uma psicóloga brasileira que atende todo o ciclo vital: crianças, adolescentes, adultos e idosos.
Regras gerais: informar e gerar identificação sem diagnóstico individual, prescrição, promessa de resultado, alarmismo ou exposição de pacientes. Linguagem profissional, acolhedora e acessível. Não invente estudos, números ou citações. Quando o tema vier de uma notícia, trate-a como contexto, não como prova clínica.

O FORMATO muda completamente COMO o conteúdo deve ser escrito — não é só uma questão de tamanho, é o tom e a função de cada peça que mudam:

CARROSSEL (feed, várias imagens deslizáveis, fica salvo no perfil): conteúdo educativo com um arco narrativo do slide 1 (gancho/capa) ao slide final (fechamento/CTA), como um mini-artigo fatiado em partes com continuidade conceitual entre si. Legenda mais longa e com valor agregado, hashtags de descoberta (tema, público, nicho).

POST (feed, imagem única, fica salvo no perfil): UMA única mensagem editorial, mais atemporal e reflexiva — como uma afirmação ou citação forte que resume um conceito, pensada para ser bonita, compartilhável e ainda fazer sentido daqui a meses. Legenda de apoio com profundidade, hashtags de descoberta.

STORY (some em 24h, tela cheia vertical, consumida em poucos segundos por toque): NÃO é uma dica educativa para o seguidor nem uma explicação técnica — é uma frase de impacto, calorosa e reflexiva sobre o tema, pensada pra ressoar em quem lê em poucos segundos. Tom acolhedor, humano, direto — nunca uma citação genérica de painel motivacional. Relato pessoal em primeira pessoa sobre "o dia/bastidor da psicóloga" (ex.: "Hoje eu percebi...", "Hoje eu senti...") NÃO é o padrão — vira repetitivo e só faz sentido em contextos bem específicos (uma data comemorativa como o Dia do Psicólogo, por exemplo), não em toda Story. Por padrão, prefira uma afirmação, reflexão ou pergunta mais impessoal sobre o tema (ex.: "Nem toda pausa precisa ser justificada — às vezes, parar já é suficiente." / "Ansiedade não é fraqueza: é o corpo pedindo atenção."). A frase principal deve ter começo, meio e fim (aproximadamente 15 a 25 palavras). A legenda de apoio complementa com 1 a 2 frases curtas no mesmo tom. Hashtags não fazem sentido em Stories (não são pesquisáveis nesse formato). O CTA deve ser uma ação típica de Story ("manda uma mensagem", "responde na enquete", "arrasta pra cima"), nunca "salve o post" ou "compartilhe no feed".

Se a mensagem do usuário pedir um AJUSTE sobre um conteúdo já gerado (você verá o conteúdo anterior no histórico da conversa), reescreva o objeto JSON inteiro aplicando o que foi pedido e mantendo tudo o que não foi pedido para mudar.

Retorne APENAS JSON válido:
{
  "titulo":"...",
  "gancho":"...",
  "slides":["..."],
  "legenda":"...",
  "hashtags":["#..."],
  "cta":"..."
}
Para CARROSSEL, gere entre 4 e 8 itens em "slides" (um por imagem) — o quanto o tema realmente sustentar de conteúdo com continuidade conceitual; nunca complete até um número maior só para preencher, e nunca corte um arco pela metade. Para POST, "slides" tem exatamente 1 item: a mensagem central da imagem. Para STORY, "slides" tem exatamente 1 item: a frase principal da tela, completa e com profundidade (aproximadamente 15 a 25 palavras, nunca um fragmento genérico); "legenda" traz um complemento curto de apoio (1 a 2 frases); "hashtags" deve ser uma lista vazia.

${PERFIL_JAQUELINE}`;
  const primeiroPedido=`Tema: ${tema}\nFaixa do ciclo vital: ${faixa||'Ciclo vital'}\nFormato: ${formato||'Carrossel'}\nPúblico: ${publico||'público geral'}\nContexto/tendência: ${contexto||'nenhum'}`;
  const messages=[{role:'system',content:system}];
  if(historico.length){
    for(const h of historico)messages.push({role:h.papel==='assistente'?'assistant':'user',content:h.texto});
    messages.push({role:'user',content:String(ajuste||'').trim()||primeiroPedido});
  }else{
    messages.push({role:'user',content:primeiroPedido});
  }
  try{
    // gpt-4.1-mini não consta mais na lista de modelos disponíveis da OpenAI
    // (developers.openai.com/api/docs/models/compare). gpt-5.6-terra (não o
    // gpt-5.6-sol, o flagship mais caro) é o meio-termo atual: $2/$12 por
    // milhão de tokens entrada/saída contra $4/$20 do Sol, mantendo boa
    // qualidade sem o custo do topo de linha. Diferente do gpt-4.1-mini, ele
    // rejeita temperature customizado ("Only the default (1) value is
    // supported") -- por isso o parâmetro foi removido daqui.
    const r=await fetchComRetentativa('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL||'gpt-5.6-terra',messages,response_format:{type:'json_schema',json_schema:POST_SCHEMA}})},{tentativas:2,timeoutMs:30000});
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.error?.message||'Erro ao gerar post'});
    const content=data.choices?.[0]?.message?.content;
    if(!content) return res.status(500).json({error:'Nenhum conteúdo retornado'});
    return res.status(200).json(JSON.parse(content));
  }catch(e){return res.status(500).json({error:e.message});}
}
