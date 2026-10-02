-- ============================================================================
-- 0053_catalogo_corralon_productos_reales.sql
-- Amplía y profesionaliza el catálogo del e-commerce con rubros, marcas,
-- descripciones técnicas e imágenes de alta calidad para corralón.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. UNIDADES DE MEDIDA ADICIONALES
-- ----------------------------------------------------------------------------
insert into public.unidades_medida (nombre, abreviatura)
values
  ('Bolsa', 'bol'),
  ('Metro cúbico', 'm3'),
  ('Unidad', 'un'),
  ('Barra', 'bar'),
  ('Kilogramo', 'kg'),
  ('Litro', 'L'),
  ('Rollo', 'rol'),
  ('Mil', 'mil')
on conflict (nombre) do nothing;

-- ----------------------------------------------------------------------------
-- 2. CATEGORÍAS REALES DE CORRALÓN
-- ----------------------------------------------------------------------------
insert into public.categorias (nombre)
values
  ('Áridos y Suelos'),
  ('Cementos y Cales'),
  ('Hierros y Mallas'),
  ('Ladrillos y Bloques'),
  ('Techados e Impermeabilización'),
  ('Adhesivos y Pastinas'),
  ('Ferretería de Obra y Pinturas')
on conflict (nombre) do nothing;

-- ----------------------------------------------------------------------------
-- 3. MARCAS COMERCIALES LÍDERES
-- ----------------------------------------------------------------------------
insert into public.marcas (nombre)
values
  ('Loma Negra'),
  ('Holcim'),
  ('Acindar'),
  ('Cerámica Palmar'),
  ('Cerámica Salta'),
  ('Klaukol'),
  ('Sika'),
  ('Megaflex'),
  ('Tersuave'),
  ('Cal Milagro'),
  ('Áridos del Valle')
on conflict (nombre) do nothing;

-- ----------------------------------------------------------------------------
-- 4. DESPUBLICAR PRODUCTOS DE PRUEBA DUPLICADOS O INCOMPLETOS
-- ----------------------------------------------------------------------------
update public.productos
set publicado_web = false
where sku in ('ART-000004', 'ART-000005', 'QA-S3-18-001', 'QA14-08', 'QA14-07')
  and publicado_web is distinct from false;

-- ----------------------------------------------------------------------------
-- 5. ACTUALIZAR PRODUCTOS EXISTENTES CON DATOS, FOTOS Y CATEGORÍAS REALES
-- ----------------------------------------------------------------------------

-- ART-000001: Cemento Loma Negra CPC 40 x50kg
update public.productos
set
  nombre = 'Cemento Portland Loma Negra CPC 40 x50kg',
  descripcion = 'Cemento Portland de alta resistencia inicial y durabilidad para estructuras de hormigón armado, fundaciones, losas, columnas y contrapisos. Bolsa de 50 kg.',
  categoria_id = (select id from public.categorias where nombre = 'Cementos y Cales'),
  marca_id = (select id from public.marcas where nombre = 'Loma Negra'),
  unidad_medida_id = (select id from public.unidades_medida where nombre = 'Bolsa'),
  imagen_url = 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=600&q=80',
  publicado_web = true
where sku = 'ART-000001';

-- QA14-01: Arena fina lavada
update public.productos
set
  nombre = 'Arena fina lavada de río (Bolsón 1m³)',
  descripcion = 'Arena fina seleccionada y lavada libre de impurezas para revoques finos, enlucidos y terminaciones de albañilería. Bolsón Big Bag de 1 m³ para descarga con hidrogrúa en obra.',
  categoria_id = (select id from public.categorias where nombre = 'Áridos y Suelos'),
  marca_id = (select id from public.marcas where nombre = 'Áridos del Valle'),
  unidad_medida_id = (select id from public.unidades_medida where nombre = 'Metro cúbico'),
  imagen_url = 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
  publicado_web = true
where sku = 'QA14-01';

-- QA14-02: Ladrillo hueco 12x18x33
update public.productos
set
  nombre = 'Ladrillo cerámico hueco 12x18x33 (6 tubos)',
  descripcion = 'Ladrillo cerámico no portante para tabiques divisorios y cerramientos exteriores con cámara de aire. Medidas 12x18x33 cm. Rinde 15 unidades por m².',
  categoria_id = (select id from public.categorias where nombre = 'Ladrillos y Bloques'),
  marca_id = (select id from public.marcas where nombre = 'Cerámica Palmar'),
  unidad_medida_id = (select id from public.unidades_medida where nombre = 'Unidad'),
  imagen_url = 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=600&q=80',
  publicado_web = true
where sku = 'QA14-02';

-- QA14-03: Membrana asfáltica 4mm
update public.productos
set
  nombre = 'Membrana asfáltica con aluminio 4mm x 10m²',
  descripcion = 'Membrana impermeabilizante elaborada con asfalto plástico y lámina de aluminio continuo de 40 micrones para cubiertas no transitables y techos planos o inclinados. Rollo de 10 m². Megaflex.',
  categoria_id = (select id from public.categorias where nombre = 'Techados e Impermeabilización'),
  marca_id = (select id from public.marcas where nombre = 'Megaflex'),
  unidad_medida_id = (select id from public.unidades_medida where nombre = 'Rollo'),
  imagen_url = 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=80',
  publicado_web = true
where sku = 'QA14-03';

-- QA14-04: Cal hidratada 25kg
update public.productos
set
  nombre = 'Cal aérea hidratada Milagro x25kg',
  descripcion = 'Cal de alta pureza y finura para mezclas de albañilería, revoque grueso y fino, y colocación de mampostería. Mayor plasticidad y adherencia. Bolsa de 25 kg.',
  categoria_id = (select id from public.categorias where nombre = 'Cementos y Cales'),
  marca_id = (select id from public.marcas where nombre = 'Cal Milagro'),
  unidad_medida_id = (select id from public.unidades_medida where nombre = 'Bolsa'),
  imagen_url = 'https://images.unsplash.com/photo-1541888946425-d0fbb186f5f7?auto=format&fit=crop&w=600&q=80',
  publicado_web = true
where sku = 'QA14-04';

-- QA14-05: Hierro 8mm x 12m
update public.productos
set
  nombre = 'Hierro conformado ADN 420 8mm x 12m',
  descripcion = 'Barra de acero laminado en caliente para armaduras de hormigón armado, estribos y encadenados antisísmicos. Largo 12 metros. Acero Acindar bajo norma IRAM-IAS.',
  categoria_id = (select id from public.categorias where nombre = 'Hierros y Mallas'),
  marca_id = (select id from public.marcas where nombre = 'Acindar'),
  unidad_medida_id = (select id from public.unidades_medida where nombre = 'Barra'),
  imagen_url = 'https://images.unsplash.com/photo-1535813547-99c456a41d4a?auto=format&fit=crop&w=600&q=80',
  publicado_web = true
where sku = 'QA14-05';

-- QA14-06: Pintura látex blanca 20L
update public.productos
set
  nombre = 'Látex profesional interior/exterior blanco 20L',
  descripcion = 'Pintura al látex de máxima blancura, poder antihongos y resistencia al lavado y a la intemperie. Ideal para frentes de obra, medianeras y cielorrasos. Balde de 20 litros.',
  categoria_id = (select id from public.categorias where nombre = 'Ferretería de Obra y Pinturas'),
  marca_id = (select id from public.marcas where nombre = 'Tersuave'),
  unidad_medida_id = (select id from public.unidades_medida where nombre = 'Litro'),
  imagen_url = 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=600&q=80',
  publicado_web = true
where sku = 'QA14-06';

-- ----------------------------------------------------------------------------
-- 6. INSERTAR NUEVOS PRODUCTOS REALES DE CORRALÓN
-- ----------------------------------------------------------------------------
insert into public.productos (sku, nombre, descripcion, categoria_id, marca_id, unidad_medida_id, imagen_url, publicado_web, estado_producto)
values
  (
    'COR-ARI-001',
    'Arena gruesa seleccionada (Bolsón 1m³)',
    'Arena gruesa zarandeada especial para mezclas de hormigón estructural, contrapisos y cimientos. Bolsón Big Bag de 1m³ para descarga con grúa en vereda u obra.',
    (select id from public.categorias where nombre = 'Áridos y Suelos'),
    (select id from public.marcas where nombre = 'Áridos del Valle'),
    (select id from public.unidades_medida where nombre = 'Metro cúbico'),
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-ARI-002',
    'Ripio común de río para hormigón (Bolsón 1m³)',
    'Canto rodado y ripio zarandeado para preparación de hormigón en obra (vigas, columnas y losas). Granulometría continua. Bolsón de 1 m³.',
    (select id from public.categorias where nombre = 'Áridos y Suelos'),
    (select id from public.marcas where nombre = 'Áridos del Valle'),
    (select id from public.unidades_medida where nombre = 'Metro cúbico'),
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-ARI-003',
    'Pedregullo partido 6-20mm para losas (m³)',
    'Piedra partida granítica limpia y lavada para hormigones de alta resistencia mecánica y pavimentos. Rinde por m³.',
    (select id from public.categorias where nombre = 'Áridos y Suelos'),
    (select id from public.marcas where nombre = 'Áridos del Valle'),
    (select id from public.unidades_medida where nombre = 'Metro cúbico'),
    'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-CEM-001',
    'Cemento Holcim Fuerte CPC 40 x50kg',
    'Cemento Portland de uso general de excelente trabajabilidad y resistencia final. Especialmente formulado para fundaciones, mampostería y revoques. Bolsa de 50 kg.',
    (select id from public.categorias where nombre = 'Cementos y Cales'),
    (select id from public.marcas where nombre = 'Holcim'),
    (select id from public.unidades_medida where nombre = 'Bolsa'),
    'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-ADH-001',
    'Adhesivo Klaukol Impermeable Potenciado x30kg',
    'Mezcla adhesiva impermeable formulada para colocación de cerámicos y mosaicos en pisos y paredes interiores y exteriores. Bolsa de 30 kg.',
    (select id from public.categorias where nombre = 'Adhesivos y Pastinas'),
    (select id from public.marcas where nombre = 'Klaukol'),
    (select id from public.unidades_medida where nombre = 'Bolsa'),
    'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-ADH-002',
    'Pastina Klaukol Alta Performance x5kg Blanco',
    'Mortero cementicio coloreado impermeable y antihongos para el tomado de juntas entre cerámicos y porcelanatos de 1 a 15 mm. Bolsa de 5 kg.',
    (select id from public.categorias where nombre = 'Adhesivos y Pastinas'),
    (select id from public.marcas where nombre = 'Klaukol'),
    (select id from public.unidades_medida where nombre = 'Bolsa'),
    'https://images.unsplash.com/photo-1584467735815-f778f274e296?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-HIE-001',
    'Hierro conformado ADN 420 6mm x 12m',
    'Barra de acero nervada de 6mm para confección de estribos en columnas y vigas de hormigón. Acindar norma IRAM. Barra de 12 metros de largo.',
    (select id from public.categorias where nombre = 'Hierros y Mallas'),
    (select id from public.marcas where nombre = 'Acindar'),
    (select id from public.unidades_medida where nombre = 'Barra'),
    'https://images.unsplash.com/photo-1535813547-99c456a41d4a?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-HIE-002',
    'Hierro conformado ADN 420 10mm x 12m',
    'Barra de acero del 10 para armaduras principales de vigas, losas y encadenados estructurales. Gran límite de fluencia y ductilidad. Barra de 12 metros.',
    (select id from public.categorias where nombre = 'Hierros y Mallas'),
    (select id from public.marcas where nombre = 'Acindar'),
    (select id from public.unidades_medida where nombre = 'Barra'),
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-HIE-003',
    'Hierro conformado ADN 420 12mm x 12m',
    'Barra de acero del 12 de máxima capacidad portante para columnas de carga pesada, zapatas y fundaciones de edificios y viviendas. Barra de 12 metros.',
    (select id from public.categorias where nombre = 'Hierros y Mallas'),
    (select id from public.marcas where nombre = 'Acindar'),
    (select id from public.unidades_medida where nombre = 'Barra'),
    'https://images.unsplash.com/photo-1535813547-99c456a41d4a?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-HIE-004',
    'Malla electrosoldada SIMA 15x15 (4,2mm) 2x3m',
    'Panel de malla de alambre de acero electrosoldado de 4,2mm con cuadrícula de 15x15cm. Para contrapisos armados, veredas y losas de hormigón. Medida 2.00 x 3.00 m.',
    (select id from public.categorias where nombre = 'Hierros y Mallas'),
    (select id from public.marcas where nombre = 'Acindar'),
    (select id from public.unidades_medida where nombre = 'Unidad'),
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-HIE-005',
    'Alambre de fardo recocido dulce Nº 16 x1kg',
    'Alambre negro recocido de máxima maleabilidad para atadura rápida y segura de armaduras de hierro y estribos de encofrado. Rollo fraccionado de 1 kg.',
    (select id from public.categorias where nombre = 'Hierros y Mallas'),
    (select id from public.marcas where nombre = 'Acindar'),
    (select id from public.unidades_medida where nombre = 'Kilogramo'),
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-LAD-001',
    'Ladrillo cerámico hueco 8x18x33 (4 tubos)',
    'Ladrillo hueco de tabique liviano para panderetes interiores. Optimiza la superficie útil y reduce el peso estructural de la obra. Rinde 15 un/m².',
    (select id from public.categorias where nombre = 'Ladrillos y Bloques'),
    (select id from public.marcas where nombre = 'Cerámica Palmar'),
    (select id from public.unidades_medida where nombre = 'Unidad'),
    'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-LAD-002',
    'Ladrillo cerámico hueco 18x18x33 (9 tubos portante)',
    'Ladrillo cerámico portante para muros estructurales y medianeras. Extraordinaria aislación térmica y resistencia al fuego. Rinde 15 un/m².',
    (select id from public.categorias where nombre = 'Ladrillos y Bloques'),
    (select id from public.marcas where nombre = 'Cerámica Palmar'),
    (select id from public.unidades_medida where nombre = 'Unidad'),
    'https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-LAD-003',
    'Ladrillo común macizo de campo (Mil)',
    'Ladrillo de adobe cocido en horno tradicional para mampostería vista, cimientos corridos, parrillas y hornos de leña. Cotización por 1.000 unidades con flete.',
    (select id from public.categorias where nombre = 'Ladrillos y Bloques'),
    (select id from public.marcas where nombre = 'Cerámica Salta'),
    (select id from public.unidades_medida where nombre = 'Mil'),
    'https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-LAD-004',
    'Bloque de hormigón vibrado 20x20x40',
    'Bloque de cemento y árido vibrado de alta resistencia para muros de contención, galpones y cerramientos perimetrales de obra pesada.',
    (select id from public.categorias where nombre = 'Ladrillos y Bloques'),
    (select id from public.marcas where nombre = 'Cerámica Salta'),
    (select id from public.unidades_medida where nombre = 'Unidad'),
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-TEC-001',
    'Hidrófugo inorgánico concentrado Ceresita x20kg',
    'Aditivo hidrófugo en pasta para morteros de cemento. Bloquea la capilaridad en revoques de fachadas, sótanos, tanques de agua y capas aisladoras horizontales.',
    (select id from public.categorias where nombre = 'Techados e Impermeabilización'),
    (select id from public.marcas where nombre = 'Sika'),
    (select id from public.unidades_medida where nombre = 'Kilogramo'),
    'https://images.unsplash.com/photo-1508873696983-2df57046475a?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-TEC-002',
    'Pintura asfáltica secado rápido 18L Megaflex',
    'Imprimación asfáltica al solvente de secado ultrarrápido. Sella porosidades antes de soldar membranas y protege contra la humedad en vigas de encadenado.',
    (select id from public.categorias where nombre = 'Techados e Impermeabilización'),
    (select id from public.marcas where nombre = 'Megaflex'),
    (select id from public.unidades_medida where nombre = 'Litro'),
    'https://images.unsplash.com/photo-1508873696983-2df57046475a?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-TEC-003',
    'Membrana geotextil transitable 4mm x 10m²',
    'Membrana con alma de asfalto plástico y revestimiento exterior de geotextil de poliéster no tejido. Alta resistencia al granizo y al tránsito peatonal. Rollo 10 m².',
    (select id from public.categorias where nombre = 'Techados e Impermeabilización'),
    (select id from public.marcas where nombre = 'Megaflex'),
    (select id from public.unidades_medida where nombre = 'Rollo'),
    'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-FER-001',
    'Clavos punta París 2 1/2 pulgada x 1kg',
    'Clavos de acero trefilado con cabeza chata para encofrados de madera, tirantes de techo y clavadores de obra. Bolsa fraccionada de 1 kg.',
    (select id from public.categorias where nombre = 'Ferretería de Obra y Pinturas'),
    (select id from public.marcas where nombre = 'Acindar'),
    (select id from public.unidades_medida where nombre = 'Kilogramo'),
    'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=600&q=80',
    true,
    'activo'
  ),
  (
    'COR-FER-002',
    'Fijador al aguarrás concentrado para muros 4L',
    'Fijador sellador penetrante al solvente. Consolida revoques arenosos, tizado y enduidos garantizando adherencia y rendimiento parejo de la pintura final.',
    (select id from public.categorias where nombre = 'Ferretería de Obra y Pinturas'),
    (select id from public.marcas where nombre = 'Tersuave'),
    (select id from public.unidades_medida where nombre = 'Litro'),
    'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=600&q=80',
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
-- 7. ACTUALIZAR / ASIGNAR PRECIOS EN LISTA "General"
-- ----------------------------------------------------------------------------
insert into public.precios_lista (lista_precio_id, producto_id, precio)
select
  (select id from public.listas_precio where nombre = 'General'),
  p.id,
  case p.sku
    when 'ART-000001' then 9800.00
    when 'QA14-01' then 18500.00
    when 'QA14-02' then 680.00
    when 'QA14-03' then 46500.00
    when 'QA14-04' then 4800.00
    when 'QA14-05' then 11200.00
    when 'QA14-06' then 68000.00
    when 'COR-ARI-001' then 19500.00
    when 'COR-ARI-002' then 23000.00
    when 'COR-ARI-003' then 26500.00
    when 'COR-CEM-001' then 9750.00
    when 'COR-ADH-001' then 14200.00
    when 'COR-ADH-002' then 4600.00
    when 'COR-HIE-001' then 6400.00
    when 'COR-HIE-002' then 17500.00
    when 'COR-HIE-003' then 25300.00
    when 'COR-HIE-004' then 24800.00
    when 'COR-HIE-005' then 3200.00
    when 'COR-LAD-001' then 560.00
    when 'COR-LAD-002' then 940.00
    when 'COR-LAD-003' then 125000.00
    when 'COR-LAD-004' then 1450.00
    when 'COR-TEC-001' then 21000.00
    when 'COR-TEC-002' then 38500.00
    when 'COR-TEC-003' then 54000.00
    when 'COR-FER-001' then 3800.00
    when 'COR-FER-002' then 12800.00
    else 5000.00
  end as precio
from public.productos p
where p.sku in (
  'ART-000001', 'QA14-01', 'QA14-02', 'QA14-03', 'QA14-04', 'QA14-05', 'QA14-06',
  'COR-ARI-001', 'COR-ARI-002', 'COR-ARI-003', 'COR-CEM-001',
  'COR-ADH-001', 'COR-ADH-002',
  'COR-HIE-001', 'COR-HIE-002', 'COR-HIE-003', 'COR-HIE-004', 'COR-HIE-005',
  'COR-LAD-001', 'COR-LAD-002', 'COR-LAD-003', 'COR-LAD-004',
  'COR-TEC-001', 'COR-TEC-002', 'COR-TEC-003',
  'COR-FER-001', 'COR-FER-002'
)
on conflict (lista_precio_id, producto_id) do update set
  precio = excluded.precio;

-- ----------------------------------------------------------------------------
-- 8. ASIGNAR STOCK EN DEPÓSITO DE E-COMMERCE (DISPONIBILIDAD INMEDIATA)
-- ----------------------------------------------------------------------------
insert into public.stock_x_deposito (producto_id, deposito_id, cantidad, comprometido)
select
  p.id,
  coalesce(
    (select (pv.valor ->> 'deposito_id')::uuid from public.parametros_ventas pv where pv.clave = 'deposito_ecommerce'),
    (select d.id from public.depositos d order by d.created_at limit 1)
  ) as deposito_id,
  case p.sku
    when 'COR-LAD-001' then 1500
    when 'COR-LAD-002' then 1200
    when 'QA14-02' then 1800
    when 'COR-LAD-004' then 800
    when 'COR-LAD-003' then 25
    when 'ART-000001' then 300
    when 'COR-CEM-001' then 250
    when 'QA14-04' then 150
    when 'QA14-05' then 200
    when 'COR-HIE-001' then 250
    when 'COR-HIE-002' then 180
    when 'COR-HIE-003' then 150
    when 'COR-HIE-004' then 80
    when 'COR-HIE-005' then 120
    when 'QA14-01' then 60
    when 'COR-ARI-001' then 50
    when 'COR-ARI-002' then 45
    when 'COR-ARI-003' then 30
    else 50
  end as cantidad,
  0 as comprometido
from public.productos p
where p.sku in (
  'ART-000001', 'QA14-01', 'QA14-02', 'QA14-03', 'QA14-04', 'QA14-05', 'QA14-06',
  'COR-ARI-001', 'COR-ARI-002', 'COR-ARI-003', 'COR-CEM-001',
  'COR-ADH-001', 'COR-ADH-002',
  'COR-HIE-001', 'COR-HIE-002', 'COR-HIE-003', 'COR-HIE-004', 'COR-HIE-005',
  'COR-LAD-001', 'COR-LAD-002', 'COR-LAD-003', 'COR-LAD-004',
  'COR-TEC-001', 'COR-TEC-002', 'COR-TEC-003',
  'COR-FER-001', 'COR-FER-002'
)
on conflict (producto_id, deposito_id) do update set
  cantidad = excluded.cantidad,
  comprometido = 0;

commit;
