-- Pedido do usuário (14/09/2026): a IA embutida no app não deve usar sempre
-- as mesmas instruções estáticas -- ela precisa "aprender" com o uso real da
-- psicóloga ao longo do tempo (o que ela pede de ajuste no chat) e aplicar
-- isso automaticamente nas próximas gerações, não só dentro da conversa
-- atual. Esta tabela guarda, por contexto (documentos, instagram, etc.), um
-- texto curto e cumulativo com as preferências de estilo já aprendidas.
-- `contexto` é único porque cada área da aplicação tem seu próprio conjunto
-- de notas -- o texto de relatórios não deve herdar preferências específicas
-- de posts de Instagram, por exemplo. Para resetar o aprendizado de um
-- contexto, apague a linha ou zere `notas` diretamente no banco.
CREATE TABLE IF NOT EXISTS public.ia_preferencias_texto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contexto text NOT NULL UNIQUE,
  notas text NOT NULL DEFAULT '',
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.ia_preferencias_texto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ia_preferencias_texto FROM anon, authenticated;
GRANT ALL ON TABLE public.ia_preferencias_texto TO service_role;
