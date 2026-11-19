// Caudal — widget informativo para el iPhone (app gratuita "Scriptable").
// Estilo v5: con varias cuentas, una ficha por cuenta en SU color (naranja DiDi, morado Nu…), vivo y con brillo de vidrio,
// sobre un fondo de humo delgado (no un marco negro). Texto blanco; el estado va en una píldora.
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
// Cuentas (DiDi, Nu…):
//  - Sin parámetro, en tamaño CHICO (cuadrado), mediano o grande: un solo widget con las cuentas apiladas,
//    una ficha por cuenta (DiDi arriba, Nu abajo) del color de esa cuenta y con lo que le toca según su tipo.
//    El color sale del que eliges para la cuenta en Ajustes de la app: si lo cambias, el widget lo sigue.
//  - Con parámetro (mantener presionado el widget → Editar widget → Parameter: Nu o DiDi): solo esa cuenta,
//    en tamaño chico o mediano. Así puedes tener un widget de cada cuenta.
//  - Si solo hay una cuenta, el widget es el de siempre (Libre y datos de la tarjeta).
//
// Tocar el widget abre la app (en Safari, ya conectada). Para anotar gastos se usa el ícono "Anotar" (atajo).
const ABRIR_APP = true;   // false = tocar el widget lo actualiza al momento (abre Scriptable un instante)
const APP = 'https://robcas415-user.github.io/Caudal/';

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

const VERSION = 'v5.2';   // si el widget muestra otra, pegaste un archivo distinto

/** Revisa que las dos líneas del inicio estén llenas; si no, dice cuál falta. */
function revisarDatos() {
  if (API.indexOf('http') !== 0) return 'Falta pegar la dirección de la API (línea 9 del script, termina en /exec).';
  if (!CLAVE || CLAVE.indexOf('PEGA_AQUI') === 0) return 'Falta pegar la clave (línea 10 del script).';
  return '';
}

/** Explica en español por qué no cargó (en vez de un "no se pudo cargar" mudo). */
function motivo(e) {
  const m = String((e && e.message) || e || '');
  if (/JSON|parse|unexpected|<html|<!doctype/i.test(m)) return 'La hoja no respondió con datos. Revisa que la implementación sea "Cualquier usuario" y que la dirección termine en /exec.';
  if (/clave|token/i.test(m)) return 'La clave no es correcta. Vuelve a copiarla del menú Caudal de la hoja.';
  if (/offline|connect|internet|network|conexi|timed out|tiempo/i.test(m)) return 'Sin conexión a internet.';
  return m.slice(0, 120) || 'Error desconocido.';
}


async function cargar() {
  const url = API + '?accion=resumen&token=' + encodeURIComponent(CLAVE) + '&cuenta=' + encodeURIComponent(CUENTA);
  const falta = revisarDatos();
  if (falta) return { error: falta };
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
    return { error: motivo(e) };
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


/* ---------- varias cuentas en un solo widget (fichas de vidrio apiladas) ---------- */

const MAX_FICHAS = { small: 2, medium: 2, large: 5 };

async function cargarTodas(familia) {
  const fm = FileManager.local();
  const cache = fm.joinPath(fm.documentsDirectory(), 'caudal-cache-todas.json');
  try {
    const rq = new Request(API + '?accion=cuentas&token=' + encodeURIComponent(CLAVE));
    rq.timeoutInterval = 20;
    const lista = await rq.loadJSON();
    if (!lista.ok) throw new Error(lista.error);
    const cuentas = lista.cuentas.slice(0, MAX_FICHAS[familia] || 2);
    const cada = await Promise.all(cuentas.map(async (c) => {
      const q = new Request(API + '?accion=resumen&token=' + encodeURIComponent(CLAVE) + '&cuenta=' + encodeURIComponent(c.id));
      q.timeoutInterval = 20;
      const j = await q.loadJSON();
      if (!j.ok) throw new Error(j.error);
      return { r: j.resumen, cuenta: j.cuenta, paleta: j.paleta };
    }));
    const d = { lista: cada, total: lista.cuentas.length, t: Date.now() };
    fm.writeString(cache, JSON.stringify(d));
    return Object.assign(d, { viejo: false });
  } catch (e) {
    if (fm.fileExists(cache)) return Object.assign(JSON.parse(fm.readString(cache)), { viejo: true });
    return { error: motivo(e) };
  }
}

/** Colores y texto del estado de una cuenta, con SU paleta (no la global). */
function estadoDe(d) {
  const p = d.paleta, r = d.r, k = r.estado_libre in { bien: 1, bajo: 1, negativo: 1 } ? r.estado_libre : 'bien';
  const fondo = k === 'bien' ? p.widget_bien : k === 'bajo' ? p.widget_bajo : p.widget_negativo;
  const acento = k === 'bien' ? p.hoja : k === 'bajo' ? p.pistache : p.coral;
  let texto = k === 'bien' ? 'Vas bien' : k === 'bajo' ? 'Queda poco' : 'Te pasaste';
  if (r.tipo === 'debito' && k === 'negativo') texto = 'Revisa';
  const marca = p.color || (d.cuenta && d.cuenta.color) || '#2f6b4a';
  return { k, fondo, acento, texto, pal: p, ficha: coloresFicha(marca) };
}

/* ---------- color de cada cuenta, en OKLCH (mismo método que la app) ---------- */

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const gam = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function aOklch(hex) {
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const h = Math.atan2(B, A) * 180 / Math.PI;
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, Math.hypot(A, B), h < 0 ? h + 360 : h];
}
function deOklch(L, C, h) {
  const lineal = (c) => {
    const a = c * Math.cos(h * Math.PI / 180), b = c * Math.sin(h * Math.PI / 180);
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3), m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3), s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  };
  const cabe = (c) => lineal(c).every(v => v >= -1e-4 && v <= 1.0001);
  let c = C;
  if (!cabe(c)) { let lo = 0, hi = C; for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (cabe(mid)) lo = mid; else hi = mid; } c = lo; }
  return '#' + lineal(c).map(v => Math.round(gam(Math.max(0, Math.min(1, v)))).toString(16).padStart(2, '0')).join('');
}

/**
 * Colores de la ficha a partir del color de marca de la cuenta (el que se elige en Ajustes).
 * La ficha es del color de la cuenta, vivo pero lo bastante hondo para que el texto blanco se lea
 * (luminosidad fija: naranja, morado o verde quedan con el mismo contraste).
 */
function coloresFicha(marca) {
  let [, C, h] = aOklch(/^#[0-9a-f]{6}$/i.test(marca) ? marca : '#2f6b4a');
  const neutro = C < 0.02;
  const c = neutro ? 0.012 : Math.max(0.09, Math.min(C, 0.16));
  return {
    arriba: deOklch(0.58, c, h),    // luz arriba a la izquierda
    abajo: deOklch(0.47, c * 0.95, h),
    filo: deOklch(0.80, c * 0.6, h), // borde de luz
    fondo: deOklch(0.30, neutro ? 0.01 : 0.045, h),  // fondo del widget detrás de la ficha
    h, c,
  };
}

/** Fondo del widget: humo oscuro con el tono de cada cuenta (no negro), para que no se vea como marco pesado. */
function fondoVarias(ests) {
  const A = ests[0].ficha.fondo, B = ests[ests.length - 1].ficha.fondo;
  const g = new LinearGradient();
  g.colors = [A, mezcla(A, B, 0.5), B].map(h => new Color(h));
  g.locations = [0, 0.5, 1];
  g.startPoint = new Point(0.2, 0); g.endPoint = new Point(0.8, 1);
  return g;
}

/** Fondo de la ficha: degradado del color de la cuenta con luz arriba (brillo de vidrio).
 *  Es un degradado y no una imagen: así siempre cubre la ficha exacta, mida lo que mida en ese iPhone. */
function cristal(F) {
  const g = new LinearGradient();
  g.colors = [mezcla(F.arriba, '#ffffff', 0.16), F.arriba, F.abajo].map(h => new Color(h));
  g.locations = [0, 0.4, 1];
  g.startPoint = new Point(0, 0); g.endPoint = new Point(0, 1);
  return g;
}

/** Mezcla de dos colores hex (t de 0 a 1). */
function mezcla(a, b, t) {
  const f = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const x = f(a), y = f(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** Plazo corto para espacios chicos: "hoy", "mañana", "8 d". */
function plazoCorto(r) {
  const d = r.dias_para_pagar;
  return d < 0 ? 'vencido' : d === 0 ? 'hoy' : d === 1 ? 'mañana' : d + ' d';
}

// Sobre la ficha de color todo es blanco; lo urgente (pagar hoy/mañana, vencido) va en amarillo claro.
const URGENTE = '#ffe58a';

/** El dato que más importa de la tarjeta. */
function datoTarjeta(r) {
  if (r.por_pagar > 0) {
    const d = r.dias_para_pagar;
    return { etq: d < 0 ? 'Vencido' : 'Pagar', valor: sinCentavos(r.por_pagar), nota: plazoCorto(r), urgente: d <= 1, color: d <= 1 ? col(URGENTE) : BLANCO() };
  }
  if (r.deuda_tarjeta > 0) return { etq: 'Debes', valor: sinCentavos(r.deuda_tarjeta), nota: '', color: BLANCO() };
  return { etq: 'Tarjeta', valor: 'Sin deuda', nota: '', color: BLANCO() };
}

/** Estado de la cuenta como píldora: discreta si vas bien, llamativa si queda poco o te pasaste. */
function pildora(stack, est, tam) {
  const p = stack.addStack(); p.centerAlignContent(); p.cornerRadius = 8; p.setPadding(1.5, 6, 1.5, 6);
  const estilo = est.k === 'bien' ? [BLANCO(0.22), BLANCO()]
    : est.k === 'bajo' ? [col('#fff1c2'), col('#5a3b00')]
      : [BLANCO(), col('#b3261e')];
  p.backgroundColor = estilo[0];
  texto(p, est.texto, Font.semiboldSystemFont(tam), estilo[1], { minimumScaleFactor: 0.7 });
  return p;
}

/** Un indicador (etiqueta + valor + nota). */
function indicador(stack, etiqueta, valor, nota, colorValor, ancho) {
  const v = stack.addStack(); v.layoutVertically(); v.size = new Size(ancho, 0);
  texto(v, etiqueta, Font.mediumSystemFont(10), BLANCO(0.82), { minimumScaleFactor: 0.7 });
  v.addSpacer(1);
  const f = v.addStack(); f.bottomAlignContent();
  texto(f, valor, Font.boldSystemFont(16), colorValor || BLANCO(), { minimumScaleFactor: 0.6 });
  if (nota) { f.addSpacer(3); texto(f, nota, Font.semiboldSystemFont(10), BLANCO(0.85), { minimumScaleFactor: 0.6 }); }
}

/** Lo relevante de cada cuenta en el mediano: tarjeta (y cashback si lo hay), o lo del mes en débito (gastado y entró). */
function indicadoresDe(d) {
  const r = d.r;
  if (r.tipo === 'debito') return [['Gastado', sinCentavos(r.gastado_mes || 0), '', null], ['Entró', sinCentavos(r.recibido_mes || 0), '', null]];
  const t = datoTarjeta(r);
  const lista = [[t.etq + (t.nota ? ' · ' + t.nota : ''), t.valor, '', t.color]];
  // Cashback solo si esta tarjeta lo lleva (si no ha ganado nada, en su lugar va el saldo en débito).
  if ((r.cashback_estimado || 0) > 0) lista.push(['Cashback', sinCentavos(r.cashback_estimado), '', null]);
  else lista.push(['En débito', sinCentavos(r.saldo_debito), '', null]);
  return lista;
}

/** Marco de la ficha: del color de la cuenta, con filo de luz. Sin tamaño fijo: se estira a lo que mida el widget. */
function marco(w, est, radio, padH, padV) {
  const f = w.addStack(); f.layoutHorizontally(); f.centerAlignContent();
  f.cornerRadius = radio; f.setPadding(padV, padH, padV, padH);
  f.backgroundGradient = cristal(est.ficha);
  f.borderWidth = MEDIR ? 2 : 1; f.borderColor = MEDIR ? col('#ff2d55') : col(est.ficha.filo, 0.55);
  return f;
}

/** Hace que la ficha crezca a lo alto para llenar el widget, sin meter espaciadores flexibles entre los textos
 *  (si los hay, iOS reparte el alto entre ellos y la cifra grande y encoge la cifra de más). */
function estirarAlto(f) { const e = f.addStack(); e.layoutVertically(); e.addSpacer(); }

/** Cifra grande. Solo se encoge si de verdad no cabe (widget muy chico o cifra muy larga). */
function cifra(stack, n, tam) {
  const s = sinCentavos(n);
  return texto(stack, s, Font.boldSystemFont(s.length > 7 ? Math.round(tam * 0.85) : tam), BLANCO(), { minimumScaleFactor: 0.7 });
}

/** Ficha del widget chico (cuadrado): nombre y estado, cifra grande, y el dato de apoyo a todo lo ancho. */
function fichaChica(w, d, est) {
  const r = d.r, nom = d.cuenta ? d.cuenta.nombre : '';
  const f = marco(w, est, RADIO_FICHA, 9, 5);
  // Sin anchos ni altos fijos: cada fila lleva un espaciador a lo ancho y la ficha se estira a lo alto, así la
  // ficha llena el widget mida lo que mida en ese iPhone. Los textos quedan centrados a lo alto dentro de la ficha.
  const c = f.addStack(); c.layoutVertically();
  const l1 = c.addStack(); l1.centerAlignContent();
  texto(l1, nom, Font.boldSystemFont(12), BLANCO(), { minimumScaleFactor: 0.7 });
  l1.addSpacer();
  pildora(l1, est, 9);
  c.addSpacer(1);
  const l2 = c.addStack(); cifra(l2, r.libre, 26); l2.addSpacer();
  c.addSpacer(1);
  const l3 = c.addStack(); l3.centerAlignContent();
  if (r.tipo === 'debito') {
    texto(l3, 'Gastado este mes', Font.mediumSystemFont(10), BLANCO(0.85), { minimumScaleFactor: 0.7 });
    l3.addSpacer(4);
    l3.addSpacer();
    texto(l3, sinCentavos(r.gastado_mes || 0), Font.boldSystemFont(12), BLANCO(), { minimumScaleFactor: 0.6 });
  } else {
    const t = datoTarjeta(r);
    texto(l3, t.etq + (t.nota ? ' · ' + t.nota : ''), Font.mediumSystemFont(10), t.urgente ? t.color : BLANCO(0.85), { minimumScaleFactor: 0.7 });
    l3.addSpacer(4);
    l3.addSpacer();
    texto(l3, t.valor, Font.boldSystemFont(12), t.color, { minimumScaleFactor: 0.6 });
  }
  estirarAlto(f);
}

/** Ficha del widget mediano (ancho): cifra a la izquierda, dos indicadores a la derecha. */
function fichaMediana(w, d, est) {
  const r = d.r, nom = d.cuenta ? d.cuenta.nombre : '';
  const f = marco(w, est, RADIO_FICHA, 13, 7);
  const izq = f.addStack(); izq.layoutVertically(); izq.size = new Size(100, 0);   // ancho fijo: el estado queda alineado en todas las fichas
  const l1 = izq.addStack(); l1.centerAlignContent();
  texto(l1, nom, Font.boldSystemFont(12), BLANCO(), { minimumScaleFactor: 0.7 });
  l1.addSpacer();
  pildora(l1, est, 9);
  izq.addSpacer(2);
  cifra(izq, r.libre, 26);
  f.addSpacer();
  const ind = indicadoresDe(d);
  ind.forEach((x) => {
    f.addSpacer(7);
    const sep = f.addStack(); sep.backgroundColor = BLANCO(0.3); sep.size = new Size(1, 32);
    f.addSpacer(7);
    indicador(f, x[0], x[1], x[2], x[3], 80);
  });
  estirarAlto(f);
}

/** Ícono de "última actualización": la flecha circular de la app (línea fina, puntas redondas), dibujada a mano
 *  para no depender de los símbolos del sistema. Mismo trazo que `i-refresh` de la app (cuadrícula de 24). */
function iconoActualizar(color, lado) {
  const k = 6, dc = new DrawContext();
  dc.size = new Size(24 * k, 24 * k); dc.opaque = false; dc.respectScreenScale = true;
  const P = (x, y) => new Point(x * k, y * k);
  const arco = new Path();
  for (let g = 0; g <= 315; g += 5) {
    const r = g * Math.PI / 180, pt = P(12 + 7.5 * Math.cos(r), 12 + 7.5 * Math.sin(r));
    if (g === 0) arco.move(pt); else arco.addLine(pt);
  }
  const punta = new Path();
  punta.move(P(19.5, 4)); punta.addLine(P(19.5, 8.5)); punta.addLine(P(15, 8.5));
  dc.setStrokeColor(color); dc.setLineWidth(2.1 * k);
  dc.addPath(arco); dc.strokePath();
  dc.addPath(punta); dc.strokePath();
  return dc.getImage();
}

function horaTexto(t) {
  const df = new DateFormatter(); df.locale = 'es_MX'; df.dateFormat = 'h:mm a';
  return df.string(new Date(t)).replace('a. m.', 'a.m.').replace('p. m.', 'p.m.');
}

// Guía de Apple (HIG, Widgets): margen estándar 16 pt; 11 pt para agrupar contenido en formas con fondo.
// Aquí las fichas son esas formas: 10 pt alrededor (casi los 11 de Apple, para que quepan dos cuentas en el chico).
// Esquinas concéntricas: radio de la ficha = radio del widget (~22 pt) − margen.
const MARGEN = 10, RADIO_FICHA = 12;
// Modo para medir en el iPhone real: Parameter del widget = "medir". Bordes rojos en las fichas y,
// abajo, el tamaño de pantalla que reporta el iPhone y la versión del script.
const MEDIR = CUENTA.toLowerCase() === 'medir';

function variasFichas(datos, fam) {
  const w = new ListWidget();
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
  const ests = datos.lista.map(estadoDe);
  w.backgroundGradient = fondoVarias(ests);
  const chico = fam === 'small';
  const n = datos.lista.length;
  const gap = 5;
  // Abajo un poco menos: la línea de la hora ya trae aire propio, así se ve el mismo margen en los cuatro lados.
  w.setPadding(MARGEN, MARGEN, MARGEN - 2, MARGEN);
  // Nada de medidas supuestas: las fichas no tienen alto ni ancho fijos y se reparten todo el espacio del widget
  // (el tamaño real cambia según el modelo de iPhone, el zoom de pantalla y la versión de iOS).
  datos.lista.forEach((d, i) => {
    if (i > 0) w.addSpacer(gap);
    (chico ? fichaChica : fichaMediana)(w, d, ests[i]);
  });
  w.addSpacer(4);
  // Hora de la última actualización, centrada y pegada a las fichas, para saber si las cifras están al día.
  const tono = datos.viejo ? col(URGENTE, 0.95) : BLANCO(0.78);
  const fila = w.addStack(); fila.centerAlignContent(); fila.size = new Size(0, 12);   // alto fijo: ícono y hora se centran sobre la misma línea
  fila.addSpacer();
  // El ícono va en su propio cuadro del alto de la fila y centrado, igual que el texto: comparten el mismo centro.
  const cuadro = fila.addStack(); cuadro.size = new Size(9, 12); cuadro.centerAlignContent();
  const im = cuadro.addImage(iconoActualizar(tono));
  im.imageSize = new Size(9, 9); fila.addSpacer(3);
  let pie = horaTexto(datos.t);
  if (MEDIR) { let sz = { width: 0, height: 0 }; try { sz = Device.screenSize(); } catch (e) {}
    pie = Math.round(sz.width) + '×' + Math.round(sz.height) + ' · ' + fam + ' · ' + VERSION; }
  texto(fila, pie + (datos.viejo ? ' · sin conexión' : '') + (!chico && datos.total > n ? ' · +' + (datos.total - n) + ' más' : ''),
    Font.semiboldSystemFont(9), tono);
  fila.addSpacer();
  return w;
}

let DATOS = null;
/** Hora de la última actualización: así se sabe si las cifras están al día. */
function pieHora(stack) {
  const hora = DATOS.t ? new Date(DATOS.t) : new Date();
  const df = new DateFormatter(); df.locale = 'es_MX'; df.dateFormat = 'h:mm a';
  texto(stack, (DATOS.viejo ? 'Sin conexión · ' : 'Actualizado ') + df.string(hora).replace('a. m.', 'a.m.').replace('p. m.', 'p.m.'),
    Font.mediumSystemFont(9), DATOS.viejo ? col(C.pistache, 0.9) : BLANCO(0.6));
}

function abrir(w) {
  if (ABRIR_APP && API.indexOf('http') === 0) w.url = APP + '#api=' + encodeURIComponent(API) + '&clave=' + encodeURIComponent(CLAVE);
  return w;
}

async function crear() {
  const fam0 = config.widgetFamily || 'medium';
  // Sin parámetro, en mediano o grande: todas las cuentas en un solo widget.
  if ((CUENTA === 'activa' || CUENTA.toLowerCase() === 'todas' || MEDIR) && (fam0 === 'small' || fam0 === 'medium' || fam0 === 'large')) {
    const todas = await cargarTodas(fam0);
    if (!todas.error && todas.lista.length > 1) return abrir(variasFichas(todas, fam0));
  }
  const datos = await cargar();
  DATOS = datos;
  const fam = config.widgetFamily || 'medium';
  const w = new ListWidget();
  // iOS decide cuándo refrescar (normalmente cada 5–15 min). Pedimos lo más pronto posible.
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

  if (datos.error) {
    if (fam.indexOf('accessory') !== 0) w.backgroundColor = new Color('#0b100e');
    if (fam === 'accessoryInline') { w.addText('Caudal sin conexión'); return w; }
    texto(w, 'Caudal: no se pudo cargar', Font.semiboldSystemFont(13), BLANCO(), { lineLimit: 2 });
    w.addSpacer(4);
    texto(w, String(datos.error), Font.mediumSystemFont(10), BLANCO(0.75), { lineLimit: 6 });
    w.addSpacer(4);
    texto(w, 'Caudal ' + VERSION, Font.mediumSystemFont(8), BLANCO(0.4));
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
  return abrir(w);
}

const widget = await crear();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
