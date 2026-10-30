"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  LoaderCircle,
  Mail,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  Configuracao,
  DataApresentacao,
  Disciplina,
  NovoAluno,
  TemaTurma,
  Turma,
} from "@/types/database";

type LimitesInscricao = Pick<
  Configuracao,
  | "limite_alunos_min"
  | "limite_alunos_max"
  | "permitir_inscricoes"
  | "tipo_tema"
  | "data_inicio_agendamento"
  | "data_fim_agendamento"
>;

const limitesPadrao: LimitesInscricao = {
  limite_alunos_min: 2,
  limite_alunos_max: 5,
  permitir_inscricoes: false,
  tipo_tema: "livre",
  data_inicio_agendamento: null,
  data_fim_agendamento: null,
};

interface MembroFormulario {
  id: string;
  nome: string;
  matricula: string;
  email: string;
  nomeEncontradoNaTurmaId: string | null;
}

interface GrupoFormulario {
  nome_grupo: string;
  disciplina_id: string;
  turma_id: string;
  tema_projeto: string;
  tema_turma_id: string;
  data_apresentacao_id: string;
}

interface TemaComDisponibilidade extends TemaTurma {
  grupos_ocupados: number;
}

const formularioInicial: GrupoFormulario = {
  nome_grupo: "",
  disciplina_id: "",
  turma_id: "",
  tema_projeto: "",
  tema_turma_id: "",
  data_apresentacao_id: "",
};

function isLimitesInscricao(value: unknown): value is LimitesInscricao {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const config = value as Record<string, unknown>;
  return (
    typeof config.limite_alunos_min === "number" &&
    Number.isInteger(config.limite_alunos_min) &&
    config.limite_alunos_min > 0 &&
    typeof config.limite_alunos_max === "number" &&
    Number.isInteger(config.limite_alunos_max) &&
    config.limite_alunos_max >= config.limite_alunos_min &&
    typeof config.permitir_inscricoes === "boolean" &&
    (config.tipo_tema === "livre" || config.tipo_tema === "pre_definido") &&
    (typeof config.data_inicio_agendamento === "string" ||
      config.data_inicio_agendamento === null) &&
    (typeof config.data_fim_agendamento === "string" ||
      config.data_fim_agendamento === null)
  );
}

function inscricoesEstaoAbertas(config: LimitesInscricao): boolean {
  if (!config.permitir_inscricoes) return false

  const agora = Date.now()
  const inicio = config.data_inicio_agendamento
    ? new Date(config.data_inicio_agendamento).getTime()
    : null
  const fim = config.data_fim_agendamento
    ? new Date(config.data_fim_agendamento).getTime()
    : null

  return (inicio === null || agora >= inicio) && (fim === null || agora <= fim)
}

function isDataApresentacao(value: unknown): value is DataApresentacao {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const data = value as Record<string, unknown>;
  return (
    typeof data.id === "string" &&
    typeof data.turma_id === "string" &&
    typeof data.data_hora === "string" &&
    (typeof data.data_hora_fim === "string" || data.data_hora_fim === null) &&
    typeof data.vagas_totais === "number" &&
    typeof data.vagas_ocupadas === "number"
  );
}

function isDisciplina(value: unknown): value is Disciplina {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const disciplina = value as Record<string, unknown>;
  return (
    typeof disciplina.id === "string" &&
    typeof disciplina.nome === "string"
  );
}

function isTurma(value: unknown): value is Turma {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const turma = value as Record<string, unknown>;
  return (
    typeof turma.id === "string" &&
    typeof turma.disciplina_id === "string" &&
    typeof turma.nome_turma === "string"
  );
}

function formatarData(dataHora: string): string {
  const data = new Date(dataHora);

  if (Number.isNaN(data.getTime())) {
    return dataHora;
  }

  const dataFormatada = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(data);
  const horaFormatada = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Sao_Paulo",
  }).format(data);

  return `${dataFormatada} - ${horaFormatada}`;
}

function formatarHora(dataHora: string): string {
  const data = new Date(dataHora);
  if (Number.isNaN(data.getTime())) {
    return dataHora;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

function obterMensagemErro(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocorreu um erro inesperado. Tente novamente.";
}

function validarMembro(
  membro: MembroFormulario,
  indice: number,
): string | null {
  if (!membro.nome.trim()) {
    return `Informe o nome completo do membro ${indice + 1}.`;
  }

  const matricula = membro.matricula.trim();
  if (
    !matricula ||
    matricula.length > 50 ||
    !/^[\p{L}\p{N}][\p{L}\p{N}._/-]*$/u.test(matricula)
  ) {
    return `Informe uma matrícula válida para o membro ${indice + 1}.`;
  }

  const email = membro.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return `Informe um e-mail válido para o membro ${indice + 1}.`;
  }

  return null;
}

function membroVazio(id: string): MembroFormulario {
  return {
    id,
    nome: "",
    matricula: "",
    email: "",
    nomeEncontradoNaTurmaId: null,
  };
}

async function reservarVaga(
  dataId: string,
  turmaId: string,
): Promise<boolean> {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const { data: dataAtual, error: erroBusca } = await supabase
      .from("datas_apresentacao")
      .select("id, turma_id, vagas_totais, vagas_ocupadas")
      .eq("id", dataId)
      .maybeSingle();

    if (erroBusca) {
      throw new Error(`Não foi possível verificar as vagas: ${erroBusca.message}`);
    }

    if (!dataAtual) {
      throw new Error("A data selecionada não está mais disponível.");
    }

    if (dataAtual.turma_id !== turmaId) {
      throw new Error(
        "A data selecionada não corresponde à turma informada.",
      );
    }

    if (
      typeof dataAtual.vagas_totais !== "number" ||
      typeof dataAtual.vagas_ocupadas !== "number"
    ) {
      throw new Error("Os dados de vagas da data selecionada são inválidos.");
    }

    if (dataAtual.vagas_ocupadas >= dataAtual.vagas_totais) {
      return false;
    }

    const { data: atualizada, error: erroAtualizacao } = await supabase
      .from("datas_apresentacao")
      .update({ vagas_ocupadas: dataAtual.vagas_ocupadas + 1 })
      .eq("id", dataId)
      .eq("vagas_ocupadas", dataAtual.vagas_ocupadas)
      .eq("vagas_totais", dataAtual.vagas_totais)
      .eq("turma_id", turmaId)
      .select("id")
      .maybeSingle();

    if (erroAtualizacao) {
      throw new Error(`Não foi possível reservar a vaga: ${erroAtualizacao.message}`);
    }

    if (atualizada) {
      return true;
    }
  }

  throw new Error(
    "Houve muitas inscrições simultâneas e não foi possível confirmar a vaga. Tente novamente.",
  );
}

async function liberarVaga(dataId: string): Promise<void> {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const { data: dataAtual, error: erroBusca } = await supabase
      .from("datas_apresentacao")
      .select("vagas_ocupadas")
      .eq("id", dataId)
      .maybeSingle();

    if (erroBusca) {
      throw new Error(`Não foi possível consultar a vaga para cancelamento: ${erroBusca.message}`);
    }

    if (!dataAtual || typeof dataAtual.vagas_ocupadas !== "number") {
      throw new Error("A data reservada não foi encontrada para liberar a vaga.");
    }

    if (dataAtual.vagas_ocupadas === 0) {
      return;
    }

    const { data: atualizada, error: erroAtualizacao } = await supabase
      .from("datas_apresentacao")
      .update({ vagas_ocupadas: dataAtual.vagas_ocupadas - 1 })
      .eq("id", dataId)
      .eq("vagas_ocupadas", dataAtual.vagas_ocupadas)
      .select("id")
      .maybeSingle();

    if (erroAtualizacao) {
      throw new Error(`Não foi possível liberar a vaga: ${erroAtualizacao.message}`);
    }

    if (atualizada) {
      return;
    }
  }

  throw new Error("Não foi possível liberar a vaga após várias tentativas.");
}

export default function Home() {
  const proximoMembroId = useRef(0);
  const criarMembro = useCallback(
    (): MembroFormulario =>
      membroVazio(`membro-${proximoMembroId.current++}`),
    [],
  );
  const [limites, setLimites] = useState<LimitesInscricao>(limitesPadrao);
  const [limitesPorTurma, setLimitesPorTurma] = useState<
    Map<string, LimitesInscricao>
  >(() => new Map());
  const [datas, setDatas] = useState<DataApresentacao[]>([]);
  const [temasTurma, setTemasTurma] = useState<TemaComDisponibilidade[]>([]);
  const [carregandoTemas, setCarregandoTemas] = useState(false);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [grupo, setGrupo] = useState<GrupoFormulario>(formularioInicial);
  const turmaIdAtualRef = useRef("");
  const [membros, setMembros] = useState<MembroFormulario[]>([
    membroVazio("membro-inicial"),
  ]);
  const [consultandoMatriculas, setConsultandoMatriculas] = useState<
    Set<string>
  >(() => new Set());
  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const [carregandoEnvio, setCarregandoEnvio] = useState(false);
  const [erroInicial, setErroInicial] = useState("");
  const [erroFormulario, setErroFormulario] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [atualizacao, setAtualizacao] = useState(0);

  useEffect(() => {
    let ativo = true;

    async function carregarDados(): Promise<void> {
      setCarregandoInicial(true);
      setErroInicial("");

      try {
        const [
          configuracoesResult,
          disciplinasResult,
          turmasResult,
          datasResult,
        ] = await Promise.all([
          supabase
            .from("configuracoes")
            .select(
              "turma_id, limite_alunos_min, limite_alunos_max, permitir_inscricoes, tipo_tema, data_inicio_agendamento, data_fim_agendamento",
            ),
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
              "id, turma_id, data_hora, data_hora_fim, vagas_totais, vagas_ocupadas",
            )
            .order("data_hora", { ascending: true }),
        ]);

        if (configuracoesResult.error) {
          if (
            configuracoesResult.error.code === "42703" &&
            configuracoesResult.error.message.includes("tipo_tema")
          ) {
            throw new Error(
              "O banco do Supabase ainda não foi atualizado para a escolha de temas. No SQL Editor do projeto, execute a migração supabase/migrations/20261030090000_temas_turma.sql e recarregue esta página.",
            );
          }

          throw new Error(
            `Não foi possível carregar as configurações: ${configuracoesResult.error.message}`,
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

        const datasValidas = (datasResult.data ?? []).filter(
          isDataApresentacao,
        );
        const disciplinasValidas = (disciplinasResult.data ?? []).filter(
          isDisciplina,
        );
        const turmasValidas = (turmasResult.data ?? []).filter(isTurma);
        const limitesValidos = new Map<string, LimitesInscricao>();

        for (const configuracao of configuracoesResult.data ?? []) {
          if (
            typeof configuracao.turma_id === "string" &&
            isLimitesInscricao(configuracao)
          ) {
            limitesValidos.set(configuracao.turma_id, {
              limite_alunos_min: configuracao.limite_alunos_min,
              limite_alunos_max: configuracao.limite_alunos_max,
              permitir_inscricoes: configuracao.permitir_inscricoes,
              tipo_tema: configuracao.tipo_tema,
              data_inicio_agendamento: configuracao.data_inicio_agendamento,
              data_fim_agendamento: configuracao.data_fim_agendamento,
            });
          }
        }

        if (ativo) {
          setLimites(limitesPadrao);
          setLimitesPorTurma(limitesValidos);
          setDisciplinas(disciplinasValidas);
          setTurmas(turmasValidas);
          setMembros(
            Array.from(
              { length: limitesPadrao.limite_alunos_min },
              criarMembro,
            ),
          );
          setDatas(
            datasValidas.filter(
              (data) => data.vagas_ocupadas < data.vagas_totais,
            ),
          );
        }
      } catch (error: unknown) {
        if (ativo) {
          setErroInicial(obterMensagemErro(error));
        }
      } finally {
        if (ativo) {
          setCarregandoInicial(false);
        }
      }
    }

    void carregarDados();

    return () => {
      ativo = false;
    };
  }, [atualizacao, criarMembro]);

  useEffect(() => {
    let ativo = true;

    if (!grupo.turma_id || limites.tipo_tema !== "pre_definido") {
      return;
    }

    async function carregarTemas(): Promise<void> {
      setCarregandoTemas(true);
      setErroFormulario("");

      try {
        const { data: temas, error } = await supabase.rpc("listar_temas_turma", {
          p_turma_id: grupo.turma_id,
        });
        if (error) {
          throw new Error(`Não foi possível carregar os temas: ${error.message}`);
        }

        if (ativo) {
          setTemasTurma(temas ?? []);
        }
      } catch (error: unknown) {
        if (ativo) {
          setErroFormulario(obterMensagemErro(error));
        }
      } finally {
        if (ativo) setCarregandoTemas(false);
      }
    }

    void carregarTemas();

    return () => {
      ativo = false;
    };
  }, [grupo.turma_id, limites.tipo_tema]);

  const adicionarMembro = useCallback(() => {
    if (membros.length >= limites.limite_alunos_max) {
      return;
    }

    setMembros((membrosAtuais) => [...membrosAtuais, criarMembro()]);
  }, [criarMembro, limites.limite_alunos_max, membros.length]);

  const datasDisponiveis = datas.filter(
    (data) =>
      data.turma_id === grupo.turma_id &&
      grupo.turma_id !== "" &&
      data.vagas_ocupadas < data.vagas_totais,
  );
  const turmasDisponiveis = turmas.filter(
    (turma) => turma.disciplina_id === grupo.disciplina_id,
  );
  const temasDisponiveisTurma = temasTurma.filter(
    (tema) => tema.turma_id === grupo.turma_id,
  );

  function atualizarMembro(
    indice: number,
    campo: keyof MembroFormulario,
    valor: string,
  ): void {
    setMembros((membrosAtuais) =>
      membrosAtuais.map((membro, indiceAtual) =>
        indiceAtual === indice
          ? campo === "matricula"
            ? {
                ...membro,
                matricula: valor,
                nome: "",
                nomeEncontradoNaTurmaId: null,
              }
            : { ...membro, [campo]: valor }
          : membro,
      ),
    );
  }

  async function buscarAlunoPermitido(indice: number): Promise<void> {
    const membro = membros[indice];
    const matricula = membro?.matricula.trim();
    const turmaId = grupo.turma_id;

    if (!membro || !matricula) {
      return;
    }

    if (!turmaId) {
      setErroFormulario(
        "Selecione a turma antes de consultar a matrícula do aluno.",
      );
      return;
    }

    setErroFormulario("");
    setConsultandoMatriculas((atuais) => new Set(atuais).add(membro.id));
    try {
      const resultadoExato = await supabase
        .from("alunos_permitidos")
        .select("nome")
        .eq("turma_id", turmaId)
        .eq("matricula", matricula)
        .maybeSingle();

      if (resultadoExato.error) {
        throw new Error(
          `Não foi possível consultar a matrícula: ${resultadoExato.error.message}`,
        );
      }

      let nomeEncontrado = resultadoExato.data?.nome;
      if (!nomeEncontrado) {
        const matriculaComZero = `0${matricula}`;
        const resultadoComZero = await supabase
          .from("alunos_permitidos")
          .select("nome")
          .eq("turma_id", turmaId)
          .eq("matricula", matriculaComZero)
          .maybeSingle();

        if (resultadoComZero.error) {
          throw new Error(
            `Não foi possível consultar a matrícula com zero à esquerda: ${resultadoComZero.error.message}`,
          );
        }

        nomeEncontrado = resultadoComZero.data?.nome;
      }

      setMembros((atuais) =>
        atuais.map((aluno) => {
          if (
            aluno.id !== membro.id ||
            aluno.matricula.trim() !== matricula ||
            turmaIdAtualRef.current !== turmaId
          ) {
            return aluno;
          }

          if (typeof nomeEncontrado === "string") {
            return {
              ...aluno,
              nome: nomeEncontrado,
              nomeEncontradoNaTurmaId: turmaId,
            };
          }

          return {
            ...aluno,
            nome:
              aluno.nomeEncontradoNaTurmaId === turmaId ? "" : aluno.nome,
            nomeEncontradoNaTurmaId: null,
          };
        }),
      );
    } catch (error: unknown) {
      setErroFormulario(obterMensagemErro(error));
    } finally {
      setConsultandoMatriculas((atuais) => {
        const proximos = new Set(atuais);
        proximos.delete(membro.id);
        return proximos;
      });
    }
  }

  function removerMembro(indice: number): void {
    if (membros.length <= limites.limite_alunos_min) {
      return;
    }

    setMembros((membrosAtuais) =>
      membrosAtuais.filter((_, indiceAtual) => indiceAtual !== indice),
    );
  }

  async function enviarFormulario(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setErroFormulario("");

    if (!inscricoesEstaoAbertas(limites)) {
      setErroFormulario(
        "As inscrições para a turma selecionada estão fechadas ou fora do período permitido.",
      );
      return;
    }

    if (
      membros.length < limites.limite_alunos_min ||
      membros.length > limites.limite_alunos_max
    ) {
      setErroFormulario(
        `O grupo deve ter entre ${limites.limite_alunos_min} e ${limites.limite_alunos_max} membros.`,
      );
      return;
    }

    if (
      !grupo.nome_grupo.trim() ||
      !grupo.disciplina_id ||
      !grupo.turma_id ||
      !grupo.data_apresentacao_id
    ) {
      setErroFormulario("Preencha todos os campos obrigatórios do grupo.");
      return;
    }

    const temaSelecionado =
      limites.tipo_tema === "pre_definido"
        ? temasDisponiveisTurma.find((tema) => tema.id === grupo.tema_turma_id)
        : null;
    if (
      limites.tipo_tema === "pre_definido"
        ? !temaSelecionado ||
          temaSelecionado.grupos_ocupados >= temaSelecionado.limite_grupos
        : !grupo.tema_projeto.trim()
    ) {
      setErroFormulario(
        limites.tipo_tema === "pre_definido"
          ? "Selecione um tema que ainda tenha vagas disponíveis."
          : "Informe o tema do projeto.",
      );
      return;
    }

    const turmaSelecionada = turmas.find(
      (turma) =>
        turma.id === grupo.turma_id &&
        turma.disciplina_id === grupo.disciplina_id,
    );
    if (!turmaSelecionada) {
      setErroFormulario(
        "A turma selecionada não pertence à disciplina escolhida.",
      );
      return;
    }

    const dataSelecionada = datas.find(
      (data) =>
        data.id === grupo.data_apresentacao_id &&
        data.turma_id === turmaSelecionada.id &&
        data.vagas_ocupadas < data.vagas_totais,
    );
    if (!dataSelecionada) {
      setErroFormulario(
        "A data selecionada não está disponível para a turma escolhida.",
      );
      return;
    }

    for (const [indice, membro] of membros.entries()) {
      const erro = validarMembro(membro, indice);
      if (erro) {
        setErroFormulario(erro);
        return;
      }
    }

    setCarregandoEnvio(true);
    let vagaReservada = false;
    let grupoId: string | null = null;

    try {
      vagaReservada = await reservarVaga(
        grupo.data_apresentacao_id,
        turmaSelecionada.id,
      );
      if (!vagaReservada) {
        setErroFormulario(
          "Esta data acabou de ficar sem vagas. Escolha outra data disponível.",
        );
        setAtualizacao((valor) => valor + 1);
        return;
      }

      const { data: grupoInseridoId, error: erroGrupo } = await supabase.rpc(
        "criar_grupo_inscricao",
        {
          p_turma_id: turmaSelecionada.id,
          p_nome_grupo: grupo.nome_grupo.trim(),
          p_tema_projeto: grupo.tema_projeto.trim(),
          p_tema_turma_id: grupo.tema_turma_id || null,
          p_data_apresentacao_id: grupo.data_apresentacao_id,
          p_link_repositorio: null,
        },
      );
      if (erroGrupo) {
        throw new Error(`Não foi possível cadastrar o grupo: ${erroGrupo.message}`);
      }

      if (typeof grupoInseridoId !== "string") {
        throw new Error("O cadastro do grupo não retornou um identificador válido.");
      }

      grupoId = grupoInseridoId;
      const novosAlunos: NovoAluno[] = membros.map((membro, indice) => ({
        grupo_id: grupoInseridoId,
        nome: membro.nome.trim(),
        matricula: membro.matricula.trim(),
        email: membro.email.trim() || null,
        eh_lider: indice === 0,
      }));

      const { error: erroAlunos } = await supabase
        .from("alunos")
        .insert(novosAlunos);

      if (erroAlunos) {
        throw new Error(`Não foi possível cadastrar os membros: ${erroAlunos.message}`);
      }

      setSucesso(true);
      setGrupo(formularioInicial);
      setLimites(limitesPadrao);
      setMembros(
        Array.from(
          { length: limitesPadrao.limite_alunos_min },
          criarMembro,
        ),
      );
      setAtualizacao((valor) => valor + 1);
    } catch (error: unknown) {
      const mensagensRollback: string[] = [];

      if (grupoId) {
        const { error: erroExclusao } = await supabase
          .from("grupos")
          .delete()
          .eq("id", grupoId);

        if (erroExclusao) {
          mensagensRollback.push(
            `Também não foi possível remover o grupo parcialmente criado: ${erroExclusao.message}`,
          );
        }
      }

      if (vagaReservada && !grupoId) {
        try {
          await liberarVaga(grupo.data_apresentacao_id);
        } catch (erroRollback: unknown) {
          mensagensRollback.push(obterMensagemErro(erroRollback));
        }
      } else if (vagaReservada && grupoId && mensagensRollback.length === 0) {
        try {
          await liberarVaga(grupo.data_apresentacao_id);
        } catch (erroRollback: unknown) {
          mensagensRollback.push(obterMensagemErro(erroRollback));
        }
      }

      const detalheRollback =
        mensagensRollback.length > 0
          ? ` ${mensagensRollback.join(" ")}`
          : "";
      setErroFormulario(`${obterMensagemErro(error)}${detalheRollback}`);
    } finally {
      setCarregandoEnvio(false);
    }
  }

  if (carregandoInicial) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex items-center gap-3 text-slate-600" role="status">
          <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" />
          <span>Carregando informações da inscrição...</span>
        </div>
      </main>
    );
  }

  if (erroInicial) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
        <section className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            Não foi possível carregar a inscrição
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{erroInicial}</p>
          <button
            className="mt-6 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800"
            onClick={() => setAtualizacao((valor) => valor + 1)}
            type="button"
          >
            Tentar novamente
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center sm:mb-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-sm">
            <Users className="h-7 w-7" />
          </div>
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-800">
            GrupoHub
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Inscrição de grupo
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-slate-600">
            Preencha os dados do projeto e de cada integrante para reservar a
            apresentação do seu grupo.
          </p>
        </header>

        <form
          className="space-y-6"
          noValidate
          onSubmit={(event) => void enviarFormulario(event)}
        >
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <div className="mb-6 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Dados do grupo
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Informe os dados principais do projeto.
                </p>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">
                  Nome do grupo <span className="text-red-600">*</span>
                </span>
                <input
                  autoComplete="organization"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  maxLength={100}
                  onChange={(event) =>
                    setGrupo({ ...grupo, nome_grupo: event.target.value })
                  }
                  placeholder="Ex.: Byte Builders"
                  required
                  value={grupo.nome_grupo}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Disciplina <span className="text-red-600">*</span>
                </span>
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  onChange={(event) => {
                    turmaIdAtualRef.current = "";
                    setLimites(limitesPadrao);
                    setMembros(
                      Array.from(
                        { length: limitesPadrao.limite_alunos_min },
                        criarMembro,
                      ),
                    );
                    setGrupo({
                      ...grupo,
                      disciplina_id: event.target.value,
                      turma_id: "",
                      tema_projeto: "",
                      tema_turma_id: "",
                      data_apresentacao_id: "",
                    });
                  }}
                  required
                  value={grupo.disciplina_id}
                >
                  <option value="">Selecione uma disciplina</option>
                  {disciplinas.map((disciplina) => (
                    <option key={disciplina.id} value={disciplina.id}>
                      {disciplina.nome}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  Turma <span className="text-red-600">*</span>
                </span>
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 disabled:cursor-not-allowed disabled:bg-slate-100"
                  disabled={!grupo.disciplina_id}
                  onChange={(event) => {
                    const turmaId = event.target.value;
                    const limitesDaTurma =
                      limitesPorTurma.get(turmaId) ?? {
                        ...limitesPadrao,
                        permitir_inscricoes: false,
                      };
                    turmaIdAtualRef.current = turmaId;
                    setLimites(limitesDaTurma);
                    setMembros(
                      Array.from(
                        { length: limitesDaTurma.limite_alunos_min },
                        criarMembro,
                      ),
                    );
                    setErroFormulario(
                      limitesPorTurma.has(turmaId)
                        ? ""
                        : "As configurações desta turma não foram encontradas. Avise o professor.",
                    );
                    setGrupo({
                      ...grupo,
                      turma_id: event.target.value,
                      tema_projeto: "",
                      tema_turma_id: "",
                      data_apresentacao_id: "",
                    });
                  }}
                  required
                  value={grupo.turma_id}
                >
                  <option value="">
                    {grupo.disciplina_id
                      ? turmasDisponiveis.length > 0
                        ? "Selecione uma turma"
                        : "Não há turmas cadastradas para esta disciplina"
                      : "Selecione a disciplina primeiro"}
                  </option>
                  {turmasDisponiveis.map((turma) => (
                    <option key={turma.id} value={turma.id}>
                      {turma.nome_turma}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">
                  Tema do projeto <span className="text-red-600">*</span>
                </span>
                {limites.tipo_tema === "pre_definido" ? (
                  <>
                    <select
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 disabled:cursor-not-allowed disabled:bg-slate-100"
                      disabled={!grupo.turma_id || carregandoTemas}
                      onChange={(event) => {
                        const tema = temasTurma.find(
                          (opcao) => opcao.id === event.target.value,
                        );
                        setGrupo({
                          ...grupo,
                          tema_turma_id: tema?.id ?? "",
                          tema_projeto: tema?.titulo ?? "",
                        });
                      }}
                      required
                      value={grupo.tema_turma_id}
                    >
                      <option value="">
                        {carregandoTemas
                          ? "Carregando temas..."
                          : temasDisponiveisTurma.length > 0
                            ? "Selecione um tema"
                            : "Nenhum tema cadastrado para esta turma"}
                      </option>
                      {temasDisponiveisTurma.map((tema) => {
                        const esgotado = tema.grupos_ocupados >= tema.limite_grupos;
                        const vagasRestantes = Math.max(
                          0,
                          tema.limite_grupos - tema.grupos_ocupados,
                        );
                        return (
                          <option disabled={esgotado} key={tema.id} value={tema.id}>
                            {tema.titulo}
                            {esgotado
                              ? " (Esgotado)"
                              : ` (${vagasRestantes} vaga(s) para grupo)`}
                          </option>
                        );
                      })}
                    </select>
                    <span className="block text-xs text-slate-500">
                      {temasDisponiveisTurma.length === 0 && !carregandoTemas
                        ? "Avise o professor para cadastrar temas nesta turma."
                        : "A disponibilidade é confirmada novamente ao enviar a inscrição."}
                    </span>
                  </>
                ) : (
                  <textarea
                    className="min-h-28 w-full resize-y rounded-lg border border-slate-300 px-3.5 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                    maxLength={500}
                    onChange={(event) =>
                      setGrupo({ ...grupo, tema_projeto: event.target.value })
                    }
                    placeholder="Descreva brevemente o tema do projeto"
                    required
                    value={grupo.tema_projeto}
                  />
                )}
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">
                  Data e horário da apresentação{" "}
                  <span className="text-red-600">*</span>
                </span>
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 disabled:cursor-not-allowed disabled:bg-slate-100"
                  disabled={!grupo.turma_id || datasDisponiveis.length === 0}
                  onChange={(event) =>
                    setGrupo({
                      ...grupo,
                      data_apresentacao_id: event.target.value,
                    })
                  }
                  required
                  value={grupo.data_apresentacao_id}
                >
                  <option value="">
                    {!grupo.turma_id
                      ? "Selecione a turma primeiro"
                      : datasDisponiveis.length > 0
                        ? "Selecione uma data disponível"
                        : "Não há datas disponíveis para esta turma"}
                  </option>
                  {datasDisponiveis.map((data) => (
                    <option key={data.id} value={data.id}>
                      {formatarData(data.data_hora)}
                      {data.data_hora_fim
                        ? ` - ${formatarHora(data.data_hora_fim)}`
                        : ""}{" "}
                      (
                      {data.vagas_totais - data.vagas_ocupadas}{" "}
                      {data.vagas_totais - data.vagas_ocupadas === 1
                        ? "vaga restante"
                        : "vagas restantes"}
                      )
                    </option>
                  ))}
                </select>
                {grupo.turma_id && datasDisponiveis.length === 0 && (
                  <span className="block text-sm text-amber-700">
                    Não há horários com vagas para a turma selecionada. Tente
                    novamente mais tarde.
                  </span>
                )}
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Integrantes
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    De {limites.limite_alunos_min} a {limites.limite_alunos_max}{" "}
                    integrantes. O primeiro será o líder.
                  </p>
                </div>
              </div>
              <button
                className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-emerald-700 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 disabled:hover:bg-white"
                disabled={membros.length >= limites.limite_alunos_max}
                onClick={adicionarMembro}
                type="button"
              >
                <Plus className="h-4 w-4" />
                Adicionar membro
              </button>
            </div>

            <div className="space-y-4">
              {membros.map((membro, indice) => (
                <fieldset
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5"
                  key={membro.id}
                >
                  <legend className="sr-only">
                    {indice === 0 ? "Líder do grupo" : `Membro ${indice + 1}`}
                  </legend>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-900">
                        {indice + 1}
                      </span>
                      <h3 className="text-sm font-bold text-slate-800">
                        {indice === 0 ? "Líder do grupo" : `Membro ${indice + 1}`}
                      </h3>
                    </div>
                    {indice > 0 && (
                      <button
                        aria-label={`Remover membro ${indice + 1}`}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
                        onClick={() => removerMembro(indice)}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only sm:not-sr-only">Remover</span>
                      </button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">
                        Matrícula <span className="text-red-600">*</span>
                      </span>
                      <input
                        autoComplete="off"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                        maxLength={50}
                        onBlur={() => void buscarAlunoPermitido(indice)}
                        onChange={(event) =>
                          atualizarMembro(
                            indice,
                            "matricula",
                            event.target.value,
                          )
                        }
                        placeholder="Número de matrícula"
                        required
                        value={membro.matricula}
                      />
                      {consultandoMatriculas.has(membro.id) && (
                        <span className="block text-xs text-slate-500" role="status">
                          Consultando matrícula...
                        </span>
                      )}
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">
                        Nome completo <span className="text-red-600">*</span>
                      </span>
                      <input
                        autoComplete="name"
                        className={`w-full rounded-lg border px-3.5 py-3 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 ${
                          membro.nomeEncontradoNaTurmaId === grupo.turma_id
                            ? "border-emerald-200 bg-emerald-50 text-slate-700"
                            : "border-slate-300 bg-white text-slate-900"
                        }`}
                        maxLength={150}
                        onChange={(event) =>
                          atualizarMembro(indice, "nome", event.target.value)
                        }
                        placeholder="Nome e sobrenome"
                        readOnly={
                          membro.nomeEncontradoNaTurmaId === grupo.turma_id
                        }
                        required
                        value={membro.nome}
                      />
                      {membro.nomeEncontradoNaTurmaId === grupo.turma_id && (
                        <span className="block text-xs text-emerald-800">
                          Nome preenchido a partir da lista da turma.
                        </span>
                      )}
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">
                        E-mail <span className="font-normal text-slate-500">(opcional)</span>
                      </span>
                      <input
                        autoComplete="email"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                        maxLength={254}
                        onChange={(event) =>
                          atualizarMembro(indice, "email", event.target.value)
                        }
                        placeholder="nome@exemplo.com"
                        type="email"
                        value={membro.email}
                      />
                    </label>
                  </div>
                </fieldset>
              ))}
            </div>
          </section>

          {erroFormulario && (
            <div
              className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{erroFormulario}</p>
            </div>
          )}

          {grupo.turma_id && !inscricoesEstaoAbertas(limites) && (
            <div
              className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900"
              role="status"
            >
              <CalendarDays className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                As inscrições desta turma estão fechadas ou fora do período
                definido pelo professor.
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-center text-xs text-slate-500 sm:text-left">
              <span className="text-red-600">*</span> Campos obrigatórios
            </p>
            <button
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-700/20 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={
                carregandoEnvio ||
                !inscricoesEstaoAbertas(limites) ||
                datasDisponiveis.length === 0 ||
                !grupo.data_apresentacao_id
              }
              type="submit"
            >
              {carregandoEnvio ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Enviando inscrição...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Confirmar inscrição
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {sucesso && (
        <div
          aria-labelledby="titulo-sucesso"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
        >
          <section className="relative w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-xl sm:p-9">
            <button
              aria-label="Fechar confirmação"
              className="absolute right-4 top-4 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              onClick={() => setSucesso(false)}
              type="button"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <h2
              className="mt-5 text-2xl font-bold text-slate-950"
              id="titulo-sucesso"
            >
              Inscrição confirmada!
            </h2>
            <p className="mt-3 leading-7 text-slate-600">
              O grupo e seus integrantes foram cadastrados. A vaga para a
              apresentação foi reservada com sucesso.
            </p>
            <button
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800"
              onClick={() => setSucesso(false)}
              type="button"
            >
              <Mail className="h-4 w-4" />
              Concluir
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
