import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import Card from '../components/Card'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})
const numberFormatter = new Intl.NumberFormat('pt-BR')

function brl(value) {
  if (value === null || value === undefined) return '—'
  return brlFormatter.format(Number(value))
}
function pct(value) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toFixed(2).replace('.', ',')}%`
}
function int(value) {
  if (value === null || value === undefined) return '—'
  return numberFormatter.format(Number(value))
}

const STATUS_BADGE = {
  SAUDAVEL:  'badge-green',
  ATENCAO:   'badge-yellow',
  ALERTA:    'badge-orange',
  CRITICO:   'badge-red',
  SEM_FICHA: 'badge-blue',
  SEM_PRECO: 'badge-gray'
}
const STATUS_LABEL = {
  SAUDAVEL:  'Saudável',
  ATENCAO:   'Atenção',
  ALERTA:    'Alerta',
  CRITICO:   'Crítico',
  SEM_FICHA: 'Sem ficha',
  SEM_PRECO: 'Sem preço'
}
const CMV_COLOR_CLASS = {
  SAUDAVEL:  'clr-green',
  ATENCAO:   'clr-yellow',
  ALERTA:    'clr-orange',
  CRITICO:   'clr-red'
}

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

export default function Produtos() {
  const [produtos, setProdutos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    api
      .get('/produtos')
      .then((res) => Promise.all(
        res.data.map((p) =>
          api.get(`/produtos/${p.id}/analise`).then((r) => ({ ...p, analise: r.data }))
        )
      ))
      .then((rows) => {
        setProdutos(rows)
        setLoading(false)
      })
      .catch((err) => {
        const msg =
          err?.response?.data?.error ??
          (err?.code === 'ERR_NETWORK'
            ? 'Não foi possível conectar ao backend (http://localhost:4000).'
            : err?.message ?? 'Erro inesperado.')
        setError(msg)
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return <div className="loading-state">Carregando produtos…</div>
  }

  if (error) {
    return (
      <div className="alert alert-red">
        <div>
          <div className="alert-title clr-red">Não foi possível carregar os produtos</div>
          <div className="alert-msg">{error}</div>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={load}>
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Métricas agregadas
  const totalAtivos = produtos.length
  const semFicha = produtos.filter((p) => p.analise?.statusCmv === 'SEM_FICHA').length
  const criticos = produtos.filter((p) => p.analise?.statusCmv === 'CRITICO').length
  const fichasCadastradas = totalAtivos - semFicha

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Produtos</h1>
          <div className="page-header-sub">
            Cadastro de produtos, ficha técnica, CMV e precificação.
          </div>
        </div>
        <span className="badge badge-orange">Precificação</span>
      </div>

      <div className="section-title">Resumo</div>
      <div className="grid-4" style={{ marginBottom: 4 }}>
        <Card
          title="Produtos Cadastrados"
          value={int(totalAtivos)}
          hint="Ativos no cardápio"
          variant="info"
        />
        <Card
          title="Sem Ficha Técnica"
          value={int(semFicha)}
          hint="Sem CMV calculado"
          variant={semFicha > 0 ? 'warn' : 'success'}
        />
        <Card
          title="CMV Crítico"
          value={int(criticos)}
          hint="Acima de 40%"
          variant={criticos > 0 ? 'danger' : 'success'}
        />
        <Card
          title="Fichas Cadastradas"
          value={int(fichasCadastradas)}
          hint="Produtos com composição"
          variant={fichasCadastradas > 0 ? 'success' : 'info'}
        />
      </div>

      <div className="section-title">Produtos e Fichas</div>

      {totalAtivos === 0 ? (
        <div className="empty-state">
          Nenhum produto cadastrado. Cadastre um produto e a ficha técnica para começar a acompanhar o CMV.
        </div>
      ) : (
        <div className="grid-3">
          {produtos.map((p) => {
            const a = p.analise ?? {}
            const semFichaProduto = a.statusCmv === 'SEM_FICHA'
            const cmvClass = CMV_COLOR_CLASS[a.statusCmv] ?? ''
            const lucroPositivo =
              a.lucroBruto !== null && a.lucroBruto !== undefined && Number(a.lucroBruto) > 0

            return (
              <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 10
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#111', fontSize: 14 }}>{p.nome}</div>
                    {p.descricao && (
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{p.descricao}</div>
                    )}
                  </div>
                  <span className={'badge ' + (STATUS_BADGE[a.statusCmv] ?? 'badge-gray')}>
                    {STATUS_LABEL[a.statusCmv] ?? a.statusCmv ?? '—'}
                  </span>
                </div>

                <div style={{ flex: 1 }}>
                  <MetricRow label="Preço de venda">
                    <span style={{ fontWeight: 600 }}>{brl(p.precoVenda)}</span>
                  </MetricRow>
                  <MetricRow label="Custo da ficha">
                    {semFichaProduto
                      ? <span className="clr-muted">Não cadastrado</span>
                      : brl(a.custoFichaTecnica)}
                  </MetricRow>
                  <MetricRow label="CMV">
                    {a.cmvPercentual === null || a.cmvPercentual === undefined
                      ? <span className="clr-muted">—</span>
                      : <span className={cmvClass} style={{ fontWeight: 600 }}>{pct(a.cmvPercentual)}</span>}
                  </MetricRow>
                  <MetricRow label="Margem bruta">
                    {pct(a.margemBrutaPercentual)}
                  </MetricRow>
                  <MetricRow label="Lucro bruto estimado">
                    {a.lucroBruto === null || a.lucroBruto === undefined
                      ? <span className="clr-muted">—</span>
                      : <span className={lucroPositivo ? 'clr-green' : 'clr-red'}>{brl(a.lucroBruto)}</span>}
                  </MetricRow>
                  <MetricRow label="Preço sugerido">
                    <span className="badge badge-gray">Em breve</span>
                  </MetricRow>
                  <MetricRow label="Preço iFood">
                    <span className="badge badge-gray">Em breve</span>
                  </MetricRow>
                </div>

                {a.mensagemDiagnostico && (
                  <div style={{ fontSize: 11, color: '#999', margin: '10px 0 0', lineHeight: 1.5 }}>
                    {a.mensagemDiagnostico}
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <Link to={`/ficha-tecnica/${p.id}`} className="btn btn-primary">
                    Abrir ficha
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
