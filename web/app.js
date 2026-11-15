/* Caudal — app web (PWA). Sin dependencias. */
(function () {
  'use strict';

  var LS = { api: 'caudal_api', clave: 'caudal_clave', estado: 'caudal_estado', demo: 'caudal_demo', demoDatos: 'caudal_demo_datos' };
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function guardar(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  var estado = null;          // respuesta de accion=estado
  var filtro = 'todos';
  var cargando = false;

  /* ===================== conexión ===================== */

  function conexion() {
    return {
      api: leer(LS.api) || (window.CAUDAL_API || ''),
      clave: leer(LS.clave) || '',
      demo: leer(LS.demo) === '1'
    };
  }

  /** Lee '#api=...&clave=...' de un enlace o de la dirección actual. */
  function leerEnlace(texto) {
    var i = String(texto || '').indexOf('#');
    if (i < 0) return null;
    var params = {};
    String(texto).slice(i + 1).split('&').forEach(function (par) {
      var kv = par.split('=');
      if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent((kv.slice(1).join('=') || '').replace(/\+/g, ' '));
    });
    if (params.demo !== undefined) return { demo: true };
    if (!params.clave) return null;
    return { api: params.api || window.CAUDAL_API || '', clave: params.clave };
  }

  function aplicarEnlace(datos) {
    if (!datos) return false;
    if (datos.demo) { guardar(LS.demo, '1'); return true; }
    if (!datos.api || !datos.clave) return false;
    guardar(LS.api, datos.api); guardar(LS.clave, datos.clave); guardar(LS.demo, null); guardar(LS.estado, null);
    return true;
  }

  async function llamar(accion, datos) {
    var c = conexion();
    if (c.demo) return Demo.llamar(accion, datos || {});
    var cuerpo = Object.assign({ token: c.clave, accion: accion }, datos || {});
    var res;
    try {
      res = await fetch(c.api, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(cuerpo)
      });
    } catch (e) {
      throw new Error('Sin conexión a internet. Intenta de nuevo.');
    }
    var j;
    try { j = await res.json(); } catch (e) { throw new Error('La hoja no respondió bien. Intenta de nuevo en un momento.'); }
    if (!j.ok) throw new Error(j.error === 'Clave incorrecta' ? 'La clave no es correcta. Pide el enlace de nuevo.' : (j.error || 'Algo salió mal'));
    return j;
  }

  /* ===================== modo demostración ===================== */

  var Demo = {
    hoy: function () {
      var d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },
    datos: function () {
      var g = leer(LS.demoDatos);
      if (g) try { return JSON.parse(g); } catch (e) {}
      var hoy = this.hoy();
      var f = function (n) { return cdSumarDias(hoy, n); };
      var n = 0;
      var m = function (fecha, tipo, monto, extra) {
        n++;
        return Object.assign({ id: 'd' + n, fecha: fecha, tipo: tipo, monto: monto, medio: tipo === 'compra' ? 'credito' : 'debito', descripcion: '', categoria: '', creado: fecha + 'T00:00:' + String(10 + n), origen: 'demo' }, extra || {});
      };
      var d = {
        config: { nombre: 'Mamá', dia_corte: Number(cdPartes(f(-9)).d), dia_limite: Number(cdPartes(f(11)).d), cashback_pct: 6, monto_periodo: 6000, periodo_dias: 15, avisos_correo: '', url_app: '' },
        movs: [
          m(f(-30), 'ajuste', 800, { descripcion: 'Saldo inicial', medio: 'debito' }),
          m(f(-24), 'deposito', 6000, { nuevo_periodo: true, descripcion: 'Gasto quincena' }),
          m(f(-22), 'compra', 1850.4, { categoria: 'Súper', descripcion: 'Walmart', cashback: 'si' }),
          m(f(-17), 'compra', 960, { categoria: 'Súper', descripcion: 'Soriana', cashback: 'si' }),
          m(f(-14), 'compra', 320, { categoria: 'Farmacia', descripcion: 'Farmacia Guadalajara', medio: 'debito' }),
          m(f(-12), 'compra', 1420.75, { categoria: 'Súper', descripcion: 'Chedraui', cashback: 'si' }),
          m(f(-19), 'pago_tarjeta', 2500),
          m(f(-9), 'deposito', 6000, { nuevo_periodo: true, descripcion: 'Gasto quincena' }),
          m(f(-6), 'compra', 2104.3, { categoria: 'Súper', descripcion: 'Walmart', cashback: 'si' }),
          m(f(-4), 'compra', 280, { categoria: 'Mercado', descripcion: 'Mercado', medio: 'debito' }),
          m(f(-2), 'compra', 735.9, { categoria: 'Súper', descripcion: 'Bodega Aurrera', cashback: 'si' }),
          m(f(0), 'compra', 189, { categoria: 'Farmacia', descripcion: 'Farmacia', cashback: 'no' })
        ]
      };
      this.guardarDatos(d);
      return d;
    },
    guardarDatos: function (d) { guardar(LS.demoDatos, JSON.stringify(d)); },
    estado: function (d) {
      var r = calcularCaudal(d.movs, d.config, this.hoy());
      return { ok: true, resumen: r, movimientos: cdOrdenar(d.movs).reverse(), config: cdNormalizarConfig(d.config), campos: CAUDAL_CONFIG };
    },
    llamar: async function (accion, datos) {
      await new Promise(function (r) { setTimeout(r, 250); });
      var d = this.datos();
      var cfg = cdNormalizarConfig(d.config);
      if (accion === 'agregar' || accion === 'editar') {
        var e = datos.mov || {};
        var monto = cdLeerMonto(e.monto);
        if (!(monto > 0)) throw new Error('Falta el monto');
        if (e.tipo === 'ajuste' && String(e.monto).trim().charAt(0) === '-') monto = -monto;
        var mov = {
          tipo: e.tipo, medio: (e.tipo === 'deposito' || e.tipo === 'pago_tarjeta') ? 'debito' : (e.medio === 'debito' ? 'debito' : 'credito'),
          monto: cdRedondear(monto), fecha: e.fecha || this.hoy(), descripcion: e.descripcion || '',
          categoria: e.tipo === 'compra' ? (e.categoria || cfg.categoria_default) : '', nuevo_periodo: !!e.nuevo_periodo, origen: 'demo'
        };
        mov.cashback = (e.cashback === 'si' || e.cashback === 'no') && mov.tipo === 'compra' && mov.medio === 'credito' ? e.cashback : (cdTieneCashback(mov, cfg) ? 'si' : 'no');
        if (accion === 'editar') {
          var i = d.movs.findIndex(function (x) { return x.id === datos.id; });
          if (i < 0) throw new Error('No encontré ese movimiento');
          d.movs[i] = Object.assign({}, d.movs[i], mov, { id: d.movs[i].id, creado: d.movs[i].creado });
        } else {
          var ahora = new Date(); mov.id = 'd' + ahora.getTime(); mov.creado = this.hoy() + 'T' + ahora.toTimeString().slice(0, 8);
          d.movs.push(mov);
        }
        this.guardarDatos(d);
        var est = this.estado(d);
        if (accion === 'agregar') est.mensaje = cdMensajeAnotado(mov, est.resumen);
        return est;
      }
      if (accion === 'borrar') { d.movs = d.movs.filter(function (x) { return x.id !== datos.id; }); this.guardarDatos(d); }
      if (accion === 'config') { Object.assign(d.config, datos.valores || {}); this.guardarDatos(d); }
      return this.estado(d);
    }
  };

  /* ===================== utilidades de pantalla ===================== */

  function h(tag, attrs, hijos) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (hijos || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function renglon(a, b, clase) { return '<div class="renglon ' + (clase || '') + '"><span>' + a + '</span><span>' + b + '</span></div>'; }
  function pesosSinCentavos(n) { var s = cdPesos(n); return s.slice(-3) === '.00' ? s.slice(0, -3) : s; }

  var toastTimer;
  function avisar(texto, ms) {
    var t = $('#toast');
    t.textContent = texto; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3500);
  }

  function hace(fechaIso) {
    if (!fechaIso) return '';
    var s = Math.round((Date.now() - new Date(fechaIso).getTime()) / 1000);
    if (s < 60) return 'hace un momento';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    return 'hace ' + Math.round(s / 86400) + ' días';
  }

  /* ===================== pintar ===================== */

  function pintar() {
    if (!estado) return;
    var r = estado.resumen;
    var cfg = estado.config;
    var hoyTxt = cdFechaBonita(r.hoy);

    $('#saludo').textContent = 'Hola, ' + (cfg.nombre || '');
    $('#fecha-hoy').textContent = hoyTxt.charAt(0).toUpperCase() + hoyTxt.slice(1);
    $('#banda-demo').hidden = !conexion().demo;

    // Libre
    var cajaLibre = $('#tarjeta-libre');
    cajaLibre.className = 'libre ' + (r.estado_libre === 'negativo' ? 'negativo' : r.estado_libre === 'bajo' ? 'bajo' : '');
    $('#libre-monto').textContent = cdPesos(r.libre);
    var sub = '';
    if (r.libre < 0) sub = 'Gastaste más de lo que recibiste.';
    else if (r.periodo && r.periodo.por_dia != null) sub = 'Alcanza para unos ' + pesosSinCentavos(r.periodo.por_dia) + ' al día por ' + r.periodo.dias_restantes + (r.periodo.dias_restantes === 1 ? ' día' : ' días') + '.';
    else if (r.periodo) sub = 'Este periodo: recibiste ' + pesosSinCentavos(r.periodo.recibido) + ' y gastaste ' + pesosSinCentavos(r.periodo.gastado) + '.';
    else sub = 'Anota el dinero que recibes con “Recibí dinero”.';
    $('#libre-sub').textContent = sub;

    // Avisos
    var ul = $('#avisos'); ul.innerHTML = '';
    r.avisos.forEach(function (a) {
      var ico = a.nivel === 'alerta' ? '⚠️' : a.nivel === 'atencion' ? '👀' : '📅';
      ul.appendChild(h('li', { class: 'aviso aviso-' + a.nivel }, [h('span', { 'aria-hidden': 'true', text: ico }), h('span', { text: a.texto })]));
    });

    // Tarjeta
    var t = r.tarjeta, html = '';
    if (t.por_pagar > 0) {
      var cuando = t.estado === 'vencido' ? '<span class="mal">Venció el ' + esc(cdFechaBonita(t.fecha_limite)) + '</span>'
        : t.dias_para_pagar === 0 ? '<span class="mal">Hoy es el último día</span>'
        : 'Antes del ' + esc(cdFechaBonita(t.fecha_limite)) + ' <span class="pequeno">(' + (t.dias_para_pagar === 1 ? 'mañana' : 'faltan ' + t.dias_para_pagar + ' días') + ')</span>';
      html += '<p class="pequeno">Toca pagar</p><p class="dato-grande">' + cdPesos(t.por_pagar) + '</p><p>' + cuando + '</p>';
    } else {
      html += '<p class="dato-grande ok">Al corriente ✓</p><p class="pequeno">No hay pago pendiente. Siguiente corte: ' + esc(cdFechaBonita(t.siguiente_corte)) + '.</p>';
    }
    html += renglon('Compras desde el último corte', cdPesos(t.compras_ciclo_actual), 'suave');
    html += renglon('Deuda total de la tarjeta', cdPesos(r.deuda_tarjeta), 'suave');
    if (r.credito_disponible != null) html += renglon('Crédito disponible', cdPesos(r.credito_disponible), 'suave');
    html += renglon('Corte', 'día ' + cfg.dia_corte + ' · último ' + esc(cdFechaBonita(t.ultimo_corte, false)), 'suave');
    $('#t-tarjeta-cuerpo').innerHTML = html;

    // Débito
    html = '<p class="pequeno">En la app de DiDi deberías ver</p><p class="dato-grande">' + cdPesos(r.saldo_debito) + '</p>';
    if (r.deuda_tarjeta > 0) html += '<p>De eso, <b>' + cdPesos(r.deuda_tarjeta) + '</b> es para pagar la tarjeta. Lo demás es tu Libre.</p>';
    if (!t.alcanza_en_debito) html += '<p class="mal">No alcanza para el pago de la tarjeta: faltan ' + cdPesos(t.falta_en_debito) + '.</p>';
    html += '<p class="pequeno">Si el saldo real es distinto, quizá falta anotar algo.</p>';
    $('#t-debito-cuerpo').innerHTML = html;

    // Cashback
    var cb = r.cashback;
    html = '<p class="pequeno">Ganado ' + (cfg.cashback_periodo === 'corte' ? 'desde el corte' : 'este mes') + ' (aprox.)</p><p class="dato-grande ok">' + cdPesos(cb.estimado) + '</p>';
    html += renglon('Compras con cashback (' + cb.porcentaje + '%)', cdPesos(cb.base), 'suave');
    if (cb.tope != null) html += renglon('Tope', cdPesos(cb.tope) + (cb.tope_alcanzado ? ' · alcanzado' : ''), 'suave');
    if (cb.recibido_total > 0) html += renglon('Cashback recibido (total)', cdPesos(cb.recibido_total), 'suave');
    $('#t-cashback-cuerpo').innerHTML = html;

    // Periodo
    var p = r.periodo;
    if (p) {
      html = '<p class="pequeno">Desde el ' + esc(cdFechaBonita(p.inicio)) + (p.fin_estimado ? ' hasta el ' + esc(cdFechaBonita(p.fin_estimado, false)) + ' aprox.' : '') + '</p>';
      if (p.sobrante_anterior !== 0) html += renglon(p.sobrante_anterior > 0 ? 'Sobró del periodo anterior' : 'Faltó del periodo anterior', cdPesos(p.sobrante_anterior));
      html += renglon('Recibiste', cdPesos(p.recibido));
      html += renglon('Gastaste', cdPesos(p.gastado));
      html += renglon('· con tarjeta', cdPesos(p.gastado_credito), 'suave');
      html += renglon('· con débito', cdPesos(p.gastado_debito), 'suave');
      if (p.otros) html += renglon('Otros (cashback, ajustes)', cdPesos(p.otros), 'suave');
      var cats = Object.keys(p.por_categoria).sort(function (a, b) { return p.por_categoria[b] - p.por_categoria[a]; });
      if (cats.length) {
        var max = p.por_categoria[cats[0]];
        html += '<div class="barras">' + cats.map(function (c) {
          return '<div class="barra-cat"><div class="renglon"><span>' + esc(c) + '</span><span>' + cdPesos(p.por_categoria[c]) + '</span></div><div class="pista"><div class="relleno" style="width:' + Math.max(3, Math.round(p.por_categoria[c] / max * 100)) + '%"></div></div></div>';
        }).join('') + '</div>';
      }
    } else {
      html = '<p class="pequeno">Cuando anotes “Recibí dinero” marcando “empieza un periodo nuevo”, aquí verás cuánto llevas gastado.</p>';
    }
    $('#t-periodo-cuerpo').innerHTML = html;

    $('#actualizado').textContent = estado._recibido ? 'Actualizado ' + hace(estado._recibido) : '';

    pintarMovimientos();
    pintarConfig();
  }

  var ICONOS = { compra: '🛒', deposito: '💵', pago_tarjeta: '💳', cashback: '🎁', ajuste: '✏️' };
  function nombreMov(m) {
    if (m.tipo === 'compra') return m.descripcion || m.categoria || 'Compra';
    if (m.tipo === 'deposito') return m.descripcion || 'Dinero recibido';
    if (m.tipo === 'pago_tarjeta') return 'Pago a la tarjeta';
    if (m.tipo === 'cashback') return 'Cashback';
    return m.descripcion || (m.medio === 'credito' ? 'Ajuste de deuda' : 'Ajuste');
  }
  function detalleMov(m) {
    if (m.tipo === 'compra') return (m.medio === 'debito' ? 'Débito' : 'Tarjeta de crédito') + (m.categoria ? ' · ' + m.categoria : '') + (m.cashback === 'si' ? ' · cashback' : '') + (m.origen === 'wallet' ? ' · automático' : '');
    if (m.tipo === 'deposito') return m.nuevo_periodo ? 'Inicio de periodo' : 'A débito';
    if (m.tipo === 'pago_tarjeta') return 'De débito a la tarjeta';
    if (m.tipo === 'cashback') return 'Regreso de la tarjeta';
    return m.medio === 'credito' ? 'Deuda de tarjeta' : 'Débito';
  }

  function pintarMovimientos() {
    var cont = $('#lista-movs'); cont.innerHTML = '';
    var movs = estado.movimientos.filter(function (m) { return filtro === 'todos' || m.tipo === filtro; });
    if (!movs.length) { cont.appendChild(h('p', { class: 'vacio', text: 'Todavía no hay movimientos aquí.' })); return; }
    var porDia = {};
    var orden = [];
    movs.forEach(function (m) { if (!porDia[m.fecha]) { porDia[m.fecha] = []; orden.push(m.fecha); } porDia[m.fecha].push(m); });
    orden.forEach(function (f) {
      var dia = h('div', { class: 'dia' }, [h('h3', { text: f === estado.resumen.hoy ? 'Hoy' : cdFechaBonita(f) })]);
      porDia[f].forEach(function (m) {
        var suma = cdEfecto(m, estado.config).libre > 0;
        var signo = m.tipo === 'pago_tarjeta' ? '' : (suma ? '+' : '−');
        dia.appendChild(h('button', { class: 'mov', onclick: function () { abrirForm(m.tipo === 'pago_tarjeta' ? 'pago_tarjeta' : (['cashback', 'ajuste'].indexOf(m.tipo) >= 0 ? 'otro' : m.tipo), m); } }, [
          h('span', { class: 'mov-ico', 'aria-hidden': 'true', text: ICONOS[m.tipo] || '•' }),
          h('span', { class: 'mov-txt' }, [h('b', { text: nombreMov(m) }), h('small', { text: detalleMov(m) })]),
          h('span', { class: 'mov-monto' + (suma ? ' mas' : ''), text: signo + cdPesos(Math.abs(m.monto)) })
        ]));
      });
      cont.appendChild(dia);
    });
  }

  /* ===================== ajustes ===================== */

  var SECCIONES = {
    nombre: 'General', dia_corte: 'Tarjeta de crédito', cashback_pct: 'Cashback', categorias: 'Categorías',
    monto_periodo: 'Dinero que recibe', aviso_libre_bajo: 'Recordatorios'
  };

  function pintarConfig() {
    var f = $('#form-config');
    if (f.contains(document.activeElement)) return; // no borrar lo que se está escribiendo
    f.innerHTML = '';
    (estado.campos || CAUDAL_CONFIG).forEach(function (c) {
      var clave = c[0], tipo = c[2], valor = estado.config[clave];
      if (SECCIONES[clave]) f.appendChild(h('p', { class: 'seccion', text: SECCIONES[clave] }));
      var id = 'cfg-' + clave, control;
      if (tipo.indexOf('opcion:') === 0) {
        control = h('select', { id: id, name: clave }, tipo.slice(7).split(',').map(function (o) { return h('option', { value: o, selected: String(valor) === o, text: o }); }));
      } else {
        control = h('input', { id: id, name: clave, value: valor === '' || valor == null ? '' : valor, type: tipo === 'numero' ? 'text' : 'text', inputmode: tipo === 'numero' ? 'decimal' : null, autocomplete: 'off' });
      }
      f.appendChild(h('div', { class: 'campo' }, [h('label', { for: id, text: c[3] }), control, h('span', { class: 'ayuda', text: c[4] })]));
    });
    f.appendChild(h('button', { class: 'btn btn-principal', type: 'submit', text: 'Guardar ajustes' }));
  }

  async function guardarConfig(ev) {
    ev.preventDefault();
    var valores = {};
    (estado.campos || CAUDAL_CONFIG).forEach(function (c) {
      var el = $('#cfg-' + c[0]);
      if (!el) return;
      var v = el.value.trim();
      if (c[2] === 'numero' && v !== '') {
        var n = cdLeerMonto(v);
        if (isNaN(n)) { avisar('Revisa: ' + c[3]); throw new Error('número inválido'); }
        v = n;
      }
      valores[c[0]] = v;
    });
    var dc = Number(valores.dia_corte), dl = Number(valores.dia_limite);
    if (!(dc >= 1 && dc <= 31)) { avisar('El día de corte debe ser entre 1 y 31'); return; }
    if (valores.dia_limite !== '' && !(dl >= 1 && dl <= 31)) { avisar('El día límite debe ser entre 1 y 31'); return; }
    var btn = $('#form-config button[type=submit]');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      document.activeElement && document.activeElement.blur();
      recibir(await llamar('config', { valores: valores }));
      avisar('Ajustes guardados ✓');
    } catch (e) { avisar(e.message); btn.disabled = false; btn.textContent = 'Guardar ajustes'; }
  }

  /* ===================== formularios ===================== */

  var formActual = null; // {tipo, mov}

  function campoMonto(valor, etiqueta) {
    return h('div', { class: 'campo' }, [
      h('label', { for: 'f-monto', text: etiqueta || '¿Cuánto?' }),
      h('div', { class: 'monto-input' }, [h('input', { id: 'f-monto', name: 'monto', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00', value: valor ? String(valor) : '' })])
    ]);
  }
  function campoFecha(valor) {
    return h('div', { class: 'campo' }, [h('label', { for: 'f-fecha', text: 'Fecha' }), h('input', { id: 'f-fecha', name: 'fecha', type: 'date', value: valor || estado.resumen.hoy })]);
  }
  function campoTexto(nombre, etiqueta, valor, ph) {
    return h('div', { class: 'campo' }, [h('label', { for: 'f-' + nombre, text: etiqueta }), h('input', { id: 'f-' + nombre, name: nombre, value: valor || '', placeholder: ph || '', autocomplete: 'off' })]);
  }
  /** Botones grandes tipo "elige uno". */
  function opciones(nombre, etiqueta, lista, valor) {
    var oculto = h('input', { type: 'hidden', name: nombre, id: 'f-' + nombre, value: valor });
    var grupo = h('div', { class: 'opciones', role: 'radiogroup', 'aria-label': etiqueta });
    lista.forEach(function (o) {
      var b = h('button', { type: 'button', class: 'opcion' + (o.v === valor ? ' activo' : ''), role: 'radio', 'aria-checked': o.v === valor ? 'true' : 'false', 'data-v': o.v, html: esc(o.t) + (o.s ? '<small>' + esc(o.s) + '</small>' : '') });
      b.addEventListener('click', function () {
        oculto.value = o.v;
        $$('.opcion', grupo).forEach(function (x) { var on = x === b; x.classList.toggle('activo', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
        oculto.dispatchEvent(new Event('change'));
      });
      grupo.appendChild(b);
    });
    return h('div', { class: 'campo' }, [h('span', { class: 'etiqueta', text: etiqueta }), grupo, oculto]);
  }
  function chipsCategoria(valor) {
    var oculto = h('input', { type: 'hidden', name: 'categoria', id: 'f-categoria', value: valor });
    var cont = h('div', { class: 'chips' });
    cdLista(estado.config.categorias).forEach(function (c) {
      var b = h('button', { type: 'button', class: 'chip' + (c === valor ? ' activo' : ''), text: c });
      b.addEventListener('click', function () { oculto.value = c; $$('.chip', cont).forEach(function (x) { x.classList.toggle('activo', x === b); }); });
      cont.appendChild(b);
    });
    return h('div', { class: 'campo' }, [h('span', { class: 'etiqueta', text: '¿De qué fue?' }), cont, oculto]);
  }
  function sugerencias(lista) {
    return h('div', { class: 'sugerencias' }, lista.filter(function (s) { return s.v > 0; }).map(function (s) {
      return h('button', { type: 'button', class: 'chip', text: s.t + ' ' + cdPesos(s.v), onclick: function () { $('#f-monto').value = s.v.toFixed(2); } });
    }));
  }

  function abrirForm(tipo, mov) {
    formActual = { tipo: tipo, mov: mov || null };
    var cuerpo = $('#hoja-cuerpo'); cuerpo.innerHTML = '';
    $('#hoja-error').hidden = true;
    $('#hoja-borrar').hidden = !mov;
    var cfg = estado.config, r = estado.resumen;
    var titulo;
    if (tipo === 'compra') {
      titulo = mov ? 'Editar compra' : 'Anotar compra';
      cuerpo.appendChild(campoMonto(mov && mov.monto));
      cuerpo.appendChild(opciones('medio', '¿Con qué pagaste?', [
        { v: 'credito', t: 'Tarjeta de crédito', s: cfg.cashback_pct ? 'da ' + cfg.cashback_pct + '% de cashback' : '' },
        { v: 'debito', t: 'Débito', s: 'sale de la cuenta' }
      ], mov ? mov.medio : 'credito'));
      cuerpo.appendChild(chipsCategoria(mov ? mov.categoria : cfg.categoria_default));
      cuerpo.appendChild(campoTexto('descripcion', '¿Dónde? (opcional)', mov && mov.descripcion, 'Ej. Walmart'));
      cuerpo.appendChild(campoFecha(mov && mov.fecha));
    } else if (tipo === 'deposito') {
      titulo = mov ? 'Editar dinero recibido' : 'Recibí dinero';
      cuerpo.appendChild(campoMonto(mov ? mov.monto : cfg.monto_periodo, '¿Cuánto recibiste?'));
      cuerpo.appendChild(opciones('nuevo_periodo', '¿Empieza un periodo nuevo?', [
        { v: 'si', t: 'Sí', s: 'es el gasto de la semana/quincena' },
        { v: 'no', t: 'No', s: 'es dinero extra' }
      ], mov ? (mov.nuevo_periodo ? 'si' : 'no') : 'si'));
      cuerpo.appendChild(campoTexto('descripcion', 'Nota (opcional)', mov && mov.descripcion, 'Ej. Gasto quincena'));
      cuerpo.appendChild(campoFecha(mov && mov.fecha));
    } else if (tipo === 'pago_tarjeta') {
      titulo = mov ? 'Editar pago' : 'Pagué la tarjeta';
      cuerpo.appendChild(campoMonto(mov ? mov.monto : (r.tarjeta.por_pagar || ''), '¿Cuánto pagaste?'));
      if (!mov) cuerpo.appendChild(sugerencias([{ t: 'Lo que toca:', v: r.tarjeta.por_pagar }, { t: 'Todo:', v: r.deuda_tarjeta }]));
      cuerpo.appendChild(h('p', { class: 'pequeno', text: 'Pagar la tarjeta no cambia tu Libre; solo pasa dinero de débito a la tarjeta.' }));
      cuerpo.appendChild(campoFecha(mov && mov.fecha));
    } else {
      titulo = mov ? 'Editar movimiento' : 'Otro movimiento';
      var sel = mov ? (mov.tipo === 'cashback' ? 'cashback' : (mov.medio === 'credito' ? 'deuda' : 'ajuste')) : 'cashback';
      var op = opciones('clase', '¿Qué fue?', [
        { v: 'cashback', t: 'Me llegó cashback', s: 'regreso de la tarjeta' },
        { v: 'ajuste', t: 'Corregir saldo', s: 'saldo inicial o diferencia' },
        { v: 'deuda', t: 'Deuda anterior', s: 'lo que ya debía la tarjeta' }
      ], sel);
      op.querySelector('.opciones').style.gridTemplateColumns = '1fr';
      cuerpo.appendChild(op);
      cuerpo.appendChild(campoMonto(mov && mov.monto));
      cuerpo.appendChild(h('p', { class: 'pequeno', id: 'f-ayuda-otro' }));
      cuerpo.appendChild(campoTexto('descripcion', 'Nota (opcional)', mov && mov.descripcion, ''));
      cuerpo.appendChild(campoFecha(mov && mov.fecha));
      var ayudar = function () {
        var v = $('#f-clase').value;
        $('#f-ayuda-otro').textContent = v === 'cashback' ? 'Anótalo cuando DiDi te deposite el cashback.'
          : v === 'ajuste' ? 'Usa esto para poner el dinero que ya tenías en débito al empezar. Escribe un signo menos (−) si hay que restar.'
          : 'Si la tarjeta ya tenía deuda al empezar a usar Caudal, ponla aquí.';
      };
      $('#f-clase', cuerpo).addEventListener('change', ayudar); ayudar();
    }
    $('#hoja-titulo').textContent = titulo;
    $('#hoja-guardar').textContent = 'Guardar';
    $('#hoja-guardar').disabled = false;
    var dlg = $('#hoja');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    if (!mov) setTimeout(function () { var m = $('#f-monto'); if (m) m.focus(); }, 80);
  }

  function cerrarForm() { var d = $('#hoja'); if (d.close) d.close(); else d.removeAttribute('open'); formActual = null; }

  function valorDe(n) { var el = $('#f-' + n); return el ? el.value.trim() : ''; }

  async function enviarForm(ev) {
    ev.preventDefault();
    if (!formActual) return;
    var tipo = formActual.tipo, mov = { monto: valorDe('monto'), fecha: valorDe('fecha'), descripcion: valorDe('descripcion') };
    if (tipo === 'compra') { mov.tipo = 'compra'; mov.medio = valorDe('medio'); mov.categoria = valorDe('categoria'); }
    else if (tipo === 'deposito') { mov.tipo = 'deposito'; mov.nuevo_periodo = valorDe('nuevo_periodo') === 'si'; }
    else if (tipo === 'pago_tarjeta') { mov.tipo = 'pago_tarjeta'; }
    else {
      var clase = valorDe('clase');
      mov.tipo = clase === 'cashback' ? 'cashback' : 'ajuste';
      mov.medio = clase === 'deuda' ? 'credito' : 'debito';
      if (clase === 'ajuste' && /^[-−–]/.test(mov.monto)) mov.monto = '-' + mov.monto.replace(/^[-−–]\s*/, '');
    }
    var n = cdLeerMonto(mov.monto);
    if (!(n > 0)) { mostrarErrorForm('Escribe cuánto fue.'); return; }
    if (n > 1000000) { mostrarErrorForm('Ese monto parece demasiado grande. Revísalo.'); return; }
    var btn = $('#hoja-guardar'); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      var editando = formActual.mov;
      var res = editando ? await llamar('editar', { id: editando.id, mov: mov }) : await llamar('agregar', { mov: mov });
      recibir(res);
      cerrarForm();
      avisar(res.mensaje || (editando ? 'Cambios guardados ✓' : 'Guardado ✓'), 4500);
    } catch (e) {
      mostrarErrorForm(e.message);
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  }
  function mostrarErrorForm(t) { var e = $('#hoja-error'); e.textContent = t; e.hidden = false; }

  var borrarArmado = false;
  async function borrarMov() {
    var b = $('#hoja-borrar');
    if (!borrarArmado) { borrarArmado = true; b.textContent = 'Toca otra vez para confirmar'; setTimeout(function () { borrarArmado = false; b.textContent = 'Borrar este movimiento'; }, 4000); return; }
    borrarArmado = false;
    b.disabled = true; b.textContent = 'Borrando…';
    try { recibir(await llamar('borrar', { id: formActual.mov.id })); cerrarForm(); avisar('Borrado'); }
    catch (e) { mostrarErrorForm(e.message); }
    b.disabled = false; b.textContent = 'Borrar este movimiento';
  }

  /* ===================== flujo ===================== */

  function recibir(res) {
    estado = { resumen: res.resumen, movimientos: res.movimientos, config: res.config, campos: res.campos, _recibido: new Date().toISOString() };
    if (!conexion().demo) guardar(LS.estado, JSON.stringify(estado));
    $('#banda-estado').hidden = true;
    pintar();
  }

  async function actualizar(silencioso) {
    if (cargando) return;
    cargando = true;
    $('#btn-actualizar').classList.add('girando');
    try { recibir(await llamar('estado')); }
    catch (e) {
      var banda = $('#banda-estado');
      banda.textContent = (estado ? 'Mostrando datos guardados. ' : '') + e.message;
      banda.hidden = false;
      if (!silencioso) avisar(e.message);
    } finally {
      cargando = false;
      $('#btn-actualizar').classList.remove('girando');
    }
  }

  function mostrarVista(v) {
    ['inicio', 'movimientos', 'ajustes'].forEach(function (x) { $('#vista-' + x).hidden = x !== v; });
    $$('.barra-btn').forEach(function (b) { b.classList.toggle('activo', b.dataset.vista === v); b.setAttribute('aria-current', b.dataset.vista === v ? 'page' : 'false'); });
    window.scrollTo(0, 0);
  }

  function mostrarConectar() { $('#app').hidden = true; $('#conectar').hidden = false; }

  function iniciarApp() {
    $('#conectar').hidden = true; $('#app').hidden = false;
    var c = conexion();
    $('#info-conexion').textContent = c.demo ? 'Modo demostración (datos de ejemplo guardados solo en este teléfono).' : 'Conectado a la hoja de Google. Clave: ' + c.clave.slice(0, 4) + '••••';
    if (!c.demo) {
      var g = leer(LS.estado);
      if (g) try { estado = JSON.parse(g); pintar(); } catch (e) {}
    }
    actualizar(!!estado);
  }

  function enlaceParaCompartir() {
    var c = conexion();
    return location.origin + location.pathname + '#api=' + encodeURIComponent(c.api) + '&clave=' + encodeURIComponent(c.clave);
  }

  function arrancar() {
    // ¿Viene un enlace en la dirección?
    var datos = leerEnlace(location.href);
    if (datos && aplicarEnlace(datos)) history.replaceState(null, '', location.pathname);

    $('#form-conectar').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var texto = $('#enlace').value.trim();
      var d = leerEnlace(texto) || (texto && window.CAUDAL_API && texto.indexOf('http') !== 0 ? { api: window.CAUDAL_API, clave: texto } : null);
      if (!aplicarEnlace(d)) { var e = $('#conectar-error'); e.textContent = 'Ese enlace no parece correcto. Pide que te lo manden otra vez.'; e.hidden = false; return; }
      iniciarApp();
    });
    $('#btn-demo').addEventListener('click', function () { guardar(LS.demo, '1'); iniciarApp(); });
    $('#salir-demo').addEventListener('click', function () { guardar(LS.demo, null); guardar(LS.demoDatos, null); estado = null; if (conexion().clave) iniciarApp(); else mostrarConectar(); });

    $$('[data-form]').forEach(function (b) { b.addEventListener('click', function () { if (estado) abrirForm(b.dataset.form); }); });
    $$('.barra-btn').forEach(function (b) { b.addEventListener('click', function () { mostrarVista(b.dataset.vista); }); });
    $$('[data-filtro]').forEach(function (b) {
      b.addEventListener('click', function () {
        filtro = b.dataset.filtro;
        $$('[data-filtro]').forEach(function (x) { x.classList.toggle('activo', x === b); });
        pintarMovimientos();
      });
    });
    $('#btn-actualizar').addEventListener('click', function () { actualizar(false); });
    $('#form-mov').addEventListener('submit', enviarForm);
    $('#hoja-cerrar').addEventListener('click', cerrarForm);
    $('#hoja-borrar').addEventListener('click', borrarMov);
    $('#hoja').addEventListener('click', function (ev) { if (ev.target === ev.currentTarget) cerrarForm(); });
    $('#form-config').addEventListener('submit', function (ev) { guardarConfig(ev).catch(function () {}); });
    $('#btn-desconectar').addEventListener('click', function () {
      var b = this;
      if (b.dataset.armado !== '1') { b.dataset.armado = '1'; b.textContent = 'Toca otra vez para desconectar'; return; }
      [LS.api, LS.clave, LS.estado, LS.demo, LS.demoDatos].forEach(function (k) { guardar(k, null); });
      location.reload();
    });
    $('#btn-copiar-enlace').addEventListener('click', async function () {
      if (conexion().demo) { avisar('En modo demostración no hay enlace.'); return; }
      var enlace = enlaceParaCompartir();
      try {
        if (navigator.share) await navigator.share({ title: 'Caudal', url: enlace });
        else { await navigator.clipboard.writeText(enlace); avisar('Enlace copiado'); }
      } catch (e) { /* cancelado */ }
    });

    // Al volver a la app, actualizar.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && !$('#app').hidden) actualizar(true);
    });

    var c = conexion();
    if (c.demo || (c.api && c.clave)) iniciarApp(); else mostrarConectar();

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  arrancar();
})();
