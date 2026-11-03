'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { Award, X } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

interface Props {
  isOpen: boolean
  turmaId: string
  onClose: () => void
  onSuccess: () => Promise<void>
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}

export default function ModalAdicionarRubrica({
  isOpen,
  turmaId,
  onClose,
  onSuccess,
}: Props) {
  const [titulo, setTitulo] = useState('')
  const [valorMaximo, setValorMaximo] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const supabase = useMemo(
    () =>
      createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  )

  if (!isOpen) return null

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const tituloNormalizado = titulo.trim()
    const valor = Number(valorMaximo)

    if (!tituloNormalizado) {
      setErro('Informe o título do critério.')
      return
    }

    if (!Number.isFinite(valor) || valor <= 0) {
      setErro('O valor máximo precisa ser maior que zero.')
      return
    }

    try {
      setLoading(true)
      setErro(null)
      const { error } = await supabase.from('rubricas').insert({
        turma_id: turmaId,
        titulo: tituloNormalizado,
        valor_maximo: valor,
      })

      if (error) throw error

      await onSuccess()
      setTitulo('')
      setValorMaximo('')
      onClose()
    } catch (error) {
      console.error('Erro ao cadastrar rubrica:', error)
      setErro(`Não foi possível cadastrar o critério: ${getErrorMessage(error)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section
        aria-labelledby="modal-adicionar-rubrica-titulo"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        role="dialog"
      >
        <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <Award className="h-5 w-5 text-blue-600" />
            <h2 className="font-semibold text-slate-900" id="modal-adicionar-rubrica-titulo">
              Adicionar critério
            </h2>
          </div>
          <button
            aria-label="Fechar"
            className="text-slate-400 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        {erro && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
            {erro}
          </p>
        )}

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block space-y-1 text-sm font-medium text-slate-700">
            Título do critério
            <input
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
              maxLength={200}
              onChange={(event) => setTitulo(event.target.value)}
              placeholder="Ex.: Qualidade técnica"
              required
              value={titulo}
            />
          </label>

          <label className="block space-y-1 text-sm font-medium text-slate-700">
            Valor máximo
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
              min="0.01"
              onChange={(event) => setValorMaximo(event.target.value)}
              required
              step="0.01"
              type="number"
              value={valorMaximo}
            />
          </label>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              onClick={onClose}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={loading || !turmaId}
              type="submit"
            >
              {loading ? 'Salvando...' : 'Adicionar critério'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
