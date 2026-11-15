const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../apps-script/Calculos.gs');

let n = 0;
const mov = (fecha, tipo, monto, extra = {}) => ({ id: String(++n), fecha, tipo, monto, medio: tipo === 'compra' ? 'credito' : 'debito', creado: fecha + 'T10:00:' + String(n).padStart(2, '0'), ...extra });
const cfg = { dia_corte: 5, dia_limite: 25, cashback_pct: 6, categorias_cashback: 'Súper', aviso_libre_bajo: 500 };

test('web/calculos.js es copia idéntica de apps-script/Calculos.gs', () => {
  const a = fs.readFileSync(path.join(__dirname, '../apps-script/Calculos.gs'), 'utf8');
  const b = fs.readFileSync(path.join(__dirname, '../web/calculos.js'), 'utf8');
  assert.strictEqual(a, b, 'corre: npm run sync');
});

test('Libre = recibido − compras con crédito − gastos con débito', () => {
  const movs = [
    mov('2026-11-01', 'deposito', 5000, { nuevo_periodo: true }),
    mov('2026-11-02', 'compra', 1200, { categoria: 'Súper' }),
    mov('2026-11-03', 'compra', 300, { medio: 'debito', categoria: 'Farmacia' }),
  ];
  const r = C.calcularCaudal(movs, cfg, '2026-11-04');
  assert.strictEqual(r.libre, 3500);
  assert.strictEqual(r.saldo_debito, 4700);
  assert.strictEqual(r.deuda_tarjeta, 1200);
  assert.strictEqual(r.estado_libre, 'bien');
});

test('pagar la tarjeta no cambia el Libre, sí el débito y la deuda', () => {
  const movs = [
    mov('2026-10-20', 'deposito', 4000),
    mov('2026-10-22', 'compra', 1000, { categoria: 'Súper' }),
    mov('2026-11-10', 'pago_tarjeta', 1000),
  ];
  const r = C.calcularCaudal(movs, cfg, '2026-11-12');
  assert.strictEqual(r.libre, 3000);
  assert.strictEqual(r.saldo_debito, 3000);
  assert.strictEqual(r.deuda_tarjeta, 0);
  assert.strictEqual(r.tarjeta.por_pagar, 0);
  assert.strictEqual(r.tarjeta.estado, 'al_corriente');
});

test('monto a pagar = saldo al corte − abonos después del corte', () => {
  const movs = [
    mov('2026-10-20', 'deposito', 6000),
    mov('2026-10-22', 'compra', 1000, { categoria: 'Súper' }),   // ciclo que cortó el 5 nov
    mov('2026-11-04', 'compra', 500, { categoria: 'Súper' }),    // también
    mov('2026-11-07', 'compra', 800, { categoria: 'Súper' }),    // ciclo actual
    mov('2026-11-08', 'pago_tarjeta', 600),
  ];
  const r = C.calcularCaudal(movs, cfg, '2026-11-10');
  assert.strictEqual(r.tarjeta.ultimo_corte, '2026-11-05');
  assert.strictEqual(r.tarjeta.fecha_limite, '2026-11-25');
  assert.strictEqual(r.tarjeta.por_pagar, 900);
  assert.strictEqual(r.tarjeta.dias_para_pagar, 15);
  assert.strictEqual(r.tarjeta.compras_ciclo_actual, 800);
  assert.strictEqual(r.deuda_tarjeta, 1700);
  assert.ok(r.avisos.some(a => a.clave === 'pago_pendiente'));
});

test('día límite menor que el corte = mes siguiente; días para pagar tiene prioridad', () => {
  assert.strictEqual(C.cdLimiteDe('2026-11-20', C.cdNormalizarConfig({ dia_corte: 20, dia_limite: 10 })), '2026-12-10');
  assert.strictEqual(C.cdLimiteDe('2026-11-20', C.cdNormalizarConfig({ dia_corte: 20, dias_para_pagar: 20 })), '2026-12-10');
  assert.strictEqual(C.cdLimiteDe('2026-12-20', C.cdNormalizarConfig({ dia_corte: 20, dia_limite: 10 })), '2027-01-10');
});

test('corte el 31 en meses cortos', () => {
  assert.strictEqual(C.cdUltimoCorte('2026-02-28', 31), '2026-02-28');
  assert.strictEqual(C.cdUltimoCorte('2026-02-27', 31), '2026-01-31');
  assert.strictEqual(C.cdUltimoCorte('2026-11-05', 5), '2026-11-05');
  assert.strictEqual(C.cdUltimoCorte('2026-01-03', 5), '2025-12-05');
});

test('pago vencido y no alcanza en débito', () => {
  const movs = [
    mov('2026-10-01', 'deposito', 500),
    mov('2026-10-10', 'compra', 2000, { categoria: 'Súper' }),
  ];
  const r = C.calcularCaudal(movs, cfg, '2026-10-28'); // cortó 5 oct? no: compra es después. corte 5 oct, deuda al corte 0
  assert.strictEqual(r.tarjeta.por_pagar, 0);
  const r2 = C.calcularCaudal(movs, cfg, '2026-11-26'); // cortó 5 nov, límite 25 nov ya pasó
  assert.strictEqual(r2.tarjeta.por_pagar, 2000);
  assert.strictEqual(r2.tarjeta.estado, 'vencido');
  assert.strictEqual(r2.tarjeta.alcanza_en_debito, false);
  assert.strictEqual(r2.tarjeta.falta_en_debito, 1500);
  assert.strictEqual(r2.estado_libre, 'negativo');
  const claves = r2.avisos.map(a => a.clave);
  assert.deepStrictEqual(claves.sort(), ['libre_negativo', 'no_alcanza', 'pago_vencido'].sort());
});

test('cashback estimado: solo crédito, solo categorías con cashback, mes actual, con tope', () => {
  const movs = [
    mov('2026-10-30', 'compra', 1000, { categoria: 'Súper' }),            // otro mes
    mov('2026-11-02', 'compra', 1000, { categoria: 'Súper' }),
    mov('2026-11-03', 'compra', 1000, { categoria: 'Farmacia' }),         // sin cashback
    mov('2026-11-04', 'compra', 1000, { categoria: 'Súper', medio: 'debito' }), // débito
    mov('2026-11-05', 'compra', 500, { categoria: 'Otro', cashback: 'si' }),     // forzado
  ];
  let r = C.calcularCaudal(movs, cfg, '2026-11-10');
  assert.strictEqual(r.cashback.base, 1500);
  assert.strictEqual(r.cashback.estimado, 90);
  r = C.calcularCaudal(movs, { ...cfg, cashback_tope: 50 }, '2026-11-10');
  assert.strictEqual(r.cashback.estimado, 50);
  assert.strictEqual(r.cashback.tope_alcanzado, true);
});

test('cashback recibido suma al Libre; según destino baja deuda o sube débito', () => {
  const base = [mov('2026-11-01', 'deposito', 1000), mov('2026-11-02', 'compra', 500, { categoria: 'Súper' }), mov('2026-11-03', 'cashback', 30)];
  let r = C.calcularCaudal(base, cfg, '2026-11-04');
  assert.strictEqual(r.libre, 530); assert.strictEqual(r.deuda_tarjeta, 470); assert.strictEqual(r.saldo_debito, 1000);
  r = C.calcularCaudal(base, { ...cfg, cashback_destino: 'debito' }, '2026-11-04');
  assert.strictEqual(r.libre, 530); assert.strictEqual(r.deuda_tarjeta, 500); assert.strictEqual(r.saldo_debito, 1030);
});

test('periodos de monto y duración variable con sobrante del anterior', () => {
  const movs = [
    mov('2026-10-01', 'deposito', 3000, { nuevo_periodo: true }),
    mov('2026-10-05', 'compra', 2500, { categoria: 'Súper' }),
    mov('2026-10-20', 'deposito', 4000, { nuevo_periodo: true }),
    mov('2026-10-21', 'compra', 1000, { categoria: 'Súper' }),
    mov('2026-10-22', 'compra', 200, { categoria: 'Farmacia', medio: 'debito' }),
    mov('2026-10-25', 'deposito', 500),  // extra, no inicia periodo
  ];
  const r = C.calcularCaudal(movs, { ...cfg, periodo_dias: 15 }, '2026-10-26');
  assert.strictEqual(r.periodo.inicio, '2026-10-20');
  assert.strictEqual(r.periodo.sobrante_anterior, 500);
  assert.strictEqual(r.periodo.recibido, 4500);
  assert.strictEqual(r.periodo.gastado, 1200);
  assert.strictEqual(r.libre, 500 + 4500 - 1200);
  assert.strictEqual(r.periodo.fin_estimado, '2026-11-04');
  assert.strictEqual(r.periodo.dias_restantes, 9);
  assert.strictEqual(r.periodo.por_dia, 422.22);
  assert.deepStrictEqual(r.periodo.por_categoria, { 'Súper': 1000, 'Farmacia': 200 });
});

test('ajustes: saldo inicial en débito y deuda inicial en tarjeta', () => {
  const movs = [mov('2026-11-01', 'ajuste', 2000, { medio: 'debito' }), mov('2026-11-01', 'ajuste', 700, { medio: 'credito' })];
  const r = C.calcularCaudal(movs, cfg, '2026-11-02');
  assert.strictEqual(r.libre, 1300); assert.strictEqual(r.saldo_debito, 2000); assert.strictEqual(r.deuda_tarjeta, 700);
});

test('recordatorios del día: solo los días configurados', () => {
  const movs = [mov('2026-10-01', 'deposito', 5000), mov('2026-10-20', 'compra', 1000, { categoria: 'Súper' })];
  const dias = (hoy) => C.cdAvisosDelDia(C.calcularCaudal(movs, cfg, hoy), cfg);
  assert.strictEqual(dias('2026-11-05')[0], 'Hoy cortó la tarjeta. Hay que pagar $1,000.00 a más tardar el miércoles 25 nov.');
  assert.deepStrictEqual(dias('2026-11-10'), []);
  assert.match(dias('2026-11-20')[0], /Paga \$1,000.00 de la tarjeta a más tardar el miércoles 25 nov/);
  assert.match(dias('2026-11-25')[0], /HOY/);
});

test('leer montos como los manda el iPhone', () => {
  assert.strictEqual(C.cdLeerMonto('$1,234.50'), 1234.5);
  assert.strictEqual(C.cdLeerMonto('MX$ 89,90'), 89.9);
  assert.strictEqual(C.cdLeerMonto('1,234'), 1234);
  assert.strictEqual(C.cdLeerMonto('1.234,56'), 1234.56);
  assert.strictEqual(C.cdLeerMonto('523.4'), 523.4);
  assert.strictEqual(C.cdLeerMonto(' $ 45 '), 45);
  assert.ok(isNaN(C.cdLeerMonto('')));
  assert.strictEqual(C.cdPesos(-1234.5), '-$1,234.50');
});

test('mensaje para la notificación', () => {
  const r = C.calcularCaudal([mov('2026-11-01', 'deposito', 1000), mov('2026-11-02', 'compra', 1200, { categoria: 'Súper', descripcion: 'Walmart' })], cfg, '2026-11-02');
  assert.strictEqual(C.cdMensajeAnotado({ tipo: 'compra', monto: 1200, descripcion: 'Walmart', medio: 'credito' }, r), 'Anotado: $1,200.00 en Walmart (tarjeta). ⚠️ Te pasaste por $200.00.');
});
