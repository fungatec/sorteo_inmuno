# Sorteo de Inmunobiología · CUCBA

App web estática (GitHub Pages) con Firebase (Firestore + Auth) para registrar a los alumnos de la clase y sortear un libro. Contexto técnico completo en [`CLAUDE.md`](CLAUDE.md).

**Estado:** estructura, modelo de datos, reglas de seguridad y módulo de normalización listos. Las páginas son marcadores; la interfaz final se construye en el paso siguiente.

## Pasos manuales pendientes

1. **Pegar la configuración de Firebase** en `js/firebase-config.js` (Consola → ⚙ Configuración del proyecto → Tus apps → SDK → *Config*). No es un secreto, pero tampoco se deja a medias: sustituye todos los `PEGAR_AQUI`.
2. **Publicar las reglas:** Firebase Console → Firestore Database → **Reglas** → pegar el contenido completo de `firestore.rules` → **Publicar**.
3. **Crear `config/estado`** (Firestore → Datos → *Iniciar colección* `config` → ID `estado` → campo `registroAbierto` tipo *boolean* = `false`). Sin este documento el registro queda cerrado (a propósito).
4. **Autorizar el dominio:** Authentication → Configuración → **Dominios autorizados** → *Agregar dominio* → `fungatec.github.io` (solo el dominio, sin ruta ni `https://`; si el repositorio pasa a otro usuario/organización, usa su `<usuario>.github.io`).
5. **Activar GitHub Pages:** repositorio → Settings → Pages → *Deploy from a branch* → rama `main`, carpeta `/ (root)`. Con plan gratuito el repositorio debe ser **público**. Enlace a compartir: `https://fungatec.github.io/sorteo_inmuno/`.
6. **Cambiar la contraseña de la cuenta admin** (Authentication → Usuarios → `admin@admin.admin` → restablecer/editar) por una fuerte **antes del evento**. Con repositorio público, correo y UID son visibles y la contraseña es la única barrera; `admin123` permitiría a cualquiera leer a los participantes, borrarlos o cerrar el registro.
7. *(Recomendado)* Google Cloud Console → Credenciales → restringir la clave de API web a referentes HTTP `https://fungatec.github.io/*`.
8. **Probar las reglas** con los casos de [`docs/CASOS_PRUEBA_REGLAS.md`](docs/CASOS_PRUEBA_REGLAS.md) (Rules Playground) y, si hay tiempo, con el emulador (abajo). **Borra los documentos de prueba del Playground** antes de abrir el registro.
9. La **lista de la clase** se carga solo desde el panel de admin (cuando exista); no la agregues al repositorio.

## Pruebas

```bash
node tests/normalizar.test.mjs        # normalización (sin dependencias)
```

Reglas con el emulador de Firestore (batches y `serverTimestamp` reales; requiere Java 11+):

```bash
npm i --no-save firebase-tools @firebase/rules-unit-testing firebase
npx firebase emulators:exec --only firestore --project sorteoinmuno "node tests/reglas.emulador.mjs"
```

(Si `firebase.json` no existe, el emulador usa los puertos por defecto; pasa `--config` o crea uno con `{"firestore":{"rules":"firestore.rules"}}`.)

## Desarrollo local

`python3 -m http.server 8000` y abrir `http://localhost:8000` (los módulos ES no funcionan con `file://`). Para que el login funcione en local, `localhost` ya figura entre los dominios autorizados de Firebase por defecto.
