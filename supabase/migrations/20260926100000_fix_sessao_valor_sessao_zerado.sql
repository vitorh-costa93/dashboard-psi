-- Sessões com valor recebido mas sem valor unitário ficavam fora do dashboard
-- (que soma sessões pagas x valor da sessão). Completa o valor unitário.
UPDATE public.sessoes
SET valor_sessao = round(valor_final / sessoes_cobradas, 2),
    valor_total = valor_final,
    atualizado_em = now()
WHERE coalesce(valor_sessao,0) = 0 AND sessoes_cobradas > 0 AND valor_final > 0;
