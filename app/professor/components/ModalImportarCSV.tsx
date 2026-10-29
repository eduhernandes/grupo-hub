'use client'

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { FileUp, X } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import type { Database, NovoAlunoPermitido } from '@/types/database'

interface Props {
  isOpen: boolean
  turmaId: string
  onClose: () => void
  onSuccess: () => Promise<void>
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  if (quoted) throw new Error('O CSV contém aspas não fechadas.')

  row.push(field)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}

export default function ModalImportarCSV({ isOpen, turmaId, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const supabase = useMemo(
    () =>
      createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  )

  if (!isOpen) return null

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null)
    setErro(null)
    setResultado(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) {
      setErro('Selecione um arquivo CSV para importar.')
      return
    }

    try {
      setLoading(true)
      setErro(null)
      setResultado(null)

      const contents = (await file.text()).replace(/^\uFEFF/, '')
      const rows = parseCsv(contents)
      const headers = rows[0]?.map((header) => header.trim().toLowerCase()) ?? []
      const matriculaIndex = headers.indexOf('matricula')
      const nomeIndex = headers.indexOf('nome')

      if (matriculaIndex < 0 || nomeIndex < 0) {
        throw new Error('O cabeçalho deve conter as colunas matricula e nome.')
      }

      const alunos = new Map<string, NovoAlunoPermitido>()
      for (const [index, row] of rows.slice(1).entries()) {
        const matricula = row[matriculaIndex]?.trim() ?? ''
        const nome = row[nomeIndex]?.trim() ?? ''

        if (!matricula || !nome) {
          throw new Error(`A linha ${index + 2} precisa ter matrícula e nome.`)
        }

        alunos.set(matricula, { turma_id: turmaId, matricula, nome })
      }

      const registros = [...alunos.values()]
      if (registros.length === 0) {
        throw new Error('O arquivo não contém alunos para importar.')
      }

      const { error } = await supabase
        .from('alunos_permitidos')
        .upsert(registros, { onConflict: 'turma_id,matricula' })

      if (error) throw error

      setResultado(`${registros.length} aluno(s) importado(s) com sucesso.`)
      setFile(null)
      await onSuccess()
    } catch (error) {
      console.error('Erro ao importar CSV:', error)
      setErro(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section
        aria-labelledby="modal-importar-csv-titulo"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        role="dialog"
      >
        <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <FileUp className="h-5 w-5 text-blue-600" />
            <h2 className="font-semibold text-slate-900" id="modal-importar-csv-titulo">
              Importar alunos por CSV
            </h2>
          </div>
          <button aria-label="Fechar" className="text-slate-400 hover:text-slate-700" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          O arquivo deve conter um cabeçalho com as colunas <code>matricula</code> e <code>nome</code>.
          Matrículas repetidas no arquivo serão consolidadas.
        </p>

        {erro && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{erro}</p>}
        {resultado && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{resultado}</p>}

        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block space-y-2 text-sm font-medium text-slate-700">
            Arquivo CSV
            <input accept=".csv,text/csv" className="block w-full rounded-lg border border-slate-300 p-2 text-sm" onChange={handleFile} required type="file" />
          </label>
          {file && <p className="text-xs text-slate-500">{file.name}</p>}
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">
              Fechar
            </button>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50" disabled={loading || !turmaId} type="submit">
              {loading ? 'Importando...' : 'Importar alunos'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
