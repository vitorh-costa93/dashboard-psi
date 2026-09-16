-- Perfil administrativo do paciente. Campos aditivos: não alteram sessões,
-- pacotes, prontuários ou os identificadores permanentes já existentes.
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS responsavel_nome text;

ALTER TABLE public.pacientes
  DROP CONSTRAINT IF EXISTS pacientes_responsavel_nome_length;
ALTER TABLE public.pacientes
  ADD CONSTRAINT pacientes_responsavel_nome_length
  CHECK (responsavel_nome IS NULL OR char_length(btrim(responsavel_nome)) BETWEEN 1 AND 160);
