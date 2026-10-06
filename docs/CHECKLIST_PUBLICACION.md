# Checklist de publicación, prueba en celular y día del evento

Marca cada casilla al terminarla. **Nada de esto lo hace Claude**: publicar reglas, hacer el merge y activar Pages son pasos tuyos.
Para las pruebas usa **nombres ficticios** (no cargues todavía la lista real).

## A · Firebase (consola de `sorteoinmuno`)

- [ ] **Reglas publicadas:** Firestore → Reglas → pegar **todo** `firestore.rules` de esta rama → Publicar. (Cambiaron en el Paso 2 —admin puede borrar `sorteos`—, en el Paso 3 —`sorteos` exige `adminUid`— y ahora —los nombres no pueden llevar `< > &` ni comillas—; sin esta versión el sorteo y «Vaciar datos» fallan y la carga de la lista rechaza líneas con apóstrofos.) Anota la fecha/hora que muestra «Última publicación».
- [ ] **`config/estado`** existe con `registroAbierto` = `false` (boolean).
- [ ] **`admins/i0y2lNrbtRed5L7dTIUFTLSKeQr1`** existe (cualquier campo).
- [ ] **Contraseña de la cuenta admin fuerte** (Authentication → Usuarios → `admin@admin.admin`). Usuario en el login: `admin123`. Compártela solo con la maestra, fuera del repositorio y del chat del grupo.
- [ ] **Dominio autorizado:** Authentication → Configuración → Dominios autorizados → `fungatec.github.io`.
- [ ] *(Recomendado, con cuidado)* Google Cloud → APIs y servicios → Credenciales → clave de API web → restricción de referentes HTTP: `https://fungatec.github.io/*`. **Si te equivocas aquí se rompe todo** (login, registro y sorteo fallan con «clave de API rechazada»): después de guardarla, repite la prueba C completa. Si algo falla, quita la restricción y vuelve a probar.
- [ ] *(Opcional)* Prueba rápida de reglas en el Rules Playground con `docs/CASOS_PRUEBA_REGLAS.md`; borra los documentos de prueba.

## B · GitHub Pages

- [ ] Revisa el diff de `claude/sweet-dijkstra-trep4b` y haz **tú** el merge a `main`.
- [ ] Settings → Pages → *Deploy from a branch* → `main` / `(root)`. (Plan gratuito: el repositorio debe ser público.)
- [ ] Espera a que el flujo «pages build and deployment» (Actions) quede en verde.
- [ ] Abre `https://fungatec.github.io/sorteo_inmuno/` con recarga forzada (Ctrl/Cmd + Mayús + R).
  - [ ] No aparece el aviso «Configuración de Firebase pendiente».
  - [ ] Dice «Registro cerrado» / «El registro está cerrado» (porque `registroAbierto` = false).
  - [ ] Las rutas relativas cargan (estilos, íconos de células, sin 404 en la consola del navegador).

## C · Prueba completa en el celular (ensayo general, con datos ficticios)

Necesitas: un celular **con datos móviles** (no la Wi-Fi del evento), una laptop y, si puedes, el proyector real.

1. [ ] **Login** (laptop o celular): `login.html` → Usuario `admin123` + contraseña. Entra al panel.
   - [ ] Con otro usuario (p. ej. `admin`) o contraseña mala: «Usuario o contraseña incorrectos» (el mismo mensaje en ambos casos). El usuario con espacios o en mayúsculas (`  ADMIN123`) sí entra.
   - [ ] Si ves un mensaje de «clave de API», «método de acceso desactivado», «dominio no autorizado» o «sin conexión», es de configuración o red, no de la contraseña; abre la consola del navegador (F12) y busca `[login] error de Firebase:` para ver el código.
2. [ ] **Lista de prueba:** Panel → Lista de la clase → pega 6 nombres ficticios en MAYÚSCULAS y sin acentos, algunos con viñeta o punto final (`• ANA PEREZ-GIL.`), uno con partícula (`ROSA DE LOS RIOS MORA`), y uno repetido con otro orden → *Revisar lista*. Comprueba el total leído, que la vista previa muestre los 3 primeros con la máscara (`Ana P. G.`…), que detecte la colisión y que **no** la guarde. Guarda y confirma en Firestore que el nombre quedó **sin** viñeta ni punto.
3. [ ] **Abrir el registro** (interruptor del panel).
4. [ ] **En el celular** abre el enlace de Pages y prueba:
   - [ ] Registro válido con un nombre de la lista (otro orden, sin acentos) y un correo `@alumnos.udg.mx` → ves «{Nombre}, tu linfocito T virgen ya patrulla el ganglio linfático…» con la animación del linfocito cruzando la vénula.
   - [ ] Correo `@gmail.com` → «El correo debe ser @alumnos.udg.mx» (sin enviar).
   - [ ] Nombre que no está en la lista → mensaje único («No pudimos completar tu registro…»).
   - [ ] Repetir el mismo nombre → mismo mensaje único.
   - [ ] Repetir el correo con otro nombre → mismo mensaje único.
   - [ ] Modo avión + enviar → «No pudimos conectar…».
   - [ ] Tamaño de pantalla pequeño: nada se corta ni hay desplazamiento horizontal.
5. [ ] **Cerrar el registro** en el panel → recarga el celular: «El registro está cerrado».
6. [ ] **Panel:** *Participantes* muestra el **nombre oficial**; si alguien tecleó distinto sale «escrito distinto»; la búsqueda encuentra sin acentos; *Alta manual* agrega a alguien aunque esté cerrado; *Eliminar* lo quita.
7. [ ] **Sorteo (ensayo):** `sorteo.html` → marca *Ensayo* → *Iniciar la respuesta inmune*.
   - [ ] Dura ~30 s (escenas E1–E6, subtítulos de ≤ 18 palabras y barra «minutos → horas → días»); la tecla **S** salta de escena, **C** oculta los subtítulos, **I** abre la ficha inmunológica. Sale una **máscara en formato título** (`Marta E. R. V. S.`), no el nombre completo.
   - [ ] *Mostrar nombre completo* (o tecla **N**) muestra el nombre **oficial** de la lista en formato título (`Marta Elena Rios y Vega Soto`).
   - [ ] *Activar otro linfocito* (o **Espacio**) elige a otra persona; la nueva ronda arranca en la escena E4 (~16 s) con el subtítulo «Una respuesta real es policlonal…».
   - [ ] **Plan B:** abre `sorteo.html?modo=clasico` y comprueba que la animación anterior (≈ 11 s, «Liberar el antígeno» / «Volver a sortear») funciona. Úsala si el proyector o el equipo no mueven bien la animación nueva.
   - [ ] **Pantalla completa** (tecla **F**) en la laptop y, si hay, en el proyector: se ve nítido, los botones se ocultan a los 3 s y reaparecen al mover el ratón.
8. [ ] **Sorteo real de prueba:** desmarca *Ensayo*, sortea una vez → en Firestore aparece `sorteos/…` con `fecha`, `totalParticipantes`, `ganadorClave`, `ronda`, `adminUid`.
9. [ ] **Descargar registro del sorteo** (Panel, «Al terminar el evento») → abre el `.txt`: fecha, ronda, total y ganador con nombre oficial.
10. [ ] **Vaciar datos:** escribe `BORRAR`. En Firestore verifica que `lista`, `participantes`, `correos` y `sorteos` quedaron **vacías**, que `config/estado` sigue existiendo (en `false`) y que `admins` está intacto.
11. [ ] **Cierre de sesión:** *Salir*; abrir `panel.html` directo te manda al login.

## D · Día del evento (resumen; el detalle está en el informe)

- [ ] Carga la **lista real** en el panel (desde tu laptop; no la guardes en el repositorio). Revisa colisiones.
- [ ] Abre el registro; comparte el enlace. Vigila *Participantes* y las advertencias.
- [ ] **Cierra el registro** antes del sorteo. Haz un **ensayo** (casilla marcada) con el proyector.
- [ ] Sorteo real: **desmarca Ensayo**. Si el ganador no está presente: *Activar otro linfocito*.
- [ ] Al terminar: **Descargar registro del sorteo** → **Vaciar datos** (`BORRAR`).

## E · Si algo falla

| Síntoma | Qué hacer |
|---|---|
| «No se pudo guardar el sorteo, así que no se reveló a nadie» | Revisa la conexión y reintenta (no se perdió nada). Si persiste: ¿publicaste la última versión de las reglas? |
| Login rechazado | Usuario exacto `admin123`; revisa la contraseña en Authentication; ¿dominio autorizado? |
| «Sin permisos de administrador» | Falta `admins/<UID>` o el UID cambió (se recreó la cuenta). |
| Nadie puede registrarse | ¿`config/estado.registroAbierto` es `true`? ¿Está la lista cargada? ¿Reglas publicadas? |
| Página sin estilos / 404 | Pages aún desplegando, o ruta absoluta; recarga forzada. |
| Sin internet en el evento | Hotspot del celular; el sorteo necesita Firestore (lee participantes y guarda la ronda). |
| Pantalla completa no disponible (iPhone/iPad) | Usa una laptop; en iOS el navegador no permite pantalla completa de un elemento. |
