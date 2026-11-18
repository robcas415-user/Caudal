# Atajos del iPhone para Caudal

Necesitas dos datos del menú **Caudal → Mostrar enlace para la app** de la hoja:

- **API**: la dirección que termina en `/exec`
- **CLAVE**: la clave (token)

Abajo, donde diga `API` y `CLAVE`, pega esos valores. Todo se hace en la app **Atajos**
(viene con el iPhone). Requiere iOS 17 o más nuevo.

> Los nombres exactos de los botones pueden variar un poco según la versión de iOS
> (por ejemplo "Importe" o "Cantidad").

---

## 1. Compra automática con Apple Pay (la más importante)

Cada vez que tu mamá pague con la DiDi Card desde Apple Wallet, se anota sola y le
aparece una notificación con lo que le queda libre.

1. Atajos → pestaña **Automatización** → **+** (o *Nueva automatización*).
2. Elige **Transacción**.
3. **Tarjeta**: selecciona solo la **DiDi Card de crédito**. Categorías/comercios: todos.
4. Marca **Ejecutar inmediatamente** (y desactiva "Notificar al ejecutar" si aparece).
   → **Siguiente** → **Nuevo atajo en blanco**.
5. Agrega estas acciones en orden:

   1. **Codificar URL** → en el campo de texto toca *Entrada del atajo* → elige
      **Comercio**. (Renómbrala tocando el resultado: "Comercio codificado".)
   2. **Codificar URL** → *Entrada del atajo* → **Importe** (o *Cantidad*).
   3. **Texto**, con exactamente esto (sin espacios ni saltos de línea), insertando las
      dos variables donde se indica:

      ```
      API?accion=agregar&token=CLAVE&medio=credito&origen=wallet&formato=texto&comercio=[Comercio codificado]&monto=[resultado del paso 2]
      ```

   4. **Obtener contenido de la URL** (usa el *Texto*; método GET, el de siempre).
   5. **Mostrar notificación** → texto: *Contenido de la URL*.

6. **OK / Listo**.

Prueba: paga algo pequeño con Apple Pay; en unos segundos debe llegar la notificación
"Anotado: $… en … (tarjeta). Te quedan libres $…".

- Las compras automáticas entran con la categoría por defecto (`categoria_default`,
  normalmente *Súper*). Se puede cambiar tocando el movimiento en la app.
- Si el iPhone dispara la automatización dos veces, Caudal ignora el duplicado
  (mismo monto y comercio en menos de 2 minutos).
- **No** anotes a mano una compra que ya se anotó sola (en la app aparece como
  "automático").
- Si también tiene la **DiDi débito** en Wallet, repite todo para esa tarjeta pero con
  `medio=debito`.

## 2. "Anotar gasto" (a mano o con Siri)

Para compras con tarjeta física, en efectivo desde débito, o si la automática falló.

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

### Con varias cuentas (DiDi, Nu…): preguntar en cuál

Sin cambiar nada, el atajo sigue anotando en la **primera cuenta** (DiDi). Para que pregunte
la cuenta **solo cuando hay más de una**, agrega al principio del atajo:

1. **Obtener contenido de la URL**:
   ```
   API?accion=cuentas&token=CLAVE&formato=texto
   ```
   (Devuelve los nombres de las cuentas, uno por renglón.)
2. **Dividir texto** → *Contenido de la URL* → por **Saltos de línea**.
3. **Contar** → *Elementos* de *Texto dividido*.
4. **Si** → *Cuenta* → **es mayor que** → `1`
   - dentro: **Elegir de la lista** → *Texto dividido* → Pregunta: "¿En qué cuenta?"
     → **Definir variable** `Cuenta` → *Elemento elegido*
   - **De lo contrario**: **Obtener elemento de la lista** → *Primer elemento* de *Texto dividido*
     → **Definir variable** `Cuenta` → *Elemento de la lista*
   - *Finalizar si*
5. En el **Texto** de la URL, agrega al final `&cuenta=` y la variable **Cuenta**:

   ```
   API?accion=agregar&token=CLAVE&origen=atajo&formato=texto&monto=[Entrada proporcionada]&medio=[Resultado del menú]&cuenta=[Cuenta]
   ```

En una cuenta de **solo débito** (como Nu) la compra siempre se anota como débito, aunque el
menú diga "Tarjeta de crédito", así que no hace falta cambiar la pregunta de con qué pagó.
La notificación dice en qué cuenta quedó: "Anotado en Nu: $200.00. Te quedan $1,300.00 en Nu".

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
API?accion=agregar&token=CLAVE&tipo=deposito&nuevo_periodo=si&origen=atajo&formato=texto&monto=[Entrada proporcionada]
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
| `nuevo_periodo` | `si` para depósitos que inician periodo |
| `origen` | `wallet` activa el filtro de duplicados |
