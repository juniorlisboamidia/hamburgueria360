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
const VALUE_VARIANT = {
  SAUDAVEL:  'success',
  ATENCAO:   'warn',
  ALERTA:    'brand',
  CRITICO:   'danger',
  SEM_FICHA: 'info',
  SEM_PRECO: 'info'
}
const CMV_COLOR_CLASS = {
  SAUDAVEL:  'clr-green',
  ATENCAO:   'clr-yellow',
  ALERTA:    'clr-orange',
  CRITICO:   'clr-red'
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
  const semFicha = produtos.filter((p) => p.analise.statusCmv === 'SEM_FICHA').length
  const criticos = produtos.filter((p) => p.analise.statusCmv === 'CRITICO').length

  const valorComCmv = produtos.filter(
    (p) => p.analise.cmvPercentual !== null && p.analise.cmvPercentual !== undefined
  )
  const cmvMedio =
    valorComCmv.length === 0
      ? null
      : valorComCmv.reduce((s, p) => s + Number(p.analise.cmvPercentual), 0) / valorComCmv.length
  const margemMedia =
    valorComCmv.length === 0
      ? null
      : valorComCmv.reduce((s, p) => s + Number(p.analise.margemBrutaPercentual), 0) /
        valorComCmv.length

  return (
    <div>
      <div className="section-title">Resumo</div>
      <div className="grid-3" style={{ marginBottom: 12 }}>
        <Card title="Total Ativos" value={int(totalAtivos)} hint="Produtos cadastrados" variant="info" />
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
      </div>
      <div className="grid-2">
        <Card
          title="CMV Médio"
          value={pct(cmvMedio)}
          hint="Apenas produtos com ficha válida"
          variant={cmvMedio !== null && cmvMedio > 40 ? 'danger' : 'success'}
        />
        <Card
          title="Margem Bruta Média"
          value={pct(margemMedia)}
          hint="Apenas produtos com ficha válida"
          variant={margemMedia !== null && margemMedia > 0 ? 'success' : 'info'}
        />
      </div>

      <div className="section-title">Produtos</div>

      {totalAtivos === 0 ? (
        <div className="empty-state">
          Nenhum produto cadastrado. Cadastre um produto e a ficha técnica para começar a acompanhar o CMV.
        </div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Preço de venda</th>
                <th>Custo da ficha</th>
                <th>CMV / Margem</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => {
                const a = p.analise
                const semFichaProduto = a.statusCmv === 'SEM_FICHA'
                const cmvClass = CMV_COLOR_CLASS[a.statusCmv] ?? ''

                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 500, color: '#111' }}>{p.nome}</div>
                      {p.descricao && (
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                          {p.descricao}
                        </div>
                      )}
                    </td>
                    <td>{brl(p.precoVenda)}</td>
                    <td className={semFichaProduto ? 'clr-muted' : ''}>
                      {semFichaProduto ? 'Não cadastrado' : brl(a.custoFichaTecnica)}
                    </td>
                    <td>
                      {a.cmvPercentual === null ? (
                        <span className="clr-muted">—</span>
                      ) : (
                        <span className={cmvClass}>
                          {pct(a.cmvPercentual)}
                          <span style={{ color: '#ddd', margin: '0 6px' }}>·</span>
                          <span style={{ color: '#666' }}>{pct(a.margemBrutaPercentual)}</span>
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={'badge ' + (STATUS_BADGE[a.statusCmv] ?? 'badge-gray')}>
                        {STATUS_LABEL[a.statusCmv] ?? a.statusCmv}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/ficha-tecnica/${p.id}`} className="btn btn-secondary">
                        Editar ficha
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
