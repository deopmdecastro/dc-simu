-- Registos internos do workflow n8n: Supabase – Guardar Saúde.
CREATE TABLE IF NOT EXISTS public.dc_simu_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  status text NOT NULL,
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dc_simu_health ENABLE ROW LEVEL SECURITY;

-- A chave de servidor do n8n pode inserir e ler; clientes públicos não têm acesso.
REVOKE ALL ON TABLE public.dc_simu_health FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.dc_simu_health TO service_role;

COMMENT ON TABLE public.dc_simu_health IS 'Registos internos de saúde dos serviços monitorizados pelo n8n.';
NOTIFY pgrst, 'reload schema';
