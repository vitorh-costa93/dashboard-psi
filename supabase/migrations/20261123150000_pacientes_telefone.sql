-- Adiciona telefone/WhatsApp ao cadastro do paciente para envio rápido de links e mensagens.
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS telefone text;
