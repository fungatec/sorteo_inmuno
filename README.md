# Sorteo de Inmunobiología · CUCBA

App web estática (GitHub Pages) con Firebase (Firestore + Auth) para registrar a los alumnos de la clase y sortear un libro. Contexto técnico completo en [`CLAUDE.md`](CLAUDE.md).

**Estado:** interfaz funcional completa (registro, acceso, panel y sorteo), reglas de seguridad y normalización probadas con el emulador y en un navegador real. El `firebaseConfig` ya está pegado; si algún día vuelven marcadores `PEGAR_AQUI`, las páginas muestran un aviso en lugar de fallar.

## Cómo se usa

1. La admin entra en `login.html` con **Usuario `admin123`** y la contraseña de la cuenta.
2. En el panel → *Lista de la clase*: sube o pega un nombre por línea (se limpian viñetas, asteriscos, numeración y puntos finales), **revisa** la vista previa (total leído, los 3 primeros con la máscara, colisiones y líneas rechazadas) y guarda. Los nombres no pueden llevar `< > &` ni comillas (ni apóstrofos).
3. Abre el registro (botón en el panel) y comparte `https://fungatec.github.io/sorteo_inmuno/`.
4. En el panel, *Participantes* muestra el nombre oficial y avisa si lo tecleado difiere o no corresponde; *Alta manual* cubre a quien no pudo registrarse.
5. En el evento: cierra el registro, abre *Ir al sorteo*, pulsa **F** (pantalla completa), haz un **ensayo** (casilla marcada) y luego los sorteos reales. *Activar otro linfocito* (nueva ronda) excluye a los ganadores previos. En pantalla sale una máscara `Nombre I. I.`; *Mostrar nombre completo* (tecla **N**) revela el nombre oficial. Atajos: **Espacio** inicia, **S** salta de escena, **C** subtítulos, **I** ficha inmunológica, **F** pantalla completa, **N** nombre completo.
6. **Al terminar el evento:** pulsa **Descargar registro del sorteo** (constancia en `.txt`) y después **Vaciar datos** en el panel (escribe `BORRAR`). Es lo que cumple el aviso de privacidad del registro («se eliminarán al terminar el evento»).

**Entrada de estudiantes y acceso de administración:** la URL raíz (`/sorteo_inmuno/`) abre **siempre** el registro (o «El registro está cerrado»), aunque haya una sesión de admin iniciada: `index.html` nunca redirige según la sesión. El acceso de administración es el enlace discreto «Administración» de la cabecera (va a `login.html`, o a `panel.html` si ya hay sesión de admin). `login.html`, `panel.html` y `sorteo.html` llevan `<meta name="robots" content="noindex">` para que los buscadores no los listen. **Ocultar el enlace no es seguridad:** las URL de administración son públicas (el repositorio lo es); la protección real son las reglas de Firestore y la contraseña de la cuenta admin.

**Enlaces y vista previa:** el panel copia los enlaces de registro y de transmisión y puede mostrar sus códigos QR (se generan en el navegador, sin enviar datos a terceros; solo se descarga la librería `qrcode-generator` 1.4.4 de cdnjs al pulsar «Mostrar códigos QR»). Los enlaces se ven con imagen y título en WhatsApp gracias a las etiquetas Open Graph (`img/og.png`, 1200×630). Para regenerar las imágenes: `npm i --no-save playwright-core && CHROMIUM_PATH=/ruta/a/chrome node tools/generar-og.mjs` (herramienta manual; no forma parte del sitio). WhatsApp guarda en caché la vista previa: si cambias la imagen, usa el depurador de Facebook para forzar la actualización.

## Pasos manuales pendientes

> Lista completa para publicar, probar en el celular y operar el evento: [`docs/CHECKLIST_PUBLICACION.md`](docs/CHECKLIST_PUBLICACION.md).

1. ~~Pegar la configuración de Firebase en `js/firebase-config.js`~~ — **hecho**.
2. **Publicar las reglas** (otra vez, si ya las publicaste: el Paso 2 permite al admin borrar `sorteos`, el Paso 3 exige `adminUid` al crearlos y el Paso 4 rechaza `< > &` y comillas en los nombres y el Paso 6 añade `publico/sorteo` para la transmisión en vivo; sin esta última, el sorteo funciona igual pero la transmisión no publica): Firebase Console → Firestore Database → **Reglas** → pegar el contenido completo de `firestore.rules` → **Publicar**. Sin esto, el sorteo no se puede guardar y el vaciado falla.
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
node tests/sorteo-util.test.mjs       # máscara, formato título y registro descargable (sin dependencias)
node tests/login-errores.test.mjs     # errores del login (sin dependencias)
node tests/errores-guardado.test.mjs  # errores al guardar la ronda (sin dependencias)
node tests/contenido-cientifico.test.mjs  # límites del contenido científico (sin dependencias)
node tests/en-vivo-util.test.mjs      # guion, vista y umbrales de la transmisión en vivo (sin dependencias)
```

Reglas con el emulador de Firestore (batches y `serverTimestamp` reales; requiere Java 11+):

```bash
npm i --no-save firebase-tools @firebase/rules-unit-testing firebase
npx firebase emulators:exec --only firestore --project sorteoinmuno "node tests/reglas.emulador.mjs"
```

(Si `firebase.json` no existe, el emulador usa los puertos por defecto; pasa `--config` o crea uno con `{"firestore":{"rules":"firestore.rules"}}`.)

De extremo a extremo (navegador real + emuladores de Auth y Firestore, 73 casos con datos ficticios): ver la cabecera de `tests/e2e/e2e.mjs`.

## Desarrollo local

`python3 -m http.server 8000` y abrir `http://localhost:8000` (los módulos ES no funcionan con `file://`). Para que el login funcione en local, `localhost` ya figura entre los dominios autorizados de Firebase por defecto. Abrir `http://localhost:8000/?emulador` conecta a los emuladores locales (solo en `localhost`).

## La animación del sorteo: respuesta inmune a *Listeria monocytogenes*

**Regla:** todo texto de la interfaz debe ser biológicamente correcto; ante la duda, usa solo la sección «Contenido científico» (`js/contenido-cientifico.js`, fuente de verdad) y marca lo incierto con **[VERIFICAR]** aquí.

Cada participante es un **linfocito T virgen** que patrulla un ganglio linfático; una **célula dendrítica** llega del tejido infectado con antígeno y activa a uno, que prolifera. El libro no forma parte de la historia biológica. Guion de la historia completa (≈ 30 s): E0 elenco opcional (frotis de sangre, +5 s) · E1 inmunidad innata en el tejido (epitelio roto, macrófago residente, TLR, citocinas) · E2 neutrófilos (rodamiento, adhesión, diapédesis, fagocitosis, ROS, NET) · E3 la célula dendrítica captura, madura y viaja al ganglio · E4 el ganglio: encuentro con linfocitos T vírgenes · E5 sinapsis inmunológica con tres señales (TCR–MHC, CD28–CD80/86, citocinas) · E6 proliferación con IL-2 y final CD8 (perforina y granzimas) o CD4 (IFN-γ y macrófago activado). Las rondas siguientes arrancan en E4 (≈ 16 s). Los participantes no elegidos **no mueren ni desaparecen**; la proporción CD4:CD8 (2:1) es solo ilustrativa y **independiente del sorteo**; el azar es la regla del sorteo (todos tienen la misma probabilidad), no una afirmación sobre la biología.

**Modos de la pantalla de sorteo:** por defecto, una animación resumida de ≈ 17 s (tarjeta de 3 s «Una infección activó a una célula dendrítica. Llega al ganglio linfático.» + escenas E4–E6) con subtítulos sencillos; el botón secundario **«Sortear con historia completa»** (o `sorteo.html?modo=completo`) usa la historia completa de ≈ 30 s con barra «minutos → horas → días» (y, en `?modo=completo`, la casilla del elenco). Las teclas siguen funcionando pero ya no se muestran.

**Plan B:** `https://fungatec.github.io/sorteo_inmuno/sorteo.html?modo=clasico` abre la animación anterior (selección clonal de linfocitos B, ≈ 11 s). El guardado de la ronda ocurre **antes** de revelar en ambos modos.

**Puntos marcados [VERIFICAR] (revisar con la asesoría inmunológica antes del evento):**
- [VERIFICAR] Frecuencia de precursores específicos de antígeno: del orden de 1 en 10^5–10^6 linfocitos T vírgenes (dato de la ficha).
- [VERIFICAR] Escalas de la barra de tiempo («minutos → horas → días»): se reparte en tercios, de forma cualitativa.
- [VERIFICAR] NET con *Listeria* como ejemplo de neutrófilo: la formación de NET se muestra como mecanismo general.
- [VERIFICAR] Bacilos dibujados ×2,2 su tamaño relativo, por legibilidad.
- [VERIFICAR] «Vénula poscapilar» como sitio de extravasación (el esquema no dibuja capilares).
- [VERIFICAR] «El encuentro es al azar» se refiere solo a la motilidad del linfocito, no a la selección.
- [VERIFICAR] El monocito de la ficha no lleva tamaño ni rasgo porque no figuraba en el contenido provisto.

**Fuentes:** Abbas, A. K., Lichtman, A. H., & Pillai, S. (2022); Murphy, K., & Weaver, C. (2022), *Janeway's immunobiology* (10.ª ed.); Banchereau, J., & Steinman, R. M. (1998), *Nature* 392; Kolaczkowska, E., & Kubes, P. (2013), *Nat Rev Immunol* 13; Brinkmann, V. et al. (2004), *Science* 303; Rosenberg, H. F. et al. (2013); Voehringer, D. (2013); Jenkins, M. K., & Moon, J. J. (2012), *J Immunol* 188. Las referencias completas están en `FUENTES`.

**Pruebas de la animación:** E2E con ronda real (3 participantes), 100 participantes (≈ 60 fps, revelación a ≈ 30 s), `prefers-reduced-motion` y modo clásico; auditoría axe sin violaciones (incluida la ficha).

## Transmisión en vivo (`en-vivo.html`)

Cualquiera con el enlace (`https://fungatec.github.io/sorteo_inmuno/en-vivo.html`) ve desde su celular el avance del sorteo y la **máscara** del ganador (por ejemplo, «Marta E. R. V. S.»), sin iniciar sesión. El enlace se copia con «Copiar enlace de transmisión» (panel y pantalla de sorteo) y se ofrece a los alumnos como «Ver el sorteo en vivo» al terminar el registro o si está cerrado.

- **Qué se publica:** un único documento `publico/sorteo` (`espera` · `animando` con ronda, modo y tipo · `revelado` con la máscara). Nunca la clave ni el nombre completo, y la máscara solo desde el revelado. «Vaciar datos» lo deja en `espera`. El aviso de privacidad del registro lo dice.
- **Solo sorteos reales:** el modo Ensayo y el modo clásico no publican nada (en el modo clásico los celulares se quedan en «Esperando el sorteo…»). Si la publicación falla, el sorteo del proyector no se ve afectado: solo aparece un aviso discreto.
- **Costo en Firestore (plan Spark: 50 000 lecturas y 20 000 escrituras al día) de una ronda real con 50 espectadores**, medido en el emulador con 50 clientes independientes: **150 lecturas** en la primera ronda (50 de la conexión inicial + 50 por el cambio a «animando» + 50 por «revelado») y **100** en las siguientes (se cobra 1 lectura por documento entregado a cada oyente); **3 escrituras** del admin (1 en `sorteos` y 2 en `publico/sorteo`) más unas 4 lecturas de reglas (`exists` de admin y del ganador). Con 10 rondas serían ≈ 1 100 lecturas: lejos del límite. Un espectador cuya conexión estuvo cortada más de 30 minutos se vuelve a cobrar como una lectura inicial.
- **Republicar reglas:** el Paso 6 cambia `firestore.rules` (bloque `match /publico/sorteo`); hay que republicarlas para que la transmisión funcione.
