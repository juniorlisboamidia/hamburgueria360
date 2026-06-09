import Card from '../components/Card'

export default function PontoEquilibrio() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ponto de Equilíbrio</h1>
          <div className="page-header-sub">Faturamento mínimo para cobrir todos os custos</div>
        </div>
        <span className="badge is-success">Análise Mensal</span>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <Card title="Margem de Contribuição" value="—" hint="% sobre faturamento" variant="success" />
        <Card title="Ponto de Equilíbrio" value="R$ —" hint="Faturamento mínimo" variant="brand" />
        <Card title="% Atingido" value="—" hint="Faturamento atual / PE" variant="info" />
      </div>

      <Card>
        <div className="placeholder-block">
          <strong>Detalhamento em construção</strong>
          Aqui virá o quadro com CMV médio, custos variáveis e o status da operação.
        </div>
      </Card>
    </div>
  )
}
