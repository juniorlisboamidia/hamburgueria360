import { NavLink } from 'react-router-dom'

const visaoGeral = [
  { to: '/', label: 'Dashboard' }
]

const precificacao = [
  { to: '/produtos', label: 'Produtos' },
  { to: '/insumos',  label: 'Insumos' }
]

const gestao = [
  { to: '/custos', label: 'Custos' },
  { to: '/faturamento',  label: 'Faturamento' },
  { to: '/calc-frete', label: 'Calc. Frete' }
]

function itemClass({ isActive }) {
  return 'sidebar-item' + (isActive ? ' active' : '')
}

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">H</div>
        <div>
          <div className="sidebar-logo-text">Hamburgueria 360</div>
          <div className="sidebar-logo-sub">Gestão interna</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Visão Geral</div>
        {visaoGeral.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={itemClass}>
            {item.label}
          </NavLink>
        ))}

        <div className="sidebar-section-label">Precificação</div>
        {precificacao.map((item) => (
          <NavLink key={item.to} to={item.to} className={itemClass}>
            {item.label}
          </NavLink>
        ))}

        <div className="sidebar-section-label">Gestão</div>
        {gestao.map((item) => (
          <NavLink key={item.to} to={item.to} className={itemClass}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
