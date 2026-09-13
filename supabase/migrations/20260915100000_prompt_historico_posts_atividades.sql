-- Pedido do usuário (15/09/2026): "tem que replicar isso [preencher tudo ao
-- reabrir, incluindo o prompt] para tudo que é gerado por IA no aplicativo".
-- documentos_clinicos já guarda conteudo.promptHistorico dentro do jsonb
-- `conteudo` (não precisou de coluna nova). posts e atividades (onde as
-- apresentações/PPT são salvas) não têm um campo assim -- adiciona aqui,
-- puramente aditivo.
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS prompt_historico jsonb;
ALTER TABLE public.atividades ADD COLUMN IF NOT EXISTS prompt_historico jsonb;
