# Caudal

Control sencillo del dinero de la casa con la tarjeta DiDi:
se paga el súper con **DiDi crédito** (con cashback; en Súper hoy 2%, se configura en Ajustes) y se usa el dinero recibido,
depositado en **DiDi débito**, para pagar la tarjeta.

La cifra principal, siempre a la vista:

> **Libre = dinero recibido − compras con crédito (pagadas o no) − gastos con débito (+ cashback)**

Pagar la tarjeta no cambia el Libre: solo mueve dinero que ya estaba apartado.
La app también muestra cuánto **toca pagar** y **hasta cuándo**, cuánto **deberías ver en
DiDi débito** (y cuánto de eso es para la tarjeta), el **cashback** del mes y cómo va el
**periodo** (con lo que sobró del anterior y cuánto alcanza por día).

Todo es configurable (corte, día límite o días para pagar, % y tope de cashback, categorías
con cashback, monto y frecuencia del dinero recibido, recordatorios): desde la app en
*Ajustes* o en la pestaña *Config* de la hoja.

## Varias cuentas

Además de DiDi se pueden llevar otras cuentas (por ejemplo **Nu**, solo débito). Cada cuenta
tiene su propio saldo y movimientos (lo de una no cambia el Libre de otra), su tipo
(*tarjeta y débito* o *solo débito*) y su color de marca: al cambiar de cuenta arriba en Inicio
toda la app toma ese color. La paleta se genera girando el tono de la paleta verde en OKLCH
(misma luminosidad, mismo diseño) y se revisa el contraste de los textos; con el verde de DiDi
la app queda exactamente igual. Ver `docs/INSTALACION.md` para actualizar la hoja.

## Piezas

| Carpeta | Qué es |
|---|---|
| `apps-script/` | `Code.gs` (API web + recordatorios por correo) y `Calculos.gs` (toda la lógica). Va pegado en la hoja de Google. |
| `web/` | App web instalable (PWA) en español, letra grande. Se publica en GitHub Pages. `web/calculos.js` es copia de `Calculos.gs` (modo demo). |
| `scriptable/` | Widget para la pantalla de inicio del iPhone. |
| `docs/` | [Instalación](docs/INSTALACION.md) y [Atajos del iPhone](docs/ATAJOS.md). |
| `tests/` | Pruebas de los cálculos (`npm test`). |

## Desarrollo

```bash
npm test          # pruebas de cálculos (Node 18+)
npm run sync      # copia apps-script/Calculos.gs → web/calculos.js
npm run serve     # sirve web/ en http://localhost:5173 (usa "Ver demostración")
```

Sin dependencias ni paso de compilación. Los datos viven en la hoja de Google del dueño;
la app solo guarda en el teléfono la dirección de la API, la clave y la última copia del
estado (para abrir sin señal).

## Seguridad

La API está protegida por una clave larga (`token` en la pestaña Config) que va en el
enlace. Quien tenga el enlace puede ver y anotar movimientos, así que compártelo solo con
la familia. Para revocar acceso, cambia el `token` en la hoja y manda un enlace nuevo.
No se guardan números de tarjeta ni contraseñas bancarias.
