/* Cuentas (DiDi + Nu): migración segura, saldos independientes y colores. */
const test = require('node:test');
const assert = require('node:assert');
const C = require('../web/calculos.js');
const { crearHoja, crearLibro, cargar, leer } = require('./mock-sheets.js');

const HOY = '2026-11-18';
const CFG = [['clave', 'valor', 'qué es'], ['token', 'tok', ''], ['nombre', 'Mamá', ''], ['dia_corte', 26, ''], ['dia_limite', 11, ''],
  ['cashback_pct', 6, ''], ['categorias_cashback', 'Súper', ''], ['cashback_tope', 500, ''], ['aviso_libre_bajo', 500, ''], ['avisos_correo', 'a@b.c', '']];
const ENC = ['id', 'fecha', 'tipo', 'medio', 'monto', 'descripcion', 'categoria', 'cashback', 'nuevo_periodo', 'origen', 'creado'];
const MOVS = [
  ['a1', '2026-11-14', 'deposito', 'debito', 2761, 'Recibido', '', 'no', '', 'app', '2026-11-14T10:00:00'],
  ['a2', '2026-11-14', 'ajuste', 'credito', 883.08, 'Deuda inicial', '', 'no', '', 'app', '2026-11-14T10:01:00'],
  ['a3', '2026-11-15', 'compra', 'credito', 412.5, 'Walmart', 'Súper', 'si', '', 'app', '2026-11-15T12:00:00'],
  ['a4', '2026-11-16', 'compra', 'debito', 120, '', 'Farmacia', 'no', '', 'atajo', '2026-11-16T12:00:00'],
  ['a5', '2026-11-17', 'pago_tarjeta', 'debito', 300, '', '', 'no', '', 'app', '2026-11-17T09:00:00']
];

function libroViejo() {
  // Hoja como está hoy: 11 columnas (sin "cuenta") y sin pestaña Cuentas.
  const mov = crearHoja('Movimientos', [ENC].concat(MOVS));
  mov.maxCols = 11;
  return crearLibro([mov, crearHoja('Config', CFG)]);
}
const codigo = [leer('apps-script/Calculos.gs'), leer('apps-script/Code.gs')];
const sinCuenta = (r) => { const x = JSON.parse(JSON.stringify(r)); delete x.tipo; delete x.cuenta; return x; };

test('la migración no cambia nada de DiDi', () => {
  const libro = libroViejo();
  const cfgCruda = {}; CFG.slice(1).forEach(f => { cfgCruda[f[0]] = f[1]; });
  const movsViejos = MOVS.map(f => { const m = {}; ENC.forEach((k, i) => { m[k] = f[i]; }); m.nuevo_periodo = false; return m; });
  const antes = C.calcularCaudal(movsViejos, cfgCruda, HOY);   // lo que calculaba la versión anterior

  const gs = cargar(libro, codigo, HOY);
  const est = gs.get({ accion: 'estado' });
  assert.ok(est.ok, est.error);
  // Pestaña Cuentas creada con DiDi (crédito, datos de Config) y Nu (solo débito, morado).
  const cta = libro.getSheetByName('Cuentas');
  assert.deepStrictEqual(cta.d[0], ['id', 'nombre', 'tipo', 'color', 'dia_corte', 'dia_limite', 'tiene_cashback', 'cashback_pct', 'categorias_cashback', 'cashback_tope', 'aviso_libre_bajo']);
  assert.deepStrictEqual(cta.d[1].slice(0, 11), ['didi', 'DiDi', 'credito', '#2f6b4a', '26', '11', 'si', '6', 'Súper', '500', '500']);   // DiDi conserva su aviso de $500
  assert.deepStrictEqual(cta.d[2].slice(0, 4), ['nu', 'Nu', 'debito', '#820ad1']);
  assert.strictEqual(cta.d[2][6], 'no');
  assert.ok(!cta.d[2][10], 'Nu empieza sin aviso (no se inventa un umbral)');
  // Movimientos: mismas 11 columnas intactas + "cuenta" = didi.
  const mov = libro.getSheetByName('Movimientos');
  assert.strictEqual(mov.d[0][11], 'cuenta');
  MOVS.forEach((f, i) => { assert.deepStrictEqual(mov.d[i + 1].slice(0, 11), f); assert.strictEqual(mov.d[i + 1][11], 'didi'); });
  // El resumen de DiDi es idéntico al de antes (y lo de arriba sigue siendo DiDi, para versiones viejas).
  assert.deepStrictEqual(sinCuenta(est.cuentas[0].resumen), sinCuenta(antes));
  assert.deepStrictEqual(sinCuenta(est.resumen), sinCuenta(antes));
  assert.strictEqual(est.cuentas[1].resumen.libre, 0);
  assert.strictEqual(est.cuentas[1].tipo, 'debito');
  // Volver a llamar no migra dos veces.
  gs.get({ accion: 'estado' });
  assert.strictEqual(libro.getSheetByName('Cuentas').d.filter(f => f[0] === 'didi').length, 1);
});

test('Nu es independiente: no cambia el Libre de DiDi', () => {
  const libro = libroViejo();
  const gs = cargar(libro, codigo, HOY);
  const libreDidi = gs.get({ accion: 'estado' }).cuentas[0].resumen.libre;
  let r = gs.post({ accion: 'agregar', mov: { tipo: 'deposito', monto: '1500', cuenta: 'nu' } });
  assert.ok(r.ok, r.error);
  r = gs.get({ accion: 'agregar', monto: '200', medio: 'credito', cuenta: 'Nu', formato: 'texto' }); // del atajo, por nombre
  assert.match(r, /Anotado en Nu: \$200\.00.*Te quedan \$1,300\.00 en Nu/);
  const est = gs.get({ accion: 'estado' });
  assert.strictEqual(est.cuentas[0].resumen.libre, libreDidi);
  assert.strictEqual(est.cuentas[1].resumen.libre, 1300);
  const nuCompra = est.movimientos.find(m => m.cuenta === 'nu' && m.tipo === 'compra');
  assert.strictEqual(nuCompra.medio, 'debito');           // Nu es solo débito aunque el atajo diga crédito
  assert.strictEqual(nuCompra.cashback, 'no');
  // Sin cuenta, el atajo de siempre sigue anotando en DiDi.
  gs.get({ accion: 'agregar', monto: '50', medio: 'credito' });
  const est2 = gs.get({ accion: 'estado' });
  assert.strictEqual(est2.cuentas[0].resumen.libre, C.cdPesos ? libreDidi - 50 : 0);
  assert.strictEqual(est2.cuentas[1].resumen.libre, 1300);
});

test('API: cuentas, resumen por cuenta y activa', () => {
  const gs = cargar(libroViejo(), codigo, HOY);
  assert.strictEqual(gs.get({ accion: 'cuentas', formato: 'texto' }), 'DiDi\nNu');
  assert.strictEqual(gs.get({ accion: 'resumen', cuenta: 'activa' }).cuenta.id, 'didi');
  assert.ok(gs.post({ accion: 'activa', cuenta: 'nu' }).ok);
  const r = gs.get({ accion: 'resumen', cuenta: 'activa' });
  assert.strictEqual(r.cuenta.nombre, 'Nu');
  assert.strictEqual(r.resumen.tipo, 'debito');
  assert.ok(r.paleta && r.paleta.widget_bien.length === 3);
  assert.strictEqual(gs.get({ accion: 'resumen', formato: 'texto' }).indexOf('DiDi. Libre:'), 0);
  assert.strictEqual(gs.get({ accion: 'resumen', cuenta: 'nu', formato: 'texto' }), 'Nu: $0.00.');
});

test('Ajustes por cuenta y cuentas nuevas', () => {
  const libro = libroViejo();
  const gs = cargar(libro, codigo, HOY);
  gs.get({ accion: 'estado' });
  // Cambiar el corte de DiDi también lo deja en Config (las dos partes de la hoja dicen lo mismo).
  let est = gs.post({ accion: 'config', valores: { nombre: 'Mamá' }, cuenta: 'didi', valores_cuenta: { dia_corte: 27, color: '#2f6b4a', nombre: 'DiDi' } });
  assert.ok(est.ok, est.error);
  assert.strictEqual(est.cuentas[0].config.dia_corte, 27);
  assert.strictEqual(libro.getSheetByName('Config').d.find(f => f[0] === 'dia_corte')[1], 27);
  est = gs.post({ accion: 'config', valores: {}, cuenta: 'nu', valores_cuenta: { color: '#ff0000', nombre: 'Nu morado' } });
  assert.strictEqual(est.cuentas[1].color, '#ff0000');
  assert.strictEqual(est.cuentas[1].nombre, 'Nu morado');
  est = gs.post({ accion: 'cuenta', datos: { nombre: 'Efectivo', tipo: 'debito', color: '#e5701b' } });
  assert.strictEqual(est.cuentas.length, 3);
  assert.strictEqual(est.cuentas[2].nombre, 'Efectivo');
  assert.ok(est.cuenta_nueva);
  // La nota de ayuda debajo de las cuentas no se toma como cuenta.
  assert.ok(est.cuentas.every(c => c.id.indexOf(' ') < 0));
});

test('avisos por cuenta: cada una con su umbral y el correo dice de cuál habla', () => {
  const libro = libroViejo();
  const gs = cargar(libro, codigo, HOY);
  // Nu sin umbral: solo avisa si queda en negativo.
  gs.post({ accion: 'agregar', mov: { tipo: 'deposito', monto: '300', cuenta: 'nu' } });
  assert.ok(gs.get({ accion: 'aviso' }).avisos.every(a => a.indexOf('Nu') < 0), 'sin umbral no hay aviso de saldo bajo');
  // Se le pone umbral de $500 a Nu: con $300 avisa, y el texto dice "Nu".
  let r = gs.post({ accion: 'config', valores: {}, cuenta: 'nu', valores_cuenta: { aviso_libre_bajo: 500 } });
  assert.ok(r.ok, r.error);
  assert.strictEqual(libro.getSheetByName('Cuentas').d[2][10], '500');
  let av = gs.get({ accion: 'aviso' }).avisos;
  assert.ok(av.some(a => /^Nu: Te quedan solo \$300\.00 en Nu\./.test(a)), av.join(' | '));
  // El umbral de Nu no mueve el de DiDi (sigue en $500) ni al revés.
  const est = gs.get({ accion: 'estado' });
  assert.strictEqual(String(est.cuentas[0].config.aviso_libre_bajo), '500');
  assert.strictEqual(String(est.cuentas[1].config.aviso_libre_bajo), '500');
  gs.post({ accion: 'config', valores: {}, cuenta: 'nu', valores_cuenta: { aviso_libre_bajo: 100 } });
  av = gs.get({ accion: 'aviso' }).avisos;
  assert.ok(av.every(a => a.indexOf('Nu') < 0), 'con umbral 100 y saldo 300 ya no avisa');
  assert.strictEqual(String(gs.get({ accion: 'estado' }).cuentas[0].config.aviso_libre_bajo), '500');
  // Nu en negativo: alerta aunque no haya umbral.
  gs.post({ accion: 'agregar', mov: { tipo: 'compra', monto: '5000', cuenta: 'nu' } });
  av = gs.get({ accion: 'aviso' }).avisos;
  assert.ok(av.some(a => a.indexOf('Nu: Anotaste') === 0), av.join(' | '));
  // Ningún aviso de Nu habla de corte, límite o pago de tarjeta.
  assert.ok(av.filter(a => a.indexOf('Nu') === 0).every(a => !/corte|límite|Paga|tarjeta/i.test(a.replace(/Nu: Anotaste.*Cuadrar\./, ''))));
});

test('avisos por cuenta: una sola cuenta de crédito conserva el texto de siempre', () => {
  const libro = libroViejo();
  libro.getSheetByName('Config').d.forEach(f => { if (f[0] === 'aviso_libre_bajo') f[1] = 5000; });   // DiDi con Libre bajo
  const gs = cargar(libro, codigo, HOY);
  const av = gs.get({ accion: 'aviso' }).avisos;
  assert.ok(av.some(a => /^DiDi: /.test(a) && /Libre|quedan/i.test(a)), av.join(' | '));
});

test('migración: una hoja con Cuentas de la versión 3 recibe las columnas nuevas sin perder nada', () => {
  const libro = libroViejo();
  const gs = cargar(libro, codigo, HOY);
  gs.get({ accion: 'estado' });
  const cta = libro.getSheetByName('Cuentas');
  // Se simula la hoja de la versión 3: 9 columnas, sin aviso_libre_bajo ni tiene_cashback.
  const v3 = ['id', 'nombre', 'tipo', 'color', 'dia_corte', 'dia_limite', 'cashback_pct', 'categorias_cashback', 'cashback_tope'];
  const filas = [v3, ['didi', 'DiDi', 'credito', '#e5701b', '26', '11', '6', 'Súper:2, Clubes', '500'], ['nu', 'Nu', 'debito', '#820ad1', '', '', '0', '', '']];
  const nota = cta.d.slice(3);
  cta.d.length = 0; filas.concat(nota).forEach(f => cta.d.push(f));
  const gs2 = cargar(libro, codigo, HOY);
  const est = gs2.get({ accion: 'estado' });
  assert.ok(est.ok, est.error);
  assert.deepStrictEqual(cta.d[0].slice(0, 11), ['id', 'nombre', 'tipo', 'color', 'dia_corte', 'dia_limite', 'tiene_cashback', 'cashback_pct', 'categorias_cashback', 'cashback_tope', 'aviso_libre_bajo']);
  assert.deepStrictEqual(cta.d[1].slice(0, 11), ['didi', 'DiDi', 'credito', '#e5701b', '26', '11', 'si', '6', 'Súper:2, Clubes', '500', '500']);
  assert.deepStrictEqual(cta.d[2].slice(0, 11), ['nu', 'Nu', 'debito', '#820ad1', '', '', 'no', '0', '', '', '']);
  assert.ok(cta.d.some(f => /^tipo:/.test(String(f[0]))), 'la nota de ayuda sigue ahí');
  assert.strictEqual(est.cuentas[0].config.tiene_cashback, 'si');
  assert.strictEqual(est.cuentas[1].config.tiene_cashback, 'no');
  const copia = JSON.stringify(cta.d);
  gs2.get({ accion: 'estado' });
  assert.strictEqual(JSON.stringify(cta.d), copia, 'volver a abrir no cambia nada');
});

test('tipo y cashback: cada cuenta guarda solo lo que le corresponde', () => {
  const libro = libroViejo();
  const gs = cargar(libro, codigo, HOY);
  gs.get({ accion: 'estado' });
  const cta = libro.getSheetByName('Cuentas');
  const fila = (id) => { const e = cta.d[0]; const f = cta.d.find(x => x[0] === id); const o = {}; e.forEach((k, i) => { o[k] = f[i]; }); return o; };
  // Nu (solo débito) pasa a tarjeta y débito sin corte: la API lo rechaza con un texto claro y no escribe nada.
  let r = gs.post({ accion: 'config', valores: {}, cuenta: 'nu', valores_cuenta: { tipo: 'credito', dia_corte: '' } });
  assert.ok(!r.ok && /día de corte/.test(r.error), r.error);
  assert.strictEqual(fila('nu').tipo, 'debito');
  // Con corte y límite queda de crédito, sin cashback.
  r = gs.post({ accion: 'config', valores: {}, cuenta: 'nu', valores_cuenta: { tipo: 'credito', dia_corte: 15, dia_limite: 5, tiene_cashback: 'no' } });
  assert.ok(r.ok, r.error);
  assert.deepStrictEqual([fila('nu').tipo, fila('nu').dia_corte, fila('nu').dia_limite, fila('nu').tiene_cashback], ['credito', '15', '5', 'no']);
  assert.strictEqual(r.cuentas[1].config.cashback_pct, 0);
  assert.strictEqual(r.cuentas[1].resumen.cashback.porcentaje, 0);
  assert.strictEqual(r.cuentas[1].config.dia_corte, 15);
  // Cashback encendido necesita porcentaje; con porcentaje funciona.
  r = gs.post({ accion: 'config', valores: {}, cuenta: 'nu', valores_cuenta: { tiene_cashback: 'si', cashback_pct: '' } });
  assert.ok(!r.ok && /cashback/.test(r.error), r.error);
  r = gs.post({ accion: 'config', valores: {}, cuenta: 'nu', valores_cuenta: { tiene_cashback: 'si', cashback_pct: 3, categorias_cashback: 'Súper', cashback_tope: 200 } });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.cuentas[1].config.cashback_pct, 3);
  // Apagar el cashback lo quita de todos lados pero conserva lo configurado para cuando se prenda otra vez.
  r = gs.post({ accion: 'config', valores: {}, cuenta: 'nu', valores_cuenta: { tiene_cashback: 'no' } });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.cuentas[1].config.cashback_pct, 0);
  assert.strictEqual(r.cuentas[1].config.cashback_guardado.pct, 3);
  assert.strictEqual(fila('nu').cashback_pct, '3');
  // Pasar a solo débito vacía corte, límite y cashback (no quedan datos que no aplican).
  r = gs.post({ accion: 'config', valores: {}, cuenta: 'nu', valores_cuenta: { tipo: 'debito' } });
  assert.ok(r.ok, r.error);
  const nu = fila('nu');
  assert.deepStrictEqual([nu.tipo, nu.dia_corte, nu.dia_limite, nu.tiene_cashback, nu.cashback_pct, nu.categorias_cashback, nu.cashback_tope], ['debito', '', '', 'no', '', '', '']);
  // DiDi sigue igual: crédito con cashback 6%.
  const d = gs.get({ accion: 'estado' }).cuentas[0];
  assert.strictEqual(d.config.cashback_pct, 6);
  assert.strictEqual(d.config.tiene_cashback, 'si');
  assert.strictEqual(d.tipo, 'credito');
  // DiDi apaga el cashback desde Ajustes: el resumen ya no lo calcula.
  r = gs.post({ accion: 'config', valores: {}, cuenta: 'didi', valores_cuenta: { tiene_cashback: 'no' } });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.cuentas[0].resumen.cashback.porcentaje, 0);
  assert.strictEqual(r.cuentas[0].config.cashback_guardado.pct, 6);
  // La app anterior (sin cuentas) apaga el cashback con 0%: se entiende como "no lleva".
  r = gs.post({ accion: 'config', valores: { cashback_pct: 6 } });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.cuentas[0].config.tiene_cashback, 'si');
  r = gs.post({ accion: 'config', valores: { cashback_pct: 0 } });
  assert.strictEqual(r.cuentas[0].config.tiene_cashback, 'no');
});

test('colores: DiDi se queda igual; otro color cambia el tono y conserva el contraste', () => {
  assert.ok(C.cdTema('#2f6b4a').base);
  assert.deepStrictEqual(C.cdColorTema([47, 107, 74], C.cdTema('#2F6B4A')), [47, 107, 74]);
  ['#820ad1', '#1f5fbf', '#d81b60', '#e5701b', '#f5d000', '#808080', '#000000', '#ffffff', '#00ff00'].forEach(col => {
    const t = C.cdTema(col);
    assert.ok(!t.base);
    C.CD_PAREJAS_CONTRASTE.forEach(p => {
      const mez = (fg, a, bg) => [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a));
      const fg = C.cdHexARgb(p[0]), bg = C.cdHexARgb(p[2]);
      const antes = C.cdContraste(mez(fg, p[1], bg), bg);
      const bgT = C.cdColorTema(bg, t), despues = C.cdContraste(mez(C.cdColorTema(fg, t), p[1], bgT), bgT);
      assert.ok(despues >= Math.min(antes, 4.5) - 0.05, col + ' ' + p.join(' ') + ': ' + despues.toFixed(2) + ' < ' + antes.toFixed(2));
    });
  });
  // El rojo de las alertas no se toca.
  assert.strictEqual(C.cdHexTema('#ea8a7e', C.cdTema('#820ad1')), '#ea8a7e');
});
