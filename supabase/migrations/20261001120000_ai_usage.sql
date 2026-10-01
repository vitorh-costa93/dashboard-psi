-- Log de uso/custo das chamadas à OpenAI (custo ESTIMADO pela tabela de preços em lib/ai-models.js).
-- Acesso só pela camada servidor (service role); RLS ligado sem policies, como ia_preferencias_texto.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  task text NOT NULL,
  model text NOT NULL,
  ok boolean NOT NULL DEFAULT true,
  input_tokens integer NOT NULL DEFAULT 0,
  cached_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  reasoning_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(10, 6),
  duration_ms integer,
  error text
);
CREATE INDEX IF NOT EXISTS ai_usage_created_at_idx ON public.ai_usage (created_at DESC);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_usage FROM anon, authenticated;
GRANT ALL ON TABLE public.ai_usage TO service_role;
