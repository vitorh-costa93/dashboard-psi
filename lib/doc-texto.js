// Texto de documento -> parágrafos. Linha em branco separa parágrafos; quebra
// simples vira <br>. Antes, o texto inteiro ia num único <p> com
// white-space:pre-wrap, e cada linha em branco virava um vão exagerado.
// **trecho** = negrito (usado nas informações iniciais fornecidas, ex.: nome,
// início e frequência na Declaração). index.html tem uma cópia idêntica
// (blocosDeTexto/paragrafosDocHtml) para a prévia -- mantenha as duas iguais.
const LISTA=/^\s*([-•*]|\d+[.)])\s/;

export function blocosDeTexto(texto){
  return String(texto??'').replace(/\r\n?/g,'\n').split(/\n[ \t]*\n+/)
    .map(b=>b.replace(/^\n+|\n+$/g,''))
    .filter(b=>b.trim())
    .map(b=>{const linhas=b.split('\n').map(l=>l.trimEnd());return{linhas,lista:LISTA.test(linhas[0])};});
}

export const negritoHtml=escapado=>escapado.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');

export function paragrafosHtml(texto,esc){
  return blocosDeTexto(texto).map(b=>`<p class="${b.lista?'lista':'par'}">${b.linhas.map(l=>negritoHtml(esc(l))).join('<br>')}</p>`).join('');
}

export function segmentosNegrito(linha){
  const out=[],re=/\*\*(.+?)\*\*/g;let i=0,m;
  while((m=re.exec(linha))){
    if(m.index>i)out.push({text:linha.slice(i,m.index),bold:false});
    out.push({text:m[1],bold:true});i=re.lastIndex;
  }
  if(i<linha.length)out.push({text:linha.slice(i),bold:false});
  return out;
}

// Declaração: a abertura ("Eu, ... declaro ... que Fulano encontra-se em
// acompanhamento desde X, com frequência de Y") é um parágrafo só, com as
// informações iniciais (nome, início, frequência) em negrito. Feito na hora
// de exibir -- e não gravado como marcação -- para valer também nas
// declarações já salvas. index.html tem cópia idêntica (prepararDeclaracao).
export function prepararDeclaracao(secoes,campos){
  const c=campos||{};
  const valores=[c['Paciente'],c['Início dos atendimentos'],c['Frequência do acompanhamento']]
    .map(v=>String(v??'').trim()).filter(Boolean).sort((a,b)=>b.length-a.length);
  return (secoes||[]).map((s,i)=>{
    if(i!==0||!s?.texto)return s;
    let t=String(s.texto).replace(/:\s*\n\s*\n/,' ');
    for(const v of valores){if(!t.includes(v))continue;t=t.split(`**${v}**`).join(v).split(v).join(`**${v}**`);}
    return {...s,texto:t};
  });
}
