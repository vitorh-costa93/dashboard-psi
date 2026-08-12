// Gera conteúdo educativo para posts. A publicação no Instagram não é feita.
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const apiKey=process.env.OPENAI_KEY;
  if(!apiKey) return res.status(500).json({error:'OPENAI_KEY não configurada no Vercel'});
  const {tema,formato,publico,contexto,faixa}=req.body||{};
  if(!tema) return res.status(400).json({error:'Tema obrigatório'});
  const system=`Você cria conteúdo educativo para Instagram de uma psicóloga brasileira que atende todo o ciclo vital: crianças, adolescentes, adultos e alguns idosos.
O conteúdo deve informar e gerar identificação sem diagnóstico individual, prescrição, promessa de resultado, alarmismo ou exposição de pacientes.
Use linguagem profissional, acolhedora e acessível. A voz deve soar como uma psicóloga real escrevendo para pessoas reais: específica, humana, delicada e natural, sem clichês de autoajuda e sem frases genéricas de IA. Não invente estudos, números ou citações.
Quando o tema vier de uma notícia, trate a notícia como contexto e não como prova clínica.
Retorne APENAS JSON válido e nunca omita o campo slides. Para POST e STORY, se uma lista de slides não for necessária, use ao menos 1 item útil e não redundante em slides:
{
  "titulo":"...",
  "gancho":"...",
  "slides":["..."],
  "legenda":"...",
  "hashtags":["#..."],
  "cta":"..."
}
Regras por formato:
- CARROSSEL: gere EXATAMENTE 7 slides. O campo titulo é exclusivo da capa (slide 1). Nos slides 2 a 7, NÃO repita o título do post. Cada slide deve desenvolver uma ideia própria em 12 a 24 palavras, com no máximo 2 frases. Não escreva parágrafos longos.
- POST: NÃO force 7 pontos. Gere 1 mensagem central em slides[0], com 30 a 55 palavras, ou 2 a 4 pontos muito curtos apenas quando isso melhorar a comunicação. A arte deve ter uma mensagem clara e respirável, nunca um bloco de texto.
- STORY: use de 1 a 4 telas; cada tela deve ter no máximo 20 palavras e somente quando houver necessidade de sequência.
- O titulo deve ter no máximo 10 palavras. O gancho deve ser curto.
Em todos os formatos, priorize clareza, síntese, ritmo visual e utilidade. O texto precisa caber confortavelmente em uma composição editorial sem letras minúsculas. Evite parágrafos longos, redundância e “encheção de linguiça”.`;
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
