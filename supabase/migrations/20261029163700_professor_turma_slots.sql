ALTER TABLE public.datas_apresentacao
  ADD COLUMN IF NOT EXISTS data_hora_fim timestamptz;

ALTER TABLE public.configuracoes
  ADD COLUMN IF NOT EXISTS turma_id uuid REFERENCES public.turmas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS limite_alunos_grupo integer,
  ADD COLUMN IF NOT EXISTS data_inicio_agendamento timestamptz,
  ADD COLUMN IF NOT EXISTS data_fim_agendamento timestamptz,
  ADD COLUMN IF NOT EXISTS "mostrar_Integrantes" boolean NOT NULL DEFAULT true;

UPDATE public.configuracoes
SET limite_alunos_grupo = COALESCE(limite_alunos_max, 5)
WHERE limite_alunos_grupo IS NULL;

ALTER TABLE public.configuracoes
  ALTER COLUMN limite_alunos_grupo SET DEFAULT 5,
  ALTER COLUMN limite_alunos_grupo SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS configuracoes_turma_id_unique
  ON public.configuracoes(turma_id);

INSERT INTO public.configuracoes (
  turma_id,
  limite_alunos_min,
  limite_alunos_max,
  permitir_inscricoes,
  limite_alunos_grupo,
  data_inicio_agendamento,
  data_fim_agendamento,
  "mostrar_Integrantes"
)
SELECT
  turma.id,
  COALESCE(configuracao.limite_alunos_min, 2),
  COALESCE(configuracao.limite_alunos_max, 5),
  COALESCE(configuracao.permitir_inscricoes, false),
  COALESCE(configuracao.limite_alunos_grupo, 5),
  configuracao.data_inicio_agendamento,
  configuracao.data_fim_agendamento,
  COALESCE(configuracao."mostrar_Integrantes", true)
FROM public.turmas AS turma
LEFT JOIN LATERAL (
  SELECT *
  FROM public.configuracoes
  WHERE turma_id IS NULL
  ORDER BY id
  LIMIT 1
) AS configuracao ON true
ON CONFLICT (turma_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.criar_configuracao_padrao_turma()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.configuracoes (
    turma_id,
    limite_alunos_min,
    limite_alunos_max,
    permitir_inscricoes,
    limite_alunos_grupo,
    data_inicio_agendamento,
    data_fim_agendamento,
    "mostrar_Integrantes"
  )
  SELECT
    NEW.id,
    COALESCE(configuracao.limite_alunos_min, 2),
    COALESCE(configuracao.limite_alunos_max, 5),
    COALESCE(configuracao.permitir_inscricoes, false),
    COALESCE(configuracao.limite_alunos_grupo, 5),
    configuracao.data_inicio_agendamento,
    configuracao.data_fim_agendamento,
    COALESCE(configuracao."mostrar_Integrantes", true)
  FROM public.configuracoes AS configuracao
  WHERE configuracao.turma_id IS NULL
  ORDER BY configuracao.id
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.configuracoes (
      turma_id,
      limite_alunos_min,
      limite_alunos_max,
      permitir_inscricoes,
      limite_alunos_grupo,
      "mostrar_Integrantes"
    )
    VALUES (NEW.id, 2, 5, false, 5, true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS criar_configuracao_padrao_apos_turma
  ON public.turmas;

CREATE TRIGGER criar_configuracao_padrao_apos_turma
AFTER INSERT ON public.turmas
FOR EACH ROW
EXECUTE FUNCTION public.criar_configuracao_padrao_turma();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'datas_apresentacao'
    ) THEN
      ALTER PUBLICATION supabase_realtime
        ADD TABLE public.datas_apresentacao;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'grupos'
    ) THEN
      ALTER PUBLICATION supabase_realtime
        ADD TABLE public.grupos;
    END IF;
  END IF;
END;
$$;
