# Casos de prueba para el Rules Playground

Consola Firebase → Firestore → Reglas → **Simulador de reglas** (Rules Playground). Usa **nombres ficticios**.

## Limitaciones del Playground (leer antes)

- Simula **una operación a la vez**, contra los **datos reales** de Firestore. No simula un `writeBatch`. Como las reglas exigen el documento par con `existsAfter`/`getAfter`, para probar `participantes/{clave}` hay que crear antes, a mano, el `correos/{correo}` correspondiente (y viceversa).
- No he verificado si el editor del Playground permite expresar `request.time` para `creadoEn`. Si no lo permite, esos casos no se pueden decidir ahí; la suite del emulador (`tests/reglas.emulador.mjs`, 38 casos) sí los cubre con `serverTimestamp()` real.
- **Los documentos de prueba son datos reales:** bórralos al terminar (sobre todo `config/estado`, que debe quedar según lo quieras para el evento).

## Datos de preparación (crear a mano en la consola)

| Documento | Contenido |
|---|---|
| `config/estado` | `registroAbierto: true` (boolean) |
| `lista/prueba-uno` | `nombre: "Uno Prueba"` |
| `lista/prueba-dos` | `nombre: "Dos Prueba"` |
| `correos/uno.prueba@alumnos.udg.mx` | `clave: "prueba-uno"` *(par para el caso 1)* |
| `participantes/prueba-dos` | `nombre: "Dos Prueba"`, `clave: "prueba-dos"`, `correo: "dos.prueba@alumnos.udg.mx"`, `origen: "registro"`, `creadoEn: <timestamp>` |
| `correos/dos.prueba@alumnos.udg.mx` | `clave: "prueba-dos"` |
| `correos/fuera.lista@alumnos.udg.mx` | `clave: "fuera-lista"` *(par para el caso 2)* |
| `correos/uno.prueba@gmail.com` | `clave: "prueba-uno"` *(par para el caso 3)* — solo si quieres aislar la causa; el caso se niega igual |

Cuerpo base de un participante (`creadoEn` = `request.time`):
`{ nombre, clave, correo, origen: "registro", creadoEn }`.

## Casos (todos **sin autenticar** salvo indicación)

| # | Operación y ruta | Datos | Resultado esperado |
|---|---|---|---|
| 1 | **create** `/participantes/prueba-uno` — nombre **en lista** | `nombre:"Uno Prueba"`, `clave:"prueba-uno"`, `correo:"uno.prueba@alumnos.udg.mx"`, `origen:"registro"`, `creadoEn:request.time` | **Permitido** |
| 2 | **create** `/participantes/fuera-lista` — nombre **fuera de lista** | `nombre:"Fuera Lista"`, `clave:"fuera-lista"`, `correo:"fuera.lista@alumnos.udg.mx"`, mismo resto | **Denegado** (`exists(lista/fuera-lista)` es falso) |
| 3 | **create** `/participantes/prueba-uno` — **correo @gmail** | igual que 1 con `correo:"uno.prueba@gmail.com"` | **Denegado** (formato de correo) |
| 4 | **create** `/participantes/prueba-dos` — **duplicado por nombre** | `nombre:"Dos Prueba"`, `clave:"prueba-dos"`, `correo:"otro.dos@alumnos.udg.mx"`, mismo resto | **Denegado** (el documento ya existe) |
| 5a | **create** `/correos/dos.prueba@alumnos.udg.mx` — **duplicado por correo** | `clave:"prueba-uno"` | **Denegado** (el correo ya existe) |
| 5b | **create** `/participantes/prueba-uno` con el correo ya usado | igual que 1 con `correo:"dos.prueba@alumnos.udg.mx"` | **Denegado** (`getAfter(correos/…).clave` es `prueba-dos`, no `prueba-uno`) |
| 6 | **Registro cerrado**: cambia `config/estado.registroAbierto` a `false` y repite el caso 1 | como 1 | **Denegado**. Vuelve a poner `true` al terminar |
| 7a | **get** `/participantes/prueba-dos` — sin autenticar | — | **Denegado** |
| 7b | **get** `/participantes/prueba-dos` — autenticado como usuario cualquiera (UID `uid-cualquiera`) | — | **Denegado** |
| 7c | **get** `/participantes/prueba-dos` — autenticado con UID `i0y2lNrbtRed5L7dTIUFTLSKeQr1` | — | **Permitido** |
| 8 | **get** `/config/estado` — sin autenticar | — | **Permitido** |
| 9 | **get** `/lista/prueba-uno` — sin autenticar | — | **Denegado** |

| 10 | **delete** `/sorteos/x` — sin autenticar | — | **Denegado** |
| 11 | **delete** `/sorteos/x` — autenticado como admin (UID `i0y2lNrbtRed5L7dTIUFTLSKeQr1`) | — | **Permitido** (solo se usa en «Vaciar datos») |
| 12 | **update** `/sorteos/x` — admin | cualquier cambio | **Denegado** |
| 13 | **create** `/sorteos/nuevo` — admin, con `fecha`=`request.time`, `totalParticipantes`=1, `ganadorClave` de un participante que exista, `ronda`=1 y `adminUid` = su UID | — | **Permitido** |
| 14 | Igual que 13 pero `adminUid` distinto del UID de la sesión, o sin `adminUid` | — | **Denegado** |
| 15 | **create** `/sorteos/nuevo` — sin autenticar o usuario no-admin | como 13 | **Denegado** |

| 16 | **create** `/participantes/prueba-uno` — nombre con marcado o comillas | `nombre: "<img src=x onerror=alert(1)>"` (o `Ana & López`, `Ana "Lola" López`, `Ana 'Lola' López`, `Ana “López”`) y el resto como el caso 1 | **Denegado** (antes del Paso 4 se aceptaba) |
| 17 | **create** `/lista/prueba-tres` — admin, `nombre` con `<`, `>`, `&` o comillas | — | **Denegado** |

| 18 | **get** `/publico/sorteo` — sin autenticar | — | **Permitido** |
| 19 | **list** de la colección `/publico`, o **create/update/delete** de `/publico/sorteo` sin autenticar o como no-admin | — | **Denegado** |
| 20 | **create/update** `/publico/sorteo` — admin | `{estado:"animando", ronda:1, modo:"resumido", tipo:"CD8", inicio:request.time}` | **Permitido** |
| 21 | Igual que 20 con `ganadorMascara` en `animando`, o con `ganadorClave`, o `tipo:"CD3"`, o `modo:"clasico"` | — | **Denegado** |
| 22 | **create/update** — admin | `{estado:"revelado", ronda:1, modo:"resumido", tipo:"CD8", inicio:request.time, ganadorMascara:"Marta E. R."}` | **Permitido** (con `<`, `>`, `&`, comillas, vacío o > 60 caracteres: **Denegado**) |
| 23 | **create/update** — admin | `{estado:"espera"}` (lo que deja «Vaciar datos») | **Permitido** |

Casos extra recomendados: campo adicional (`x:1`) → Denegado; `origen:"admin"` sin ser admin → Denegado; `nombre` de 4 caracteres → Denegado; `update` o `delete` de un participante sin ser admin → Denegado.

## Limpieza

Borra `lista/prueba-*`, `participantes/prueba-*`, `correos/*prueba*`, `correos/fuera.lista@…` y confirma que `config/estado` queda como corresponda.

## Equivalencia con los casos del Paso 1 en la suite del emulador (`tests/reglas.emulador.mjs`, 62 casos)

| Caso del Paso 1 | Prueba del emulador (resultado esperado) |
|---|---|
| Nombre en la lista | «público: registro válido (nombre en lista)» → permitido |
| Nombre fuera de la lista | «público: nombre fuera de lista» → denegado |
| Correo @gmail | «público: correo @gmail» → denegado |
| Duplicado por nombre | «público: duplicado por nombre» → denegado |
| Duplicado por correo | «público: duplicado por correo» → denegado |
| Registro cerrado | «registro cerrado: público no puede registrarse» → denegado; el admin sí puede dar de alta |
| No-admin leyendo `participantes` | «público: no lee participantes/…» y «no-admin autenticado: no lee participantes» → denegado; además, «no pueden LISTAR la colección …» para `lista`, `participantes`, `correos`, `sorteos`, `config` y `admins` |
