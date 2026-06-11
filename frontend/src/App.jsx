import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Produtos from './pages/Produtos'
import Insumos from './pages/Insumos'
import FichaTecnica from './pages/FichaTecnica'
import Custos from './pages/Custos'
import CustosFixos from './pages/CustosFixos'
import CustosVariaveis from './pages/CustosVariaveis'
import Faturamento from './pages/Faturamento'
import PontoEquilibrio from './pages/PontoEquilibrio'
import Inteligencia from './pages/Inteligencia'
import CalcFrete from './pages/CalcFrete'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="produtos" element={<Produtos />} />
          <Route path="insumos" element={<Insumos />} />
          <Route path="ficha-tecnica" element={<FichaTecnica />} />
          <Route path="ficha-tecnica/:produtoId" element={<FichaTecnica />} />
          <Route path="custos" element={<Custos />} />
          <Route path="custos-fixos" element={<CustosFixos />} />
          <Route path="custos-variaveis" element={<CustosVariaveis />} />
          <Route path="faturamento" element={<Faturamento />} />
          <Route path="ponto-equilibrio" element={<PontoEquilibrio />} />
          <Route path="inteligencia" element={<Inteligencia />} />
          <Route path="calc-frete" element={<CalcFrete />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
