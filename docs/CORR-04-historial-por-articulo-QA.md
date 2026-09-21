# CORR-04 - Historial de movimientos por artículo

Casos preparados para cargar en `CasosdePruebaSprint2QA.xlsx`. El archivo no está versionado en el repositorio.

| Caso | Acción | Resultado esperado |
| --- | --- | --- |
| CORR-04-01 | Abrir Stock por depósito con artículos cargados. | Cada fila muestra un botón con ícono de historial y etiqueta accesible del artículo. |
| CORR-04-02 | Aplicar búsqueda/filtros/paginación en Stock y abrir el historial de un artículo. | El historial se abre en un modal separado, sin mezclar movimientos en la grilla general. |
| CORR-04-03 | Revisar un artículo con ingresos y egresos confirmados. | Cada fila del modal muestra fecha, tipo Ingreso/Egreso, depósito, cantidad y stock resultante. |
| CORR-04-04 | Comparar el primer movimiento del modal con el stock físico de la grilla. | El stock resultante del movimiento más reciente coincide exactamente con el stock actual mostrado. |
| CORR-04-05 | Cerrar el modal con el botón, Escape o clic fuera. | El listado general de Stock conserva depósito, búsqueda, página y resultados previos. |
| CORR-04-06 | Abrir el historial de un artículo sin movimientos confirmados. | Se muestra un estado vacío claro, no una grilla en blanco. |
| CORR-04-07 | Registrar en un solo movimiento dos artículos en depósito Centro, Cemento Portland y otro artículo, 10 unidades cada uno. | Al abrir el historial de Cemento Portland solo aparecen sus movimientos y el stock resultante refleja esas 10 unidades, sin renglones del otro artículo. |
