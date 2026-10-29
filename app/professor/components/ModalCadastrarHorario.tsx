'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { CalendarPlus, X } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import type { Database, NovaData } from '@/types/database'

interface Props {
  isOpen: boolean
  turmaId: string
  onClose: () => void
  onSuccess: () => Promise<void>
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}

export default function ModalCadastrarHorario({ isOpen, turmaId, onClose, onSuccess }: Props) {
  const [data, setData] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [vagas, setVagas] = useState(1)
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
    if (!turmaId) return

    const inicio = new Date(`${data}T${horaInicio}`)
    const fim = new Date(`${data}T${horaFim}`)
    if (!Number.isInteger(vagas) || vagas < 1) {
      setErro('Informe uma quantidade inteira de vagas maior que zero.')
      return
    }

    if (
      Number.isNaN(inicio.getTime()) ||
      Number.isNaN(fim.getTime()) ||
      fim <= inicio
    ) {
      setErro('Informe um horário final posterior ao horário inicial.')
      return
    }

    try {
      setLoading(true)
      setErro(null)
      const slot: NovaData = {
        turma_id: turmaId,
        data_hora: inicio.toISOString(),
        data_hora_fim: fim.toISOString(),
        vagas_totais: vagas,
        vagas_ocupadas: 0,
      }
      const { error } = await supabase.from('datas_apresentacao').insert(slot)
      if (error) throw error

      setData('')
      setHoraInicio('')
      setHoraFim('')
      setVagas(1)
      await onSuccess()
      onClose()
    } catch (error) {
      console.error('Erro ao cadastrar horário:', error)
      setErro(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section
        aria-labelledby="modal-cadastrar-horario-titulo"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        role="dialog"
      >
        <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <CalendarPlus className="h-5 w-5 text-blue-600" />
            <h2 className="font-semibold text-slate-900" id="modal-cadastrar-horario-titulo">
              Cadastrar slot de apresentação
            </h2>
          </div>
          <button aria-label="Fechar" className="text-slate-400 hover:text-slate-700" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </div>

        {erro && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{erro}</p>}

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block space-y-1 text-sm font-medium text-slate-700">
            Data
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" onChange={(event) => setData(event.target.value)} required type="date" value={data} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm font-medium text-slate-700">
              Hora de início
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2" onChange={(event) => setHoraInicio(event.target.value)} required type="time" value={horaInicio} />
            </label>
            <label className="block space-y-1 text-sm font-medium text-slate-700">
              Hora de término
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2" onChange={(event) => setHoraFim(event.target.value)} required type="time" value={horaFim} />
            </label>
          </div>
          <label className="block space-y-1 text-sm font-medium text-slate-700">
            Vagas de grupos
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" min={1} onChange={(event) => setVagas(Number(event.target.value))} required step={1} type="number" value={vagas} />
          </label>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50" disabled={loading} type="submit">
              {loading ? 'Salvando...' : 'Cadastrar horário'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
