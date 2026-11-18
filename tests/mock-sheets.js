/* Simulador mínimo de Google Sheets / Apps Script para probar Code.gs en Node (sin internet). */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function crearHoja(nombre, filas) {
  const h = { nombre, d: (filas || []).map(f => f.slice()), maxCols: 26, maxRows: 1000 };
  const ancho = () => Math.max(0, ...h.d.map(f => f.length));
  const celda = (r, c) => (h.d[r - 1] && h.d[r - 1][c - 1] !== undefined ? h.d[r - 1][c - 1] : '');
  const poner = (r, c, v) => {
    if (c > h.maxCols) throw new Error('Columna fuera de la hoja: ' + c);
    while (h.d.length < r) h.d.push([]);
    const f = h.d[r - 1]; while (f.length < c) f.push('');
    f[c - 1] = v;
  };
  const rango = (r, c, nr, nc) => {
    if (c + (nc || 1) - 1 > h.maxCols) throw new Error('Rango fuera de la hoja');
    const R = {
      getValues: () => { const out = []; for (let i = 0; i < (nr || 1); i++) { const f = []; for (let j = 0; j < (nc || 1); j++) f.push(celda(r + i, c + j)); out.push(f); } return out; },
      setValues: (v) => { v.forEach((f, i) => f.forEach((x, j) => poner(r + i, c + j, x))); return R; },
      setValue: (x) => { poner(r, c, x); return R; },
      setNumberFormat: () => R, setFontWeight: () => R
    };
    return R;
  };
  Object.assign(h, {
    getName: () => nombre,
    getLastRow: () => { for (let i = h.d.length; i > 0; i--) if (h.d[i - 1].some(x => x !== '' && x != null)) return i; return 0; },
    getLastColumn: () => { let m = 0; h.d.forEach(f => { for (let j = f.length; j > 0; j--) if (f[j - 1] !== '' && f[j - 1] != null) { m = Math.max(m, j); break; } }); return m; },
    getMaxRows: () => h.maxRows, getMaxColumns: () => h.maxCols,
    insertColumnsAfter: (c, n) => { h.maxCols += n; },
    getRange: (a, b, c, d) => typeof a === 'string' ? rango(1, 1, 1, 1) : rango(a, b, c, d),
    setFrozenRows: () => {}, autoResizeColumns: () => {},
    appendRow: (f) => { const r = h.getLastRow() + 1; f.forEach((x, j) => poner(r, j + 1, x)); },
    deleteRow: (r) => { h.d.splice(r - 1, 1); },
    insertRowBefore: (r) => { h.d.splice(r - 1, 0, []); }
  });
  void ancho;
  return h;
}

function crearLibro(hojas) {
  const ss = {
    hojas,
    getSheetByName: (n) => hojas.find(h => h.nombre === n) || null,
    insertSheet: (n) => { const h = crearHoja(n, []); hojas.push(h); return h; },
    getSheets: () => hojas,
    deleteSheet: (h) => { hojas.splice(hojas.indexOf(h), 1); }
  };
  return ss;
}

/** Carga Code.gs + Calculos.gs (de una carpeta o de textos) con el libro dado. Devuelve el contexto. */
function cargar(libro, archivos, hoy) {
  const pad = (n) => String(n).padStart(2, '0');
  let uuid = 0;
  const ctx = {
    console, JSON, Math, Date, Number, String, Object, Array, isNaN, parseInt, parseFloat, Error, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => libro, flush: () => {}, getUi: () => ({ alert() {}, createMenu() { return this; }, addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) },
    Utilities: {
      formatDate: (d, tz, f) => {
        if (f === 'yyyy-MM-dd') return hoy;
        return hoy + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      },
      getUuid: () => { uuid++; return ('0000000' + uuid).slice(-8) + '-aaaa-bbbb-cccc-dddddddddddd'; }
    },
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: (t) => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 'json', TEXT: 'text' } },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased() { return this; }, everyDays() { return this; }, atHour() { return this; }, create() {} }), getService: () => ({ getUrl: () => 'https://x/exec' }) },
    MailApp: { enviados: [], sendEmail(a, s, c) { this.enviados.push({ a, s, c }); } },
    Logger: { log() {} },
    HtmlService: { createHtmlOutput: () => ({ setWidth() { return this; }, setHeight() { return this; } }) }
  };
  vm.createContext(ctx);
  archivos.forEach(t => vm.runInContext(t, ctx));
  ctx.get = (p) => { const o = ctx.doGet({ parameter: Object.assign({ token: 'tok' }, p) }); try { return JSON.parse(o.t); } catch (e) { return o.t; } };
  ctx.post = (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ token: 'tok' }, b)) } }).t);
  return ctx;
}

function leer(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

module.exports = { crearHoja, crearLibro, cargar, leer };
