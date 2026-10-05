# Sorteo de Inmunobiología · CUCBA

App web estática (GitHub Pages) con Firebase (Firestore + Auth) para registrar a los alumnos de la clase y sortear un libro. Contexto técnico completo en [`CLAUDE.md`](CLAUDE.md).

**Estado:** interfaz funcional completa (registro, acceso, panel y sorteo), reglas de seguridad y normalización probadas con el emulador y en un navegador real. **Falta pegar el `firebaseConfig`** (paso 1): mientras haya marcadores `PEGAR_AQUI`, las páginas muestran un aviso en lugar de fallar.

## Cómo se usa

1. La admin entra en `login.html` con **Usuario `admin123`** y la contraseña de la cuenta.
2. En el panel → *Lista de la clase*: sube o pega un nombre por línea, **revisa** la vista previa (colisiones y líneas rechazadas) y guarda.
3. Abre el registro (botón en el panel) y comparte `https://fungatec.github.io/sorteo_inmuno/`.
4. En el panel, *Participantes* muestra el nombre oficial y avisa si lo tecleado difiere o no corresponde; *Alta manual* cubre a quien no pudo registrarse.
5. En el evento: cierra el registro, abre *Ir al sorteo*, haz un **ensayo** (casilla marcada) y luego los sorteos reales. Las rondas excluyen a los ganadores previos.

## Pasos manuales pendientes

1. **Pegar la configuración de Firebase** en `js/firebase-config.js` (Consola → ⚙ Configuración del proyecto → Tus apps → SDK → *Config*). No es un secreto, pero tampoco se deja a medias: sustituye todos los `PEGAR_AQUI`.
2. **Publicar las reglas:** Firebase Console → Firestore Database → **Reglas** → pegar el contenido completo de `firestore.rules` → **Publicar**.
3. **Crear `config/estado`** (Firestore → Datos → *Iniciar colección* `config` → ID `estado` → campo `registroAbierto` tipo *boolean* = `false`). Sin este documento el registro queda cerrado (a propósito).
4. **Autorizar el dominio:** Authentication → Configuración → **Dominios autorizados** → *Agregar dominio* → `fungatec.github.io` (solo el dominio, sin ruta ni `https://`; si el repositorio pasa a otro usuario/organización, usa su `<usuario>.github.io`).
5. **Activar GitHub Pages:** repositorio → Settings → Pages → *Deploy from a branch* → rama `main`, carpeta `/ (root)`. Con plan gratuito el repositorio debe ser **público**. Enlace a compartir: `https://fungatec.github.io/sorteo_inmuno/`.
6. **Usar una contraseña fuerte en la cuenta admin** (Authentication → Usuarios → `admin@admin.admin`). El usuario `admin123`, el correo y el UID son visibles en el repositorio público; la contraseña es la única barrera: quien la adivine puede leer a los participantes, borrarlos, cerrar el registro o crear sorteos.
7. *(Recomendado)* Google Cloud Console → Credenciales → restringir la clave de API web a referentes HTTP `https://fungatec.github.io/*`.
8. **Probar las reglas** con los casos de [`docs/CASOS_PRUEBA_REGLAS.md`](docs/CASOS_PRUEBA_REGLAS.md) (Rules Playground) y, si hay tiempo, con el emulador (abajo). **Borra los documentos de prueba del Playground** antes de abrir el registro.
9. La **lista de la clase** se carga solo desde el panel de admin; no la agregues al repositorio.

## Pruebas

```bash
node tests/normalizar.test.mjs        # normalización (sin dependencias)
node tests/azar.test.mjs              # aleatoriedad del sorteo (sin dependencias)
```

Reglas con el emulador de Firestore (batches y `serverTimestamp` reales; requiere Java 11+):

```bash
npm i --no-save firebase-tools @firebase/rules-unit-testing firebase
npx firebase emulators:exec --only firestore --project sorteoinmuno "node tests/reglas.emulador.mjs"
```

(Si `firebase.json` no existe, el emulador usa los puertos por defecto; pasa `--config` o crea uno con `{"firestore":{"rules":"firestore.rules"}}`.)

De extremo a extremo (navegador real + emuladores de Auth y Firestore, 27 casos con datos ficticios): ver la cabecera de `tests/e2e/e2e.mjs`.

## Desarrollo local

`python3 -m http.server 8000` y abrir `http://localhost:8000` (los módulos ES no funcionan con `file://`). Para que el login funcione en local, `localhost` ya figura entre los dominios autorizados de Firebase por defecto. Abrir `http://localhost:8000/?emulador` conecta a los emuladores locales (solo en `localhost`).
