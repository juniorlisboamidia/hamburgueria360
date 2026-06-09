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

const FORM_BLANK = { nome: '', unidade: '', custoUnitario: '', fornecedor: '' }

function validateForm({ nome, unidade, custoUnitario }) {
  if (!nome || !nome.trim()) return 'nome é obrigatório'
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
    unidade: form.unidade.trim(),
    custoUnitario: Number(form.custoUnitario),
    fornecedor: form.fornecedor.trim() === '' ? null : form.fornecedor.trim()
  }
}

const fieldStyle = { marginBottom: 0 }
const cellInputStyle = { padding: '6px 10px', fontSize: 13 }

export default function Insumos() {
  const [insumos, setInsumos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const [newForm, setNewForm] = useState(FORM_BLANK)
  const [newError, setNewError] = useState(null)
  const [newSubmitting, setNewSubmitting] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(FORM_BLANK)
  const [editError, setEditError] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

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

  function handleCreate(e) {
    e.preventDefault()
    const err = validateForm(newForm)
    if (err) { setNewError(err); return }
    setNewError(null)
    setNewSubmitting(true)
    api
      .post('/insumos', payloadFromForm(newForm))
      .then(() => {
        setNewForm(FORM_BLANK)
        return load()
      })
      .catch((e) =>
        setNewError(e?.response?.data?.error ?? e?.message ?? 'Erro ao cadastrar.')
      )
      .finally(() => setNewSubmitting(false))
  }

  function startEdit(insumo) {
    setEditingId(insumo.id)
    setEditForm({
      nome: insumo.nome,
      unidade: insumo.unidade,
      custoUnitario: String(Number(insumo.custoUnitario)),
      fornecedor: insumo.fornecedor ?? ''
    })
    setEditError(null)
  }
  function cancelEdit() {
    setEditingId(null)
    setEditForm(FORM_BLANK)
    setEditError(null)
  }
  function saveEdit() {
    const err = validateForm(editForm)
    if (err) { setEditError(err); return }
    setEditError(null)
    setEditSubmitting(true)
    api
      .put(`/insumos/${editingId}`, payloadFromForm(editForm))
      .then(() => {
        cancelEdit()
        return load()
      })
      .catch((e) =>
        setEditError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar.')
      )
      .finally(() => setEditSubmitting(false))
  }

  function handleDelete(insumo) {
    const ok = window.confirm(
      `Desativar o insumo "${insumo.nome}"? Ele não aparecerá mais nas fichas técnicas, mas o histórico será preservado.`
    )
    if (!ok) return
    api
      .delete(`/insumos/${insumo.id}`)
      .then(load)
      .catch((e) =>
        window.alert(e?.response?.data?.error ?? e?.message ?? 'Erro ao desativar.')
      )
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return insumos
    return insumos.filter(
      (i) =>
        i.nome.toLowerCase().includes(q) ||
        (i.fornecedor && i.fornecedor.toLowerCase().includes(q))
    )
  }, [insumos, search])

  const total = insumos.length
  const custoMedio =
    total === 0
      ? 0
      : insumos.reduce((s, i) => s + Number(i.custoUnitario), 0) / total
  const maisCaro =
    total === 0
      ? null
      : insumos.reduce(
          (m, i) => (Number(i.custoUnitario) > Number(m.custoUnitario) ? i : m),
          insumos[0]
        )
  const unidades = new Set(insumos.map((i) => i.unidade)).size

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
      <div className="section-title">Resumo</div>
      <div className="grid-4">
        <Card title="Total Ativos" value={total} hint="Insumos cadastrados" variant="info" />
        <Card title="Custo Médio" value={brl(custoMedio)} hint="Por unidade" variant="brand" />
        <Card
          title="Insumo Mais Caro"
          value={maisCaro ? brl(maisCaro.custoUnitario) : '—'}
          hint={maisCaro ? maisCaro.nome : 'Sem dados'}
          variant="danger"
        />
        <Card title="Unidades" value={unidades} hint="Tipos cadastrados" />
      </div>

      <div className="section-title">Novo Insumo</div>
      <div className="card">
        <form onSubmit={handleCreate}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ ...fieldStyle, flex: 2, minWidth: 180 }}>
              <label className="form-label">Nome</label>
              <input
                className="form-input"
                type="text"
                value={newForm.nome}
                onChange={(e) => setNewForm({ ...newForm, nome: e.target.value })}
                placeholder="Ex.: Pão Brioche"
              />
            </div>
            <div className="form-group" style={{ ...fieldStyle, flex: 1, minWidth: 100 }}>
              <label className="form-label">Unidade</label>
              <input
                className="form-input"
                type="text"
                value={newForm.unidade}
                onChange={(e) => setNewForm({ ...newForm, unidade: e.target.value })}
                placeholder="un, kg, g..."
              />
            </div>
            <div className="form-group" style={{ ...fieldStyle, flex: 1, minWidth: 120 }}>
              <label className="form-label">Custo unitário</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.0001"
                value={newForm.custoUnitario}
                onChange={(e) => setNewForm({ ...newForm, custoUnitario: e.target.value })}
                placeholder="0,00"
              />
            </div>
            <div className="form-group" style={{ ...fieldStyle, flex: 1.5, minWidth: 150 }}>
              <label className="form-label">Fornecedor (opcional)</label>
              <input
                className="form-input"
                type="text"
                value={newForm.fornecedor}
                onChange={(e) => setNewForm({ ...newForm, fornecedor: e.target.value })}
                placeholder="Padaria Central"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={newSubmitting}>
              {newSubmitting ? 'Adicionando…' : 'Adicionar'}
            </button>
          </div>
          {newError && (
            <div className="alert alert-red" style={{ marginTop: 12 }}>
              <div className="alert-msg clr-red">{newError}</div>
            </div>
          )}
        </form>
      </div>

      <div className="section-title">Insumos Cadastrados</div>

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
          {search.trim() === ''
            ? `${total} insumo${total === 1 ? '' : 's'}`
            : `${filtered.length} de ${total}`}
        </span>
      </div>

      {total === 0 ? (
        <div className="empty-state">
          Nenhum insumo cadastrado. Use o formulário acima para cadastrar o primeiro.
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          Nenhum insumo encontrado para "{search}". Ajuste a busca ou limpe o campo.
        </div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Unidade</th>
                <th>Custo unitário</th>
                <th>Fornecedor</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const isEditing = editingId === i.id
                if (isEditing) {
                  return (
                    <tr key={i.id} style={{ background: '#fff7ed' }}>
                      <td>
                        <input
                          className="form-input"
                          style={cellInputStyle}
                          value={editForm.nome}
                          onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                          autoFocus
                        />
                      </td>
                      <td>
                        <input
                          className="form-input"
                          style={cellInputStyle}
                          value={editForm.unidade}
                          onChange={(e) => setEditForm({ ...editForm, unidade: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="form-input"
                          style={cellInputStyle}
                          type="number"
                          min="0"
                          step="0.0001"
                          value={editForm.custoUnitario}
                          onChange={(e) => setEditForm({ ...editForm, custoUnitario: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="form-input"
                          style={cellInputStyle}
                          value={editForm.fornecedor}
                          onChange={(e) => setEditForm({ ...editForm, fornecedor: e.target.value })}
                          placeholder="(opcional)"
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={editSubmitting}>
                            {editSubmitting ? 'Salvando…' : 'Salvar'}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={cancelEdit} disabled={editSubmitting}>
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 500, color: '#111' }}>{i.nome}</td>
                    <td>{i.unidade}</td>
                    <td>{brl(i.custoUnitario)}</td>
                    <td className={i.fornecedor ? '' : 'clr-muted'}>
                      {i.fornecedor || 'Sem fornecedor'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" className="btn btn-secondary" onClick={() => startEdit(i)}>
                          Editar
                        </button>
                        <button type="button" className="btn btn-danger" onClick={() => handleDelete(i)}>
                          Desativar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editError && (
        <div className="alert alert-red" style={{ marginTop: 10 }}>
          <div className="alert-msg clr-red">{editError}</div>
        </div>
      )}
    </div>
  )
}
