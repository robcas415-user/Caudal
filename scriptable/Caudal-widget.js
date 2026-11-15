// Caudal — widget para la pantalla de inicio del iPhone (app gratuita "Scriptable").
// Muestra el Libre y cuánto toca pagar de la tarjeta. Al tocarlo abre la app.
//
// 1. Llena estas tres líneas (Robert te pasa los datos del menú Caudal de la hoja):
const API = 'PEGA_AQUI_LA_DIRECCION_DE_LA_API';   // termina en /exec
const CLAVE = 'PEGA_AQUI_LA_CLAVE';
const APP = 'https://TU-SITIO.netlify.app';        // la app en Netlify
// 2. En la pantalla de inicio: mantener presionado → + → Scriptable → elige tamaño
//    → Editar widget → Script: este. Deja "Al tocar" en "Ejecutar script".
//
// Para anotar gastos, pon junto a este el widget de la app Atajos con "Anotar gasto":
// ese corre sin abrir ninguna app.

const COLORES = {
  bien: ['#1f6b4f', '#0a221a'],
  bajo: ['#6a5320', '#1f180b'],
  negativo: ['#6e2a24', '#200c0b'],
};
function fondo(estado) {
  const c = COLORES[estado] || COLORES.bien;
  const g = new LinearGradient();
  g.colors = [new Color(c[0]), new Color(c[1])];
  g.locations = [0, 1];
  g.startPoint = new Point(0, 0); g.endPoint = new Point(1, 1);
  return g;
}

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
  // Solo informativo. iOS hace que todo toque en un widget de Scriptable abra Scriptable
  // primero, así que para anotar usa el widget de la app Atajos ("Anotar gasto").
  w.setPadding(14, 14, 14, 14);
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  const grande = config.widgetFamily !== 'small';

  if (datos.error) {
    w.backgroundColor = new Color('#0f1b16');
    const t = w.addText('Caudal: no se pudo cargar');
    t.textColor = Color.white(); t.font = Font.semiboldSystemFont(14);
    return w;
  }
  const r = datos.r;
  w.backgroundGradient = fondo(r.estado_libre);

  // Encabezado: etiqueta + estado (como la tarjeta Libre de la app)
  const top = w.addStack(); top.centerAlignContent();
  const et = top.addText('Libre para gastar');
  et.textColor = new Color('#ffffff', 0.78); et.font = Font.semiboldSystemFont(grande ? 14 : 12);
  top.addSpacer();
  if (grande) {
    const estados = { bien: ['Vas bien', '#3fe0a2'], bajo: ['Queda poco', '#ffb547'], negativo: ['Te pasaste', '#ff6b5e'] };
    const e = estados[r.estado_libre] || estados.bien;
    const pill = top.addStack(); pill.backgroundColor = new Color('#000000', 0.22); pill.cornerRadius = 9; pill.setPadding(3, 8, 3, 8); pill.centerAlignContent();
    const dot = pill.addText('● '); dot.textColor = new Color(e[1]); dot.font = Font.systemFont(9);
    const pt = pill.addText(e[0]); pt.textColor = Color.white(); pt.font = Font.semiboldSystemFont(11);
  }
  w.addSpacer(grande ? 6 : 4);

  // Monto con centavos más chicos y tenues, letra redondeada
  const filaMonto = w.addStack(); filaMonto.bottomAlignContent();
  const txt = pesos(r.libre), punto = txt.lastIndexOf('.');
  const ent = filaMonto.addText(txt.slice(0, punto));
  ent.textColor = Color.white(); ent.font = Font.boldRoundedSystemFont(grande ? 38 : 28);
  ent.minimumScaleFactor = 0.5; ent.lineLimit = 1;
  if (grande) {
    const cen = filaMonto.addText(txt.slice(punto));
    cen.textColor = new Color('#ffffff', 0.55); cen.font = Font.boldRoundedSystemFont(20);
  }

  w.addSpacer();
  let linea;
  if (r.por_pagar > 0) {
    linea = (r.dias_para_pagar < 0 ? 'Tarjeta vencida: ' : 'Pagar ') + sinCentavos(r.por_pagar) + (r.dias_para_pagar >= 0 ? ' antes del ' + fechaCorta(r.fecha_limite) : '');
  } else if (r.por_dia != null && r.libre > 0) {
    linea = 'Unos ' + sinCentavos(r.por_dia) + ' al día';
  } else {
    linea = 'Tarjeta al corriente';
  }
  const l = w.addText(linea);
  l.textColor = new Color('#ffffff', 0.85); l.font = Font.mediumSystemFont(grande ? 14 : 11); l.lineLimit = 2; l.minimumScaleFactor = 0.7;

  if (grande && r.cashback_estimado > 0) {
    const c = w.addText('Cashback del mes ' + sinCentavos(r.cashback_estimado));
    c.textColor = new Color('#d4f26a'); c.font = Font.semiboldSystemFont(12);
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
