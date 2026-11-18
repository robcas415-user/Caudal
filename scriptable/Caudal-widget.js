// Caudal — widget informativo para el iPhone (app gratuita "Scriptable").
// Estilo v3: el widget es una tarjeta de vidrio de la app (grafito con tinte esmeralda y filo de luz).
// Sin cajas dentro de cajas: filas separadas por líneas finas, cada dato con su ícono y color
// (hoja = lo libre, pistache = tarjeta y cashback, azul = débito).
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
// Cuentas (DiDi, Nu…): el widget muestra la cuenta que se eligió por última vez en la app, con su
// color. Para fijar una cuenta: mantener presionado el widget → Editar widget → Parameter: Nu
// (o DiDi). Así puedes tener un widget de cada cuenta.
//
// Para anotar gastos se usa el ícono "Anotar" (atajo), que corre sin abrir apps.
// Tocar el widget lo actualiza al momento (abre Scriptable un instante).

// Paleta de la app (v53). Con otra cuenta, la hoja manda la paleta con el color de esa cuenta.
const C = {
  hoja: '#93cf9f',      // lo libre, "vas bien"
  pistache: '#d6e38f',  // tarjeta y cashback
  azul: '#8fc3ea',      // débito
  coral: '#f0908a',     // negativo / vencido
};
// Fondo: luz esmeralda arriba a la izquierda que cae a casi negro (como la tarjeta Libre).
let ESTADOS = {
  bien: { fondo: ['#1a3d2c', '#101d17', '#0a0f0d'], acento: C.hoja, texto: 'Vas bien' },
  bajo: { fondo: ['#3a4120', '#181b10', '#0c0d09'], acento: C.pistache, texto: 'Queda poco' },
  negativo: { fondo: ['#4a2420', '#1d1110', '#0e0a09'], acento: C.coral, texto: 'Te pasaste' },
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

const CUENTA = String((typeof args !== 'undefined' && args.widgetParameter) || 'activa').trim();

async function cargar() {
  const url = API + '?accion=resumen&token=' + encodeURIComponent(CLAVE) + '&cuenta=' + encodeURIComponent(CUENTA);
  const fm = FileManager.local();
  const cache = fm.joinPath(fm.documentsDirectory(), 'caudal-cache-' + CUENTA.toLowerCase().replace(/[^a-z0-9]/g, '') + '.json');
  try {
    const req = new Request(url);
    req.timeoutInterval = 20;
    const j = await req.loadJSON();
    if (!j.ok) throw new Error(j.error);
    const d = { r: j.resumen, cuenta: j.cuenta, paleta: j.paleta, varias: (j.cuentas || 1) > 1, t: Date.now() };
    fm.writeString(cache, JSON.stringify(d));
    return Object.assign(d, { viejo: false });
  } catch (e) {
    if (fm.fileExists(cache)) {
      const c = JSON.parse(fm.readString(cache));
      return Object.assign(c, { viejo: true });
    }
    return { error: String(e.message || e) };
  }
}

/** Colores de la cuenta (los calcula la hoja con el mismo método que la app). */
function usarPaleta(p) {
  if (!p) return;
  C.hoja = p.hoja; C.pistache = p.pistache; C.azul = p.azul; C.coral = p.coral;
  ESTADOS = {
    bien: { fondo: p.widget_bien, acento: C.hoja, texto: 'Vas bien' },
    bajo: { fondo: p.widget_bajo, acento: C.pistache, texto: 'Queda poco' },
    negativo: { fondo: p.widget_negativo, acento: C.coral, texto: 'Te pasaste' },
  };
}

/** "Libre para gastar", o con varias cuentas "DiDi · Libre"; en Nu (solo débito) "En Nu". */
function titulo(largo) {
  const nom = DATOS.cuenta ? DATOS.cuenta.nombre : '';
  if (DATOS.r.tipo === 'debito') return 'En ' + (nom || 'débito');
  if (DATOS.varias && nom) return nom + (largo ? ' · Libre para gastar' : ' · Libre');
  return 'Libre para gastar';
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

/** Estado del Libre: punto y texto en su color, sin caja. */
function estado(stack, est, tam) {
  const e = stack.addStack(); e.centerAlignContent();
  texto(e, '●', Font.systemFont(tam - 4), col(est.acento));
  e.addSpacer(5);
  texto(e, est.texto, Font.semiboldSystemFont(tam), col(est.acento));
}

/** Línea fina (horizontal o vertical) como separador. */
function linea(stack, vertical) {
  const l = stack.addStack();
  l.backgroundColor = BLANCO(0.10);
  if (vertical) { l.size = new Size(1, 0); l.layoutVertically(); } else { l.size = new Size(0, 1); l.layoutHorizontally(); }
  l.addSpacer();   // la línea se estira a todo lo ancho (o alto)
  return l;
}

/** Un dato: ícono de color + etiqueta + valor (con nota opcional), sin fondo. */
function dato(stack, simbolo, colorIco, titulo, valor, colorValor, nota) {
  const c = stack.addStack(); c.centerAlignContent(); c.setPadding(5, 0, 5, 0);
  icono(c, simbolo, colorIco, 12);
  c.addSpacer(8);
  const t = c.addStack(); t.layoutVertically();
  texto(t, titulo, Font.mediumSystemFont(10), BLANCO(0.72), { minimumScaleFactor: 0.75 });
  const v = t.addStack(); v.bottomAlignContent();
  texto(v, valor, Font.boldSystemFont(14), colorValor || BLANCO(), { minimumScaleFactor: 0.6 });
  if (nota) { v.addSpacer(4); texto(v, nota, Font.semiboldSystemFont(10), BLANCO(0.72), { minimumScaleFactor: 0.7 }); }
  c.addSpacer();
  return c;
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
  texto(w, titulo(false), Font.semiboldSystemFont(12), BLANCO(0.86), { minimumScaleFactor: 0.8 });
  w.addSpacer(3);
  monto(w, r.libre, 30, false);
  w.addSpacer(5);
  estado(w, est, 11);
  w.addSpacer();
  linea(w, false);
  if (r.tipo === 'debito') { dato(w, 'cart.fill', col(C.pistache), 'Gastado este mes', sinCentavos(r.gastado_mes || 0)); return; }
  const t = tarjeta(r);
  dato(w, 'creditcard.fill', col(C.pistache), t.titulo + (t.nota ? ' · ' + t.nota : ''), t.valor, t.color);
}

function mediano(w, r, est) {
  const fila = w.addStack();
  // Izquierda: Libre
  const izq = fila.addStack(); izq.layoutVertically();
  texto(izq, titulo(true), Font.semiboldSystemFont(13), BLANCO(0.86), { minimumScaleFactor: 0.75 });
  izq.addSpacer(3);
  monto(izq, r.libre, 34, true);
  izq.addSpacer(7);
  estado(izq, est, 12);
  izq.addSpacer();
  pieHora(izq);

  fila.addSpacer(12);
  linea(fila, true);
  fila.addSpacer(12);
  // Derecha: tres datos en filas, separadas por líneas finas
  const der = fila.addStack(); der.layoutVertically(); der.size = new Size(128, 0);
  if (r.tipo === 'debito') {
    // Cuenta de solo débito (como Nu): sin tarjeta ni cashback; lo del mes.
    dato(der, 'cart.fill', col(C.pistache), 'Gastado este mes', sinCentavos(r.gastado_mes || 0));
    linea(der, false);
    dato(der, 'arrow.down.circle.fill', col(C.hoja), 'Entró este mes', sinCentavos(r.recibido_mes || 0));
    return;
  }
  const t = tarjeta(r);
  dato(der, 'creditcard.fill', col(C.pistache), t.titulo, t.valor, t.color, t.nota);
  linea(der, false);
  dato(der, 'wallet.pass.fill', col(C.azul), 'En DiDi débito', sinCentavos(r.saldo_debito));
  linea(der, false);
  dato(der, 'sparkles', col(C.pistache), 'Cashback del mes', sinCentavos(r.cashback_estimado || 0), col(C.pistache));
}

/* ---------- pantalla bloqueada ---------- */

function bloqueoRect(w, r) {
  texto(w, titulo(false).toUpperCase(), Font.semiboldSystemFont(11), BLANCO(0.75));
  if (r.tipo === 'debito') {
    texto(w, sinCentavos(r.libre), Font.boldSystemFont(22), BLANCO(), { minimumScaleFactor: 0.6 });
    texto(w, 'Gastado este mes ' + sinCentavos(r.gastado_mes || 0), Font.mediumSystemFont(12), BLANCO(0.85), { minimumScaleFactor: 0.7 });
    return;
  }
  texto(w, sinCentavos(r.libre), Font.boldSystemFont(22), BLANCO(), { minimumScaleFactor: 0.6 });
  const t = tarjeta(r);
  texto(w, r.por_pagar > 0 ? 'Tarjeta ' + t.valor + ' · ' + t.nota : 'En débito ' + sinCentavos(r.saldo_debito),
    Font.mediumSystemFont(12), BLANCO(0.85), { minimumScaleFactor: 0.7 });
}

let DATOS = null;
/** Hora de la última actualización: así se sabe si las cifras están al día. */
function pieHora(stack) {
  const hora = DATOS.t ? new Date(DATOS.t) : new Date();
  const df = new DateFormatter(); df.locale = 'es_MX'; df.dateFormat = 'h:mm a';
  texto(stack, (DATOS.viejo ? 'Sin conexión · ' : 'Actualizado ') + df.string(hora).replace('a. m.', 'a.m.').replace('p. m.', 'p.m.'),
    Font.mediumSystemFont(9), DATOS.viejo ? col(C.pistache, 0.9) : BLANCO(0.6));
}

async function crear() {
  const datos = await cargar();
  DATOS = datos;
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
  usarPaleta(datos.paleta);
  const est = Object.assign({}, ESTADOS[r.estado_libre] || ESTADOS.bien);
  if (r.tipo === 'debito' && r.estado_libre === 'negativo') est.texto = 'Revisa';

  if (fam === 'accessoryInline') { w.addText((r.tipo === 'debito' ? (datos.cuenta ? datos.cuenta.nombre : 'Saldo') : 'Libre') + ' ' + sinCentavos(r.libre)); return w; }
  if (fam === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true;
    const t1 = w.addText(r.tipo === 'debito' && datos.cuenta ? datos.cuenta.nombre : 'Libre'); t1.font = Font.semiboldSystemFont(10); t1.centerAlignText();
    const t2 = w.addText(corto(r.libre)); t2.font = Font.boldSystemFont(15); t2.minimumScaleFactor = 0.5; t2.centerAlignText();
    return w;
  }
  if (fam === 'accessoryRectangular') { bloqueoRect(w, r); return w; }

  const g = new LinearGradient();
  g.colors = est.fondo.map(h => new Color(h)); g.locations = [0, 0.45, 1];
  g.startPoint = new Point(0, 0); g.endPoint = new Point(0.85, 1);
  w.backgroundGradient = g;
  w.setPadding(15, 15, 11, 15);

  if (fam === 'small') chico(w, r, est); else mediano(w, r, est);

  if (fam === 'small') { w.addSpacer(2); pieHora(w); }
  return w;
}

const widget = await crear();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
