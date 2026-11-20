# Atajos del iPhone para Caudal

Necesitas dos datos del menú **Caudal → Mostrar enlace para la app** de la hoja:

- **API**: la dirección que termina en `/exec`
- **CLAVE**: la clave (token)

Abajo, donde diga `API` y `CLAVE`, pega esos valores. Todo se hace en la app **Atajos**
(viene con el iPhone). Requiere iOS 17 o más nuevo.

> Los nombres exactos de los botones pueden variar un poco según la versión de iOS
> (por ejemplo "Importe" o "Cantidad").

---

## 1. (Ya no se usa) Compra automática con Apple Pay

La DiDi Card no se puede agregar a Apple Wallet, así que la automatización de
**Transacción** no funciona. Las compras se anotan a mano con el atajo 2 (Back Tap o
ícono **Anotar**) o desde la app. La API sigue aceptando `origen=wallet` por si algún
día se usa con otra tarjeta.

## 2. "Anotar gasto" (a mano o con Siri)

Para anotar una compra rápido (con tarjeta o desde débito).

1. Atajos → **+** (nuevo atajo) → nómbralo **Anotar gasto**.
2. Acciones:
   1. **Solicitar entrada** → Tipo: **Número** → Pregunta: "¿Cuánto gastaste?"
   2. **Seleccionar del menú** → Pregunta: "¿Con qué pagaste?" → opciones
      **Tarjeta de crédito** y **Débito**.
      - Debajo de *Tarjeta de crédito*: acción **Texto** → `credito`
      - Debajo de *Débito*: acción **Texto** → `debito`
   3. Después de *Finalizar menú*: **Texto**:

      ```
      API?accion=agregar&token=CLAVE&origen=atajo&formato=texto&monto=[Entrada proporcionada]&medio=[Resultado del menú]
      ```

   4. **Obtener contenido de la URL**.
   5. **Mostrar notificación** → *Contenido de la URL*.
3. Opcional: ⓘ → **Agregar a pantalla de inicio**.

Uso: "Oye Siri, **anotar gasto**".

### Qué anota exactamente (cuenta y categoría)

Este atajo es **solo de DiDi**; no hay atajo ni pregunta de cuenta para Nu (Nu se anota desde la app).

- **Cuenta:** la llamada **no manda cuenta**, y cuando no viene ninguna la API usa la **primera
  cuenta de la pestaña Cuentas** (hoy DiDi). Por eso funciona igual que siempre.
- **Categoría:** la llamada **no manda categoría**, y la API pone la de **Ajustes → Categoría por
  defecto** (hoy **Súper**). Con tarjeta de crédito, Súper lleva cashback según las categorías de
  cashback de DiDi.
- Si prefieres que no dependa de esos valores, agrega al final de la URL del atajo
  `&cuenta=didi&categoria=S%C3%BAper` (así queda fija en DiDi y Súper). Es opcional; el atajo ya
  instalado sin esto sigue funcionando igual.
- Si algún día el gasto no es de súper, se cambia tocando el movimiento en la app.

### Ícono del atajo (pantalla de inicio)

El ícono **Anotar** puede ir en el naranja de DiDi: [`iconos/icono-anotar-didi.png`](iconos/icono-anotar-didi.png)
(el verde anterior sigue en `iconos/icono-anotar-verde.png`).

1. Guarda la imagen en **Fotos** del iPhone (AirDrop, correo o iCloud).
2. Atajos → mantén presionado **Anotar gasto** → **Detalles** (ⓘ) → toca el ícono de
   *Agregar a pantalla de inicio* → en **Nombre y ícono de pantalla de inicio** toca el ícono →
   **Elegir foto** → la imagen → **Agregar**.
3. Si ya había uno en la pantalla de inicio, bórralo (mantener presionado → *Eliminar marcador*)
   para que no queden dos.

## 3. "¿Cuánto tengo libre?" (Siri)

1. Nuevo atajo, nómbralo **Cuánto tengo libre**.
2. **Obtener contenido de la URL**:
   ```
   API?accion=resumen&token=CLAVE&formato=texto
   ```
3. **Leer texto** (o *Mostrar resultado*) → *Contenido de la URL*.

Uso: "Oye Siri, **cuánto tengo libre**".

## 4. Recordatorio diario como notificación del iPhone

Notificación sin correo: el iPhone pregunta cada mañana si hay algo pendiente.

1. Atajos → **Automatización** → **+** → **Hora del día** → 9:00, **Diariamente**,
   **Ejecutar inmediatamente** → **Nuevo atajo en blanco**.
2. Acciones:
   1. **Obtener contenido de la URL**:
      ```
      API?accion=aviso&token=CLAVE&formato=texto
      ```
   2. **Si** → *Contenido de la URL* → **tiene cualquier valor**
      - dentro: **Mostrar notificación** → *Contenido de la URL*
   3. *Finalizar si*

Solo avisa los días configurados (`avisos_dias_antes`, por defecto 5, 2 y 0 días antes
del límite), cuando el pago venció, cuando no alcanza en débito, cuando el Libre está bajo
o negativo, y el día del corte. Con varias cuentas cada aviso dice de cuál es, y cada una
tiene su propio umbral de aviso (las de solo débito avisan saldo bajo o negativo, sin corte).

## 5. (Opcional) "Recibí dinero" con Siri

Igual que el atajo 2 pero sin el menú y con:

```
API?accion=agregar&token=CLAVE&tipo=deposito&origen=atajo&formato=texto&monto=[Entrada proporcionada]
```

---

### Referencia de la API (GET)

| Parámetro | Valores |
|---|---|
| `accion` | `estado`, `resumen`, `agregar`, `aviso`, `cuentas` |
| `cuenta` | id o nombre de la cuenta (`didi`, `Nu`…) o `activa` (la última elegida en la app). Sin `cuenta` = la primera |
| `token` | la clave |
| `formato` | `texto` para respuesta en texto plano (si no, JSON) |
| `tipo` | `compra` (por defecto), `deposito`, `pago_tarjeta`, `cashback`, `ajuste` |
| `medio` | `credito` (por defecto) o `debito` (en cuentas de solo débito siempre `debito`) |
| `monto` | acepta `$1,234.50`, `1234.5`, `89,90`… |
| `comercio` / `descripcion` | texto libre |
| `categoria` | una de `categorias` (si no, `categoria_default`) |
| `fecha` | `AAAA-MM-DD` (si no, hoy) |
| `nuevo_periodo` | ya no se usa (Caudal no maneja periodos) |
| `origen` | `wallet` activa el filtro de duplicados |
