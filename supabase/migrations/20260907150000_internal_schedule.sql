-- Agenda interna aditiva; o histórico em sessoes não é alterado.
DO $ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pacientes' AND column_name='status_operacional'
  ) THEN
    ALTER TABLE public.pacientes ADD COLUMN status_operacional text NOT NULL DEFAULT 'ativo';
    UPDATE public.pacientes SET status_operacional=CASE WHEN ativo THEN 'ativo' ELSE 'inativo' END;
  END IF;
END $;
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS pausado_ate date;
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS inativo_em timestamptz;
DO $$ BEGIN ALTER TABLE public.pacientes ADD CONSTRAINT pacientes_status_operacional_check CHECK(status_operacional IN('ativo','pausado','inativo'));EXCEPTION WHEN duplicate_object THEN NULL;END $$;
CREATE TABLE IF NOT EXISTS public.recorrencias_atendimento(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,frequencia text NOT NULL CHECK(frequencia IN('semanal','quinzenal')),dia_semana smallint NOT NULL CHECK(dia_semana BETWEEN 1 AND 7),horario text NOT NULL CHECK(horario~'^([01][0-9]|2[0-3]):[0-5][0-9]$'),vigencia_inicio date NOT NULL,vigencia_fim date,convenio_id uuid REFERENCES public.convenios(id) ON DELETE RESTRICT,modalidade text,valor_sessao numeric(12,2) NOT NULL DEFAULT 0 CHECK(valor_sessao>=0),ativo boolean NOT NULL DEFAULT true,origem text NOT NULL DEFAULT'manual' CHECK(origem IN('manual','inferido')),criado_em timestamptz NOT NULL DEFAULT now(),atualizado_em timestamptz NOT NULL DEFAULT now(),CHECK(vigencia_fim IS NULL OR vigencia_fim>=vigencia_inicio));
CREATE TABLE IF NOT EXISTS public.agenda_atendimentos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,recorrencia_id uuid REFERENCES public.recorrencias_atendimento(id) ON DELETE SET NULL,data_atendimento date NOT NULL,horario text NOT NULL CHECK(horario~'^([01][0-9]|2[0-3]):[0-5][0-9]$'),status text NOT NULL DEFAULT'agendado' CHECK(status IN('agendado','realizado','falta','cancelado')),convenio_id uuid REFERENCES public.convenios(id) ON DELETE RESTRICT,modalidade text,valor_previsto numeric(12,2) NOT NULL DEFAULT 0 CHECK(valor_previsto>=0),origem text NOT NULL DEFAULT'recorrencia' CHECK(origem IN('recorrencia','manual')),observacao_administrativa text,criado_em timestamptz NOT NULL DEFAULT now(),atualizado_em timestamptz NOT NULL DEFAULT now(),UNIQUE(paciente_id,data_atendimento,horario));
CREATE INDEX IF NOT EXISTS idx_recorrencias_paciente_vigencia ON public.recorrencias_atendimento(paciente_id,vigencia_inicio,vigencia_fim);
CREATE INDEX IF NOT EXISTS idx_agenda_data_status ON public.agenda_atendimentos(data_atendimento,status);
CREATE INDEX IF NOT EXISTS idx_agenda_paciente_data ON public.agenda_atendimentos(paciente_id,data_atendimento);
ALTER TABLE public.recorrencias_atendimento ENABLE ROW LEVEL SECURITY;ALTER TABLE public.agenda_atendimentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recorrencias_atendimento FROM anon,authenticated;REVOKE ALL ON TABLE public.agenda_atendimentos FROM anon,authenticated;
