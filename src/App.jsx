import { useEffect, useState } from 'react'

import { useAuth } from './lib/AuthContext'
import { paginaVisibleParaRol, primeraPaginaVisibleParaRol } from './components/layout/navigation'
import AccesoDenegado from './components/layout/AccesoDenegado'
import LoginPage from './modules/auth/pages/LoginPage'
import StockPage from './modules/stock/pages/StockPage'
import DepositosPage from './modules/stock/pages/DepositosPage'
import CategoriasPage from './modules/stock/pages/CategoriasPage'
import MarcasPage from './modules/stock/pages/MarcasPage'
import UnidadesMedidaPage from './modules/stock/pages/UnidadesMedidaPage'
import ArticulosPage from './modules/stock/pages/ArticulosPage'
import MovimientosPage from './modules/stock/pages/MovimientosPage'
import ConfiguracionStockPage from './modules/stock/pages/ConfiguracionStockPage'
import InventarioFisicoPage from './modules/stock/pages/InventarioFisicoPage'
import HistorialMovimientosPage from './modules/stock/pages/HistorialMovimientosPage'
import AlertasStockPage from './modules/stock/pages/AlertasStockPage'
import RecepcionesPage from './modules/stock/pages/RecepcionesPage'
import ReportesPage from './modules/stock/pages/ReportesPage'
import ProveedoresPage from './modules/proveedores/pages/ProveedoresPage'
import RubrosPage from './modules/proveedores/pages/RubrosPage'
import OrdenesCompraPage from './modules/compras/pages/OrdenesCompraPage'
import NotasProveedorPage from './modules/compras/pages/NotasProveedorPage'
import FacturasProveedorPage from './modules/tesoreria/pages/FacturasProveedorPage'
import OrdenesPagoPage from './modules/tesoreria/pages/OrdenesPagoPage'
import CajasPage from './modules/tesoreria/pages/CajasPage'
import ClientesPage from './modules/clientes/pages/ClientesPage'
import ClienteHistorialPage from './modules/clientes/pages/ClienteHistorialPage'
import ImportarClientesPage from './modules/clientes/pages/ImportarClientesPage'
import NuevaVentaPage from './modules/ventas/pages/NuevaVentaPage'
import VentasPage from './modules/ventas/pages/VentasPage'
import SupervisionVentasPage from './modules/ventas/pages/SupervisionVentasPage'
import ListasPrecioPage from './modules/ventas/pages/ListasPrecioPage'
import DescuentosPage from './modules/ventas/pages/DescuentosPage'
import PublicacionWebPage from './modules/ecommerce/pages/PublicacionWebPage'
import PedidosWebPage from './modules/ecommerce/pages/PedidosWebPage'
import AppShell from './components/layout/AppShell'

function App() {
  const { session, loading, signOut, esInterno, rol } = useAuth()
  // null = todavía no se eligió página (sin hash en la URL); se resuelve más
  // abajo con la primera pantalla habilitada para el rol, una vez conocido.
  const [pagina, setPagina] = useState(() => {
    const hash = window.location.hash.replace(/^#\/?/, '')
    return hash || null
  })

  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash.replace(/^#\/?/, '')
      if (hash && hash !== pagina) {
        setPagina(hash)
      }
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [pagina])

  // CA-04: un autenticado por Supabase Auth que no está en usuarios_internos
  // (o tiene activo=false) no es parte del equipo interno — p. ej. un
  // cliente de /tienda que probó entrar al backoffice. Se lo desloguea y se
  // lo manda a la tienda; nunca llega a ver AppShell.
  useEffect(() => {
    if (!loading && session && !esInterno) {
      signOut().then(() => {
        window.location.href = '/tienda'
      })
    }
  }, [loading, session, esInterno, signOut])

  function navegar(nuevaPagina) {
    setPagina(nuevaPagina)
    if (window.location.hash.replace(/^#\/?/, '') !== nuevaPagina) {
      window.location.hash = '#' + nuevaPagina
    }
  }

  if (loading) {
    return (
      <div className="app-loading" role="status">
        <span className="loading-mark" />
        <strong>Cargando Corralón Norte…</strong>
      </div>
    )
  }
  if (!session) return <LoginPage />
  if (!esInterno) return null // la redirección a /tienda ya está en curso

  const paginaActual = pagina ?? primeraPaginaVisibleParaRol(rol)

  return (
    <AppShell
      activePage={paginaActual}
      email={session.user.email}
      onNavigate={navegar}
      onSignOut={signOut}
      rol={rol}
    >
      {!paginaVisibleParaRol(paginaActual, rol) ? (
        <AccesoDenegado onVolver={() => navegar(primeraPaginaVisibleParaRol(rol))} />
      ) : (
        <>
      {paginaActual === 'stock' && <StockPage />}
      {paginaActual === 'depositos' && <DepositosPage />}
      {paginaActual === 'categorias' && <CategoriasPage />}
      {paginaActual === 'marcas' && <MarcasPage />}
      {paginaActual === 'unidades' && <UnidadesMedidaPage />}
      {paginaActual === 'articulos' && <ArticulosPage />}
      {paginaActual === 'movimientos' && (
        <MovimientosPage
          onVerHistorial={() => navegar('historial-movimientos')}
        />
      )}
      {paginaActual === 'historial-movimientos' && (
        <HistorialMovimientosPage
          onVolver={() => navegar('movimientos')}
        />
      )}
      {paginaActual === 'configuracion-stock' && <ConfiguracionStockPage />}
      {paginaActual === 'inventario-fisico' && <InventarioFisicoPage />}
      {paginaActual === 'alertas-stock' && <AlertasStockPage />}
      {paginaActual === 'recepciones' && <RecepcionesPage />}
      {paginaActual === 'reportes' && <ReportesPage />}
      {paginaActual === 'proveedores' && <ProveedoresPage />}
      {paginaActual === 'rubros' && <RubrosPage />}
      {paginaActual === 'ordenes-compra' && <OrdenesCompraPage />}
      {paginaActual === 'notas-proveedor' && <NotasProveedorPage />}
      {paginaActual === 'facturas-proveedor' && <FacturasProveedorPage />}
      {paginaActual === 'ordenes-pago' && <OrdenesPagoPage />}
      {paginaActual === 'cajas' && <CajasPage />}
      {paginaActual === 'clientes' && <ClientesPage />}
      {paginaActual === 'historial-cliente' && <ClienteHistorialPage />}
      {paginaActual === 'importar-clientes' && <ImportarClientesPage />}
      {paginaActual === 'nueva-venta' && <NuevaVentaPage />}
      {paginaActual === 'ventas' && <VentasPage />}
      {paginaActual === 'supervision-ventas' && <SupervisionVentasPage />}
      {paginaActual === 'listas-precio' && <ListasPrecioPage />}
      {paginaActual === 'descuentos' && <DescuentosPage />}
      {paginaActual === 'publicacion-web' && <PublicacionWebPage />}
      {paginaActual === 'pedidos-web' && <PedidosWebPage />}
        </>
      )}
    </AppShell>
  )
}

export default App
