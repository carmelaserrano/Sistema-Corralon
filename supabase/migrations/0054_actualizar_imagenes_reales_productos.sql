-- ============================================================================
-- 0054_actualizar_imagenes_reales_productos.sql
-- Actualiza las imágenes del catálogo e-commerce a fotografías reales de estudio
-- y agrega productos adicionales de corralón con stock y precios.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. ACTUALIZAR PRODUCTOS EXISTENTES CON FOTOS REALES DE PRODUCTO
-- ----------------------------------------------------------------------------

-- Cemento Portland Loma Negra CPC 40 x50kg
update public.productos
set imagen_url = '/productos/cemento-portland.jpg'
where sku = 'ART-000001';

-- Cemento Holcim Fuerte CPC 40 x50kg
update public.productos
set imagen_url = '/productos/cemento-portland.jpg'
where sku = 'COR-CEM-001';

-- Cal aérea hidratada Milagro x25kg
update public.productos
set imagen_url = '/productos/cal-hidratada.jpg'
where sku = 'QA14-04';

-- Arena fina lavada de río (Bolsón 1m³)
update public.productos
set imagen_url = '/productos/arena-fina-bolson.jpg'
where sku = 'QA14-01';

-- Arena gruesa seleccionada (Bolsón 1m³)
update public.productos
set imagen_url = '/productos/arena-fina-bolson.jpg'
where sku = 'COR-ARI-001';

-- Ripio común de río para hormigón (Bolsón 1m³)
update public.productos
set imagen_url = '/productos/ripio-bolson.jpg'
where sku = 'COR-ARI-002';

-- Pedregullo partido 6-20mm para losas (m³)
update public.productos
set imagen_url = '/productos/ripio-bolson.jpg'
where sku = 'COR-ARI-003';

-- Ladrillo cerámico hueco 12x18x33 (6 tubos)
update public.productos
set imagen_url = '/productos/ladrillo-hueco-12.jpg'
where sku = 'QA14-02';

-- Ladrillo cerámico hueco 8x18x33 (4 tubos)
update public.productos
set imagen_url = '/productos/ladrillo-hueco-12.jpg'
where sku = 'COR-LAD-001';

-- Ladrillo cerámico hueco 18x18x33 (9 tubos portante)
update public.productos
set imagen_url = '/productos/ladrillo-hueco-12.jpg'
where sku = 'COR-LAD-002';

-- Ladrillo común macizo de campo (Mil)
update public.productos
set imagen_url = '/productos/ladrillo-comun.jpg'
where sku = 'COR-LAD-003';

-- Bloque de hormigón vibrado 20x20x40
update public.productos
set imagen_url = '/productos/bloque-hormigon.jpg'
where sku = 'COR-LAD-004';

-- Hierro conformado ADN 420 8mm x 12m
update public.productos
set imagen_url = '/productos/hierro-conformado.jpg'
where sku = 'QA14-05';

-- Hierro conformado ADN 420 6mm x 12m
update public.productos
set imagen_url = '/productos/hierro-conformado.jpg'
where sku = 'COR-HIE-001';

-- Hierro conformado ADN 420 10mm x 12m
update public.productos
set imagen_url = '/productos/hierro-conformado.jpg'
where sku = 'COR-HIE-002';

-- Hierro conformado ADN 420 12mm x 12m
update public.productos
set imagen_url = '/productos/hierro-conformado.jpg'
where sku = 'COR-HIE-003';

-- Malla electrosoldada SIMA 15x15 (4,2mm) 2x3m
update public.productos
set imagen_url = '/productos/malla-sima.jpg'
where sku = 'COR-HIE-004';

-- Alambre de fardo recocido dulce Nº 16 x1kg
update public.productos
set imagen_url = '/productos/hierro-conformado.jpg'
where sku = 'COR-HIE-005';

-- Membrana asfáltica con aluminio 4mm x 10m²
update public.productos
set imagen_url = '/productos/membrana-aluminio.jpg'
where sku = 'QA14-03';

-- Hidrófugo inorgánico concentrado Ceresita x20kg
update public.productos
set imagen_url = '/productos/ceresita-hidrofugo.jpg'
where sku = 'COR-TEC-001';

-- Pintura asfáltica secado rápido 18L Megaflex
update public.productos
set imagen_url = '/productos/ceresita-hidrofugo.jpg'
where sku = 'COR-TEC-002';

-- Membrana geotextil transitable 4mm x 10m²
update public.productos
set imagen_url = '/productos/membrana-aluminio.jpg'
where sku = 'COR-TEC-003';

-- Adhesivo Klaukol Impermeable Potenciado x30kg
update public.productos
set imagen_url = '/productos/klaukol-adhesivo.jpg'
where sku = 'COR-ADH-001';

-- Pastina Klaukol Alta Performance x5kg Blanco
update public.productos
set imagen_url = '/productos/klaukol-adhesivo.jpg'
where sku = 'COR-ADH-002';

-- Látex profesional interior/exterior blanco 20L
update public.productos
set imagen_url = '/productos/pintura-latex.jpg'
where sku = 'QA14-06';

-- Clavos punta París 2 1/2 pulgada x 1kg
update public.productos
set imagen_url = '/productos/hierro-conformado.jpg'
where sku = 'COR-FER-001';

-- Fijador al aguarrás concentrado para muros 4L
update public.productos
set imagen_url = '/productos/pintura-latex.jpg'
where sku = 'COR-FER-002';

-- ----------------------------------------------------------------------------
-- 2. INSERTAR NUEVOS PRODUCTOS DE CORRALÓN COMPLEMENTARIOS
-- ----------------------------------------------------------------------------
insert into public.productos (sku, nombre, descripcion, categoria_id, marca_id, unidad_medida_id, imagen_url, publicado_web, estado_producto)
values
  (
    'COR-ARI-004',
    'Arena fina limpia en bolsa fraccionada x25kg',
    'Arena fina limpia y tamizada para reparaciones menores de revoques finos y colocación de mosaicos. Bolsa resistente de 25 kg para fácil traslado en baúl.',
    (select id from public.categorias where nombre = 'Áridos y Suelos'),
    (select id from public.marcas where nombre = 'Áridos del Valle'),
    (select id from public.unidades_medida where nombre = 'Bolsa'),
    '/productos/arena-fina-bolson.jpg',
    true,
    'activo'
  ),
  (
    'COR-CEM-002',
    'Cemento de albañilería Plasticor x40kg',
    'Ligante hidráulico para morteros de albañilería, contrapisos, carpetas y revoques. Mayor plasticidad y menor fisuración. Bolsa de 40 kg Loma Negra.',
    (select id from public.categorias where nombre = 'Cementos y Cales'),
    (select id from public.marcas where nombre = 'Loma Negra'),
    (select id from public.unidades_medida where nombre = 'Bolsa'),
    '/productos/cemento-portland.jpg',
    true,
    'activo'
  ),
  (
    'COR-CEM-003',
    'Cal viva en terrón seleccionada x25kg',
    'Cal viva de alto rendimiento para apagar en obra o blanqueo de muros rústicos. Elevada reactividad y blancura. Bolsa de 25 kg.',
    (select id from public.categorias where nombre = 'Cementos y Cales'),
    (select id from public.marcas where nombre = 'Cal Milagro'),
    (select id from public.unidades_medida where nombre = 'Bolsa'),
    '/productos/cal-hidratada.jpg',
    true,
    'activo'
  ),
  (
    'COR-HIE-006',
    'Hierro conformado ADN 420 16mm x 12m',
    'Barra de acero laminada en caliente de 16mm para bases pesadas, plateas de fundación, pilotes y columnas principales. Acero Acindar norma IRAM.',
    (select id from public.categorias where nombre = 'Hierros y Mallas'),
    (select id from public.marcas where nombre = 'Acindar'),
    (select id from public.unidades_medida where nombre = 'Barra'),
    '/productos/hierro-conformado.jpg',
    true,
    'activo'
  ),
  (
    'COR-HIE-007',
    'Malla electrosoldada SIMA pesada 15x15 (6,0mm) 2x3m',
    'Malla de alta resistencia estructural con barras de 6mm y cuadrícula 15x15cm. Apta para losas transitables, rampas vehiculares y pavimentos industriales.',
    (select id from public.categorias where nombre = 'Hierros y Mallas'),
    (select id from public.marcas where nombre = 'Acindar'),
    (select id from public.unidades_medida where nombre = 'Unidad'),
    '/productos/malla-sima.jpg',
    true,
    'activo'
  ),
  (
    'COR-LAD-005',
    'Ladrillo cerámico hueco 18x19x33 portante termoarcilla',
    'Ladrillo cerámico con tabiques reforzados para muros portantes y exteriores de máxima aislación térmica y acústica. Medida 18x19x33 cm.',
    (select id from public.categorias where nombre = 'Ladrillos y Bloques'),
    (select id from public.marcas where nombre = 'Cerámica Palmar'),
    (select id from public.unidades_medida where nombre = 'Unidad'),
    '/productos/ladrillo-hueco-12.jpg',
    true,
    'activo'
  ),
  (
    'COR-LAD-006',
    'Bloque de hormigón 10x20x40 para tabiques',
    'Bloque de cemento vibrado de 10 cm de espesor para tabiquería interna liviana y cerramientos resistentes al fuego.',
    (select id from public.categorias where nombre = 'Ladrillos y Bloques'),
    (select id from public.marcas where nombre = 'Cerámica Salta'),
    (select id from public.unidades_medida where nombre = 'Unidad'),
    '/productos/bloque-hormigon.jpg',
    true,
    'activo'
  ),
  (
    'COR-ADH-003',
    'Adhesivo Klaukol Porcellanato Flex x30kg',
    'Mezcla adhesiva flexible de ligantes mixtos y polímeros para colocación de piezas de baja absorción y grandes formatos en pisos y muros. Bolsa 30 kg.',
    (select id from public.categorias where nombre = 'Adhesivos y Pastinas'),
    (select id from public.marcas where nombre = 'Klaukol'),
    (select id from public.unidades_medida where nombre = 'Bolsa'),
    '/productos/klaukol-adhesivo.jpg',
    true,
    'activo'
  ),
  (
    'COR-TEC-004',
    'Membrana autoadhesiva con aluminio 15cm x 10m',
    'Banda bituminosa autoadhesiva con lámina de aluminio flexible para sellado inmediato de grietas, uniones de cumbreras, zinguería y claraboyas.',
    (select id from public.categorias where nombre = 'Techados e Impermeabilización'),
    (select id from public.marcas where nombre = 'Megaflex'),
    (select id from public.unidades_medida where nombre = 'Rollo'),
    '/productos/membrana-aluminio.jpg',
    true,
    'activo'
  ),
  (
    'COR-FER-003',
    'Impermeabilizante fibrado para techos rojo 20L',
    'Membrana líquida acrílica elastomérica formulada con fibras sintéticas incorporadas para puentear fisuras y proteger terrazas transitables. Balde 20 litros.',
    (select id from public.categorias where nombre = 'Techados e Impermeabilización'),
    (select id from public.marcas where nombre = 'Tersuave'),
    (select id from public.unidades_medida where nombre = 'Litro'),
    '/productos/pintura-latex.jpg',
    true,
    'activo'
  )
on conflict (sku) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  categoria_id = excluded.categoria_id,
  marca_id = excluded.marca_id,
  unidad_medida_id = excluded.unidad_medida_id,
  imagen_url = excluded.imagen_url,
  publicado_web = true,
  estado_producto = 'activo';

-- ----------------------------------------------------------------------------
-- 3. ASIGNAR PRECIOS EN LISTA "General" PARA LOS PRODUCTOS NUEVOS
-- ----------------------------------------------------------------------------
insert into public.precios_lista (lista_precio_id, producto_id, precio)
select
  (select id from public.listas_precio where nombre = 'General'),
  p.id,
  case p.sku
    when 'COR-ARI-004' then 2800.00
    when 'COR-CEM-002' then 8400.00
    when 'COR-CEM-003' then 5200.00
    when 'COR-HIE-006' then 44500.00
    when 'COR-HIE-007' then 49000.00
    when 'COR-LAD-005' then 1150.00
    when 'COR-LAD-006' then 1100.00
    when 'COR-ADH-003' then 22900.00
    when 'COR-TEC-004' then 18900.00
    when 'COR-FER-003' then 74500.00
    else 5000.00
  end as precio
from public.productos p
where p.sku in (
  'COR-ARI-004', 'COR-CEM-002', 'COR-CEM-003',
  'COR-HIE-006', 'COR-HIE-007',
  'COR-LAD-005', 'COR-LAD-006',
  'COR-ADH-003', 'COR-TEC-004', 'COR-FER-003'
)
on conflict (lista_precio_id, producto_id) do update set
  precio = excluded.precio;

-- ----------------------------------------------------------------------------
-- 4. ASIGNAR STOCK EN DEPÓSITO E-COMMERCE
-- ----------------------------------------------------------------------------
insert into public.stock_x_deposito (producto_id, deposito_id, cantidad, comprometido)
select
  p.id,
  coalesce(
    (select (pv.valor ->> 'deposito_id')::uuid from public.parametros_ventas pv where pv.clave = 'deposito_ecommerce'),
    (select d.id from public.depositos d order by d.created_at limit 1)
  ) as deposito_id,
  case p.sku
    when 'COR-ARI-004' then 120
    when 'COR-CEM-002' then 150
    when 'COR-CEM-003' then 80
    when 'COR-HIE-006' then 90
    when 'COR-HIE-007' then 60
    when 'COR-LAD-005' then 950
    when 'COR-LAD-006' then 700
    when 'COR-ADH-003' then 110
    when 'COR-TEC-004' then 40
    when 'COR-FER-003' then 35
    else 50
  end as cantidad,
  0 as comprometido
from public.productos p
where p.sku in (
  'COR-ARI-004', 'COR-CEM-002', 'COR-CEM-003',
  'COR-HIE-006', 'COR-HIE-007',
  'COR-LAD-005', 'COR-LAD-006',
  'COR-ADH-003', 'COR-TEC-004', 'COR-FER-003'
)
on conflict (producto_id, deposito_id) do update set
  cantidad = excluded.cantidad,
  comprometido = 0;

commit;
