import { useEffect, useState } from 'react'
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
function getCurrentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function formatMesLabel(mes) {
  if (!mes) return ''
  const [ano, m] = mes.split('-')
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const idx = Number(m) - 1
  return meses[idx] ? `${meses[idx]} · ${ano}` : mes
}

const STATUS_VARIANT = {
  ACIMA_DO_EQUILIBRIO: 'success',
  PROXIMO_DO_EQUILIBRIO: 'brand',
  ABAIXO_DO_EQUILIBRIO: 'info',
  MARGEM_INSUFICIENTE: 'danger'
}
const STATUS_BADGE = {
  ACIMA_DO_EQUILIBRIO: 'badge-green',
  PROXIMO_DO_EQUILIBRIO: 'badge-orange',
  ABAIXO_DO_EQUILIBRIO: 'badge-blue',
  MARGEM_INSUFICIENTE: 'badge-red'
}
const STATUS_ALERT = {
  ACIMA_DO_EQUILIBRIO: 'alert-green',
  PROXIMO_DO_EQUILIBRIO: 'alert-yellow',
  ABAIXO_DO_EQUILIBRIO: 'alert-gray',
  MARGEM_INSUFICIENTE: 'alert-red'
}
const STATUS_LABEL = {
  ACIMA_DO_EQUILIBRIO: 'Acima do equilíbrio',
  PROXIMO_DO_EQUILIBRIO: 'Próximo do equilíbrio',
  ABAIXO_DO_EQUILIBRIO: 'Abaixo do equilíbrio',
  MARGEM_INSUFICIENTE: 'Margem insuficiente'
}

export default function Dashboard() {
  const [mesSelecionado, setMesSelecionado] = useState(getCurrentMonth())
  const [data, setData] = useState(null)
  const [produtos, setProdutos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function load(mesParam = mesSelecionado) {
    setLoading(true)
    setError(null)

    const dashboardCall = api.get('/dashboard', { params: { mes: mesParam } })
    const produtosCall = api
      .get('/produtos')
      .then((r) =>
        Promise.all(
          r.data.map((p) =>
            api
              .get(`/produtos/${p.id}/analise`)
              .then((rr) => ({ ...p, analise: rr.data }))
          )
        )
      )

    Promise.all([dashboardCall, produtosCall])
      .then(([dashRes, prodRows]) => {
        setData(dashRes.data)
        setProdutos(prodRows)
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

  useEffect(() => { load(mesSelecionado) }, [mesSelecionado])

  // ===== Saúde do Cardápio =====
  const totalAtivos = produtos.length
  const semFicha = produtos.filter((p) => p.analise?.statusCmv === 'SEM_FICHA')
  const criticos = produtos.filter((p) => p.analise?.statusCmv === 'CRITICO')
  const validos = produtos.filter(
    (p) => p.analise?.cmvPercentual !== null && p.analise?.cmvPercentual !== undefined
  )
  const cmvMedio =
    validos.length === 0
      ? null
      : validos.reduce((s, p) => s + Number(p.analise.cmvPercentual), 0) / validos.length
  const margemMedia = cmvMedio === null ? null : 100 - cmvMedio

  const status = data?.statusOperacao
  const statusVariant = STATUS_VARIANT[status] ?? 'info'
  const statusBadge = STATUS_BADGE[status] ?? 'badge-gray'
  const statusAlert = STATUS_ALERT[status] ?? 'alert-gray'
  const statusLabel = STATUS_LABEL[status] ?? status

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
          value={mesSelecionado}
          onChange={(e) => setMesSelecionado(e.target.value || getCurrentMonth())}
          style={{ width: 180 }}
        />
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#aaa' }}>
          {loading ? 'Carregando…' : ''}
        </span>
      </div>

      {error ? (
        <div className="alert alert-red">
          <div>
            <div className="alert-title clr-red">Não foi possível carregar o dashboard</div>
            <div className="alert-msg">{error}</div>
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => load(mesSelecionado)}>
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="loading-state">Carregando indicadores…</div>
      ) : !data ? (
        <div className="empty-state">Nenhum dado disponível para {formatMesLabel(mesSelecionado)}.</div>
      ) : (
        <>
          {/* SAÚDE DO CARDÁPIO */}
          <div className="section-title">Saúde do Cardápio</div>
          <div className="grid-5">
            <Card
              title="Produtos Ativos"
              value={int(totalAtivos)}
              hint="Cadastros em uso"
              variant="info"
            />
            <Card
              title="Sem Ficha Técnica"
              value={int(semFicha.length)}
              hint="Aguardando insumos"
              variant={semFicha.length > 0 ? 'warn' : 'success'}
            />
            <Card
              title="CMV Crítico"
              value={int(criticos.length)}
              hint="Acima de 40%"
              variant={criticos.length > 0 ? 'danger' : 'success'}
            />
            <Card
              title="CMV Médio"
              value={pct(cmvMedio)}
              hint="Cardápio com ficha válida"
              variant={cmvMedio !== null && cmvMedio > 40 ? 'danger' : 'success'}
            />
            <Card
              title="Margem Média"
              value={pct(margemMedia)}
              hint="100% − CMV médio"
              variant={margemMedia !== null && margemMedia > 0 ? 'success' : 'info'}
            />
          </div>

          {/* PRODUTOS EM ALERTA */}
          <div className="section-title">Produtos em Alerta</div>

          {totalAtivos === 0 ? (
            <div className="empty-state">
              Nenhum produto cadastrado. Cadastre produtos e fichas técnicas para começar a acompanhar o cardápio.
            </div>
          ) : semFicha.length === 0 && criticos.length === 0 ? (
            <div className="alert alert-green">
              <div>
                <div className="alert-title clr-green">Cardápio saudável</div>
                <div className="alert-msg">
                  Todos os produtos ativos têm ficha técnica e estão dentro da faixa segura de CMV.
                </div>
              </div>
            </div>
          ) : (
            <div>
              {semFicha.length > 0 && (
                <div className="alert alert-yellow">
                  <div style={{ flex: 1 }}>
                    <div className="alert-title clr-yellow">
                      {semFicha.length} produto{semFicha.length === 1 ? '' : 's'} sem ficha técnica
                    </div>
                    <div className="alert-msg">
                      Cadastre os insumos e quantidades para liberar o cálculo de CMV e margem.
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {semFicha.map((p) => (
                        <span key={p.id} className="badge badge-blue">{p.nome}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {criticos.length > 0 && (
                <>
                  <div className="alert alert-red">
                    <div>
                      <div className="alert-title clr-red">
                        {criticos.length} produto{criticos.length === 1 ? '' : 's'} com CMV acima de 40%
                      </div>
                      <div className="alert-msg">
                        Revise preço de venda, ficha técnica ou porcionamento desses itens.
                      </div>
                    </div>
                  </div>
                  <div className="table-card">
                    <table className="hb-table">
                      <thead>
                        <tr>
                          <th>Produto</th>
                          <th>CMV</th>
                          <th>Margem</th>
                          <th>Preço</th>
                          <th>Diagnóstico</th>
                        </tr>
                      </thead>
                      <tbody>
                        {criticos.map((p) => (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 500 }}>{p.nome}</td>
                            <td className="clr-red">{pct(p.analise?.cmvPercentual)}</td>
                            <td>{pct(p.analise?.margemBrutaPercentual)}</td>
                            <td>{brl(p.precoVenda)}</td>
                            <td className="clr-muted">{p.analise?.mensagemDiagnostico}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* INDICADORES DE APOIO */}
          <div className="section-title">Indicadores de Apoio</div>
          <div className="grid-3">
            <Card
              title="Insumos Ativos"
              value={int(data.quantidadeInsumosAtivos)}
              hint="Cadastros em uso"
              variant="info"
            />
            <Card
              title="Custos Fixos"
              value={brl(data.totalCustosFixos)}
              hint="Mensais recorrentes"
            />
            <Card
              title="Custos Variáveis"
              value={brl(data.totalCustosVariaveis)}
              hint="Estimativa do mês"
            />
          </div>

          {/* FINANCEIRO DO MÊS */}
          <div className="section-title">Financeiro do Mês · {formatMesLabel(mesSelecionado)}</div>
          <div className="grid-4" style={{ marginBottom: 12 }}>
            <Card
              title="Faturamento"
              value={brl(data.faturamentoAtual)}
              hint="Total no mês"
            />
            <Card
              title="Pedidos"
              value={int(data.totalPedidos)}
              hint="Quantidade no mês"
            />
            <Card
              title="Ticket Médio"
              value={brl(data.ticketMedio)}
              hint="Faturamento / pedidos"
            />
            <Card
              title="Ponto de Equilíbrio"
              value={brl(data.pontoEquilibrio)}
              hint={`${pct(data.percentualAtingido)} atingido`}
              variant={statusVariant}
            />
          </div>

          <div className={'alert ' + statusAlert}>
            <div>
              <div className="alert-title">
                <span className={'badge ' + statusBadge}>{statusLabel}</span>
              </div>
              <div className="alert-msg" style={{ marginTop: 6 }}>
                {data.mensagemOperacao}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
