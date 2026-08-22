import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../lib/AuthContext'
import { getDepositos } from '../../stock/api/stockApi'
import { getCategorias, getProductosDestacados } from '../api/inicioApi'
import Header from '../componentes_inicio/Header'
import HeroBanner from '../componentes_inicio/HeroBanner'
import Beneficios from '../componentes_inicio/Beneficios'
import CategoryGrid from '../componentes_inicio/CategoryGrid'
import ProductosDestacados from '../componentes_inicio/ProductosDestacados'
import Sucursales from '../componentes_inicio/Sucursales'
import Footer from '../componentes_inicio/Footer'
import './HomePage.css'

const CLAVE_SUCURSAL = 'inicio:sucursalId'

export default function HomePage() {
  const navigate = useNavigate()
  const { session, signOut } = useAuth()

  const [sucursales, setSucursales] = useState([])
  const [sucursalId, setSucursalId] = useState(() => localStorage.getItem(CLAVE_SUCURSAL) ?? '')

  const [categorias, setCategorias] = useState([])
  const [loadingCategorias, setLoadingCategorias] = useState(true)
  const [errorCategorias, setErrorCategorias] = useState(null)

  const [productos, setProductos] = useState([])
  const [loadingProductos, setLoadingProductos] = useState(false)
  const [errorProductos, setErrorProductos] = useState(null)

  useEffect(() => {
    getDepositos()
      .then((data) => {
        setSucursales(data)
        setSucursalId((actual) => (actual && data.some((d) => d.id === actual) ? actual : (data[0]?.id ?? '')))
      })
      .catch(() => setSucursales([]))

    getCategorias()
      .then(setCategorias)
      .catch((err) => setErrorCategorias(err.message))
      .finally(() => setLoadingCategorias(false))
  }, [])

  useEffect(() => {
    if (!sucursalId) return
    localStorage.setItem(CLAVE_SUCURSAL, sucursalId)
    setLoadingProductos(true)
    setErrorProductos(null)
    getProductosDestacados(sucursalId, 3)
      .then(setProductos)
      .catch((err) => setErrorProductos(err.message))
      .finally(() => setLoadingProductos(false))
  }, [sucursalId])

  const sucursalActual = sucursales.find((s) => s.id === sucursalId)

  return (
    <div className="inicio-pagina">
      <Header
        session={session}
        sucursales={sucursales}
        sucursalActualId={sucursalId}
        onCambiarSucursal={setSucursalId}
        onIrALogin={() => navigate('/login')}
        onCerrarSesion={signOut}
      />

      <main>
        <HeroBanner />
        <Beneficios cantidadSucursales={sucursales.length} />
        <CategoryGrid categorias={categorias} loading={loadingCategorias} error={errorCategorias} />
        <ProductosDestacados
          sucursalNombre={sucursalActual?.nombre}
          productos={productos}
          loading={loadingProductos}
          error={errorProductos}
        />
        <Sucursales sucursales={sucursales} sucursalActualId={sucursalId} onElegir={setSucursalId} />
      </main>

      <Footer />
    </div>
  )
}
