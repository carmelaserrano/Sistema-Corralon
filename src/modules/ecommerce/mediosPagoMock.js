export const MEDIOS_PAGO_MOCK = {
  tarjeta: 'Tarjeta',
  mercado_pago: 'Mercado Pago',
  transferencia: 'Transferencia bancaria',
}

// Las referencias nuevas incluyen el medio. La referencia histórica mock:UUID
// corresponde al único método que ofrecía la tienda: tarjeta.
export function medioPagoPedido(pedido) {
  const referencia = pedido?.referencia_pago || ''
  const partes = referencia.split(':')
  if (partes[0] !== 'mock') return 'No informado'
  if (partes.length === 2 && partes[1]) return MEDIOS_PAGO_MOCK.tarjeta
  return MEDIOS_PAGO_MOCK[partes[1]] || 'No informado'
}
