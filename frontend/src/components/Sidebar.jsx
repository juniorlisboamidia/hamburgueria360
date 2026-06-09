import { NavLink } from 'react-router-dom'

const principal = [
  { to: '/',              label: 'Dashboard' },
  { to: '/produtos',      label: 'Produtos' },
  { to: '/insumos',       label: 'Insumos' },
  { to: '/ficha-tecnica', label: 'Ficha Técnica' }
]

const financeiro = [
  { to: '/custos-fixos',     label: 'Custos Fixos' },
  { to: '/custos-variaveis', label: 'Custos Variáveis' },
  { to: '/faturamento',      label: 'Faturamento' },
  { to: '/ponto-equilibrio', label: 'Ponto de Equilíbrio' }
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
        <div className="sidebar-section-label">Principal</div>
        {principal.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={itemClass}>
            {item.label}
          </NavLink>
        ))}

        <div className="sidebar-section-label">Financeiro</div>
        {financeiro.map((item) => (
          <NavLink key={item.to} to={item.to} className={itemClass}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
