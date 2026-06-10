import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import Card from '../components/Card'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})

function brl(value) {
  if (value === null || value === undefined) return '—'
  return brlFormatter.format(Number(value))
}

const TIPOS = [
  { value: 'INGREDIENTE',      label: 'Ingrediente',      filtro: 'Ingredientes',     badge: 'badge-orange' },
  { value: 'PRODUCAO_PROPRIA', label: 'Produção própria', filtro: 'Produção própria', badge: 'badge-blue' },
  { value: 'BEBIDA',           label: 'Bebida',           filtro: 'Bebidas',          badge: 'badge-yellow' },
  { value: 'HORTIFRUTI',       label: 'Hortifruti',       filtro: 'Hortifruti',       badge: 'badge-green' },
  { value: 'EMBALAGEM',        label: 'Embalagem',        filtro: 'Embalagens',       badge: 'badge-gray' },
  { value: 'ACOMPANHAMENTO',   label: 'Acompanhamento',   filtro: 'Acompanhamentos',  badge: 'badge-red' },
  { value: 'OPERACIONAL',      label: 'Operacional',      filtro: 'Operacional',      badge: 'badge-gray' }
]
const TIPO_BY_VALUE = Object.fromEntries(TIPOS.map((t) => [t.value, t]))

function tipoLabel(value) {
  return TIPO_BY_VALUE[value]?.label ?? value ?? '—'
}
function tipoBadge(value) {
  return TIPO_BY_VALUE[value]?.badge ?? 'badge-gray'
}

const FORM_BLANK = {
  nome: '',
  tipo: 'INGREDIENTE',
  unidade: '',
  custoUnitario: '',
  fornecedor: ''
}

function validateForm({ nome, unidade, custoUnitario, tipo }) {
  if (!nome || !nome.trim()) return 'nome é obrigatório'
  if (!tipo) return 'tipo é obrigatório'
  if (!unidade || !unidade.trim()) return 'unidade é obrigatória'
  const c = Number(custoUnitario)
  if (custoUnitario === '' || !Number.isFinite(c)) {
    return 'custo unitário é obrigatório e deve ser numérico'
  }
  if (c < 0) return 'custo unitário deve ser maior ou igual a zero'
  return null
}

function payloadFromForm(form) {
  return {
    nome: form.nome.trim(),
    tipo: form.tipo,
    unidade: form.unidade.trim(),
    custoUnitario: Number(form.custoUnitario),
    fornecedor: form.fornecedor.trim() === '' ? null : form.fornecedor.trim()
  }
}

export default function Insumos() {
  const [insumos, setInsumos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('TODOS')
  const [feedback, setFeedback] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(FORM_BLANK)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [deletingId, setDeletingId] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    api
      .get('/insumos')
      .then((r) => { setInsumos(r.data); setLoading(false) })
      .catch((err) => {
        setError(
          err?.response?.data?.error ??
          (err?.code === 'ERR_NETWORK'
            ? 'Não foi possível conectar ao backend (http://localhost:4000).'
            : err?.message ?? 'Erro inesperado.')
        )
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditingId(null)
    setForm(FORM_BLANK)
    setFormError(null)
    setFeedback(null)
    setModalOpen(true)
  }

  function openEdit(insumo) {
    setEditingId(insumo.id)
    setForm({
      nome: insumo.nome ?? '',
      tipo: insumo.tipo ?? 'INGREDIENTE',
      unidade: insumo.unidade ?? '',
      custoUnitario:
        insumo.custoUnitario === null || insumo.custoUnitario === undefined
          ? ''
          : String(Number(insumo.custoUnitario)),
      fornecedor: insumo.fornecedor ?? ''
    })
    setFormError(null)
    setFeedback(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(FORM_BLANK)
    setFormError(null)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const err = validateForm(form)
    if (err) { setFormError(err); return }
    setFormError(null)
    setSubmitting(true)

    const request = editingId === null
      ? api.post('/insumos', payloadFromForm(form))
      : api.put(`/insumos/${editingId}`, payloadFromForm(form))

    request
      .then(() => {
        setFeedback(editingId === null
          ? 'Insumo criado com sucesso.'
          : 'Insumo atualizado com sucesso.')
        closeModal()
        load()
      })
      .catch((e) =>
        setFormError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar insumo.')
      )
      .finally(() => setSubmitting(false))
  }

  function handleDelete(insumo) {
    const ok = window.confirm(
      `Inativar o insumo "${insumo.nome}"? Ele não aparecerá mais nas fichas técnicas, mas o histórico será preservado.`
    )
    if (!ok) return
    setDeletingId(insumo.id)
    setFeedback(null)
    api
      .delete(`/insumos/${insumo.id}`)
      .then(() => {
        setFeedback(`Insumo "${insumo.nome}" inativado.`)
        load()
      })
      .catch((e) =>
        window.alert(e?.response?.data?.error ?? e?.message ?? 'Erro ao inativar.')
      )
      .finally(() => setDeletingId(null))
  }

  const filtered = useMemo(() => {
    let rows = insumos
    if (filtroTipo !== 'TODOS') {
      rows = rows.filter((i) => i.tipo === filtroTipo)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (i) =>
          i.nome.toLowerCase().includes(q) ||
          (i.fornecedor && i.fornecedor.toLowerCase().includes(q))
      )
    }
    return rows
  }, [insumos, search, filtroTipo])

  const total = insumos.length
  const countTipo = (t) => insumos.filter((i) => i.tipo === t).length
  const totalIngredientes = countTipo('INGREDIENTE')
  const totalProducaoPropria = countTipo('PRODUCAO_PROPRIA')
  const totalEmbAcomp = countTipo('EMBALAGEM') + countTipo('ACOMPANHAMENTO')

  if (loading) return <div className="loading-state">Carregando insumos…</div>
  if (error) {
    return (
      <div className="alert alert-red">
        <div>
          <div className="alert-title clr-red">Não foi possível carregar os insumos</div>
          <div className="alert-msg">{error}</div>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={load}>Tentar novamente</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Insumos</h1>
          <div className="page-header-sub">
            Cadastre ingredientes, embalagens, acompanhamentos, bebidas, hortifruti e produções próprias.
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Novo insumo
        </button>
      </div>

      {feedback && (
        <div className="alert alert-green" style={{ marginBottom: 12 }}>
          <div className="alert-msg clr-green">{feedback}</div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">
              {editingId === null ? 'Novo insumo' : 'Editar insumo'}
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Nome</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex.: Pão Brioche"
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Tipo</label>
                <select
                  className="form-input"
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                >
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                  <label className="form-label">Unidade</label>
                  <input
                    className="form-input"
                    type="text"
                    value={form.unidade}
                    onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                    placeholder="un, kg, g..."
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                  <label className="form-label">Custo unitário (R$)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={form.custoUnitario}
                    onChange={(e) => setForm({ ...form, custoUnitario: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fornecedor (opcional)</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.fornecedor}
                  onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                  placeholder="Padaria Central"
                />
              </div>
              {formError && (
                <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="alert-msg clr-red">{formError}</div>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Salvando…' : 'Salvar insumo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="section-title">Resumo</div>
      <div className="grid-4">
        <Card title="Total de Insumos" value={total} hint="Ativos na base" variant="info" />
        <Card title="Ingredientes" value={totalIngredientes} hint="Base das fichas técnicas" variant="brand" />
        <Card title="Produção Própria" value={totalProducaoPropria} hint="Receita completa em breve" variant="info" />
        <Card
          title="Embalagens / Acompanhamentos"
          value={totalEmbAcomp}
          hint="Custos por pedido"
        />
      </div>

      <div className="section-title">Insumos Cadastrados</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          type="button"
          className={'btn ' + (filtroTipo === 'TODOS' ? 'btn-primary' : 'btn-secondary')}
          onClick={() => setFiltroTipo('TODOS')}
        >
          Todos
        </button>
        {TIPOS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={'btn ' + (filtroTipo === t.value ? 'btn-primary' : 'btn-secondary')}
            onClick={() => setFiltroTipo(t.value)}
          >
            {t.filtro}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input
          className="form-input"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar insumo... (nome ou fornecedor)"
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>
          {filtered.length === total
            ? `${total} insumo${total === 1 ? '' : 's'}`
            : `${filtered.length} de ${total}`}
        </span>
      </div>

      {total === 0 ? (
        <div className="empty-state">
          Nenhum insumo cadastrado. Use o botão “+ Novo insumo” para cadastrar o primeiro.
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          Nenhum insumo encontrado
          {filtroTipo !== 'TODOS' ? ` no tipo "${TIPO_BY_VALUE[filtroTipo]?.filtro ?? filtroTipo}"` : ''}
          {search.trim() !== '' ? ` para "${search}"` : ''}.
          Ajuste os filtros ou a busca.
        </div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Unidade</th>
                <th>Custo unitário</th>
                <th>Fornecedor</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 500, color: '#111' }}>{i.nome}</td>
                  <td>
                    <span className={'badge ' + tipoBadge(i.tipo)}>{tipoLabel(i.tipo)}</span>
                  </td>
                  <td>{i.unidade}</td>
                  <td>{brl(i.custoUnitario)}</td>
                  <td className={i.fornecedor ? '' : 'clr-muted'}>
                    {i.fornecedor || 'Sem fornecedor'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button type="button" className="btn btn-secondary" onClick={() => openEdit(i)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleDelete(i)}
                        disabled={deletingId === i.id}
                      >
                        {deletingId === i.id ? 'Inativando…' : 'Inativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
