import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import Card from '../components/Card'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})
const intFormatter = new Intl.NumberFormat('pt-BR')

function brl(value) {
  if (value === null || value === undefined) return '—'
  return brlFormatter.format(Number(value))
}
function int(value) {
  if (value === null || value === undefined) return '—'
  return intFormatter.format(Number(value))
}
function formatDataBR(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}
function isoToInputDate(iso) {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}
function formatMesLabel(mes) {
  if (!mes) return ''
  const [ano, m] = mes.split('-')
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const idx = Number(m) - 1
  return meses[idx] ? `${meses[idx]} · ${ano}` : mes
}

const FORM_BLANK = {
  data: '',
  valorTotal: '',
  quantidadePedidos: '',
  canal: '',
  observacoes: ''
}

function validateForm({ data, valorTotal, quantidadePedidos }) {
  if (!data) return 'data é obrigatória'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return 'data inválida (use formato YYYY-MM-DD)'
  const v = Number(valorTotal)
  if (valorTotal === '' || !Number.isFinite(v)) return 'valor total é obrigatório e numérico'
  if (v < 0) return 'valor total deve ser maior ou igual a zero'
  if (quantidadePedidos === '' || !Number.isInteger(Number(quantidadePedidos))) {
    return 'quantidade de pedidos é obrigatória e deve ser inteira'
  }
  if (Number(quantidadePedidos) < 0) return 'quantidade de pedidos deve ser maior ou igual a zero'
  return null
}

function payloadFromForm(form) {
  return {
    data: form.data,
    valorTotal: Number(form.valorTotal),
    quantidadePedidos: Number(form.quantidadePedidos),
    canal: form.canal.trim() === '' ? null : form.canal.trim(),
    observacoes: form.observacoes.trim() === '' ? null : form.observacoes.trim()
  }
}

const fieldStyle = { marginBottom: 0 }
const cellInputStyle = { padding: '6px 10px', fontSize: 13 }

export default function Faturamento() {
  const [mes, setMes] = useState('2026-05')
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newForm, setNewForm] = useState(FORM_BLANK)
  const [newError, setNewError] = useState(null)
  const [newSubmitting, setNewSubmitting] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(FORM_BLANK)
  const [editError, setEditError] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  function load(mesParam = mes) {
    setLoading(true)
    setError(null)
    api
      .get('/faturamento', { params: { mes: mesParam } })
      .then((r) => { setRegistros(r.data); setLoading(false) })
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

  useEffect(() => { load(mes) }, [mes])

  function handleCreate(e) {
    e.preventDefault()
    const err = validateForm(newForm)
    if (err) { setNewError(err); return }
    setNewError(null)
    setNewSubmitting(true)
    api
      .post('/faturamento', payloadFromForm(newForm))
      .then(() => {
        setNewForm(FORM_BLANK)
        return load(mes)
      })
      .catch((e) =>
        setNewError(e?.response?.data?.error ?? e?.message ?? 'Erro ao cadastrar.')
      )
      .finally(() => setNewSubmitting(false))
  }

  function startEdit(r) {
    setEditingId(r.id)
    setEditForm({
      data: isoToInputDate(r.data),
      valorTotal: String(Number(r.valorTotal)),
      quantidadePedidos: String(Number(r.quantidadePedidos)),
      canal: r.canal ?? '',
      observacoes: r.observacoes ?? ''
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
      .put(`/faturamento/${editingId}`, payloadFromForm(editForm))
      .then(() => {
        cancelEdit()
        return load(mes)
      })
      .catch((e) =>
        setEditError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar.')
      )
      .finally(() => setEditSubmitting(false))
  }

  function handleDelete(r) {
    const ok = window.confirm(
      `Desativar o lançamento de ${formatDataBR(r.data)} (${brl(r.valorTotal)})? O histórico será preservado, mas não entrará nos cálculos.`
    )
    if (!ok) return
    api
      .delete(`/faturamento/${r.id}`)
      .then(() => load(mes))
      .catch((e) =>
        window.alert(e?.response?.data?.error ?? e?.message ?? 'Erro ao desativar.')
      )
  }

  const totalRegistros = registros.length
  const faturamentoMes = registros.reduce((s, r) => s + Number(r.valorTotal), 0)
  const pedidosMes = registros.reduce((s, r) => s + Number(r.quantidadePedidos), 0)
  const ticketMedioMes = pedidosMes === 0 ? 0 : faturamentoMes / pedidosMes
  const melhorDia =
    totalRegistros === 0
      ? null
      : registros.reduce(
          (m, r) => (Number(r.valorTotal) > Number(m.valorTotal) ? r : m),
          registros[0]
        )

  const ordenados = useMemo(() => {
    return [...registros].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
  }, [registros])

  return (
    <div>
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          padding: '12px 16px'
        }}
      >
        <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>Mês de referência</span>
        <input
          type="month"
          className="form-input"
          value={mes}
          onChange={(e) => setMes(e.target.value || '2026-05')}
          style={{ width: 180 }}
        />
        <span className="badge badge-orange">{formatMesLabel(mes)}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#aaa' }}>
          {loading
            ? 'Carregando…'
            : !error
            ? `${totalRegistros} lançamento${totalRegistros === 1 ? '' : 's'}`
            : ''}
        </span>
      </div>

      {error ? (
        <div className="alert alert-red">
          <div>
            <div className="alert-title clr-red">Não foi possível carregar o faturamento</div>
            <div className="alert-msg">{error}</div>
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => load(mes)}>
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="loading-state">Carregando lançamentos…</div>
      ) : (
        <>
          <div className="section-title">Resumo do Mês</div>
          <div className="grid-4">
            <Card title="Faturamento" value={brl(faturamentoMes)} hint={`${totalRegistros} lançamento(s)`} variant="brand" />
            <Card title="Pedidos" value={int(pedidosMes)} hint="Total no mês" variant="info" />
            <Card title="Ticket Médio" value={brl(ticketMedioMes)} hint="Faturamento / pedidos" />
            <Card
              title="Melhor Dia"
              value={melhorDia ? brl(melhorDia.valorTotal) : '—'}
              hint={melhorDia ? formatDataBR(melhorDia.data) : 'Sem dados'}
              variant="success"
            />
          </div>

          <div className="section-title">Novo Lançamento</div>
          <div className="card">
            <form onSubmit={handleCreate}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ ...fieldStyle, flex: 1, minWidth: 140 }}>
                  <label className="form-label">Data</label>
                  <input className="form-input" type="date"
                    value={newForm.data}
                    onChange={(e) => setNewForm({ ...newForm, data: e.target.value })} />
                </div>
                <div className="form-group" style={{ ...fieldStyle, flex: 1, minWidth: 130 }}>
                  <label className="form-label">Valor total (R$)</label>
                  <input className="form-input" type="number" min="0" step="0.01"
                    value={newForm.valorTotal}
                    onChange={(e) => setNewForm({ ...newForm, valorTotal: e.target.value })}
                    placeholder="0,00" />
                </div>
                <div className="form-group" style={{ ...fieldStyle, flex: 1, minWidth: 100 }}>
                  <label className="form-label">Pedidos</label>
                  <input className="form-input" type="number" min="0" step="1"
                    value={newForm.quantidadePedidos}
                    onChange={(e) => setNewForm({ ...newForm, quantidadePedidos: e.target.value })}
                    placeholder="0" />
                </div>
                <div className="form-group" style={{ ...fieldStyle, flex: 1.2, minWidth: 130 }}>
                  <label className="form-label">Canal (opcional)</label>
                  <input className="form-input" type="text"
                    value={newForm.canal}
                    onChange={(e) => setNewForm({ ...newForm, canal: e.target.value })}
                    placeholder="BALCAO, IFOOD..." />
                </div>
                <div className="form-group" style={{ ...fieldStyle, flex: 1.5, minWidth: 150 }}>
                  <label className="form-label">Observações (opcional)</label>
                  <input className="form-input" type="text"
                    value={newForm.observacoes}
                    onChange={(e) => setNewForm({ ...newForm, observacoes: e.target.value })}
                    placeholder="Sábado movimentado..." />
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

          <div className="section-title">Lançamentos · {formatMesLabel(mes)}</div>

          {totalRegistros === 0 ? (
            <div className="empty-state">
              Nenhum lançamento em {formatMesLabel(mes)}. Use o formulário acima ou troque o mês de referência no topo.
            </div>
          ) : (
            <div className="table-card">
              <table className="hb-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Valor total</th>
                    <th>Pedidos</th>
                    <th>Ticket médio</th>
                    <th>Canal / observações</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenados.map((r) => {
                    const isEditing = editingId === r.id
                    if (isEditing) {
                      return (
                        <tr key={r.id} style={{ background: '#fff7ed' }}>
                          <td>
                            <input className="form-input" style={cellInputStyle}
                              type="date"
                              value={editForm.data}
                              onChange={(e) => setEditForm({ ...editForm, data: e.target.value })}
                              autoFocus />
                          </td>
                          <td>
                            <input className="form-input" style={cellInputStyle}
                              type="number" min="0" step="0.01"
                              value={editForm.valorTotal}
                              onChange={(e) => setEditForm({ ...editForm, valorTotal: e.target.value })} />
                          </td>
                          <td>
                            <input className="form-input" style={cellInputStyle}
                              type="number" min="0" step="1"
                              value={editForm.quantidadePedidos}
                              onChange={(e) => setEditForm({ ...editForm, quantidadePedidos: e.target.value })} />
                          </td>
                          <td className="clr-muted">—</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <input className="form-input" style={cellInputStyle}
                                value={editForm.canal}
                                onChange={(e) => setEditForm({ ...editForm, canal: e.target.value })}
                                placeholder="Canal" />
                              <input className="form-input" style={cellInputStyle}
                                value={editForm.observacoes}
                                onChange={(e) => setEditForm({ ...editForm, observacoes: e.target.value })}
                                placeholder="Observações" />
                            </div>
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
                      <tr key={r.id}>
                        <td style={{ fontWeight: 500, color: '#111' }}>{formatDataBR(r.data)}</td>
                        <td>{brl(r.valorTotal)}</td>
                        <td>{int(r.quantidadePedidos)}</td>
                        <td>{brl(r.ticketMedio)}</td>
                        <td>
                          {r.canal ? (
                            <span className="badge badge-blue">{r.canal}</span>
                          ) : (
                            <span className="clr-muted">Sem canal</span>
                          )}
                          {r.observacoes && (
                            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
                              {r.observacoes}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button type="button" className="btn btn-secondary" onClick={() => startEdit(r)}>
                              Editar
                            </button>
                            <button type="button" className="btn btn-danger" onClick={() => handleDelete(r)}>
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
        </>
      )}
    </div>
  )
}
