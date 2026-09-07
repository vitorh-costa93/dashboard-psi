-- Espelha sessões históricas na agenda sem alterar a fonte operacional.
ALTER TABLE public.agenda_atendimentos ADD COLUMN IF NOT EXISTS sessao_id uuid REFERENCES public.sessoes(id) ON DELETE RESTRICT;
DO $$ BEGIN
  ALTER TABLE public.agenda_atendimentos ADD CONSTRAINT agenda_atendimentos_sessao_id_key UNIQUE (sessao_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.agenda_atendimentos DROP CONSTRAINT IF EXISTS agenda_atendimentos_origem_check;
ALTER TABLE public.agenda_atendimentos ADD CONSTRAINT agenda_atendimentos_origem_check CHECK (origem IN ('recorrencia','manual','historico'));