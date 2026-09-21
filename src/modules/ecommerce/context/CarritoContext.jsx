import { createContext, useContext, useMemo, useState } from 'react'

const CarritoContext = createContext(undefined)

/**
 * Implementación mínima en memoria (contrato congelado desde S3-00).
 * S3-17 la reemplaza por la versión real: persistencia en `carritos` /
 * `items_carrito` y fusión con el carrito guardado al iniciar sesión.
 */
export function CarritoProvider({ children }) {
  const [items, setItems] = useState([])

  function agregar(productoId, cantidad) {
    setItems((prev) => {
      const existente = prev.find((item) => item.productoId === productoId)
      if (existente) {
        return prev.map((item) =>
          item.productoId === productoId
            ? { ...item, cantidad: item.cantidad + cantidad }
            : item,
        )
      }
      return [...prev, { productoId, cantidad }]
    })
  }

  function actualizar(productoId, cantidad) {
    setItems((prev) =>
      prev.map((item) => (item.productoId === productoId ? { ...item, cantidad } : item)),
    )
  }

  function quitar(productoId) {
    setItems((prev) => prev.filter((item) => item.productoId !== productoId))
  }

  function vaciar() {
    setItems([])
  }

  const cantidadTotal = useMemo(
    () => items.reduce((acc, item) => acc + item.cantidad, 0),
    [items],
  )

  // Sin precios todavía: el catálogo (S3-14) es quien los provee. S3-17
  // suma el total real cuando une items con precio.
  const total = 0

  return (
    <CarritoContext.Provider
      value={{ items, cantidadTotal, total, agregar, actualizar, quitar, vaciar }}
    >
      {children}
    </CarritoContext.Provider>
  )
}

export function useCarrito() {
  const ctx = useContext(CarritoContext)
  if (!ctx) throw new Error('useCarrito debe usarse dentro de CarritoProvider')
  return ctx
}
