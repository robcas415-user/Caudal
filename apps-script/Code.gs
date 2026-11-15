/**
 * Caudal — API y recordatorios (Google Apps Script, ligado a la hoja de cálculo).
 *
 * Primera vez:
 *   1. Ejecuta la función `instalar` (crea pestañas, clave secreta y recordatorio diario).
 *   2. Implementar → Nueva implementación → Aplicación web
 *        Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario.
 *   3. En la hoja, menú Caudal → "Mostrar enlace para la app".
 *
 * API (todas las llamadas llevan `token`):
 *   GET  ?accion=estado                → todo para la app (resumen, movimientos, config)
 *   GET  ?accion=resumen               → resumen corto (widget). &formato=texto para texto plano
 *   GET  ?accion=agregar&monto=..&...  → anota un movimiento (para Atajos de iPhone)
 *   GET  ?accion=aviso                 → recordatorios de hoy (texto vacío si no hay)
 *   POST (text/plain, JSON) {token, accion: 'agregar'|'editar'|'borrar'|'config'|'estado', ...}
 */

var HOJA_MOV = 'Movimientos';
var HOJA_CFG = 'Config';
var COLUMNAS = ['id', 'fecha', 'tipo', 'medio', 'monto', 'descripcion', 'categoria', 'cashback', 'nuevo_periodo', 'origen', 'creado'];

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
  var actual = leerConfigCruda_();
  var filas = [];
  if (!actual.token) filas.push(['token', Utilities.getUuid().replace(/-/g, '').slice(0, 24), 'Clave secreta de la API. No la compartas fuera de la familia.']);
  CAUDAL_CONFIG.forEach(function (c) {
    if (!(c[0] in actual)) filas.push([c[0], c[1], c[3] + ' — ' + c[4]]);
  });
  if (filas.length) cfg.getRange(cfg.getLastRow() + 1, 1, filas.length, 3).setValues(filas);
  cfg.autoResizeColumns(1, 3);

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
    var accion = p.accion || 'estado';
    if (accion === 'estado') return estadoCompleto_();
    if (accion === 'resumen') {
      var r = calcular_();
      if (p.formato === 'texto') return texto_(cdResumenTexto(r));
      return { ok: true, resumen: resumenCorto_(r), texto: cdResumenTexto(r) };
    }
    if (accion === 'aviso') {
      var av = cdAvisosDelDia(calcular_(), leerConfigCruda_());
      if (p.formato === 'texto') return texto_(av.join('\n'));
      return { ok: true, aviso: av.join('\n'), avisos: av };
    }
    if (accion === 'agregar') {
      var res = agregar_({
        tipo: p.tipo, medio: p.medio, monto: p.monto, descripcion: p.descripcion || p.comercio,
        categoria: p.categoria, fecha: p.fecha, origen: p.origen || 'atajo', nuevo_periodo: p.nuevo_periodo
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
    switch (body.accion) {
      case 'estado': return estadoCompleto_();
      case 'agregar':
        var res = agregar_(body.mov || {});
        var est = estadoCompleto_();
        est.mensaje = res.mensaje; est.mov = res.mov; est.duplicado = !!res.duplicado;
        return est;
      case 'editar': return editar_(body.id, body.mov || {});
      case 'borrar': return borrar_(body.id);
      case 'config': return guardarConfig_(body.valores || {});
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
    return m;
  }).filter(function (m) { return m.id; });
}

function calcular_() { return calcularCaudal(leerMovimientos_(), leerConfigCruda_(), hoy_()); }

function configPublica_() {
  var cfg = cdNormalizarConfig(leerConfigCruda_());
  return cfg; // cdNormalizarConfig solo copia las claves conocidas (sin token)
}

function estadoCompleto_() {
  var movs = leerMovimientos_();
  var cfgCruda = leerConfigCruda_();
  var r = calcularCaudal(movs, cfgCruda, hoy_());
  var recientes = cdOrdenar(movs).reverse().slice(0, 300);
  return { ok: true, resumen: r, movimientos: recientes, config: cdNormalizarConfig(cfgCruda), campos: CAUDAL_CONFIG };
}

function resumenCorto_(r) {
  return {
    libre: r.libre, estado_libre: r.estado_libre, saldo_debito: r.saldo_debito, deuda_tarjeta: r.deuda_tarjeta,
    por_pagar: r.tarjeta.por_pagar, fecha_limite: r.tarjeta.fecha_limite, dias_para_pagar: r.tarjeta.dias_para_pagar,
    cashback_estimado: r.cashback.estimado, por_dia: r.periodo && r.periodo.por_dia, avisos: r.avisos
  };
}

/** Limpia y valida un movimiento que llega de la app o de un atajo. */
function limpiarMov_(m, cfg) {
  var tipo = CAUDAL_TIPOS.indexOf(m.tipo) >= 0 ? m.tipo : 'compra';
  var monto = cdLeerMonto(m.monto);
  if (!(monto > 0) && !(tipo === 'ajuste' && monto !== 0 && !isNaN(monto))) throw new Error('Falta el monto');
  if (tipo === 'ajuste' && String(m.monto).trim().charAt(0) === '-') monto = -monto;
  var medio = m.medio === 'debito' ? 'debito' : 'credito';
  if (tipo === 'deposito' || tipo === 'pago_tarjeta') medio = 'debito';
  var categoria = String(m.categoria || '').trim();
  if (tipo === 'compra' && !categoria) categoria = cfg.categoria_default || 'Otro';
  var fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(m.fecha || '')) ? String(m.fecha) : hoy_();
  var limpio = {
    tipo: tipo, medio: medio, monto: cdRedondear(monto), fecha: fecha,
    descripcion: String(m.descripcion || '').trim().slice(0, 120),
    categoria: tipo === 'compra' ? categoria : '',
    nuevo_periodo: tipo === 'deposito' && (m.nuevo_periodo === true || m.nuevo_periodo === 'si' || m.nuevo_periodo === 'true' || m.nuevo_periodo === '1'),
    origen: String(m.origen || 'app').slice(0, 20)
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
    var cfg = cdNormalizarConfig(leerConfigCruda_());
    var m = limpiarMov_(entrada, cfg);
    var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_MOV);

    // Evitar duplicados: el iPhone a veces dispara la automatización dos veces.
    if (m.origen === 'wallet') {
      var hace2min = Utilities.formatDate(new Date(Date.now() - 120000), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
      var dup = leerMovimientos_().filter(function (x) {
        return x.origen === 'wallet' && x.creado >= hace2min && cdRedondear(x.monto) === m.monto && x.descripcion === m.descripcion;
      })[0];
      if (dup) {
        var r0 = calcular_();
        return { ok: true, duplicado: true, mov: dup, libre: r0.libre, mensaje: cdMensajeAnotado(dup, r0) };
      }
    }

    m.id = Utilities.getUuid().slice(0, 8);
    m.creado = ahora_();
    h.appendRow(filaDe_(m));
    SpreadsheetApp.flush();
    var r = calcular_();
    return { ok: true, mov: m, libre: r.libre, resumen: resumenCorto_(r), mensaje: cdMensajeAnotado(m, r) };
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
    var m = limpiarMov_(mezcla, cdNormalizarConfig(leerConfigCruda_()));
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

function guardarConfig_(valores) {
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CFG);
  var datos = h.getRange(2, 1, Math.max(1, h.getLastRow() - 1), 2).getValues();
  var permitidas = CAUDAL_CONFIG.map(function (c) { return c[0]; });
  Object.keys(valores).forEach(function (k) {
    if (permitidas.indexOf(k) < 0) return; // nunca se cambia el token desde la app
    var v = valores[k];
    var encontrado = false;
    for (var i = 0; i < datos.length; i++) {
      if (String(datos[i][0]).trim() === k) { h.getRange(i + 2, 2).setValue(v); encontrado = true; break; }
    }
    if (!encontrado) h.appendRow([k, v, '']);
  });
  return estadoCompleto_();
}

/* ======================= recordatorios ======================= */

function revisarAvisos() {
  var cfgCruda = leerConfigCruda_();
  var cfg = cdNormalizarConfig(cfgCruda);
  var correos = cdLista(cfg.avisos_correo);
  if (!correos.length) return;
  var r = calcular_();
  var avisos = cdAvisosDelDia(r, cfgCruda);
  if (!avisos.length) return;
  enviarCorreo_(correos, r, avisos, cfg);
}

function probarCorreo() {
  var cfgCruda = leerConfigCruda_();
  var cfg = cdNormalizarConfig(cfgCruda);
  var correos = cdLista(cfg.avisos_correo);
  if (!correos.length) { SpreadsheetApp.getUi().alert('Primero escribe uno o más correos en Config → avisos_correo.'); return; }
  var r = calcular_();
  var avisos = cdAvisosDelDia(r, cfgCruda);
  if (!avisos.length) avisos = ['(Prueba) Hoy no hay recordatorios pendientes.'];
  enviarCorreo_(correos, r, avisos, cfg);
  SpreadsheetApp.getUi().alert('Correo enviado a: ' + correos.join(', '));
}

function enviarCorreo_(correos, r, avisos, cfg) {
  var cuerpo = avisos.map(function (a) { return '• ' + a; }).join('\n') +
    '\n\nLibre ahora: ' + cdPesos(r.libre) +
    '\nEn DiDi débito deberías tener: ' + cdPesos(r.saldo_debito) +
    '\nDeuda total de la tarjeta: ' + cdPesos(r.deuda_tarjeta) +
    (cfg.url_app ? '\n\nAbrir Caudal: ' + cfg.url_app : '');
  var asunto = 'Caudal: ' + avisos[0].slice(0, 80);
  MailApp.sendEmail(correos.join(','), asunto, cuerpo);
}
