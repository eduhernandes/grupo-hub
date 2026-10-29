'use client'

import { useState, useEffect } from 'react'
import { Users, Calendar, Settings, UserPlus, LogOut, Trash2 } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import ModalAdicionarAluno from './components/ModalAdicionarAluno'

interface Aluno {
  id?: string
  matricula: string
  nome: string
}

export default function PainelProfessor() {
  const [abaAtiva, setAbaAtiva] = useState<'grupos' | 'alunos' | 'config'>('alunos')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [loadingAlunos, setLoadingAlunos] = useState(true)

  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Buscar alunos cadastrados
  const carregarAlunos = async () => {
    try {
      setLoadingAlunos(true)
      const { data, error } = await supabase.from('alunos').select('*').order('nome')
      if (error) throw error
      if (data) setAlunos(data)
    } catch (err) {
      console.error('Erro ao carregar alunos:', err)
    } finally {
      setLoadingAlunos(false)
    }
  }

  useEffect(() => {
    carregarAlunos()
  }, [])

  // Excluir aluno
  const handleExcluirAluno = async (matricula: string) => {
    if (!confirm('Deseja realmente remover este aluno?')) return

    try {
      const { error } = await supabase.from('alunos').delete().eq('matricula', matricula)
      if (error) throw error
      carregarAlunos()
    } catch (err) {
      alert('Erro ao excluir aluno.')
    }
  }

  // Logout
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/professor/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      {/* Header Superior Limpo */}
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
            <Users size={18} /> Lista de Alunos
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

        {/* Aba: Agendamentos */}
        {abaAtiva === 'grupos' && (
          <div className="bg-white rounded-xl p-6 shadow-xs border border-gray-200 text-center py-12">
            <h3 className="text-base font-semibold text-gray-700">Visualização de Grupos</h3>
            <p className="text-xs text-gray-500 mt-1">Os grupos agendados aparecerão aqui em breve.</p>
          </div>
        )}

        {/* Aba: Lista de Alunos */}
        {abaAtiva === 'alunos' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Alunos Cadastrados</h2>
                <p className="text-xs text-gray-500">Gerencie e insira alunos autorizados a montar grupo.</p>
              </div>

              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-xs transition"
              >
                <UserPlus size={16} /> Adicionar Aluno
              </button>
            </div>

            {/* Tabela Clean de Alunos */}
            <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Matrícula</th>
                    <th className="px-6 py-3 font-semibold">Nome</th>
                    <th className="px-6 py-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingAlunos ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-6 text-center text-gray-400 text-xs">
                        Carregando alunos...
                      </td>
                    </tr>
                  ​) : alunos.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-gray-400 text-xs">
                        Nenhum aluno cadastrado ainda. Use o botão acima para incluir.
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

        {/* Aba: Configurações */}
        {abaAtiva === 'config' && (
          <div className="bg-white rounded-xl p-6 shadow-xs border border-gray-200">
            <h3 className="text-base font-semibold text-gray-800 mb-1">Configurações Gerais</h3>
            <p className="text-xs text-gray-500 mb-6">Parâmetros das turmas e prazos de entrega.</p>
            {/* Espaço para futuras configurações */}
          </div>
        )}
      </main>

      {/* Modal de Inclusão Manual */}
      <ModalAdicionarAluno
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={carregarAlunos}
      />
    </div>
  )
}