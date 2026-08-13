// Gera conteúdo educativo para posts. A publicação no Instagram não é feita.
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const apiKey=process.env.OPENAI_KEY;
  if(!apiKey) return res.status(500).json({error:'OPENAI_KEY não configurada no Vercel'});
  const {tema,formato,publico,contexto,faixa}=req.body||{};
  if(!tema) return res.status(400).json({error:'Tema obrigatório'});
  const system=`Você cria conteúdo educativo para Instagram de uma psicóloga brasileira que atende todo o ciclo vital. O conteúdo deve ser humano, clínico, delicado e útil, sem diagnósticos individuais, prescrição, promessas de resultado, alarmismo ou exposição de pacientes.
A linguagem deve soar como uma psicóloga real escrevendo para pessoas reais: específica, acolhedora e natural, sem clichês de autoajuda e sem parágrafos genéricos de IA.
Retorne SOMENTE JSON válido neste formato:
{
  "titulo":"título visual principal",
  "resumo_visual":"uma frase curta que acompanha a capa",
  "gancho":"frase de abertura curta",
  "slides":[...],
  "legenda":"legenda completa",
  "hashtags":["#..."],
  "cta":"..."
}
Regras de conteúdo visual:
- O titulo deve ter no máximo 9 palavras.
- resumo_visual deve ter de 10 a 22 palavras, em UMA ideia, sem lista e sem bullets.
- Para POST: slides deve ter exatamente 1 item curto, de 12 a 28 palavras. Não liste vários pontos.
- Para STORY: slides deve ter de 1 a 4 itens, cada um com 8 a 20 palavras.
- Para CARROSSEL: slides deve ter EXATAMENTE 7 objetos, cada um com {"titulo":"...","texto":"..."}. O titulo de cada slide deve ter 3 a 8 palavras e o texto 10 a 24 palavras. O título principal do post aparece somente na capa e não deve ser repetido nos slides 2-7.
- Não use frases apenas para preencher espaço. Corte sem dó o que não for necessário.
- Quando o assunto já for suficientemente claro em uma ideia, não invente outras.
- Para tendências/notícias, trate a notícia como contexto, não como prova clínica.
- Não invente estudos, números ou citações.`;
  const user=`Tema: ${tema}\nFaixa do ciclo vital: ${faixa||'Ciclo vital'}\nFormato: ${formato||'Carrossel'}\nPúblico: ${publico||'público geral'}\nContexto/tendência: ${contexto||'nenhum'}`;
  try{
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_TEXT_MODEL||'gpt-4.1-mini',temperature:.6,messages:[{role:'system',content:system},{role:'user',content:user}],response_format:{type:'json_object'}})});
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.error?.message||'Erro ao gerar post'});
    const content=data.choices?.[0]?.message?.content;if(!content) return res.status(500).json({error:'Nenhum conteúdo retornado'});
    const out=JSON.parse(content);
    out.titulo=String(out.titulo||tema).trim();
    out.resumo_visual=String(out.resumo_visual||out.gancho||'').trim();
    out.gancho=String(out.gancho||out.resumo_visual||'').trim();
    if((formato||'').toLowerCase()==='carrossel'){
      if(!Array.isArray(out.slides)||out.slides.length<7) throw new Error('A IA não retornou os 7 slides esperados.');
      out.slides=out.slides.slice(0,7).map(s=>typeof s==='object'?{titulo:String(s.titulo||'').trim(),texto:String(s.texto||'').trim():{titulo:'',texto:String(s||'').trim()});
    }else{
      out.slides=Array.isArray(out.slides)?out.slides.filter(Boolean).slice(0,(formato||'').toLowerCase()==='story'?4:1).map(s=>typeof s==='object'?String(s.texto||s.titulo||'').trim():String(s).trim()):[];
      if(!out.slides.length) out.slides=[out.resumo_visual||out.gancho||''];
    }
    return res.status(200).json(out);
  }catch(e){return res.status(500).json({error:e.message});}
}
