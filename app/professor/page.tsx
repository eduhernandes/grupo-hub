"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  Aluno,
  Configuracao,
  DataApresentacao,
  Grupo,
  NovaData,
} from "@/types/database";

type ConfiguracaoForm = Pick<
  Configuracao,
  | "id"
  | "limite_alunos_min"
  | "limite_alunos_max"
  | "permitir_inscricoes"
>;

interface DataForm {
  data_hora: string;
  disciplina: string;
  turma: string;
  vagas_totais: string;
}

interface AlunoForm {
  id: string | null;
  nome: string;
  matricula: string;
  email: string;
  eh_lider: boolean;
}

interface GrupoForm {
  nome_grupo: string;
  tema_projeto: string;
  link_repositorio: string;
  data_apresentacao_id: string;
}

const dataFormInicial: DataForm = {
  data_hora: "",
  disciplina: "",
  turma: "",
  vagas_totais: "",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isConfiguracao(value: unknown): value is ConfiguracaoForm {
  return (
    isObject(value) &&
    typeof value.id === "number" &&
    typeof value.limite_alunos_min === "number" &&
    typeof value.limite_alunos_max === "number" &&
    typeof value.permitir_inscricoes === "boolean"
  );
}

function isDataApresentacao(value: unknown): value is DataApresentacao {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.data_hora === "string" &&
    typeof value.disciplina === "string" &&
    typeof value.turma === "string" &&
    typeof value.vagas_totais === "number" &&
    typeof value.vagas_ocupadas === "number"
  );
}

function isGrupo(value: unknown): value is Grupo {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.nome_grupo === "string" &&
    typeof value.disciplina === "string" &&
    typeof value.turma === "string" &&
    typeof value.tema_projeto === "string" &&
    (typeof value.link_repositorio === "string" ||
      value.link_repositorio === null) &&
    (typeof value.data_apresentacao_id === "string" ||
      value.data_apresentacao_id === null) &&
    typeof value.criado_em === "string"
  );
}

function isAluno(value: unknown): value is Aluno {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.grupo_id === "string" &&
    typeof value.nome === "string" &&
    typeof value.matricula === "string" &&
    (typeof value.email === "string" ||
      value.email === null ||
      value.email === undefined) &&
    typeof value.eh_lider === "boolean"
  );
}

function parseRows<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
  nome: string,
): T[] {
  if (!Array.isArray(value) || !value.every(guard)) {
    throw new Error(`Os dados recebidos para ${nome} não são válidos.`);
  }

  return value;
}

function formatarData(dataHora: string): string {
  const date = new Date(dataHora);
  if (Number.isNaN(date.getTime())) {
    return "Data inválida";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function mensagemErro(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocorreu um erro inesperado. Tente novamente.";
}

function escaparCsv(valor: string | number): string {
  const texto = String(valor);
  return `"${texto.replaceAll('"', '""')}"`;
}

async function ajustarVaga(dataId: string, delta: 1 | -1): Promise<void> {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const { data: dataAtual, error: erroBusca } = await supabase
      .from("datas_apresentacao")
      .select("vagas_ocupadas, vagas_totais")
      .eq("id", dataId)
      .maybeSingle();

    if (erroBusca) {
      throw new Error(
        `Não foi possível consultar a data para atualizar as vagas: ${erroBusca.message}`,
      );
    }

    if (
      !dataAtual ||
      typeof dataAtual.vagas_ocupadas !== "number" ||
      typeof dataAtual.vagas_totais !== "number"
    ) {
      throw new Error("A data não foi encontrada ou seus dados de vagas são inválidos.");
    }

    const ocupadasNovas = dataAtual.vagas_ocupadas + delta;
    if (ocupadasNovas < 0) {
      throw new Error("A contagem de vagas ocupadas já está zerada.");
    }
    if (ocupadasNovas > dataAtual.vagas_totais) {
      throw new Error("Não há vagas disponíveis nesta data.");
    }

    const { data: atualizada, error: erroAtualizacao } = await supabase
      .from("datas_apresentacao")
      .update({ vagas_ocupadas: ocupadasNovas })
      .eq("id", dataId)
      .eq("vagas_ocupadas", dataAtual.vagas_ocupadas)
      .eq("vagas_totais", dataAtual.vagas_totais)
      .select("id")
      .maybeSingle();

    if (erroAtualizacao) {
      throw new Error(
        `Não foi possível atualizar as vagas: ${erroAtualizacao.message}`,
      );
    }

    if (atualizada) {
      return;
    }
  }

  throw new Error(
    "Não foi possível atualizar a contagem de vagas após várias tentativas.",
  );
}

export default function ProfessorPage() {
  const [configuracao, setConfiguracao] = useState<ConfiguracaoForm | null>(
    null,
  );
  const [datas, setDatas] = useState<DataApresentacao[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [dataForm, setDataForm] = useState<DataForm>(dataFormInicial);
  const [grupoEmEdicao, setGrupoEmEdicao] = useState<Grupo | null>(null);
  const [grupoForm, setGrupoForm] = useState<GrupoForm | null>(null);
  const [alunosForm, setAlunosForm] = useState<AlunoForm[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [salvandoData, setSalvandoData] = useState(false);
  const [salvandoGrupo, setSalvandoGrupo] = useState(false);
  const [removendoData, setRemovendoData] = useState<string | null>(null);
  const [excluindoGrupo, setExcluindoGrupo] = useState<string | null>(null);
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(
    () => new Set(),
  );
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [atualizacao, setAtualizacao] = useState(0);

  function atualizarPainel(): void {
    setErro("");
    setCarregando(true);
    setAtualizacao((valor) => valor + 1);
  }

  const carregarPainel = useCallback(async (): Promise<void> => {
    try {
      const [configResult, datasResult, gruposResult, alunosResult] =
        await Promise.all([
          supabase
            .from("configuracoes")
            .select(
              "id, limite_alunos_min, limite_alunos_max, permitir_inscricoes",
            )
            .limit(1)
            .maybeSingle(),
          supabase
            .from("datas_apresentacao")
            .select(
              "id, data_hora, disciplina, turma, vagas_totais, vagas_ocupadas",
            )
            .order("data_hora", { ascending: true }),
          supabase
            .from("grupos")
            .select(
              "id, nome_grupo, disciplina, turma, tema_projeto, link_repositorio, data_apresentacao_id, criado_em",
            )
            .order("criado_em", { ascending: false }),
          supabase
            .from("alunos")
            .select("id, grupo_id, nome, matricula, email, eh_lider")
            .order("nome", { ascending: true }),
        ]);

      if (configResult.error) {
        throw new Error(
          `Não foi possível carregar as configurações: ${configResult.error.message}`,
        );
      }

      if (!isConfiguracao(configResult.data)) {
        throw new Error(
          "Não foi encontrada uma configuração válida na tabela configuracoes.",
        );
      }

      if (datasResult.error) {
        throw new Error(
          `Não foi possível carregar as datas: ${datasResult.error.message}`,
        );
      }

      if (gruposResult.error) {
        throw new Error(
          `Não foi possível carregar os grupos: ${gruposResult.error.message}`,
        );
      }

      if (alunosResult.error) {
        throw new Error(
          `Não foi possível carregar os integrantes: ${alunosResult.error.message}`,
        );
      }

      setConfiguracao(configResult.data);
      setDatas(parseRows(datasResult.data, isDataApresentacao, "datas"));
      setGrupos(parseRows(gruposResult.data, isGrupo, "grupos"));
      setAlunos(parseRows(alunosResult.data, isAluno, "integrantes"));
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void carregarPainel();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [carregarPainel, atualizacao]);

  const alunosPorGrupo = useMemo(() => {
    const agrupados = new Map<string, Aluno[]>();
    for (const aluno of alunos) {
      const membros = agrupados.get(aluno.grupo_id) ?? [];
      membros.push(aluno);
      agrupados.set(aluno.grupo_id, membros);
    }
    return agrupados;
  }, [alunos]);

  const datasPorId = useMemo(
    () => new Map(datas.map((data) => [data.id, data])),
    [datas],
  );

  async function salvarConfiguracao(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setErro("");
    setAviso("");

    if (!configuracao) {
      setErro("As configurações não foram carregadas.");
      return;
    }

    if (
      !Number.isInteger(configuracao.limite_alunos_min) ||
      !Number.isInteger(configuracao.limite_alunos_max) ||
      configuracao.limite_alunos_min < 1 ||
      configuracao.limite_alunos_max < configuracao.limite_alunos_min
    ) {
      setErro(
        "Informe limites válidos: o mínimo deve ser maior que zero e não pode superar o máximo.",
      );
      return;
    }

    setSalvandoConfig(true);
    try {
      const { data, error: updateError } = await supabase
        .from("configuracoes")
        .update({
          limite_alunos_min: configuracao.limite_alunos_min,
          limite_alunos_max: configuracao.limite_alunos_max,
          permitir_inscricoes: configuracao.permitir_inscricoes,
        })
        .eq("id", configuracao.id)
        .select(
          "id, limite_alunos_min, limite_alunos_max, permitir_inscricoes",
        )
        .maybeSingle();

      if (updateError) {
        throw new Error(
          `Não foi possível salvar as configurações: ${updateError.message}`,
        );
      }

      if (!isConfiguracao(data)) {
        throw new Error(
          "Nenhuma configuração foi atualizada. Verifique as permissões de acesso.",
        );
      }

      setConfiguracao(data);
      setAviso("Configurações salvas com sucesso.");
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function cadastrarData(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErro("");
    setAviso("");

    const vagasTotais = Number(dataForm.vagas_totais);
    const dataLocal = new Date(dataForm.data_hora);

    if (
      !dataForm.data_hora ||
      Number.isNaN(dataLocal.getTime()) ||
      !dataForm.disciplina.trim() ||
      !dataForm.turma.trim() ||
      !Number.isInteger(vagasTotais) ||
      vagasTotais < 1
    ) {
      setErro(
        "Informe data, horário, disciplina, turma e pelo menos uma vaga.",
      );
      return;
    }

    setSalvandoData(true);
    try {
      const novaData: NovaData = {
        data_hora: dataLocal.toISOString(),
        disciplina: dataForm.disciplina.trim(),
        turma: dataForm.turma.trim(),
        vagas_totais: vagasTotais,
        vagas_ocupadas: 0,
      };

      const { error: insertError } = await supabase
        .from("datas_apresentacao")
        .insert(novaData);

      if (insertError) {
        throw new Error(
          `Não foi possível cadastrar a data: ${insertError.message}`,
        );
      }

      setDataForm(dataFormInicial);
      setAviso("Data cadastrada com sucesso.");
      atualizarPainel();
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setSalvandoData(false);
    }
  }

  async function excluirData(data: DataApresentacao): Promise<void> {
    if (data.vagas_ocupadas > 0) {
      setErro(
        "Esta data tem grupos inscritos. Mova ou exclua esses grupos antes de remover a data.",
      );
      return;
    }

    if (
      !window.confirm(
        `Remover a data ${formatarData(data.data_hora)} - ${data.disciplina}, turma ${data.turma}?`,
      )
    ) {
      return;
    }

    setErro("");
    setAviso("");
    setRemovendoData(data.id);
    try {
      const { data: removida, error: deleteError } = await supabase
        .from("datas_apresentacao")
        .delete()
        .eq("id", data.id)
        .eq("vagas_ocupadas", 0)
        .select("id")
        .maybeSingle();

      if (deleteError) {
        throw new Error(`Não foi possível remover a data: ${deleteError.message}`);
      }
      if (!removida) {
        throw new Error(
          "A data não foi removida. Ela pode ter recebido uma inscrição; atualize o painel e tente novamente.",
        );
      }

      setDatas((atuais) => atuais.filter((item) => item.id !== data.id));
      setAviso("Data removida com sucesso.");
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setRemovendoData(null);
    }
  }

  function iniciarEdicaoGrupo(grupo: Grupo): void {
    setErro("");
    setAviso("");
    setGrupoEmEdicao(grupo);
    setGrupoForm({
      nome_grupo: grupo.nome_grupo,
      tema_projeto: grupo.tema_projeto,
      link_repositorio: grupo.link_repositorio ?? "",
      data_apresentacao_id: grupo.data_apresentacao_id ?? "",
    });
    setAlunosForm(
      (alunosPorGrupo.get(grupo.id) ?? []).map((aluno) => ({
        id: aluno.id,
        nome: aluno.nome,
        matricula: aluno.matricula,
        email: aluno.email ?? "",
        eh_lider: aluno.eh_lider,
      })),
    );
  }

  function fecharEdicaoGrupo(): void {
    if (salvandoGrupo) {
      return;
    }
    setGrupoEmEdicao(null);
    setGrupoForm(null);
    setAlunosForm([]);
  }

  async function salvarGrupo(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErro("");
    setAviso("");

    if (!grupoEmEdicao || !grupoForm) {
      setErro("Não há grupo selecionado para edição.");
      return;
    }

    if (
      !grupoForm.nome_grupo.trim() ||
      !grupoForm.tema_projeto.trim() ||
      (grupoForm.link_repositorio.trim() &&
        !/^https?:\/\/\S+$/i.test(grupoForm.link_repositorio.trim()))
    ) {
      setErro(
        "Informe o nome e tema do grupo. O link do repositório, quando preenchido, deve começar com http:// ou https://.",
      );
      return;
    }

    if (
      !configuracao ||
      alunosForm.length < configuracao.limite_alunos_min ||
      alunosForm.length > configuracao.limite_alunos_max
    ) {
      setErro(
        `O grupo deve ter entre ${configuracao?.limite_alunos_min ?? "?"} e ${configuracao?.limite_alunos_max ?? "?"} alunos.`,
      );
      return;
    }

    for (const [indice, aluno] of alunosForm.entries()) {
      if (!aluno.nome.trim() || !aluno.matricula.trim()) {
        setErro(`Preencha nome e matrícula do aluno ${indice + 1}.`);
        return;
      }
      const email = aluno.email.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setErro(`O e-mail do aluno ${indice + 1} não é válido.`);
        return;
      }
    }

    const dataAnteriorId = grupoEmEdicao.data_apresentacao_id;
    const dataNovaId = grupoForm.data_apresentacao_id || null;
    const alterouData = dataAnteriorId !== dataNovaId;
    setSalvandoGrupo(true);
    let vagaNovaReservada = false;
    let grupoAtualizado = false;

    try {
      if (alterouData && dataNovaId) {
        await ajustarVaga(dataNovaId, 1);
        vagaNovaReservada = true;
      }

      let atualizarGrupoQuery = supabase
        .from("grupos")
        .update({
          nome_grupo: grupoForm.nome_grupo.trim(),
          tema_projeto: grupoForm.tema_projeto.trim(),
          link_repositorio: grupoForm.link_repositorio.trim() || null,
          data_apresentacao_id: dataNovaId,
        })
        .eq("id", grupoEmEdicao.id);

      atualizarGrupoQuery = dataAnteriorId
        ? atualizarGrupoQuery.eq("data_apresentacao_id", dataAnteriorId)
        : atualizarGrupoQuery.is("data_apresentacao_id", null);

      const { data: grupoAtualizadoResult, error: erroGrupo } =
        await atualizarGrupoQuery.select("id").maybeSingle();

      if (erroGrupo) {
        throw new Error(`Não foi possível atualizar o grupo: ${erroGrupo.message}`);
      }
      if (!grupoAtualizadoResult) {
        throw new Error(
          "O grupo não foi atualizado. Ele pode ter sido alterado por outro usuário; atualize o painel e tente novamente.",
        );
      }
      grupoAtualizado = true;

      const membrosOriginais = alunosPorGrupo.get(grupoEmEdicao.id) ?? [];
      const idsMantidos = new Set(
        alunosForm.flatMap((aluno) => (aluno.id ? [aluno.id] : [])),
      );
      const alunosAtualizados = alunosForm.map((aluno, indice) => ({
        ...(aluno.id ? { id: aluno.id } : {}),
        grupo_id: grupoEmEdicao.id,
        nome: aluno.nome.trim(),
        matricula: aluno.matricula.trim(),
        email: aluno.email.trim() || null,
        eh_lider: indice === 0,
      }));

      if (alunosAtualizados.length > 0) {
        const { error: erroAlunos } = await supabase
          .from("alunos")
          .upsert(alunosAtualizados);
        if (erroAlunos) {
          throw new Error(
            `O grupo foi atualizado, mas não foi possível salvar os alunos: ${erroAlunos.message}`,
          );
        }
      }

      const idsRemover = membrosOriginais
        .filter((aluno) => !idsMantidos.has(aluno.id))
        .map((aluno) => aluno.id);
      if (idsRemover.length > 0) {
        const { error: erroRemocaoAlunos } = await supabase
          .from("alunos")
          .delete()
          .in("id", idsRemover);
        if (erroRemocaoAlunos) {
          throw new Error(
            `O grupo e os alunos restantes foram atualizados, mas alguns alunos removidos não puderam ser excluídos: ${erroRemocaoAlunos.message}`,
          );
        }
      }

      if (alterouData && dataAnteriorId) {
        await ajustarVaga(dataAnteriorId, -1);
      }

      setAviso("Grupo e alunos atualizados com sucesso.");
      setGrupoEmEdicao(null);
      setGrupoForm(null);
      setAlunosForm([]);
      atualizarPainel();
    } catch (error: unknown) {
      const errosRollback: string[] = [];

      if (grupoAtualizado) {
        const { error: erroRollbackGrupo } = await supabase
          .from("grupos")
          .update({ data_apresentacao_id: dataAnteriorId })
          .eq("id", grupoEmEdicao.id);
        if (erroRollbackGrupo) {
          errosRollback.push(
            `Não foi possível restaurar a data anterior do grupo: ${erroRollbackGrupo.message}`,
          );
        }
      }

      if (vagaNovaReservada && dataNovaId) {
        try {
          await ajustarVaga(dataNovaId, -1);
        } catch (erroRollback: unknown) {
          errosRollback.push(mensagemErro(erroRollback));
        }
      }

      if (errosRollback.length > 0) {
        atualizarPainel();
      }

      setErro(
        [mensagemErro(error), ...errosRollback].join(" "),
      );
    } finally {
      setSalvandoGrupo(false);
    }
  }

  function adicionarAlunoEdicao(): void {
    if (
      !configuracao ||
      alunosForm.length >= configuracao.limite_alunos_max
    ) {
      return;
    }
    setAlunosForm((atuais) => [
      ...atuais,
      {
        id: null,
        nome: "",
        matricula: "",
        email: "",
        eh_lider: atuais.length === 0,
      },
    ]);
  }

  function atualizarAlunoEdicao(
    indice: number,
    campo: "nome" | "matricula" | "email",
    valor: string,
  ): void {
    setAlunosForm((atuais) =>
      atuais.map((aluno, indiceAtual) =>
        indiceAtual === indice ? { ...aluno, [campo]: valor } : aluno,
      ),
    );
  }

  function removerAlunoEdicao(indice: number): void {
    if (!configuracao || alunosForm.length <= configuracao.limite_alunos_min) {
      return;
    }
    setAlunosForm((atuais) =>
      atuais
        .filter((_, indiceAtual) => indiceAtual !== indice)
        .map((aluno, indiceAtual) => ({
          ...aluno,
          eh_lider: indiceAtual === 0,
        })),
    );
  }

  async function excluirGrupo(grupo: Grupo): Promise<void> {
    const confirmar = window.confirm(
      `Tem certeza de que deseja excluir o grupo "${grupo.nome_grupo}"? Esta ação não pode ser desfeita.`,
    );
    if (!confirmar) {
      return;
    }

    setErro("");
    setAviso("");
    setExcluindoGrupo(grupo.id);

    try {
      const { data: removido, error: deleteError } = await supabase
        .from("grupos")
        .delete()
        .eq("id", grupo.id)
        .select("id")
        .maybeSingle();

      if (deleteError) {
        throw new Error(
          `Não foi possível excluir o grupo: ${deleteError.message}`,
        );
      }

      if (!removido) {
        throw new Error(
          "O grupo não foi excluído. Verifique as permissões de acesso.",
        );
      }

      if (grupo.data_apresentacao_id) {
        try {
          await ajustarVaga(grupo.data_apresentacao_id, -1);
        } catch (errorVaga: unknown) {
          atualizarPainel();
          throw new Error(
            `O grupo foi excluído e seus integrantes foram removidos, mas a vaga não pôde ser atualizada. ${mensagemErro(errorVaga)}`,
          );
        }
      }

      setAlunos((atuais) =>
        atuais.filter((aluno) => aluno.grupo_id !== grupo.id),
      );
      setGrupos((atuais) => atuais.filter((item) => item.id !== grupo.id));
      setAviso(`Grupo "${grupo.nome_grupo}" excluído com sucesso.`);
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setExcluindoGrupo(null);
    }
  }

  function alternarMembros(grupoId: string): void {
    setGruposExpandidos((atuais) => {
      const prox = new Set(atuais);
      if (prox.has(grupoId)) {
        prox.delete(grupoId);
      } else {
        prox.add(grupoId);
      }
      return prox;
    });
  }

  function exportarCsv(): void {
    const cabecalho = [
      "Nome do grupo",
      "Disciplina",
      "Turma",
      "Tema do projeto",
      "Data de apresentacao",
      "Quantidade de alunos",
      "Nome do aluno",
      "Matricula",
      "E-mail",
      "Lider",
    ];

    const linhas: string[][] = [cabecalho];
    for (const grupo of grupos) {
      const membros = alunosPorGrupo.get(grupo.id) ?? [];
      const data = grupo.data_apresentacao_id
        ? datasPorId.get(grupo.data_apresentacao_id)
        : undefined;
      const dataApresentacao = data
        ? formatarData(data.data_hora)
        : "Sem data";

      if (membros.length === 0) {
        linhas.push([
          grupo.nome_grupo,
          grupo.disciplina,
          grupo.turma,
          grupo.tema_projeto,
          dataApresentacao,
          "0",
          "",
          "",
          "",
          "",
        ]);
        continue;
      }

      for (const membro of membros) {
        linhas.push([
          grupo.nome_grupo,
          grupo.disciplina,
          grupo.turma,
          grupo.tema_projeto,
          dataApresentacao,
          String(membros.length),
          membro.nome,
          membro.matricula,
          membro.email ?? "",
          membro.eh_lider ? "Sim" : "Nao",
        ]);
      }
    }

    const conteudo = `\uFEFF${linhas
      .map((linha) => linha.map(escaparCsv).join(","))
      .join("\r\n")}`;
    const arquivo = new Blob([conteudo], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = url;
    link.download = `grupohub-grupos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
              GrupoHub
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              Painel do professor
            </h1>
            <p className="mt-2 text-slate-600">
              Gerencie inscrições, datas de apresentação e grupos.
            </p>
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
            disabled={carregando}
            onClick={atualizarPainel}
            type="button"
          >
            <RefreshCw
              className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`}
            />
            Atualizar painel
          </button>
        </header>

        {erro && (
          <div
            className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{erro}</p>
          </div>
        )}

        {aviso && (
          <div
            className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-900"
            role="status"
          >
            <Check className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{aviso}</p>
          </div>
        )}

        {carregando && !configuracao ? (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-12 text-slate-600">
            <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" />
            Carregando dados do painel...
          </div>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                    <Settings2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Configurações globais
                    </h2>
                    <p className="text-sm text-slate-500">
                      Defina os limites e o status das inscrições.
                    </p>
                  </div>
                </div>
                {configuracao && (
                  <form className="space-y-5" onSubmit={(event) => void salvarConfiguracao(event)}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-slate-700">
                          Mínimo de alunos
                        </span>
                        <input
                          className="w-full rounded-lg border border-slate-300 px-3.5 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                          min={1}
                          onChange={(event) =>
                            setConfiguracao({
                              ...configuracao,
                              limite_alunos_min: Number(event.target.value),
                            })
                          }
                          required
                          type="number"
                          value={configuracao.limite_alunos_min}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-slate-700">
                          Máximo de alunos
                        </span>
                        <input
                          className="w-full rounded-lg border border-slate-300 px-3.5 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                          min={configuracao.limite_alunos_min}
                          onChange={(event) =>
                            setConfiguracao({
                              ...configuracao,
                              limite_alunos_max: Number(event.target.value),
                            })
                          }
                          required
                          type="number"
                          value={configuracao.limite_alunos_max}
                        />
                      </label>
                    </div>
                    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                      <span>
                        <span className="block text-sm font-semibold text-slate-800">
                          Inscrições abertas
                        </span>
                        <span className="mt-1 block text-sm text-slate-500">
                          {configuracao.permitir_inscricoes
                            ? "Grupos podem se inscrever."
                            : "Novas inscrições estão bloqueadas."}
                        </span>
                      </span>
                      <input
                        aria-label="Permitir inscrições"
                        checked={configuracao.permitir_inscricoes}
                        className="h-5 w-5 accent-emerald-700"
                        onChange={(event) =>
                          setConfiguracao({
                            ...configuracao,
                            permitir_inscricoes: event.target.checked,
                          })
                        }
                        type="checkbox"
                      />
                    </label>
                    <button
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={salvandoConfig}
                      type="submit"
                    >
                      {salvandoConfig ? (
                        <>
                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        "Salvar configurações"
                      )}
                    </button>
                  </form>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Datas de apresentação
                    </h2>
                    <p className="text-sm text-slate-500">
                      Cadastre horários e acompanhe as vagas.
                    </p>
                  </div>
                </div>
                <form
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_150px_auto]"
                  onSubmit={(event) => void cadastrarData(event)}
                >
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Data e horário
                    </span>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      onChange={(event) =>
                        setDataForm({
                          ...dataForm,
                          data_hora: event.target.value,
                        })
                      }
                      required
                      type="datetime-local"
                      value={dataForm.data_hora}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Disciplina
                    </span>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      onChange={(event) =>
                        setDataForm({
                          ...dataForm,
                          disciplina: event.target.value,
                        })
                      }
                      required
                      value={dataForm.disciplina}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Turma
                    </span>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      onChange={(event) =>
                        setDataForm({
                          ...dataForm,
                          turma: event.target.value,
                        })
                      }
                      required
                      value={dataForm.turma}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Vagas totais
                    </span>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      min={1}
                      onChange={(event) =>
                        setDataForm({
                          ...dataForm,
                          vagas_totais: event.target.value,
                        })
                      }
                      required
                      type="number"
                      value={dataForm.vagas_totais}
                    />
                  </label>
                  <button
                    className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    disabled={salvandoData}
                    type="submit"
                  >
                    {salvandoData ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Cadastrar
                  </button>
                </form>
                <div className="mt-6 space-y-3">
                  {datas.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                      Nenhuma data cadastrada.
                    </p>
                  ) : (
                    datas.map((data) => (
                      <div
                        className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                        key={data.id}
                      >
                        <div>
                          <span className="block font-medium text-slate-800">
                            {formatarData(data.data_hora)}
                          </span>
                          <span className="mt-1 block text-sm text-slate-500">
                            {data.disciplina} · Turma {data.turma}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 sm:justify-end">
                          <span className="text-sm text-slate-600">
                            <strong className="text-slate-900">
                              {data.vagas_ocupadas}
                            </strong>{" "}
                            ocupadas de{" "}
                            <strong className="text-slate-900">
                              {data.vagas_totais}
                            </strong>{" "}
                            vagas
                          </span>
                          <button
                            aria-label={`Remover data de ${formatarData(data.data_hora)} - ${data.disciplina}, turma ${data.turma}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={
                              data.vagas_ocupadas > 0 ||
                              removendoData === data.id
                            }
                            onClick={() => void excluirData(data)}
                            title={
                              data.vagas_ocupadas > 0
                                ? "Não é possível remover uma data com grupos inscritos"
                                : "Remover data"
                            }
                            type="button"
                          >
                            {removendoData === data.id ? (
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            Remover
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Grupos inscritos
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {grupos.length} {grupos.length === 1 ? "grupo" : "grupos"}{" "}
                    cadastrados
                  </p>
                </div>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={grupos.length === 0}
                  onClick={exportarCsv}
                  type="button"
                >
                  <Download className="h-4 w-4" />
                  Exportar para CSV
                </button>
              </div>

              {grupos.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <Users className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 font-medium text-slate-700">
                    Ainda não há grupos inscritos.
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Os grupos cadastrados aparecerão nesta lista.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-5 py-3.5 font-semibold">Grupo</th>
                        <th className="px-5 py-3.5 font-semibold">
                          Disciplina
                        </th>
                        <th className="px-5 py-3.5 font-semibold">Turma</th>
                        <th className="px-5 py-3.5 font-semibold">Tema</th>
                        <th className="px-5 py-3.5 font-semibold">
                          Apresentação
                        </th>
                        <th className="px-5 py-3.5 font-semibold">Alunos</th>
                        <th className="px-5 py-3.5 text-right font-semibold">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {grupos.map((grupo) => {
                        const membros = alunosPorGrupo.get(grupo.id) ?? [];
                        const data = grupo.data_apresentacao_id
                          ? datasPorId.get(grupo.data_apresentacao_id)
                          : undefined;
                        const expandido = gruposExpandidos.has(grupo.id);

                        return (
                          <FragmentGrupo
                            key={grupo.id}
                            grupo={grupo}
                            membros={membros}
                            dataLabel={
                              data ? formatarData(data.data_hora) : "Sem data"
                            }
                            expandido={expandido}
                            excluindo={excluindoGrupo === grupo.id}
                            onExpandir={() => alternarMembros(grupo.id)}
                            onEditar={() => iniciarEdicaoGrupo(grupo)}
                            onExcluir={() => void excluirGrupo(grupo)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      {grupoEmEdicao && grupoForm && (
        <div
          aria-labelledby="titulo-edicao-grupo"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
        >
          <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-8">
            <header className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2
                  className="text-xl font-bold text-slate-950"
                  id="titulo-edicao-grupo"
                >
                  Editar grupo e alunos
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Atualize os dados do grupo, apresentação e integrantes.
                </p>
              </div>
              <button
                aria-label="Fechar edição"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
                onClick={fecharEdicaoGrupo}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <form className="space-y-7" onSubmit={(event) => void salvarGrupo(event)}>
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="sr-only">Dados do grupo</legend>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Nome do grupo
                  </span>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                    maxLength={100}
                    onChange={(event) =>
                      setGrupoForm({
                        ...grupoForm,
                        nome_grupo: event.target.value,
                      })
                    }
                    required
                    value={grupoForm.nome_grupo}
                  />
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Tema do projeto
                  </span>
                  <textarea
                    className="min-h-24 w-full rounded-lg border border-slate-300 px-3.5 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                    maxLength={500}
                    onChange={(event) =>
                      setGrupoForm({
                        ...grupoForm,
                        tema_projeto: event.target.value,
                      })
                    }
                    required
                    value={grupoForm.tema_projeto}
                  />
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Link do repositório <span className="font-normal text-slate-500">(opcional)</span>
                  </span>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                    maxLength={2048}
                    onChange={(event) =>
                      setGrupoForm({
                        ...grupoForm,
                        link_repositorio: event.target.value,
                      })
                    }
                    placeholder="https://github.com/..."
                    type="url"
                    value={grupoForm.link_repositorio}
                  />
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Data de apresentação
                  </span>
                  <select
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                    onChange={(event) =>
                      setGrupoForm({
                        ...grupoForm,
                        data_apresentacao_id: event.target.value,
                      })
                    }
                    value={grupoForm.data_apresentacao_id}
                  >
                    <option value="">Sem data</option>
                    {datas
                      .filter(
                        (data) =>
                          data.disciplina === grupoEmEdicao.disciplina &&
                          data.turma === grupoEmEdicao.turma &&
                          (data.vagas_ocupadas < data.vagas_totais ||
                            data.id ===
                              grupoEmEdicao.data_apresentacao_id),
                      )
                      .map((data) => (
                        <option key={data.id} value={data.id}>
                          {formatarData(data.data_hora)} · {data.disciplina} ·
                          Turma {data.turma} ·{" "}
                          {data.vagas_totais - data.vagas_ocupadas} vagas
                          {data.id === grupoEmEdicao.data_apresentacao_id
                            ? " (atual)"
                            : ""}
                        </option>
                      ))}
                  </select>
                </label>
              </fieldset>

              <section>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">Alunos</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      O primeiro aluno será definido como líder.
                    </p>
                  </div>
                  <button
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      !configuracao ||
                      alunosForm.length >= configuracao.limite_alunos_max
                    }
                    onClick={adicionarAlunoEdicao}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar aluno
                  </button>
                </div>
                <div className="space-y-3">
                  {alunosForm.map((aluno, indice) => (
                    <fieldset
                      className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"
                      key={aluno.id ?? `novo-${indice}`}
                    >
                      <legend className="sr-only">
                        {indice === 0 ? "Líder do grupo" : `Aluno ${indice + 1}`}
                      </legend>
                      <div className="flex items-center justify-between gap-3 sm:col-span-2">
                        <span className="text-sm font-bold text-slate-800">
                          {indice === 0 ? "Líder do grupo" : `Aluno ${indice + 1}`}
                        </span>
                        <button
                          aria-label={`Remover aluno ${indice + 1}`}
                          className="rounded-md p-1.5 text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={
                            !configuracao ||
                            alunosForm.length <= configuracao.limite_alunos_min
                          }
                          onClick={() => removerAlunoEdicao(indice)}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold text-slate-600">
                          Nome
                        </span>
                        <input
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                          maxLength={150}
                          onChange={(event) =>
                            atualizarAlunoEdicao(
                              indice,
                              "nome",
                              event.target.value,
                            )
                          }
                          required
                          value={aluno.nome}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold text-slate-600">
                          Matrícula
                        </span>
                        <input
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                          maxLength={50}
                          onChange={(event) =>
                            atualizarAlunoEdicao(
                              indice,
                              "matricula",
                              event.target.value,
                            )
                          }
                          required
                          value={aluno.matricula}
                        />
                      </label>
                      <label className="space-y-1.5 sm:col-span-2">
                        <span className="text-xs font-semibold text-slate-600">
                          E-mail (opcional)
                        </span>
                        <input
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                          maxLength={254}
                          onChange={(event) =>
                            atualizarAlunoEdicao(
                              indice,
                              "email",
                              event.target.value,
                            )
                          }
                          type="email"
                          value={aluno.email}
                        />
                      </label>
                    </fieldset>
                  ))}
                </div>
              </section>

              <footer className="flex flex-col-reverse justify-end gap-3 border-t border-slate-200 pt-5 sm:flex-row">
                <button
                  className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  disabled={salvandoGrupo}
                  onClick={fecharEdicaoGrupo}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={salvandoGrupo}
                  type="submit"
                >
                  {salvandoGrupo ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {salvandoGrupo ? "Salvando..." : "Salvar alterações"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

interface FragmentGrupoProps {
  grupo: Grupo;
  membros: Aluno[];
  dataLabel: string;
  expandido: boolean;
  excluindo: boolean;
  onExpandir: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}

function FragmentGrupo({
  grupo,
  membros,
  dataLabel,
  expandido,
  excluindo,
  onExpandir,
  onEditar,
  onExcluir,
}: FragmentGrupoProps) {
  return (
    <>
      <tr className="align-top text-slate-700">
        <td className="px-5 py-4 font-semibold text-slate-900">
          {grupo.nome_grupo}
        </td>
        <td className="px-5 py-4">{grupo.disciplina}</td>
        <td className="px-5 py-4">{grupo.turma}</td>
        <td className="max-w-64 px-5 py-4">
          <span className="line-clamp-2" title={grupo.tema_projeto}>
            {grupo.tema_projeto}
          </span>
        </td>
        <td className="px-5 py-4">{dataLabel}</td>
        <td className="px-5 py-4">{membros.length}</td>
        <td className="px-5 py-4">
          <div className="flex justify-end gap-2">
            <button
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
              onClick={onEditar}
              type="button"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
            <button
              aria-expanded={expandido}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              onClick={onExpandir}
              type="button"
            >
              {expandido ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {expandido ? "Ocultar membros" : "Ver membros"}
            </button>
            <button
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={excluindo}
              onClick={onExcluir}
              type="button"
            >
              {excluindo ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Excluir
            </button>
          </div>
        </td>
      </tr>
      {expandido && (
        <tr className="bg-slate-50">
          <td className="px-5 py-4" colSpan={7}>
            {membros.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhum integrante encontrado para este grupo.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {membros.map((membro) => (
                  <li
                    className="rounded-xl border border-slate-200 bg-white p-4"
                    key={membro.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {membro.nome}
                      </span>
                      {membro.eh_lider && (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900">
                          Líder
                        </span>
                      )}
                    </div>
                    <dl className="mt-3 grid gap-1.5 text-sm text-slate-600">
                      <div className="flex gap-2">
                        <dt className="font-medium text-slate-700">
                          Matrícula:
                        </dt>
                        <dd>{membro.matricula}</dd>
                      </div>
                      <div className="flex min-w-0 gap-2">
                        <dt className="shrink-0 font-medium text-slate-700">
                          E-mail:
                        </dt>
                        <dd className="break-all">{membro.email || "—"}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
