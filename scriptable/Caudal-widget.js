// Caudal — widget informativo para el iPhone (app gratuita "Scriptable").
// Estilo v2 "vidrio": fondo casi negro con luz esmeralda, datos en vidrio translúcido,
// mismos colores que la app (hoja = lo libre, pistache = tarjeta y cashback, azul = débito).
// Pantalla de inicio: Libre, pago de la tarjeta, débito y cashback.
// Pantalla bloqueada: el Libre y el pago de la tarjeta, sin desbloquear.
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

// Paleta de la app (v53)
const C = {
  hoja: '#93cf9f',      // lo libre, "vas bien"
  pistache: '#d6e38f',  // tarjeta y cashback
  azul: '#8fc3ea',      // débito
  coral: '#f0908a',     // negativo / vencido
};
// Fondo: luz esmeralda arriba a la izquierda que cae a casi negro (como la tarjeta Libre).
const ESTADOS = {
  bien: { fondo: ['#1f6e4b', '#0f2a1f', '#080d0b'], acento: C.hoja, texto: 'Vas bien' },
  bajo: { fondo: ['#5c6828', '#252b12', '#0a0c07'], acento: C.pistache, texto: 'Queda poco' },
  negativo: { fondo: ['#7a362f', '#2e1512', '#0c0807'], acento: C.coral, texto: 'Te pasaste' },
};
const BLANCO = (a) => new Color('#ffffff', a == null ? 1 : a);
const col = (hex, a) => new Color(hex, a == null ? 1 : a);

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

function icono(stack, nombre, color, tam) {
  const s = SFSymbol.named(nombre);
  if (!s) return null;
  s.applyFont(Font.semiboldSystemFont(tam));
  const img = stack.addImage(s.image);
  img.tintColor = color; img.imageSize = new Size(tam + 2, tam + 2);
  return img;
}

/** Monto con centavos chicos y tenues (cifras en SF Pro, como Inter en la app). */
function monto(stack, n, tam, conCentavos) {
  const fila = stack.addStack(); fila.bottomAlignContent();
  const s = pesos(n), i = s.lastIndexOf('.');
  texto(fila, conCentavos ? s.slice(0, i) : sinCentavos(n), Font.boldSystemFont(tam), BLANCO(), { minimumScaleFactor: 0.5 });
  if (conCentavos) texto(fila, s.slice(i), Font.boldSystemFont(Math.round(tam * 0.48)), BLANCO(0.7));
  return fila;
}

/** Vidrio: blanco translúcido con un filo de luz, como las tarjetas de la app. */
function vidrio(stack, radio) {
  stack.backgroundColor = BLANCO(0.08);
  stack.borderColor = BLANCO(0.12); stack.borderWidth = 1;
  stack.cornerRadius = radio;
}

function pastilla(stack, est) {
  const p = stack.addStack();
  vidrio(p, 10); p.setPadding(3, 8, 3, 9); p.centerAlignContent();
  texto(p, '●', Font.systemFont(7), col(est.acento));
  p.addSpacer(4);
  texto(p, est.texto, Font.semiboldSystemFont(11), BLANCO());
}

/** Lo que importa de la tarjeta, en las mismas palabras que la app. */
function tarjeta(r) {
  if (r.por_pagar > 0) {
    const d = r.dias_para_pagar;
    return {
      titulo: d < 0 ? 'Tarjeta vencida' : 'Toca pagar',
      valor: sinCentavos(r.por_pagar),
      nota: plazo(r),
      color: d <= 1 ? col(C.coral) : col(C.pistache),
    };
  }
  if (r.deuda_tarjeta > 0) return { titulo: 'Nada que pagar aún', valor: sinCentavos(r.deuda_tarjeta), nota: '', color: BLANCO() };
  return { titulo: 'Tarjeta', valor: 'Sin deuda', nota: '', color: col(C.hoja) };
}

/* ---------- pantalla de inicio ---------- */

function chico(w, r, est) {
  const top = w.addStack(); top.centerAlignContent();
  texto(top, 'Libre para gastar', Font.semiboldSystemFont(12), BLANCO(0.82), { minimumScaleFactor: 0.8 });
  top.addSpacer();
  texto(top, '●', Font.systemFont(9), col(est.acento));
  w.addSpacer(3);
  monto(w, r.libre, 30, false);
  w.addSpacer();
  // Tarjeta en vidrio, abajo
  const t = tarjeta(r);
  const c = w.addStack(); c.layoutHorizontally(); c.centerAlignContent();
  vidrio(c, 12); c.setPadding(6, 8, 6, 8);
  icono(c, 'creditcard.fill', col(C.pistache), 11);
  c.addSpacer(6);
  const v = c.addStack(); v.layoutVertically();
  texto(v, t.titulo + (t.nota ? ' · ' + t.nota : ''), Font.mediumSystemFont(10), BLANCO(0.75), { minimumScaleFactor: 0.7 });
  texto(v, t.valor, Font.boldSystemFont(14), t.color, { minimumScaleFactor: 0.6 });
  c.addSpacer();
}

function mediano(w, r, est) {
  const fila = w.addStack();
  // Izquierda: Libre
  const izq = fila.addStack(); izq.layoutVertically();
  texto(izq, 'Libre para gastar', Font.semiboldSystemFont(13), BLANCO(0.82));
  izq.addSpacer(3);
  monto(izq, r.libre, 34, true);
  izq.addSpacer(7);
  pastilla(izq, est);
  izq.addSpacer();

  fila.addSpacer(12);
  // Derecha: datos en vidrio, cada uno con su color e ícono
  const der = fila.addStack(); der.layoutVertically();
  const dato = (simbolo, colorIco, titulo, valor, colorValor, nota) => {
    const c = der.addStack(); c.centerAlignContent(); c.size = new Size(140, 0);
    vidrio(c, 12); c.setPadding(5, 9, 5, 9);
    icono(c, simbolo, colorIco, 11);
    c.addSpacer(7);
    const t = c.addStack(); t.layoutVertically();
    texto(t, titulo, Font.mediumSystemFont(10), BLANCO(0.72), { minimumScaleFactor: 0.8 });
    const v = t.addStack(); v.bottomAlignContent();
    texto(v, valor, Font.boldSystemFont(14), colorValor || BLANCO(), { minimumScaleFactor: 0.6 });
    if (nota) { v.addSpacer(4); texto(v, nota, Font.semiboldSystemFont(10), BLANCO(0.72), { minimumScaleFactor: 0.7 }); }
    c.addSpacer();
    der.addSpacer(5);
  };
  const t = tarjeta(r);
  dato('creditcard.fill', col(C.pistache), t.titulo, t.valor, t.color, t.nota);
  dato('wallet.pass.fill', col(C.azul), 'En DiDi débito', sinCentavos(r.saldo_debito));
  dato('sparkles', col(C.pistache), 'Cashback del mes', sinCentavos(r.cashback_estimado || 0), col(C.pistache));
}

/* ---------- pantalla bloqueada ---------- */

function bloqueoRect(w, r) {
  texto(w, 'LIBRE', Font.semiboldSystemFont(11), BLANCO(0.75));
  texto(w, sinCentavos(r.libre), Font.boldSystemFont(22), BLANCO(), { minimumScaleFactor: 0.6 });
  const t = tarjeta(r);
  texto(w, r.por_pagar > 0 ? 'Tarjeta ' + t.valor + ' · ' + t.nota : 'En débito ' + sinCentavos(r.saldo_debito),
    Font.mediumSystemFont(12), BLANCO(0.85), { minimumScaleFactor: 0.7 });
}

async function crear() {
  const datos = await cargar();
  const fam = config.widgetFamily || 'medium';
  const w = new ListWidget();
  // iOS decide cuándo refrescar (normalmente cada 5–15 min). Pedimos lo más pronto posible.
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

  if (datos.error) {
    if (fam.indexOf('accessory') !== 0) w.backgroundColor = new Color('#0b100e');
    texto(w, fam === 'accessoryInline' ? 'Caudal sin conexión' : 'Caudal: no se pudo cargar', Font.semiboldSystemFont(13), BLANCO(), { lineLimit: 2 });
    return w;
  }
  const r = datos.r;
  const est = ESTADOS[r.estado_libre] || ESTADOS.bien;

  if (fam === 'accessoryInline') { w.addText('Libre ' + sinCentavos(r.libre)); return w; }
  if (fam === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true;
    const t1 = w.addText('Libre'); t1.font = Font.semiboldSystemFont(10); t1.centerAlignText();
    const t2 = w.addText(corto(r.libre)); t2.font = Font.boldSystemFont(15); t2.minimumScaleFactor = 0.5; t2.centerAlignText();
    return w;
  }
  if (fam === 'accessoryRectangular') { bloqueoRect(w, r); return w; }

  const g = new LinearGradient();
  g.colors = est.fondo.map(h => new Color(h)); g.locations = [0, 0.48, 1];
  g.startPoint = new Point(0, 0); g.endPoint = new Point(0.85, 1);
  w.backgroundGradient = g;
  w.setPadding(14, 15, 11, 15);

  if (fam === 'small') chico(w, r, est); else mediano(w, r, est);

  // Hora de la última actualización: así se sabe si las cifras están al día.
  w.addSpacer(4);
  const pie = w.addStack(); pie.centerAlignContent();
  const hora = datos.t ? new Date(datos.t) : new Date();
  const df = new DateFormatter(); df.locale = 'es_MX'; df.dateFormat = 'h:mm a';
  texto(pie, (datos.viejo ? 'Sin conexión · ' : 'Actualizado ') + df.string(hora).replace('a. m.', 'a.m.').replace('p. m.', 'p.m.'), Font.mediumSystemFont(9), datos.viejo ? col(C.pistache, 0.9) : BLANCO(0.6));
  return w;
}

const widget = await crear();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
