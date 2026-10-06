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
index.html  login.html  panel.html  sorteo.html     páginas (registro · acceso · panel · sorteo)
css/styles.css                                       tokens de color + base
js/normalizar.js                                     clave de nombre + validaciones (módulo puro)
js/firebase.js  js/firebase-config.js                inicialización de Firebase
js/registro.js  login.js  panel.js  sorteo.js        lógica por página
js/auth.js  js/datos.js  js/ui.js  js/azar.js        sesión de admin · acceso a Firestore · DOM seguro · aleatoriedad
firestore.rules                                      reglas de seguridad (fuente de verdad)
tests/normalizar.test.mjs  tests/azar.test.mjs       node tests/<archivo> (sin dependencias)
tests/reglas.emulador.mjs                            pruebas de reglas con emulador (ver README)
tests/e2e/                                           pruebas de extremo a extremo con navegador + emuladores
docs/CASOS_PRUEBA_REGLAS.md                          casos para el Rules Playground
```

## Modelo de datos (Firestore)

| Ruta | Campos | Notas |
|---|---|---|
| `lista/{clave}` | `nombre` | Nombres oficiales. Solo admin. |
| `participantes/{clave}` | `nombre`, `clave`, `correo`, `origen` (`"registro"`\|`"admin"`), `creadoEn` (serverTimestamp) | El ID es la clave: impide registrar dos veces a la misma persona. |
| `correos/{correo}` | `clave` | Índice anti-duplicado de correo. Se escribe **en el mismo `writeBatch`** que el participante. |
| `admins/{uid}` | — | Admin ⇔ su UID existe aquí. Se gestiona solo desde la consola. UID admin: `i0y2lNrbtRed5L7dTIUFTLSKeQr1`. |
| `config/estado` | `registroAbierto` (bool) | Debe existir; si no, el registro queda cerrado (falla segura). |
| `sorteos/{id}` | `fecha` (= serverTimestamp), `totalParticipantes`, `ganadorClave`, `ronda` | No se editan. Solo el admin puede borrarlos, y únicamente lo hace «Vaciar datos». |

Al **borrar** un participante hay que borrar también su `correos/{correo}` (mismo batch); las reglas no lo fuerzan.

## Normalización (`js/normalizar.js`, única fuente)

`claveDeNombre`: minúsculas → **guiones y cualquier espacio en blanco → un espacio** → NFD y quitar marcas combinantes (ñ→n) → eliminar todo lo que no sea `a-z` o espacio → separar en palabras → **descartar las partículas `de`, `del`, `la`, `las`, `los`, `y`** → **ordenar alfabéticamente** → unir con `-`.

| Entrada | Clave |
|---|---|
| `Jonathan Gómez Peregrina` / `gomez peregrina JONATHAN` | `gomez-jonathan-peregrina` |
| `Pérez-Gil` / `Pérez Gil` | `gil-perez` |
| `María de los Ángeles` / `Ángeles María` | `angeles-maria` |
| `De la Cruz` | `cruz` |

**Por qué se ordenan las palabras:** los alumnos escriben nombre y apellidos en órdenes distintos (apellidos primero, o al revés); ordenar hace que la clave sea independiente del orden.
**Por qué se ignoran las partículas y se separan los guiones:** quien escribe «María de los Ángeles» o «Pérez-Gil» no debe fallar por omitir una partícula o usar espacio en lugar de guion.

Límites asumidos (documentados, no resueltos): la coincidencia es por **conjunto exacto de palabras significativas** (omitir un apellido o añadir un segundo nombre no coincide); los apóstrofos se eliminan sin dejar espacio (`O'Brien` → `obrien`); letras no descomponibles (ß, ø) se descartan; una clave vacía (p. ej. «de la») debe rechazarse. **Más colisiones:** al ignorar partículas y orden, «Ana de la Cruz» y «Ana Cruz» (o dos homónimos) comparten clave. `analizarLista` las detecta y **no guarda** esas claves hasta que la admin las resuelva (alta manual).

Correo: minúsculas y sin espacios, debe terminar en `@alumnos.udg.mx` (`normalizarCorreo`, `esCorreoValido`). Nombre: se guarda recortado y con espacios colapsados, 5–100 caracteres (`limpiarNombre`, `validarNombre`).

> `js/normalizar.js` y `firestore.rules` validan lo mismo en dos lenguajes (`RE_CORREO` ↔ `correoValido`, longitudes, patrón de clave). Si se cambia uno, cambiar el otro y correr ambas suites.

## Reglas de seguridad y validación

Resumen (el detalle comentado está en `firestore.rules`):

- **Público (sin sesión):** solo **crear** `participantes` + `correos` en un batch, y solo si `registroAbierto == true`, la clave existe en `lista`, ID == campo `clave`, el doc no existe, campos exactamente `nombre, clave, correo, origen, creadoEn`, correo válido, `origen == "registro"`, `creadoEn == request.time`, y ambos docs se crean juntos apuntando a la misma clave (`existsAfter`/`getAfter`). Solo puede **leer** `config/estado`.
- **Admin:** lee todo; CRUD en `lista`; crea (origen `"admin"`, mismas validaciones de formato, sin exigir registro abierto ni lista) y borra en `participantes`/`correos`; escribe `config/estado`; crea `sorteos` y puede borrarlos (solo para el vaciado final). No hay `update` de participantes ni de sorteos.
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

El login muestra «Usuario» y «Contraseña». El usuario válido es **`admin123`** (`ADMIN_USUARIO`, sin distinguir mayúsculas, recortado); solo entonces se llama a `signInWithEmailAndPassword(auth, ADMIN_CORREO, contraseña)` con `ADMIN_CORREO = admin@admin.admin`. **Cualquier otro usuario (incluido el correo directo) se rechaza antes de llamar a Firebase.** Usuario o contraseña incorrectos dan el mismo mensaje. **La contraseña no existe en el código**: solo se teclea. Tras autenticar, `getDoc(admins/{uid})`; inexistente o `permission-denied` ⇒ cerrar sesión. `panel.html` y `sorteo.html` redirigen a `login.html` sin sesión de admin (`requerirAdmin`).

## Sorteo (implementado en `js/sorteo.js`)

- Aleatoriedad con `crypto.getRandomValues` y **muestreo por rechazo** (`js/azar.js`, sin sesgo de módulo); nunca `Math.random` (tampoco en la animación).
- El ganador se elige **y se guarda antes** de la animación; si el guardado falla no se revela a nadie y se puede reintentar. `sorteos` guarda `totalParticipantes` (= tamaño del grupo elegible en esa ronda, tras excluir ganadores previos), `ganadorClave`, `ronda` y `fecha` = `serverTimestamp()`.
- Rondas: se excluyen automáticamente los ganadores de rondas guardadas. **Casilla «Ensayo»:** sortea y anima sin guardar ni excluir, con etiqueta visible «ENSAYO · no se guarda». Los sorteos guardados no se pueden editar y solo se borran con «Vaciar datos», así que **ensaya siempre con la casilla marcada**.
- Se muestra solo el **nombre oficial** del ganador (`lista/{clave}`; si la clave no está en la lista, el tecleado). Nunca correos ni la tabla completa.
- Animación: acercamiento del antígeno → reconocimiento (parpadeo que se frena sobre un clon) → proliferación clonal (14 células) → nombre en verde. Respeta `prefers-reduced-motion` (revela directo).

## Interfaz (Paso 2)

- **Registro:** solo nombre completo y correo (no hay código de estudiante: ni el modelo ni las reglas lo admiten). Validación **en vivo** bajo cada campo (`validarEnVivo` + `mensajeErrorNombre`/`mensajeErrorCorreo`; p. ej. «El correo debe ser @alumnos.udg.mx»). Si `registroAbierto` es false, la tarjeta «El registro está cerrado» **reemplaza** al formulario. Una línea de privacidad: «Tus datos se usan solo para este sorteo y se eliminarán al terminar el evento» (solo es verdad si la admin usa «Vaciar datos»). Éxito: animación de un linfocito B (verde) incorporándose al repertorio.
- **Panel:** interruptor accesible (`role="switch"`) de registro; tabla de participantes (nombre oficial, correo, origen, fecha) con búsqueda sin acentos y contador; pestañas operables con ← → Inicio Fin; alta manual con las mismas validaciones; eliminar con confirmación.
- **Vaciar datos:** diálogo modal que exige escribir `BORRAR` (botón deshabilitado hasta entonces, y se re-verifica al enviar). Cierra el registro primero y borra `participantes`, `correos`, `sorteos` y `lista` (no toca `admins` ni `config`). Irreversible: incluye el registro de ganadores.
- Accesibilidad: auditada con axe-core (WCAG 2.0/2.1 A y AA) a 360 px en las cuatro pantallas, sin violaciones. Responsivo desde 360 px (la tabla se apila en tarjetas bajo 640 px). Cualquier cambio de interfaz debe mantener esa auditoría en cero.

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

## Metáfora visual: selección clonal

Burnet (1959): cada **participante es un linfocito B** con un receptor (BCR) de especificidad única; el **libro es el antígeno**; el sorteo es el momento en que el antígeno **reconoce a un solo clon**, que luego se **expande (proliferación clonal)** para revelar al ganador.

Guía de textos y animación:
- Registro → «Registra tu receptor» / «Tu clon queda en el repertorio». Total de inscritos → «clones en el repertorio».
- Sorteo → el antígeno se acerca; el reconocimiento resalta **un** clon; ese clon prolifera (la célula se divide y se multiplica en pantalla) y se despliega el nombre en verde.
- Vocabulario permitido: linfocito B, receptor (BCR), antígeno, reconocimiento, afinidad, clon, repertorio, activación, expansión/proliferación clonal.
- **No mezclar con otros procesos:** nada de presentación por MHC, células presentadoras, linfocitos T cooperadores, hipermutación somática, selección negativa/tolerancia, complemento ni fagocitosis. No decir que el antígeno «elige al azar» como hecho biológico (el reconocimiento depende de complementariedad); el azar es la regla del sorteo, y puede aclararse así en un texto de pie.
- Referencia: Burnet, F. M. (1959). *The clonal selection theory of acquired immunity*. Cambridge University Press. Texto de consulta: Murphy, K., & Weaver, C. (2022). *Janeway's immunobiology* (10.ª ed.). W. W. Norton.

## Comandos

```bash
node tests/normalizar.test.mjs                      # normalización (sin dependencias)
node tests/azar.test.mjs                            # aleatoriedad (sin dependencias)
# Pruebas de reglas (requiere Java; ver README):
npm i --no-save firebase-tools @firebase/rules-unit-testing firebase
npx firebase emulators:exec --only firestore --project sorteoinmuno "node tests/reglas.emulador.mjs"
# E2E (navegador + emuladores): ver cabecera de tests/e2e/e2e.mjs
python3 -m http.server 8000                         # servir local (los módulos ES requieren http, no file://)
# http://localhost:8000/?emulador  → conecta a los emuladores (solo en localhost; el modo se guarda por pestaña)
```
