// Ejecutar desde la raíz: npm install --prefix .temp/recepcion-db --no-save --ignore-scripts @electric-sql/pglite
// Luego: node scripts/probar-recepcion-oc.mjs. Base efímera, sin conexión a Supabase.
import { PGlite } from '../.temp/recepcion-db/node_modules/@electric-sql/pglite/dist/index.js'
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => (await q(sql, params))[0]
const reject = async (sql, params, pattern) => assert.rejects(() => q(sql, params), pattern)
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
  create table auth.users(id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  grant usage on schema public,auth to authenticated,anon;
  alter default privileges in schema public grant all on tables to authenticated,anon;
  alter default privileges in schema public grant all on sequences to authenticated,anon;`)
  for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    // gen_random_uuid() es nativa en PostgreSQL; WASM no necesita pgcrypto para estas migraciones.
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/create extension if not exists "pgcrypto";/ig, ''))
  }
  console.log('OK: todas las migraciones aplicadas')
  const user = (await one('insert into auth.users values (gen_random_uuid(), $1) returning id', ['qa@example.test'])).id
  await q("select set_config('request.jwt.claim.sub',$1,false)", [user])
  await q(`select set_config('request.jwt.claims','{"app_metadata":{"rol":"admin"}}',false)`)
  const dep = (await one('select id from depositos limit 1')).id
  const prov = (await one(`insert into proveedores(razon_social,cuit,condicion_fiscal) values ('Prueba recepción','20329642330','responsable_inscripto') returning id`)).id
  const unit = (await one("insert into unidades_medida(nombre,abreviatura) values ('Unidad QA','uqa') returning id")).id
  const cat = (await one("insert into categorias(nombre) values ('Categoría QA') returning id")).id
  const marca = (await one("insert into marcas(nombre) values ('Marca QA') returning id")).id
  const producto = async (sku) => (await one(`insert into productos(sku,nombre,unidad_medida_id,categoria_id,marca_id) values ($1,$1,$2,$3,$4) returning id`, [sku,unit,cat,marca])).id
  const p1 = await producto('QA-REC-1'), p2 = await producto('QA-REC-2')
  const oc = (await one('insert into ordenes_compra(proveedor_id,deposito_destino_id) values ($1,$2) returning id',[prov,dep])).id
  const d1 = (await one('insert into detalle_orden_compra(orden_compra_id,producto_id,cantidad,precio_unitario) values ($1,$2,10,120) returning id',[oc,p1])).id
  const d2 = (await one('insert into detalle_orden_compra(orden_compra_id,producto_id,cantidad,precio_unitario) values ($1,$2,5,80) returning id',[oc,p2])).id
  const sql = 'select * from registrar_recepcion_oc($1,$2,$3::jsonb,$4)'
  const args = (items, order = oc) => [order,dep,JSON.stringify(items),null]
  const item = (id, cantidad) => ({ orden_compra_detalle_id:id, cantidad })
  await db.exec('set role authenticated')
  assert.equal((await one('select estado from ordenes_compra where id=$1',[oc])).estado,'pendiente')
  assert.equal(Number((await one('select cantidad_recibida from detalle_orden_compra where id=$1',[d1])).cantidad_recibida),0)
  for (const cantidad of [-1, 1.5, 'NaN']) await reject(sql,args([item(d1,cantidad)]),/entero/)
  await reject(sql,args([item(d1,0)]),/Debe recibir al menos un producto/)
  await reject(sql,args([item(d1,11)]),/máxima.*10/)
  await reject(sql,args([item(d1,1),item(d1,1)]),/repetir/)
  await reject(sql,args([item(p1,1)]),/no pertenece/)
  await reject(sql,args([item(d1,1)],null),/obligatoria/)
  console.log('OK: OC obligatoria, renglones, enteros, ceros y máximos')
  const rec = await one(sql,args([item(d1,4),item(d2,0)]))
  assert.equal(rec.estado_recepcion,'confirmada')
  assert.equal(rec.created_by,user); assert.equal(rec.updated_by,user)
  assert.ok(rec.confirmado_at); assert.ok(rec.numero)
  assert.equal((await one('select estado from ordenes_compra where id=$1',[oc])).estado,'parcialmente_recibida')
  assert.equal(Number((await one('select cantidad_recibida from detalle_orden_compra where id=$1',[d1])).cantidad_recibida),4)
  assert.equal(Number((await one('select cantidad from stock_x_deposito where producto_id=$1 and deposito_id=$2',[p1,dep])).cantidad),4)
  assert.equal(Number((await one('select costo_unitario from detalle_recepcion where recepcion_id=$1',[rec.id])).costo_unitario),120)
  assert.equal(Number((await one('select count(*) as n from facturas_proveedor')).n),0)
  await reject(sql,args([item(d1,7)]),/máxima.*6/)
  console.log('OK: parcial, costo OC, stock, auditoría, sin factura y máximo actualizado')
  await reject('update recepciones set observaciones=$1 where id=$2',['alterado',rec.id],/permission denied/)
  await reject('delete from recepciones where id=$1',[rec.id],/permission denied/)
  await reject('select * from confirmar_recepcion($1)',[rec.id],/permission denied/)
  await db.exec('reset role')
  await reject('update recepciones set observaciones=$1 where id=$2',['alterado',rec.id],/no puede editarse/)
  await reject('delete from detalle_recepcion where recepcion_id=$1',[rec.id],/no puede editarse/)
  console.log('OK: permisos e inmutabilidad de cabecera y detalle')
  // Falla inducida luego de escribir stock: toda la recepción debe revertirse.
  await db.exec(`create function qa_falla() returns trigger language plpgsql as $$ begin raise exception 'Fallo inducido'; end $$;
  create trigger qa_falla before insert on detalle_movimiento for each row execute function qa_falla(); set role authenticated;`)
  await reject(sql,args([item(d1,1)]),/Fallo inducido/)
  assert.equal(Number((await one('select cantidad from stock_x_deposito where producto_id=$1 and deposito_id=$2',[p1,dep])).cantidad),4)
  assert.equal(Number((await one('select count(*) as n from recepciones')).n),1)
  assert.equal(Number((await one('select cantidad_recibida from detalle_orden_compra where id=$1',[d1])).cantidad_recibida),4)
  await db.exec('reset role; drop trigger qa_falla on detalle_movimiento; set role authenticated;')
  console.log('OK: rollback de recepción, stock y OC ante un fallo intermedio')
  const total = await one(sql,args([item(d1,6),item(d2,5)]))
  assert.notEqual(total.numero,rec.numero)
  assert.equal((await one('select estado from ordenes_compra where id=$1',[oc])).estado,'recibida')
  assert.equal(Number((await one('select cantidad from stock_x_deposito where producto_id=$1 and deposito_id=$2',[p1,dep])).cantidad),10)
  assert.equal(Number((await one('select count(*) as n from detalle_movimiento where movimiento_id=$1',[total.movimiento_ingreso_id])).n),2)
  await reject(sql,args([item(d1,1)]),/Pendiente o Parcial/)
  await q(`select set_config('request.jwt.claims','{}',false)`)
  await reject(sql,args([item(d1,1)]),/No tiene permiso/)
  console.log('OK: total, numeración única, ingreso por producto, OC recibida y acceso denegado')
} finally { await db.close() }
