'use client'

import { useState, useEffect, useMemo, useCallback, type FormEvent } from 'react'
import { Users, Calendar, Settings, UserPlus, LogOut, Trash2, Save, CheckCircle2 } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import ModalAdicionarAluno from './components/ModalAdicionarAluno'
import type { AlunoPermitido, Configuracao } from '@/types/database'

type ConfiguracaoForm = {
  limite_alunos_grupo: Configuracao['limite_alunos_grupo']
  data_inicio_agendamento: string
  data_fim_agendamento: string
  mostrar_Integrantes: Configuracao['mostrar_Integrantes']
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

export default function PainelProfessor() {
  const [abaAtiva, setAbaAtiva] = useState<'grupos' | 'alunos' | 'config'>('alunos')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Estados de Alunos
  const [alunos, setAlunos] = useState<AlunoPermitido[]>([])
  const [loadingAlunos, setLoadingAlunos] = useState(true)
  const [erroAlunos, setErroAlunos] = useState<string | null>(null)

  // Estados de Configurações
  const [config, setConfig] = useState<ConfiguracaoForm>({
    limite_alunos_grupo: 5,
    data_inicio_agendamento: '',
    data_fim_agendamento: '',
    mostrar_Integrantes: true,
  })
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [mensagemConfig, setMensagemConfig] = useState<string | null>(null)
  const [erroConfig, setErroConfig] = useState<string | null>(null)

  const router = useRouter()
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  )

  const buscarAlunos = useCallback(async (): Promise<AlunoPermitido[]> => {
    const { data, error } = await supabase
      .from('alunos_permitidos')
      .select('*')
      .order('nome')

    if (error) throw error
    return data ?? []
  }, [supabase])

  const buscarConfiguracoes = useCallback(async (): Promise<ConfiguracaoForm | null> => {
    const { data, error } = await supabase
      .from('configuracoes')
      .select('*')
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    return {
      limite_alunos_grupo: data.limite_alunos_grupo ?? 5,
      data_inicio_agendamento: toDatetimeLocal(data.data_inicio_agendamento),
      data_fim_agendamento: toDatetimeLocal(data.data_fim_agendamento),
      mostrar_Integrantes: data.mostrar_Integrantes ?? true,
    }
  }, [supabase])

  const carregarAlunos = useCallback(async () => {
    try {
      setAlunos(await buscarAlunos())
      setErroAlunos(null)
    } catch (err) {
      console.error('Erro ao carregar alunos:', err)
      setErroAlunos(`Erro ao carregar alunos: ${getErrorMessage(err)}`)
    } finally {
      setLoadingAlunos(false)
    }
  }, [buscarAlunos])

  useEffect(() => {
    let active = true

    void buscarAlunos()
      .then((data) => {
        if (active) {
          setAlunos(data)
          setErroAlunos(null)
        }
      })
      .catch((err: unknown) => {
        console.error('Erro ao carregar alunos:', err)
        if (active) setErroAlunos(`Erro ao carregar alunos: ${getErrorMessage(err)}`)
      })
      .finally(() => {
        if (active) setLoadingAlunos(false)
      })

    void buscarConfiguracoes()
      .then((data) => {
        if (active && data) setConfig(data)
        if (active) setErroConfig(null)
      })
      .catch((err: unknown) => {
        console.error('Erro ao carregar configurações:', err)
        if (active) setErroConfig(`Erro ao carregar configurações: ${getErrorMessage(err)}`)
      })
      .finally(() => {
        if (active) setLoadingConfig(false)
      })

    return () => {
      active = false
    }
  }, [buscarAlunos, buscarConfiguracoes])

  const atualizarAlunos = () => {
    setLoadingAlunos(true)
    void carregarAlunos()
  }

  // Excluir Aluno
  const handleExcluirAluno = async (matricula: string) => {
    if (!confirm(`Deseja realmente remover a matrícula ${matricula}?`)) return

    try {
      const { error } = await supabase
        .from('alunos_permitidos')
        .delete()
        .eq('matricula', matricula)

      if (error) throw error
      atualizarAlunos()
    } catch (err) {
      console.error('Erro ao excluir aluno:', err)
      setErroAlunos(`Erro ao excluir aluno: ${getErrorMessage(err)}`)
    }
  }

  // Salvar Configurações
  const handleSalvarConfiguracoes = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      setSavingConfig(true)
      setMensagemConfig(null)
      setErroConfig(null)

      const { error } = await supabase
        .from('configuracoes')
        .upsert({
          id: 1,
          ...config,
          data_inicio_agendamento: config.data_inicio_agendamento
            ? new Date(config.data_inicio_agendamento).toISOString()
            : null,
          data_fim_agendamento: config.data_fim_agendamento
            ? new Date(config.data_fim_agendamento).toISOString()
            : null,
        })

      if (error) throw error

      setMensagemConfig('Configurações salvas com sucesso!')
      setTimeout(() => setMensagemConfig(null), 3000)
    } catch (err) {
      console.error('Erro ao salvar configurações:', err)
      setErroConfig(`Erro ao salvar configurações: ${getErrorMessage(err)}`)
    } finally {
      setSavingConfig(false)
    }
  }

  // Logout
  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      router.push('/professor/login')
    } catch (err) {
      console.error('Erro ao encerrar sessão:', err)
      setErroConfig(`Erro ao encerrar sessão: ${getErrorMessage(err)}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Header Superior Clean */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-xs">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-xl text-blue-600 tracking-tight">GrupoHub</span>
            <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium border border-blue-100">
              Painel do Professor
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-red-600 transition"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Navegação por Abas */}
        <div className="flex border-b border-gray-200 mb-8 gap-8">
          <button
            onClick={() => setAbaAtiva('grupos')}
            className={`pb-3 text-sm font-medium flex items-center gap-2 transition border-b-2 -mb-px ${
              abaAtiva === 'grupos'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Calendar size={18} /> Agendamentos & Grupos
          </button>

          <button
            onClick={() => setAbaAtiva('alunos')}
            className={`pb-3 text-sm font-medium flex items-center gap-2 transition border-b-2 -mb-px ${
              abaAtiva === 'alunos'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users size={18} /> Lista de Alunos ({alunos.length})
          </button>

          <button
            onClick={() => setAbaAtiva('config')}
            className={`pb-3 text-sm font-medium flex items-center gap-2 transition border-b-2 -mb-px ${
              abaAtiva === 'config'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Settings size={18} /> Configurações
          </button>
        </div>

        {/* Aba 1: Agendamentos & Grupos */}
        {abaAtiva === 'grupos' && (
          <div className="bg-white rounded-xl p-8 shadow-xs border border-gray-200 text-center py-12">
            <Calendar size={32} className="mx-auto text-blue-500 mb-3" />
            <h3 className="text-base font-semibold text-gray-800">Visualização de Agendamentos</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Aqui você poderá visualizar os grupos formados e suas respectivas datas de apresentação agendadas pelos alunos.
            </p>
          </div>
        )}

        {/* Aba 2: Lista de Alunos */}
        {abaAtiva === 'alunos' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Alunos Autorizados</h2>
                <p className="text-xs text-gray-500">
                  Gestão da tabela de controle (<code className="font-mono bg-gray-100 px-1 py-0.5 rounded">alunos_permitidos</code>).
                </p>
              </div>

              {erroAlunos && (
                <p role="alert" className="text-sm text-red-600">
                  {erroAlunos}
                </p>
              )}

              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-xs transition"
              >
                <UserPlus size={16} /> Adicionar Aluno
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Matrícula</th>
                    <th className="px-6 py-3 font-semibold">Nome Completo</th>
                    <th className="px-6 py-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingAlunos ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-6 text-center text-gray-400 text-xs">
                        Carregando lista de alunos...
                      </td>
                    </tr>
                  ) : alunos.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-gray-400 text-xs">
                        Nenhum aluno cadastrado. Utilize o botão acima para incluir manualmente.
                      </td>
                    </tr>
                  ) : (
                    alunos.map((aluno) => (
                      <tr key={aluno.matricula} className="hover:bg-gray-50/50 transition">
                        <td className="px-6 py-3.5 font-mono text-xs text-gray-700">{aluno.matricula}</td>
                        <td className="px-6 py-3.5 font-medium text-gray-800">{aluno.nome}</td>
                        <td className="px-6 py-3.5 text-right">
                          <button
                            onClick={() => handleExcluirAluno(aluno.matricula)}
                            className="text-gray-400 hover:text-red-600 transition p-1 rounded"
                            title="Remover aluno"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Aba 3: Configurações da Turma */}
        {abaAtiva === 'config' && (
          <div className="max-w-2xl bg-white rounded-xl p-6 shadow-xs border border-gray-200">
            <div className="mb-6">
              <h3 className="text-base font-bold text-gray-900">Parâmetros da Turma</h3>
              <p className="text-xs text-gray-500">
                Ajuste os limites e os prazos de abertura para a formação de grupos pelos alunos.
              </p>
            </div>

            {mensagemConfig && (
              <div className="mb-6 p-3 bg-green-50 text-green-700 text-xs rounded-lg border border-green-200 flex items-center gap-2">
                <CheckCircle2 size={16} /> {mensagemConfig}
              </div>
            )}

            {erroConfig && (
              <p role="alert" className="mb-6 text-sm text-red-600">
                {erroConfig}
              </p>
            )}

            {loadingConfig ? (
              <p className="text-xs text-gray-400">Carregando configurações...</p>
            ) : (
              <form onSubmit={handleSalvarConfiguracoes} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Limite Máximo de Alunos por Grupo
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    required
                    value={config.limite_alunos_grupo}
                    onChange={(e) =>
                      setConfig({ ...config, limite_alunos_grupo: parseInt(e.target.value) || 1 })
                    }
                    className="w-full max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                      Início dos Agendamentos
                    </label>
                    <input
                      type="datetime-local"
                      value={config.data_inicio_agendamento}
                      onChange={(e) =>
                        setConfig({ ...config, data_inicio_agendamento: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                      Término dos Agendamentos
                    </label>
                    <input
                      type="datetime-local"
                      value={config.data_fim_agendamento}
                      onChange={(e) =>
                        setConfig({ ...config, data_fim_agendamento: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="mostrar_integrantes"
                    checked={config.mostrar_Integrantes}
                    onChange={(e) =>
                      setConfig({ ...config, mostrar_Integrantes: e.target.checked })
                    }
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="mostrar_integrantes" className="text-sm text-gray-700 font-medium">
                    Exibir nomes dos integrantes publicamente nos agendamentos
                  </label>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-xs transition disabled:opacity-50"
                  >
                    <Save size={16} />
                    {savingConfig ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </main>

      {/* Modal de Adição Manual */}
      <ModalAdicionarAluno
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={atualizarAlunos}
      />
    </div>
  )
}