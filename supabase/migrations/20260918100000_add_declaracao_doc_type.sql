-- Novo tipo de documento "declaracao" (declaração de continuidade de
-- acompanhamento, texto elaborado pela IA em chat). Mesmo padrão de
-- 20260913090000: sem liberar o tipo na constraint, salvar falha com
-- violação de CHECK.
ALTER TABLE public.documentos_clinicos
  DROP CONSTRAINT documentos_clinicos_tipo_check;

ALTER TABLE public.documentos_clinicos
  ADD CONSTRAINT documentos_clinicos_tipo_check CHECK (tipo IN (
    'termo_infantil','termo_adulto','orcamento','recibo',
    'relatorio_psicologico','encaminhamento','solicitacao_escolar',
    'declaracao','declaracao_comparecimento','declaracao_frequencia'
  ));
