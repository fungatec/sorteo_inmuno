# CLAUDE.md — Sorteo de Inmunobiología (CUCBA · UdeG)

## Reglas de trabajo (leer primero)

- **Git:** el autor autoriza `git push` **solo** a la rama `claude/sweet-dijkstra-trep4b`. Nunca tocar `main`, abrir PR, publicar reglas ni desplegar (GitHub Pages / Firebase) sin aprobación explícita; el merge a `main` lo hace el autor.
- Prioridad: que **funcione** y sea **segura** antes que añadir funciones. Nada de dependencias ni paso de compilación.
- Si una especificación es inconsistente o ambigua, **decirlo** en lugar de resolverlo en silencio.
- Nunca incluir en el repositorio: la lista de nombres de la clase, contraseñas ni datos de participantes (ni como ejemplo, ni en pruebas, ni en capturas). Para pruebas usar nombres ficticios.

## Propósito

La maestra de Inmunobiología sorteará un libro en un evento público. Solo participan alumnos de la clase. La app (GitHub Pages + Firebase) permite que se registren desde el celular, valida su nombre contra la lista oficial que carga la admin, y ejecuta el sorteo en pantalla.

## Stack

- HTML, CSS y JavaScript vanilla con **módulos ES**; sin bundler ni build. Todas las rutas **relativas** (Pages sirve en `/sorteo_inmuno/`).
- Firebase JS SDK **modular v10.14.1** desde `https://www.gstatic.com/firebasejs/10.14.1/…` (versión fijada; si se cambia, cambiarla en todos los imports a la vez).
- Firestore (plan Spark, modo producción) + Auth correo/contraseña. Proyecto: `sorteoinmuno`.
- Fuente: Montserrat (Google Fonts), pesos 400/600/700.
- Config: `js/firebase-config.js` (el `apiKey` no es secreto; la seguridad está en `firestore.rules`).

### Estructura

```
index.html  login.html  panel.html  sorteo.html  en-vivo.html   páginas (registro · acceso · panel · sorteo · transmisión en vivo para inscritos, sin sesión)
css/styles.css                                       tokens de color + base
js/normalizar.js                                     clave de nombre + validaciones (módulo puro)
js/firebase.js  js/firebase-config.js                inicialización de Firebase
js/registro.js  login.js  panel.js  sorteo.js        lógica por página
js/auth.js  js/datos.js  js/ui.js  js/azar.js        sesión de admin · acceso a Firestore · DOM seguro · aleatoriedad
js/escena-inmune.js  js/celulas.js  js/ficha.js   escena de respuesta inmune (E0–E6) · biblioteca de células en Canvas · ficha inmunológica (I)
js/en-vivo.js  js/en-vivo-escena.js  js/en-vivo-util.js   transmisión en vivo: página del espectador · animación ligera en Canvas · lógica pura (guion, vista, umbrales)
js/enlaces.js  js/qr.js                              URL del registro · códigos QR en canvas (librería qrcode-generator 1.4.4 local en js/vendor/, MIT, bajo demanda)
js/contenido-cientifico.js                           FUENTE DE VERDAD del contenido científico: subtítulos, tarjetas, escenas, referencias
js/escena.js                                         animación clásica de selección clonal (plan B: sorteo.html?modo=clasico)
js/sorteo-util.js  js/login-errores.js  js/errores-guardado.js   máscara/formato del nombre y registro descargable · mensajes del login · errores de guardado (módulos puros)
firestore.rules                                      reglas de seguridad (fuente de verdad)
tests/{normalizar,azar,sorteo-util,login-errores,errores-guardado,contenido-cientifico,en-vivo-util}.test.mjs   node tests/<archivo> (sin dependencias)
tests/reglas.emulador.mjs                            pruebas de reglas con emulador (ver README)
tests/e2e/                                           pruebas de extremo a extremo con navegador + emuladores
docs/CASOS_PRUEBA_REGLAS.md                          casos para el Rules Playground
docs/CHECKLIST_PUBLICACION.md                        publicación, prueba en celular y día del evento
favicon.svg  img/og.png  img/apple-touch-icon.png    íconos y vista previa Open Graph (1200×630); se regeneran con tools/generar-og.mjs (script manual, no es parte del sitio)
```

## Modelo de datos (Firestore)

| Ruta | Campos | Notas |
|---|---|---|
| `lista/{clave}` | `nombre` | Nombres oficiales. Solo admin. |
| `participantes/{clave}` | `nombre`, `clave`, `correo`, `origen` (`"registro"`\|`"admin"`), `creadoEn` (serverTimestamp) | El ID es la clave: impide registrar dos veces a la misma persona. |
| `correos/{correo}` | `clave` | Índice anti-duplicado de correo. Se escribe **en el mismo `writeBatch`** que el participante. |
| `admins/{uid}` | — | Admin ⇔ su UID existe aquí. Se gestiona solo desde la consola. UID admin: `i0y2lNrbtRed5L7dTIUFTLSKeQr1`. |
| `config/estado` | `registroAbierto` (bool) | Debe existir; si no, el registro queda cerrado (falla segura). |
| `publico/sorteo` | `estado` (`"espera"`\|`"animando"`\|`"revelado"`); en animando/revelado además `ronda` (int ≥ 1), `modo` (`"resumido"`\|`"completo"`), `tipo` (`"CD4"`\|`"CD8"`), `inicio` (= serverTimestamp); solo en `"revelado"`, `ganadorMascara` (1–60 car., sin `< > &` ni comillas) | Documento ÚNICO de la transmisión en vivo. Lectura pública (`get`, sin `list`); escritura solo admin. **Nunca** contiene la clave ni el nombre completo del ganador, y la máscara solo en «revelado». «Vaciar datos» lo deja en `{estado:"espera"}`. |
| `sorteos/{id}` | `fecha` (= serverTimestamp), `totalParticipantes`, `ganadorClave`, `ronda`, `adminUid` (= UID de la sesión; las reglas lo verifican) | No se editan. Solo el admin puede borrarlos, y únicamente lo hace «Vaciar datos». |

Al **borrar** un participante hay que borrar también su `correos/{correo}` (mismo batch); las reglas no lo fuerzan.

## Normalización (`js/normalizar.js`, única fuente)

`claveDeNombre`: minúsculas → **guiones y cualquier espacio en blanco → un espacio** → NFD y quitar marcas combinantes (ñ→n) → eliminar todo lo que no sea `a-z` o espacio → separar en palabras → **descartar las partículas `de`, `del`, `la`, `las`, `los`, `y`** → **ordenar alfabéticamente** → unir con `-`.

| Entrada | Clave |
|---|---|
| `Julián Ramírez Soto` / `ramirez soto JULIAN` | `julian-ramirez-soto` |
| `Pérez-Gil` / `Pérez Gil` | `gil-perez` |
| `María de los Ángeles` / `Ángeles María` | `angeles-maria` |
| `De la Cruz` | `cruz` |

**Por qué se ordenan las palabras:** los alumnos escriben nombre y apellidos en órdenes distintos (apellidos primero, o al revés); ordenar hace que la clave sea independiente del orden.
**Por qué se ignoran las partículas y se separan los guiones:** quien escribe «María de los Ángeles» o «Pérez-Gil» no debe fallar por omitir una partícula o usar espacio en lugar de guion.

Límites asumidos (documentados, no resueltos): la coincidencia es por **conjunto exacto de palabras significativas** (omitir un apellido o añadir un segundo nombre no coincide); los apóstrofos se eliminan sin dejar espacio (`O'Brien` → `obrien`); letras no descomponibles (ß, ø) se descartan; una clave vacía (p. ej. «de la») debe rechazarse. **Más colisiones:** al ignorar partículas y orden, «Ana de la Cruz» y «Ana Cruz» (o dos homónimos) comparten clave. `analizarLista` las detecta y **no guarda** esas claves hasta que la admin las resuelva (alta manual).

Correo: minúsculas y sin espacios, debe terminar en `@alumnos.udg.mx` (`normalizarCorreo`, `esCorreoValido`). Nombre: se guarda recortado y con espacios colapsados, 5–100 caracteres (`limpiarNombre`, `validarNombre`) y **sin `< > &` ni comillas** (`" ' ` “ ” ‘ ’`; `CARACTERES_PROHIBIDOS`). Por eso un nombre con apóstrofo (p. ej. D'Angelo) se rechaza: escríbelo sin él.

**Carga de la lista (`limpiarLineaLista` / `analizarLista`):** cada línea se limpia antes de validarla y guardarla: se quitan comillas de CSV, viñetas o asteriscos iniciales (`• * - – +`), numeración (`1.`, `2)`) y puntos, comas o punto y coma finales; los puntos interiores se conservan. El nombre oficial se guarda **tal cual viene** (p. ej. en MAYÚSCULAS y sin acentos); el formato título es solo de presentación. La vista previa del panel muestra el total leído y los 3 primeros con la máscara.

> `js/normalizar.js` y `firestore.rules` validan lo mismo en dos lenguajes (`RE_CORREO` ↔ `correoValido`, longitudes, patrón de clave). Si se cambia uno, cambiar el otro y correr ambas suites.

## Reglas de seguridad y validación

Resumen (el detalle comentado está en `firestore.rules`):

- **Público (sin sesión):** solo **crear** `participantes` + `correos` en un batch, y solo si `registroAbierto == true`, la clave existe en `lista`, ID == campo `clave`, el doc no existe, campos exactamente `nombre, clave, correo, origen, creadoEn`, correo válido, `origen == "registro"`, `creadoEn == request.time`, y ambos docs se crean juntos apuntando a la misma clave (`existsAfter`/`getAfter`). Solo puede **leer** `config/estado`.
- **Nombre** (`nombreValido`, en `lista` y `participantes`): 5–100 caracteres, sin espacio en los bordes y sin `< > &` ni comillas. Las reglas no pueden comprobar que `nombre` corresponda a `clave`; esto evita al menos que se guarde marcado HTML bajo la clave de otra persona.
- **Admin:** lee todo; CRUD en `lista`; crea (origen `"admin"`, mismas validaciones de formato, sin exigir registro abierto ni lista) y borra en `participantes`/`correos`; escribe `config/estado`; crea `sorteos` (con `adminUid` igual a su UID) y puede borrarlos (solo para el vaciado final). No hay `update` de participantes ni de sorteos.
- **Transmisión en vivo (`publico/sorteo`):** `get` público (sin `list`); create/update/delete solo admin, con `keys().hasOnly`, tipos validados y `ganadorMascara` permitida únicamente en `"revelado"` (y exigida ahí). Contiene solo lo que ya es público en la proyección (la máscara).
- Todo lo demás: denegado.

### Errores en el registro (decisión de privacidad)

Firestore devuelve **siempre** `permission-denied`, sin distinguir causa. Por tanto:
- "Registro cerrado" **sí** se distingue: leer `config/estado` antes de enviar.
- "Nombre fuera de lista" / "ya registrado" / "correo ya usado" **no** se distinguen: mostrar este mensaje único (ya implementado en `js/registro.js`, con las tres causas): «No pudimos completar tu registro. Puede deberse a que tu nombre no coincide con la lista de la clase, a que ya te habías registrado o a que ese correo ya se usó. Si el problema persiste, avisa a la maestra.»
- No abrir lecturas públicas para afinar el mensaje: permitir `get` en `lista`/`participantes`/`correos` dejaría a cualquiera confirmar por adivinanza quién pertenece a la clase o ya se registró (y filtraría correos).

### Límites conocidos (no ocultar)

- No hay verificación de identidad: los nombres no son secretos y el correo no se verifica. Alguien podría registrar a un compañero (o un externo con un nombre conocido) con un correo inventado. Mitigación: la admin revisa la tabla de participantes, borra y da de alta manualmente.
- Las reglas no pueden recalcular la clave desde `nombre`. Un cliente malicioso puede guardar un `nombre` arbitrario bajo la clave de otra persona. **La pantalla del sorteo y cualquier proyección pública deben mostrar `lista/{clave}.nombre` (oficial), nunca `participantes.nombre`.**
- Cuenta admin compartida: el usuario (`admin123`) y el correo interno **no son secretos** (el repo es público); la **contraseña** es la única barrera y debe ser fuerte (no derivada del usuario). Sin bitácora por persona.
- **Panel:** `compararConOficial` marca cada participante con `ok`, `difiere` (misma clave, escrito distinto), `no-corresponde` (el nombre tecleado no produce la clave: posible suplantación) o `sin-oficial` (clave fuera de la lista). El panel siempre muestra el nombre **oficial** y advierte en los dos primeros casos.

## Autenticación de admin

El login muestra «Usuario» y «Contraseña». El usuario válido es **`admin123`** (`ADMIN_USUARIO`, sin distinguir mayúsculas, recortado); solo entonces se llama a `signInWithEmailAndPassword(auth, ADMIN_CORREO, contraseña)` con `ADMIN_CORREO = admin@admin.admin`. El usuario se normaliza con `trim` y minúsculas antes de compararlo (`normalizarUsuario`). **Cualquier otro usuario (incluido el correo directo) se rechaza antes de llamar a Firebase.** Los campos del login llevan `autocapitalize="none" autocorrect="off" spellcheck="false"` (el usuario, además, `autocomplete="username"`). **Errores (`js/login-errores.js`):** usuario o contraseña incorrectos —y cualquier error de credenciales— dan el mismo mensaje y nunca revelan cuál falló; los errores de configuración o red tienen mensajes propios (dominio no autorizado, método de acceso desactivado, sin conexión, clave de API rechazada o restringida, demasiados intentos) y el código de Firebase se registra con `console.error` (solo el código: jamás la contraseña). Ojo: el login con correo y contraseña normalmente **no** valida el «dominio autorizado»; la causa más probable de un bloqueo es una restricción de referentes mal escrita en la clave de API. **La contraseña no existe en el código**: solo se teclea. Tras autenticar, `getDoc(admins/{uid})`; inexistente o `permission-denied` ⇒ cerrar sesión. `panel.html` y `sorteo.html` redirigen a `login.html` sin sesión de admin (`requerirAdmin`).

## Sorteo y proyección (Paso 3: `js/sorteo.js`, `js/escena.js`, `js/sorteo-util.js`)

- **Elección:** `crypto.getRandomValues` con **muestreo por rechazo** (`js/azar.js`, sin sesgo de módulo). **Nunca `Math.random`** (ni en la animación: el azar visual usa un PRNG sembrado con `crypto`). `grep Math.random js/` solo debe encontrar comentarios.
- **Orden:** se elige y se **guarda antes** de animar; si el guardado falla no se revela a nadie y se reintenta. `sorteos` guarda `fecha` (= `serverTimestamp()`), `totalParticipantes` (= tamaño del grupo elegible en esa ronda, tras excluir ganadores previos), `ganadorClave`, `ronda` y `adminUid`.
- **Nueva ronda** («Activar otro linfocito»; «Volver a sortear» en modo clásico; botón o Espacio): vuelve a sortear **al instante** excluyendo a los ganadores previos guardados y suma una ronda. **Casilla «Ensayo»:** anima sin guardar, con etiqueta «ENSAYO · no se guarda»; los ganadores de ensayo solo se excluyen entre sí durante esa sesión de pantalla. Los sorteos guardados no se editan y solo se borran con «Vaciar datos»: **ensaya siempre con la casilla marcada**.
- **Nombre en pantalla:** siempre el **oficial** (`lista/{clave}.nombre`; si la clave no está en la lista —alta manual—, el capturado, con aviso al admin), nunca el tecleado en el registro. La lista viene en MAYÚSCULAS, sin acentos y como «Nombre Apellidos» (3 a 6 palabras): la **máscara** está en **formato título** (`enmascararNombre`: primera palabra = nombre de pila; las demás aportan inicial, **excepto** `de, del, la, las, los, y`): «MARTA ELENA RIOS Y VEGA SOTO» → «Marta E. R. V. S.»; «JULIO DE BELEN ORTIZ PAZ» → «Julio B. O. P.». La tecla **N** (o el botón) muestra el nombre completo, también en formato título (`formatoTitulo`: «Marta Elena Rios y Vega Soto»). **No lleva dígitos de código: no existe código de estudiante.** Si alguna vez la lista viniera como «Apellidos Nombre», la máscara mostraría un apellido.
- **Modo proyección:** `sorteo.html` en pantalla completa (botón o **F**); los mandos se ocultan a los 3 s sin actividad y reaparecen al mover el ratón/tocar. Espacio/Enter = sortear. En pantallas < 640 px los mandos van bajo la escena. iOS no permite pantalla completa de un elemento: usar laptop.
- **Modos de animación (Paso 5):** por defecto, la **animación resumida** (`js/escena-inmune.js`, ≈ 17 s hasta el revelado): una tarjeta de 3 s («Una infección activó a una célula dendrítica. Llega al ganglio linfático.») y las escenas E4–E6 comprimidas (E4 4 s, E5 4 s, E6 7 s) con subtítulos de ≤ 12 palabras (`SUBTITULOS.INTRO/E4_S/E5_S/E6_S`); sin barra de tiempo. La **historia completa** (E1–E6, ≈ 30 s, subtítulos de ≤ 18 palabras y barra «minutos → horas → días») se lanza con el botón secundario «Sortear con historia completa» (inicia una ronda normal, con guardado) o con `sorteo.html?modo=completo`, que además la usa como animación por defecto (primera ronda completa, siguientes desde E4 ≈ 16 s, casilla «elenco» con E0). Guion y reglas de exactitud en «Metáfora visual». `sorteo.html?modo=clasico` conserva, intacta, la animación anterior de selección clonal (`js/escena.js`, ≈ 11,4 s: E1 repertorio de linfocitos B · E2 el antígeno (libro) explora · E3 reconocimiento de UN clon · E4 expansión clonal) con sus textos («Liberar el antígeno» / «Volver a sortear»); es el **plan B** del evento. Ambas: Canvas 2D sin librerías, azar visual con PRNG sembrado con `crypto`, tope visual de células, `prefers-reduced-motion` sin movimiento (en el modo inmune, fotogramas fijos de 3 s con fundidos de 1,5 s).
- **Pantalla de sorteo mínima (Paso 5):** contador «linfocitos T en el ganglio», un botón principal grande («Iniciar la respuesta inmune» / «Activar otro linfocito») y controles pequeños (ficha como ícono «i», «Sortear con historia completa», Pantalla completa, casilla Ensayo; Panel y Salir en la cabecera). **No se muestran pistas de teclas** (los atajos siguen activos). Revelado: nombre enmascarado grande en verde y, debajo y pequeño, «Linfocito T CD8+ activado» (o CD4+).
- **Teclas (modo inmune; no visibles en pantalla):** Espacio/Enter inicia · **S** salta de escena · **C** oculta/muestra subtítulos · **I** ficha inmunológica (con ella abierta solo I/Esc) · **F** pantalla completa · **N** nombre completo. Casilla «elenco» (solo en `?modo=completo`) antepone E0 (+5 s). Textos: «Iniciar la respuesta inmune», «Activar otro linfocito», «linfocitos T en el ganglio». Para pruebas locales, `?tipo=CD4|CD8` (solo en localhost) fija el tipo ilustrativo.
- **Transmisión en vivo (Paso 6, aditiva):** `en-vivo.html` (sin sesión, móvil primero) escucha `publico/sorteo` con `onSnapshot`. Solo **sorteos reales** (no Ensayo, no modo clásico): tras guardar la ronda con éxito, `sorteo.js` publica «animando» (sin ganador); en el instante del revelado del proyector (`alRevelar`), «revelado» con la máscara. Es **best-effort**: va en una cola serie (el revelado nunca se adelanta a «animando»), sin `await` sobre el sorteo, con transacción `maxAttempts:1` (sin red falla en vez de encolarse); si falla, `console.error` con el código y un aviso discreto (`#envivo-estado`), sin afectar el guardado ni el revelado. El espectador ve: «Esperando el sorteo…» · animación ligera con los subtítulos de la narrativa (el espectador que llega ya empezada la animación ve «El sorteo está en curso…»; tras 90 s sin revelado, «El sorteo se interrumpió; espera la siguiente ronda.») · máscara en verde + tipo + ronda. Banner «Sin conexión. Reintentando…» y reintento de la suscripción. **Privacidad:** la máscara del ganador es visible para quien tenga el enlace (lo dice el aviso del registro); «Vaciar datos» deja `publico/sorteo` en `{estado:"espera"}`. Enlaces: «Ver el sorteo en vivo» (confirmación de registro y tarjeta de registro cerrado) y «Copiar enlace de transmisión» (panel y pantalla de sorteo). Costo de una ronda con 50 espectadores: ver README.
- **Constancia:** el panel descarga `registro-sorteo-AAAA-MM-DD.txt` (fecha, ronda, total, ganador oficial, UID del admin; `textoRegistroSorteo`). Debe descargarse **antes** de «Vaciar datos».

## Seguridad de salida (XSS)

- **Regla:** ningún dato de Firestore ni del usuario (nombre, correo, nombre oficial) se inserta con `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, plantillas HTML ni atributos `on*`. Siempre `textContent` o `h()` (`js/ui.js`), cuyos hijos son nodos de texto; `h()` además lanza error ante `on*` que no sea función, `srcdoc` o URLs `javascript:`. Los datos solo llegan a atributos como valor de `aria-label`.
- **Auditoría:** `grep -rnE "innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|srcdoc|javascript:" js/ *.html` debe devolver solo comentarios. Repetirla ante cualquier cambio de interfaz.
- **Defensa en profundidad:** `nombreValido` (cliente y reglas) rechaza `< > &` y comillas. Pruebas e2e: registro con `<img src=x onerror=alert(1)>` (se rechaza, no se ejecuta) y datos **ya guardados** con ese marcado (nombre, nombre oficial y correo) se muestran como texto en el panel y en el sorteo.
- Posible mejora futura (no aplicada para no arriesgar el sitio sin poder probarla contra Firebase real): una `Content-Security-Policy` por `<meta>`.

## Interfaz (Paso 2)

- **Registro:** solo nombre completo y correo (no hay código de estudiante: ni el modelo ni las reglas lo admiten). Validación **en vivo** bajo cada campo (`validarEnVivo` + `mensajeErrorNombre`/`mensajeErrorCorreo`; p. ej. «El correo debe ser @alumnos.udg.mx»). Si `registroAbierto` es false, la tarjeta «El registro está cerrado» **reemplaza** al formulario. Aviso de privacidad: «Tus datos se usan solo para este sorteo y se eliminarán al terminar el evento (solo es verdad si la admin usa «Vaciar datos»). La transmisión en vivo muestra, a quien tenga el enlace, la máscara del nombre del ganador (por ejemplo, «Marta E. R.»).» Título «Inscribe tu linfocito T», botón «Inscribir mi linfocito». Éxito: animación de un linfocito T virgen cruzando una vénula de endotelio alto hacia el ganglio, con el texto de «Metáfora visual».
- **Entrada (Paso 7):** `index.html` **nunca redirige según la sesión**: la URL raíz siempre es el registro (o «El registro está cerrado»), también con un admin con sesión. El acceso de administración es el enlace discreto «Administración» de la cabecera (`#enlace-admin`: `login.html`, o `panel.html` si hay sesión de admin; solo cambia el `href`). Los estudiantes no ven texto del panel ni del sorteo. `login.html`, `panel.html` y `sorteo.html` llevan `<meta name="robots" content="noindex">`. Ocultar el enlace **no es seguridad**: la protección son las reglas y la contraseña.
- **Registro, pulido (Paso 7B):** jerarquía título → una frase → dos campos → botón ancho (≥ 56 px) → privacidad; etiqueta visible y ayuda breve; ejemplo ficticio en el `placeholder`; `autocomplete` `name`/`email`, `inputmode="email"`, `autocapitalize` `words`/`none`, `autocorrect="off"`; fuente ≥ 16 px y objetivos ≥ 48 px. La validación aparece **al salir del campo y al enviar** (no en cada tecla; mientras se escribe solo se retira un error ya corregido) y el foco va al primer error. Botón «Inscribiendo…» (deshabilitado, sin doble envío). Confirmación: tarjeta con «Ver el sorteo en vivo» como acción principal y «Guarda este enlace para el día del sorteo». Estados amables para registro cerrado y sin conexión (`#sin-conexion`). Transiciones ≤ 200 ms (`--dur`), anuladas con `prefers-reduced-motion`.
- **Panel, pulido (Paso 7B):** cabecera «Registro: ABIERTO/CERRADO» (+ interruptor) e «Inscritos X de Y» con barra de progreso (`role="progressbar"`); **guía de 4 pasos** (cargar lista → abrir registro → cerrar y sortear → descargar y vaciar) con estado hecho/siguiente/pendiente calculado de los datos; «Ir al sorteo» deshabilitado con explicación si no hay participantes; «Copiar enlace de registro» / «Copiar enlace de transmisión» con confirmación «Copiado ✓»; códigos QR opcionales (se dibujan en el navegador; la librería se carga de `js/vendor/qrcode.js`, sin terceros, solo al pulsarlos); avisos como *toasts* (`#aviso[data-toast]`, se cierran al tocarlos); esqueletos de carga y estados vacíos; **zona de peligro** al final, con el recordatorio de descargar antes el registro del sorteo; en móvil la barra de acciones (`#barra-acciones`) queda fija abajo. Tokens: espaciado de 8 px (`--s-1…5`) y escala tipográfica (`--t-sm…2xl`).
- **Metaetiquetas (Paso 7B):** título propio por página, `favicon.svg`, `theme-color` y Open Graph (registro y transmisión) con URL absoluta y `img/og.png`.
- **Panel:** interruptor accesible (`role="switch"`) de registro; tabla de participantes (nombre oficial, correo, origen, fecha) con búsqueda sin acentos y contador; pestañas operables con ← → Inicio Fin; alta manual con las mismas validaciones; eliminar con confirmación.
- **Vaciar datos:** (antes, «Descargar registro del sorteo») diálogo modal que exige escribir `BORRAR` (botón deshabilitado hasta entonces, y se re-verifica al enviar). Cierra el registro primero y borra `participantes`, `correos`, `sorteos` y `lista` (no toca `admins` ni `config`). Irreversible: incluye el registro de ganadores.
- Accesibilidad: auditada con axe-core (WCAG 2.0/2.1 A y AA) a 360 px en las cuatro pantallas, sin violaciones. Incluye sorteo en modo inmune y la ficha abierta. Responsivo desde 360 px (la tabla se apila en tarjetas bajo 640 px). Cualquier cambio de interfaz debe mantener esa auditoría en cero.

## Identidad visual

Paleta FungaTec (definida como variables en `css/styles.css`):

| Token | Hex | Uso |
|---|---|---|
| `--petroleo` | `#053043` | Fondo/base, texto principal, escenario del sorteo |
| `--cielo` | `#25A9E0` | Acción principal (botones, enlaces activos) |
| `--celeste` | `#A7F0F3` | Superficies y acentos suaves, bordes de campo |
| `--verde` | `#45AC4D` | Éxito / ganador |

Criterios: minimalista, mucho espacio en blanco, **mobile-first** (los alumnos se registran desde el celular), objetivos táctiles ≥ 48 px, `lang="es"`, foco visible, respeta `prefers-reduced-motion`. Contraste: usar texto **petróleo** sobre `cielo` y `verde` (≈ 5.2:1 y 4.8:1); el texto blanco sobre `cielo` NO cumple. Registro y panel en fondo claro (blanco/celeste diluido) con texto petróleo; el sorteo es el único «escenario» oscuro (fondo petróleo, texto celeste, ganador en verde).

Tipografía: Montserrat 400 (texto), 600 (etiquetas/botones), 700 (títulos).

## Metáfora visual: respuesta inmune a *Listeria monocytogenes* (modo por defecto)

**Regla de oro: todo texto de la interfaz debe ser biológicamente correcto; ante la duda, usa solo lo que está en `js/contenido-cientifico.js` (sección «Contenido científico») y marca lo incierto con [VERIFICAR] en el README.** Ese módulo es la fuente de verdad (subtítulos, tarjetas, escenas, ficha y referencias); un test (`tests/contenido-cientifico.test.mjs`) verifica límites como las 18 palabras por subtítulo.

Cada **participante es un linfocito T virgen** que patrulla un ganglio linfático (con un TCR de especificidad única). Una **célula dendrítica** llega del tejido infectado con antígeno; el sorteo es el momento en que la célula dendrítica encuentra a UN linfocito, lo activa y este prolifera. **El libro no forma parte de la historia biológica.** El azar es la regla del sorteo («todos los participantes tienen la misma probabilidad»): no se afirma que la selección biológica sea azarosa; solo el *encuentro* se presenta como producto de la motilidad.

Guion de la **historia completa** (≈ 30 s; E0 opcional +5 s; en `?modo=completo` las rondas siguientes arrancan en E4 ≈ 16 s con el subtítulo «Una respuesta real es policlonal…»). La animación por defecto usa solo la tarjeta introductoria + E4–E6 (E4: «Cada participante es un linfocito T. La célula dendrítica los recorre.» · E5: «Uno reconoce el antígeno y se activa.» · E6: «El linfocito activado se multiplica y entra en acción.»; los no elegidos siguen patrullando). Escenas: **E0** elenco (frotis de sangre, Wright-Giemsa) · **E1** (5 s) epitelio roto, *Listeria*, macrófago residente, TLR y citocinas (inmunidad innata, minutos) · **E2** (5 s) neutrófilos: rodamiento, adhesión, diapédesis, fagocitosis, ROS y NET · **E3** (4 s) la célula dendrítica captura, madura y viaja por el vaso linfático · **E4** (5 s) el ganglio: la DC recorre linfocitos T vírgenes · **E5** (5 s) sinapsis inmunológica con las tres señales (TCR–MHC, CD28–CD80/86, citocinas); MHC II para CD4 / MHC I para CD8 · **E6** (7 s) proliferación con IL-2 y salida por la linfa eferente; final CD8 (perforina y granzimas, apoptosis de la célula infectada) o CD4 (IFN-γ y macrófago activado). Barra inferior «minutos → horas → días» (solo en la historia completa).

Exactitud (criterios de aceptación): los **no elegidos no mueren ni se desvanecen** (siguen patrullando); la proporción CD4:CD8 (2:1) es **solo ilustrativa e independiente del sorteo**; tamaños relativos aproximados; tinciones Wright-Giemsa solo en células; **verde reservado al linfocito activado/ganador**; subtítulos de máx. 2 líneas y 18 palabras con `aria-live="polite"`; Canvas 2D vectorial, 30–60 fps con 100 participantes + ~40 de ambientación.
- Registro: «{Nombre}, tu linfocito T virgen ya patrulla el ganglio linfático. Ahora solo queda esperar a que llegue la célula dendrítica.», con un linfocito que entra por una vénula de endotelio alto. Total de inscritos → «linfocitos T en el ganglio».
- Vocabulario no permitido en este modo: nada de «clones en el repertorio», antígeno = libro, linfocitos B, ni presentarlo como selección clonal de Burnet (eso es del modo clásico).
- Referencias: ver `FUENTES` en `js/contenido-cientifico.js` (Abbas 2022; Murphy y Weaver 2022; Banchereau y Steinman 1998; Kolaczkowska y Kubes 2013; Brinkmann 2004; Rosenberg 2013; Voehringer 2013; Jenkins y Moon 2012).

### Modo clásico (`?modo=clasico`): selección clonal

Burnet (1959): cada participante es un **linfocito B** con receptor (BCR) único; el **libro es el antígeno**; el antígeno **reconoce a un solo clon**, que se **expande**. Vocabulario: linfocito B, receptor (BCR), antígeno, reconocimiento, afinidad, clon, repertorio, expansión/proliferación clonal; sin mezclar con MHC, linfocitos T cooperadores, hipermutación, tolerancia, complemento ni fagocitosis. No decir que el antígeno «elige al azar» como hecho biológico. Referencia: Burnet, F. M. (1959). *The clonal selection theory of acquired immunity*. Cambridge University Press.

## Comandos

```bash
node tests/normalizar.test.mjs                      # normalización (sin dependencias)
node tests/azar.test.mjs                            # aleatoriedad (sin dependencias)
node tests/sorteo-util.test.mjs                     # máscara, formato título y registro descargable (sin dependencias)
node tests/login-errores.test.mjs                   # clasificación y mensajes de errores del login (sin dependencias)
node tests/errores-guardado.test.mjs                # clasificación y mensajes de errores al guardar la ronda (sin dependencias)
node tests/contenido-cientifico.test.mjs             # límites del contenido científico (sin dependencias)
node tests/en-vivo-util.test.mjs                    # guion, vista y umbrales de la transmisión en vivo (sin dependencias)
# Pruebas de reglas (requiere Java; ver README):
npm i --no-save firebase-tools @firebase/rules-unit-testing firebase
npx firebase emulators:exec --only firestore --project sorteoinmuno "node tests/reglas.emulador.mjs"
# E2E (navegador + emuladores): ver cabecera de tests/e2e/e2e.mjs
python3 -m http.server 8000                         # servir local (los módulos ES requieren http, no file://)
# http://localhost:8000/?emulador  → conecta a los emuladores (solo en localhost; el modo se guarda por pestaña)
```
