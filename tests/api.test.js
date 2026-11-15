// Prueba de Code.gs con un Google Sheets simulado en memoria.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function crearEntorno() {
  const hojas = {};
  class Hoja {
    constructor(n) { this.n = n; this.d = []; }
    getLastRow() { return this.d.length; }
    getRange(a, b, c, d) {
      if (typeof a === 'string') return { setNumberFormat() { return this; } };
      const self = this, fila = a - 1, col = b - 1, nf = c || 1, nc = d || 1;
      return {
        setValues(v) { v.forEach((r, i) => { self.d[fila + i] = self.d[fila + i] || []; r.forEach((x, j) => { self.d[fila + i][col + j] = x; }); }); return this; },
        setValue(x) { self.d[fila][col] = x; return this; },
        getValues() { return Array.from({ length: nf }, (_, i) => Array.from({ length: nc }, (_, j) => (self.d[fila + i] || [])[col + j] ?? '')); },
        setFontWeight() { return this; }
      };
    }
    appendRow(r) { this.d.push(r.slice()); }
    deleteRow(i) { this.d.splice(i - 1, 1); }
    setFrozenRows() {} autoResizeColumns() {}
  }
  const ss = {
    getSheetByName: n => hojas[n] || null,
    insertSheet: n => (hojas[n] = new Hoja(n)),
    getSheets: () => Object.values(hojas),
    deleteSheet() {}
  };
  const fmt = (d, tz, f) => {
    const p = n => String(n).padStart(2, '0');
    const s = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return f === 'yyyy-MM-dd' ? s : `${s}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  let uuid = 0;
  const ctx = {
    console, Date, Math, JSON, String, Number, Object, Array, isNaN, encodeURIComponent,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    Utilities: { formatDate: fmt, getUuid: () => 'abcdef' + String(++uuid).padStart(2, '0') + '-1111-2222-3333-444455556666' },
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }), getService: () => ({ getUrl: () => 'https://script.google.com/x/exec' }) },
    Logger: { log() {} },
    ContentService: { MimeType: { JSON: 'json', TEXT: 'text' }, createTextOutput: s => ({ s, setMimeType(m) { this.m = m; return this; } }) },
    MailApp: { enviados: [], sendEmail(to, asunto, cuerpo) { this.enviados.push({ to, asunto, cuerpo }); } }
  };
  vm.createContext(ctx);
  for (const f of ['Calculos.gs', 'Code.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script', f), 'utf8'), ctx, { filename: f });
  return { ctx, hojas };
}

const get = (ctx, p) => { const r = ctx.doGet({ parameter: p }); return r.m === 'json' ? JSON.parse(r.s) : r.s; };
const post = (ctx, b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);

test('instalar, clave, anotar desde atajo y app, editar, borrar, config', () => {
  const { ctx, hojas } = crearEntorno();
  ctx.instalar();
  assert.ok(hojas.Movimientos && hojas.Config);
  const token = hojas.Config.d.find(r => r[0] === 'token')[1];
  assert.strictEqual(token.length, 24);

  assert.strictEqual(get(ctx, { token: 'mala' }).error, 'Clave incorrecta');

  let r = post(ctx, { token, accion: 'agregar', mov: { tipo: 'deposito', monto: '5,000', nuevo_periodo: true } });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.resumen.libre, 5000);
  assert.strictEqual(r.resumen.periodo.recibido, 5000);

  const txt = get(ctx, { token, accion: 'agregar', monto: 'MX$1,234.50', comercio: 'Walmart Express', medio: 'credito', origen: 'wallet', formato: 'texto' });
  assert.strictEqual(txt, 'Anotado: $1,234.50 en Walmart Express (tarjeta). Te quedan libres $3,765.50.');
  // duplicado de Wallet
  const dup = get(ctx, { token, accion: 'agregar', monto: '$1,234.50', comercio: 'Walmart Express', origen: 'wallet' });
  assert.strictEqual(dup.duplicado, true);

  r = get(ctx, { token, accion: 'estado' });
  assert.strictEqual(r.movimientos.length, 2);
  const compra = r.movimientos.find(m => m.tipo === 'compra');
  assert.strictEqual(compra.categoria, 'Súper');
  assert.strictEqual(compra.cashback, 'si');
  assert.strictEqual(r.config.token, undefined, 'la config pública no expone la clave');

  r = post(ctx, { token, accion: 'editar', id: compra.id, mov: { medio: 'debito', categoria: 'Farmacia' } });
  const ed = r.movimientos.find(m => m.id === compra.id);
  assert.strictEqual(ed.medio, 'debito'); assert.strictEqual(ed.cashback, 'no'); assert.strictEqual(ed.origen, 'wallet');
  assert.strictEqual(r.resumen.saldo_debito, 3765.5);

  r = post(ctx, { token, accion: 'config', valores: { dia_corte: 12, token: 'hack' } });
  assert.strictEqual(r.config.dia_corte, 12);
  assert.strictEqual(hojas.Config.d.find(x => x[0] === 'token')[1], token);

  r = post(ctx, { token, accion: 'borrar', id: compra.id });
  assert.strictEqual(r.resumen.libre, 5000);

  const ajuste = post(ctx, { token, accion: 'agregar', mov: { tipo: 'ajuste', monto: '-200', medio: 'debito' } });
  assert.strictEqual(ajuste.resumen.libre, 4800);

  assert.strictEqual(get(ctx, { token, accion: 'resumen', formato: 'texto' }), 'Libre: $4,800.00.');
  assert.strictEqual(get(ctx, { token, accion: 'aviso', formato: 'texto' }), '');
  assert.match(get(ctx, { token, accion: 'agregar', monto: '' }).error, /monto/);
});

test('correo de recordatorio cuando hay algo pendiente', () => {
  const { ctx, hojas } = crearEntorno();
  ctx.instalar();
  const token = hojas.Config.d.find(r => r[0] === 'token')[1];
  post(ctx, { token, accion: 'config', valores: { avisos_correo: 'a@ejemplo.com', aviso_libre_bajo: 500 } });
  post(ctx, { token, accion: 'agregar', mov: { tipo: 'compra', monto: 300, medio: 'credito' } });
  ctx.revisarAvisos();
  assert.strictEqual(ctx.MailApp.enviados.length, 1);
  assert.match(ctx.MailApp.enviados[0].cuerpo, /Ya gastaste \$300.00 más/);
});
