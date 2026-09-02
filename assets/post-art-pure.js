// Funções puras (sem DOM, sem estado global, entrada->saída determinística)
// usadas pelo módulo de Posts em index.html. Extraídas pra um arquivo
// separado só pra ganhar cobertura de teste automatizada real (achado numa
// avaliação geral: o index.html inteiro, ~3.900 linhas, não tinha nenhum
// teste de frontend) -- carregado como <script> comum (não módulo) ANTES do
// script principal, então essas funções continuam disponíveis como globais
// exatamente como antes, sem nenhuma mudança de comportamento.
//
// Continuam de propósito fora daqui (não são puras / dependem de outras
// partes do arquivo): corContraste (depende de POST_BRAND).

function escHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function escHtmlAttr(v){return escHtml(v).replace(/`/g,'&#96;');}

function assinaturaGeracao(slides,formato,fonteFundo){return `${formato}|${fonteFundo}|${slides.join('¦')}`;}

function quebrarEmFrases(texto,maxFrases=4){
  return texto.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,maxFrases);
}

function quebrarLinhas(ctx,texto,maxWidth){
  const palavras=texto.split(/\s+/).filter(Boolean);
  const linhas=[];
  let linhaAtual='';
  palavras.forEach(palavra=>{
    const tentativa=linhaAtual?linhaAtual+' '+palavra:palavra;
    if(ctx.measureText(tentativa).width>maxWidth && linhaAtual){
      linhas.push(linhaAtual);
      linhaAtual=palavra;
    }else{
      linhaAtual=tentativa;
    }
  });
  if(linhaAtual)linhas.push(linhaAtual);
  return linhas;
}
