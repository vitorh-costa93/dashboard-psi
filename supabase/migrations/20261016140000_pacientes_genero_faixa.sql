-- Gênero e faixa etária passam a ser do cadastro do paciente (antes só vinham
-- repetidos em cada sessão). Preenche com o último valor informado nas sessões.
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS genero text;
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS faixa_etaria text;

UPDATE public.pacientes p SET
  genero = COALESCE(p.genero, (SELECT s.genero FROM public.sessoes s WHERE s.paciente_id = p.id AND s.genero IS NOT NULL AND s.genero <> '' ORDER BY s.data_sessao DESC LIMIT 1)),
  faixa_etaria = COALESCE(p.faixa_etaria, (SELECT s.faixa_etaria FROM public.sessoes s WHERE s.paciente_id = p.id AND s.faixa_etaria IS NOT NULL AND s.faixa_etaria <> '' ORDER BY s.data_sessao DESC LIMIT 1))
WHERE p.genero IS NULL OR p.faixa_etaria IS NULL;
