'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileUp,
  GraduationCap,
  LogOut,
  Pencil,
  Plus,
  Save,
  Settings,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import ModalAdicionarAluno from './components/ModalAdicionarAluno'
import ModalCadastrarHorario from './components/ModalCadastrarHorario'
import ModalImportarCSV from './components/ModalImportarCSV'
import type {
  Aluno,
  AlunoPermitido,
  Configuracao,
  DataApresentacao,
  Disciplina,
  Database,
  Grupo,
  TemaTurma,
  Turma,
} from '@/types/database'

type Aba = 'grupos' | 'alunos' | 'horarios' | 'config'
type ConfiguracaoForm = Omit<
  Pick<
    Configuracao,
    | 'limite_alunos_min'
    | 'limite_alunos_grupo'
    | 'data_inicio_agendamento'
    | 'data_fim_agendamento'
    | 'mostrar_Integrantes'
    | 'permitir_inscricoes'
    | 'tipo_tema'
  >,
  'data_inicio_agendamento' | 'data_fim_agendamento'
> & {
  data_inicio_agendamento: string
  data_fim_agendamento: string
}

interface GrupoComAlunos extends Grupo {
  alunos: Aluno[]
}

interface DadosTurma {
  alunos: AlunoPermitido[]
  datas: DataApresentacao[]
  grupos: GrupoComAlunos[]
  temas: TemaTurma[]
  configuracao: ConfiguracaoForm
}

const configuracaoPadrao: ConfiguracaoForm = {
  limite_alunos_min: 2,
  limite_alunos_grupo: 5,
  data_inicio_agendamento: '',
  data_fim_agendamento: '',
  mostrar_Integrantes: true,
  permitir_inscricoes: false,
  tipo_tema: 'livre',
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}

function toDatetimeLocal(value: string | null): string {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

function formatarDataHora(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function dataDoSlot(slot: DataApresentacao): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(
    new Date(slot.data_hora)
  )
}

function horarioDoSlot(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function mapearConfiguracao(data: Configuracao | null): ConfiguracaoForm {
  if (!data) return configuracaoPadrao

  return {
    limite_alunos_min: data.limite_alunos_min ?? configuracaoPadrao.limite_alunos_min,
    limite_alunos_grupo:
      data.limite_alunos_grupo ?? data.limite_alunos_max ?? configuracaoPadrao.limite_alunos_grupo,
    data_inicio_agendamento: toDatetimeLocal(data.data_inicio_agendamento),
    data_fim_agendamento: toDatetimeLocal(data.data_fim_agendamento),
    mostrar_Integrantes: data.mostrar_Integrantes ?? true,
    permitir_inscricoes: data.permitir_inscricoes ?? false,
    tipo_tema: data.tipo_tema ?? 'livre',
  }
}

function aplicarDadosTurma(
  dados: DadosTurma,
  setters: {
    setAlunos: (value: AlunoPermitido[]) => void
    setDatas: (value: DataApresentacao[]) => void
    setGrupos: (value: GrupoComAlunos[]) => void
    setTemas: (value: TemaTurma[]) => void
    setConfig: (value: ConfiguracaoForm) => void
  }
): void {
  setters.setAlunos(dados.alunos)
  setters.setDatas(dados.datas)
  setters.setGrupos(dados.grupos)
  setters.setTemas(dados.temas)
  setters.setConfig(dados.configuracao)
}

export default function PainelProfessor() {
  const router = useRouter()
  const supabase = useMemo(
    () =>
      createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  )

  const [abaAtiva, setAbaAtiva] = useState<Aba>('grupos')
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([])
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [disciplinaId, setDisciplinaId] = useState('')
  const [turmaId, setTurmaId] = useState('')
  const [nomeNovaDisciplina, setNomeNovaDisciplina] = useState('')
  const [nomeNovaTurma, setNomeNovaTurma] = useState('')
  const [loadingCatalogo, setLoadingCatalogo] = useState(true)
  const [salvandoCatalogo, setSalvandoCatalogo] = useState(false)
  const [erroCatalogo, setErroCatalogo] = useState<string | null>(null)

  const [alunos, setAlunos] = useState<AlunoPermitido[]>([])
  const [datas, setDatas] = useState<DataApresentacao[]>([])
  const [grupos, setGrupos] = useState<GrupoComAlunos[]>([])
  const [loadingTurma, setLoadingTurma] = useState(true)
  const [erroTurma, setErroTurma] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [alunoRemovendo, setAlunoRemovendo] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting')

  const [config, setConfig] = useState<ConfiguracaoForm>(configuracaoPadrao)
  const [temas, setTemas] = useState<TemaTurma[]>([])
  const [novoTemaTitulo, setNovoTemaTitulo] = useState('')
  const [novoTemaLimite, setNovoTemaLimite] = useState(1)
  const [salvandoTema, setSalvandoTema] = useState(false)
  const [temaAtualizandoId, setTemaAtualizandoId] = useState<string | null>(null)
  const [temaRemovendoId, setTemaRemovendoId] = useState<string | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [mensagemConfig, setMensagemConfig] = useState<string | null>(null)

  const [modalAlunoAberto, setModalAlunoAberto] = useState(false)
  const [modalCsvAberto, setModalCsvAberto] = useState(false)
  const [modalHorarioAberto, setModalHorarioAberto] = useState(false)
  const [slotEditando, setSlotEditando] = useState<DataApresentacao | null>(null)
  const [slotExcluindoId, setSlotExcluindoId] = useState<string | null>(null)

  const disciplinaAtiva = disciplinas.find((disciplina) => disciplina.id === disciplinaId)
  const turmaAtiva = turmas.find((turma) => turma.id === turmaId)
  const turmasDaDisciplina = turmas.filter((turma) => turma.disciplina_id === disciplinaId)

  const buscarCatalogo = useCallback(async () => {
    const [disciplinasResult, turmasResult] = await Promise.all([
      supabase.from('disciplinas').select('id, nome').order('nome'),
      supabase.from('turmas').select('id, disciplina_id, nome_turma').order('nome_turma'),
    ])

    if (disciplinasResult.error) throw disciplinasResult.error
    if (turmasResult.error) throw turmasResult.error

    return {
      disciplinas: disciplinasResult.data ?? [],
      turmas: turmasResult.data ?? [],
    }
  }, [supabase])

  const buscarDadosTurma = useCallback(
    async (id: string): Promise<DadosTurma> => {
      const [alunosResult, datasResult, gruposResult, configResult, temasResult] = await Promise.all([
        supabase
          .from('alunos_permitidos')
          .select('id, turma_id, matricula, nome')
          .eq('turma_id', id)
          .order('nome'),
        supabase
          .from('datas_apresentacao')
          .select('id, turma_id, data_hora, data_hora_fim, vagas_totais, vagas_ocupadas')
          .eq('turma_id', id)
          .order('data_hora'),
        supabase
          .from('grupos')
          .select('id, nome_grupo, turma_id, tema_projeto, tema_turma_id, link_repositorio, data_apresentacao_id')
          .eq('turma_id', id)
          .order('nome_grupo'),
        supabase.from('configuracoes').select('*').eq('turma_id', id).maybeSingle(),
        supabase
          .from('temas_turma')
          .select('id, turma_id, titulo, limite_grupos, created_at')
          .eq('turma_id', id)
          .order('created_at'),
      ])

      if (alunosResult.error) throw alunosResult.error
      if (datasResult.error) throw datasResult.error
      if (gruposResult.error) throw gruposResult.error
      if (configResult.error) throw configResult.error
      if (temasResult.error) throw temasResult.error

      const groups = gruposResult.data ?? []
      let integrantes: Aluno[] = []
      if (groups.length > 0) {
        const alunosGrupoResult = await supabase
          .from('alunos')
          .select('id, grupo_id, nome, matricula, email, eh_lider')
          .in('grupo_id', groups.map((group) => group.id))
          .order('nome')

        if (alunosGrupoResult.error) throw alunosGrupoResult.error
        integrantes = alunosGrupoResult.data ?? []
      }

      return {
        alunos: alunosResult.data ?? [],
        datas: datasResult.data ?? [],
        grupos: groups.map((group) => ({
          ...group,
          alunos: integrantes.filter((aluno) => aluno.grupo_id === group.id),
        })),
        temas: temasResult.data ?? [],
        configuracao: mapearConfiguracao(configResult.data),
      }
    },
    [supabase]
  )

  useEffect(() => {
    let active = true

    void buscarCatalogo()
      .then(({ disciplinas: catalogoDisciplinas, turmas: catalogoTurmas }) => {
        if (!active) return
        setDisciplinas(catalogoDisciplinas)
        setTurmas(catalogoTurmas)

        if (catalogoTurmas.length > 0) {
          const firstClass = catalogoTurmas[0]
          setDisciplinaId(firstClass.disciplina_id)
          setTurmaId(firstClass.id)
        } else if (catalogoDisciplinas.length > 0) {
          setDisciplinaId(catalogoDisciplinas[0].id)
        }
        setErroCatalogo(null)
      })
      .catch((error: unknown) => {
        console.error('Erro ao carregar disciplinas e turmas:', error)
        if (active) setErroCatalogo(`Não foi possível carregar disciplinas e turmas: ${getErrorMessage(error)}`)
      })
      .finally(() => {
        if (active) setLoadingCatalogo(false)
      })

    return () => {
      active = false
    }
  }, [buscarCatalogo])

  useEffect(() => {
    if (!turmaId) return

    let active = true

    void buscarDadosTurma(turmaId)
      .then((dados) => {
        if (!active) return
        aplicarDadosTurma(dados, { setAlunos, setDatas, setGrupos, setTemas, setConfig })
        setErroTurma(null)
        setErroAcao(null)
      })
      .catch((error: unknown) => {
        console.error('Erro ao carregar dados da turma:', error)
        if (active) setErroTurma(`Não foi possível carregar os dados da turma: ${getErrorMessage(error)}`)
      })
      .finally(() => {
        if (active) {
          setLoadingTurma(false)
          setLoadingConfig(false)
        }
      })

    return () => {
      active = false
    }
  }, [buscarDadosTurma, turmaId])

  useEffect(() => {
    if (!turmaId) return

    let active = true
    const channel = supabase
      .channel(`painel-professor-${turmaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'datas_apresentacao', filter: `turma_id=eq.${turmaId}` },
        () => {
          void buscarDadosTurma(turmaId)
            .then((dados) => {
              if (active) aplicarDadosTurma(dados, { setAlunos, setDatas, setGrupos, setTemas, setConfig })
            })
            .catch((error: unknown) => {
              console.error('Erro ao atualizar slots em tempo real:', error)
              if (active) setErroTurma(`Falha ao atualizar os horários: ${getErrorMessage(error)}`)
            })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'grupos', filter: `turma_id=eq.${turmaId}` },
        () => {
          void buscarDadosTurma(turmaId)
            .then((dados) => {
              if (active) aplicarDadosTurma(dados, { setAlunos, setDatas, setGrupos, setTemas, setConfig })
            })
            .catch((error: unknown) => {
              console.error('Erro ao atualizar grupos em tempo real:', error)
              if (active) setErroTurma(`Falha ao atualizar os agendamentos: ${getErrorMessage(error)}`)
            })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('connected')
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeStatus('offline')
        }
      })

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [buscarDadosTurma, supabase, turmaId])

  const atualizarDadosTurma = async (): Promise<void> => {
    if (!turmaId) return

    try {
      const dados = await buscarDadosTurma(turmaId)
      aplicarDadosTurma(dados, { setAlunos, setDatas, setGrupos, setTemas, setConfig })
      setErroTurma(null)
    } catch (error) {
      console.error('Erro ao atualizar dados da turma:', error)
      setErroTurma(`Não foi possível atualizar os dados da turma: ${getErrorMessage(error)}`)
      throw error
    }
  }

  const handleSelectDisciplina = (value: string) => {
    setDisciplinaId(value)
    const classForDiscipline = turmas.find((turma) => turma.disciplina_id === value)
    setTurmaId(classForDiscipline?.id ?? '')
    setLoadingTurma(Boolean(classForDiscipline))
    setLoadingConfig(Boolean(classForDiscipline))
    setRealtimeStatus('connecting')
    setErroTurma(null)
    setErroAcao(null)
    setAlunos([])
    setDatas([])
    setGrupos([])
    setTemas([])
    setConfig(configuracaoPadrao)
  }

  const handleSelectTurma = (value: string) => {
    setTurmaId(value)
    setLoadingTurma(Boolean(value))
    setLoadingConfig(Boolean(value))
    setRealtimeStatus('connecting')
    setErroTurma(null)
    setErroAcao(null)
    setAlunos([])
    setDatas([])
    setGrupos([])
    setTemas([])
    setConfig(configuracaoPadrao)
  }

  const handleCriarDisciplina = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nome = nomeNovaDisciplina.trim()
    if (!nome) return

    try {
      setSalvandoCatalogo(true)
      setErroCatalogo(null)
      const { data, error } = await supabase
        .from('disciplinas')
        .insert({ nome })
        .select('id, nome')
        .single()

      if (error) throw error
      const disciplina = data
      setDisciplinas((atuais) => [...atuais, disciplina].sort((a, b) => a.nome.localeCompare(b.nome)))
      setDisciplinaId(disciplina.id)
      setTurmaId('')
      setNomeNovaDisciplina('')
    } catch (error) {
      console.error('Erro ao criar disciplina:', error)
      setErroCatalogo(`Não foi possível criar a disciplina: ${getErrorMessage(error)}`)
    } finally {
      setSalvandoCatalogo(false)
    }
  }

  const handleCriarTurma = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nome = nomeNovaTurma.trim()
    if (!disciplinaId || !nome) return

    try {
      setSalvandoCatalogo(true)
      setErroCatalogo(null)
      const { data, error } = await supabase
        .from('turmas')
        .insert({ disciplina_id: disciplinaId, nome_turma: nome })
        .select('id, disciplina_id, nome_turma')
        .single()

      if (error) throw error
      const turma = data
      setTurmas((atuais) => [...atuais, turma].sort((a, b) => a.nome_turma.localeCompare(b.nome_turma)))
      setTurmaId(turma.id)
      setNomeNovaTurma('')
    } catch (error) {
      console.error('Erro ao criar turma:', error)
      setErroCatalogo(`Não foi possível criar a turma: ${getErrorMessage(error)}`)
    } finally {
      setSalvandoCatalogo(false)
    }
  }

  const handleExcluirAluno = async (aluno: AlunoPermitido) => {
    if (!confirm(`Deseja remover ${aluno.nome} (${aluno.matricula}) desta turma?`)) return

    try {
      setAlunoRemovendo(aluno.matricula)
      setErroAcao(null)
      const { error } = await supabase
        .from('alunos_permitidos')
        .delete()
        .eq('turma_id', aluno.turma_id)
        .eq('matricula', aluno.matricula)

      if (error) throw error
      await atualizarDadosTurma()
    } catch (error) {
      console.error('Erro ao excluir aluno permitido:', error)
      setErroAcao(`Não foi possível excluir o aluno: ${getErrorMessage(error)}`)
    } finally {
      setAlunoRemovendo(null)
    }
  }

  const handleExcluirHorario = async (slot: DataApresentacao) => {
    const reservado = grupos.some((grupo) => grupo.data_apresentacao_id === slot.id)
    if (slot.vagas_ocupadas > 0 || reservado) {
      setErroAcao('Este horário tem grupos agendados e não pode ser excluído.')
      return
    }

    if (!confirm(`Deseja excluir o horário de ${formatarDataHora(slot.data_hora)}?`)) return

    try {
      setSlotExcluindoId(slot.id)
      setErroAcao(null)

      const { data: grupoExistente, error: erroBusca } = await supabase
        .from('grupos')
        .select('id')
        .eq('data_apresentacao_id', slot.id)
        .limit(1)
        .maybeSingle()

      if (erroBusca) throw erroBusca
      if (grupoExistente) {
        throw new Error('Este horário tem grupo(s) agendado(s) e não pode ser excluído.')
      }

      const { data: horarioExcluido, error } = await supabase
        .from('datas_apresentacao')
        .delete()
        .eq('id', slot.id)
        .eq('turma_id', turmaId)
        .eq('vagas_ocupadas', 0)
        .select('id')
        .maybeSingle()

      if (error) throw error
      if (!horarioExcluido) {
        throw new Error('O horário mudou ou já foi removido. Atualize os dados e tente novamente.')
      }

      await atualizarDadosTurma()
    } catch (error) {
      console.error('Erro ao excluir horário:', error)
      setErroAcao(`Não foi possível excluir o horário: ${getErrorMessage(error)}`)
    } finally {
      setSlotExcluindoId(null)
    }
  }

  const handleAdicionarTema = async () => {
    const titulo = novoTemaTitulo.trim()
    if (!turmaId || !titulo || !Number.isInteger(novoTemaLimite) || novoTemaLimite < 1) {
      setErroAcao('Informe um título e um limite de grupos válido para o tema.')
      return
    }

    try {
      setSalvandoTema(true)
      setErroAcao(null)
      const { data, error } = await supabase
        .from('temas_turma')
        .insert({ turma_id: turmaId, titulo, limite_grupos: novoTemaLimite })
        .select('id, turma_id, titulo, limite_grupos, created_at')
        .single()

      if (error) throw error
      setTemas((atuais) => [...atuais, data])
      setNovoTemaTitulo('')
      setNovoTemaLimite(1)
    } catch (error) {
      console.error('Erro ao adicionar tema da turma:', error)
      setErroAcao(`Não foi possível adicionar o tema: ${getErrorMessage(error)}`)
    } finally {
      setSalvandoTema(false)
    }
  }

  const handleAtualizarTema = async (tema: TemaTurma) => {
    const titulo = tema.titulo.trim()
    if (!titulo || !Number.isInteger(tema.limite_grupos) || tema.limite_grupos < 1) {
      setErroAcao('Informe um título e um limite de grupos válido para o tema.')
      return
    }

    try {
      setTemaAtualizandoId(tema.id)
      setErroAcao(null)
      const { data, error } = await supabase
        .from('temas_turma')
        .update({ titulo, limite_grupos: tema.limite_grupos })
        .eq('id', tema.id)
        .eq('turma_id', turmaId)
        .select('id, turma_id, titulo, limite_grupos, created_at')
        .single()

      if (error) throw error
      setTemas((atuais) => atuais.map((atual) => atual.id === tema.id ? data : atual))
    } catch (error) {
      console.error('Erro ao atualizar tema da turma:', error)
      setErroAcao(`Não foi possível atualizar o tema: ${getErrorMessage(error)}`)
    } finally {
      setTemaAtualizandoId(null)
    }
  }

  const handleExcluirTema = async (tema: TemaTurma) => {
    if (grupos.some((grupo) => grupo.tema_turma_id === tema.id)) {
      setErroAcao('Não é possível remover um tema que já foi escolhido por um grupo.')
      return
    }

    try {
      setTemaRemovendoId(tema.id)
      setErroAcao(null)
      const { error } = await supabase
        .from('temas_turma')
        .delete()
        .eq('id', tema.id)
        .eq('turma_id', turmaId)

      if (error) throw error
      setTemas((atuais) => atuais.filter((atual) => atual.id !== tema.id))
    } catch (error) {
      console.error('Erro ao remover tema da turma:', error)
      setErroAcao(`Não foi possível remover o tema: ${getErrorMessage(error)}`)
    } finally {
      setTemaRemovendoId(null)
    }
  }

  const handleSalvarConfiguracoes = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!turmaId) return
    if (config.limite_alunos_grupo < config.limite_alunos_min) {
      setErroAcao(`O limite do grupo não pode ser menor que o mínimo de ${config.limite_alunos_min} alunos.`)
      return
    }
    if (
      config.data_inicio_agendamento &&
      config.data_fim_agendamento &&
      new Date(config.data_fim_agendamento) <= new Date(config.data_inicio_agendamento)
    ) {
      setErroAcao('O encerramento dos agendamentos deve ocorrer após a abertura.')
      return
    }

    try {
      setSavingConfig(true)
      setMensagemConfig(null)
      setErroAcao(null)
      const { error } = await supabase
        .from('configuracoes')
        .upsert(
          {
            turma_id: turmaId,
            limite_alunos_min: config.limite_alunos_min,
            limite_alunos_max: config.limite_alunos_grupo,
            limite_alunos_grupo: config.limite_alunos_grupo,
            permitir_inscricoes: config.permitir_inscricoes,
            tipo_tema: config.tipo_tema,
            data_inicio_agendamento: config.data_inicio_agendamento
              ? new Date(config.data_inicio_agendamento).toISOString()
              : null,
            data_fim_agendamento: config.data_fim_agendamento
              ? new Date(config.data_fim_agendamento).toISOString()
              : null,
            mostrar_Integrantes: config.mostrar_Integrantes,
          },
          { onConflict: 'turma_id' }
        )

      if (error) throw error
      setMensagemConfig('Configurações da turma salvas com sucesso.')
    } catch (error) {
      console.error('Erro ao salvar configurações da turma:', error)
      setErroAcao(`Não foi possível salvar as configurações: ${getErrorMessage(error)}`)
    } finally {
      setSavingConfig(false)
    }
  }

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      router.push('/professor/login')
    } catch (error) {
      console.error('Erro ao encerrar sessão:', error)
      setErroAcao(`Não foi possível encerrar a sessão: ${getErrorMessage(error)}`)
    }
  }

  const abas: Array<{ id: Aba; titulo: string; icon: typeof CalendarDays }> = [
    { id: 'grupos', titulo: 'Agendamentos & Grupos', icon: CalendarDays },
    { id: 'alunos', titulo: 'Lista de Alunos', icon: Users },
    { id: 'horarios', titulo: 'Datas e Horários', icon: Clock3 },
    { id: 'config', titulo: 'Configurações', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight text-blue-700">GrupoHub</span>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              Painel do Professor
            </span>
          </div>
          <button className="flex items-center gap-2 text-sm text-slate-500 transition hover:text-red-600" onClick={() => void handleLogout()} type="button">
            <LogOut size={16} /> Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <GraduationCap className="h-5 w-5 text-blue-600" />
            <div>
              <h1 className="font-semibold text-slate-900">Turma ativa</h1>
              <p className="text-sm text-slate-500">Os alunos, horários, grupos e configurações acompanham a seleção.</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Disciplina
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                disabled={loadingCatalogo}
                onChange={(event) => handleSelectDisciplina(event.target.value)}
                value={disciplinaId}
              >
                <option value="">Selecione uma disciplina</option>
                {disciplinas.map((disciplina) => (
                  <option key={disciplina.id} value={disciplina.id}>{disciplina.nome}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Turma
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                disabled={!disciplinaId || loadingCatalogo}
                onChange={(event) => handleSelectTurma(event.target.value)}
                value={turmaId}
              >
                <option value="">Selecione uma turma</option>
                {turmasDaDisciplina.map((turma) => (
                  <option key={turma.id} value={turma.id}>{turma.nome_turma}</option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <span className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                {turmaAtiva
                  ? `${disciplinaAtiva?.nome ?? 'Disciplina'} · ${turmaAtiva.nome_turma}`
                  : 'Nenhuma turma selecionada'}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 lg:grid-cols-2">
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => void handleCriarDisciplina(event)}>
              <input
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                maxLength={120}
                onChange={(event) => setNomeNovaDisciplina(event.target.value)}
                placeholder="Nova disciplina"
                required
                value={nomeNovaDisciplina}
              />
              <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={salvandoCatalogo} type="submit">
                <Plus size={16} /> Criar disciplina
              </button>
            </form>

            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => void handleCriarTurma(event)}>
              <input
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={!disciplinaId}
                maxLength={120}
                onChange={(event) => setNomeNovaTurma(event.target.value)}
                placeholder="Nova turma (ex.: 2026.2)"
                required
                value={nomeNovaTurma}
              />
              <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50" disabled={salvandoCatalogo || !disciplinaId} type="submit">
                <Plus size={16} /> Criar turma
              </button>
            </form>
          </div>

          {erroCatalogo && <p className="mt-4 text-sm text-red-700" role="alert">{erroCatalogo}</p>}
        </section>

        {erroTurma && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{erroTurma}</p>
        )}
        {erroAcao && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{erroAcao}</p>
        )}

        <nav aria-label="Seções do painel" className="overflow-x-auto border-b border-slate-200">
          <div className="flex min-w-max gap-6">
            {abas.map(({ id, titulo, icon: Icon }) => (
              <button
                aria-current={abaAtiva === id ? 'page' : undefined}
                className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition ${
                  abaAtiva === id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
                key={id}
                onClick={() => setAbaAtiva(id)}
                type="button"
              >
                <Icon size={17} /> {titulo}
                {id === 'alunos' && <span className="text-xs text-slate-400">({alunos.length})</span>}
              </button>
            ))}
          </div>
        </nav>

        {!turmaId ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <GraduationCap className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <h2 className="font-semibold text-slate-800">Selecione ou crie uma turma</h2>
            <p className="mt-1 text-sm text-slate-500">Escolha a disciplina e a turma no painel acima para gerenciar os dados.</p>
          </div>
        ) : loadingTurma ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500" role="status">
            Carregando dados de {turmaAtiva?.nome_turma ?? 'turma'}...
          </div>
        ) : (
          <>
            {abaAtiva === 'grupos' && (
              <section className="space-y-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Agendamentos e grupos</h2>
                    <p className="text-sm text-slate-500">Reservas e grupos inscritos nesta turma.</p>
                  </div>
                  <span className={`inline-flex items-center gap-2 text-xs ${realtimeStatus === 'connected' ? 'text-emerald-700' : 'text-amber-700'}`}>
                    <span className={`h-2 w-2 rounded-full ${realtimeStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {realtimeStatus === 'connected' ? 'Atualização em tempo real ativa' : 'Tempo real indisponível'}
                  </span>
                </div>

                {grupos.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                    Nenhum grupo agendado para esta turma.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[700px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-5 py-3 font-semibold">Grupo</th>
                            <th className="px-5 py-3 font-semibold">Tema</th>
                            <th className="px-5 py-3 font-semibold">Integrantes</th>
                            <th className="px-5 py-3 font-semibold">Apresentação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {grupos.map((grupo) => {
                            const slot = datas.find((data) => data.id === grupo.data_apresentacao_id)
                            return (
                              <tr key={grupo.id} className="align-top">
                                <td className="px-5 py-4 font-semibold text-slate-800">{grupo.nome_grupo}</td>
                                <td className="max-w-xs px-5 py-4 text-slate-600">{grupo.tema_projeto}</td>
                                <td className="px-5 py-4 text-slate-600">
                                  {grupo.alunos.length > 0
                                    ? grupo.alunos.map((aluno) => aluno.nome).join(', ')
                                    : 'Sem integrantes cadastrados'}
                                </td>
                                <td className="px-5 py-4 text-slate-600">
                                  {slot
                                    ? `${formatarDataHora(slot.data_hora)}${slot.data_hora_fim ? ` – ${horarioDoSlot(slot.data_hora_fim)}` : ''}`
                                    : 'Sem horário'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            )}

            {abaAtiva === 'alunos' && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Alunos autorizados</h2>
                    <p className="text-sm text-slate-500">Matrículas vinculadas a {turmaAtiva?.nome_turma}.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => setModalCsvAberto(true)} type="button">
                      <FileUp size={16} /> Importar CSV
                    </button>
                    <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700" onClick={() => setModalAlunoAberto(true)} type="button">
                      <UserPlus size={16} /> Adicionar aluno
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px] text-left text-sm">
                      <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-5 py-3 font-semibold">Matrícula</th>
                          <th className="px-5 py-3 font-semibold">Nome completo</th>
                          <th className="px-5 py-3 text-right font-semibold">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {alunos.length === 0 ? (
                          <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={3}>Nenhum aluno cadastrado nesta turma.</td></tr>
                        ) : alunos.map((aluno) => (
                          <tr key={aluno.id}>
                            <td className="px-5 py-3.5 font-mono text-xs text-slate-700">{aluno.matricula}</td>
                            <td className="px-5 py-3.5 font-medium text-slate-800">{aluno.nome}</td>
                            <td className="px-5 py-3.5 text-right">
                              <button
                                aria-label={`Excluir ${aluno.nome}`}
                                className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                disabled={alunoRemovendo === aluno.matricula}
                                onClick={() => void handleExcluirAluno(aluno)}
                                title="Excluir aluno"
                                type="button"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {abaAtiva === 'horarios' && (
              <section className="space-y-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Datas e horários de apresentação</h2>
                    <p className="text-sm text-slate-500">Ocupação e disponibilidade atualizadas conforme os agendamentos.</p>
                  </div>
                  <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700" onClick={() => { setSlotEditando(null); setModalHorarioAberto(true) }} type="button">
                    <Plus size={16} /> Cadastrar horário
                  </button>
                </div>

                {datas.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                    Ainda não há horários cadastrados para esta turma.
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {datas.map((slot) => {
                      const disponiveis = Math.max(0, slot.vagas_totais - slot.vagas_ocupadas)
                      const percentual = slot.vagas_totais > 0
                        ? Math.min(100, (slot.vagas_ocupadas / slot.vagas_totais) * 100)
                        : 0
                      const gruposDoSlot = grupos.filter((grupo) => grupo.data_apresentacao_id === slot.id)

                      return (
                        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={slot.id}>
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="font-semibold capitalize text-slate-900">{dataDoSlot(slot)}</h3>
                              <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                                <Clock3 size={15} />
                                {horarioDoSlot(slot.data_hora)}
                                {slot.data_hora_fim && ` – ${horarioDoSlot(slot.data_hora_fim)}`}
                              </p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${disponiveis > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              {disponiveis > 0 ? `${disponiveis} vagas` : 'Lotado'}
                            </span>
                          </div>

                          <div className="mt-5">
                            <div className="mb-2 flex justify-between text-xs text-slate-500">
                              <span>{slot.vagas_ocupadas} grupos agendados</span>
                              <span>{disponiveis} de {slot.vagas_totais} disponíveis</span>
                            </div>
                            <div aria-label={`${slot.vagas_ocupadas} de ${slot.vagas_totais} vagas ocupadas`} className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemax={slot.vagas_totais} aria-valuemin={0} aria-valuenow={slot.vagas_ocupadas}>
                              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percentual}%` }} />
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                            {gruposDoSlot.length > 0 ? (
                              <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Grupos neste horário</p>
                              <ul className="space-y-1 text-sm text-slate-700">
                                {gruposDoSlot.map((grupo) => <li key={grupo.id}>{grupo.nome_grupo}</li>)}
                              </ul>
                              </div>
                            ) : <span className="text-xs text-slate-500">Nenhum grupo agendado</span>}
                            <div className="ml-auto flex items-center gap-2">
                              <button
                                aria-label={`Editar horário de ${dataDoSlot(slot)}`}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                onClick={() => { setSlotEditando(slot); setModalHorarioAberto(true) }}
                                title="Editar horário"
                                type="button"
                              >
                                <Pencil size={15} /> Editar
                              </button>
                              <button
                                aria-label={`Excluir horário de ${dataDoSlot(slot)}`}
                                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                                disabled={slotExcluindoId === slot.id || slot.vagas_ocupadas > 0 || gruposDoSlot.length > 0}
                                onClick={() => void handleExcluirHorario(slot)}
                                title={slot.vagas_ocupadas > 0 || gruposDoSlot.length > 0 ? 'Não é possível excluir um horário com grupos agendados' : 'Excluir horário'}
                                type="button"
                              >
                                <Trash2 size={15} />
                                {slotExcluindoId === slot.id ? 'Excluindo...' : 'Excluir'}
                              </button>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
                <p className={`text-xs ${realtimeStatus === 'connected' ? 'text-emerald-700' : 'text-amber-700'}`} role="status">
                  {realtimeStatus === 'connected' ? 'Dados sincronizados em tempo real pelo Supabase.' : 'Aguardando conexão em tempo real do Supabase.'}
                </p>
              </section>
            )}

            {abaAtiva === 'config' && (
              <section className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6">
                  <h2 className="text-lg font-bold text-slate-900">Configurações de {turmaAtiva?.nome_turma}</h2>
                  <p className="mt-1 text-sm text-slate-500">Estes parâmetros são armazenados para a turma selecionada.</p>
                </div>

                {mensagemConfig && (
                  <p className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" role="status">
                    <CheckCircle2 size={17} /> {mensagemConfig}
                  </p>
                )}

                {loadingConfig ? (
                  <p className="text-sm text-slate-500" role="status">Carregando configurações...</p>
                ) : (
                  <form className="space-y-5" onSubmit={(event) => void handleSalvarConfiguracoes(event)}>
                    <fieldset className="space-y-3">
                      <legend className="text-sm font-semibold text-slate-700">Escolha do tema</legend>
                      <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
                        <input
                          checked={config.tipo_tema === 'livre'}
                          className="mt-0.5 h-4 w-4 accent-blue-600"
                          name="tipo_tema"
                          onChange={(event) => {
                            if (event.target.checked) setConfig((atual) => ({ ...atual, tipo_tema: 'livre' }))
                          }}
                          type="radio"
                          value="livre"
                        />
                        <span>
                          <span className="block font-medium">Tema livre</span>
                          <span className="mt-1 block text-xs text-slate-500">Os alunos informam o tema do projeto na inscrição.</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
                        <input
                          checked={config.tipo_tema === 'pre_definido'}
                          className="mt-0.5 h-4 w-4 accent-blue-600"
                          name="tipo_tema"
                          onChange={(event) => {
                            if (event.target.checked) setConfig((atual) => ({ ...atual, tipo_tema: 'pre_definido' }))
                          }}
                          type="radio"
                          value="pre_definido"
                        />
                        <span>
                          <span className="block font-medium">Temas pré-definidos</span>
                          <span className="mt-1 block text-xs text-slate-500">Os alunos escolhem entre os temas cadastrados para esta turma.</span>
                        </span>
                      </label>
                    </fieldset>

                    {config.tipo_tema === 'pre_definido' && (
                      <section aria-label="Temas pré-definidos da turma" className="space-y-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800">Temas desta turma</h3>
                          <p className="mt-1 text-xs text-slate-500">Defina quantos grupos podem escolher cada tema. Temas já usados não podem ser removidos.</p>
                        </div>

                        <div className="space-y-3">
                          {temas.map((tema) => {
                            const gruposDoTema = grupos.filter((grupo) => grupo.tema_turma_id === tema.id).length
                            const removendo = temaRemovendoId === tema.id
                            return (
                              <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto_auto]" key={tema.id}>
                                <label className="space-y-1 text-xs font-medium text-slate-600">
                                  Título
                                  <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                                    maxLength={200}
                                    onChange={(event) => setTemas((atuais) => atuais.map((atual) => atual.id === tema.id ? { ...atual, titulo: event.target.value } : atual))}
                                    value={tema.titulo}
                                  />
                                </label>
                                <label className="space-y-1 text-xs font-medium text-slate-600">
                                  Limite de grupos
                                  <input
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                                    min={1}
                                    onChange={(event) => setTemas((atuais) => atuais.map((atual) => atual.id === tema.id ? { ...atual, limite_grupos: Number(event.target.value) } : atual))}
                                    type="number"
                                    value={tema.limite_grupos}
                                  />
                                  <span className="block font-normal">{gruposDoTema} de {tema.limite_grupos} grupo(s)</span>
                                </label>
                                <button
                                  className="self-end rounded-md border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                  disabled={temaAtualizandoId === tema.id || removendo}
                                  onClick={() => void handleAtualizarTema(tema)}
                                  type="button"
                                >
                                  {temaAtualizandoId === tema.id ? 'Salvando...' : 'Salvar'}
                                </button>
                                <button
                                  aria-label={`Remover tema ${tema.titulo}`}
                                  className="self-end rounded-md border border-red-200 p-2 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={gruposDoTema > 0 || removendo || temaAtualizandoId === tema.id}
                                  onClick={() => void handleExcluirTema(tema)}
                                  title={gruposDoTema > 0 ? 'Este tema já foi escolhido por um grupo' : 'Remover tema'}
                                  type="button"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            )
                          })}
                          {temas.length === 0 && (
                            <p className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Nenhum tema cadastrado para esta turma.</p>
                          )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
                          <label className="space-y-1 text-xs font-medium text-slate-600">
                            Novo tema
                            <input
                              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                              maxLength={200}
                              onChange={(event) => setNovoTemaTitulo(event.target.value)}
                              placeholder="Título do tema"
                              value={novoTemaTitulo}
                            />
                          </label>
                          <label className="space-y-1 text-xs font-medium text-slate-600">
                            Limite de grupos
                            <input
                              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                              min={1}
                              onChange={(event) => setNovoTemaLimite(Number(event.target.value))}
                              type="number"
                              value={novoTemaLimite}
                            />
                          </label>
                          <button
                            className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            disabled={salvandoTema || !novoTemaTitulo.trim() || novoTemaLimite < 1}
                            onClick={() => void handleAdicionarTema()}
                            type="button"
                          >
                            <Plus size={16} /> {salvandoTema ? 'Adicionando...' : 'Adicionar tema'}
                          </button>
                        </div>
                      </section>
                    )}

                    <label className="block max-w-xs space-y-1 text-sm font-medium text-slate-700">
                      Limite de alunos por grupo
                      <input
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                        max={20}
                        min={config.limite_alunos_min}
                        onChange={(event) => setConfig((atual) => ({ ...atual, limite_alunos_grupo: Number(event.target.value) }))}
                        required
                        type="number"
                        value={config.limite_alunos_grupo}
                      />
                      <span className="block text-xs font-normal text-slate-500">Mínimo atual: {config.limite_alunos_min} integrante(s).</span>
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-1 text-sm font-medium text-slate-700">
                        Abertura dos agendamentos
                        <input
                          className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                          onChange={(event) => setConfig((atual) => ({ ...atual, data_inicio_agendamento: event.target.value }))}
                          type="datetime-local"
                          value={config.data_inicio_agendamento}
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium text-slate-700">
                        Encerramento dos agendamentos
                        <input
                          className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
                          onChange={(event) => setConfig((atual) => ({ ...atual, data_fim_agendamento: event.target.value }))}
                          type="datetime-local"
                          value={config.data_fim_agendamento}
                        />
                      </label>
                    </div>

                    <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                      <input
                        checked={config.mostrar_Integrantes}
                        className="mt-0.5 h-4 w-4 accent-blue-600"
                        onChange={(event) => setConfig((atual) => ({ ...atual, mostrar_Integrantes: event.target.checked }))}
                        type="checkbox"
                      />
                      <span>
                        <span className="block font-medium">Exibir integrantes nos agendamentos</span>
                        <span className="mt-1 block text-xs text-slate-500">Controla a visibilidade dos nomes dos alunos nesta turma.</span>
                      </span>
                    </label>

                    <label className="flex items-center gap-3 text-sm text-slate-700">
                      <input
                        checked={config.permitir_inscricoes}
                        className="h-4 w-4 accent-blue-600"
                        onChange={(event) => setConfig((atual) => ({ ...atual, permitir_inscricoes: event.target.checked }))}
                        type="checkbox"
                      />
                      Permitir inscrições de grupos nesta turma
                    </label>

                    <div className="flex justify-end border-t border-slate-100 pt-4">
                      <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50" disabled={savingConfig} type="submit">
                        <Save size={16} /> {savingConfig ? 'Salvando...' : 'Salvar configurações'}
                      </button>
                    </div>
                  </form>
                )}
              </section>
            )}
          </>
        )}
      </main>

      <ModalAdicionarAluno
        isOpen={modalAlunoAberto}
        onClose={() => setModalAlunoAberto(false)}
        onSuccess={atualizarDadosTurma}
        turmaId={turmaId}
      />
      <ModalImportarCSV
        isOpen={modalCsvAberto}
        onClose={() => setModalCsvAberto(false)}
        onSuccess={atualizarDadosTurma}
        turmaId={turmaId}
      />
      <ModalCadastrarHorario
        isOpen={modalHorarioAberto}
        onClose={() => {
          setModalHorarioAberto(false)
          setSlotEditando(null)
        }}
        onSuccess={atualizarDadosTurma}
        slot={slotEditando}
        turmaId={turmaId}
        key={slotEditando?.id ?? 'novo-slot'}
      />
    </div>
  )
}
