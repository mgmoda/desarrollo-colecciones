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
El detalle del cliente es la misma tabla de Pedidos (foto, pedido, curva
por talla, precio, observación), por marca y referencia ascendente; debajo
de cada línea van Separado, Facturado y Pendiente por talla (`sepTallas`,
`factTallas` en el registro; `separado`/`facturado` guardan el total).
Cerrar una referencia aplica a todos los clientes. Pendiente por confirmar
con Diego: si al facturar la línea desaparece del informe de SYD, lo
facturado registrado a mano se descontaría dos veces.

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
