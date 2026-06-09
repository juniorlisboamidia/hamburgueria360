import Card from '../components/Card'

export default function Inteligencia() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Inteligência</h1>
          <div className="page-header-sub">Diagnósticos automáticos e recomendações</div>
        </div>
        <span className="badge is-danger">Beta</span>
      </div>

      <Card>
        <div className="placeholder-block">
          <strong>Diagnóstico em construção</strong>
          Aqui virão alertas de produtos com CMV crítico, sugestões de reajuste e oportunidades de redução de custo.
        </div>
      </Card>
    </div>
  )
}
