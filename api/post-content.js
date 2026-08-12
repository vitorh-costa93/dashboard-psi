// Gera conteúdo educativo para posts. A publicação no Instagram não é feita.
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const apiKey=process.env.OPENAI_KEY;
  if(!apiKey) return res.status(500).json({error:'OPENAI_KEY não configurada no Vercel'});
  const {tema,formato,publico,contexto,faixa}=req.body||{};
  if(!tema) return res.status(400).json({error:'Tema obrigatório'});
  const system=`Você cria conteúdo educativo para Instagram de uma psicóloga brasileira que atende todo o ciclo vital: crianças, adolescentes, adultos e alguns idosos.
O conteúdo deve informar e gerar identificação sem diagnóstico individual, prescrição, promessa de resultado, alarmismo ou exposição de pacientes.
Use linguagem profissional, acolhedora e acessível. A voz deve soar como uma psicóloga real escrevendo para pessoas reais: específica, humana, sem clichês de autoajuda e sem frases genéricas de IA. Não invente estudos, números ou citações.
Quando o tema vier de uma notícia, trate a notícia como contexto e não como prova clínica.
Retorne APENAS JSON válido:
{
  "titulo":"...",
  "gancho":"...",
  "slides":["..."],
  "legenda":"...",
  "hashtags":["#..."],
  "cta":"..."
}
Regras por formato:
- CARROSSEL: gere EXATAMENTE 7 slides. O campo titulo é exclusivo da capa (slide 1). Nos slides 2 a 7, NÃO repita o título do post. Cada slide deve desenvolver uma ideia própria, curta e legível.
- POST: NÃO force 7 pontos. Gere somente a quantidade de ideias necessária para comunicar o tema com clareza: normalmente 1 mensagem central e, se realmente ajudar, de 2 a 4 pontos curtos. Evite preencher espaço apenas para parecer completo. A quantidade deve variar conforme o assunto.
- STORY: use de 1 a 4 telas, apenas quando houver necessidade de sequência; não crie telas redundantes.
Em todos os formatos, priorize clareza, síntese e utilidade em vez de quantidade. Evite títulos artificiais, listas com itens redundantes e estruturas previsíveis apenas para preencher espaço. Prefira uma ideia forte bem desenvolvida a cinco ideias fracas.`;
  const user=`Tema: ${tema}\nFaixa do ciclo vital: ${faixa||'Ciclo vital'}\nFormato: ${formato||'Carrossel'}\nPúblico: ${publico||'público geral'}\nContexto/tendência: ${contexto||'nenhum'}`;
  try{
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL||'gpt-4.1-mini',temperature:.65,messages:[{role:'system',content:system},{role:'user',content:user}],response_format:{type:'json_object'}})});
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.error?.message||'Erro ao gerar post'});
    const content=data.choices?.[0]?.message?.content;
    if(!content) return res.status(500).json({error:'Nenhum conteúdo retornado'});
    return res.status(200).json(JSON.parse(content));
  }catch(e){return res.status(500).json({error:e.message});}
}
