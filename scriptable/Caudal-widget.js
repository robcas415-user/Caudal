// Caudal — widget para la pantalla de inicio del iPhone (app gratuita "Scriptable").
// Muestra el Libre y cuánto toca pagar de la tarjeta. Al tocarlo abre la app.
//
// 1. Llena estas tres líneas (Robert te pasa los datos del menú Caudal de la hoja):
const API = 'PEGA_AQUI_LA_DIRECCION_DE_LA_API';   // termina en /exec
const CLAVE = 'PEGA_AQUI_LA_CLAVE';
const APP = 'https://TU-SITIO.netlify.app';        // la app en Netlify
// 2. En la pantalla de inicio: mantener presionado → + → Scriptable → elige tamaño
//    → Editar widget → Script: este. "Al tocar": Abrir URL (opcional; ya abre la app).

const COLORES = {
  bien: new Color('#14614a'),
  bajo: new Color('#a86200'),
  negativo: new Color('#b42318'),
};

function pesos(n) {
  const s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '-$' : '$') + s;
}
function sinCentavos(n) { const s = pesos(n); return s.endsWith('.00') ? s.slice(0, -3) : s; }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaCorta(f) { const [y, m, d] = f.split('-').map(Number); return d + ' ' + MESES[m - 1]; }

async function cargar() {
  const url = API + '?accion=resumen&token=' + encodeURIComponent(CLAVE);
  const archivo = FileManager.local();
  const cache = archivo.joinPath(archivo.documentsDirectory(), 'caudal-cache.json');
  try {
    const req = new Request(url);
    req.timeoutInterval = 20;
    const j = await req.loadJSON();
    if (!j.ok) throw new Error(j.error);
    archivo.writeString(cache, JSON.stringify(j.resumen));
    return { r: j.resumen, viejo: false };
  } catch (e) {
    if (archivo.fileExists(cache)) return { r: JSON.parse(archivo.readString(cache)), viejo: true };
    return { error: String(e.message || e) };
  }
}

async function crear() {
  const datos = await cargar();
  const w = new ListWidget();
  w.url = APP;
  w.setPadding(14, 14, 14, 14);
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  const grande = config.widgetFamily !== 'small';

  if (datos.error) {
    w.backgroundColor = new Color('#555555');
    const t = w.addText('Caudal: no se pudo cargar');
    t.textColor = Color.white(); t.font = Font.semiboldSystemFont(14);
    return w;
  }
  const r = datos.r;
  w.backgroundColor = COLORES[r.estado_libre] || COLORES.bien;

  const et = w.addText('Libre para gastar');
  et.textColor = new Color('#ffffff', 0.9); et.font = Font.mediumSystemFont(grande ? 15 : 13);
  w.addSpacer(2);
  const monto = w.addText(grande ? pesos(r.libre) : sinCentavos(r.libre));
  monto.textColor = Color.white(); monto.font = Font.heavySystemFont(grande ? 38 : 30);
  monto.minimumScaleFactor = 0.5; monto.lineLimit = 1;

  w.addSpacer();
  let linea;
  if (r.por_pagar > 0) {
    linea = (r.dias_para_pagar < 0 ? '⚠️ Tarjeta vencida: ' : '💳 Pagar ') + sinCentavos(r.por_pagar) + (r.dias_para_pagar >= 0 ? ' antes del ' + fechaCorta(r.fecha_limite) : '');
  } else if (r.por_dia != null && r.libre > 0) {
    linea = '≈ ' + sinCentavos(r.por_dia) + ' al día';
  } else {
    linea = '💳 Tarjeta al corriente';
  }
  const l = w.addText(linea);
  l.textColor = Color.white(); l.font = Font.semiboldSystemFont(grande ? 15 : 12); l.lineLimit = 2; l.minimumScaleFactor = 0.7;

  if (grande && r.cashback_estimado > 0) {
    const c = w.addText('🎁 Cashback del mes ≈ ' + sinCentavos(r.cashback_estimado));
    c.textColor = new Color('#ffffff', 0.9); c.font = Font.systemFont(13);
  }
  if (datos.viejo) {
    const v = w.addText('sin conexión · datos anteriores');
    v.textColor = new Color('#ffffff', 0.7); v.font = Font.systemFont(10);
  }
  return w;
}

const widget = await crear();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
