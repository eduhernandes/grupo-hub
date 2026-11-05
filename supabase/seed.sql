DO $$
DECLARE
  function_signature regprocedure;
  function_definition text;
  authorization_check constant text :=
    'IF coalesce(auth.jwt() ->> ''email'', '''') <> ''prof.eduardo.hernandes@gmail.com'' THEN';
  local_authorization_check constant text :=
    'IF false THEN';
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    to_regprocedure('public.editar_grupo_professor(uuid,text,text,uuid,uuid,jsonb)'),
    to_regprocedure('public.salvar_avaliacao_grupo(uuid,uuid,text,jsonb,jsonb)')
  ] LOOP
    IF function_signature IS NULL THEN
      RAISE EXCEPTION 'A function required for local professor access was not found.';
    END IF;

    function_definition := pg_get_functiondef(function_signature);
    IF position(authorization_check IN function_definition) = 0 THEN
      RAISE EXCEPTION 'Authorization in function % changed; review the local seed.', function_signature;
    END IF;

    EXECUTE replace(
      function_definition,
      authorization_check,
      local_authorization_check
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['rubricas', 'temas_turma'] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "Acesso do professor no desenvolvimento local" ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "Acesso do professor no desenvolvimento local" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)',
      table_name
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon',
      table_name
    );
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'avaliacoes_grupos',
    'notas_rubricas',
    'ajustes_individuais'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "Acesso do professor no desenvolvimento local" ON public.%I',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "Acesso do professor no desenvolvimento local" ON public.%I FOR SELECT TO anon USING (true)',
      table_name
    );
    EXECUTE format(
      'GRANT SELECT ON public.%I TO anon',
      table_name
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.editar_grupo_professor(
  uuid, text, text, uuid, uuid, jsonb
) TO anon;
GRANT EXECUTE ON FUNCTION public.salvar_avaliacao_grupo(
  uuid, uuid, text, jsonb, jsonb
) TO anon;
