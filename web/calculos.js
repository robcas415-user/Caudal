/**
 * Caudal — cálculos puros (sin Google, sin internet).
 *
 * Este mismo archivo se usa en dos lugares:
 *   1. En Apps Script (Calculos.gs), para que la API calcule el estado.
 *   2. En la app web (web/calculos.js, copia idéntica), para el modo demo.
 * Si lo cambias, corre "npm run sync" para que web/calculos.js quede igual.
 *
 * Fechas: siempre texto 'AAAA-MM-DD'. Montos: números positivos en pesos.
 *
 * Tipos de movimiento:
 *   deposito      Dinero que recibió (se deposita a DiDi débito).
 *   compra        Gasto. medio = 'credito' (tarjeta) o 'debito'.
 *   pago_tarjeta  Pago a la tarjeta de crédito desde débito.
 *   cashback      Cashback recibido (va a la tarjeta o a débito, según config).
 *   ajuste        Corrección / saldo inicial. medio 'debito': suma a débito
 *                 (monto puede ser negativo). medio 'credito': deuda inicial.
 */

var CAUDAL_TIPOS = ['deposito', 'compra', 'pago_tarjeta', 'cashback', 'ajuste'];

var CAUDAL_CONFIG = [
  // clave, valor por defecto, tipo, etiqueta, ayuda
  ['nombre', 'Mamá', 'texto', 'Nombre', 'Cómo te saluda la app.'],
  ['dia_corte', 5, 'numero', 'Día de corte de la tarjeta', 'Día del mes en que cierra el estado de cuenta (1-31).'],
  ['dia_limite', 25, 'numero', 'Día límite de pago', 'Día del mes para pagar sin intereses. Si es menor que el día de corte, se entiende que es del mes siguiente.'],
  ['dias_para_pagar', '', 'numero', 'O bien: días para pagar después del corte', 'Si lo llenas, se usa en lugar del día límite (por ejemplo 20).'],
  ['limite_credito', '', 'numero', 'Límite de crédito', 'Opcional. Para mostrar cuánto crédito queda disponible.'],
  ['cashback_pct', 6, 'numero', 'Cashback (%)', 'Porcentaje que regresa la tarjeta en las categorías con cashback.'],
  ['cashback_tope', '', 'numero', 'Tope de cashback (pesos)', 'Máximo de cashback por periodo. Vacío = sin tope.'],
  ['cashback_periodo', 'mes', 'opcion:mes,corte', 'El tope de cashback es por', '"mes" = mes de calendario; "corte" = de corte a corte.'],
  ['cashback_destino', 'tarjeta', 'opcion:tarjeta,debito', 'El cashback llega a', 'Dónde se abona el cashback cuando lo anotas.'],
  ['categorias', 'Súper,Farmacia,Mercado,Comida,Casa,Otro', 'texto', 'Categorías', 'Separadas por coma.'],
  ['categorias_cashback', 'Súper', 'texto', 'Categorías con cashback', 'Separadas por coma. Las compras con crédito en estas categorías cuentan para el cashback.'],
  ['categoria_default', 'Súper', 'texto', 'Categoría por defecto', 'La que se usa cuando la compra llega sola desde el iPhone.'],
  ['monto_periodo', '', 'numero', 'Cuánto recibe normalmente', 'Opcional. Se propone al anotar "Recibí dinero".'],
  ['periodo_dias', '', 'numero', 'Cada cuántos días recibe dinero', 'Opcional (ej. 7, 15, 30). Sirve para calcular cuánto puede gastar al día.'],
  ['aviso_libre_bajo', 500, 'numero', 'Avisar si el Libre baja de', 'En pesos. Vacío = no avisar.'],
  ['avisos_dias_antes', '5,2,0', 'texto', 'Recordar el pago estos días antes', 'Separados por coma. 0 = el mismo día límite.'],
  ['avisos_correo', '', 'texto', 'Correos para recordatorios', 'Separados por coma. Vacío = no mandar correos.'],
  ['url_app', '', 'texto', 'Dirección de la app', 'La dirección de la app, para poner el enlace en los correos.']
];

/* ---------------- utilidades de fecha (texto AAAA-MM-DD) ---------------- */

function cdPad(n) { return (n < 10 ? '0' : '') + n; }

function cdFechaTexto(y, m, d) { return y + '-' + cdPad(m) + '-' + cdPad(d); }

function cdPartes(f) {
  var p = String(f).slice(0, 10).split('-');
  return { y: +p[0], m: +p[1], d: +p[2] };
}

function cdDiasDelMes(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** Fecha con ese día del mes, recortada al último día si el mes es más corto. */
function cdConDia(y, m, dia) {
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return cdFechaTexto(y, m, Math.min(dia, cdDiasDelMes(y, m)));
}

function cdSumarDias(f, n) {
  var p = cdPartes(f);
  var t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return cdFechaTexto(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function cdDiasEntre(a, b) {
  var pa = cdPartes(a), pb = cdPartes(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

var CD_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
var CD_DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** '2026-11-25' -> 'miércoles 25 nov' */
function cdFechaBonita(f, conDia) {
  var p = cdPartes(f);
  var s = p.d + ' ' + CD_MESES[p.m - 1];
  if (conDia !== false) s = CD_DIAS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] + ' ' + s;
  return s;
}

/* ---------------- dinero ---------------- */

function cdRedondear(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/** 1234.5 -> '$1,234.50' */
function cdPesos(n) {
  n = cdRedondear(n);
  var neg = n < 0;
  var partes = Math.abs(n).toFixed(2).split('.');
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + '$' + partes[0] + '.' + partes[1];
}

/**
 * Convierte lo que mande el iPhone ("$1,234.50", "MX$ 89,90", "1 234,5") en número.
 * Devuelve NaN si no hay número.
 */
function cdLeerMonto(v) {
  if (typeof v === 'number') return Math.abs(v);
  var s = String(v == null ? '' : v).replace(/[^\d.,]/g, '');
  if (!s) return NaN;
  var ultPunto = s.lastIndexOf('.'), ultComa = s.lastIndexOf(',');
  var dec = -1;
  if (ultPunto >= 0 && ultComa >= 0) dec = Math.max(ultPunto, ultComa);
  else if (ultComa >= 0 && s.length - ultComa - 1 <= 2 && s.indexOf(',') === ultComa) dec = ultComa;
  else if (ultPunto >= 0 && s.indexOf('.') === ultPunto && s.length - ultPunto - 1 !== 3) dec = ultPunto;
  var entero = (dec >= 0 ? s.slice(0, dec) : s).replace(/[.,]/g, '');
  var decimal = dec >= 0 ? s.slice(dec + 1).replace(/[.,]/g, '') : '';
  return Number(entero + (decimal ? '.' + decimal : ''));
}

/* ---------------- configuración ---------------- */

/** Llena valores faltantes con los de por defecto y convierte números. */
function cdNormalizarConfig(cfg) {
  var out = {};
  cfg = cfg || {};
  CAUDAL_CONFIG.forEach(function (c) {
    var v = cfg[c[0]];
    if (v === undefined || v === null) v = c[1];
    if (c[2] === 'numero') v = (v === '' ? '' : Number(v));
    else v = String(v).trim();
    out[c[0]] = v;
  });
  return out;
}

function cdLista(s) {
  return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}

/** ¿Esta compra cuenta para cashback? */
function cdTieneCashback(m, cfg) {
  if (m.tipo !== 'compra' || m.medio !== 'credito') return false;
  if (m.cashback === 'si' || m.cashback === true) return true;
  if (m.cashback === 'no' || m.cashback === false) return false;
  var cats = cdLista(cfg.categorias_cashback).map(function (x) { return x.toLowerCase(); });
  return cats.indexOf(String(m.categoria || '').toLowerCase()) >= 0;
}

/* ---------------- tarjeta: corte y límite ---------------- */

/** El corte más reciente que ya pasó (incluye hoy). */
function cdUltimoCorte(hoy, diaCorte) {
  var p = cdPartes(hoy);
  var esteMes = cdConDia(p.y, p.m, diaCorte);
  return esteMes <= hoy ? esteMes : cdConDia(p.y, p.m - 1, diaCorte);
}

function cdSiguienteCorte(corte, diaCorte) {
  var p = cdPartes(corte);
  return cdConDia(p.y, p.m + 1, diaCorte);
}

/** Fecha límite de pago del estado de cuenta que cortó en "corte". */
function cdLimiteDe(corte, cfg) {
  if (cfg.dias_para_pagar !== '' && !isNaN(cfg.dias_para_pagar)) return cdSumarDias(corte, Number(cfg.dias_para_pagar));
  var p = cdPartes(corte);
  var lim = Number(cfg.dia_limite) || 1;
  return lim > Number(cfg.dia_corte) ? cdConDia(p.y, p.m, lim) : cdConDia(p.y, p.m + 1, lim);
}

/* ---------------- cálculo principal ---------------- */

function cdOrdenar(movs) {
  return movs.slice().sort(function (a, b) {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return String(a.creado || '') < String(b.creado || '') ? -1 : (String(a.creado || '') > String(b.creado || '') ? 1 : 0);
  });
}

/** Efecto de un movimiento en: libre, débito y deuda de la tarjeta. */
function cdEfecto(m, cfg) {
  var x = cdRedondear(m.monto);
  switch (m.tipo) {
    case 'deposito': return { libre: x, debito: x, deuda: 0 };
    case 'compra': return m.medio === 'debito' ? { libre: -x, debito: -x, deuda: 0 } : { libre: -x, debito: 0, deuda: x };
    case 'pago_tarjeta': return { libre: 0, debito: -x, deuda: -x };
    case 'cashback': return cfg.cashback_destino === 'debito' ? { libre: x, debito: x, deuda: 0 } : { libre: x, debito: 0, deuda: -x };
    case 'ajuste': return m.medio === 'credito' ? { libre: -x, debito: 0, deuda: x } : { libre: x, debito: x, deuda: 0 };
  }
  return { libre: 0, debito: 0, deuda: 0 };
}

/**
 * Calcula todo lo que la app necesita mostrar.
 * @param {Array} movs  movimientos {id, fecha, tipo, medio, monto, descripcion, categoria, cashback, nuevo_periodo, creado}
 * @param {Object} cfgEntrada  configuración (clave -> valor)
 * @param {string} hoy  'AAAA-MM-DD'
 */
function calcularCaudal(movs, cfgEntrada, hoy) {
  var cfg = cdNormalizarConfig(cfgEntrada);
  var lista = cdOrdenar((movs || []).filter(function (m) { return CAUDAL_TIPOS.indexOf(m.tipo) >= 0 && !isNaN(Number(m.monto)); }));

  var libre = 0, debito = 0, deuda = 0;
  var totales = { recibido: 0, compras_credito: 0, compras_debito: 0, pagos: 0, cashback: 0 };

  // Tarjeta
  var diaCorte = Number(cfg.dia_corte) || 1;
  var corte = cdUltimoCorte(hoy, diaCorte);
  var corteAnterior = cdUltimoCorte(cdSumarDias(corte, -1), diaCorte);
  var siguienteCorte = cdSiguienteCorte(corte, diaCorte);
  var limite = cdLimiteDe(corte, cfg);
  var deudaAlCorte = 0, abonosDespuesDelCorte = 0, comprasCicloActual = 0, comprasCicloAnterior = 0;

  // Cashback
  var pHoy = cdPartes(hoy);
  var cbInicio = cfg.cashback_periodo === 'corte' ? cdSumarDias(corte, 1) : cdFechaTexto(pHoy.y, pHoy.m, 1);
  var cbBase = 0, cbRecibidoTotal = 0;

  // Periodo: empieza en el último depósito marcado como "nuevo periodo"
  var idxPeriodo = -1;
  lista.forEach(function (m, i) {
    if (m.tipo === 'deposito' && (m.nuevo_periodo === true || m.nuevo_periodo === 'si' || m.nuevo_periodo === 'TRUE')) idxPeriodo = i;
  });
  var libreAntesDelPeriodo = 0;
  var periodo = { recibido: 0, gastado: 0, gastado_credito: 0, gastado_debito: 0, otros: 0, por_categoria: {} };

  lista.forEach(function (m, i) {
    var e = cdEfecto(m, cfg);
    var x = cdRedondear(m.monto);
    libre += e.libre; debito += e.debito; deuda += e.deuda;

    if (m.tipo === 'deposito') totales.recibido += x;
    if (m.tipo === 'compra' && m.medio === 'debito') totales.compras_debito += x;
    if (m.tipo === 'compra' && m.medio !== 'debito') totales.compras_credito += x;
    if (m.tipo === 'pago_tarjeta') totales.pagos += x;
    if (m.tipo === 'cashback') { totales.cashback += x; cbRecibidoTotal += x; }

    // Tarjeta
    if (m.fecha <= corte) deudaAlCorte += e.deuda;
    else if (e.deuda < 0) abonosDespuesDelCorte += -e.deuda;
    if (m.tipo === 'compra' && m.medio !== 'debito') {
      if (m.fecha > corte) comprasCicloActual += x;
      else if (m.fecha > corteAnterior) comprasCicloAnterior += x;
    }

    // Cashback estimado
    if (cdTieneCashback(m, cfg) && m.fecha >= cbInicio && m.fecha <= hoy) cbBase += x;

    // Periodo
    if (idxPeriodo < 0 || i < idxPeriodo) libreAntesDelPeriodo += e.libre;
    else {
      if (m.tipo === 'deposito') periodo.recibido += x;
      else if (m.tipo === 'compra') {
        periodo.gastado += x;
        if (m.medio === 'debito') periodo.gastado_debito += x; else periodo.gastado_credito += x;
        var cat = m.categoria || 'Otro';
        periodo.por_categoria[cat] = cdRedondear((periodo.por_categoria[cat] || 0) + x);
      } else periodo.otros += e.libre;
    }
  });

  libre = cdRedondear(libre); debito = cdRedondear(debito); deuda = cdRedondear(deuda);
  var porPagar = cdRedondear(Math.max(0, deudaAlCorte - abonosDespuesDelCorte));
  var diasParaPagar = cdDiasEntre(hoy, limite);
  var estadoTarjeta;
  if (porPagar <= 0) estadoTarjeta = 'al_corriente';
  else if (diasParaPagar < 0) estadoTarjeta = 'vencido';
  else if (diasParaPagar <= 3) estadoTarjeta = 'pronto';
  else estadoTarjeta = 'pendiente';

  var pct = Number(cfg.cashback_pct) || 0;
  var cbEstimado = cdRedondear(cbBase * pct / 100);
  var tope = cfg.cashback_tope === '' ? null : Number(cfg.cashback_tope);
  var cbTopeAlcanzado = tope !== null && cbEstimado >= tope;
  if (tope !== null) cbEstimado = Math.min(cbEstimado, tope);

  // Periodo
  var infoPeriodo = null;
  if (idxPeriodo >= 0) {
    var inicio = lista[idxPeriodo].fecha;
    infoPeriodo = {
      inicio: inicio,
      dias_transcurridos: cdDiasEntre(inicio, hoy) + 1,
      sobrante_anterior: cdRedondear(libreAntesDelPeriodo),
      recibido: cdRedondear(periodo.recibido),
      gastado: cdRedondear(periodo.gastado),
      gastado_credito: cdRedondear(periodo.gastado_credito),
      gastado_debito: cdRedondear(periodo.gastado_debito),
      otros: cdRedondear(periodo.otros),
      por_categoria: periodo.por_categoria
    };
    if (cfg.periodo_dias !== '' && Number(cfg.periodo_dias) > 0) {
      var fin = cdSumarDias(inicio, Number(cfg.periodo_dias));
      var restantes = Math.max(1, cdDiasEntre(hoy, fin));
      infoPeriodo.fin_estimado = fin;
      infoPeriodo.dias_restantes = restantes;
      infoPeriodo.por_dia = cdRedondear(Math.max(0, libre) / restantes);
    }
  }

  var limiteCredito = cfg.limite_credito === '' ? null : Number(cfg.limite_credito);

  var resumen = {
    hoy: hoy,
    nombre: cfg.nombre,
    libre: libre,
    estado_libre: libre < 0 ? 'negativo' : (cfg.aviso_libre_bajo !== '' && libre < Number(cfg.aviso_libre_bajo) ? 'bajo' : 'bien'),
    saldo_debito: debito,
    deuda_tarjeta: deuda,
    credito_disponible: limiteCredito === null ? null : cdRedondear(limiteCredito - deuda),
    tarjeta: {
      ultimo_corte: corte,
      siguiente_corte: siguienteCorte,
      fecha_limite: limite,
      dias_para_pagar: diasParaPagar,
      por_pagar: porPagar,
      estado: estadoTarjeta,
      alcanza_en_debito: debito >= porPagar,
      falta_en_debito: cdRedondear(Math.max(0, porPagar - debito)),
      compras_ciclo_actual: cdRedondear(comprasCicloActual),
      compras_ciclo_anterior: cdRedondear(comprasCicloAnterior)
    },
    cashback: {
      porcentaje: pct,
      desde: cbInicio,
      base: cdRedondear(cbBase),
      estimado: cdRedondear(cbEstimado),
      tope: tope,
      tope_alcanzado: cbTopeAlcanzado,
      recibido_total: cdRedondear(cbRecibidoTotal)
    },
    periodo: infoPeriodo,
    totales: {
      recibido: cdRedondear(totales.recibido),
      compras_credito: cdRedondear(totales.compras_credito),
      compras_debito: cdRedondear(totales.compras_debito),
      pagos: cdRedondear(totales.pagos),
      cashback: cdRedondear(totales.cashback)
    }
  };
  resumen.avisos = cdAvisos(resumen, cfg);
  return resumen;
}

/**
 * Mensajes importantes en lenguaje sencillo (para la app, los correos y el atajo diario).
 * Cada aviso: {nivel: 'alerta'|'atencion'|'info', texto, clave}
 */
function cdAvisos(r, cfg) {
  var av = [];
  var t = r.tarjeta;
  if (r.libre < 0) {
    av.push({ nivel: 'alerta', clave: 'libre_negativo', texto: 'Ya gastaste ' + cdPesos(-r.libre) + ' más de lo que recibiste. Mejor no usar la tarjeta hasta recibir más dinero.' });
  } else if (r.estado_libre === 'bajo') {
    av.push({ nivel: 'atencion', clave: 'libre_bajo', texto: 'Te quedan solo ' + cdPesos(r.libre) + ' libres.' });
  }
  if (t.estado === 'vencido') {
    av.push({ nivel: 'alerta', clave: 'pago_vencido', texto: 'El pago de la tarjeta (' + cdPesos(t.por_pagar) + ') era el ' + cdFechaBonita(t.fecha_limite) + '. Págalo lo antes posible.' });
  } else if (t.por_pagar > 0) {
    var cuando = t.dias_para_pagar === 0 ? 'HOY' : (t.dias_para_pagar === 1 ? 'mañana' : 'el ' + cdFechaBonita(t.fecha_limite));
    av.push({ nivel: t.dias_para_pagar <= 3 ? 'alerta' : 'info', clave: 'pago_pendiente', texto: 'Paga ' + cdPesos(t.por_pagar) + ' de la tarjeta a más tardar ' + cuando + '.' });
  }
  if (t.por_pagar > 0 && !t.alcanza_en_debito) {
    av.push({ nivel: 'alerta', clave: 'no_alcanza', texto: 'En débito no alcanza para pagar la tarjeta: faltan ' + cdPesos(t.falta_en_debito) + '.' });
  }
  if (r.cashback.tope_alcanzado) {
    av.push({ nivel: 'info', clave: 'tope_cashback', texto: 'Ya llegaste al tope de cashback (' + cdPesos(r.cashback.tope) + '). Las compras extra ya no regresan dinero.' });
  }
  return av;
}

/** ¿Hay que mandar recordatorio hoy? Devuelve la lista de textos (vacía si no). */
function cdAvisosDelDia(r, cfgEntrada) {
  var cfg = cdNormalizarConfig(cfgEntrada);
  var dias = cdLista(cfg.avisos_dias_antes).map(Number);
  var out = [];
  r.avisos.forEach(function (a) {
    if (a.clave === 'pago_pendiente') {
      if (dias.indexOf(r.tarjeta.dias_para_pagar) >= 0) out.push(a.texto);
    } else if (a.clave === 'no_alcanza') {
      if (dias.indexOf(r.tarjeta.dias_para_pagar) >= 0 || r.tarjeta.dias_para_pagar <= 2) out.push(a.texto);
    } else if (a.nivel === 'alerta' || a.clave === 'libre_bajo') {
      out.push(a.texto);
    }
  });
  if (r.hoy === r.tarjeta.ultimo_corte && r.tarjeta.por_pagar > 0 && out.join(' ').indexOf('Paga ') < 0) {
    out.push('Hoy cortó la tarjeta. Hay que pagar ' + cdPesos(r.tarjeta.por_pagar) + ' a más tardar el ' + cdFechaBonita(r.tarjeta.fecha_limite) + '.');
  }
  return out;
}

/** Texto corto para la notificación del iPhone después de anotar algo. */
function cdMensajeAnotado(m, r) {
  var que;
  if (m.tipo === 'compra') que = 'Anotado: ' + cdPesos(m.monto) + (m.descripcion ? ' en ' + m.descripcion : '') + (m.medio === 'debito' ? ' (débito)' : ' (tarjeta)') + '.';
  else if (m.tipo === 'deposito') que = 'Anotado: recibiste ' + cdPesos(m.monto) + '.';
  else if (m.tipo === 'pago_tarjeta') que = 'Anotado: pagaste ' + cdPesos(m.monto) + ' a la tarjeta.';
  else if (m.tipo === 'cashback') que = 'Anotado: cashback de ' + cdPesos(m.monto) + '.';
  else que = 'Anotado.';
  var libre = r.libre < 0 ? ' ⚠️ Te pasaste por ' + cdPesos(-r.libre) + '.' : ' Te quedan libres ' + cdPesos(r.libre) + '.';
  return que + libre;
}

/** Texto para el widget y para Siri. */
function cdResumenTexto(r) {
  var s = 'Libre: ' + cdPesos(r.libre) + '.';
  if (r.tarjeta.por_pagar > 0) s += ' Tarjeta: pagar ' + cdPesos(r.tarjeta.por_pagar) + ' antes del ' + cdFechaBonita(r.tarjeta.fecha_limite, false) + '.';
  return s;
}

// Para pruebas en Node (no afecta a Apps Script ni al navegador).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcularCaudal: calcularCaudal, cdAvisosDelDia: cdAvisosDelDia, cdLeerMonto: cdLeerMonto, cdPesos: cdPesos,
    cdUltimoCorte: cdUltimoCorte, cdLimiteDe: cdLimiteDe, cdNormalizarConfig: cdNormalizarConfig,
    cdMensajeAnotado: cdMensajeAnotado, cdResumenTexto: cdResumenTexto, cdConDia: cdConDia, CAUDAL_CONFIG: CAUDAL_CONFIG
  };
}
