# Caudal — sistema de diseño

**Registro:** app de iPhone, oscura, en verde profundo. Se ve nativa (SF Pro, listas agrupadas, hojas que suben desde abajo, barra de pestañas flotante), pero con identidad propia: un héroe con degradado que cambia según el estado.

## Color (tokens en `web/styles.css :root`)
- Fondos: `--bg #050d0a`, superficies `--surface` … `--surface-3`, rellenos translúcidos `--fill`.
- Texto: `--text`, `--text-2` (70%) y `--text-3` (48%, solo para texto secundario, nunca para cifras clave).
- v48 (vigente): fondo casi negro #070b0a; superficies NEUTRAS de vidrio grafito (el color solo donde significa algo); texto blanco neutro 100/74/58%; marca esmeralda bosque #1f7a52 (legible: hoja #86c796); pistache #d6e38f tarjeta y cashback; azul cielo #8fc3ea débito; coral #f0908a negativo. Barra de pestañas con lente de vidrio que viaja con resorte y se estira como gota.
- (anterior) v47 paleta bosque curada (ref. #051F20 #0B2B26 #163832 #235347 #8EB69B #DAF1DE): fondo #0a211c con haz de luz; vidrio #163832→#1b4038 claramente más claro que el fondo; rellenos de marca #2b6a57 con tinta #e6f6e9; texto #f1f9f3 / salvia .82 / .64. Mismos significados en las tres pestañas: entra = helecho #a5cdb0, tarjeta y cashback = pistache #d5e29a, débito = aqua #9dd0d8, negativo = coral #f0998c.
- Paleta análoga (v45 "vidrio líquido", sin naranja ni neón; fondo #0e1915 con luz ambiental salvia, superficies de vidrio translúcido con canto de luz y sombra suave), cada color con un solo significado:
  - **Menta `--mint #a8c8a0 (helecho, acento legible) sobre rellenos verde bosque --bosque #2f6b4a con texto crema`**: acción, dinero que entra, lo que queda libre.
  - **Lima `--lime #cfe08c (pistache)`**: la tarjeta de crédito (pagos, "pronto", lo apartado para la tarjeta), cashback y "Libre bajo".
  - **Aqua `--blue #93cbd6`**: identidad del débito.
  - **Salvia `--salida #8fa79c`**: lo que sale. Apagado a propósito: lo gastado no brilla, lo que queda sí.
  - **Rojo `--red`**: solo negativo, vencido o error.
- El héroe cambia de verde a lima y a rojo según el Libre. El color nunca es la única señal: siempre va acompañado de texto ("Vas bien", "Ojo"…).

## Tipografía
- Texto: la fuente del sistema, 17px de base. Las etiquetas pequeñas miden al menos 11px.
- Cifras: Inter (subconjunto en `web/fonts/`, familia "Caudal Num") con `tabular-nums`. Robert prefiere Inter a SF Rounded.
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
- El destello del héroe aparece cuando cambia el Libre: verde si sube, lima si baja.
- Con movimiento reducido se quitan los desplazamientos y los bucles, pero se conservan los fundidos.
- Solo se animan `transform` y `opacity`. Las barras de progreso son la excepción.

## Inicio (v2) y resortes
- Las acciones se sugieren sin decirlas: cifras como fichas tocables (héroe → Cuadrar), tarjetas con "acción ›" en menta (tarjeta → Ya pagué, cashback → Ya llegó) y totales con ⌄ (Movimientos).
- Sin duplicados: Próximas fechas vive dentro de la tarjeta; la cuenta del mes queda plegada en "Cómo llegaste a tu Libre".
- `--resorte` (sin rebote, interfaz) y `--resorte-rebote` (lo que se suelta con el dedo), definidos con `linear()`; si el navegador no lo soporta, se usa `--ease`.
- Hoja: sigue el dedo 1:1, resiste hacia arriba, el fondo se aclara al bajarla y al soltar decide por velocidad.
- Barras con `clip-path` (sin recalcular el diseño).
