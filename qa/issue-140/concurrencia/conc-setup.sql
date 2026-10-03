insert into auth.users values ('00000000-0000-0000-0000-0000000000a1','a@x'), ('00000000-0000-0000-0000-0000000000a2','b@x');
insert into usuarios_internos(usuario_id,nombre) values ('00000000-0000-0000-0000-0000000000a1','A'),('00000000-0000-0000-0000-0000000000a2','B');
insert into productos(id,sku,nombre,unidad_medida_id,categoria_id,marca_id)
 select '00000000-0000-0000-0000-00000000b001','CONC-1','CONC-1',(select id from unidades_medida limit 1),(select id from categorias limit 1),(select id from marcas limit 1);
insert into precios_lista(lista_precio_id,producto_id,precio)
 select id,'00000000-0000-0000-0000-00000000b001',100 from listas_precio where nombre='General';
insert into precios_lista(lista_precio_id,producto_id,precio)
 select distinct lista_precio_id,'00000000-0000-0000-0000-00000000b001',100 from tipos_cliente tc join clientes c on c.tipo_cliente_id=tc.id
 where c.numero_documento='30111222' and lista_precio_id not in (select id from listas_precio where nombre='General');
insert into stock_x_deposito(producto_id,deposito_id,cantidad,comprometido)
 select '00000000-0000-0000-0000-00000000b001',(select id from depositos order by nombre limit 1),1,0;
