// Caudal — widget informativo para el iPhone (app gratuita "Scriptable").
// Pantalla de inicio: Libre, cuánto alcanza al día, pago de la tarjeta, débito y cashback.
// Pantalla bloqueada: el Libre y los días para pagar, sin desbloquear.
//
// 1. Llena estas dos líneas (datos del menú Caudal de la hoja):
const API = 'PEGA_AQUI_LA_DIRECCION_DE_LA_API';   // termina en /exec
const CLAVE = 'PEGA_AQUI_LA_CLAVE';
// 2. Pantalla de inicio: mantener presionado → Editar → Agregar widget → Scriptable
//    → tamaño chico o mediano → Editar widget → Script: este.
//    Pantalla bloqueada: mantener presionada → Personalizar → Pantalla bloqueada →
//    toca la fila de widgets → Scriptable → elige el rectangular → Script: este.
//
// Para anotar gastos se usa el ícono "Anotar" (atajo), que corre sin abrir apps.
// Tocar el widget lo actualiza al momento (abre Scriptable un instante).

const ESTADOS = {
  bien: { fondo: ['#1f6b4f', '#0a221a'], acento: '#3fe0a2', texto: 'Vas bien' },
  bajo: { fondo: ['#6a5320', '#1f180b'], acento: '#ffb547', texto: 'Queda poco' },
  negativo: { fondo: ['#6e2a24', '#200c0b'], acento: '#ff6b5e', texto: 'Te pasaste' },
};
const BLANCO = (a) => new Color('#ffffff', a == null ? 1 : a);

function pesos(n) {
  const s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '−$' : '$') + s;
}
function sinCentavos(n) { return pesos(Math.round(n)).slice(0, -3); }
function corto(n) {   // $2.3k para espacios muy chicos
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 10000) return s + '$' + Math.round(a / 1000) + 'k';
  if (a >= 1000) return s + '$' + (a / 1000).toFixed(1).replace('.0', '') + 'k';
  return s + '$' + Math.round(a);
}
function plazo(r) {
  const d = r.dias_para_pagar;
  if (d < 0) return 'vencido';
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  return 'en ' + d + ' días';
}

async function cargar() {
  const url = API + '?accion=resumen&token=' + encodeURIComponent(CLAVE);
  const fm = FileManager.local();
  const cache = fm.joinPath(fm.documentsDirectory(), 'caudal-cache.json');
  try {
    const req = new Request(url);
    req.timeoutInterval = 20;
    const j = await req.loadJSON();
    if (!j.ok) throw new Error(j.error);
    fm.writeString(cache, JSON.stringify({ r: j.resumen, t: Date.now() }));
    return { r: j.resumen, viejo: false, t: Date.now() };
  } catch (e) {
    if (fm.fileExists(cache)) {
      const c = JSON.parse(fm.readString(cache));
      return { r: c.r || c, viejo: true, t: c.t };
    }
    return { error: String(e.message || e) };
  }
}

function texto(stack, t, font, color, extra) {
  const el = stack.addText(t);
  el.font = font; el.textColor = color; el.lineLimit = 1;
  if (extra) Object.assign(el, extra);
  return el;
}

/** Monto con centavos chicos y tenues. */
function monto(stack, n, tam, conCentavos) {
  const fila = stack.addStack(); fila.bottomAlignContent();
  const s = pesos(n), i = s.lastIndexOf('.');
  texto(fila, conCentavos ? s.slice(0, i) : sinCentavos(n), Font.boldRoundedSystemFont(tam), BLANCO(), { minimumScaleFactor: 0.5 });
  if (conCentavos) texto(fila, s.slice(i), Font.boldRoundedSystemFont(Math.round(tam * 0.5)), BLANCO(0.55));
  return fila;
}

function pastilla(stack, est) {
  const p = stack.addStack();
  p.backgroundColor = new Color('#000000', 0.22); p.cornerRadius = 9; p.setPadding(3, 8, 3, 8); p.centerAlignContent();
  texto(p, '● ', Font.systemFont(8), new Color(est.acento));
  texto(p, est.texto, Font.semiboldSystemFont(11), BLANCO());
}

function lineaPago(r) {
  if (r.por_pagar > 0) return (r.dias_para_pagar < 0 ? 'Tarjeta vencida: ' + sinCentavos(r.por_pagar) : 'Pagar ' + sinCentavos(r.por_pagar) + ' ' + plazo(r));
  if (r.deuda_tarjeta > 0) return 'Próximo pago ' + sinCentavos(r.deuda_tarjeta);
  return 'Tarjeta sin deuda';
}

/* ---------- pantalla de inicio ---------- */

function chico(w, r, est) {
  const top = w.addStack(); top.centerAlignContent();
  texto(top, 'Libre', Font.semiboldSystemFont(13), BLANCO(0.78));
  top.addSpacer();
  texto(top, '●', Font.systemFont(10), new Color(est.acento));
  w.addSpacer(4);
  monto(w, r.libre, 30, false);
  if (r.por_dia != null && r.libre > 0) { w.addSpacer(2); texto(w, 'Unos ' + sinCentavos(r.por_dia) + ' al día', Font.mediumSystemFont(12), BLANCO(0.8)); }
  w.addSpacer();
  const urgente = r.por_pagar > 0 && r.dias_para_pagar <= 3;
  texto(w, lineaPago(r), Font.semiboldSystemFont(12), urgente ? new Color('#ffcf8a') : BLANCO(0.85), { lineLimit: 2, minimumScaleFactor: 0.8 });
}

function mediano(w, r, est) {
  const fila = w.addStack();
  // Izquierda: Libre
  const izq = fila.addStack(); izq.layoutVertically();
  texto(izq, 'Libre para gastar', Font.semiboldSystemFont(13), BLANCO(0.78));
  izq.addSpacer(4);
  monto(izq, r.libre, 34, true);
  izq.addSpacer(6);
  pastilla(izq, est);
  izq.addSpacer();
  if (r.por_dia != null && r.libre > 0) texto(izq, 'Unos ' + sinCentavos(r.por_dia) + ' al día', Font.mediumSystemFont(13), BLANCO(0.85));

  fila.addSpacer();
  // Derecha: datos en tarjetitas
  const der = fila.addStack(); der.layoutVertically();
  const dato = (titulo, valor, color, nota) => {
    const c = der.addStack(); c.layoutVertically(); c.size = new Size(128, 0);
    c.backgroundColor = new Color('#000000', 0.22); c.cornerRadius = 12; c.setPadding(5, 9, 5, 9);
    texto(c, titulo, Font.mediumSystemFont(10), BLANCO(0.65));
    const v = c.addStack(); v.centerAlignContent();
    texto(v, valor, Font.boldRoundedSystemFont(15), color || BLANCO(), { minimumScaleFactor: 0.6 });
    if (nota) { v.addSpacer(4); texto(v, nota, Font.semiboldSystemFont(10), color || BLANCO(0.75), { minimumScaleFactor: 0.7 }); }
    der.addSpacer(5);
  };
  if (r.por_pagar > 0) {
    const d = r.dias_para_pagar;
    const color = d <= 1 ? new Color('#ff8a7e') : d <= 5 ? new Color('#ffcf8a') : null;
    dato('Pagar tarjeta', sinCentavos(r.por_pagar), color, plazo(r));
  } else {
    if (r.deuda_tarjeta > 0) dato('Próximo pago', sinCentavos(r.deuda_tarjeta), null, 'nada vence hoy');
    else dato('Tarjeta', 'Sin deuda', new Color('#3fe0a2'));
  }
  dato('En DiDi débito', sinCentavos(r.saldo_debito));
  dato('Cashback del mes', sinCentavos(r.cashback_estimado || 0), new Color('#d4f26a'));
}

/* ---------- pantalla bloqueada ---------- */

function bloqueoRect(w, r) {
  texto(w, 'LIBRE', Font.semiboldSystemFont(11), BLANCO(0.75));
  texto(w, sinCentavos(r.libre), Font.boldRoundedSystemFont(22), BLANCO(), { minimumScaleFactor: 0.6 });
  texto(w, r.por_pagar > 0 ? 'Tarjeta ' + sinCentavos(r.por_pagar) + ' · ' + plazo(r) : (r.por_dia != null && r.libre > 0 ? 'Unos ' + sinCentavos(r.por_dia) + ' al día' : lineaPago(r)),
    Font.mediumSystemFont(12), BLANCO(0.85), { minimumScaleFactor: 0.7 });
}

async function crear() {
  const datos = await cargar();
  const fam = config.widgetFamily || 'medium';
  const w = new ListWidget();
  // iOS decide cuándo refrescar (normalmente cada 5–15 min). Pedimos lo más pronto posible.
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

  if (datos.error) {
    if (fam.indexOf('accessory') !== 0) w.backgroundColor = new Color('#0f1b16');
    texto(w, fam === 'accessoryInline' ? 'Caudal sin conexión' : 'Caudal: no se pudo cargar', Font.semiboldSystemFont(13), BLANCO(), { lineLimit: 2 });
    return w;
  }
  const r = datos.r;
  const est = ESTADOS[r.estado_libre] || ESTADOS.bien;

  if (fam === 'accessoryInline') { w.addText('Libre ' + sinCentavos(r.libre)); return w; }
  if (fam === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true;
    const t1 = w.addText('Libre'); t1.font = Font.semiboldSystemFont(10); t1.centerAlignText();
    const t2 = w.addText(corto(r.libre)); t2.font = Font.boldRoundedSystemFont(15); t2.minimumScaleFactor = 0.5; t2.centerAlignText();
    return w;
  }
  if (fam === 'accessoryRectangular') { bloqueoRect(w, r); return w; }

  const g = new LinearGradient();
  g.colors = [new Color(est.fondo[0]), new Color(est.fondo[1])]; g.locations = [0, 1];
  g.startPoint = new Point(0, 0); g.endPoint = new Point(1, 1);
  w.backgroundGradient = g;
  w.setPadding(14, 15, 12, 15);

  if (fam === 'small') chico(w, r, est); else mediano(w, r, est);

  // Hora de la última actualización: así se sabe si las cifras están al día.
  w.addSpacer(3);
  const pie = w.addStack(); pie.centerAlignContent();
  const hora = datos.t ? new Date(datos.t) : new Date();
  const df = new DateFormatter(); df.locale = 'es_MX'; df.dateFormat = 'h:mm a';
  texto(pie, (datos.viejo ? 'Sin conexión · ' : 'Actualizado ') + df.string(hora).replace('a. m.', 'a.m.').replace('p. m.', 'p.m.'), Font.mediumSystemFont(9), BLANCO(datos.viejo ? 0.75 : 0.5));
  return w;
}

const widget = await crear();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
