CREATE TABLE IF NOT EXISTS public.rubricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  titulo text NOT NULL CHECK (length(btrim(titulo)) > 0),
  valor_maximo numeric(8, 2) NOT NULL CHECK (valor_maximo > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.avaliacoes_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL UNIQUE REFERENCES public.grupos(id) ON DELETE CASCADE,
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  observacoes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notas_rubricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_grupo_id uuid NOT NULL REFERENCES public.avaliacoes_grupos(id) ON DELETE CASCADE,
  rubrica_id uuid NOT NULL REFERENCES public.rubricas(id) ON DELETE RESTRICT,
  nota_atribuida numeric(8, 2) NOT NULL CHECK (nota_atribuida >= 0),
  UNIQUE (avaliacao_grupo_id, rubrica_id)
);

CREATE TABLE IF NOT EXISTS public.ajustes_individuais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  matricula_aluno text NOT NULL,
  pontos numeric(8, 2) NOT NULL DEFAULT 0,
  motivo text NOT NULL DEFAULT '',
  UNIQUE (grupo_id, matricula_aluno)
);

CREATE INDEX IF NOT EXISTS rubricas_turma_id_idx
  ON public.rubricas(turma_id);

CREATE INDEX IF NOT EXISTS avaliacoes_grupos_turma_id_idx
  ON public.avaliacoes_grupos(turma_id);

CREATE INDEX IF NOT EXISTS ajustes_individuais_grupo_id_idx
  ON public.ajustes_individuais(grupo_id);

ALTER TABLE public.rubricas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avaliacoes_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_rubricas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajustes_individuais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professor autorizado gerencia rubricas"
  ON public.rubricas;
CREATE POLICY "Professor autorizado gerencia rubricas"
  ON public.rubricas
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'prof.eduardo.hernandes@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'prof.eduardo.hernandes@gmail.com');

DROP POLICY IF EXISTS "Professor autorizado consulta avaliacoes"
  ON public.avaliacoes_grupos;
CREATE POLICY "Professor autorizado consulta avaliacoes"
  ON public.avaliacoes_grupos
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'prof.eduardo.hernandes@gmail.com');

DROP POLICY IF EXISTS "Professor autorizado consulta notas de rubricas"
  ON public.notas_rubricas;
CREATE POLICY "Professor autorizado consulta notas de rubricas"
  ON public.notas_rubricas
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'prof.eduardo.hernandes@gmail.com');

DROP POLICY IF EXISTS "Professor autorizado consulta ajustes individuais"
  ON public.ajustes_individuais;
CREATE POLICY "Professor autorizado consulta ajustes individuais"
  ON public.ajustes_individuais
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'prof.eduardo.hernandes@gmail.com');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubricas TO authenticated;
GRANT SELECT ON public.avaliacoes_grupos TO authenticated;
GRANT SELECT ON public.notas_rubricas TO authenticated;
GRANT SELECT ON public.ajustes_individuais TO authenticated;

CREATE OR REPLACE FUNCTION public.salvar_avaliacao_grupo(
  p_grupo_id uuid,
  p_turma_id uuid,
  p_observacoes text,
  p_notas jsonb,
  p_ajustes jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_grupo public.grupos%ROWTYPE;
  v_avaliacao_id uuid;
  v_total_rubricas integer;
  v_total_alunos integer;
  v_quantidade_payload integer;
  v_quantidade_unica integer;
BEGIN
  IF coalesce(auth.jwt() ->> 'email', '') <> 'prof.eduardo.hernandes@gmail.com' THEN
    RAISE EXCEPTION 'Apenas o professor autorizado pode salvar avaliações.';
  END IF;

  IF jsonb_typeof(p_notas) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_ajustes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'As notas e os ajustes enviados são inválidos.';
  END IF;

  SELECT grupo.*
  INTO v_grupo
  FROM public.grupos AS grupo
  WHERE grupo.id = p_grupo_id
    AND grupo.turma_id = p_turma_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O grupo não pertence à turma selecionada.';
  END IF;

  SELECT count(*)::integer
  INTO v_total_rubricas
  FROM public.rubricas AS rubrica
  WHERE rubrica.turma_id = v_grupo.turma_id;

  IF v_total_rubricas = 0 THEN
    RAISE EXCEPTION 'Cadastre ao menos uma rubrica para esta turma antes de avaliar.';
  END IF;

  SELECT count(*)::integer, count(DISTINCT nota.rubrica_id)::integer
  INTO v_quantidade_payload, v_quantidade_unica
  FROM jsonb_to_recordset(p_notas) AS nota(
    rubrica_id uuid,
    nota_atribuida numeric
  );

  IF v_quantidade_payload <> v_total_rubricas
     OR v_quantidade_unica <> v_total_rubricas THEN
    RAISE EXCEPTION 'Informe exatamente uma nota para cada rubrica da turma.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_notas) AS nota(
      rubrica_id uuid,
      nota_atribuida numeric
    )
    LEFT JOIN public.rubricas AS rubrica
      ON rubrica.id = nota.rubrica_id
     AND rubrica.turma_id = v_grupo.turma_id
    WHERE rubrica.id IS NULL
       OR nota.nota_atribuida IS NULL
       OR nota.nota_atribuida < 0
       OR nota.nota_atribuida > rubrica.valor_maximo
  ) THEN
    RAISE EXCEPTION 'Uma nota informada é inválida ou excede o valor máximo da rubrica.';
  END IF;

  SELECT count(*)::integer
  INTO v_total_alunos
  FROM public.alunos AS aluno
  WHERE aluno.grupo_id = v_grupo.id;

  SELECT count(*)::integer, count(DISTINCT ajuste.matricula_aluno)::integer
  INTO v_quantidade_payload, v_quantidade_unica
  FROM jsonb_to_recordset(p_ajustes) AS ajuste(
    matricula_aluno text,
    pontos numeric,
    motivo text
  );

  IF v_quantidade_payload <> v_total_alunos
     OR v_quantidade_unica <> v_total_alunos THEN
    RAISE EXCEPTION 'Informe um ajuste para cada integrante do grupo.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_ajustes) AS ajuste(
      matricula_aluno text,
      pontos numeric,
      motivo text
    )
    LEFT JOIN public.alunos AS aluno
      ON aluno.grupo_id = v_grupo.id
     AND aluno.matricula = ajuste.matricula_aluno
    WHERE aluno.id IS NULL
       OR ajuste.pontos IS NULL
       OR ajuste.motivo IS NULL
  ) THEN
    RAISE EXCEPTION 'Um ajuste informado não corresponde a um integrante válido.';
  END IF;

  INSERT INTO public.avaliacoes_grupos (
    grupo_id,
    turma_id,
    observacoes
  )
  VALUES (
    v_grupo.id,
    v_grupo.turma_id,
    coalesce(p_observacoes, '')
  )
  ON CONFLICT (grupo_id) DO UPDATE
  SET turma_id = EXCLUDED.turma_id,
      observacoes = EXCLUDED.observacoes,
      updated_at = now()
  RETURNING id INTO v_avaliacao_id;

  DELETE FROM public.notas_rubricas
  WHERE avaliacao_grupo_id = v_avaliacao_id;

  INSERT INTO public.notas_rubricas (
    avaliacao_grupo_id,
    rubrica_id,
    nota_atribuida
  )
  SELECT
    v_avaliacao_id,
    nota.rubrica_id,
    nota.nota_atribuida
  FROM jsonb_to_recordset(p_notas) AS nota(
    rubrica_id uuid,
    nota_atribuida numeric
  );

  DELETE FROM public.ajustes_individuais
  WHERE grupo_id = v_grupo.id;

  INSERT INTO public.ajustes_individuais (
    grupo_id,
    matricula_aluno,
    pontos,
    motivo
  )
  SELECT
    v_grupo.id,
    ajuste.matricula_aluno,
    ajuste.pontos,
    btrim(ajuste.motivo)
  FROM jsonb_to_recordset(p_ajustes) AS ajuste(
    matricula_aluno text,
    pontos numeric,
    motivo text
  )
  WHERE ajuste.pontos <> 0
     OR btrim(ajuste.motivo) <> '';

  RETURN v_avaliacao_id;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_avaliacao_grupo(
  uuid, uuid, text, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salvar_avaliacao_grupo(
  uuid, uuid, text, jsonb, jsonb
) TO authenticated;
