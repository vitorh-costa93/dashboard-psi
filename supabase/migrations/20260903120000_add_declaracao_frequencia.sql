-- Libera o novo tipo de documento "declaracao_frequencia" na constraint de
-- tipo da tabela documentos_clinicos. Postgres não permite adicionar um
-- valor a um CHECK existente -- é preciso derrubar e recriar a constraint.
-- Migration puramente aditiva: não toca em nenhuma linha existente, só
-- amplia a lista de valores aceitos.
ALTER TABLE public.documentos_clinicos
  DROP CONSTRAINT documentos_clinicos_tipo_check;

ALTER TABLE public.documentos_clinicos
  ADD CONSTRAINT documentos_clinicos_tipo_check CHECK (tipo IN (
    'termo_infantil','termo_adulto','orcamento','recibo',
    'relatorio_psicologico','solicitacao_escolar','declaracao_comparecimento',
    'declaracao_frequencia'
  ));
