-- Bug real: o tipo de documento "encaminhamento" (adicionado em
-- 12/09/2026, commit 4557864) foi liberado no código (lib/documents.js
-- TYPES) mas nunca na constraint do banco -- salvar um Encaminhamento
-- estava falhando com violação de CHECK constraint. Migration puramente
-- aditiva, mesmo padrão de 20260903120000 (declaracao_frequencia).
ALTER TABLE public.documentos_clinicos
  DROP CONSTRAINT documentos_clinicos_tipo_check;

ALTER TABLE public.documentos_clinicos
  ADD CONSTRAINT documentos_clinicos_tipo_check CHECK (tipo IN (
    'termo_infantil','termo_adulto','orcamento','recibo',
    'relatorio_psicologico','encaminhamento','solicitacao_escolar',
    'declaracao_comparecimento','declaracao_frequencia'
  ));
