# CLAUDE.md

Guía para Claude trabajando en este repo.

---

## 1. Qué es esto

**Desarrollo de Colecciones** — control de producción de **MG MODA S.A.S.**
(marcas Casania y Mariset). Sigue cada orden por las etapas reales del taller:
orden de corte → trazos → corte → alistamiento → talleres → ensamble →
revisión → bodega. Más costos, colecciones, fotos, programaciones y —desde
sep-2026— **cartera**.

**No confundir con `~/Desktop/software-produccionclaude-mg`**, que es el PLM
"Producción MG" (fichas técnicas, BOM, medidas). Son sistemas distintos.

**Idioma**: todo en **español de Colombia** — tuteo o infinitivo, nunca voseo
argentino ("elige"/"elegir", no "elegí"). Aplica a la interfaz, a los
comentarios y a las respuestas al usuario.

---

## 2. Stack y comandos

- **React 18 + Vite 6**, sin router: una sola vista con pestañas (`tab` en
  `App.jsx`, persistida en `localStorage`).
- **Supabase** para todo: auth, datos y realtime. No hay backend propio.
- CSS plano en un único `src/index.css` (~7.000 líneas). Sin Tailwind ni
  CSS-in-JS.

```bash
npm run dev      # http://localhost:5173  (hay .claude/launch.json)
npm run build    # verificar que compila antes de commitear
```

**El usuario NO usa localhost.** Trabaja contra
**https://desarrollo-colecciones.vercel.app**, que Vercel reconstruye en ~30 s
con cada push a `main`. Editar en el Mac no le cambia nada hasta commitear y
empujar. `/version.json` sirve para confirmar que el despliegue salió; lo
compara `NuevaVersion.jsx` para mostrar el aviso de versión nueva.

⚠️ **`public/` se sirve SIN login.** Nada con datos de clientes va ahí. Los
mockups viven en `mockups/` (raíz), que no entra al build.

---

## 3. Estructura

```
src/
  App.jsx            ← pestañas, sesión, permisos, carga de datos (~1.100 líneas)
  index.css          ← TODO el CSS
  lib/               ← 29 módulos: supabase.js, db.js, domain.js, dates.js,
                       constants.js, cartera.js, los generadores de PDF/Excel…
  components/        ← 54 componentes, una vista por pestaña
mockups/             ← HTML estáticos para iterar diseño (fuera del build)
supabase_setup.sql   ← tablas dev_*
supabase_cartera.sql ← tablas cartera_* + RLS
```

Datos en Supabase: `dev_orders`, `dev_refs`, `dev_settings`, `dev_faltantes`,
`dev_preordenes`, `dev_programaciones`, `dev_telas`, `dev_procesos`,
`dev_entradas_bodega`, `dev_disenos`, `dev_asistencia`, `dev_log` y `dev_sync`
(marcas de cambio: se escucha esa, que pesa nada, y solo se baja la tabla que
se movió). Las órdenes vienen de **Factory/MisBordados** por el sincronizador
del servidor.

---

## 4. Sistema visual

Editorial y cálido, **nada que ver con el azul del PLM**:

- Fondo `#f4f2ed`, superficie blanca, hairline `#e5e2da`, acento **negro**
  `#1c1c22`, peligro `#c0392b`. Radios 14 (tarjetas) y 9–11 (campos).
- **Fraunces sólo para títulos.** Las CIFRAS van en Inter con `tabular-nums`.
  Moneda con `formatPrice()` de `lib/constants.js` → `"$ 276.743.881"`.
- Clases a reutilizar antes de inventar: `.topbar/.tabs`, `.view-head/.view-title`,
  `.kpi-wrap/.kpi-grid/.kpi-nums/.kpi-card` (+ `.kpi-label/.kpi-cifra/
  .kpi-unidad/.kpi-desglose/.kpi-marcas`, el patrón de `AreaKpis.jsx`),
  `.table-wrap/.data-table` (`td.num` va **centrado**, `td.strong`,
  `tr.row-click`), `.searchbox`, `.flag-yes/.flag-no/.flag-warn`, `.tag`,
  `.modal-*` (con `Modal.jsx`), `SortTh.jsx`.
- **No hay drawer**: el detalle va en modal.
- **Nada de desplazamiento horizontal** en tablas ni modales (regla de Diego,
  20-sep-2026): toda la información a la vista. Antes de publicar, medir
  `scrollWidth <= clientWidth` del contenedor a 1000, 1150 y 1280 px. Para
  que quepa: `table-layout: fixed` con anchos por columna, puntos suspensivos
  en el texto largo (completo en `title`), nunca esconder cifras, y ensanchar
  el modal si hace falta (`.modal-xl:has(.dsp-densa)`).

**Gotchas del CSS:**
- `.stats-grid/.stat-card/.stat-value` están definidas pero **ningún
  componente las usa**: es CSS muerto, no el patrón del sistema.
- `.kpi-marcas` está definida **dos veces**; la primera pone `display:grid`
  con `auto-fit minmax(220px)`, así que en una tarjeta ancha se abre en
  columnas. Forzar `grid-template-columns:1fr`.
- La regla global de fuente cubre `input` pero **no `textarea`**: sin
  `font-family: inherit` salen en monoespaciada.
- Al agregar CSS, **acotarlo a una clase del módulo**. Una regla
  `.kpi-wrap .kpi-cifra{...}` alcanzaba a Corte y Por alistar sin querer.
- Las cifras de dinero son largas: medir que no se salgan de su caja **en
  varios anchos** (1000 a 2000 px) antes de dar por bueno. Chromium y Safari
  no se comportan igual con los tracks `auto` de grid.

---

## 5. Permisos

Por correo, en `App.jsx`. `esAdmin` es sólo `diego_monsalve87@hotmail.com`;
los demás ven `TABS_OPERACION` y poco más. Hay permisos finos por persona:
`puedeResolverFaltantes`, `veProgramaciones`, `puedeCorte`, `puedeBodega`,
`veAsistencia`. Una pestaña nueva que no esté en `TABS_OPERACION` queda
automáticamente sólo para el admin.

⚠️ **Esconder una pestaña NO es control de acceso.** Quien tenga sesión puede
consultar las tablas directo. Si los datos son sensibles, hay que restringirlos
también en las políticas RLS (ver el módulo de cartera).

---

## 6. Módulo Cartera (sep-2026)

Seguimiento de recaudo. Reemplazó una app aparte (`~/Desktop/cobranza-app/`,
Flask + Postgres local, puerto 5075) que quedó como respaldo sin uso real.

**Archivos**: `lib/cartera.js`, `components/CarteraView.jsx`,
`CarteraCliente.jsx`, `CarteraMensaje.jsx`, bloque "CARTERA" al final de
`index.css`, `supabase_cartera.sql`, `mockups/cartera-v1.html`.

**De dónde salen los datos**: un servidor Windows corre el sistema contable
**SYD**, genera cada 30 min un informe `.LIS` con `FACTURAS.EXE` y lo sube a
`cartera_facturas` llamando a la función `reemplazar_cartera()`. La app sólo
lee. El script vive en `E:\factorysync\cs.ps1` del servidor; su copia está en
`~/Desktop/cobranza-app/syd/cartera_sync.ps1`.

**Tablas**: `cartera_facturas` y `cartera_sync_log` (las sube el servidor);
`cartera_gestion`, `cartera_clientes`, `cartera_pagos` y
`cartera_facturas_vistas` (las escribe la app).

**Acceso restringido a UNA persona**: las seis tablas pasan por
`public.cartera_autorizado()`, que compara el correo del token contra una
lista. Para sumar a alguien se edita **esa función y nada más**. La
sincronización del servidor no se afecta porque `reemplazar_cartera()` es
`SECURITY DEFINER`. Probar RLS sin iniciar sesión, en el SQL Editor:

```sql
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","email":"..."}';
select count(*) from public.cartera_facturas;
```

**Reglas de negocio que NO se pueden cambiar a la ligera:**
- La **antigüedad se calcula a hoy desde la fecha de emisión**. La columna
  "Días" del informe viene congelada en las facturas viejas.
- Colección **1 = Madres (Ene–May)**, **2 = Diciembre (Jun–Dic)**, por la
  fecha de la factura.
- El cliente se identifica por el **nombre normalizado**: el informe del SYD
  **no trae NIT**. Cruzar la cartera con otro maestro de clientes es un
  proyecto aparte.
- La marca sale de la primera letra de la factura: **C y A = Casania,
  M y T = Mariset**.
- El informe es un **snapshot de facturas abiertas** y sólo trae los últimos
  4 pagos de cada una. Cuando un cliente termina de pagar, su historial se va
  con la factura. Por eso `unirPagos()` **archiva** los abonos en
  `cartera_pagos`, y "lo recaudado en el mes" se calcula sobre el universo
  completo, no sobre los clientes con saldo.
- **Contactos (sep-2026, reemplaza a los cuatro tipos de gestión).** La
  cartera la cobran dos personas (Diego y Kelly) **sin dueño por cliente**.
  Cada contacto es una fila de `cartera_gestion` con `tipo='contacto'`,
  `canal` (WhatsApp/Llamada/Visita) y `resultado` (sin_respuesta, promesa,
  abono, reclamo, no_llamar); si es promesa, `acuerdo_fecha`/`acuerdo_monto`.
  **Pedí al vendedor (14-sep-2026)**: cuarto botón en "Cómo"; guarda
  `canal='Vendedor'`, `resultado='vendedor'`, `remitido_a=<nombre>`
  (`VENDEDORES` en `lib/cartera.js`). El cliente queda `con_vendedor` (en
  espera); pasados `ESPERA_DIAS` sin respuesta es `vendedor_tarde` y vuelve a
  "Para llamar". La respuesta es otra fila con el resultado real, el vendedor
  como `autor` y quien la anotó en `cerrado_por`; el formulario la pide
  primero cuando el cliente está con vendedor (enlace para registrar otro
  contacto). Chip "Con vendedor" en la tabla.
  Las gestiones viejas siguen contando como contactos por su fecha
  (`resultadoDe()` en `lib/cartera.js`). Por cliente, `agrupar()` deriva
  `ult_contacto`, `dias_contacto`, `promesa` (vigente/vencida/cumplida: se
  cumple sola cuando llega un abono después de hecha), `en_espera` (contacto
  en los últimos `ESPERA_DIAS`=7 días), `para_llamar` y `no_llamar`. La lista
  abre en "Para llamar hoy" con las promesas vencidas primero. El formulario
  vive en `CarteraContacto.jsx` (`FormContacto`, `LineaContacto`) y se usa
  desde la lista (botón "Contacté") y desde el detalle del cliente.
- Un `acuerdo` viejo exige fecha; un `pendiente` viejo puede seguir
  `estado='abierta'` hasta que alguien lo marque resuelto en el detalle.

**Lo que NO se migró** (sigue sólo en cobranza-app, necesita servidor): el
correo diario de seguimiento, el reporte en PDF y la importación del
`CARTEREA.XLS`. La ★ de seguimiento se guarda pero **hoy no dispara ningún
correo**.

---

## 6b. Módulo Pedidos (sep-2026)

Lo que los clientes tienen pedido y pendiente por despachar, desde SYD.
**Fuente**: el informe "Pendientes por Clientes y Referencias" (el mismo de
*separados* que alimenta Programaciones). El servidor corre
`M:\SYD\dat\MATMG\PEDIDOS.EXE` (tarea `PedidosSyncSYD`, cada 2 min, como
SYSTEM), toma el `.LIS` de `...\MATMG\PEDIDOS`, lo parsea y lo sube con
`reemplazar_pedidos()` a `pedidos_syd` solo cuando cambió (hash). Script:
`E:\factorysync\ps.ps1`; log `pedidos_sync_log.txt`.

**Gotchas que ya costaron:** el EXE abre sus archivos por ruta desde la raíz
del disco (`\SYD\DAT\MG\...`), así que **tiene que correr con `M:` como
unidad actual** (bajo SYSTEM se crea con `subst M: E:\Programa`); si falla
saca diálogos modales COBOL y se cuelga — el script lo mata a los 100 s.
`ConvertTo-Json` con 8.000 renglones tarda más de 10 min: el JSON se arma a
mano. El `.LIS` está en código de página DOS 850 (así sale la Ñ). El
PowerShell de 64 bits necesita `Tls12` explícito para hablar con Supabase.
Cada `.LIS` pesa 12 MB y el EXE deja uno por corrida: se conservan 3.

**App**: `PedidosView.jsx` (**solo Diego**: pestaña por `vePedidos` y RLS
`pedidos_autorizado()` en `pedidos_syd`/`pedidos_sync_log`; las vistas son
`security_invoker`) lee la vista
`pedidos_syd_resumen` (un renglón por pedido) y el detalle por pedido al
abrirlo; se refresca con la marca `pedidos` de `dev_sync`.

**Pedidos especiales**: la observación de cada línea casi siempre es un
color (o "SIN CRUDO"); `lib/pedidos.js` marca como especial la que trae una
modificación (cinturón, fajón, forro, top, "1 de cada color"…) por lista de
palabras, que se amplía cuando aparezca una nueva. El detalle del cliente
muestra foto (de `dev_refs`) y observación por línea; el chip "Pedidos
especiales" filtra los clientes que tienen alguna.

**Estado de cada línea de SYD (18-sep-2026).** `pedidos_syd.estado` es una
columna generada con la regla del archivo de pendientes sobre Combin + Tipo:
`pendiente` (subtotal), `facturado`, `separado` o `vendido`. Desde ese día SYD
manda líneas con Tipo "Separado" (con pedido, color y tallas) de unidades que
TAMBIÉN están en su línea vendida: **todo lo que cuente unidades vendidas debe
filtrar `estado='vendido'`** (vista `pedidos_syd_vendido`, las vistas de
clientes/resumen, `sincronizar_programaciones()`, el detalle de Pedidos). En
Despachos lo separado y lo facturado de SYD mandan; lo manual de
`dev_despachos` solo aplica en la línea donde SYD no trae nada.

**Por referencia (19-sep-2026)**: tercera vista de Pedidos
(`PorReferenciaView.jsx`, cuentas en `lib/porReferencia.js`). Cruza la
entrada a bodega de las órdenes (`stages.entradaBodega`, sin premuestras),
el pedido de SYD y lo separado/facturado de SYD. Libre en bodega = entró −
max(separado, facturado); falta producir = pedido − entró. El conjunto toma
la entrada de la prenda que MENOS ha entrado (órdenes CONJUNTO de cada
pieza). "Revisar entrada" avisa cuando hay más separado que entrado. Al
abrir una referencia: a qué clientes se les separó y cuánto les falta.
**Libres (20-sep-2026)**: el número de "Libre en bodega" es un botón que abre
`LibresModal`: una HOJA tipo Excel (`.pr-hoja`, pedido por Diego: sencillo,
cuadrícula, sin píldoras) con un renglón por cliente y COLOR (como las líneas
de SYD; nombre, ciudad y estado con rowSpan) en bloques: Libres en bodega →
Ya separado → Se pueden separar en CURVA COMPLETA (todo o nada en esa
referencia) → Esperan → Quedarían libres; chips por bloque y buscador. El
número de la casilla es lo PEDIDO; el color dice qué pasa: azul = ya separado
en SYD, verde = se le puede separar, ámbar = se le da en otro color misma
talla (solo surtidos), rojo = no alcanza al llegar su turno (por eso espera),
blanco = sin mover. Todo sale de `calcularLibres` (`hoja`, `tallasHoja`,
`coloresHoja`). Con muchas tallas las columnas de texto se recortan, nunca
las cifras.
La primera separación es a criterio de bodega; esto trabaja sobre lo que
quedó. La curva por talla sale de lo RECIBIDO del taller por talla y color
(`curva[].ent`; desde el 20-sep-2026 el sync lo lee de
`entradas_talleres_productos_tallas`, porque `temp_terminado_taller` viene
siempre en cero — antes se creyó, mal, que Factory no lo guardaba); si la
orden no lo trae, lo cortado. En conjuntos, la menor de las dos prendas por
casilla. Regla de Diego: una MUESTRA ya entregada por el taller cuenta como
entrada aunque no tenga entrada a bodega digitada (`entradaDeOrden`); las
demás órdenes entregadas sin entrada solo salen como aviso. Turno: ★ (`prioridad` en `c|CLIENTE` de
`dev_despachos`) → cliente más cerca de completar su despacho → pedido más
antiguo. Surtido = referencia de varios colores y línea sin observación (le
sirve cualquier color, nunca otra talla); "SIN X" excluye ese color; otro
texto es color fijo. Avisa cuando hay más separado que entrado en una
casilla. La separación se sigue digitando en SYD. Ojo: Factory y SYD no siempre nombran igual el color
("VINO TINTO 2" = ROJO); reusar `empatarColor` de programaciones.

**Producción cerrada (21-sep-2026)**: referencia que ya no saca más lotes (el
nombre lo eligió Diego; sin motivos, "simplemente está cerrada"). Se marca en
**Programaciones**: casilla por fila → barra negra "N seleccionadas" → Cerrar
producción / Reabrir (con confirmación). Se guarda en la programación como
`cerrada: { por, at }` (`cerrarProduccion` en App.jsx; `dev_programaciones`
la escriben Diego y Ninfa, y `sincronizar_programaciones()` conserva los
campos que no son suyos). Efectos: en Programaciones la falta se tacha y sale
de "Falta por programar" (se cuenta aparte), no pide metros de tela, y hay
chip "Producción cerrada N"; App arma el Set `cerradas` y lo pasa a Pedidos:
Por referencia muestra la etiqueta, "N no sale" en Falta producir y el filtro;
Despachos trata lo pendiente como cerrado sin cubrir (`armarDespachos(filas,
registros, cerradas)`) y su menú "Cerrar producción" escribe la MISMA marca
(`onCerrarRef`), ya no `r|REF` de `dev_despachos`. Pendiente: modo "Ubicar
todo" de los libres para estas referencias (mockup libres-ubicar-todo-v1).

**Coordinadora (23-sep-2026)**: guías de despacho desde Pedidos → Despachos.
Credenciales SOLO en secretos de Supabase (`COORDINADORA_KEY/SECRET/ENV`);
la Edge Function `coordinadora` (`supabase/functions/coordinadora/index.ts`,
se despliega con la Management API `functions/deploy`) hace token, cotizar,
guía (`/suite/guias`), etiqueta y recogida; cuenta NIT 901682300, idProceso
46846, división 01; remitente fijo Mg Moda SAS, Calle 35 # 27-47 Piso 1,
Bucaramanga (DANE 68001000); solo el correo de Diego puede llamarla. Tablas:
`coord_ciudades` (DIVIPOLA, DANE+000), `coord_ciudad_syd` (ciudad SYD → DANE,
102/104), `coord_libreta` (destinatario por cliente: documento, dirección, DANE,
celular, teléfono fijo, correo, almacén; 475 filas: el maestro de clientes de
SYD `RELACION CLIENTES MG MODA SAS.XLS` (25-sep-2026) manda en documento,
DANE, celular y correo; la dirección es la del último envío de Coordinadora
si coincide con SYD y la de SYD si difiere o no hay envío — regla de Diego), `coord_guias`
(cada guía generada con lo enviado y la respuesta; trigger → stamp
'despachos'). UI (24-sep): cuarta vista de Pedidos **Guías Coordinadora** (`GuiasView.jsx`: KPIs hoy/mes/en ruta/novedad/entregadas, chips por estado, lista agrupada por día, "Nueva guía" con buscador de cliente, botón Etiqueta por fila, panel plegable de pruebas); en Despachos solo queda el atajo: columna "Guía" + botón Despachar en `DespachosView`
(`DespacharModal.jsx`): destinatario de la libreta, empaques reales
(`EMPAQUES` en lib/coordinadora.js: caja 20 kg 40×40×30 = 19,2 kg vol,
$832.000; paquete 5 kg; paquete 1 kg), cotización automática, Generar guía,
etiqueta. Falta: rastreo/novedades (sin documentación aún), recogida en UI,
celulares (se piden al primer despacho). `COORDINADORA_ENV=prod` para salir de
pruebas; el número de guía se extrae de la respuesta (11 dígitos).

**Despachos (14-sep-2026)**: segunda vista de la pestaña Pedidos
(`DespachosView.jsx`, cuentas en `lib/despachos.js`). Vendido y pendiente
salen de `pedidos_syd`; separado, facturado, referencias cerradas ("no
sale") y novedades del cliente se registran en `dev_despachos` (misma RLS
que pedidos, marca `despachos` en `dev_sync`) con ids `l|CLIENTE|REF|COLOR`,
`r|REF` y `c|CLIENTE`. Las reglas vienen del archivo de pendientes que se
llevaba en Codex (`~/Downloads/reglas_migracion_pendientes_para_claude.pdf`):
la llave es cliente + referencia + color; separado vigente = max(separado −
facturado, 0) por llave; pendiente = vendido − facturado; abierto real solo
si la referencia no está cerrada y no tiene nada facturado para ese cliente;
faltante real = separado vigente + abierto real (lo cerrado no cuenta).
El detalle del cliente es una tabla densa (una fila por referencia y
color, por marca y referencia ascendente) con buscador y chips. La celda de
cada talla dice en qué va: azul separada, verde facturada, sin color
pendiente, y se parte si la talla está repartida (`partesDe`). Ese código
de color es el mismo en todo Despachos. Las acciones van en el menú ⋯ de la
fila: "Separar por talla" abre las casillas (`sepTallas`, `factTallas` en el
registro; `separado`/`facturado` guardan el total), ficha, foto y "no sale".
El modal se ensancha solo con `.modal-xl:has(.dsp-densa)`.
Cerrar una referencia aplica a todos los clientes. Falta ver cómo manda SYD
lo facturado cuando empiecen a facturar (se espera Tipo "Facturado").

**Panel "en qué va" de una referencia (25-sep-2026)**: en el detalle del
cliente el código de la referencia es un enlace (`.dsp-ref-link`) que abre
`ProduccionPanel.jsx` (cuentas en `lib/produccionRef.js`), un panel a la
derecha por portal (`.pp-*`; Escape lo cierra a él y no a la ventana; frena
`onMouseDown` porque los eventos de React suben por el árbol y cerrarían el
modal). Sirve para contestar al cliente por teléfono: cinco cifras
(programado, cortado, entregó taller, en bodega, libres hoy); cada orden
(sin premuestras; un conjunto trae las órdenes CONJUNTO de sus dos prendas,
por pieza) con chip de etapa (`orderArea`), la ruta de 7 pasos con fechas,
cortador (`procesos[orden].corte.quien`), taller y días (rojo pasados
`DIAS_TALLER_TARDE` = 15 sin entregar), la curva por color y talla
(`corte` si hay alistamiento, si no `prog`) y lo entregado por talla
(`ent`) con las faltantes en rojo; estado de tela y movimientos abiertos de
`dev_programaciones`; libres hoy por color y talla (`calcularLibres`, mismo
número de Por referencia) cruzados con lo que ese cliente pide; y "Para
contestarle" por color: cuánto se le puede separar ya y dónde está el resto
(taller, corte, alistamiento, estampación, cerrada). Sexta cifra **Por
programar** = pedido de todos los clientes (desglose del reporte de
separados, o las líneas vendidas de SYD si no hay programación) − programado,
con la MISMA cuenta de Programaciones (`programadoDe` + `faltaPorColor`:
en un conjunto la prenda que más se cortó) y un bloque rojo por color y
talla cuando falta; negativo = "programado de más". Para eso App pasa
`programaciones` y `procesos` a Pedidos → Despachos.

**KPIs de Despachos (26-sep-2026, `KpisDespachos`)**: cuatro tarjetas con
signos entre ellas, cada una en unidades y valor a precio de lista: Vendido −
Facturado = Faltante (definición de Diego: vendido − facturado, con "N en
referencias cerradas" como nota) ⊃ Separado vigente (separado no facturado,
con "por separar" = faltante − separado); barra facturado / separado / por
separar sobre lo vendido. Valores en `totales()`: `valorVend` (total SYD),
`valorFact` y `valorSep` (unidades × precio de la línea). Las cifras viejas
(`faltante` = separado + abierto, `cerrado`, `listos`) siguen en `totales()`
para la tabla y las decisiones, ya no como tarjetas.

**Separado incompleto (26-sep-2026, `lib/faltasSeparado.js`)**: línea
(referencia + color) con algo separado en SYD y alguna talla sin separar.
`faltasSeparado(clientes, datos)` encuentra cada talla que falta y dónde está:
libre en bodega (`calcularLibres`), en taller / en corte (órdenes en camino
de `produccionDe` que traen ese color y talla), por programar
(`porProgramar` por talla), cerrada, o sin lote. En Despachos: chips
"Separado incompleto" y "Se completan ya" (`FILTROS_FALTAS`), marca "falta N
talla(s)" junto al separado, y la decisión pasa a "Falta(n) N talla(s)"
(`faltaTalla`, ámbar) o "Completar ya" (`completar`, verde) cuando todo lo
que falta está libre (`decisionConFaltas`, manda sobre flete salvo
"No despachar"/"Completo"). En la ventana del cliente, bloque
`ParaCompletar` ("Para completar lo separado") con talla, cuánto falta,
separado de la línea, dónde está y qué hacer. La lista agrupada por talla
para producción quedó en el mockup `despachos-tallas-que-frenan-v1` (Diego
la dejó pendiente). El chip "Falta N talla(s)" / "Completar ya" de la
Decisión es un botón (y cada fila del bloque trae "Ver lotes ›"): abre
`ProduccionPanel` de esa referencia en modo foco (`foco` = color + talla,
`faltas` + `onElegir` para pestañas si faltan varias): recuadro con libres
en bodega, lotes en camino que traen esa talla y color (orden, unidades en
esa talla, etapa), o qué hacer si no viene ninguno; los lotes que la traen
quedan con borde ámbar y la casilla resaltada.

**Flete por unidad de lo separado (25-sep-2026)**: columna en Despachos
("Flete por unidad · caja / paq 5 kg / paq 1–2 kg", `FleteCel`) con el flete
de Coordinadora de lo separado ÷ unidades en cada empaque; cuentas en
`lib/flete.js`. Peso estimado por categoría (`PESO_CATEGORIA`: blusa 0,25 kg,
vestido 0,40, pantalón 0,45, conjunto 0,65; supuesto, falta calibrar con una
caja pesada), cabe si el peso ≤ `PESO_MAX` (caja 20 → n cajas, paq 5, paq 2);
tarifa = fijo + 1 % del valor declarado fijo por empaque (`EMPAQUES.valor`),
guardada en `coord_tarifas` (dane × empaque, RLS `pedidos_autorizado()`,
vale `TARIFA_DIAS` = 30) y cotizada en segundo plano desde `DespachosView`
(de a dos, solo ciudades con separado que falten; "cotizando N…" en los
chips). Verde ≤ $ 2.500, ámbar ≤ $ 3.000, rojo (`UMBRAL`); tachado = no cabe;
recuadro = el más barato de los que caben. `decisionConFlete` cambia
"Esperar/Parcial" por "Despachar" (key `flete`) cuando sale, "Falta poco"
(`faltaPoco`) con "con N más baja a $ 2.500", o deja "Esperar" con "faltan N
para que salga". Chips "Sale por flete / Falta poco / Esperar por flete"
(`FILTROS_FLETE`), orden por flete, y en la ventana del cliente la tabla
`FleteComparacion` (cabe, fijo, 1 %, flete, por unidad, entrega, para que
salga). El DANE del cliente sale de su libreta o de `coord_ciudad_syd`; sin
DANE no se calcula. Con varias cajas el flete se asume n × tarifa de una.

**Programaciones se alimenta de aquí (13-sep-2026).** Ya no existe "Cargar
pedidos": `reemplazar_pedidos()` llama a `sincronizar_programaciones()`, que
escribe en `dev_programaciones` el pedido, el desglose por color y talla y la
descripción de cada referencia (`origenPedido: 'syd'`, `desgloseAt`), sin
tocar movimientos, estado ni seguimiento. La referencia que sale del informe
no se borra: queda `pedido: 0, sinPedido: true` y la vista la esconde salvo
que se toque el chip "Sin pedido" o tenga movimientos abiertos. Los conteos
por marca excluyen las `sinPedido`. El importador viejo (`leerArchivo`,
`leerSeparadosDeFilas` en `programaciones.js`) sigue en el código sin uso.

---

## 6c. Corte externo (sep-2026)

La tela puede salir a cortar afuera donde **Diego** o **Juan Carlos**
(`EXTERNOS` en `lib/procesos.js`; `EXTERNO` es el primero, por defecto). Se
escoge en `EnviarExternoModal` y queda en `procesos[orden].corte.quien` con
`externo: true`. En la tabla semanal (`TablaSemanas.jsx`) **solo la pestaña
Corte** abre la columna en MG · Diego · Juan Carlos · Total (el desglose por
persona viene en `celda.externos` de `unidadesPorSemana`); en las demás
pestañas Corte es una sola cifra. "Por día" separa a cada uno.

---

## 7. Gotchas que ya costaron caro

- **`delete` sin `WHERE` lo rechaza Supabase** ("DELETE requires a WHERE
  clause", SQLSTATE 21000). Pasó en `reemplazar_cartera()` y dejó la
  sincronización caída 15 horas sin que nada lo delatara.
- **Una vista que carga una sola vez muestra datos viejos para siempre.**
  CarteraView ahora se refresca cada 5 min y al volver a la pestaña, y el
  banner avisa qué tan viejo es el informe.
- **Postgres local y Supabase escriben el mismo instante distinto** (`-05:00`
  vs `+00:00`). Comparar marcas de tiempo como cadena duplica filas.
- Supabase devuelve **1.000 filas por defecto**: paginar siempre.
- La llave del navegador es *publishable*: **no puede crear tablas**. El DDL se
  corre en el SQL Editor del dashboard.

---

## 8. Cómo trabajar

- Verificar con `npm run build` antes de commitear.
- **Medir, no suponer**: anchos de tabla, desbordes de texto y totales se
  comprueban contra los datos reales.
- Commits en español, con el porqué en el cuerpo. El repo va directo a `main`
  y eso despliega a producción.
- Si el cambio es visual y grande, primero un mockup en `mockups/` que importe
  `/src/index.css`, para verlo antes de programarlo.
