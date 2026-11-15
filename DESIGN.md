# Caudal — sistema de diseño

**Registro:** app de iPhone, oscura, en verde profundo. Se ve nativa (SF Pro, listas agrupadas, hojas que suben desde abajo, barra de pestañas flotante), pero con identidad propia: un héroe con degradado que cambia según el estado.

## Color (tokens en `web/styles.css :root`)
- Fondos: `--bg #050d0a`, superficies `--surface` … `--surface-3`, rellenos translúcidos `--fill`.
- Texto: `--text`, `--text-2` (70%) y `--text-3` (48%, solo para texto secundario, nunca para cifras clave).
- Un solo tinte de acción: **menta `--mint #3fe0a2`**. La **lima** se usa solo para cashback. El **ámbar** marca "Libre bajo" y el **rojo** marca negativo o error.
- El héroe cambia de verde a ámbar y a rojo según el Libre. El color nunca es la única señal: siempre va acompañado de texto ("Vas bien", "Ojo"…).

## Tipografía
- Texto: la fuente del sistema, 17px de base. Las etiquetas pequeñas miden al menos 11px.
- Cifras: `ui-rounded` con `tabular-nums`.
- Los inputs en iPhone usan al menos 16px, para que no haga zoom.

## Componentes
- **Héroe Libre:** cifra grande, una línea de explicación, "Hoy llevas…" y una barra del mes.
- **Acciones:** 4 botones circulares: Anotar compra, Recibí dinero, Pagué tarjeta, Cuadrar.
- **Listas agrupadas iOS** para movimientos, el libro del mes y Ajustes.
- **Hoja inferior** con teclado numérico propio y botón Guardar fijo.
- **Chips** para elegir categorías y días. Control segmentado para tarjeta o débito.
- Prohibido: etiquetas "eyebrow", texto con degradado, tarjetas anidadas y bordes de color a la izquierda.

## Movimiento (reglas de Emil Kowalski + Impeccable)
- Curvas: `--ease` (hojas de iOS, al abrir), `--ease-out` (entradas y respuestas) y `--spring` (solo el interruptor).
- Al presionar: `scale(.94–.97)`, en unos 150ms.
- Cambiar de pestaña pasa muchas veces al día: solo un fundido de 180ms. La entrada escalonada completa ocurre solo al abrir la app.
- La hoja abre en 450ms y cierra en 300ms. El aviso (toast) entra en 450ms y sale en 300ms.
- El destello del héroe aparece cuando cambia el Libre: verde si sube, ámbar si baja.
- Con movimiento reducido se quitan los desplazamientos y los bucles, pero se conservan los fundidos.
- Solo se animan `transform` y `opacity`. Las barras de progreso son la excepción.

## Inicio (v2) y resortes
- Las acciones se sugieren sin decirlas: cifras como fichas tocables (héroe → Cuadrar), tarjetas con "acción ›" en menta (tarjeta → Ya pagué, cashback → Ya llegó) y totales con ⌄ (Movimientos).
- Sin duplicados: Próximas fechas vive dentro de la tarjeta; la cuenta del mes queda plegada en "Cómo llegaste a tu Libre".
- `--resorte` (sin rebote, interfaz) y `--resorte-rebote` (lo que se suelta con el dedo), definidos con `linear()`; si el navegador no lo soporta, se usa `--ease`.
- Hoja: sigue el dedo 1:1, resiste hacia arriba, el fondo se aclara al bajarla y al soltar decide por velocidad.
- Barras con `clip-path` (sin recalcular el diseño).
