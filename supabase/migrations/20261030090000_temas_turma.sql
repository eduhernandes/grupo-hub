ALTER TABLE public.configuracoes
  ADD COLUMN IF NOT EXISTS tipo_tema text NOT NULL DEFAULT 'livre';

UPDATE public.configuracoes
SET tipo_tema = 'livre'
WHERE tipo_tema IS NULL
   OR tipo_tema NOT IN ('livre', 'pre_definido');

ALTER TABLE public.configuracoes
  ALTER COLUMN tipo_tema SET DEFAULT 'livre',
  ALTER COLUMN tipo_tema SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'configuracoes_tipo_tema_check'
      AND conrelid = 'public.configuracoes'::regclass
  ) THEN
    ALTER TABLE public.configuracoes
      ADD CONSTRAINT configuracoes_tipo_tema_check
      CHECK (tipo_tema IN ('livre', 'pre_definido'));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.temas_turma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  titulo text NOT NULL CHECK (length(btrim(titulo)) > 0),
  limite_grupos integer NOT NULL DEFAULT 1 CHECK (limite_grupos > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS temas_turma_turma_id_idx
  ON public.temas_turma(turma_id);

ALTER TABLE public.grupos
  ADD COLUMN IF NOT EXISTS tema_turma_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'grupos_tema_turma_id_fkey'
      AND conrelid = 'public.grupos'::regclass
  ) THEN
    ALTER TABLE public.grupos
      ADD CONSTRAINT grupos_tema_turma_id_fkey
      FOREIGN KEY (tema_turma_id)
      REFERENCES public.temas_turma(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS grupos_tema_turma_id_idx
  ON public.grupos(tema_turma_id)
  WHERE tema_turma_id IS NOT NULL;

ALTER TABLE public.temas_turma ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Temas de turma podem ser consultados publicamente"
  ON public.temas_turma;
CREATE POLICY "Temas de turma podem ser consultados publicamente"
  ON public.temas_turma
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Professor autorizado gerencia temas de turma"
  ON public.temas_turma;
CREATE POLICY "Professor autorizado gerencia temas de turma"
  ON public.temas_turma
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'prof.eduardo.hernandes@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'prof.eduardo.hernandes@gmail.com');

GRANT SELECT ON public.temas_turma TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.temas_turma TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_temas_turma(p_turma_id uuid)
RETURNS TABLE (
  id uuid,
  turma_id uuid,
  titulo text,
  limite_grupos integer,
  created_at timestamptz,
  grupos_ocupados integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    tema.id,
    tema.turma_id,
    tema.titulo,
    tema.limite_grupos,
    tema.created_at,
    count(grupo.id)::integer AS grupos_ocupados
  FROM public.temas_turma AS tema
  JOIN public.configuracoes AS configuracao
    ON configuracao.turma_id = tema.turma_id
   AND configuracao.tipo_tema = 'pre_definido'
  LEFT JOIN public.grupos AS grupo
    ON grupo.tema_turma_id = tema.id
  WHERE tema.turma_id = p_turma_id
  GROUP BY tema.id
  ORDER BY tema.titulo;
$$;

REVOKE ALL ON FUNCTION public.listar_temas_turma(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_temas_turma(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.criar_grupo_inscricao(
  p_turma_id uuid,
  p_nome_grupo text,
  p_tema_projeto text,
  p_tema_turma_id uuid,
  p_data_apresentacao_id uuid,
  p_link_repositorio text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo_tema text;
  v_disciplina text;
  v_tema public.temas_turma%ROWTYPE;
  v_grupos_ocupados integer;
  v_tema_projeto text;
  v_grupo_id uuid;
BEGIN
  SELECT disciplina.nome
  INTO v_disciplina
  FROM public.turmas AS turma
  JOIN public.disciplinas AS disciplina
    ON disciplina.id = turma.disciplina_id
  WHERE turma.id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A turma ou disciplina selecionada não foi encontrada.';
  END IF;

  SELECT configuracao.tipo_tema
  INTO v_tipo_tema
  FROM public.configuracoes AS configuracao
  WHERE configuracao.turma_id = p_turma_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'As configurações da turma não foram encontradas.';
  END IF;

  IF v_tipo_tema = 'pre_definido' THEN
    IF p_tema_turma_id IS NULL THEN
      RAISE EXCEPTION 'Selecione um tema pré-definido.';
    END IF;

    SELECT tema.*
    INTO v_tema
    FROM public.temas_turma AS tema
    WHERE tema.id = p_tema_turma_id
      AND tema.turma_id = p_turma_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'O tema selecionado não pertence à turma.';
    END IF;

    SELECT count(*)::integer
    INTO v_grupos_ocupados
    FROM public.grupos AS grupo
    WHERE grupo.tema_turma_id = v_tema.id;

    IF v_grupos_ocupados >= v_tema.limite_grupos THEN
      RAISE EXCEPTION 'Este tema não possui mais vagas disponíveis.';
    END IF;

    v_tema_projeto := v_tema.titulo;
  ELSE
    IF p_tema_turma_id IS NOT NULL THEN
      RAISE EXCEPTION 'A turma está configurada para temas livres.';
    END IF;

    v_tema_projeto := btrim(coalesce(p_tema_projeto, ''));
    IF v_tema_projeto = '' THEN
      RAISE EXCEPTION 'Informe o tema do projeto.';
    END IF;
  END IF;

  INSERT INTO public.grupos (
    nome_grupo,
    disciplina,
    turma_id,
    tema_projeto,
    tema_turma_id,
    link_repositorio,
    data_apresentacao_id
  )
  VALUES (
    btrim(p_nome_grupo),
    v_disciplina,
    p_turma_id,
    v_tema_projeto,
    p_tema_turma_id,
    p_link_repositorio,
    p_data_apresentacao_id
  )
  RETURNING id INTO v_grupo_id;

  RETURN v_grupo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_grupo_inscricao(
  uuid, text, text, uuid, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_grupo_inscricao(
  uuid, text, text, uuid, uuid, text
) TO anon, authenticated;
