/**
 * Caudal — API y recordatorios (Google Apps Script, ligado a la hoja de cálculo).
 *
 * Primera vez:
 *   1. Ejecuta la función "instalar" (crea pestañas, clave secreta y recordatorio diario).
 *   2. Implementar → Nueva implementación → Aplicación web
 *        Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario.
 *   3. En la hoja, menú Caudal → "Mostrar enlace para la app".
 *
 * API (todas las llamadas llevan "token"):
 *   GET  ?accion=estado                → todo para la app (cuentas, resúmenes, movimientos, config)
 *   GET  ?accion=resumen               → resumen corto (widget). &formato=texto para texto plano
 *   GET  ?accion=agregar&monto=..&...  → anota un movimiento (para Atajos de iPhone)
 *   GET  ?accion=aviso                 → recordatorios de hoy (texto vacío si no hay)
 *   GET  ?accion=cuentas               → nombres de las cuentas (&formato=texto: uno por renglón)
 *   Todas aceptan &cuenta=<id o nombre> (o "activa": la última elegida en la app). Sin cuenta = la primera.
 *   POST (text/plain, JSON) {token, accion: 'agregar'|'editar'|'borrar'|'config'|'cuenta'|'activa'|'estado', ...}
 */

var HOJA_MOV = 'Movimientos';
var HOJA_CFG = 'Config';
var HOJA_CTA = 'Cuentas';
// "cuenta" va al final: así las columnas de siempre no se mueven.
var COLUMNAS = ['id', 'fecha', 'tipo', 'medio', 'monto', 'descripcion', 'categoria', 'cashback', 'nuevo_periodo', 'origen', 'creado', 'cuenta'];
var COL_CUENTA = 12; // columna L

/* ======================= instalación ======================= */

function instalar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var mov = ss.getSheetByName(HOJA_MOV) || ss.insertSheet(HOJA_MOV);
  if (mov.getLastRow() === 0) {
    mov.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight('bold');
    mov.setFrozenRows(1);
  }
  // fechas como texto para que Sheets no las convierta
  mov.getRange('B:B').setNumberFormat('@');
  mov.getRange('K:K').setNumberFormat('@');
  mov.getRange('E:E').setNumberFormat('#,##0.00');

  var cfg = ss.getSheetByName(HOJA_CFG) || ss.insertSheet(HOJA_CFG);
  if (cfg.getLastRow() === 0) {
    cfg.getRange(1, 1, 1, 3).setValues([['clave', 'valor', 'qué es']]).setFontWeight('bold');
    cfg.setFrozenRows(1);
  }
  // valores como texto: así "5,2,0" o la clave no se convierten en fecha/número
  cfg.getRange('B:B').setNumberFormat('@');
  var actual = leerConfigCruda_();
  var filas = [];
  if (!actual.token) filas.push(['token', Utilities.getUuid().replace(/-/g, '').slice(0, 24), 'Clave secreta de la API. No la compartas fuera de la familia.']);
  CAUDAL_CONFIG.forEach(function (c) {
    if (!(c[0] in actual)) filas.push([c[0], c[1], c[3] + ' — ' + c[4]]);
  });
  if (filas.length) cfg.getRange(cfg.getLastRow() + 1, 1, filas.length, 3).setValues(filas);
  cfg.autoResizeColumns(1, 3);

  asegurarCuentas_();

  // quitar "Hoja 1" vacía si existe
  ['Hoja 1', 'Sheet1'].forEach(function (n) {
    var h = ss.getSheetByName(n);
    if (h && h.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(h);
  });

  // recordatorio diario 8–9 am
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarAvisos') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarAvisos').timeBased().everyDays(1).atHour(8).create();

  Logger.log('Listo. Ahora: Implementar → Nueva implementación → Aplicación web (Ejecutar como: Yo; Acceso: Cualquier usuario).');
  Logger.log('Después usa el menú Caudal → Mostrar enlace para la app.');
}

/**
 * Cuentas (una sola vez, sola): crea la pestaña Cuentas con DiDi (los datos de su tarjeta salen de
 * Config) y Nu (solo débito), y agrega la columna "cuenta" a Movimientos marcando los de antes como
 * DiDi. No borra ni mueve nada: los movimientos de siempre quedan igual, solo ganan su cuenta.
 */
function asegurarCuentas_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(HOJA_CTA)) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (ss.getSheetByName(HOJA_CTA)) return;
    var mov = ss.getSheetByName(HOJA_MOV);
    if (mov) {
      if (mov.getMaxColumns() < COL_CUENTA) mov.insertColumnsAfter(mov.getMaxColumns(), COL_CUENTA - mov.getMaxColumns());
      mov.getRange(1, COL_CUENTA).setValue('cuenta').setFontWeight('bold');
      mov.getRange(1, COL_CUENTA, mov.getMaxRows(), 1).setNumberFormat('@');
      var n = mov.getLastRow() - 1;
      if (n > 0) {
        var ids = mov.getRange(2, 1, n, 1).getValues();
        var cuentas = mov.getRange(2, COL_CUENTA, n, 1).getValues();
        var cambio = false;
        for (var i = 0; i < n; i++) {
          if (String(ids[i][0]) !== '' && String(cuentas[i][0]).trim() === '') { cuentas[i][0] = 'didi'; cambio = true; }
        }
        if (cambio) mov.getRange(2, COL_CUENTA, n, 1).setValues(cuentas);
      }
    }
    var cfg = leerConfigCruda_();
    var tarjeta = function (k) { return cfg[k] === undefined || cfg[k] === null ? '' : cfg[k]; };
    var filas = [
      CAUDAL_CUENTA_CAMPOS,
      ['didi', 'DiDi', 'credito', CD_COLOR_BASE, tarjeta('dia_corte'), tarjeta('dia_limite'), tarjeta('cashback_pct'), tarjeta('categorias_cashback'), tarjeta('cashback_tope')],
      ['nu', 'Nu', 'debito', '#820ad1', '', '', '', '', '']
    ];
    var h = ss.insertSheet(HOJA_CTA);
    h.getRange(1, 1, filas.length, CAUDAL_CUENTA_CAMPOS.length).setNumberFormat('@');
    h.getRange(1, 1, filas.length, CAUDAL_CUENTA_CAMPOS.length).setValues(filas.map(function (f) { return f.map(String); }));
    h.getRange(1, 1, 1, CAUDAL_CUENTA_CAMPOS.length).setFontWeight('bold');
    h.setFrozenRows(1);
    h.getRange(filas.length + 2, 1).setValue('tipo: credito (tarjeta + débito, como DiDi) o debito (solo débito, como Nu). color: color de marca (#RRGGBB). Lo de la tarjeta solo aplica a crédito.');
  } finally {
    lock.releaseLock();
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Caudal')
    .addItem('Mostrar enlace para la app', 'mostrarEnlace')
    .addItem('Probar correo de recordatorio', 'probarCorreo')
    .addSeparator()
    .addItem('Instalar / reparar', 'instalar')
    .addToUi();
}

function mostrarEnlace() {
  var cfg = leerConfigCruda_();
  var api = ScriptApp.getService().getUrl();
  var app = String(cfg.url_app || 'https://TU-SITIO.netlify.app').replace(/\/+$/, '');
  var enlace = app + '/#api=' + encodeURIComponent(api) + '&clave=' + encodeURIComponent(cfg.token);
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px sans-serif">' +
    '<p><b>Enlace para abrir la app</b> (ábrelo una vez en cada iPhone; queda guardado):</p>' +
    '<textarea style="width:100%;height:90px">' + enlace + '</textarea>' +
    '<p><b>Dirección de la API</b> (para Atajos y el widget):</p>' +
    '<textarea style="width:100%;height:60px">' + api + '</textarea>' +
    '<p><b>Clave</b>: <code>' + cfg.token + '</code></p>' +
    (cfg.url_app ? '' : '<p style="color:#b00">Falta poner <b>url_app</b> en la pestaña Config.</p>') +
    '</div>').setWidth(520).setHeight(360);
  SpreadsheetApp.getUi().showModalDialog(html, 'Caudal');
}

/* ======================= web app ======================= */

function doGet(e) {
  return responder_(function () {
    var p = (e && e.parameter) || {};
    verificarToken_(p.token);
    asegurarCuentas_();
    var accion = p.accion || 'estado';
    if (accion === 'estado') return estadoCompleto_();
    if (accion === 'cuentas') {
      var cs = leerCuentas_();
      if (p.formato === 'texto') return texto_(cs.map(function (c) { return c.nombre; }).join('\n'));
      return { ok: true, cuentas: cs.map(function (c) { return { id: c.id, nombre: c.nombre, tipo: c.tipo, color: c.color }; }), activa: cuentaPedida_('activa', cs).id };
    }
    if (accion === 'resumen') {
      var calc = calcularCuenta_(p.cuenta), r = calc.resumen, varias = calc.cuentas.length > 1;
      if (p.formato === 'texto') return texto_(cdResumenTexto(r, varias));
      return { ok: true, resumen: resumenCorto_(r, calc), texto: cdResumenTexto(r, varias), cuenta: calc.cuenta, paleta: cdPaletaCuenta(calc.cuenta.color), cuentas: calc.cuentas.length };
    }
    if (accion === 'aviso') {
      var av = avisosDeHoy_();
      if (p.formato === 'texto') return texto_(av.join('\n'));
      return { ok: true, aviso: av.join('\n'), avisos: av };
    }
    if (accion === 'agregar') {
      var res = agregar_({
        tipo: p.tipo, medio: p.medio, monto: p.monto, descripcion: p.descripcion || p.comercio,
        categoria: p.categoria, fecha: p.fecha, origen: p.origen || 'atajo', nuevo_periodo: p.nuevo_periodo, cuenta: p.cuenta
      });
      if (p.formato === 'texto') return texto_(res.mensaje);
      return res;
    }
    throw new Error('Acción desconocida: ' + accion);
  });
}

function doPost(e) {
  return responder_(function () {
    var body = {};
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { throw new Error('JSON inválido'); }
    verificarToken_(body.token);
    asegurarCuentas_();
    switch (body.accion) {
      case 'estado': return estadoCompleto_();
      case 'agregar':
        var res = agregar_(body.mov || {});
        var est = estadoCompleto_();
        est.mensaje = res.mensaje; est.mov = res.mov; est.duplicado = !!res.duplicado;
        return est;
      case 'editar': return editar_(body.id, body.mov || {});
      case 'borrar': return borrar_(body.id);
      case 'config': return guardarConfig_(body.valores || {}, body.cuenta, body.valores_cuenta);
      case 'cuenta': return guardarCuenta_(body.datos || {});
      case 'activa': return marcarActiva_(body.cuenta);
      default: throw new Error('Acción desconocida: ' + body.accion);
    }
  });
}

function responder_(fn) {
  var out;
  try { out = fn(); } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  if (out && out.__texto !== undefined) return ContentService.createTextOutput(out.__texto).setMimeType(ContentService.MimeType.TEXT);
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function texto_(s) { return { __texto: s }; }

function verificarToken_(t) {
  var token = String(leerConfigCruda_().token || '');
  if (!token || String(t || '') !== token) throw new Error('Clave incorrecta');
}

/* ======================= datos ======================= */

function hoy_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function ahora_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss"); }

function textoFecha_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}

function leerConfigCruda_() {
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CFG);
  var cfg = {};
  if (!h || h.getLastRow() < 2) return cfg;
  h.getRange(2, 1, h.getLastRow() - 1, 2).getValues().forEach(function (f) {
    if (f[0] !== '') cfg[String(f[0]).trim()] = f[1];
  });
  return cfg;
}

function leerMovimientos_() {
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOV);
  if (!h || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, COLUMNAS.length).getValues().map(function (f) {
    var m = {};
    COLUMNAS.forEach(function (c, i) { m[c] = f[i]; });
    m.id = String(m.id);
    m.fecha = textoFecha_(m.fecha);
    m.creado = m.creado instanceof Date ? Utilities.formatDate(m.creado, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss") : String(m.creado || '');
    m.monto = Number(m.monto);
    m.nuevo_periodo = m.nuevo_periodo === true || m.nuevo_periodo === 'si' || m.nuevo_periodo === 'TRUE';
    m.cuenta = String(m.cuenta || '').trim();
    return m;
  }).filter(function (m) { return m.id; });
}

function leerCuentas_() {
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CTA);
  if (!h || h.getLastRow() < 2) return cdCuentasNormalizar([]);
  var enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); });
  var filas = h.getRange(2, 1, h.getLastRow() - 1, enc.length).getValues().map(function (f) {
    var c = {};
    enc.forEach(function (k, i) { if (k) c[k] = f[i]; });
    return c;
  }).filter(function (c) { return c.id !== '' && c.id != null && String(c.id).indexOf(' ') < 0; });
  return cdCuentasNormalizar(filas);
}

/** La cuenta que se pidió (id, nombre o "activa"); si no, la primera. */
function cuentaPedida_(q, cuentas) {
  if (String(q || '').trim().toLowerCase() === 'activa') q = leerConfigCruda_().cuenta_activa;
  return cdBuscarCuenta(cuentas, q) || cuentas[0];
}

/** Calcula una cuenta: {cuenta, cuentas, resumen, config, movimientos}. */
function calcularCuenta_(q) {
  var cuentas = leerCuentas_(), c = cuentaPedida_(q, cuentas);
  var todas = cdCalcularCuentas(leerMovimientos_(), leerConfigCruda_(), cuentas, hoy_());
  var x = todas.filter(function (t) { return t.id === c.id; })[0];
  return { cuenta: { id: c.id, nombre: c.nombre, tipo: c.tipo, color: c.color }, cuentas: cuentas, resumen: x.resumen, config: x.config, movimientos: x.movimientos };
}

function calcular_() { return calcularCuenta_().resumen; }

function estadoCompleto_() {
  var movs = leerMovimientos_();
  var cfgCruda = leerConfigCruda_();
  var cuentas = leerCuentas_();
  var todas = cdCalcularCuentas(movs, cfgCruda, cuentas, hoy_());
  var recientes = [];
  var salida = todas.map(function (t) {
    cdOrdenar(t.movimientos).reverse().slice(0, 300).forEach(function (m) { m.cuenta = t.id; recientes.push(m); });
    return { id: t.id, nombre: t.nombre, tipo: t.tipo, color: t.color, resumen: t.resumen, config: t.config };
  });
  recientes = cdOrdenar(recientes).reverse();
  // resumen y config de arriba = la primera cuenta (lo que leían las versiones anteriores de la app).
  return {
    ok: true, resumen: todas[0].resumen, config: todas[0].config, movimientos: recientes, campos: CAUDAL_CONFIG,
    cuentas: salida, cuenta_activa: String(cfgCruda.cuenta_activa || '')
  };
}

function resumenCorto_(r, calc) {
  var out = {
    libre: r.libre, estado_libre: r.estado_libre, saldo_debito: r.saldo_debito, deuda_tarjeta: r.deuda_tarjeta,
    por_pagar: r.tarjeta.por_pagar, fecha_limite: r.tarjeta.fecha_limite, dias_para_pagar: r.tarjeta.dias_para_pagar,
    cashback_estimado: r.cashback.estimado, por_dia: r.periodo && r.periodo.por_dia, avisos: r.avisos,
    tipo: r.tipo, cuenta: r.cuenta
  };
  if (calc) {
    // Este mes (para la cuenta de solo débito en el widget).
    var inicio = r.hoy.slice(0, 8) + '01', gastado = 0, entro = 0;
    calc.movimientos.forEach(function (m) {
      if (m.fecha < inicio || m.fecha > r.hoy) return;
      if (m.tipo === 'compra') gastado += Number(m.monto) || 0;
      else if (m.tipo === 'deposito') entro += Number(m.monto) || 0;
    });
    out.gastado_mes = cdRedondear(gastado);
    out.recibido_mes = cdRedondear(entro);
  }
  return out;
}

/** Limpia y valida un movimiento que llega de la app o de un atajo. */
function limpiarMov_(m, cfg) {
  var tipo = CAUDAL_TIPOS.indexOf(m.tipo) >= 0 ? m.tipo : 'compra';
  var monto = cdLeerMonto(m.monto);
  if (!(monto > 0) && !(tipo === 'ajuste' && monto !== 0 && !isNaN(monto))) throw new Error('Falta el monto');
  if (tipo === 'ajuste' && String(m.monto).trim().charAt(0) === '-') monto = -monto;
  var medio = m.medio === 'debito' ? 'debito' : 'credito';
  if (tipo === 'deposito' || tipo === 'pago_tarjeta' || cfg.cuenta_tipo === 'debito') medio = 'debito';
  var categoria = String(m.categoria || '').trim();
  if (tipo === 'compra' && !categoria) categoria = cfg.categoria_default || 'Otro';
  var fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(m.fecha || '')) ? String(m.fecha) : hoy_();
  var limpio = {
    tipo: tipo, medio: medio, monto: cdRedondear(monto), fecha: fecha,
    descripcion: String(m.descripcion || '').trim().slice(0, 120),
    categoria: tipo === 'compra' ? categoria : '',
    nuevo_periodo: tipo === 'deposito' && (m.nuevo_periodo === true || m.nuevo_periodo === 'si' || m.nuevo_periodo === 'true' || m.nuevo_periodo === '1'),
    origen: String(m.origen || 'app').slice(0, 20),
    cuenta: cfg.cuenta_id || ''
  };
  limpio.cashback = cdTieneCashback(limpio, cfg) ? 'si' : 'no';
  if (m.cashback === 'si' || m.cashback === 'no') limpio.cashback = (limpio.tipo === 'compra' && limpio.medio === 'credito') ? m.cashback : 'no';
  return limpio;
}

function filaDe_(m) {
  return COLUMNAS.map(function (c) {
    if (c === 'nuevo_periodo') return m.nuevo_periodo ? 'si' : '';
    return m[c] === undefined ? '' : m[c];
  });
}

function agregar_(entrada) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var cuentas = leerCuentas_();
    var cuenta = cuentaPedida_(entrada.cuenta, cuentas);
    var cfg = cdNormalizarConfig(cdConfigDeCuenta(leerConfigCruda_(), cuenta, cuenta.id === cuentas[0].id));
    cfg.cuenta_tipo = cuenta.tipo; cfg.cuenta_id = cuenta.id;
    var m = limpiarMov_(entrada, cfg);
    var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOV);
    var varias = cuentas.length > 1;

    // Evitar duplicados: el iPhone a veces dispara la automatización dos veces.
    if (m.origen === 'wallet') {
      var hace2min = Utilities.formatDate(new Date(Date.now() - 120000), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
      var dup = leerMovimientos_().filter(function (x) {
        return x.origen === 'wallet' && x.creado >= hace2min && cdRedondear(x.monto) === m.monto && x.descripcion === m.descripcion && cdCuentaDeMov(x, cuentas) === cuenta.id;
      })[0];
      if (dup) {
        var r0 = calcularCuenta_(cuenta.id).resumen;
        return { ok: true, duplicado: true, mov: dup, libre: r0.libre, mensaje: cdMensajeAnotado(dup, r0, varias) };
      }
    }

    m.id = Utilities.getUuid().slice(0, 8);
    m.creado = ahora_();
    h.appendRow(filaDe_(m));
    SpreadsheetApp.flush();
    var calc = calcularCuenta_(cuenta.id), r = calc.resumen;
    return { ok: true, mov: m, libre: r.libre, resumen: resumenCorto_(r, calc), mensaje: cdMensajeAnotado(m, r, varias) };
  } finally {
    lock.releaseLock();
  }
}

function filaDeId_(id) {
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOV);
  if (h.getLastRow() < 2) return -1;
  var ids = h.getRange(2, 1, h.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function editar_(id, entrada) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var fila = filaDeId_(id);
    if (fila < 0) throw new Error('No encontré ese movimiento');
    var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOV);
    var antes = {};
    var vals = h.getRange(fila, 1, 1, COLUMNAS.length).getValues()[0];
    COLUMNAS.forEach(function (c, i) { antes[c] = vals[i]; });
    var mezcla = {};
    Object.keys(antes).forEach(function (k) { mezcla[k] = antes[k]; });
    Object.keys(entrada).forEach(function (k) { mezcla[k] = entrada[k]; });
    mezcla.fecha = textoFecha_(mezcla.fecha);
    var cuentas = leerCuentas_();
    var cuenta = cdBuscarCuenta(cuentas, mezcla.cuenta) || cuentas[0];
    var cfgE = cdNormalizarConfig(cdConfigDeCuenta(leerConfigCruda_(), cuenta, cuenta.id === cuentas[0].id));
    cfgE.cuenta_tipo = cuenta.tipo; cfgE.cuenta_id = cuenta.id;
    var m = limpiarMov_(mezcla, cfgE);
    m.id = String(antes.id);
    m.creado = antes.creado instanceof Date ? Utilities.formatDate(antes.creado, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss") : String(antes.creado);
    m.origen = String(antes.origen || m.origen);
    h.getRange(fila, 1, 1, COLUMNAS.length).setValues([filaDe_(m)]);
    return estadoCompleto_();
  } finally {
    lock.releaseLock();
  }
}

function borrar_(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var fila = filaDeId_(id);
    if (fila < 0) throw new Error('No encontré ese movimiento');
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOV).deleteRow(fila);
    return estadoCompleto_();
  } finally {
    lock.releaseLock();
  }
}

function escribirConfig_(valores, permitidas) {
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CFG);
  var datos = h.getRange(2, 1, Math.max(1, h.getLastRow() - 1), 2).getValues();
  Object.keys(valores).forEach(function (k) {
    if (permitidas.indexOf(k) < 0) return; // nunca se cambia el token desde la app
    var v = valores[k];
    var encontrado = false;
    for (var i = 0; i < datos.length; i++) {
      if (String(datos[i][0]).trim() === k) { h.getRange(i + 2, 2).setValue(v); encontrado = true; break; }
    }
    if (!encontrado) { h.appendRow([k, v, '']); datos.push([k, v]); }
  });
}

/**
 * Guarda Ajustes. valores = lo general (Config). Con cuenta y valores_cuenta también guarda lo de
 * esa cuenta (nombre, tipo, color y su tarjeta) en su fila de Cuentas. Lo de la tarjeta de la primera
 * cuenta se copia también a Config, para que la hoja siga diciendo lo mismo en los dos lugares.
 */
function guardarConfig_(valores, cuentaId, valoresCuenta) {
  var permitidas = CAUDAL_CONFIG.map(function (c) { return c[0]; });
  var generales = {};
  Object.keys(valores || {}).forEach(function (k) { if (CAUDAL_CAMPOS_TARJETA.indexOf(k) < 0) generales[k] = valores[k]; });
  escribirConfig_(generales, permitidas);
  var cuentas = leerCuentas_();
  if (!cuentaId) {
    // Versión anterior de la app (sin cuentas): lo de la tarjeta es de la primera cuenta.
    cuentaId = cuentas[0].id;
    valoresCuenta = {};
    CAUDAL_CAMPOS_TARJETA.forEach(function (k) { if (k in (valores || {})) valoresCuenta[k] = valores[k]; });
  }
  if (cuentaId && valoresCuenta) {
    if (cuentas[0] && cuentas[0].id === String(cuentaId)) {
      var tarjeta = {};
      CAUDAL_CAMPOS_TARJETA.forEach(function (k) { if (k in valoresCuenta) tarjeta[k] = valoresCuenta[k]; });
      escribirConfig_(tarjeta, permitidas);
    }
    var d = {};
    Object.keys(valoresCuenta).forEach(function (k) { d[k] = valoresCuenta[k]; });
    d.id = cuentaId;
    escribirCuenta_(d);
  }
  return estadoCompleto_();
}

/** Crea o cambia una cuenta (fila de Cuentas). Sin id, crea una nueva. */
function escribirCuenta_(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(HOJA_CTA);
  var enc = h.getRange(1, 1, 1, Math.max(h.getLastColumn(), CAUDAL_CUENTA_CAMPOS.length)).getValues()[0].map(function (x) { return String(x).trim(); });
  CAUDAL_CUENTA_CAMPOS.forEach(function (k) {
    if (enc.indexOf(k) < 0) { var col = enc.indexOf('') >= 0 ? enc.indexOf('') : enc.length; enc[col] = k; h.getRange(1, col + 1).setValue(k).setFontWeight('bold'); }
  });
  var limpio = {};
  if ('nombre' in d) limpio.nombre = String(d.nombre || '').trim().slice(0, 30);
  if ('tipo' in d) limpio.tipo = d.tipo === 'debito' ? 'debito' : 'credito';
  if ('color' in d) { var c = cdColorValido(d.color); if (c) limpio.color = c; }
  CAUDAL_CAMPOS_TARJETA.forEach(function (k) { if (k in d) limpio[k] = d[k] === null || d[k] === undefined ? '' : String(d[k]); });
  if ('nombre' in limpio && !limpio.nombre) throw new Error('La cuenta necesita un nombre');

  var fila = -1, id = String(d.id || '').trim();
  if (id && h.getLastRow() >= 2) {
    var ids = h.getRange(2, enc.indexOf('id') + 1, h.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === id) { fila = i + 2; break; }
  }
  if (fila < 0) {
    if (!limpio.nombre) throw new Error('La cuenta necesita un nombre');
    if (!id || cdBuscarCuenta(leerCuentas_(), id)) id = 'c' + Utilities.getUuid().slice(0, 6);
    // Se escribe justo después de la última cuenta (la nota de abajo, si existe, se recorre).
    var cuentas = leerCuentas_();
    fila = cuentas.length + 2;
    if (h.getLastRow() >= fila) h.insertRowBefore(fila);
    limpio.id = id;
    if (!limpio.tipo) limpio.tipo = 'debito';
    if (!limpio.color) limpio.color = CD_COLOR_BASE;
  }
  h.getRange(fila, 1, 1, enc.length).setNumberFormat('@');
  Object.keys(limpio).forEach(function (k) {
    var col = enc.indexOf(k);
    if (col >= 0) h.getRange(fila, col + 1).setValue(limpio[k]);
  });
  return id;
}

function guardarCuenta_(d) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var id = escribirCuenta_(d);
    var est = estadoCompleto_();
    est.cuenta_nueva = id;
    return est;
  } finally {
    lock.releaseLock();
  }
}

/** Recuerda la última cuenta elegida en la app (la usa el widget con cuenta=activa). */
function marcarActiva_(id) {
  var c = cdBuscarCuenta(leerCuentas_(), id);
  if (!c) throw new Error('No encontré esa cuenta');
  escribirConfig_({ cuenta_activa: c.id }, ['cuenta_activa']);
  return { ok: true, cuenta_activa: c.id };
}

/* ======================= recordatorios ======================= */

/**
 * Recordatorios de hoy de las cuentas de crédito (las de solo débito no tienen corte ni pago).
 * Con una sola tarjeta el texto es el mismo de siempre; con varias, cada aviso dice de cuál es.
 * Devuelve textos; con conResumen, [{texto}] y el resumen de cada cuenta para el correo.
 */
function avisosDeHoy_(conResumen) {
  var cfgCruda = leerConfigCruda_(), cuentas = leerCuentas_();
  var todas = cdCalcularCuentas(leerMovimientos_(), cfgCruda, cuentas, hoy_()).filter(function (t) { return t.tipo === 'credito'; });
  var varias = todas.length > 1, out = [], resumenes = [];
  todas.forEach(function (t) {
    var i = cuentas.map(function (c) { return c.id; }).indexOf(t.id);
    var av = cdAvisosDelDia(t.resumen, cdConfigDeCuenta(cfgCruda, cuentas[i], i === 0));
    av.forEach(function (a) { out.push(varias ? t.nombre + ': ' + a : a); });
    resumenes.push(t);
  });
  return conResumen ? { avisos: out, cuentas: resumenes, varias: varias } : out;
}

function revisarAvisos() {
  var cfgCruda = leerConfigCruda_();
  var cfg = cdNormalizarConfig(cfgCruda);
  var correos = cdLista(cfg.avisos_correo);
  if (!correos.length) return;
  var x = avisosDeHoy_(true);
  if (!x.avisos.length) return;
  enviarCorreo_(correos, x, x.avisos, cfg);
}

function probarCorreo() {
  var cfgCruda = leerConfigCruda_();
  var cfg = cdNormalizarConfig(cfgCruda);
  var correos = cdLista(cfg.avisos_correo);
  if (!correos.length) { SpreadsheetApp.getUi().alert('Primero escribe uno o más correos en Config → avisos_correo.'); return; }
  var x = avisosDeHoy_(true);
  var avisos = x.avisos.length ? x.avisos : ['(Prueba) Hoy no hay recordatorios pendientes.'];
  enviarCorreo_(correos, x, avisos, cfg);
  SpreadsheetApp.getUi().alert('Correo enviado a: ' + correos.join(', '));
}

function enviarCorreo_(correos, x, avisos, cfg) {
  var cifras = x.cuentas.map(function (t) {
    var r = t.resumen;
    return (x.varias ? '\n\n' + t.nombre + ':' : '\n') +
      '\nLibre ahora: ' + cdPesos(r.libre) +
      '\nEn ' + t.nombre + ' débito deberías tener: ' + cdPesos(r.saldo_debito) +
      '\nDeuda total de la tarjeta: ' + cdPesos(r.deuda_tarjeta);
  }).join('');
  var cuerpo = avisos.map(function (a) { return '• ' + a; }).join('\n') + cifras +
    (cfg.url_app ? '\n\nAbrir Caudal: ' + cfg.url_app : '');
  var asunto = 'Caudal: ' + avisos[0].slice(0, 80);
  MailApp.sendEmail(correos.join(','), asunto, cuerpo);
}
