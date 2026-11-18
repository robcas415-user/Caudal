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
  ['categorias_cashback', 'Súper', 'texto', 'Categorías con cashback', 'Separadas por coma, con su porcentaje si es distinto: "Súper:6, Farmacia:2". Sin número usa el Cashback (%).'],
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

/**
 * Cashback por categoría. categorias_cashback = "Súper:6, Farmacia:2" (sin número usa cashback_pct).
 * Devuelve { 'súper': 6, 'farmacia': 2 } con los nombres en minúsculas. cashback_pct en 0 = apagado.
 */
function cdCashbackCategorias(cfg) {
  var base = Number(cfg.cashback_pct) || 0, out = {};
  cdLista(cfg.categorias_cashback).forEach(function (x) {
    var i = x.lastIndexOf(':'), nom = (i >= 0 ? x.slice(0, i) : x).trim();
    var pct = i >= 0 && x.slice(i + 1).trim() !== '' ? Number(x.slice(i + 1)) : base;
    if (nom && pct > 0) out[nom.toLowerCase()] = pct;
  });
  return out;
}

/** Porcentaje de cashback de una categoría (0 si no tiene o si el cashback está apagado). */
function cdPctCategoria(cat, cfg) {
  if (!(Number(cfg.cashback_pct) > 0)) return 0;
  return cdCashbackCategorias(cfg)[String(cat || '').toLowerCase()] || 0;
}

/** ¿Esta compra cuenta para cashback? */
function cdTieneCashback(m, cfg) {
  if (m.tipo !== 'compra' || m.medio !== 'credito') return false;
  if (m.cashback === 'si' || m.cashback === true) return true;
  if (m.cashback === 'no' || m.cashback === false) return false;
  return (cdCashbackCategorias(cfg)[String(m.categoria || '').toLowerCase()] || 0) > 0;
}

/** Porcentaje que regresa una compra con cashback: el de su categoría o, si se marcó a mano, el general. */
function cdPctCompra(m, cfg) {
  if (!(Number(cfg.cashback_pct) > 0)) return 0;
  return cdPctCategoria(m.categoria, cfg) || Number(cfg.cashback_pct) || 0;
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
  var cbBase = 0, cbGanado = 0, cbRecibidoTotal = 0;

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
    if (cdTieneCashback(m, cfg) && m.fecha >= cbInicio && m.fecha <= hoy) { cbBase += x; cbGanado += x * cdPctCompra(m, cfg) / 100; }

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

  var cbEstimado = cdRedondear(cbGanado);
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
    tipo: cfgEntrada && cfgEntrada.cuenta_tipo === 'debito' ? 'debito' : 'credito',
    cuenta: (cfgEntrada && cfgEntrada.cuenta_nombre) || '',
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
      porcentaje: Number(cfg.cashback_pct) || 0,
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
  if (r.tipo === 'debito') {
    // Cuenta de solo débito: no hay tarjeta, corte ni cashback; avisa si el saldo es bajo o quedó en negativo.
    if (r.libre < 0) av.push({ nivel: 'alerta', clave: 'libre_negativo', texto: 'Anotaste ' + cdPesos(-r.libre) + ' más de lo que hay en ' + (r.cuenta || 'esta cuenta') + '. Revisa con Cuadrar.' });
    else if (r.estado_libre === 'bajo') av.push({ nivel: 'atencion', clave: 'libre_bajo', texto: 'Te quedan solo ' + cdPesos(r.libre) + (r.cuenta ? ' en ' + r.cuenta : '') + '.' });
    return av;
  }
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

/**
 * Texto corto para la notificación del iPhone después de anotar algo.
 * conCuenta: true cuando hay varias cuentas, para decir en cuál se anotó.
 */
function cdMensajeAnotado(m, r, conCuenta) {
  var que, deb = r.tipo === 'debito', en = conCuenta && r.cuenta ? 'Anotado en ' + r.cuenta + ': ' : 'Anotado: ';
  if (m.tipo === 'compra') que = en + cdPesos(m.monto) + (m.descripcion ? ' en ' + m.descripcion : '') + (deb ? '' : (m.medio === 'debito' ? ' (débito)' : ' (tarjeta)')) + '.';
  else if (m.tipo === 'deposito') que = en + 'recibiste ' + cdPesos(m.monto) + '.';
  else if (m.tipo === 'pago_tarjeta') que = en + 'pagaste ' + cdPesos(m.monto) + ' a la tarjeta.';
  else if (m.tipo === 'cashback') que = en + 'cashback de ' + cdPesos(m.monto) + '.';
  else que = en.replace(/: $/, '.');
  var libre;
  if (deb) libre = r.libre < 0 ? ' ⚠️ Anotaste ' + cdPesos(-r.libre) + ' más de lo que hay.' : ' Te quedan ' + cdPesos(r.libre) + (r.cuenta ? ' en ' + r.cuenta : '') + '.';
  else libre = r.libre < 0 ? ' ⚠️ Te pasaste por ' + cdPesos(-r.libre) + '.' : ' Te quedan libres ' + cdPesos(r.libre) + '.';
  return que + libre;
}

/** Texto para el widget y para Siri. conCuenta: empieza con el nombre de la cuenta. */
function cdResumenTexto(r, conCuenta) {
  if (r.tipo === 'debito') return (r.cuenta || 'Saldo') + ': ' + cdPesos(r.libre) + '.';
  var s = (conCuenta && r.cuenta ? r.cuenta + '. ' : '') + 'Libre: ' + cdPesos(r.libre) + '.';
  if (r.tarjeta.por_pagar > 0) s += ' Tarjeta: pagar ' + cdPesos(r.tarjeta.por_pagar) + ' antes del ' + cdFechaBonita(r.tarjeta.fecha_limite, false) + '.';
  return s;
}

/* ---------------- cuentas ---------------- */

/*
 * Cada cuenta (DiDi, Nu…) lleva sus propios movimientos y su propio Libre. Las cuentas no se
 * mezclan: el saldo de una no cambia el de otra.
 *   tipo 'credito': tarjeta de crédito + débito (corte, límite, cashback), como DiDi.
 *   tipo 'debito':  solo débito: saldo y movimientos, sin tarjeta, corte ni cashback.
 * Los movimientos sin cuenta (los de antes) son de la primera cuenta.
 */
var CAUDAL_CUENTA_CAMPOS = ['id', 'nombre', 'tipo', 'color', 'dia_corte', 'dia_limite', 'cashback_pct', 'categorias_cashback', 'cashback_tope', 'aviso_libre_bajo'];
/**
 * Lo que cada cuenta guarda aparte (lo demás de Config es de todas). Corte, límite y cashback solo
 * aplican a cuentas de crédito; aviso_libre_bajo (avisar si el saldo baja de…) es de todas.
 */
var CAUDAL_CAMPOS_TARJETA = ['dia_corte', 'dia_limite', 'cashback_pct', 'categorias_cashback', 'cashback_tope', 'aviso_libre_bajo'];
/** El verde bosque de siempre (DiDi). Con este color la app se ve exactamente igual que antes. */
var CD_COLOR_BASE = '#2f6b4a';

function cdColorValido(c) {
  var s = String(c || '').trim();
  if (/^[0-9a-f]{6}$/i.test(s)) s = '#' + s;
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : '';
}

/** Lista de cuentas lista para usar. Sin pestaña Cuentas: una sola, DiDi, como siempre. */
function cdCuentasNormalizar(filas) {
  var vistas = {}, out = [];
  (filas || []).forEach(function (f) {
    var id = String(f.id == null ? '' : f.id).trim();
    if (!id || vistas[id]) return;
    vistas[id] = 1;
    var tipo = /^(deb|déb|solo)/i.test(String(f.tipo || '').trim()) ? 'debito' : 'credito';
    var c = { id: id, nombre: String(f.nombre || '').trim() || id, tipo: tipo, color: cdColorValido(f.color) || CD_COLOR_BASE };
    CAUDAL_CAMPOS_TARJETA.forEach(function (k) { c[k] = f[k] == null ? '' : f[k]; });
    out.push(c);
  });
  if (!out.length) out.push({ id: 'didi', nombre: 'DiDi', tipo: 'credito', color: CD_COLOR_BASE, dia_corte: '', dia_limite: '', cashback_pct: '', categorias_cashback: '', cashback_tope: '', aviso_libre_bajo: '' });
  return out;
}

/** Busca una cuenta por id o por nombre (sin importar mayúsculas). */
function cdBuscarCuenta(cuentas, q) {
  var s = String(q == null ? '' : q).trim().toLowerCase();
  if (!s) return null;
  for (var i = 0; i < cuentas.length; i++) {
    if (cuentas[i].id.toLowerCase() === s || cuentas[i].nombre.toLowerCase() === s) return cuentas[i];
  }
  return null;
}

/** ¿De qué cuenta es este movimiento? Sin cuenta (o una que ya no existe) = la primera. */
function cdCuentaDeMov(m, cuentas) {
  var c = cdBuscarCuenta(cuentas, m.cuenta);
  return c ? c.id : cuentas[0].id;
}

/**
 * Config de una cuenta: lo general de Config + lo de su tarjeta (de su fila en Cuentas).
 * La primera cuenta usa Config cuando su celda está vacía (así lo de antes sigue igual).
 * Una cuenta de solo débito no tiene cashback. El aviso de "Libre bajo" es de cada cuenta: la primera
 * usa el de Config si el suyo está vacío; las demás, solo el suyo (vacío = no avisar).
 */
function cdConfigDeCuenta(cfgCruda, cuenta, esPrimera) {
  var out = {};
  Object.keys(cfgCruda || {}).forEach(function (k) { out[k] = cfgCruda[k]; });
  CAUDAL_CAMPOS_TARJETA.forEach(function (k) {
    var v = cuenta[k];
    if (v !== '' && v != null) out[k] = v;
    else if (!esPrimera) out[k] = k === 'cashback_pct' ? 0 : '';
  });
  if (cuenta.tipo === 'debito') out.cashback_pct = 0;
  out.cuenta_tipo = cuenta.tipo;
  out.cuenta_nombre = cuenta.nombre;
  out.cuenta_id = cuenta.id;
  return out;
}

/** Calcula todas las cuentas. Devuelve [{id, nombre, tipo, color, resumen, config, movimientos}]. */
function cdCalcularCuentas(movs, cfgCruda, cuentas, hoy) {
  var porCuenta = {};
  cuentas.forEach(function (c) { porCuenta[c.id] = []; });
  (movs || []).forEach(function (m) { porCuenta[cdCuentaDeMov(m, cuentas)].push(m); });
  return cuentas.map(function (c, i) {
    var cfgC = cdConfigDeCuenta(cfgCruda, c, i === 0);
    return { id: c.id, nombre: c.nombre, tipo: c.tipo, color: c.color, resumen: calcularCaudal(porCuenta[c.id], cfgC, hoy), config: cdNormalizarConfig(cfgC), movimientos: porCuenta[c.id] };
  });
}

/* ---------------- colores de cada cuenta ---------------- */

/*
 * La app está diseñada en verde bosque. Para otra cuenta se toma su color de marca y se gira
 * el tono de toda la paleta verde (fondos, tarjetas, vidrio, acentos, textos con tinte) hacia
 * ese color, en OKLCH: la luminosidad de cada color se conserva, así que el contraste y la
 * profundidad quedan iguales. Rojo (alertas) y neutros no se tocan. Si algún texto pierde
 * contraste, se baja la saturación hasta que vuelve a leerse como en la original.
 */
function cdHexARgb(hex) {
  var h = String(hex).replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map(function (x) { return x + x; }).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function cdRgbAHex(c) {
  return '#' + c.map(function (x) { var v = Math.max(0, Math.min(255, Math.round(x))).toString(16); return v.length < 2 ? '0' + v : v; }).join('');
}
function cdLineal_(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function cdGamma_(c) { return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); }
function cdCbrt_(x) { return x < 0 ? -Math.pow(-x, 1 / 3) : Math.pow(x, 1 / 3); }

function cdRgbAOklch(rgb) {
  var r = cdLineal_(rgb[0]), g = cdLineal_(rgb[1]), b = cdLineal_(rgb[2]);
  var l = cdCbrt_(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  var m = cdCbrt_(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  var s = cdCbrt_(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  var A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  var B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  var h = Math.atan2(B, A) * 180 / Math.PI;
  return [L, Math.sqrt(A * A + B * B), h < 0 ? h + 360 : h];
}
function cdOklchALineal_(L, C, h) {
  var a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  var m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  var s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
/** OKLCH → sRGB; si el color no existe en pantalla, se le baja la saturación hasta que quepa. */
function cdOklchARgb(lch) {
  var L = lch[0], C = lch[1], h = lch[2];
  var cabe = function (c) { var x = cdOklchALineal_(L, c, h); return x[0] >= -1e-4 && x[0] <= 1.0001 && x[1] >= -1e-4 && x[1] <= 1.0001 && x[2] >= -1e-4 && x[2] <= 1.0001; };
  if (!cabe(C)) {
    var lo = 0, hi = C;
    for (var i = 0; i < 18; i++) { var mid = (lo + hi) / 2; if (cabe(mid)) lo = mid; else hi = mid; }
    C = lo;
  }
  var x = cdOklchALineal_(L, C, h);
  return [cdGamma_(Math.max(0, Math.min(1, x[0]))), cdGamma_(Math.max(0, Math.min(1, x[1]))), cdGamma_(Math.max(0, Math.min(1, x[2])))];
}

/** Cuánto pertenece un tono a la familia verde de la app (1 = verde/lima/turquesa, 0 = rojo o azul). */
function cdPesoVerde_(h) {
  if (h >= 90 && h <= 200) return 1;
  if (h > 75 && h < 90) return (h - 75) / 15;
  if (h > 200 && h < 218) return (218 - h) / 18;
  return 0;
}

/** Aplica el tema a un color [r,g,b] (0–255). */
function cdColorTema(rgb, tema) {
  if (!tema || tema.base) return rgb.slice(0, 3);
  var lch = cdRgbAOklch(rgb);
  if (lch[1] < 0.006) return rgb.slice(0, 3);            // neutros: blanco, negro, grises
  var w = cdPesoVerde_(lch[2]);
  if (!w) return rgb.slice(0, 3);
  var h = (lch[2] + tema.dh * w + 360) % 360;
  var C = lch[1] * (1 + (tema.cs - 1) * w);
  return cdOklchARgb([lch[0], C, h]);
}
function cdHexTema(hex, tema) { return cdRgbAHex(cdColorTema(cdHexARgb(hex), tema)); }

function cdLuminancia_(rgb) { return 0.2126 * cdLineal_(rgb[0]) + 0.7152 * cdLineal_(rgb[1]) + 0.0722 * cdLineal_(rgb[2]); }
function cdContraste(a, b) {
  var la = cdLuminancia_(a), lb = cdLuminancia_(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function cdMezcla_(fg, alfa, bg) { return [0, 1, 2].map(function (i) { return fg[i] * alfa + bg[i] * (1 - alfa); }); }

/** Parejas texto/fondo que deben leerse igual de bien que en la paleta original. */
var CD_PAREJAS_CONTRASTE = [
  // [texto, alfa del texto, fondo]
  ['#f2f8f5', 1, '#18261f'],     // texto sobre tarjeta
  ['#e8f5ee', 0.76, '#18261f'],  // texto secundario
  ['#e8f5ee', 0.58, '#18261f'],  // texto terciario
  ['#f0f5ea', 1, '#2f6b4a'],     // botón principal
  ['#a8c8a0', 1, '#0e1915'],     // acento sobre el fondo
  ['#cfe08c', 1, '#18261f'],     // lima sobre tarjeta
  ['#93cf9f', 1, '#101d17']      // "vas bien" del widget
];

/**
 * Tema para un color de marca: cuánto girar el tono (dh) y cuánto cambiar la saturación (cs).
 * Si algún texto pierde contraste se baja la saturación (ajustado = true).
 */
function cdTema(colorMarca) {
  var c = cdColorValido(colorMarca) || CD_COLOR_BASE;
  if (c === CD_COLOR_BASE) return { color: c, base: true, dh: 0, cs: 1, ajustado: false };
  var b = cdRgbAOklch(cdHexARgb(CD_COLOR_BASE)), t = cdRgbAOklch(cdHexARgb(c));
  var cs = t[1] < 0.02 ? Math.max(0.15, t[1] / b[1]) : Math.max(0.6, Math.min(1.6, t[1] / b[1]));
  var dh = t[1] < 0.02 ? 0 : t[2] - b[2];
  var tema = { color: c, base: false, dh: dh, cs: cs, ajustado: false };
  var pasa = function () {
    return CD_PAREJAS_CONTRASTE.every(function (p) {
      var fg = cdHexARgb(p[0]), bg = cdHexARgb(p[2]);
      var antes = cdContraste(cdMezcla_(fg, p[1], bg), bg);
      var bgT = cdColorTema(bg, tema), despues = cdContraste(cdMezcla_(cdColorTema(fg, tema), p[1], bgT), bgT);
      return despues >= Math.min(antes, 4.5) - 0.02;
    });
  };
  for (var i = 0; i < 12 && !pasa(); i++) { tema.cs = Math.max(0.3, tema.cs * 0.85); tema.ajustado = true; }
  return tema;
}

/** Colores principales de una cuenta, para el widget y la vista previa. */
function cdPaletaCuenta(colorMarca) {
  var tema = cdTema(colorMarca), t = function (h) { return cdHexTema(h, tema); };
  return {
    color: tema.color, ajustado: tema.ajustado,
    acento: t('#86c796'), boton: t('#2f6b4a'), fondo: t('#0e1915'), tarjeta: t('#18261f'),
    hoja: t('#93cf9f'), pistache: t('#d6e38f'), azul: t('#8fc3ea'), coral: '#f0908a',
    widget_bien: ['#1a3d2c', '#101d17', '#0a0f0d'].map(t),
    widget_bajo: ['#3a4120', '#181b10', '#0c0d09'].map(t),
    widget_negativo: ['#4a2420', '#1d1110', '#0e0a09']
  };
}

// Para pruebas en Node (no afecta a Apps Script ni al navegador).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calcularCaudal: calcularCaudal, cdAvisosDelDia: cdAvisosDelDia, cdLeerMonto: cdLeerMonto, cdPesos: cdPesos,
    cdUltimoCorte: cdUltimoCorte, cdLimiteDe: cdLimiteDe, cdNormalizarConfig: cdNormalizarConfig,
    cdMensajeAnotado: cdMensajeAnotado, cdPctCategoria: cdPctCategoria, cdTieneCashback: cdTieneCashback, cdResumenTexto: cdResumenTexto, cdConDia: cdConDia, CAUDAL_CONFIG: CAUDAL_CONFIG,
    cdCuentasNormalizar: cdCuentasNormalizar, cdBuscarCuenta: cdBuscarCuenta, cdConfigDeCuenta: cdConfigDeCuenta, cdCalcularCuentas: cdCalcularCuentas,
    cdTema: cdTema, cdColorTema: cdColorTema, cdHexTema: cdHexTema, cdHexARgb: cdHexARgb, cdContraste: cdContraste, cdPaletaCuenta: cdPaletaCuenta, CD_COLOR_BASE: CD_COLOR_BASE, CD_PAREJAS_CONTRASTE: CD_PAREJAS_CONTRASTE
  };
}
