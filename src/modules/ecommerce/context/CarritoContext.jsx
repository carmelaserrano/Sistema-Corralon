import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useClienteWeb } from './ClienteWebContext'
import { fusionarCarrito, guardarItems, obtenerCarrito, validarItems } from '../api/carritoApi'
import Feedback from '../../../components/ui/Feedback'

const CarritoContext = createContext(undefined)
const EstadoCarritoContext = createContext(undefined)
const CLAVE = 'corralon.carrito.visitante.v1'

function leerVisitante() {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE) || 'null')
    if (guardado && Array.isArray(guardado.items) && typeof guardado.fusionId === 'string') return guardado
  } catch { /* Un navegador sin almacenamiento sigue funcionando en memoria. */ }
  return { items: [], fusionId: crypto.randomUUID() }
}

function escribirVisitante(carrito) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(carrito))
    return true
  } catch {
    return false
  }
}

/** Mantiene la firma congelada de S3-00. Las operaciones devuelven una promesa.
 * Cada identidad tiene su instancia: no reutiliza el carrito de otra cuenta.
 */
export function CarritoProvider({ children }) {
  const { cliente, cargando } = useClienteWeb()
  const visitante = useRef(null)
  if (visitante.current === null) visitante.current = leerVisitante()
  return (
    <CarritoSesion key={cliente?.id ?? 'visitante'} clienteId={cliente?.id ?? null} esperandoSesion={cargando} visitante={visitante}>
      {children}
    </CarritoSesion>
  )
}

function CarritoSesion({ children, clienteId, esperandoSesion, visitante }) {
  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const actual = useRef([])
  const listo = useRef(false)
  const activo = useRef(false)
  const cola = useRef(Promise.resolve())
  const aplicar = useCallback((nuevos) => {
    actual.current = nuevos
    setItems(nuevos)
    const ajustes = nuevos.filter((item) => item.ajustado)
    setAviso(ajustes.map((item) => `${item.nombre}: ajustamos la cantidad a ${item.cantidad}, el máximo disponible.`).join(' '))
  }, [])

  // Todas las acciones se encadenan: dos clics rápidos suman sobre el último
  // resultado confirmado, sin que respuestas atrasadas sobrescriban el estado.
  const ejecutar = useCallback((operacion) => {
    const tarea = cola.current.then(async () => {
      if (!activo.current) return undefined
      setCargando(true)
      setError('')
      try {
        return await operacion()
      } catch (err) {
        if (activo.current) setError(err.message || 'No pudimos actualizar el carrito. Intentá nuevamente.')
        throw err
      } finally {
        if (activo.current) setCargando(false)
      }
    })
    // Maneja también consumidores del contrato antiguo que no esperan promesas.
    cola.current = tarea.catch(() => undefined)
    return tarea
  }, [])

  const cargar = useCallback(async () => {
    const anonimo = visitante.current
    const nuevos = clienteId
      ? (anonimo.items.length
          ? await fusionarCarrito(clienteId, anonimo.items, anonimo.fusionId)
          : await obtenerCarrito(clienteId))
      : await validarItems(anonimo.items)
    if (!activo.current) return undefined
    if (clienteId && anonimo.items.length) {
      // Se limpia únicamente después de confirmar la fusión en el servidor.
      const vacio = { items: [], fusionId: crypto.randomUUID() }
      escribirVisitante(vacio)
      visitante.current = vacio
    }
    aplicar(nuevos)
    listo.current = true
    return nuevos
  }, [aplicar, clienteId, visitante])

  useEffect(() => {
    activo.current = true
    if (!esperandoSesion) ejecutar(cargar)
    return () => { activo.current = false }
  }, [cargar, ejecutar, esperandoSesion])

  const recargar = useCallback(() => ejecutar(async () => {
    if (!listo.current) return cargar()
    const nuevos = clienteId ? await obtenerCarrito(clienteId) : await validarItems(actual.current)
    if (activo.current) aplicar(nuevos)
    return nuevos
  }), [aplicar, cargar, clienteId, ejecutar])

  function modificar(transformar) {
    return ejecutar(async () => {
      if (!listo.current || esperandoSesion) throw new Error('Esperá a que termine de cargar el carrito')
      const propuestos = transformar(actual.current)
      const nuevos = clienteId
        ? await guardarItems(clienteId, propuestos)
        : await validarItems(propuestos)
      if (!activo.current) return undefined
      if (!clienteId) {
        visitante.current = {
          fusionId: crypto.randomUUID(),
          items: nuevos.map(({ productoId, cantidad }) => ({ productoId, cantidad })),
        }
        const guardado = escribirVisitante(visitante.current)
        aplicar(nuevos)
        if (!guardado) setAviso('El navegador no permite guardar el carrito: se conservará solo mientras esta página siga abierta.')
      } else aplicar(nuevos)
      return nuevos
    })
  }

  function agregar(productoId, cantidad) {
    return modificar((prev) => {
      if (typeof cantidad !== 'number' || !Number.isFinite(cantidad) || cantidad <= 0) {
        throw new Error('Ingresá una cantidad mayor a cero')
      }
      const encontrado = prev.find((item) => item.productoId === productoId)
      return encontrado
        ? prev.map((item) => item.productoId === productoId ? { ...item, cantidad: item.cantidad + cantidad } : item)
        : [...prev, { productoId, cantidad }]
    })
  }

  function actualizar(productoId, cantidad) {
    return modificar((prev) => {
      if (typeof cantidad !== 'number' || !Number.isFinite(cantidad) || cantidad < 0) {
        throw new Error('Ingresá una cantidad mayor o igual a cero')
      }
      return cantidad === 0 ? prev.filter((item) => item.productoId !== productoId)
        : prev.map((item) => item.productoId === productoId ? { ...item, cantidad } : item)
    })
  }

  function quitar(productoId) {
    return modificar((prev) => prev.filter((item) => item.productoId !== productoId))
  }

  function vaciar() {
    return modificar(() => [])
  }

  const cantidadTotal = items.reduce((sum, item) => sum + item.cantidad, 0)
  const total = Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100
  return (
    <CarritoContext.Provider value={{ items, cantidadTotal, total, agregar, actualizar, quitar, vaciar }}>
      <EstadoCarritoContext.Provider value={{ cargando: cargando || esperandoSesion, error, aviso, recargar }}>
        {error && <Feedback tone="error">{error} <button type="button" disabled={cargando} onClick={() => recargar()}>Reintentar carga</button></Feedback>}
        {aviso && <Feedback>{aviso}</Feedback>}
        {children}
      </EstadoCarritoContext.Provider>
    </CarritoContext.Provider>
  )
}

export function useCarrito() {
  const ctx = useContext(CarritoContext)
  if (!ctx) throw new Error('useCarrito debe usarse dentro de CarritoProvider')
  return ctx
}

// Estado de la pantalla separado para no alterar las siete claves del contrato.
export function useEstadoCarrito() {
  const ctx = useContext(EstadoCarritoContext)
  if (!ctx) throw new Error('useEstadoCarrito debe usarse dentro de CarritoProvider')
  return ctx
}
