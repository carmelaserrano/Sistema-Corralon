import assert from 'node:assert/strict'

// Usado por probar-recepcion-oc.mjs sobre su base efímera con todas las migraciones.
export async function verificarHistorialOC(db, q, one, prov, dep, oc) {
  const historial = async (estado = null, proveedor = prov, desde = '2030-01-01', hasta = '2030-01-01', orden = 'total', asc = true, pagina = 1) =>
    (await one('select consultar_historial_oc($1,$2,$3,$4,$5,$6,$7) as resultado', [estado, proveedor, desde, hasta, orden, asc, pagina])).resultado
  const recepcion = (await historial(null, prov, null, null)).ordenes.find(o => o.id === oc)
  assert.equal(recepcion.cantidad_recepciones, 2)
  await q(`insert into ordenes_compra(proveedor_id,deposito_destino_id,total,created_at)
    select $1,$2,n,'2030-01-01 12:00:00+00'::timestamptz + n * interval '1 second' from generate_series(1,21) n`, [prov, dep])
  await q(`insert into ordenes_compra(proveedor_id,deposito_destino_id,total,created_at,estado,cancelado_by,motivo_cancelacion)
    values ($1,$2,999,'2030-01-01 13:00:00+00','cancelada',auth.uid(),'Prueba QA')`, [prov, dep])
  await q(`insert into ordenes_compra(proveedor_id,deposito_destino_id,total,created_at) values
    ($1,$2,7,'2030-01-02 02:59:59.999999+00'),
    ($1,$2,8,'2030-01-02 03:00:00+00'),
    ($1,$2,9,'2030-01-01 02:59:59+00')`, [prov, dep])
  const primera = await historial()
  const segunda = await historial(null, prov, '2030-01-01', '2030-01-01', 'total', true, 2)
  assert.equal(primera.total, 23)
  assert.equal(primera.importeTotal, 238)
  assert.equal(segunda.importeTotal, 238)
  assert.equal(primera.totalPaginas, 2)
  assert.equal(primera.ordenes.length, 20)
  assert.equal(segunda.ordenes.length, 3)
  assert.equal(new Set([...primera.ordenes, ...segunda.ordenes].map(o => o.id)).size, 23)
  assert.equal(primera.ordenes[0].total, 1)
  assert.equal((await historial(null, prov, '2030-01-01', '2030-01-01', 'total', false)).ordenes[0].total, 999)
  assert.equal((await historial(null, prov, '2030-01-01', '2030-01-01', 'created_at', false)).ordenes[0].total, 7)
  assert.equal((await historial(null, prov, '2030-01-01', '2030-01-01', 'created_at', true)).ordenes[0].total, 1)
  const canceladas = await historial('cancelada')
  assert.equal(canceladas.total, 1)
  assert.equal(canceladas.importeTotal, 0)
  assert.equal((await historial('pendiente')).total, 22)
  const vacio = await historial(null, '00000000-0000-0000-0000-000000000000')
  assert.deepEqual(vacio, { total: 0, importeTotal: 0, totalPaginas: 1, ordenes: [] })
  await assert.rejects(() => historial(null, prov, '2030-01-02', '2030-01-01'), /inválidos/)
  await assert.rejects(() => historial(null, prov, null, null, 'no_valido'), /inválidos/)
  await assert.rejects(() => historial(null, prov, null, null, 'total', true, 0), /inválidos/)
  await db.exec(`reset role; create policy qa_historial_oc on ordenes_compra as restrictive for select to authenticated using (false); set role authenticated;`)
  assert.deepEqual(await historial(), { total: 0, importeTotal: 0, totalPaginas: 1, ordenes: [] })
  await db.exec('reset role; drop policy qa_historial_oc on ordenes_compra; set role anon;')
  await assert.rejects(() => historial(), /permission denied/)
  await db.exec('reset role; set role authenticated;')
  console.log('OK: historial, filtros combinados, fechas Argentina, 20 por página, totales sin canceladas, ordenamiento y RLS')
}
