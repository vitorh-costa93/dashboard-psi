-- Histórico mensal da Wellz de jan/2025 a out/2025 (complementa nov/2025 em diante).
INSERT INTO public.wellz_historico (mes, valor) VALUES
  ('2025-01-01', 1440.00), ('2025-02-01', 1120.00), ('2025-03-01', 1120.00),
  ('2025-04-01', 1120.00), ('2025-05-01', 1440.00), ('2025-06-01', 1120.00),
  ('2025-07-01', 1440.00), ('2025-08-01', 1120.00), ('2025-09-01', 1120.00),
  ('2025-10-01', 1260.00)
ON CONFLICT (mes) DO UPDATE SET valor = EXCLUDED.valor;
