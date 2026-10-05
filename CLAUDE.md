# CLAUDE.md — Sorteo de Inmunobiología (CUCBA · UdeG)

## Reglas de trabajo (leer primero)

- **No hacer `git push`, abrir PR, publicar reglas ni desplegar (GitHub Pages / Firebase) sin aprobación explícita del autor.** Hacer commits locales está bien; todo lo que salga de la máquina se pide antes.
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
js/registro.js  login.js  panel.js  sorteo.js        lógica por página (stubs)
firestore.rules                                      reglas de seguridad (fuente de verdad)
tests/normalizar.test.mjs                            node tests/normalizar.test.mjs
tests/reglas.emulador.mjs                            pruebas de reglas con emulador (ver README)
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
| `sorteos/{id}` | `fecha` (= serverTimestamp), `totalParticipantes`, `ganadorClave`, `ronda` | Inmutables. |

Al **borrar** un participante hay que borrar también su `correos/{correo}` (mismo batch); las reglas no lo fuerzan.

## Normalización (`js/normalizar.js`, única fuente)

`claveDeNombre`: minúsculas → NFD y quitar marcas combinantes (ñ→n) → eliminar todo lo que no sea `a-z` o espacio → colapsar espacios → separar en palabras → **ordenar alfabéticamente** → unir con `-`.
`"Jonathan Gómez Peregrina"` y `"gomez peregrina JONATHAN"` → `gomez-jonathan-peregrina`.

**Por qué se ordenan las palabras:** los alumnos escriben nombre y apellidos en órdenes distintos (apellidos primero, o al revés); ordenar hace que la clave sea independiente del orden. Costo: dos personas con las mismas palabras en otro orden, u homónimos, colisionan (la carga de lista debe detectarlo y avisar).

Límites asumidos (documentados, no resueltos): la coincidencia es por **conjunto exacto de palabras** (omitir un apellido o añadir un segundo nombre no coincide); guiones y apóstrofos se eliminan sin dejar espacio (`Pérez-Gil` → `perezgil` ≠ `Pérez Gil`); letras no descomponibles (ß, ø) se descartan. Una clave vacía debe rechazarse.

Correo: minúsculas y sin espacios, debe terminar en `@alumnos.udg.mx` (`normalizarCorreo`, `esCorreoValido`). Nombre: se guarda recortado y con espacios colapsados, 5–100 caracteres (`limpiarNombre`, `validarNombre`).

> `js/normalizar.js` y `firestore.rules` validan lo mismo en dos lenguajes (`RE_CORREO` ↔ `correoValido`, longitudes, patrón de clave). Si se cambia uno, cambiar el otro y correr ambas suites.

## Reglas de seguridad y validación

Resumen (el detalle comentado está en `firestore.rules`):

- **Público (sin sesión):** solo **crear** `participantes` + `correos` en un batch, y solo si `registroAbierto == true`, la clave existe en `lista`, ID == campo `clave`, el doc no existe, campos exactamente `nombre, clave, correo, origen, creadoEn`, correo válido, `origen == "registro"`, `creadoEn == request.time`, y ambos docs se crean juntos apuntando a la misma clave (`existsAfter`/`getAfter`). Solo puede **leer** `config/estado`.
- **Admin:** lee todo; CRUD en `lista`; crea (origen `"admin"`, mismas validaciones de formato, sin exigir registro abierto ni lista) y borra en `participantes`/`correos`; escribe `config/estado`; crea `sorteos`. No hay `update` de participantes ni de sorteos.
- Todo lo demás: denegado.

### Errores en el registro (decisión de privacidad)

Firestore devuelve **siempre** `permission-denied`, sin distinguir causa. Por tanto:
- "Registro cerrado" **sí** se distingue: leer `config/estado` antes de enviar.
- "Nombre fuera de lista" / "ya registrado" / "correo ya usado" **no** se distinguen: mostrar un mensaje único y honesto (p. ej. «No pudimos completar tu registro. Revisa que tu nombre esté escrito como en la lista de la clase y que no te hayas registrado antes; si persiste, avisa a la maestra.»).
- No abrir lecturas públicas para afinar el mensaje: permitir `get` en `lista`/`participantes`/`correos` dejaría a cualquiera confirmar por adivinanza quién pertenece a la clase o ya se registró (y filtraría correos).

### Límites conocidos (no ocultar)

- No hay verificación de identidad: los nombres no son secretos y el correo no se verifica. Alguien podría registrar a un compañero (o un externo con un nombre conocido) con un correo inventado. Mitigación: la admin revisa la tabla de participantes, borra y da de alta manualmente.
- Las reglas no pueden recalcular la clave desde `nombre`. Un cliente malicioso puede guardar un `nombre` arbitrario bajo la clave de otra persona. **La pantalla del sorteo y cualquier proyección pública deben mostrar `lista/{clave}.nombre` (oficial), nunca `participantes.nombre`.**
- Cuenta admin compartida: la contraseña es la única barrera (el repo es público ⇒ correo y UID visibles). Debe ser fuerte y **no** `admin123`. Sin bitácora por persona.

## Autenticación de admin

El login muestra «Usuario» y «Contraseña». Si Usuario (sin distinguir mayúsculas, recortado) es `ADMIN_USUARIO` (`admin`), se llama a `signInWithEmailAndPassword(auth, ADMIN_CORREO, contraseña)`. **La contraseña no existe en el código**: solo se teclea. Tras autenticar, verificar `getDoc(admins/{uid})`; `permission-denied`/inexistente ⇒ cerrar sesión. Todas las páginas de admin (`panel`, `sorteo`) redirigen a `login.html` sin sesión de admin.

## Sorteo (pautas para el paso correspondiente)

- Aleatoriedad con `crypto.getRandomValues` y **muestreo por rechazo** (sin sesgo de módulo); nunca `Math.random`.
- Elegir entre participantes leídos al momento; guardar `sorteos` con `totalParticipantes`, `ganadorClave`, `ronda` y `fecha` = `serverTimestamp()` (las reglas lo exigen).
- Rondas: por defecto se excluyen los ganadores de rondas previas del mismo evento (confirmar con el autor).
- Mostrar solo el nombre oficial del ganador; no listar correos ni la tabla completa en pantalla pública.

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
node tests/normalizar.test.mjs                      # pruebas de normalización (sin dependencias)
# Pruebas de reglas (requiere Java; ver README):
npm i --no-save firebase-tools @firebase/rules-unit-testing firebase
npx firebase emulators:exec --only firestore --project sorteoinmuno "node tests/reglas.emulador.mjs"
python3 -m http.server 8000                         # servir local (los módulos ES requieren http, no file://)
```
