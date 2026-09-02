// Nenhuma chamada à OpenAI tinha retry ou timeout -- uma falha de rede
// transitória (ou o servidor da OpenAI engasgando por um instante) virava
// erro direto pra psicóloga, sem nenhuma nova tentativa automática.
//
// fetchComRetentativa tenta de novo (com espera crescente entre tentativas)
// só nos casos em que vale a pena: timeout/erro de rede, ou resposta 5xx/429
// do servidor (sinais de falha transitória). Nunca tenta de novo em erro
// 4xx (400/401/403/...) -- isso é problema do nosso próprio pedido, e
// repetir a mesma chamada não vai mudar o resultado.
export async function fetchComRetentativa(url, options = {}, {tentativas = 2, esperaBaseMs = 500, timeoutMs = 75000} = {}) {
  let ultimoErro;
  for (let tentativa = 0; tentativa <= tentativas; tentativa++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, {...options, signal: controller.signal});
      clearTimeout(timer);
      const podeTentarDeNovo = !r.ok && (r.status >= 500 || r.status === 429);
      if (!podeTentarDeNovo || tentativa === tentativas) return r;
      ultimoErro = new Error(`HTTP ${r.status}`);
    } catch (e) {
      clearTimeout(timer);
      if (tentativa === tentativas) throw e;
      ultimoErro = e;
    }
    await new Promise(resolve => setTimeout(resolve, esperaBaseMs * 2 ** tentativa));
  }
  throw ultimoErro;
}
