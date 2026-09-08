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
- Un `acuerdo` exige fecha de compromiso; un `pendiente` puede ir sin texto y
  queda `estado='abierta'` hasta que alguien lo cierre.

**Lo que NO se migró** (sigue sólo en cobranza-app, necesita servidor): el
correo diario de seguimiento, el reporte en PDF y la importación del
`CARTEREA.XLS`. La ★ de seguimiento se guarda pero **hoy no dispara ningún
correo**.

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
