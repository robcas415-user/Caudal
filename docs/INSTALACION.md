# Instalación de Caudal (para Robert)

Todo es gratis: Google Sheets guarda los datos, Apps Script es la "API" y manda los
correos, Netlify sirve la app, y Atajos/Scriptable en el iPhone hacen la captura
automática y el widget. Tiempo aproximado: 25–30 minutos la primera vez.

```
iPhone (Apple Pay) ──Atajo "Transacción"──┐
iPhone (app Caudal en Netlify) ───────────┼──► Apps Script (web app) ──► Google Sheet
Widget Scriptable / Siri ─────────────────┘           │
                                                      └─► correo diario (recordatorios)
```

---

## 1. La hoja de Google y la API (Apps Script) · ~10 min

1. Abre la hoja **Caudal** en tu Google Drive (si no existe, crea una hoja en blanco
   con ese nombre en [sheets.new](https://sheets.new)).
2. Menú **Extensiones → Apps Script**. Se abre el editor.
3. En el editor:
   - Renombra el archivo `Código.gs` a **Code** y pega todo el contenido de
     [`apps-script/Code.gs`](../apps-script/Code.gs).
   - Botón **+ → Secuencia de comandos**, llámalo **Calculos** y pega
     [`apps-script/Calculos.gs`](../apps-script/Calculos.gs).
   - ⚙️ **Configuración del proyecto** → Zona horaria: **(GMT-06:00) Ciudad de México**
     (o Mérida). Es importante para las fechas de corte.
   - Guarda (💾).
4. Arriba, en el selector de funciones, elige **instalar** y pulsa **Ejecutar**.
   Google pedirá permisos: *Revisar permisos → tu cuenta → Configuración avanzada →
   Ir a Caudal (no seguro) → Permitir*. (Dice "no seguro" porque el script es tuyo y no
   está verificado por Google; es normal.)
   Esto crea las pestañas **Movimientos**, **Config** y **Cuentas** (DiDi y Nu), una **clave secreta** y el
   recordatorio diario de las 8 am.
5. **Implementar → Nueva implementación** → tipo ⚙️ **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - **Implementar** y copia la URL (termina en `/exec`).

   > Si después cambias el código: **Implementar → Gestionar implementaciones → ✏️ →
   > Versión: Nueva versión → Implementar**. Así la URL no cambia.

6. Regresa a la hoja, pestaña **Config**, y llena los datos de la tarjeta
   (también se pueden cambiar después desde la app, en *Ajustes*):

   | clave | qué poner |
   |---|---|
   | `dia_corte` | día de corte de la DiDi Card |
   | `dia_limite` | día límite de pago (o deja vacío y usa `dias_para_pagar`) |
   | `cashback_pct` | 6 (o lo que dé hoy la tarjeta) |
   | `cashback_tope` | tope mensual de cashback en pesos, si lo hay |
   | `categorias_cashback` | categorías que sí dan cashback (ej. `Súper`) |
   | `monto_periodo`, `periodo_dias` | cuánto y cada cuántos días recibe dinero (opcional) |
   | `avisos_correo` | correos para recordatorios, separados por coma (el de ella y el tuyo) |
   | `limite_credito` | opcional |

   El `token` es la clave de la API: no lo cambies a mano a menos que quieras
   "cerrar la puerta" (si lo cambias, hay que volver a mandar el enlace).

## 2. La app en Netlify · ~5 min

1. Entra a [app.netlify.com](https://app.netlify.com) → **Add new project → Import an existing project → GitHub**.
2. Autoriza Netlify en GitHub si lo pide y elige el repositorio **caudal**.
3. Netlify lee `netlify.toml` solo (carpeta `web`). Pulsa **Deploy**.
4. *Project configuration → Change project name* → por ejemplo `caudal-mama`
   → la app queda en `https://caudal-mama.netlify.app`.
5. Copia esa dirección en la hoja, pestaña **Config → `url_app`**.

Cada vez que se suba un cambio al repositorio, Netlify vuelve a publicar solo.

> Sin GitHub: también puedes arrastrar la carpeta `web` a
> [app.netlify.com/drop](https://app.netlify.com/drop).

## 3. Abrir la app en los iPhones · ~3 min

1. En la hoja (recarga la página para que aparezca el menú): **Caudal → Mostrar enlace para la app**.
2. Manda ese enlace por WhatsApp a tu mamá (y a ti).
3. En el iPhone, ábrelo en **Safari** (no dentro de WhatsApp: toca el enlace y luego
   el ícono de Safari / "Abrir en Safari").
4. Botón **Compartir → Agregar a inicio → Agregar**. Aparece el ícono verde **Caudal**.
5. Abre la app desde el ícono. Si pide el enlace (el iPhone a veces separa Safari de las
   apps de inicio), **pega el mismo enlace una vez** y listo; queda guardado.

Tú ves exactamente el mismo panel con el mismo enlace. Para probar sin datos reales:
abre la app y pulsa **Ver demostración**.

## 4. Primeros datos

En la app de tu mamá:

- **Otro → Corregir saldo**: lo que tiene hoy en DiDi débito.
- **Otro → Deuda anterior**: lo que ya debe la tarjeta (si debe algo).
- **Recibí dinero** cada vez que le den dinero (marcando "periodo nuevo" si es el gasto
  normal de la semana/quincena).

## 5. Captura automática y widget

- Atajos del iPhone (compra automática con Apple Pay, Siri, recordatorio diario):
  [ATAJOS.md](ATAJOS.md)
- Widget en la pantalla de inicio: [`scriptable/Caudal-widget.js`](../scriptable/Caudal-widget.js)
  (instrucciones al inicio del archivo; app gratis **Scriptable** del App Store).

## 6. Recordatorios

- **Correo**: cada día a las 8 am el script revisa y, solo si hay algo (faltan 5, 2 o 0
  días para el pago, el pago venció, no alcanza en débito, el Libre está bajo o
  negativo, o hoy cortó la tarjeta), manda un correo a `avisos_correo`.
  Prueba: menú **Caudal → Probar correo de recordatorio**.
- **Notificación en el iPhone**: automatización diaria de Atajos (ver ATAJOS.md, atajo 4).

## Problemas comunes

| Síntoma | Solución |
|---|---|
| "La clave no es correcta" | El enlace está incompleto o cambiaste el `token`. Vuelve a mandar el enlace. |
| "La hoja no respondió bien" | La implementación no tiene acceso "Cualquier usuario", o falta implementar una *nueva versión* tras pegar código. |
| Fechas raras / corte un día corrido | Zona horaria del proyecto de Apps Script (paso 1.3). |
| Saldo de DiDi débito distinto al de la app | Falta anotar algo, o hubo una compra con débito que no se registró. Usa **Otro → Corregir saldo** con la diferencia. |


## Actualizar a la versión con cuentas (DiDi + Nu)

Si ya usabas Caudal, solo hay que poner el código nuevo en la hoja. No se pierde nada:

1. En la hoja: **Extensiones → Apps Script**. Reemplaza todo el contenido de `Code.gs` y de
   `Calculos.gs` por los de la carpeta `apps-script/` y guarda (💾).
2. **Implementar → Administrar implementaciones** → ✏️ (editar) → *Versión*: **Nueva versión**
   → **Implementar**. (Así la dirección `/exec` no cambia y el iPhone sigue conectado.)
3. Abre la app una vez. En ese momento la hoja crea sola la pestaña **Cuentas** (DiDi con los
   datos de su tarjeta que ya estaban en Config, y Nu como solo débito en morado) y agrega la
   columna **cuenta** a Movimientos, marcando todo lo de antes como DiDi.

La pestaña **Cuentas** se puede editar a mano: `tipo` es `credito` (tarjeta + débito, como
DiDi) o `debito` (solo débito, como Nu), y `color` es el color de marca (`#RRGGBB`). Lo mismo
se cambia desde la app en *Ajustes*, donde también se agregan cuentas.
