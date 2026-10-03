import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Clock,
  CreditCard,
  Edit2,
  Lock,
  MapPin,
  PackageCheck,
  Plus,
  ShieldCheck,
  Store,
  Truck,
} from 'lucide-react'
import Button from '../../../components/ui/Button'
import Feedback from '../../../components/ui/Feedback'
import {
  actualizarDomicilio,
  crearDomicilio,
  listarDomicilios,
} from '../../clientes/api/domiciliosApi'
import { crearPedidoWeb, iniciarPago } from '../api/checkoutApi'
import { useCarrito } from '../context/CarritoContext'
import { useClienteWeb } from '../context/ClienteWebContext'
import { ImagenProducto } from './CatalogoPage'

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const VACIO = {
  alias: '',
  calle: '',
  numero: '',
  localidad: 'Salta Capital',
  provincia: 'Salta',
  codigo_postal: '',
  referencias: '',
}

export default function CheckoutPage({ onPasarelaSimulada, onVolverCarrito }) {
  const { cliente } = useClienteWeb()
  const { items, total } = useCarrito()
  const checkoutId = useRef(crypto.randomUUID())
  const [tipo, setTipo] = useState('retiro')
  const [domicilios, setDomicilios] = useState([])
  const [domicilioId, setDomicilioId] = useState('')
  const [formulario, setFormulario] = useState(VACIO)
  const [editando, setEditando] = useState(null)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    if (!cliente?.id) return undefined
    listarDomicilios(cliente.id)
      .then((lista) => {
        if (!activo) return
        setDomicilios(lista)
        setDomicilioId(lista.find((d) => d.es_principal)?.id || lista[0]?.id || '')
      })
      .catch((err) => activo && setError(err.message || 'No pudimos cargar tus domicilios'))
    return () => {
      activo = false
    }
  }, [cliente?.id])

  function cambiarCampo(event) {
    setFormulario((actual) => ({ ...actual, [event.target.name]: event.target.value }))
  }

  function abrirNuevo() {
    setEditando(null)
    setFormulario(VACIO)
    setMostrarFormulario(true)
  }

  function abrirEdicion(domicilio) {
    setEditando(domicilio.id)
    setFormulario(
      Object.fromEntries(Object.keys(VACIO).map((campo) => [campo, domicilio[campo] || ''])),
    )
    setMostrarFormulario(true)
  }

  async function guardarDomicilio(event) {
    event.preventDefault()
    setCargando(true)
    setError('')
    try {
      const guardado = editando
        ? await actualizarDomicilio(editando, formulario)
        : await crearDomicilio(cliente.id, formulario)
      const lista = await listarDomicilios(cliente.id)
      setDomicilios(lista)
      setDomicilioId(guardado.id)
      setMostrarFormulario(false)
    } catch (err) {
      setError(err.message || 'No pudimos guardar el domicilio')
    } finally {
      setCargando(false)
    }
  }

  async function confirmar() {
    setCargando(true)
    setError('')
    try {
      const pedido = await crearPedidoWeb({
        checkoutId: checkoutId.current,
        tipoEntrega: tipo,
        domicilioId,
      })
      if (import.meta.env.VITE_PAGO_SIMULADO === 'true') {
        onPasarelaSimulada?.(pedido.id)
      } else {
        const preferencia = await iniciarPago(pedido.id)
        window.location.assign(preferencia.init_point)
      }
    } catch (err) {
      setError(err.message || 'No pudimos crear el pedido')
    } finally {
      setCargando(false)
    }
  }

  if (!cliente) {
    return (
      <section className="tienda-checkout-vacio">
        <Feedback tone="error">Necesitás iniciar sesión para completar la compra.</Feedback>
      </section>
    )
  }

  if (!items.length) {
    return (
      <section className="tienda-checkout-vacio">
        <h1>Checkout</h1>
        <Feedback>Tu carrito está vacío.</Feedback>
      </section>
    )
  }

  return (
    <section className="tienda-checkout" aria-labelledby="checkout-titulo" aria-busy={cargando}>
      {/* Stepper visual */}
      <div className="tienda-stepper">
        <div className="tienda-step is-completed">
          <span className="tienda-step-num">1</span>
          <span className="tienda-step-text">Carrito</span>
        </div>
        <div className="tienda-step-sep is-active" />
        <div className="tienda-step is-active">
          <span className="tienda-step-num">2</span>
          <span className="tienda-step-text">Entrega y Datos</span>
        </div>
        <div className="tienda-step-sep" />
        <div className="tienda-step">
          <span className="tienda-step-num">3</span>
          <span className="tienda-step-text">Pago Seguro</span>
        </div>
      </div>

      <div className="tienda-checkout-header">
        <Button type="button" variant="ghost" icon={ArrowLeft} onClick={onVolverCarrito}>
          Volver al carrito
        </Button>
        <h1 id="checkout-titulo">
          <PackageCheck size={26} aria-hidden="true" /> Finalizar Compra
        </h1>
        <p>Completá la modalidad de entrega. Tu stock quedará reservado automáticamente por 60 minutos.</p>
      </div>

      {error && <Feedback tone="error">{error}</Feedback>}

      <div className="tienda-checkout-grid">
        {/* COLUMNA IZQUIERDA: FORMULARIO Y OPCIONES */}
        <div className="tienda-checkout-main">
          {/* 1. Modalidad de Entrega */}
          <div className="tienda-checkout-seccion">
            <h2>1. Modalidad de entrega</h2>
            <div className="tienda-metodos-entrega">
              <label
                className={`tienda-metodo-card ${tipo === 'retiro' ? 'is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="entrega"
                  checked={tipo === 'retiro'}
                  onChange={() => setTipo('retiro')}
                />
                <div className="tienda-metodo-info">
                  <div className="tienda-metodo-header">
                    <Store size={22} className="tienda-metodo-icon" />
                    <strong>Retiro en sucursal / corralón</strong>
                  </div>
                  <p>Retirá sin costo por nuestro sector de carga pesada una vez preparado.</p>
                  <span className="tienda-metodo-costo">Sin cargo</span>
                </div>
              </label>

              <label
                className={`tienda-metodo-card ${tipo === 'envio' ? 'is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="entrega"
                  checked={tipo === 'envio'}
                  onChange={() => setTipo('envio')}
                />
                <div className="tienda-metodo-info">
                  <div className="tienda-metodo-header">
                    <Truck size={22} className="tienda-metodo-icon" />
                    <strong>Envío a obra / domicilio</strong>
                  </div>
                  <p>Logística propia con camión grúa para materiales pesados en Salta.</p>
                  <span className="tienda-metodo-costo">Bonificado en Salta Capital</span>
                </div>
              </label>
            </div>
          </div>

          {/* 2. Domicilio de Entrega (solo si tipo === 'envio') */}
          {tipo === 'envio' && (
            <div className="tienda-checkout-seccion">
              <div className="tienda-seccion-titulo-con-accion">
                <h2>2. Dirección de entrega en obra</h2>
                {!mostrarFormulario && (
                  <Button type="button" variant="ghost" icon={Plus} onClick={abrirNuevo}>
                    Agregar dirección
                  </Button>
                )}
              </div>

              {domicilios.length === 0 && !mostrarFormulario && (
                <Feedback>
                  No tenés domicilios guardados. Agregá la dirección de tu obra o domicilio para el envío.
                </Feedback>
              )}

              {/* Lista de Domicilios */}
              <div className="tienda-domicilios-lista">
                {domicilios.map((dom) => {
                  const seleccionado = domicilioId === dom.id
                  return (
                    <div
                      key={dom.id}
                      className={`tienda-domicilio-card ${seleccionado ? 'is-selected' : ''}`}
                      onClick={() => setDomicilioId(dom.id)}
                    >
                      <label className="tienda-domicilio-label">
                        <input
                          type="radio"
                          name="domicilio"
                          checked={seleccionado}
                          onChange={() => setDomicilioId(dom.id)}
                        />
                        <div className="tienda-domicilio-datos">
                          <div className="tienda-domicilio-alias-row">
                            <strong>{dom.alias || 'Dirección de obra'}</strong>
                            {dom.es_principal && <span className="tienda-chip">Principal</span>}
                          </div>
                          <span className="tienda-domicilio-calle">
                            <MapPin size={14} /> {dom.calle} {dom.numero}
                          </span>
                          <span className="tienda-domicilio-loc">
                            {dom.localidad}, {dom.provincia}
                            {dom.codigo_postal ? ` (CP ${dom.codigo_postal})` : ''}
                          </span>
                          {dom.referencias && (
                            <small className="tienda-domicilio-ref">
                              Ref: {dom.referencias}
                            </small>
                          )}
                        </div>
                      </label>
                      <button
                        type="button"
                        className="tienda-btn-modificar-dom"
                        onClick={(e) => {
                          e.stopPropagation()
                          abrirEdicion(dom)
                        }}
                        title="Modificar dirección"
                        aria-label="Modificar dirección"
                      >
                        <Edit2 size={15} />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Formulario de Alta / Edición de Domicilio */}
              {mostrarFormulario && (
                <form onSubmit={guardarDomicilio} className="tienda-form-domicilio">
                  <h3>{editando ? 'Modificar dirección' : 'Nueva dirección de entrega'}</h3>
                  <div className="tienda-form-grid">
                    <label>
                      <span>Nombre o Alias de la obra (Ej: Obra San Martín, Casa) *</span>
                      <input
                        name="alias"
                        value={formulario.alias}
                        required
                        placeholder="Ej: Obra Barrio Norte"
                        onChange={cambiarCampo}
                      />
                    </label>

                    <label>
                      <span>Calle *</span>
                      <input
                        name="calle"
                        value={formulario.calle}
                        required
                        placeholder="Ej: Av. Belgrano"
                        onChange={cambiarCampo}
                      />
                    </label>

                    <label>
                      <span>Número / Altura *</span>
                      <input
                        name="numero"
                        value={formulario.numero}
                        required
                        placeholder="Ej: 1250"
                        onChange={cambiarCampo}
                      />
                    </label>

                    <label>
                      <span>Localidad *</span>
                      <input
                        name="localidad"
                        value={formulario.localidad}
                        required
                        onChange={cambiarCampo}
                      />
                    </label>

                    <label>
                      <span>Provincia *</span>
                      <input
                        name="provincia"
                        value={formulario.provincia}
                        required
                        onChange={cambiarCampo}
                      />
                    </label>

                    <label>
                      <span>Código Postal</span>
                      <input
                        name="codigo_postal"
                        value={formulario.codigo_postal}
                        placeholder="Ej: 4400"
                        onChange={cambiarCampo}
                      />
                    </label>

                    <label className="tienda-campo-completo">
                      <span>Indicaciones para la descarga / Obra (calles de tierra, portón, etc.)</span>
                      <textarea
                        name="referencias"
                        rows={2}
                        value={formulario.referencias}
                        placeholder="Ej: Portón negro, calle de tierra, avisar antes de llegar."
                        onChange={cambiarCampo}
                      />
                    </label>
                  </div>

                  <div className="tienda-form-domicilio-actions">
                    <Button type="submit" loading={cargando}>
                      {editando ? 'Actualizar dirección' : 'Guardar dirección'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setMostrarFormulario(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* 3. Aclaración de Pago */}
          <div className="tienda-checkout-seccion">
            <h2>3. Pago seguro online</h2>
            <div className="tienda-pago-aviso-card">
              <div className="tienda-pago-aviso-header">
                <ShieldCheck size={24} className="tienda-icon-secure" />
                <div>
                  <strong>Procesado a través de Mercado Pago</strong>
                  <p>Podés abonar con dinero en cuenta, tarjetas de débito o crédito y cuotas.</p>
                </div>
              </div>
              <div className="tienda-pago-pills">
                <span className="tienda-pago-pill">Tarjetas de Débito</span>
                <span className="tienda-pago-pill">Tarjetas de Crédito</span>
                <span className="tienda-pago-pill">Dinero en Mercado Pago</span>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: RESUMEN DEL PEDIDO (ORDER SUMMARY) */}
        <aside className="tienda-checkout-resumen">
          <div className="tienda-resumen-box">
            <h3>Resumen del pedido</h3>

            <ul className="tienda-resumen-items">
              {items.map((item) => (
                <li key={item.productoId} className="tienda-resumen-item">
                  <div className="tienda-resumen-thumb">
                    <ImagenProducto url={item.imagenUrl} nombre={item.nombre} alto={50} />
                  </div>
                  <div className="tienda-resumen-det">
                    <strong>{item.nombre}</strong>
                    <span>
                      {item.cantidad} × {moneda.format(item.precioUnitario)}
                    </span>
                  </div>
                  <div className="tienda-resumen-item-total">
                    {moneda.format(item.subtotal)}
                  </div>
                </li>
              ))}
            </ul>

            <div className="tienda-resumen-lineas">
              <div className="tienda-resumen-linea">
                <span>Subtotal ({items.length} productos):</span>
                <strong>{moneda.format(total)}</strong>
              </div>

              <div className="tienda-resumen-linea">
                <span>Modalidad de entrega:</span>
                <span className="tienda-resumen-tag">
                  {tipo === 'retiro' ? 'Retiro en sucursal' : 'Envío a obra'}
                </span>
              </div>

              <div className="tienda-resumen-linea">
                <span>Costo de envío:</span>
                <strong className="tienda-envio-gratis">Gratis</strong>
              </div>

              <div className="tienda-resumen-linea tienda-resumen-total">
                <span>Total a pagar:</span>
                <strong className="tienda-total-final">{moneda.format(total)}</strong>
              </div>
            </div>

            <Button
              type="button"
              className="tienda-btn-confirmar-pago"
              loading={cargando}
              loadingLabel="Reservando stock y creando pago…"
              disabled={tipo === 'envio' && !domicilioId}
              onClick={confirmar}
            >
              <CreditCard size={18} />
              Confirmar pedido y pagar
            </Button>

            <div className="tienda-resumen-garantias">
              <div className="tienda-garantia-item">
                <Lock size={15} />
                <span>Transacción segura y encriptada (SSL 256 bits)</span>
              </div>
              <div className="tienda-garantia-item">
                <Clock size={15} />
                <span>Reserva de stock en tiempo real por 60 min</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
