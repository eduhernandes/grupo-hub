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
  Upload,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  Aluno,
  Configuracao,
  DataApresentacao,
  Disciplina,
  Grupo,
  NovaData,
  NovaDisciplina,
  NovaTurma,
  Turma,
} from "@/types/database";

export const dynamic = 'force-dynamic'

type ConfiguracaoForm = Pick<
  Configuracao,
  | "id"
  | "limite_alunos_min"
  | "limite_alunos_max"
  | "permitir_inscricoes"
>;

interface DataForm {
  data_hora: string;
  turma_id: string;
  vagas_totais: string;
}

interface DataEdicaoForm {
  id: string;
  data_hora: string;
  vagas_totais: string;
}

interface DisciplinaForm {
  nome: string;
}

interface TurmaForm {
  disciplina_id: string;
  nome_turma: string;
}

interface AlunoPermitidoImportacao {
  turma_id: string;
  matricula: string;
  nome: string;
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
  turma_id: string;
  tema_projeto: string;
  link_repositorio: string;
  data_apresentacao_id: string;
}

const dataFormInicial: DataForm = {
  data_hora: "",
  turma_id: "",
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
    typeof value.turma_id === "string" &&
    typeof value.data_hora === "string" &&
    typeof value.vagas_totais === "number" &&
    typeof value.vagas_ocupadas === "number"
  );
}

function isGrupo(value: unknown): value is Grupo {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.nome_grupo === "string" &&
    typeof value.turma_id === "string" &&
    typeof value.tema_projeto === "string" &&
    (typeof value.link_repositorio === "string" ||
      value.link_repositorio === null) &&
    (typeof value.data_apresentacao_id === "string" ||
      value.data_apresentacao_id === null)
  );
}

function isDisciplina(value: unknown): value is Disciplina {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.nome === "string"
  );
}

function isTurma(value: unknown): value is Turma {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.disciplina_id === "string" &&
    typeof value.nome_turma === "string"
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

function formatarDataParaInput(dataHora: string): string {
  const date = new Date(dataHora);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (valor: number) => String(valor).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function parsearCsvAlunos(conteudo: string): AlunoPermitidoImportacao[] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;

  for (let indice = 0; indice < conteudo.length; indice += 1) {
    const caractere = conteudo[indice];

    if (entreAspas) {
      if (caractere === '"' && conteudo[indice + 1] === '"') {
        campo += '"';
        indice += 1;
      } else if (caractere === '"') {
        entreAspas = false;
      } else {
        campo += caractere;
      }
      continue;
    }

    if (caractere === '"') {
      entreAspas = true;
    } else if (caractere === ",") {
      linha.push(campo);
      campo = "";
    } else if (caractere === "\n" || caractere === "\r") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
      if (caractere === "\r" && conteudo[indice + 1] === "\n") {
        indice += 1;
      }
    } else {
      campo += caractere;
    }
  }

  if (entreAspas) {
    throw new Error("O CSV contém um campo entre aspas que não foi fechado.");
  }

  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  const linhasComDados = linhas
    .map((campos) =>
      campos.map((valor, indice) =>
        indice === 0 ? valor.replace(/^\uFEFF/, "").trim() : valor.trim(),
      ),
    )
    .filter((campos) => campos.some((valor) => valor.length > 0));
  const primeiraLinha = linhasComDados[0];
  const normalizarCabecalho = (valor: string | undefined) =>
    valor
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const inicio =
    normalizarCabecalho(primeiraLinha?.[0]) === "matricula" &&
    normalizarCabecalho(primeiraLinha?.[1]) === "nome"
      ? 1
      : 0;
  const registros = new Map<string, AlunoPermitidoImportacao>();

  for (let indice = inicio; indice < linhasComDados.length; indice += 1) {
    const campos = linhasComDados[indice];
    if (campos.length !== 2 || !campos[0] || !campos[1]) {
      throw new Error(
        `A linha ${indice + 1} deve conter exatamente matrícula e nome.`,
      );
    }

    registros.set(campos[0], {
      turma_id: "",
      matricula: campos[0],
      nome: campos[1],
    });
  }

  if (registros.size === 0) {
    throw new Error("O CSV não contém alunos para importar.");
  }

  return [...registros.values()];
}

function lerArquivoCsv(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Não foi possível ler o conteúdo do arquivo CSV."));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(
        new Error(
          reader.error?.message ?? "Ocorreu um erro ao ler o arquivo CSV.",
        ),
      );
    };

    reader.onabort = () => {
      reject(new Error("A leitura do arquivo CSV foi cancelada."));
    };

    reader.readAsText(arquivo, "UTF-8");
  });
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
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [dataForm, setDataForm] = useState<DataForm>(dataFormInicial);
  const [dataEmEdicao, setDataEmEdicao] = useState<DataEdicaoForm | null>(
    null,
  );
  const [disciplinaForm, setDisciplinaForm] = useState<DisciplinaForm>({
    nome: "",
  });
  const [turmaForm, setTurmaForm] = useState<TurmaForm>({
    disciplina_id: "",
    nome_turma: "",
  });
  const [turmaImportacaoId, setTurmaImportacaoId] = useState("");
  const [arquivoImportacao, setArquivoImportacao] = useState<File | null>(null);
  const [chaveInputArquivo, setChaveInputArquivo] = useState(0);
  const [grupoEmEdicao, setGrupoEmEdicao] = useState<Grupo | null>(null);
  const [grupoForm, setGrupoForm] = useState<GrupoForm | null>(null);
  const [alunosForm, setAlunosForm] = useState<AlunoForm[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [salvandoData, setSalvandoData] = useState(false);
  const [atualizandoData, setAtualizandoData] = useState(false);
  const [salvandoDisciplina, setSalvandoDisciplina] = useState(false);
  const [salvandoTurma, setSalvandoTurma] = useState(false);
  const [importandoAlunos, setImportandoAlunos] = useState(false);
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
      const [
        configResult,
        disciplinasResult,
        turmasResult,
        datasResult,
        gruposResult,
        alunosResult,
      ] =
        await Promise.all([
          supabase
            .from("configuracoes")
            .select(
              "id, limite_alunos_min, limite_alunos_max, permitir_inscricoes",
            )
            .limit(1)
            .maybeSingle(),
          supabase
            .from("disciplinas")
            .select("id, nome")
            .order("nome", { ascending: true }),
          supabase
            .from("turmas")
            .select("id, disciplina_id, nome_turma")
            .order("nome_turma", { ascending: true }),
          supabase
            .from("datas_apresentacao")
            .select(
              "id, turma_id, data_hora, vagas_totais, vagas_ocupadas",
            )
            .order("data_hora", { ascending: true }),
          supabase
            .from("grupos")
            .select(
              "id, nome_grupo, turma_id, tema_projeto, link_repositorio, data_apresentacao_id",
            )
            .order("nome_grupo", { ascending: true }),
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

      if (disciplinasResult.error) {
        throw new Error(
          `Não foi possível carregar as disciplinas: ${disciplinasResult.error.message}`,
        );
      }

      if (turmasResult.error) {
        throw new Error(
          `Não foi possível carregar as turmas: ${turmasResult.error.message}`,
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
      setDisciplinas(
        parseRows(disciplinasResult.data, isDisciplina, "disciplinas"),
      );
      setTurmas(parseRows(turmasResult.data, isTurma, "turmas"));
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
  const disciplinasPorId = useMemo(
    () => new Map(disciplinas.map((disciplina) => [disciplina.id, disciplina])),
    [disciplinas],
  );
  const turmasPorId = useMemo(
    () => new Map(turmas.map((turma) => [turma.id, turma])),
    [turmas],
  );
  const turmasParaEdicao = turmas;

  async function cadastrarDisciplina(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setErro("");
    setAviso("");
    const nome = disciplinaForm.nome.trim();
    if (!nome) {
      setErro("Informe o nome da disciplina.");
      return;
    }

    setSalvandoDisciplina(true);
    try {
      const novaDisciplina: NovaDisciplina = { nome };
      const { error: insertError } = await supabase
        .from("disciplinas")
        .insert(novaDisciplina);
      if (insertError) {
        throw new Error(
          `Não foi possível cadastrar a disciplina: ${insertError.message}`,
        );
      }

      setDisciplinaForm({ nome: "" });
      setAviso("Disciplina cadastrada com sucesso.");
      atualizarPainel();
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setSalvandoDisciplina(false);
    }
  }

  async function cadastrarTurma(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setErro("");
    setAviso("");
    if (!turmaForm.disciplina_id || !turmaForm.nome_turma.trim()) {
      setErro("Selecione uma disciplina e informe o nome da turma.");
      return;
    }

    setSalvandoTurma(true);
    try {
      const novaTurma: NovaTurma = {
        disciplina_id: turmaForm.disciplina_id,
        nome_turma: turmaForm.nome_turma.trim(),
      };
      const { error: insertError } = await supabase
        .from("turmas")
        .insert(novaTurma);
      if (insertError) {
        throw new Error(
          `Não foi possível cadastrar a turma: ${insertError.message}`,
        );
      }

      setTurmaForm((atual) => ({ ...atual, nome_turma: "" }));
      setAviso("Turma cadastrada com sucesso.");
      atualizarPainel();
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setSalvandoTurma(false);
    }
  }

  async function importarAlunosPermitidos(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setErro("");
    setAviso("");

    if (!turmaImportacaoId) {
      setErro("Selecione uma turma para importar os alunos.");
      return;
    }

    if (!arquivoImportacao) {
      setErro("Selecione uma turma e um arquivo CSV.");
      return;
    }

    if (!turmasPorId.has(turmaImportacaoId)) {
      setErro("A turma selecionada não foi encontrada. Atualize o painel.");
      return;
    }

    if (!arquivoImportacao.name.toLocaleLowerCase("pt-BR").endsWith(".csv")) {
      setErro("O arquivo selecionado deve ter a extensão .csv.");
      return;
    }

    setImportandoAlunos(true);
    try {
      const conteudo = await lerArquivoCsv(arquivoImportacao);
      const registros = parsearCsvAlunos(conteudo).map((registro) => ({
        ...registro,
        turma_id: turmaImportacaoId,
      }));

      const { error: importError } = await supabase
        .from("alunos_permitidos")
        .upsert(registros, { onConflict: "turma_id,matricula" });

      if (importError) {
        throw new Error(
          `Não foi possível importar a lista de alunos: ${importError.message}`,
        );
      }

      setAviso(
        `${registros.length} ${registros.length === 1 ? "aluno importado" : "alunos importados"} para a turma ${turmasPorId.get(turmaImportacaoId)?.nome_turma ?? ""}.`,
      );
      setArquivoImportacao(null);
      setChaveInputArquivo((valor) => valor + 1);
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setImportandoAlunos(false);
    }
  }

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
      !dataForm.turma_id ||
      !Number.isInteger(vagasTotais) ||
      vagasTotais < 1
    ) {
      setErro("Informe data, horário, turma e pelo menos uma vaga.");
      return;
    }

    setSalvandoData(true);
    try {
      const novaData: NovaData = {
        turma_id: dataForm.turma_id,
        data_hora: dataLocal.toISOString(),
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

  function iniciarEdicaoData(data: DataApresentacao): void {
    setErro("");
    setAviso("");
    setDataEmEdicao({
      id: data.id,
      data_hora: formatarDataParaInput(data.data_hora),
      vagas_totais: String(data.vagas_totais),
    });
  }

  async function salvarEdicaoData(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErro("");
    setAviso("");

    if (!dataEmEdicao) {
      setErro("Não há data selecionada para edição.");
      return;
    }

    const vagasTotais = Number(dataEmEdicao.vagas_totais);
    const dataLocal = new Date(dataEmEdicao.data_hora);
    if (
      Number.isNaN(dataLocal.getTime()) ||
      !Number.isInteger(vagasTotais) ||
      vagasTotais < 1
    ) {
      setErro("Informe uma data e horário válidos e pelo menos uma vaga.");
      return;
    }

    setAtualizandoData(true);
    try {
      const { data: dataAtual, error: erroBusca } = await supabase
        .from("datas_apresentacao")
        .select("vagas_ocupadas")
        .eq("id", dataEmEdicao.id)
        .maybeSingle();

      if (erroBusca) {
        throw new Error(
          `Não foi possível verificar as vagas ocupadas: ${erroBusca.message}`,
        );
      }

      if (!dataAtual || typeof dataAtual.vagas_ocupadas !== "number") {
        throw new Error("A data selecionada não foi encontrada.");
      }

      if (vagasTotais < dataAtual.vagas_ocupadas) {
        const mensagem = `As vagas totais não podem ser menores que as ${dataAtual.vagas_ocupadas} vagas já ocupadas.`;
        window.alert(mensagem);
        setErro(mensagem);
        return;
      }

      const { data: atualizada, error: erroAtualizacao } = await supabase
        .from("datas_apresentacao")
        .update({
          vagas_totais: vagasTotais,
          data_hora: dataLocal.toISOString(),
        })
        .eq("id", dataEmEdicao.id)
        .eq("vagas_ocupadas", dataAtual.vagas_ocupadas)
        .select(
          "id, turma_id, data_hora, vagas_totais, vagas_ocupadas",
        )
        .maybeSingle();

      if (erroAtualizacao) {
        throw new Error(
          `Não foi possível atualizar a data de apresentação: ${erroAtualizacao.message}`,
        );
      }

      if (!isDataApresentacao(atualizada)) {
        throw new Error(
          "A data não foi atualizada; as vagas podem ter mudado. Atualize o painel e tente novamente.",
        );
      }

      setDatas((atuais) =>
        atuais
          .map((data) => (data.id === atualizada.id ? atualizada : data))
          .sort(
            (a, b) =>
              new Date(a.data_hora).getTime() -
              new Date(b.data_hora).getTime(),
          ),
      );
      setDataEmEdicao(null);
      setAviso("Data de apresentação atualizada com sucesso.");
    } catch (error: unknown) {
      setErro(mensagemErro(error));
    } finally {
      setAtualizandoData(false);
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
        `Remover a data ${formatarData(data.data_hora)} - turma ${turmasPorId.get(data.turma_id)?.nome_turma ?? "não identificada"}?`,
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
      turma_id: grupo.turma_id,
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
      !grupoForm.turma_id ||
      !grupoForm.tema_projeto.trim() ||
      (grupoForm.link_repositorio.trim() &&
        !/^https?:\/\/\S+$/i.test(grupoForm.link_repositorio.trim()))
    ) {
      setErro(
        "Informe o nome e tema do grupo. O link do repositório, quando preenchido, deve começar com http:// ou https://.",
      );
      return;
    }

    const turmaDestino = turmasPorId.get(grupoForm.turma_id);
    if (!turmaDestino) {
      setErro("A turma selecionada não existe mais. Atualize o painel.");
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
    const dataDestino = dataNovaId ? datasPorId.get(dataNovaId) : undefined;
    if (dataNovaId && (!dataDestino || dataDestino.turma_id !== turmaDestino.id)) {
      setErro("A data de apresentação precisa pertencer à turma selecionada.");
      return;
    }
    setSalvandoGrupo(true);

    try {
      const alunosArray = alunosForm.map((aluno, indice) => ({
        nome: aluno.nome.trim(),
        matricula: aluno.matricula.trim(),
        email: aluno.email.trim() || null,
        eh_lider: indice === 0,
      }));
      const { error: erroAtualizacao } = await supabase.rpc(
        "atualizar_grupo_completo",
        {
          p_grupo_id: grupoEmEdicao.id,
          p_nome_grupo: grupoForm.nome_grupo.trim(),
          p_turma_id: turmaDestino.id,
          p_tema_projeto: grupoForm.tema_projeto.trim(),
          p_link_repositorio: grupoForm.link_repositorio.trim() || null,
          p_nova_data_id: dataNovaId,
          p_antiga_data_id: dataAnteriorId,
          p_alunos: alunosArray,
        },
      );

      if (erroAtualizacao) {
        throw new Error(
          `Não foi possível salvar o grupo e os alunos: ${erroAtualizacao.message}`,
        );
      }

      setAviso("Grupo e alunos atualizados com sucesso.");
      setGrupoEmEdicao(null);
      setGrupoForm(null);
      setAlunosForm([]);
      atualizarPainel();
    } catch (error: unknown) {
      setErro(mensagemErro(error));
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
      const turma = turmasPorId.get(grupo.turma_id);
      const disciplina = turma
        ? disciplinasPorId.get(turma.disciplina_id)
        : undefined;
      const nomeTurma = turma?.nome_turma ?? grupo.turma_id;
      const nomeDisciplina = disciplina?.nome ?? "";

      if (membros.length === 0) {
        linhas.push([
          grupo.nome_grupo,
          nomeDisciplina,
          nomeTurma,
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
          nomeDisciplina,
          nomeTurma,
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
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_150px_auto]"
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
                      Turma
                    </span>
                    <select
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      onChange={(event) =>
                        setDataForm({
                          ...dataForm,
                          turma_id: event.target.value,
                        })
                      }
                      required
                      value={dataForm.turma_id}
                    >
                      <option value="">Selecione uma turma</option>
                      {turmas.map((turma) => (
                        <option key={turma.id} value={turma.id}>
                          {disciplinasPorId.get(turma.disciplina_id)?.nome ??
                            "Disciplina"}{" "}
                          · {turma.nome_turma}
                        </option>
                      ))}
                    </select>
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
                        {(() => {
                          const turma = turmasPorId.get(data.turma_id);
                          const disciplina = turma
                            ? disciplinasPorId.get(turma.disciplina_id)
                            : undefined;
                          return (
                        <div>
                          <span className="block font-medium text-slate-800">
                            {formatarData(data.data_hora)}
                          </span>
                          <span className="mt-1 block text-sm text-slate-500">
                            {disciplina?.nome ?? "Disciplina"} · Turma{" "}
                            {turma?.nome_turma ?? "não identificada"}
                          </span>
                        </div>
                          );
                        })()}
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
                            aria-label={`Editar data de ${formatarData(data.data_hora)}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
                            onClick={() => iniciarEdicaoData(data)}
                            type="button"
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </button>
                          <button
                            aria-label={`Remover data de ${formatarData(data.data_hora)} - turma ${turmasPorId.get(data.turma_id)?.nome_turma ?? "não identificada"}`}
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

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-slate-900">
                  Disciplinas e turmas
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Cadastre disciplinas e suas turmas para organizar as datas de
                  apresentação.
                </p>
              </div>
              <div className="grid gap-8 xl:grid-cols-2">
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  onSubmit={(event) => void cadastrarDisciplina(event)}
                >
                  <label className="flex-1 space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Nova disciplina
                    </span>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      maxLength={150}
                      onChange={(event) =>
                        setDisciplinaForm({ nome: event.target.value })
                      }
                      placeholder="Ex.: Sistema de Informação"
                      required
                      value={disciplinaForm.nome}
                    />
                  </label>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    disabled={salvandoDisciplina}
                    type="submit"
                  >
                    {salvandoDisciplina ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Cadastrar disciplina
                  </button>
                </form>
                <form
                  className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                  onSubmit={(event) => void cadastrarTurma(event)}
                >
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Disciplina da turma
                    </span>
                    <select
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      onChange={(event) =>
                        setTurmaForm({
                          ...turmaForm,
                          disciplina_id: event.target.value,
                        })
                      }
                      required
                      value={turmaForm.disciplina_id}
                    >
                      <option value="">Selecione</option>
                      {disciplinas.map((disciplina) => (
                        <option key={disciplina.id} value={disciplina.id}>
                          {disciplina.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Nome da turma
                    </span>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      maxLength={100}
                      onChange={(event) =>
                        setTurmaForm({
                          ...turmaForm,
                          nome_turma: event.target.value,
                        })
                      }
                      placeholder="Ex.: 2º Período A"
                      required
                      value={turmaForm.nome_turma}
                    />
                  </label>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    disabled={salvandoTurma || disciplinas.length === 0}
                    type="submit"
                  >
                    {salvandoTurma ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Cadastrar turma
                  </button>
                </form>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {disciplinas.map((disciplina) => {
                  const turmasDaDisciplina = turmas.filter(
                    (turma) => turma.disciplina_id === disciplina.id,
                  );
                  return (
                    <div
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      key={disciplina.id}
                    >
                      <h3 className="font-semibold text-slate-900">
                        {disciplina.nome}
                      </h3>
                      {turmasDaDisciplina.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500">
                          Nenhuma turma cadastrada.
                        </p>
                      ) : (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {turmasDaDisciplina.map((turma) => (
                            <li
                              className="rounded-full bg-white px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-200"
                              key={turma.id}
                            >
                              {turma.nome_turma}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Importar lista de alunos por turma
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Envie um CSV com as colunas{" "}
                    <code className="rounded bg-slate-100 px-1.5 py-0.5">
                      matricula,nome
                    </code>
                    . O cabeçalho é opcional.
                  </p>
                </div>
              </div>
              <form
                className="grid gap-4 lg:grid-cols-[1fr_1.4fr_auto] lg:items-end"
                onSubmit={(event) => void importarAlunosPermitidos(event)}
              >
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Turma
                  </span>
                  <select
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                    onChange={(event) =>
                      setTurmaImportacaoId(event.target.value)
                    }
                    value={turmaImportacaoId}
                  >
                    <option value="">Selecione uma turma</option>
                    {turmas.map((turma) => (
                      <option key={turma.id} value={turma.id}>
                        {disciplinasPorId.get(turma.disciplina_id)?.nome ??
                          "Disciplina"}{" "}
                        · {turma.nome_turma}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Arquivo CSV
                  </span>
                  <input
                    accept=".csv,text/csv"
                    className="block w-full rounded-lg border border-slate-300 bg-white text-sm text-slate-700 file:mr-4 file:border-0 file:bg-emerald-50 file:px-4 file:py-3 file:font-semibold file:text-emerald-800 hover:file:bg-emerald-100"
                    key={chaveInputArquivo}
                    onChange={(event) =>
                      setArquivoImportacao(event.target.files?.[0] ?? null)
                    }
                    type="file"
                  />
                </label>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={
                    importandoAlunos
                  }
                  type="submit"
                >
                  {importandoAlunos ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {importandoAlunos ? "Importando..." : "Importar alunos"}
                </button>
              </form>
              <p className="mt-3 text-xs text-slate-500">
                Exemplo: <code>20231012,João da Silva</code>. Matrículas
                repetidas na mesma turma serão atualizadas.
              </p>
            </section>

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
                        const turma = turmasPorId.get(grupo.turma_id);
                        const disciplina = turma
                          ? disciplinasPorId.get(turma.disciplina_id)
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
                            disciplinaLabel={disciplina?.nome ?? "—"}
                            turmaLabel={turma?.nome_turma ?? "—"}
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
      {dataEmEdicao && (
        <div
          aria-labelledby="titulo-edicao-data"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
        >
          <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8">
            <header className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2
                  className="text-xl font-bold text-slate-950"
                  id="titulo-edicao-data"
                >
                  Editar data de apresentação
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Vagas ocupadas:{" "}
                  {datasPorId.get(dataEmEdicao.id)?.vagas_ocupadas ?? 0}
                </p>
              </div>
              <button
                aria-label="Fechar edição da data"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
                disabled={atualizandoData}
                onClick={() => setDataEmEdicao(null)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <form
              className="space-y-5"
              onSubmit={(event) => void salvarEdicaoData(event)}
            >
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Data e horário
                </span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  onChange={(event) =>
                    setDataEmEdicao({
                      ...dataEmEdicao,
                      data_hora: event.target.value,
                    })
                  }
                  required
                  type="datetime-local"
                  value={dataEmEdicao.data_hora}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Vagas totais
                </span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  min={datasPorId.get(dataEmEdicao.id)?.vagas_ocupadas ?? 0}
                  onChange={(event) =>
                    setDataEmEdicao({
                      ...dataEmEdicao,
                      vagas_totais: event.target.value,
                    })
                  }
                  required
                  type="number"
                  value={dataEmEdicao.vagas_totais}
                />
              </label>
              <footer className="flex flex-col-reverse justify-end gap-3 border-t border-slate-200 pt-5 sm:flex-row">
                <button
                  className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  disabled={atualizandoData}
                  onClick={() => setDataEmEdicao(null)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={atualizandoData}
                  type="submit"
                >
                  {atualizandoData ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {atualizandoData ? "Salvando..." : "Salvar data"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
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
                    Turma
                  </span>
                  <select
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                    onChange={(event) =>
                      setGrupoForm({
                        ...grupoForm,
                        turma_id: event.target.value,
                        data_apresentacao_id: "",
                      })
                    }
                    required
                    value={grupoForm.turma_id}
                  >
                    <option value="">Selecione uma turma</option>
                    {turmasParaEdicao.map((turma) => (
                      <option key={turma.id} value={turma.id}>
                        {disciplinasPorId.get(turma.disciplina_id)?.nome ??
                          "Disciplina"}{" "}
                        · {turma.nome_turma}
                      </option>
                    ))}
                  </select>
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
                          data.turma_id === grupoForm.turma_id &&
                          (data.vagas_ocupadas < data.vagas_totais ||
                            data.id ===
                              grupoEmEdicao.data_apresentacao_id),
                      )
                      .map((data) => (
                        <option key={data.id} value={data.id}>
                          {formatarData(data.data_hora)} ·{" "}
                          {data.vagas_totais -
                            data.vagas_ocupadas +
                            (data.id === grupoEmEdicao.data_apresentacao_id
                              ? 1
                              : 0)}{" "}
                          vagas disponíveis
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
  disciplinaLabel: string;
  turmaLabel: string;
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
  disciplinaLabel,
  turmaLabel,
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
        <td className="px-5 py-4">{disciplinaLabel}</td>
        <td className="px-5 py-4">{turmaLabel}</td>
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
