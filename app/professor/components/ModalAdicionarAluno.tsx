'use client'

import { useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function ModalAdicionarAluno({ isOpen, onClose, onSuccess }: Props) {
  const [matricula, setMatricula] = useState('')
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!matricula || !nome) return

    try {
      setLoading(true)
      setErro(null)

      // Insere o aluno na tabela do Supabase (ajuste o nome da tabela se necessário, ex: 'alunos')
      const { error } = await supabase
        .from('alunos')
        .insert([{ matricula: matricula.trim(), nome: nome.trim() }])

      if (error) {
        throw error
      }

      setMatricula('')
      setNome('')
      onSuccess()
      onClose()
    } catch (err: any) {
      setErro(err.message || 'Erro ao cadastrar aluno. Verifique se a matrícula já existe.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-gray-100">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
          <div className="flex items-center gap-2 text-gray-800 font-semibold">
            <UserPlus size={20} className="text-blue-600" />
            <h2>Cadastrar Aluno Manualmente</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={20} />
          </button>
        </div>

        {erro && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
            {erro}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
              Matrícula / ID
            </label>
            <input
              type="text"
              required
              placeholder="Ex: 20261099"
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
              Nome Completo do Aluno
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Ana Souza"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Adicionar Aluno'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}