// Caudal — widget informativo para el iPhone (app gratuita "Scriptable").
// Estilo v4: con varias cuentas, una ficha de vidrio por cuenta. El widget es una tarjeta de vidrio de la app (grafito con tinte esmeralda y filo de luz).
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
//    una "ficha de vidrio" por cuenta (DiDi arriba, Nu abajo) con el tinte de su color y lo que le toca
//    según su tipo, y un fondo que pasa suavemente del color de una cuenta al de la otra. Los colores salen
//    de la paleta de cada cuenta (la misma de la app): si cambias el color en Ajustes, el widget lo sigue.
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
    return { error: String(e.message || e) };
  }
}

/** Colores y texto del estado de una cuenta, con SU paleta (no la global). */
function estadoDe(d) {
  const p = d.paleta, r = d.r, k = r.estado_libre in { bien: 1, bajo: 1, negativo: 1 } ? r.estado_libre : 'bien';
  const fondo = k === 'bien' ? p.widget_bien : k === 'bajo' ? p.widget_bajo : p.widget_negativo;
  const acento = k === 'bien' ? p.hoja : k === 'bajo' ? p.pistache : p.coral;
  let texto = k === 'bien' ? 'Vas bien' : k === 'bajo' ? 'Queda poco' : 'Te pasaste';
  if (r.tipo === 'debito' && k === 'negativo') texto = 'Revisa';
  return { fondo, acento, texto, pal: p };
}

/** Mezcla de dos colores hex (t de 0 a 1). */
function mezcla(a, b, t) {
  const f = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const x = f(a), y = f(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** Fondo del widget: del tono de la primera cuenta al de la última, con la parte media más oscura. */
function fondoVarias(ests) {
  const A = ests[0].fondo, B = ests[ests.length - 1].fondo;
  const g = new LinearGradient();
  g.colors = [A[0], A[1], mezcla(A[2], B[2], 0.5), B[1], B[0]].map(h => new Color(h));
  g.locations = [0, 0.30, 0.5, 0.70, 1];
  g.startPoint = new Point(0.1, 0); g.endPoint = new Point(0.9, 1);
  return g;
}

/** Cristal de la ficha: velo con el tinte de la cuenta y brillo arriba (iOS no deja desenfocar de verdad). */
function cristal(ancho, alto, tinte) {
  const dc = new DrawContext();
  dc.size = new Size(ancho, alto); dc.opaque = false; dc.respectScreenScale = true;
  dc.setFillColor(new Color('#ffffff', 0.05)); dc.fillRect(new Rect(0, 0, ancho, alto));
  dc.setFillColor(new Color(tinte, 0.13)); dc.fillRect(new Rect(0, 0, ancho, alto));
  const franjas = 22, zona = alto * 0.6;
  for (let i = 0; i < franjas; i++) {
    dc.setFillColor(new Color('#ffffff', 0.15 * Math.pow(1 - i / franjas, 2)));
    dc.fillRect(new Rect(0, (zona / franjas) * i, ancho, zona / franjas + 0.5));
  }
  dc.setFillColor(new Color('#ffffff', 0.24)); dc.fillRect(new Rect(0, 0, ancho, 1.2));   // filo de luz arriba
  return dc.getImage();
}

/** Plazo corto para espacios chicos: "hoy", "mañana", "8 d". */
function plazoCorto(r) {
  const d = r.dias_para_pagar;
  return d < 0 ? 'vencido' : d === 0 ? 'hoy' : d === 1 ? 'mañana' : d + ' d';
}

/** El dato que más importa de la tarjeta, con su color. */
function datoTarjeta(r, P) {
  if (r.por_pagar > 0) {
    const d = r.dias_para_pagar;
    return { etq: d < 0 ? 'Vencido' : 'Pagar', valor: sinCentavos(r.por_pagar), nota: plazoCorto(r), color: d <= 1 ? col(P.coral) : col(P.pistache) };
  }
  if (r.deuda_tarjeta > 0) return { etq: 'Debes', valor: sinCentavos(r.deuda_tarjeta), nota: '', color: BLANCO() };
  return { etq: 'Tarjeta', valor: 'Sin deuda', nota: '', color: col(P.hoja) };
}

/** Un indicador (etiqueta + valor + nota). */
function indicador(stack, etiqueta, valor, nota, colorValor, ancho) {
  const v = stack.addStack(); v.layoutVertically(); v.size = new Size(ancho, 0);
  texto(v, etiqueta, Font.mediumSystemFont(9), BLANCO(0.66), { minimumScaleFactor: 0.7 });
  v.addSpacer(1);
  const f = v.addStack(); f.bottomAlignContent();
  texto(f, valor, Font.boldSystemFont(15), colorValor || BLANCO(), { minimumScaleFactor: 0.6 });
  if (nota) { f.addSpacer(3); texto(f, nota, Font.semiboldSystemFont(9), BLANCO(0.7), { minimumScaleFactor: 0.6 }); }
}

/** Lo relevante de cada cuenta en el mediano: tarjeta (y cashback si lo hay), o lo del mes en débito. */
function indicadoresDe(d, est) {
  const r = d.r, P = est.pal;
  if (r.tipo === 'debito') return [['Gastado en el mes', sinCentavos(r.gastado_mes || 0), '', null], ['Entró en el mes', sinCentavos(r.recibido_mes || 0), '', col(P.hoja)]];
  const t = datoTarjeta(r, P);
  const lista = [[t.etq === 'Pagar' ? 'Toca pagar' : t.etq, t.valor, t.nota, t.color]];
  // Cashback solo si esta tarjeta lo lleva (si no ha ganado nada, en su lugar va el saldo en débito).
  if ((r.cashback_estimado || 0) > 0) lista.push(['Cashback del mes', sinCentavos(r.cashback_estimado), '', col(P.pistache)]);
  else lista.push(['En débito', sinCentavos(r.saldo_debito), '', col(P.azul)]);
  return lista;
}

/** Marco de la ficha: vidrio con tinte, borde de luz del color de la cuenta. */
function marco(w, est, alto, ancho, radio, padH) {
  const f = w.addStack(); f.layoutHorizontally(); f.centerAlignContent();
  f.size = new Size(0, alto); f.cornerRadius = radio; f.setPadding(5, padH, 5, padH);
  f.backgroundImage = cristal(ancho, alto, est.pal.acento);
  f.borderWidth = 1; f.borderColor = col(est.pal.acento, 0.34);
  return f;
}

/** Ficha del widget chico (cuadrado): nombre y estado, cifra grande y un dato de apoyo. */
function fichaChica(w, d, est, alto, ancho) {
  const r = d.r, nom = d.cuenta ? d.cuenta.nombre : '';
  const f = marco(w, est, alto, ancho, 14, 9);
  // Columna de ancho fijo (el de la ficha por dentro): así el estado queda siempre pegado al borde derecho,
  // igual en todas las fichas, sin depender de qué tan largo sea el texto de abajo.
  const c = f.addStack(); c.layoutVertically(); c.size = new Size(ancho - 2 * 9 - 2, 0);
  const l1 = c.addStack(); l1.centerAlignContent();
  texto(l1, '●', Font.systemFont(7), col(est.acento)); l1.addSpacer(4);
  texto(l1, nom, Font.semiboldSystemFont(11), BLANCO(0.92), { minimumScaleFactor: 0.7 });
  l1.addSpacer();
  texto(l1, est.texto, Font.mediumSystemFont(9), col(est.acento), { minimumScaleFactor: 0.7 });
  monto(c, r.libre, 23, false);
  const l3 = c.addStack(); l3.centerAlignContent();
  if (r.tipo === 'debito') {
    texto(l3, 'Gastado', Font.mediumSystemFont(9), BLANCO(0.64)); l3.addSpacer(3);
    texto(l3, sinCentavos(r.gastado_mes || 0), Font.boldSystemFont(11), BLANCO(0.92), { minimumScaleFactor: 0.6 }); l3.addSpacer(3);
    texto(l3, 'este mes', Font.mediumSystemFont(9), BLANCO(0.64), { minimumScaleFactor: 0.6 });
  } else {
    const t = datoTarjeta(r, est.pal);
    texto(l3, t.etq, Font.mediumSystemFont(9), BLANCO(0.64)); l3.addSpacer(3);
    texto(l3, t.valor, Font.boldSystemFont(11), t.color, { minimumScaleFactor: 0.6 });
    if (t.nota) { l3.addSpacer(3); texto(l3, '· ' + t.nota, Font.mediumSystemFont(9), BLANCO(0.64), { minimumScaleFactor: 0.6 }); }
  }
}

/** Ficha del widget mediano (ancho): cifra a la izquierda, dos indicadores a la derecha. */
function fichaMediana(w, d, est, alto, ancho) {
  const r = d.r, nom = d.cuenta ? d.cuenta.nombre : '';
  const f = marco(w, est, alto, ancho, 16, 13);
  const izq = f.addStack(); izq.layoutVertically(); izq.size = new Size(100, 0);   // ancho fijo: el estado queda alineado en todas las fichas
  const l1 = izq.addStack(); l1.centerAlignContent();
  texto(l1, '●', Font.systemFont(8), col(est.acento)); l1.addSpacer(4);
  texto(l1, nom, Font.semiboldSystemFont(11), BLANCO(0.92), { minimumScaleFactor: 0.7 });
  l1.addSpacer();
  texto(l1, est.texto, Font.mediumSystemFont(10), col(est.acento), { minimumScaleFactor: 0.7 });
  monto(izq, r.libre, 25, false);
  f.addSpacer();
  const ind = indicadoresDe(d, est);
  ind.forEach((x, i) => {
    f.addSpacer(8);
    const sep = f.addStack(); sep.backgroundColor = col(est.pal.acento, 0.28); sep.size = new Size(1, alto - 24);
    f.addSpacer(8);
    indicador(f, x[0], x[1], x[2], x[3], 70);
  });
}

/** Alto del widget chico según el iPhone (en puntos), para que las dos fichas quepan sin recortarse. */
function ladoChico() {
  const t = { 320: 141, 375: 148, 390: 158, 393: 158, 414: 169, 428: 170, 430: 170 };
  let w = 390; try { w = Device.screenSize().width; } catch (e) {}
  return t[w] || 158;
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

function variasFichas(datos, fam) {
  const w = new ListWidget();
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
  const ests = datos.lista.map(estadoDe);
  w.backgroundGradient = fondoVarias(ests);
  const chico = fam === 'small';
  const lado = ladoChico(), n = datos.lista.length;
  const gap = 4, pie = 13, pad = chico ? 8 : 9;
  w.setPadding(pad, pad, pad - 2, pad);
  // El alto de cada ficha sale de lo que queda (chico) o es fijo (mediano y grande).
  const alto = chico ? Math.floor((lado - pad * 2 + 2 - pie - gap * (n - 1)) / n) : fam === 'large' ? 62 : 57;
  const ancho = chico ? lado - pad * 2 : 310;
  datos.lista.forEach((d, i) => {
    if (i > 0) w.addSpacer(gap);
    (chico ? fichaChica : fichaMediana)(w, d, ests[i], alto, ancho);
  });
  w.addSpacer();
  // Hora de la última actualización, centrada y discreta, para saber si las cifras están al día.
  const fila = w.addStack(); fila.centerAlignContent(); fila.size = new Size(0, 11);   // alto fijo: ícono y hora se centran sobre la misma línea
  fila.addSpacer();
  // El ícono va en su propio cuadro del alto de la fila y centrado, igual que el texto: comparten el mismo centro.
  const cuadro = fila.addStack(); cuadro.size = new Size(8, 11); cuadro.centerAlignContent();
  const im = cuadro.addImage(iconoActualizar(datos.viejo ? col('#d6e38f', 0.9) : BLANCO(0.5)));
  im.imageSize = new Size(8, 8); fila.addSpacer(3);
  texto(fila, horaTexto(datos.t) + (datos.viejo ? ' · sin conexión' : '') + (!chico && datos.total > n ? ' · +' + (datos.total - n) + ' más' : ''),
    Font.mediumSystemFont(8), datos.viejo ? col('#d6e38f', 0.9) : BLANCO(0.5));
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
  if ((CUENTA === 'activa' || CUENTA.toLowerCase() === 'todas') && (fam0 === 'small' || fam0 === 'medium' || fam0 === 'large')) {
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
  return abrir(w);
}

const widget = await crear();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
