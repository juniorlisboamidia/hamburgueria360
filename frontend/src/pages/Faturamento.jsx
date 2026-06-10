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
function pct(value) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toFixed(2).replace('.', ',')}%`
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
function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const PE_BADGE = {
  ACIMA_DO_EQUILIBRIO:   { cls: 'badge-green',  label: 'Acima do ponto de equilíbrio' },
  PROXIMO_DO_EQUILIBRIO: { cls: 'badge-yellow', label: 'Próximo do ponto de equilíbrio' },
  ABAIXO_DO_EQUILIBRIO:  { cls: 'badge-orange', label: 'Abaixo do ponto de equilíbrio' },
  MARGEM_INSUFICIENTE:   { cls: 'badge-red',    label: 'Margem insuficiente' }
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

const cellInputStyle = { padding: '6px 10px', fontSize: 13 }

const metricRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontSize: 13,
  padding: '5px 0',
  borderBottom: '1px solid #f5f5f5'
}
const metricLabelStyle = { color: '#888', fontSize: 12 }

function MetricRow({ label, children }) {
  return (
    <div style={metricRowStyle}>
      <span style={metricLabelStyle}>{label}</span>
      <span>{children}</span>
    </div>
  )
}

export default function Faturamento() {
  const [mes, setMes] = useState(mesAtual())
  const [registros, setRegistros] = useState([])
  const [resumo, setResumo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(FORM_BLANK)
  const [createError, setCreateError] = useState(null)
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(FORM_BLANK)
  const [editError, setEditError] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  function fetchAll(mesParam) {
    return Promise.all([
      api.get('/faturamento', { params: { mes: mesParam } }),
      api.get('/dashboard', { params: { mes: mesParam } })
    ])
  }

  function load(mesParam = mes) {
    setLoading(true)
    setError(null)
    fetchAll(mesParam)
      .then(([fatRes, dashRes]) => {
        setRegistros(fatRes.data)
        setResumo(dashRes.data)
        setLoading(false)
      })
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

  // Recarrega lançamentos e resumo sem o loading de página inteira
  function refresh(mesParam = mes) {
    return fetchAll(mesParam).then(([fatRes, dashRes]) => {
      setRegistros(fatRes.data)
      setResumo(dashRes.data)
    })
  }

  useEffect(() => { load(mes) }, [mes])

  function openCreate() {
    setCreateForm({ ...FORM_BLANK, data: '' })
    setCreateError(null)
    setFeedback(null)
    setCreateOpen(true)
  }

  function handleCreate(e) {
    e.preventDefault()
    const err = validateForm(createForm)
    if (err) { setCreateError(err); return }
    setCreateError(null)
    setCreating(true)
    api
      .post('/faturamento', payloadFromForm(createForm))
      .then(() => {
        setCreateOpen(false)
        setFeedback('Lançamento criado com sucesso.')
        return refresh(mes)
      })
      .catch((e) =>
        setCreateError(e?.response?.data?.error ?? e?.message ?? 'Erro ao cadastrar.')
      )
      .finally(() => setCreating(false))
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
        return refresh(mes)
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
    setFeedback(null)
    api
      .delete(`/faturamento/${r.id}`)
      .then(() => {
        setFeedback(`Lançamento de ${formatDataBR(r.data)} desativado.`)
        return refresh(mes)
      })
      .catch((e) =>
        window.alert(e?.response?.data?.error ?? e?.message ?? 'Erro ao desativar.')
      )
  }

  const ordenados = useMemo(() => {
    return [...registros].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
  }, [registros])

  const totalRegistros = registros.length

  // Valores do backend (dashboard); lucro e margem derivados por subtração simples
  const faturamentoMes = resumo?.faturamentoAtual ?? null
  const pedidosMes = resumo?.totalPedidos ?? null
  const ticketMedioMes = resumo?.ticketMedio ?? null
  const custosFixosMes = resumo?.totalCustosFixos ?? null
  const custosVariaveisMes = resumo?.totalCustosVariaveis ?? null
  const lucroEstimado =
    faturamentoMes === null || custosFixosMes === null || custosVariaveisMes === null
      ? null
      : faturamentoMes - custosFixosMes - custosVariaveisMes
  const margemEstimada =
    lucroEstimado === null || !faturamentoMes || Number(faturamentoMes) === 0
      ? null
      : (lucroEstimado / faturamentoMes) * 100
  const lucroPositivo = lucroEstimado !== null && lucroEstimado >= 0

  const pontoEquilibrio = resumo?.pontoEquilibrio ?? null
  const statusPe = resumo?.statusOperacao
  const peBadge = PE_BADGE[statusPe] ?? null
  // diferencaParaEquilibrio (backend) = ponto de equilíbrio − faturamento
  const faltamParaEquilibrio =
    resumo?.diferencaParaEquilibrio !== null && resumo?.diferencaParaEquilibrio !== undefined
      ? Math.max(0, resumo.diferencaParaEquilibrio)
      : null
  const diferencaFaturamentoPe =
    pontoEquilibrio === null || faturamentoMes === null
      ? null
      : faturamentoMes - pontoEquilibrio

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Faturamento</h1>
          <div className="page-header-sub">
            Acompanhe vendas, pedidos, ticket médio e resultado estimado do mês.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="month"
            className="form-input"
            value={mes}
            onChange={(e) => setMes(e.target.value || mesAtual())}
            style={{ width: 170 }}
          />
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + Novo lançamento
          </button>
        </div>
      </div>

      {feedback && (
        <div className="alert alert-green" style={{ marginBottom: 12 }}>
          <div className="alert-msg clr-green">{feedback}</div>
        </div>
      )}

      {/* Modal: novo lançamento */}
      {createOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">Novo lançamento</div>
            <form onSubmit={handleCreate}>
              <div className="form-grid-2" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Data</label>
                  <input
                    className="form-input"
                    type="date"
                    value={createForm.data}
                    onChange={(e) => setCreateForm({ ...createForm, data: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Valor total (R$)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={createForm.valorTotal}
                    onChange={(e) => setCreateForm({ ...createForm, valorTotal: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className="form-grid-2" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Pedidos</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="1"
                    value={createForm.quantidadePedidos}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, quantidadePedidos: e.target.value })
                    }
                    placeholder="0"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Canal (opcional)</label>
                  <input
                    className="form-input"
                    type="text"
                    value={createForm.canal}
                    onChange={(e) => setCreateForm({ ...createForm, canal: e.target.value })}
                    placeholder="BALCAO, IFOOD..."
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Observações (opcional)</label>
                <input
                  className="form-input"
                  type="text"
                  value={createForm.observacoes}
                  onChange={(e) => setCreateForm({ ...createForm, observacoes: e.target.value })}
                  placeholder="Sábado movimentado..."
                />
              </div>
              {createError && (
                <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="alert-msg clr-red">{createError}</div>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCreateOpen(false)}
                  disabled={creating}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Salvando…' : 'Salvar lançamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
        <div className="loading-state">Carregando faturamento…</div>
      ) : (
        <>
          {/* Cards principais */}
          <div className="section-title">{formatMesLabel(mes)}</div>
          <div className="grid-4">
            <Card
              title="Faturamento do Mês"
              value={brl(faturamentoMes)}
              hint={`${totalRegistros} lançamento${totalRegistros === 1 ? '' : 's'}`}
              variant="brand"
            />
            <Card
              title="Pedidos do Mês"
              value={int(pedidosMes)}
              hint="Total de pedidos lançados"
              variant="info"
            />
            <Card
              title="Ticket Médio"
              value={brl(ticketMedioMes)}
              hint="Faturamento / pedidos"
            />
            <Card
              title="Lucro Estimado"
              value={brl(lucroEstimado)}
              hint="Após custos fixos e variáveis"
              variant={lucroEstimado === null ? 'info' : lucroPositivo ? 'success' : 'danger'}
            />
          </div>

          {/* Resultado do mês + ponto de equilíbrio */}
          <div className="section-title">Resultado do Mês</div>
          <div className="grid-2">
            <div className="card">
              <div className="card-label">Resultado Estimado</div>
              <MetricRow label="Faturamento">
                <span style={{ fontWeight: 600 }}>{brl(faturamentoMes)}</span>
              </MetricRow>
              <MetricRow label="Custos fixos">
                {custosFixosMes === null ? '—' : `− ${brl(custosFixosMes)}`}
              </MetricRow>
              <MetricRow label="Custos variáveis estimados">
                {custosVariaveisMes === null ? '—' : `− ${brl(custosVariaveisMes)}`}
              </MetricRow>
              <MetricRow label="Lucro estimado">
                <span
                  style={{ fontWeight: 600 }}
                  className={lucroEstimado === null ? 'clr-muted' : lucroPositivo ? 'clr-green' : 'clr-red'}
                >
                  {brl(lucroEstimado)}
                </span>
              </MetricRow>
              <MetricRow label="Margem estimada">
                {margemEstimada === null
                  ? <span className="clr-muted">—</span>
                  : <span className={lucroPositivo ? 'clr-green' : 'clr-red'}>{pct(margemEstimada)}</span>}
              </MetricRow>
              <div style={{ fontSize: 11.5, color: '#999', marginTop: 10, lineHeight: 1.5 }}>
                Custos variáveis estimados combinam percentuais sobre o faturamento, valores por
                pedido e valores fixos mensais cadastrados em Custos.
              </div>
            </div>

            <div className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6
                }}
              >
                <div className="card-label" style={{ marginBottom: 0 }}>Ponto de Equilíbrio</div>
                {peBadge && <span className={'badge ' + peBadge.cls}>{peBadge.label}</span>}
              </div>
              <MetricRow label="Ponto de equilíbrio do mês">
                <span style={{ fontWeight: 600 }}>{brl(pontoEquilibrio)}</span>
              </MetricRow>
              <MetricRow label="Faturamento atual">{brl(faturamentoMes)}</MetricRow>
              <MetricRow label="Diferença">
                {diferencaFaturamentoPe === null
                  ? <span className="clr-muted">—</span>
                  : (
                    <span
                      style={{ fontWeight: 600 }}
                      className={diferencaFaturamentoPe >= 0 ? 'clr-green' : 'clr-red'}
                    >
                      {brl(diferencaFaturamentoPe)}
                    </span>
                  )}
              </MetricRow>
              <MetricRow label="Percentual atingido">
                {pct(resumo?.percentualAtingido)}
              </MetricRow>
              <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
                {statusPe === 'MARGEM_INSUFICIENTE' ? (
                  <span className="clr-red">{resumo?.mensagemOperacao}</span>
                ) : statusPe === 'ACIMA_DO_EQUILIBRIO' ? (
                  <span className="clr-green">
                    Você está acima do ponto de equilíbrio neste mês.
                  </span>
                ) : faltamParaEquilibrio !== null ? (
                  <span className="clr-orange">
                    Faltam {brl(faltamParaEquilibrio)} para atingir o ponto de equilíbrio.
                  </span>
                ) : (
                  <span className="clr-muted">Sem dados suficientes para calcular.</span>
                )}
              </div>
            </div>
          </div>

          {/* Lançamentos diários */}
          <div className="section-title">Lançamentos Diários · {formatMesLabel(mes)}</div>

          {totalRegistros === 0 ? (
            <div className="empty-state">
              Nenhum lançamento em {formatMesLabel(mes)}. Use o botão “+ Novo lançamento” ou troque
              o mês de referência no topo.
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
                            <input className="form-input" style={{ ...cellInputStyle, width: 110 }}
                              type="number" min="0" step="0.01"
                              value={editForm.valorTotal}
                              onChange={(e) => setEditForm({ ...editForm, valorTotal: e.target.value })} />
                          </td>
                          <td>
                            <input className="form-input" style={{ ...cellInputStyle, width: 80 }}
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
                        <td style={{ fontWeight: 500 }}>{brl(r.valorTotal)}</td>
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
