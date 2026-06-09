import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-area">
        <header className="topbar">
          <div>
            <div className="topbar-title">Hamburgueria 360</div>
            <div className="topbar-subtitle">Gestão de cardápio, custos e margem</div>
          </div>
          <div className="topbar-right">
            <span className="mes-pill">Maio · 2026</span>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
