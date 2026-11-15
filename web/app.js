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
  function ico(nombre, clase) { return '<svg class="ico ' + (clase || '') + '" aria-hidden="true"><use href="#i-' + nombre + '"/></svg>'; }
  function pesosSinCentavos(n) { var s = cdPesos(n); return s.slice(-3) === '.00' ? s.slice(0, -3) : s; }
  function fecha(f, conDia) { return cdFechaBonita(f, conDia); }
  function sinMovimiento() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  /** "$1,234<small>.56</small>" con signo de menos tipográfico. */
  function montoHtml(n, conSigno) {
    var s = cdPesos(Math.abs(n)), i = s.lastIndexOf('.');
    return (n < 0 ? '−' : '') + (conSigno ? '<span class="signo">$</span>' : '$') + s.slice(1, i) + '<span class="cent">' + s.slice(i) + '</span>';
  }

  /** Cuenta hacia el número nuevo (como en Wallet). */
  function animarMonto(el, valor, conSigno) {
    var desde = typeof el._v === 'number' ? el._v : (valor > 0 ? 0 : valor);
    el._v = valor;
    if (desde === valor || sinMovimiento()) { el.innerHTML = montoHtml(valor, conSigno); return; }
    var t0 = performance.now(), dur = 750;
    cancelAnimationFrame(el._raf);
    (function paso(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.innerHTML = montoHtml(cdRedondear(desde + (valor - desde) * e), conSigno);
      if (k < 1) el._raf = requestAnimationFrame(paso);
    })(t0);
  }

  /** "semana", "quincena", "mes" o "periodo" según cada cuántos días recibe dinero. */
  function nombrePeriodo() {
    var d = Number(estado && estado.config.periodo_dias);
    return d === 7 ? 'semana' : (d === 14 || d === 15) ? 'quincena' : (d >= 28 && d <= 31) ? 'mes' : 'periodo';
  }
  function estePeriodo() { var n = nombrePeriodo(); return (n === 'semana' || n === 'quincena' ? 'Esta ' : 'Este ') + n; }
  /** Fecha límite del pago que sigue (el del próximo corte). */
  function limiteSiguiente(r) { return cdLimiteDe(r.tarjeta.siguiente_corte, cdNormalizarConfig(estado.config)); }

  var CAT_ICONOS = { super: 'basket', 'súper': 'basket', supermercado: 'basket', farmacia: 'pill', mercado: 'leaf', comida: 'fork', restaurante: 'fork', casa: 'house', hogar: 'house' };
  function icoCategoria(c) { return CAT_ICONOS[String(c || '').trim().toLowerCase()] || 'tag'; }

  var bannerTimer;
  function avisar(texto, ms, tipo) {
    var b = $('#toast');
    $('#toast-txt').textContent = texto;
    b.classList.toggle('error', tipo === 'error');
    $('#toast-ico').innerHTML = ico(tipo === 'error' ? 'warn' : 'check');
    b.hidden = false;
    void b.offsetWidth;
    b.classList.add('visible');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () {
      b.classList.remove('visible');
      bannerTimer = setTimeout(function () { b.hidden = true; }, 500);
    }, ms || 3500);
  }

  function hace(fechaIso) {
    if (!fechaIso) return '';
    var s = Math.round((Date.now() - new Date(fechaIso).getTime()) / 1000);
    if (s < 60) return 'hace un momento';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
    return 'hace ' + Math.round(s / 86400) + ' días';
  }

  /* ===================== inicio ===================== */

  var vistaActual = 'inicio';

  function tituloVista() {
    if (vistaActual === 'inicio') return estado && estado.config.nombre ? 'Hola, ' + estado.config.nombre : 'Hola';
    return $('#vista-' + vistaActual).dataset.titulo;
  }
  function ponerTitulo() {
    var t = tituloVista();
    $('#titulo-vista').textContent = t;
    $('#barra-mini').textContent = t;
  }

  function pintarEsqueleto() {
    var barra = function (w, alto) { return '<span class="esqueleto" style="display:block;width:' + w + ';height:' + (alto || 14) + 'px;margin:8px 0"></span>'; };
    $('#tarjeta-credito').innerHTML = barra('45%') + barra('60%', 36) + barra('80%');
    $('#mosaico-debito').innerHTML = barra('40%', 30) + barra('70%') + barra('55%', 22);
    $('#mosaico-cashback').innerHTML = barra('40%', 30) + barra('70%') + barra('55%', 22);
  }

  function pintar() {
    if (!estado) return;
    var r = estado.resumen, cfg = estado.config;
    var vacio = !estado.movimientos.length;

    $('#fecha-hoy').textContent = fecha(r.hoy);
    ponerTitulo();
    $('#banda-demo').hidden = !conexion().demo;

    pintarHeroe(r, vacio);
    pintarAvisos(r, vacio);
    pintarBienvenida(vacio);
    ['#tarjeta-credito', '.duo', '#grupo-periodo', '#grupo-recientes'].forEach(function (s) { $(s).hidden = vacio; });
    if (!vacio) {
      pintarTarjeta(r, cfg);
      pintarMosaicos(r, cfg);
      pintarPeriodo(r, cfg);
      pintarRecientes();
    }
    pintarRevisar();
    if (!vacio) {
    }
    $('#actualizado').textContent = estado._recibido ? 'Actualizado ' + hace(estado._recibido) : '';

    pintarMovimientos();
    pintarConfig();
  }

  function pintarHeroe(r, vacio) {
    var heroe = $('#heroe');
    var est = vacio ? 'bien' : r.estado_libre;
    heroe.classList.toggle('bajo', est === 'bajo');
    heroe.classList.toggle('negativo', est === 'negativo');
    $('#heroe-estado').textContent = vacio ? 'Sin datos' : est === 'negativo' ? 'Te pasaste' : est === 'bajo' ? 'Queda poco' : 'Vas bien';
    animarMonto($('#libre-monto'), r.libre, true);

    var p = r.periodo, sub;
    if (vacio) sub = 'Anota el dinero que tienes y aquí verás cuánto puedes gastar.';
    else if (r.libre < 0) sub = 'Gastaste <b>' + cdPesos(-r.libre) + '</b> más de lo que recibiste.';
    else if (p && p.por_dia != null) sub = 'Unos <b>' + pesosSinCentavos(p.por_dia) + ' al día</b> por ' + p.dias_restantes + (p.dias_restantes === 1 ? ' día más.' : ' días más.');
    else if (p) sub = 'Llevas <b>' + pesosSinCentavos(p.gastado) + '</b> gastado en este periodo.';
    else sub = 'Lo que recibiste menos lo que ya gastaste.';
    $('#libre-sub').innerHTML = sub;

    var barra = $('#heroe-barra');
    // Lo que tenía para gastar en el periodo = lo ya gastado + lo que queda libre.
    var total = p ? p.gastado + Math.max(0, r.libre) : 0;
    barra.hidden = vacio || !p || total <= 0;
    if (!barra.hidden) {
      var pct = Math.min(100, Math.round(p.gastado / total * 100));
      requestAnimationFrame(function () { $('#heroe-barra-relleno').style.width = pct + '%'; });
      $('#heroe-gastado').textContent = 'Gastado ' + pesosSinCentavos(p.gastado);
      $('#heroe-recibido').textContent = 'de ' + pesosSinCentavos(total);
    }
  }

  function pintarAvisos(r, vacio) {
    var ul = $('#avisos'); ul.innerHTML = '';
    if (vacio) return;
    r.avisos.forEach(function (a) {
      // La tarjeta Libre y la de crédito ya dicen esto; aquí solo lo urgente.
      if (a.clave === 'libre_bajo' || (a.clave === 'pago_pendiente' && a.nivel === 'info')) return;
      var icono = a.nivel === 'info' ? (a.clave === 'tope_cashback' ? 'sparkle' : 'calendar') : 'warn';
      ul.appendChild(h('li', { class: 'aviso aviso-' + a.nivel, html: '<span class="aviso-ico">' + ico(icono) + '</span><span>' + esc(a.texto) + '</span>' }));
    });
  }

  function pintarBienvenida(vacio) {
    var caja = $('#bienvenida');
    caja.hidden = !vacio;
    if (!vacio) return;
    caja.className = 'bienvenida';
    caja.innerHTML = '';
    caja.appendChild(h('h2', { text: 'Empecemos' }));
    caja.appendChild(h('p', { text: 'Tres pasos y Caudal sabrá cuánto tienes libre.' }));
    [
      { t: 'Anota lo que tienes en débito', s: 'El saldo de hoy en DiDi débito', fn: function () { abrirForm('otro', null, { clase: 'ajuste' }); } },
      { t: '¿La tarjeta ya debe algo?', s: 'Anota la deuda que ya traía', fn: function () { abrirForm('otro', null, { clase: 'deuda' }); } },
      { t: 'Revisa los datos de tu tarjeta', s: 'Día de corte, día límite y cashback', fn: function () { mostrarVista('ajustes'); } }
    ].forEach(function (p, i) {
      caja.appendChild(h('button', { class: 'paso', type: 'button', onclick: p.fn, html:
        '<span class="paso-num">' + (i + 1) + '</span><span class="paso-txt"><b>' + esc(p.t) + '</b><small>' + esc(p.s) + '</small></span>' + ico('chevron') }));
    });
  }

  function pintarTarjeta(r, cfg) {
    var t = r.tarjeta, html;
    html = '<div class="tc-top"><span class="tc-nombre"><span class="tc-chip" aria-hidden="true"></span>Tarjeta de crédito</span>' +
      (Number(cfg.cashback_pct) ? '<span class="tc-cb">' + esc(cfg.cashback_pct) + '% cashback</span>' : '') + '</div>';
    if (t.por_pagar > 0) {
      var vencido = t.estado === 'vencido', d = t.dias_para_pagar;
      var clase = vencido || d <= 1 ? 'urgente' : d <= 5 ? 'pronto' : '';
      var dias = vencido ? '<b>Vencido</b>' : d === 0 ? '<b>Hoy</b>' : d === 1 ? '<b>Mañana</b>' : 'Faltan <b>' + d + '</b> días';
      html += '<p class="tc-etq">' + (vencido ? 'Pago vencido' : 'Toca pagar') + '</p>' +
        '<p class="tc-monto num">' + montoHtml(t.por_pagar) + '</p>' +
        '<div class="tc-plazo"><span>' + (vencido ? 'Era el ' : 'Antes del ') + esc(fecha(t.fecha_limite)) + '</span><span class="tc-dias ' + clase + '">' + dias + '</span></div>';
    } else {
      if (r.deuda_tarjeta > 0) {
        // Nada vencido, pero lo comprado desde el corte se pagará en el siguiente estado de cuenta.
        var lim = limiteSiguiente(r), faltan = cdDiasEntre(r.hoy, lim);
        html += '<p class="tc-etq">Próximo pago · nada pendiente hoy</p><p class="tc-monto num">' + montoHtml(r.deuda_tarjeta) + '</p>' +
          '<div class="tc-plazo"><span>Corta el ' + esc(fecha(t.siguiente_corte, false)) + ' · pagar antes del ' + esc(fecha(lim, false)) + '</span><span class="tc-dias">Faltan <b>' + faltan + '</b> días</span></div>';
      } else {
        html += '<p class="tc-etq">Tarjeta</p><p class="tc-monto ok">' + ico('check') + 'Sin deuda</p>' +
          '<div class="tc-plazo"><span>Próximo corte: ' + esc(fecha(t.siguiente_corte)) + '</span></div>';
      }
    }
    var limite = Number(cfg.limite_credito);
    if (r.credito_disponible != null && limite > 0) {
      var uso = Math.min(100, Math.max(0, Math.round(r.deuda_tarjeta / limite * 100)));
      html += '<div class="tc-uso"><div class="tc-uso-pista"><div class="tc-uso-relleno" data-w="' + uso + '"></div></div>' +
        '<div class="tc-uso-leyenda"><span>Usado ' + pesosSinCentavos(r.deuda_tarjeta) + '</span><span>Disponible ' + pesosSinCentavos(r.credito_disponible) + '</span></div></div>';
    }
    var dato = function (a, b) { return '<div class="tc-dato"><small>' + a + '</small><b>' + b + '</b></div>'; };
    html += '<div class="tc-datos">' + dato('Desde el corte', pesosSinCentavos(t.compras_ciclo_actual)) + dato('Deuda total', pesosSinCentavos(r.deuda_tarjeta)) +
      dato('Corte', 'Día ' + esc(cfg.dia_corte)) + '</div>';
    var el = $('#tarjeta-credito');
    el.innerHTML = html;
    requestAnimationFrame(function () { $$('[data-w]', el).forEach(function (b) { b.style.width = b.dataset.w + '%'; }); });
  }

  function pintarMosaicos(r, cfg) {
    var t = r.tarjeta, html;
    // Débito
    html = '<span class="mosaico-ico">' + ico('wallet') + '</span><p class="mosaico-etq">Deberías ver en DiDi débito</p><p class="mosaico-monto num">' + montoHtml(r.saldo_debito) + '</p>';
    if (r.deuda_tarjeta > 0 && r.saldo_debito > 0) {
      var parte = Math.min(100, Math.round(r.deuda_tarjeta / r.saldo_debito * 100));
      html += '<div class="mini-pista" aria-hidden="true"><span style="width:' + parte + '%;background:var(--amber)"></span><span style="width:' + (100 - parte) + '%;background:var(--mint)"></span></div>';
    }
    if (t.por_pagar > 0 && !t.alcanza_en_debito) html += '<p class="mosaico-nota mal">Faltan <b>' + cdPesos(t.falta_en_debito) + '</b> para pagar la tarjeta</p>';
    else if (r.deuda_tarjeta > 0) html += '<p class="mosaico-nota"><b>' + pesosSinCentavos(Math.min(r.deuda_tarjeta, Math.max(0, r.saldo_debito))) + '</b> es para la tarjeta</p>';
    else html += '<p class="mosaico-nota">Nada apartado para la tarjeta</p>';
    var deb = $('#mosaico-debito'); deb.className = 'mosaico debito'; deb.innerHTML = html;

    // Cashback
    var cb = r.cashback;
    html = '<span class="mosaico-ico">' + ico('sparkle') + '</span><p class="mosaico-etq">Cashback ' + (cfg.cashback_periodo === 'corte' ? 'desde el corte' : 'este mes') + '</p>' +
      '<p class="mosaico-monto num">' + montoHtml(cb.estimado) + '</p>';
    if (cb.tope != null && cb.tope > 0) {
      html += '<div class="mini-pista" aria-hidden="true"><span style="width:' + Math.min(100, Math.round(cb.estimado / cb.tope * 100)) + '%;background:var(--lime)"></span></div>';
      html += '<p class="mosaico-nota">' + (cb.tope_alcanzado ? 'Llegaste al tope' : 'Tope de ' + pesosSinCentavos(cb.tope)) + '</p>';
    } else {
      html += '<p class="mosaico-nota">' + esc(cb.porcentaje) + '% en ' + esc(cdLista(cfg.categorias_cashback).join(', ') || 'compras') + ' con tarjeta</p>';
    }
    var cbx = $('#mosaico-cashback'); cbx.className = 'mosaico cashback'; cbx.innerHTML = html;
  }

  function pintarPeriodo(r, cfg) {
    var g = $('#grupo-periodo'), p = r.periodo;
    g.innerHTML = '';
    g.appendChild(h('div', { class: 'grupo-cabeza' }, [h('h2', { class: 'grupo-titulo', text: estePeriodo() })]));
    if (!p) {
      g.appendChild(h('div', { class: 'lista-ios texto-ios', html: '<p>Cuando anotes <b>Recibí dinero</b> como dinero de la ' + esc(nombrePeriodo()) + ', aquí verás cuánto llevas gastado y cuánto te alcanza por día.</p>' }));
      return;
    }
    g.appendChild(h('p', { class: 'grupo-sub', text: 'Desde el ' + fecha(p.inicio, false) + (p.fin_estimado ? ' · termina el ' + fecha(p.fin_estimado, false) + ' aprox.' : '') }));
    var fila = function (a, b, clase, claseValor) { return '<div class="fila ' + (clase || '') + '"><span class="fila-txt">' + a + '</span><span class="fila-valor num ' + (claseValor || '') + '">' + b + '</span></div>'; };
    var html = '';
    // Se lee de arriba abajo y suma exactamente el Libre de la tarjeta grande.
    var signo = function (n) { return (n < 0 ? '− ' : '+ ') + cdPesos(Math.abs(n)); };
    if (p.sobrante_anterior !== 0) html += fila(p.sobrante_anterior > 0 ? 'Sobró de antes' : 'Faltó de antes', signo(p.sobrante_anterior));
    html += fila('Recibiste', signo(p.recibido));
    html += fila('Gastaste', signo(-p.gastado));
    if (p.gastado_credito && p.gastado_debito) {
      html += fila('Con tarjeta', cdPesos(p.gastado_credito), 'fila-sangria');
      html += fila('Con débito', cdPesos(p.gastado_debito), 'fila-sangria');
    }
    if (p.otros) html += fila(p.otros < 0 ? 'Deudas y ajustes' : 'Cashback y ajustes', signo(p.otros));
    html += fila('<b>Te queda libre</b>', '<b>' + cdPesos(r.libre) + '</b>', 'fila-total', 'fuerte');
    g.appendChild(h('div', { class: 'lista-ios', html: html }));

    var cats = Object.keys(p.por_categoria).sort(function (a, b) { return p.por_categoria[b] - p.por_categoria[a]; });
    if (cats.length) {
      var max = p.por_categoria[cats[0]], conCb = cdLista(cfg.categorias_cashback);
      var lista = h('div', { class: 'lista-ios cats', style: 'margin-top:12px' });
      cats.forEach(function (c) {
        lista.appendChild(h('div', { class: 'cat' + (conCb.indexOf(c) >= 0 ? ' con-cb' : ''), html:
          '<span class="cat-ico">' + ico(icoCategoria(c)) + '</span>' +
          '<div class="cat-linea"><span>' + esc(c) + '</span><span>' + cdPesos(p.por_categoria[c]) + '</span></div>' +
          '<div class="cat-pista"><div class="cat-relleno" data-w="' + Math.max(3, Math.round(p.por_categoria[c] / max * 100)) + '"></div></div>' }));
      });
      g.appendChild(lista);
      requestAnimationFrame(function () { $$('[data-w]', lista).forEach(function (b) { b.style.width = b.dataset.w + '%'; }); });
    }
  }

  /** Compras que entraron por el ícono Anotar y aún no tienen categoría elegida. */
  function porRevisar() {
    return estado.movimientos.filter(function (m) { return m.tipo === 'compra' && m.origen === 'atajo' && !String(m.descripcion || '').trim(); });
  }

  function pintarRevisar() {
    var g = $('#grupo-revisar'), lista = porRevisar().slice(0, 5);
    g.hidden = !lista.length;
    g.innerHTML = '';
    if (!lista.length) return;
    g.appendChild(h('div', { class: 'grupo-cabeza' }, [h('h2', { class: 'grupo-titulo', text: '¿En qué fue?' })]));
    g.appendChild(h('p', { class: 'grupo-sub', text: 'Compras anotadas rápido. Toca la categoría para acomodarlas.' }));
    var caja = h('div', { class: 'lista-ios' });
    lista.forEach(function (m) {
      var fila = h('div', { class: 'revisar' });
      fila.appendChild(h('div', { class: 'revisar-top', html: '<span>' + esc(diaCorto(m.fecha)) + ' · ' + (m.medio === 'debito' ? 'Débito' : 'Tarjeta') + '</span><b class="num">' + cdPesos(m.monto) + '</b>' }));
      var chips = h('div', { class: 'chips' });
      cdLista(estado.config.categorias).forEach(function (c) {
        chips.appendChild(h('button', { type: 'button', class: 'chip', html: ico(icoCategoria(c)) + esc(c), onclick: async function () {
          fila.classList.add('guardando');
          try {
            recibir(await llamar('editar', { id: m.id, mov: { tipo: 'compra', medio: m.medio, monto: m.monto, fecha: m.fecha, categoria: c, descripcion: c } }));
            avisar(cdPesos(m.monto) + ' en ' + c);
          } catch (e) { fila.classList.remove('guardando'); avisar(e.message, 4000, 'error'); }
        } }));
      });
      fila.appendChild(chips);
      caja.appendChild(fila);
    });
    g.appendChild(caja);
  }

  function pintarRecientes() {
    var g = $('#grupo-recientes');
    g.innerHTML = '';
    g.appendChild(h('div', { class: 'grupo-cabeza' }, [
      h('h2', { class: 'grupo-titulo', text: 'Recientes' }),
      h('button', { class: 'grupo-link', type: 'button', text: 'Ver todo', onclick: function () { mostrarVista('movimientos'); } })
    ]));
    var lista = h('div', { class: 'lista-ios' });
    estado.movimientos.slice(0, 4).forEach(function (m) { lista.appendChild(filaMov(m, true)); });
    g.appendChild(lista);
  }

  /* ===================== movimientos ===================== */

  function nombreMov(m) {
    if (m.tipo === 'compra') return m.descripcion || m.categoria || 'Compra';
    if (m.tipo === 'deposito') return m.descripcion || 'Dinero recibido';
    if (m.tipo === 'pago_tarjeta') return 'Pago a la tarjeta';
    if (m.tipo === 'cashback') return 'Cashback';
    return m.descripcion || (m.medio === 'credito' ? 'Deuda anterior' : 'Ajuste de saldo');
  }
  function detalleMov(m, conFecha) {
    var d;
    if (m.tipo === 'compra') d = (m.medio === 'debito' ? 'Débito' : 'Tarjeta') + (m.categoria && m.descripcion && m.descripcion !== m.categoria ? ' · ' + m.categoria : '') + (m.cashback === 'si' ? ' · con cashback' : '') + (m.origen === 'wallet' ? ' · automático' : m.origen === 'atajo' ? ' · rápido' : '');
    else if (m.tipo === 'deposito') d = m.nuevo_periodo ? 'Empieza periodo' : 'Dinero extra';
    else if (m.tipo === 'pago_tarjeta') d = 'De débito a la tarjeta';
    else if (m.tipo === 'cashback') d = 'Regreso de la tarjeta';
    else d = m.medio === 'credito' ? 'Deuda de la tarjeta' : 'Débito';
    return conFecha ? diaCorto(m.fecha) + ' · ' + d : d;
  }
  function diaCorto(f) {
    var hoy = estado.resumen.hoy;
    if (f === hoy) return 'Hoy';
    if (f === cdSumarDias(hoy, -1)) return 'Ayer';
    return fecha(f, false);
  }
  function icoMov(m) {
    if (m.tipo === 'compra') return icoCategoria(m.categoria);
    return { deposito: 'arrow-down', pago_tarjeta: 'card', cashback: 'sparkle', ajuste: 'pencil' }[m.tipo] || 'tag';
  }
  function formDeMov(m) { return m.tipo === 'pago_tarjeta' ? 'pago_tarjeta' : (m.tipo === 'cashback' || m.tipo === 'ajuste') ? 'otro' : m.tipo; }

  function filaMov(m, conFecha) {
    var efecto = cdEfecto(m, estado.config).libre;
    var signo = efecto > 0 ? '+' : efecto < 0 ? '−' : '';
    var clase = efecto > 0 ? ' mas' : efecto === 0 ? ' neutro' : '';
    return h('button', { class: 'mov', type: 'button', onclick: function () { abrirForm(formDeMov(m), m); }, html:
      '<span class="mov-ico t-' + m.tipo + (m.medio === 'debito' ? ' debito' : '') + '">' + ico(icoMov(m)) + '</span>' +
      '<span class="mov-txt"><b>' + esc(nombreMov(m)) + '</b><small>' + esc(detalleMov(m, conFecha)) + '</small></span>' +
      '<span class="mov-monto' + clase + '">' + signo + cdPesos(Math.abs(m.monto)) + '</span>' });
  }

  function pintarMovimientos() {
    var cont = $('#lista-movs'); cont.innerHTML = '';
    var movs = estado.movimientos.filter(function (m) { return filtro === 'todos' || m.tipo === filtro; });
    if (!movs.length) {
      cont.appendChild(h('div', { class: 'vacio', html: ico('list') + '<b>Sin movimientos</b>Lo que anotes aparecerá aquí.' }));
      return;
    }
    var porDia = {}, orden = [];
    movs.forEach(function (m) { if (!porDia[m.fecha]) { porDia[m.fecha] = []; orden.push(m.fecha); } porDia[m.fecha].push(m); });
    orden.forEach(function (f) {
      var gasto = porDia[f].reduce(function (s, m) { return s + (m.tipo === 'compra' ? Number(m.monto) || 0 : 0); }, 0);
      var titulo = diaCorto(f);
      if (titulo !== 'Hoy' && titulo !== 'Ayer') titulo = fecha(f);
      titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
      var lista = h('div', { class: 'lista-ios' });
      porDia[f].forEach(function (m) { lista.appendChild(filaMov(m, false)); });
      cont.appendChild(h('section', { class: 'dia' }, [
        h('h3', { class: 'dia-titulo', html: '<span>' + esc(titulo) + '</span><span>' + (gasto ? 'Gastado ' + cdPesos(gasto) : '') + '</span>' }),
        lista
      ]));
    });
  }

  /* ===================== ajustes ===================== */

  var SECCIONES_CFG = [
    { t: 'Tú', c: ['nombre'] },
    { t: 'Tarjeta de crédito', c: ['dia_corte', 'dia_limite', 'dias_para_pagar', 'limite_credito'], pie: 'Los encuentras en el estado de cuenta de DiDi.' },
    { t: 'Cashback', c: ['cashback_pct', 'cashback_tope', 'cashback_periodo', 'cashback_destino', 'categorias_cashback'] },
    { t: 'Compras', c: ['categorias', 'categoria_default'] },
    { t: 'Dinero que recibes', c: ['monto_periodo', 'periodo_dias'] },
    { t: 'Recordatorios', c: ['aviso_libre_bajo', 'avisos_dias_antes', 'avisos_correo'], pie: 'Los correos salen cada mañana a las 8 solo si hay algo que recordar.' },
    { t: 'Avanzado', c: ['url_app'] }
  ];
  var CAMPOS_ANCHOS = { categorias: 1, categorias_cashback: 1, avisos_correo: 1, url_app: 1 };
  var ETQ_OPCION = { mes: 'Mes', corte: 'Corte', tarjeta: 'Tarjeta', debito: 'Débito' };

  function segmentado(id, lista, valor, alCambiar) {
    var oculto = h('input', { type: 'hidden', id: id, value: valor });
    var cont = h('div', { class: 'segmentado', role: 'radiogroup' });
    lista.forEach(function (o) {
      var b = h('button', { type: 'button', class: 'segmento' + (o.v === valor ? ' activo' : ''), role: 'radio', 'aria-checked': o.v === valor ? 'true' : 'false', text: o.t });
      b.addEventListener('click', function () {
        if (oculto.value === o.v) return;
        oculto.value = o.v;
        $$('.segmento', cont).forEach(function (x) { var on = x === b; x.classList.toggle('activo', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
        oculto.dispatchEvent(new Event('change', { bubbles: true }));
        if (alCambiar) alCambiar(o.v);
      });
      cont.appendChild(b);
    });
    cont.appendChild(oculto);
    return cont;
  }

  function pintarConfig() {
    var f = $('#form-config');
    if (f.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // no borrar lo que se está escribiendo
    f.innerHTML = '';
    var campos = estado.campos || CAUDAL_CONFIG, porClave = {};
    campos.forEach(function (c) { porClave[c[0]] = c; });
    var usados = {};
    var secciones = SECCIONES_CFG.map(function (s) { return { t: s.t, pie: s.pie, c: s.c.filter(function (k) { usados[k] = 1; return porClave[k]; }) }; });
    campos.forEach(function (c) { if (!usados[c[0]]) secciones[secciones.length - 1].c.push(c[0]); });

    secciones.forEach(function (s) {
      if (!s.c.length) return;
      var lista = h('div', { class: 'lista-ios' });
      s.c.forEach(function (clave) {
        var c = porClave[clave], tipo = c[2], valor = estado.config[clave], id = 'cfg-' + clave, control;
        valor = valor === '' || valor == null ? '' : String(valor);
        if (tipo.indexOf('opcion:') === 0) {
          control = segmentado(id, tipo.slice(7).split(',').map(function (o) { return { v: o, t: ETQ_OPCION[o] || o }; }), valor);
        } else {
          control = h('input', { id: id, name: clave, value: valor, type: 'text', autocomplete: 'off', autocapitalize: tipo === 'numero' || clave === 'avisos_correo' || clave === 'url_app' ? 'off' : 'sentences',
            inputmode: tipo === 'numero' ? 'decimal' : clave === 'avisos_correo' ? 'email' : clave === 'url_app' ? 'url' : null,
            placeholder: tipo === 'numero' ? '—' : '' });
        }
        lista.appendChild(h('div', { class: 'fila campo-fila' + (CAMPOS_ANCHOS[clave] ? ' campo-ancho' : '') }, [
          h('label', { for: id, html: '<b>' + esc(c[3]) + '</b><small>' + esc(c[4]) + '</small>' }), control
        ]));
      });
      f.appendChild(h('section', { class: 'grupo' }, [h('h2', { class: 'grupo-etq', text: s.t }), lista, s.pie ? h('p', { class: 'grupo-pie', text: s.pie }) : null]));
    });
    var bg = $('#btn-guardar-cfg'); bg.classList.remove('visible'); bg.disabled = false; bg.textContent = 'Guardar cambios';
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
        if (isNaN(n)) { avisar('Revisa: ' + c[3], 3500, 'error'); throw new Error('número inválido'); }
        v = n;
      }
      valores[c[0]] = v;
    });
    var dc = Number(valores.dia_corte), dl = Number(valores.dia_limite);
    if (!(dc >= 1 && dc <= 31)) { avisar('El día de corte debe ser entre 1 y 31', 3500, 'error'); return; }
    if (valores.dia_limite !== '' && !(dl >= 1 && dl <= 31)) { avisar('El día límite debe ser entre 1 y 31', 3500, 'error'); return; }
    var btn = $('#btn-guardar-cfg');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      if (document.activeElement) document.activeElement.blur();
      recibir(await llamar('config', { valores: valores }));
      avisar('Ajustes guardados');
    } catch (e) { avisar(e.message, 4000, 'error'); btn.disabled = false; btn.textContent = 'Guardar cambios'; }
  }

  /* ===================== hoja para anotar ===================== */

  var formActual = null;      // {tipo, mov}
  var teclado = { txt: '', negativo: false };

  function montoATexto(n) {
    n = Math.abs(cdRedondear(n));
    if (!(n > 0)) return '';
    return n % 1 === 0 ? String(n) : n.toFixed(2);
  }

  function pintarMonto() {
    var t = teclado.txt, p = t.split('.');
    var ent = (p[0] || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var el = $('#monto-vista');
    if (!el) return;
    el.innerHTML = '<span class="m-signo">' + (teclado.negativo ? '−$' : '$') + '</span><span class="m-num">' + ent + '</span>' +
      (p.length > 1 ? '<span class="m-dec">.' + p[1] + '</span>' : '') + '<span class="cursor"></span>';
    el.classList.toggle('vacio-monto', !t);
    el.setAttribute('aria-label', 'Monto: ' + (t ? cdPesos(Number(t)) : 'vacío'));
    actualizarNota();
  }

  function sacudir() {
    var el = $('#monto-vista');
    el.classList.remove('sacudir'); void el.offsetWidth; el.classList.add('sacudir');
  }

  function pulsar(k) {
    var t = teclado.txt;
    if (k === 'borrar') t = t.slice(0, -1);
    else if (k === '.') { if (t.indexOf('.') >= 0) return sacudir(); t = (t || '0') + '.'; }
    else {
      var p = t.split('.');
      if (p.length > 1 && p[1].length >= 2) return sacudir();
      if (p.length === 1 && p[0].length >= 7) return sacudir();
      if (t === '0') t = '';
      t += k;
    }
    teclado.txt = t;
    pintarMonto();
  }

  function crearTeclado() {
    var cont = h('div', { class: 'teclado', 'aria-label': 'Teclado numérico' });
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'borrar'].forEach(function (k) {
      var b = h('button', { type: 'button', class: 'tecla' + (k === '.' || k === 'borrar' ? ' tecla-sec' : ''), 'data-tecla': k, 'aria-label': k === 'borrar' ? 'Borrar' : k === '.' ? 'Punto decimal' : k,
        html: k === 'borrar' ? ico('delete') : k });
      b.addEventListener('click', function () { pulsar(k); });
      cont.appendChild(b);
    });
    return cont;
  }

  function seccionMonto() {
    return h('div', { class: 'hoja-seccion' }, [
      h('div', { class: 'monto-vista', id: 'monto-vista', role: 'status' }),
      h('p', { class: 'hoja-nota', id: 'hoja-nota' })
    ]);
  }

  function chipsCategoria(valor) {
    var oculto = h('input', { type: 'hidden', id: 'f-categoria', value: valor });
    var cont = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': '¿De qué fue?' });
    var conCb = cdLista(estado.config.categorias_cashback);
    cdLista(estado.config.categorias).forEach(function (c) {
      var b = h('button', { type: 'button', class: 'chip' + (c === valor ? ' activo' : ''), role: 'radio', 'aria-checked': c === valor ? 'true' : 'false', 'data-cat': c,
        html: ico(icoCategoria(c)) + esc(c) + (conCb.indexOf(c) >= 0 ? ' <span class="chip-cb">' + esc(estado.config.cashback_pct) + '%</span>' : '') });
      b.addEventListener('click', function () {
        oculto.value = c;
        $$('.chip', cont).forEach(function (x) { var on = x === b; x.classList.toggle('activo', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
        actualizarNota();
      });
      cont.appendChild(b);
    });
    setTimeout(function () { var a = $('.chip.activo', cont); if (a && a.scrollIntoView) a.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 60);
    return h('div', { class: 'hoja-seccion' }, [cont, oculto]);
  }

  /** Lugares donde ya compró: un toque llena "Dónde" y la categoría. */
  function lugaresRecientes() {
    var vistos = {}, lista = [];
    estado.movimientos.forEach(function (m) {
      var d = String(m.descripcion || '').trim();
      if (m.tipo !== 'compra' || !d || vistos[d.toLowerCase()] || d === m.categoria) return;
      vistos[d.toLowerCase()] = 1;
      lista.push({ d: d, c: m.categoria });
    });
    lista = lista.slice(0, 8);
    if (!lista.length) return null;
    var cont = h('div', { class: 'chips', 'aria-label': 'Lugares recientes' });
    lista.forEach(function (l) {
      var b = h('button', { type: 'button', class: 'chip lugar', html: ico('clock') + esc(l.d) });
      b.addEventListener('click', function () {
        var on = !b.classList.contains('activo');
        $$('.chip.lugar', cont).forEach(function (x) { x.classList.remove('activo'); });
        var campo = $('#f-descripcion');
        if (campo) campo.value = on ? l.d : '';
        if (on) {
          b.classList.add('activo');
          var cat = null;
          $$('.chip[data-cat]').forEach(function (x) { if (x.dataset.cat === l.c) cat = x; });
          if (cat && !cat.classList.contains('activo')) cat.click();
        }
        actualizarNota();
      });
      cont.appendChild(b);
    });
    return h('div', { class: 'hoja-seccion' }, [h('p', { class: 'hoja-etq', text: 'Lugares recientes' }), cont]);
  }

  function detalles(titulo, filas, abierto) {
    var d = h('details', { class: 'detalles', open: abierto ? true : false });
    d.appendChild(h('summary', { html: '<span>' + esc(titulo) + '</span>' + ico('chevron-down') }));
    d.appendChild(h('div', { class: 'detalles-cuerpo' }, filas));
    return d;
  }
  function filaDetalle(nombre, etiqueta, valor, ph, tipo) {
    return h('div', { class: 'detalle-fila' }, [
      h('label', { for: 'f-' + nombre, text: etiqueta }),
      h('input', { id: 'f-' + nombre, type: tipo || 'text', value: valor || '', placeholder: ph || '', autocomplete: 'off' })
    ]);
  }

  /** Línea viva debajo del monto: qué pasa si guardas. */
  function actualizarNota() {
    var nota = $('#hoja-nota');
    if (!nota || !formActual) return;
    var n = Number(teclado.txt) || 0, r = estado.resumen, cfg = estado.config, tipo = formActual.tipo, txt = '';
    var previo = formActual.mov ? Math.abs(Number(formActual.mov.monto) || 0) : 0;
    if (tipo === 'compra') {
      if (n > 0) {
        var libre = r.libre - n + (formActual.mov ? previo : 0);
        txt = libre < 0 ? 'Te pasarías por ' + cdPesos(-libre) : 'Te quedarían ' + cdPesos(libre) + ' libres';
        var credito = valorDe('medio') === 'credito', cat = valorDe('categoria');
        if (credito && cdLista(cfg.categorias_cashback).indexOf(cat) >= 0 && Number(cfg.cashback_pct)) txt += ' · cashback ≈ ' + cdPesos(n * Number(cfg.cashback_pct) / 100);
      } else txt = valorDe('medio') === 'credito' ? 'Con tarjeta de crédito' : 'Sale de tu cuenta de débito';
    } else if (tipo === 'deposito') {
      txt = n > 0 ? 'Tendrías ' + cdPesos(r.libre + n - previo) + ' libres' : 'Lo que te dieron para el gasto';
    } else if (tipo === 'pago_tarjeta') {
      txt = n > 0 ? (r.tarjeta.por_pagar - n + previo > 0 ? 'Quedarían ' + cdPesos(r.tarjeta.por_pagar - n + previo) + ' por pagar' : 'Quedas al corriente') : 'Pagar la tarjeta no cambia tu Libre';
    } else {
      var clase = valorDe('clase');
      txt = clase === 'cashback' ? 'Anótalo cuando DiDi te deposite el cashback'
        : clase === 'ajuste' ? 'El dinero que ya tenías en débito, o una diferencia'
        : ($('#f-encorte') && $('#f-encorte').checked ? (cdDiasEntre(r.hoy, r.tarjeta.fecha_limite) < 0 ? 'Se suma al pago que venció el ' : 'Se suma al pago del ') + fecha(r.tarjeta.fecha_limite, false)
          : 'Entra en el próximo pago, antes del ' + fecha(limiteSiguiente(r), false));
    }
    nota.textContent = txt;
  }

  function abrirForm(tipo, mov, pre) {
    if (!estado) return;
    pre = pre || {};
    formActual = { tipo: tipo, mov: mov || null };
    teclado.txt = ''; teclado.negativo = false;
    var cuerpo = $('#hoja-cuerpo'); cuerpo.innerHTML = '';
    $('#hoja-error').hidden = true;
    $('#hoja-borrar').hidden = !mov;
    $('#hoja-borrar').textContent = 'Borrar movimiento';
    borrarArmado = false;
    var cfg = estado.config, r = estado.resumen, titulo, monto = '';

    if (tipo === 'compra') {
      titulo = mov ? 'Editar compra' : 'Compra';
      cuerpo.appendChild(h('div', { class: 'hoja-seccion' }, [segmentado('f-medio', [{ v: 'credito', t: 'Tarjeta de crédito' }, { v: 'debito', t: 'Débito' }], mov ? mov.medio : 'credito', actualizarNota)]));
      cuerpo.appendChild(seccionMonto());
      cuerpo.appendChild(chipsCategoria(mov ? mov.categoria : cfg.categoria_default));
      if (!mov) { var lug = lugaresRecientes(); if (lug) cuerpo.appendChild(lug); }
      cuerpo.appendChild(detalles('Lugar y fecha', [filaDetalle('descripcion', 'Dónde', mov && mov.descripcion, 'Ej. Walmart'), filaDetalle('fecha', 'Fecha', (mov && mov.fecha) || r.hoy, '', 'date')], !!mov));
      monto = mov ? mov.monto : '';
    } else if (tipo === 'deposito') {
      titulo = mov ? 'Editar dinero recibido' : 'Recibí dinero';
      cuerpo.appendChild(seccionMonto());
      var nuevo = mov ? !!mov.nuevo_periodo : true;
      cuerpo.appendChild(h('label', { class: 'fila-switch', html:
        '<span>Es el dinero de la ' + esc(nombrePeriodo()) + '<small>Apágalo si es dinero extra; así no reinicia la ' + esc(nombrePeriodo()) + '</small></span><span class="switch"><input type="checkbox" id="f-nuevo"' + (nuevo ? ' checked' : '') + '><i></i></span>' }));
      cuerpo.appendChild(detalles('Nota y fecha', [filaDetalle('descripcion', 'Nota', mov && mov.descripcion, 'Ej. Gasto quincena'), filaDetalle('fecha', 'Fecha', (mov && mov.fecha) || r.hoy, '', 'date')], !!mov));
      monto = mov ? mov.monto : cfg.monto_periodo;
    } else if (tipo === 'pago_tarjeta') {
      titulo = mov ? 'Editar pago' : 'Pagué la tarjeta';
      cuerpo.appendChild(seccionMonto());
      if (!mov) {
        var sug = [{ t: 'Lo que toca', v: r.tarjeta.por_pagar }, { t: 'Toda la deuda', v: r.deuda_tarjeta }]
          .filter(function (s, i, a) { return s.v > 0 && (i === 0 || s.v !== a[0].v); });
        if (sug.length) cuerpo.appendChild(h('div', { class: 'hoja-seccion' }, [h('div', { class: 'chips' }, sug.map(function (s) {
          return h('button', { type: 'button', class: 'chip sugerencia', html: esc(s.t) + ' <b>' + cdPesos(s.v) + '</b>', onclick: function () { teclado.txt = montoATexto(s.v); pintarMonto(); } });
        }))]));
      }
      cuerpo.appendChild(detalles('Fecha', [filaDetalle('fecha', 'Fecha', (mov && mov.fecha) || r.hoy, '', 'date')], !!mov));
      monto = mov ? mov.monto : r.tarjeta.por_pagar;
    } else {
      titulo = mov ? 'Editar movimiento' : 'Otro movimiento';
      var sel = pre.clase || (mov ? (mov.tipo === 'cashback' ? 'cashback' : (mov.medio === 'credito' ? 'deuda' : 'ajuste')) : 'cashback');
      var signo = h('div', { class: 'hoja-seccion', id: 'f-signo-caja' }, [segmentado('f-signo', [{ v: 'suma', t: 'Agregar' }, { v: 'resta', t: 'Quitar' }],
        mov && Number(mov.monto) < 0 ? 'resta' : 'suma', function (v) { teclado.negativo = v === 'resta'; pintarMonto(); })]);
      cuerpo.appendChild(h('div', { class: 'hoja-seccion' }, [segmentado('f-clase', [{ v: 'cashback', t: 'Cashback' }, { v: 'ajuste', t: 'Saldo' }, { v: 'deuda', t: 'Deuda' }], sel, function (v) {
        signo.hidden = v !== 'ajuste';
        enCorte.hidden = v !== 'deuda';
        teclado.negativo = v === 'ajuste' && valorDe('signo') === 'resta';
        pintarMonto();
      })]));
      cuerpo.appendChild(signo);
      signo.hidden = sel !== 'ajuste';
      var limHoy = r.tarjeta.fecha_limite, vencida = cdDiasEntre(r.hoy, limHoy) < 0;
      var enCorte = h('label', { class: 'fila-switch', id: 'f-encorte-caja', html:
        '<span>Ya viene en el estado de cuenta<small>' + (vencida ? 'Su pago venció el ' : 'Hay que pagarlo antes del ') + esc(fecha(limHoy, false)) + '</small></span>' +
        '<span class="switch"><input type="checkbox" id="f-encorte"' + (mov && mov.fecha <= r.tarjeta.ultimo_corte ? ' checked' : '') + '><i></i></span>' });
      enCorte.hidden = sel !== 'deuda';
      enCorte.querySelector('input').addEventListener('change', actualizarNota);
      cuerpo.appendChild(enCorte);
      teclado.negativo = sel === 'ajuste' && mov && Number(mov.monto) < 0;
      cuerpo.appendChild(seccionMonto());
      cuerpo.appendChild(detalles('Nota y fecha', [filaDetalle('descripcion', 'Nota', mov && mov.descripcion, sel === 'ajuste' ? 'Ej. Saldo inicial' : ''), filaDetalle('fecha', 'Fecha', (mov && mov.fecha) || r.hoy, '', 'date')], !!mov));
      monto = mov ? mov.monto : '';
      if (pre.clase) titulo = pre.clase === 'ajuste' ? 'Saldo en débito' : pre.clase === 'deuda' ? 'Deuda de la tarjeta' : titulo;
    }
    cuerpo.appendChild(crearTeclado());

    teclado.txt = montoATexto(monto);
    $('#hoja-titulo').textContent = titulo;
    var g = $('#hoja-guardar'); g.disabled = false; g.textContent = mov ? 'Guardar cambios' : 'Guardar';
    pintarMonto();
    abrirHoja();
  }

  function abrirHoja() {
    var capa = $('#hoja-capa'), hoja = $('#hoja');
    hoja.style.transform = '';
    hoja.scrollTop = 0;
    capa.hidden = false;
    void capa.offsetWidth;
    capa.classList.add('abierta');
    document.documentElement.style.overflow = 'hidden';
  }

  function cerrarForm() {
    var capa = $('#hoja-capa');
    capa.classList.remove('abierta');
    $('#hoja').style.transform = '';
    document.documentElement.style.overflow = '';
    formActual = null;
    setTimeout(function () { if (!capa.classList.contains('abierta')) capa.hidden = true; }, 480);
  }

  /** Arrastrar la hoja hacia abajo para cerrarla, como en iOS. */
  function arrastreHoja() {
    var hoja = $('#hoja'), y0 = null, dy = 0, t0 = 0;
    hoja.addEventListener('touchstart', function (e) {
      if (hoja.scrollTop > 0 || e.target.closest('.chips, input, .teclado')) { y0 = null; return; }
      y0 = e.touches[0].clientY; dy = 0; t0 = Date.now();
      hoja.style.transition = 'none';
    }, { passive: true });
    hoja.addEventListener('touchmove', function (e) {
      if (y0 == null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      hoja.style.transform = dy ? 'translateY(' + dy + 'px)' : '';
    }, { passive: true });
    hoja.addEventListener('touchend', function () {
      if (y0 == null) return;
      hoja.style.transition = '';
      var rapido = dy > 60 && Date.now() - t0 < 250;
      if (dy > 140 || rapido) cerrarForm(); else hoja.style.transform = '';
      y0 = null;
    });
  }

  function valorDe(n) { var el = $('#f-' + n); return el ? String(el.value).trim() : ''; }

  async function enviarForm(ev) {
    ev.preventDefault();
    if (!formActual) return;
    var tipo = formActual.tipo, mov = { monto: teclado.txt, fecha: valorDe('fecha'), descripcion: valorDe('descripcion') };
    if (tipo === 'compra') { mov.tipo = 'compra'; mov.medio = valorDe('medio'); mov.categoria = valorDe('categoria'); }
    else if (tipo === 'deposito') { mov.tipo = 'deposito'; mov.nuevo_periodo = !!($('#f-nuevo') && $('#f-nuevo').checked); }
    else if (tipo === 'pago_tarjeta') { mov.tipo = 'pago_tarjeta'; }
    else {
      var clase = valorDe('clase');
      mov.tipo = clase === 'cashback' ? 'cashback' : 'ajuste';
      mov.medio = clase === 'deuda' ? 'credito' : 'debito';
      // Deuda que ya está en el estado de cuenta: se fecha en el corte para que cuente en "Toca pagar".
      if (clase === 'deuda' && $('#f-encorte') && $('#f-encorte').checked && mov.fecha > estado.resumen.tarjeta.ultimo_corte) mov.fecha = estado.resumen.tarjeta.ultimo_corte;
      if (clase === 'ajuste' && valorDe('signo') === 'resta') mov.monto = '-' + mov.monto;
    }
    var n = cdLeerMonto(teclado.txt);
    if (!(n > 0)) { sacudir(); mostrarErrorForm('Escribe cuánto fue.'); return; }
    if (n > 1000000) { sacudir(); mostrarErrorForm('Ese monto parece demasiado grande. Revísalo.'); return; }
    $('#hoja-error').hidden = true;
    var btn = $('#hoja-guardar'); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      var editando = formActual.mov;
      var res = editando ? await llamar('editar', { id: editando.id, mov: mov }) : await llamar('agregar', { mov: mov });
      recibir(res);
      cerrarForm();
      avisar(res.mensaje || (editando ? 'Cambios guardados' : 'Guardado'), 4500);
    } catch (e) {
      mostrarErrorForm(e.message);
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  }
  function mostrarErrorForm(t) { var e = $('#hoja-error'); e.textContent = t; e.hidden = false; }

  var borrarArmado = false, borrarTimer;
  async function borrarMov() {
    var b = $('#hoja-borrar');
    if (!formActual || !formActual.mov) return;
    if (!borrarArmado) {
      borrarArmado = true; b.textContent = 'Toca otra vez para borrar';
      clearTimeout(borrarTimer);
      borrarTimer = setTimeout(function () { borrarArmado = false; b.textContent = 'Borrar movimiento'; }, 4000);
      return;
    }
    borrarArmado = false;
    b.disabled = true; b.textContent = 'Borrando…';
    try { recibir(await llamar('borrar', { id: formActual.mov.id })); cerrarForm(); avisar('Movimiento borrado'); }
    catch (e) { mostrarErrorForm(e.message); }
    b.disabled = false; b.textContent = 'Borrar movimiento';
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
      banda.textContent = (estado ? 'Mostrando lo último guardado. ' : '') + e.message;
      banda.hidden = false;
      if (!silencioso) avisar(e.message, 4000, 'error');
    } finally {
      cargando = false;
      $('#btn-actualizar').classList.remove('girando');
    }
  }

  function mostrarVista(v) {
    vistaActual = v;
    ['inicio', 'movimientos', 'ajustes'].forEach(function (x) {
      var el = $('#vista-' + x);
      el.hidden = x !== v;
      el.classList.remove('entra');
    });
    var vista = $('#vista-' + v);
    void vista.offsetWidth;
    vista.classList.add('entra');
    $$('.tab').forEach(function (b) {
      var on = b.dataset.vista === v;
      b.classList.toggle('activo', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    ponerTitulo();
    if (v !== 'ajustes') $('#btn-guardar-cfg').classList.remove('visible');
    window.scrollTo(0, 0);
  }

  function mostrarConectar() { $('#app').hidden = true; $('#conectar').hidden = false; }

  function iniciarApp() {
    $('#conectar').hidden = true; $('#app').hidden = false;
    var c = conexion();
    $('#info-conexion').textContent = c.demo ? 'Demostración' : 'Hoja de Google · ' + c.clave.slice(0, 4) + '••••';
    if (!c.demo) {
      var g = leer(LS.estado);
      if (g) try { estado = JSON.parse(g); } catch (e) {}
    }
    if (estado) pintar(); else pintarEsqueleto();
    mostrarVista('inicio');
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

    $$('[data-form]').forEach(function (b) { b.addEventListener('click', function () { abrirForm(b.dataset.form); }); });
    $$('.tab').forEach(function (b) { b.addEventListener('click', function () { if (vistaActual !== b.dataset.vista) mostrarVista(b.dataset.vista); else window.scrollTo({ top: 0, behavior: 'smooth' }); }); });
    $$('[data-filtro]').forEach(function (b) {
      b.addEventListener('click', function () {
        filtro = b.dataset.filtro;
        $$('[data-filtro]').forEach(function (x) { var on = x === b; x.classList.toggle('activo', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
        pintarMovimientos();
      });
    });
    $('#btn-actualizar').addEventListener('click', function () { actualizar(false); });
    $('#form-mov').addEventListener('submit', enviarForm);
    $('#hoja-cerrar').addEventListener('click', cerrarForm);
    $('#hoja-borrar').addEventListener('click', borrarMov);
    $('#hoja-capa').addEventListener('click', function (ev) { if (ev.target === ev.currentTarget) cerrarForm(); });
    arrastreHoja();

    // Teclado físico (computadora) mientras la hoja está abierta.
    document.addEventListener('keydown', function (ev) {
      if (!formActual) return;
      if (ev.key === 'Escape') { cerrarForm(); return; }
      var t = ev.target;
      if (t && (t.tagName === 'INPUT' && t.type !== 'checkbox' || t.tagName === 'TEXTAREA')) return;
      var k = ev.key === ',' ? '.' : ev.key === 'Backspace' ? 'borrar' : ev.key;
      if (/^[0-9.]$/.test(k) || k === 'borrar') {
        ev.preventDefault(); pulsar(k);
        var tecla = $('.tecla[data-tecla="' + k + '"]');
        if (tecla) { tecla.classList.add('pulsada'); setTimeout(function () { tecla.classList.remove('pulsada'); }, 120); }
      } else if (k === 'Enter') { ev.preventDefault(); $('#form-mov').requestSubmit ? $('#form-mov').requestSubmit() : enviarForm(ev); }
    });

    var formCfg = $('#form-config');
    formCfg.addEventListener('submit', function (ev) { guardarConfig(ev).catch(function () {}); });
    var marcarCambio = function () { $('#btn-guardar-cfg').classList.add('visible'); };
    formCfg.addEventListener('input', marcarCambio);
    formCfg.addEventListener('change', marcarCambio);

    $('#btn-desconectar').addEventListener('click', function () {
      var b = this, txt = $('.fila-txt', b);
      if (b.dataset.armado !== '1') {
        b.dataset.armado = '1'; txt.textContent = 'Toca otra vez para desconectar';
        setTimeout(function () { b.dataset.armado = ''; txt.textContent = 'Desconectar este teléfono'; }, 4000);
        return;
      }
      [LS.api, LS.clave, LS.estado, LS.demo, LS.demoDatos].forEach(function (k) { guardar(k, null); });
      location.reload();
    });
    $('#btn-copiar-enlace').addEventListener('click', async function () {
      if (conexion().demo) { avisar('En modo demostración no hay enlace.', 3000, 'error'); return; }
      var enlace = enlaceParaCompartir();
      try {
        if (navigator.share) await navigator.share({ title: 'Caudal', url: enlace });
        else { await navigator.clipboard.writeText(enlace); avisar('Enlace copiado'); }
      } catch (e) { /* cancelado */ }
    });

    // Barra pequeña con el título al bajar (como iOS).
    var mini = $('#barra-mini'), mostrando = false;
    window.addEventListener('scroll', function () {
      var ver = window.scrollY > 56;
      if (ver !== mostrando) { mostrando = ver; mini.classList.toggle('visible', ver); }
    }, { passive: true });

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
