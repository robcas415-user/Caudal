/* Caudal — app web (PWA). Sin dependencias. */
(function () {
  'use strict';

  var LS = { api: 'caudal_api', clave: 'caudal_clave', estado: 'caudal_estado', demo: 'caudal_demo', demoDatos: 'caudal_demo_datos' };
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function guardar(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  var estado = null;          // respuesta de accion=estado
  var filtro = 'todos', mesMov = null, animarLista = false;
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
      try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
      catch (e) { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
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
        config: { nombre: 'Mamá', dia_corte: Number(cdPartes(f(-9)).d), dia_limite: Number(cdPartes(f(11)).d), cashback_pct: 6, monto_periodo: '', periodo_dias: '', avisos_correo: '', url_app: '' },
        movs: [
          m(f(-18), 'ajuste', 300, { descripcion: 'Saldo al empezar', medio: 'debito' }),
          m(f(-11), 'deposito', 2800, { descripcion: 'Dinero de la semana' }),
          m(f(-10), 'compra', 940.4, { categoria: 'Súper', descripcion: 'Walmart', cashback: 'si' }),
          m(f(-8), 'compra', 210, { categoria: 'Farmacia', descripcion: 'Farmacia Guadalajara', medio: 'debito' }),
          m(f(-7), 'compra', 655.75, { categoria: 'Súper', descripcion: 'Chedraui', cashback: 'si' }),
          m(f(-4), 'deposito', 2800, { descripcion: 'Dinero de la semana' }),
          m(f(-3), 'compra', 812.3, { categoria: 'Súper', descripcion: 'Walmart', cashback: 'si' }),
          m(f(-3), 'compra', 180, { categoria: 'Mercado', descripcion: 'Mercado', medio: 'debito' }),
          m(f(-1), 'compra', 435.9, { categoria: 'Súper', descripcion: 'Bodega Aurrera', cashback: 'si' }),
          m(f(0), 'compra', 129, { categoria: 'Farmacia', descripcion: 'Farmacia', cashback: 'no' })
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
          categoria: e.tipo === 'compra' ? (e.categoria || cfg.categoria_default) : '', nuevo_periodo: !!e.nuevo_periodo, origen: e.origen === 'cashback' ? 'cashback' : 'demo'
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
    $('#fila-cashback').innerHTML = barra('60%', 22);
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
    ['#tarjeta-credito', '#fila-debito', '#grupo-fechas', '#grupo-periodo', '#grupo-recientes'].forEach(function (s) { $(s).hidden = vacio; });
    $('#fila-cashback').hidden = vacio || !cbActivo();
    if (!vacio) {
      pintarTarjeta(r, cfg);
      pintarCuentas(r);
      if (cbActivo()) pintarCashback(r, cfg);
      pintarFechas(r);
      pintarPeriodo(r, cfg);
      pintarRecientes();
    }
    pintarRevisar();
    if (!vacio) {
    }
    $('#actualizado').textContent = estado._recibido ? 'Actualizado ' + hace(estado._recibido) : '';

    pintarMovimientos();
    pintarConfig();
    if (estado.resumen) {
      var rr = estado.resumen;
      $('#fx-debito').textContent = cdPesos(rr.saldo_debito);
      $('#fx-deuda').textContent = (rr.deuda_tarjeta < 0 ? '+ ' : '− ') + cdPesos(Math.abs(rr.deuda_tarjeta));
      var fl = $('#fx-libre'); fl.textContent = cdPesos(rr.libre); fl.classList.toggle('neg', rr.libre < 0);
    }
  }

  function pintarHeroe(r, vacio) {
    var heroe = $('#heroe');
    var est = vacio ? 'bien' : r.estado_libre;
    heroe.classList.toggle('bajo', est === 'bajo');
    heroe.classList.toggle('negativo', est === 'negativo');
    $('#heroe-estado').textContent = vacio ? 'Sin datos' : est === 'negativo' ? 'Te pasaste' : est === 'bajo' ? 'Queda poco' : 'Vas bien';
    var heroeEl = $('#heroe');
    if (estado._libreAntes != null && estado._libreAntes !== r.libre) {
      heroeEl.classList.remove('destello', 'baja'); void heroeEl.offsetWidth;
      heroeEl.classList.add('destello'); if (r.libre < estado._libreAntes) heroeEl.classList.add('baja');
    }
    estado._libreAntes = r.libre;
    animarMonto($('#libre-monto'), r.libre, true);

    var p = vacio ? null : resumenMes(r, estado.config), sub;
    if (vacio) sub = 'Anota el dinero que tienes y aquí verás cuánto puedes gastar.';
    else {
      // Las dos cifras son botones discretos: tocar una abre Cuadrar con esa cuenta (débito o tarjeta).
      var cifra = function (n, clase, etq) { return '<button type="button" class="cifra" data-cuadrar="' + clase + '" aria-label="' + etq + ' ' + pesosSinCentavos(n) + '. Toca para cuadrar con DiDi">' + pesosSinCentavos(n) + '</button>'; };
      sub = r.libre < 0 ? 'La tarjeta debe ' + cifra(r.deuda_tarjeta, 'deuda', 'Debe la tarjeta') + ' y en débito tienes ' + cifra(r.saldo_debito, 'ajuste', 'En débito') + '.'
        : 'En débito ' + cifra(r.saldo_debito, 'ajuste', 'En débito') + (r.deuda_tarjeta > 0 ? ' menos ' + cifra(r.deuda_tarjeta, 'deuda', 'Debe la tarjeta') + ' de la tarjeta.' : ', la tarjeta no debe nada.');
      // Lo gastado hoy, con el día de México (igual que la hoja), no el del reloj del teléfono.
      var dHoy = hoyMexico(), comprasHoy = estado.movimientos.filter(function (m) { return m.tipo === 'compra' && m.fecha === dHoy; });
      var gastoHoy = cdRedondear(comprasHoy.reduce(function (t, m) { return t + (Number(m.monto) || 0); }, 0));
      sub += '<span class="heroe-dia">' + (comprasHoy.length ? 'Hoy llevas <b>' + cdPesos(gastoHoy) + '</b> gastados' + (comprasHoy.length > 1 ? ' en ' + comprasHoy.length + ' compras.' : '.') : 'Hoy no has anotado compras.') + '</span>';
    }
    $('#libre-sub').innerHTML = sub;
    $$('#libre-sub [data-cuadrar]').forEach(function (b) { b.onclick = function () { abrirForm('otro', null, { clase: b.dataset.cuadrar }); }; });
    if (!vacio && !leer('caudal.pistaCifras')) { guardar('caudal.pistaCifras', 1); $('#libre-sub').classList.add('pista'); }

    var barra = $('#heroe-barra');
    // Lo que tuvo para gastar este mes = lo ya gastado en el mes + lo que queda libre.
    var total = p ? p.gastado + Math.max(0, r.libre) : 0;
    barra.hidden = vacio || !p || total <= 0;
    if (!barra.hidden) {
      var pct = Math.min(100, Math.round(p.gastado / total * 100));
      requestAnimationFrame(function () { $('#heroe-barra-relleno').style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0 round 99px)'; });
      $('#heroe-gastado').textContent = 'Gastado este mes ' + pesosSinCentavos(p.gastado);
      $('#heroe-recibido').textContent = 'Libre ' + pesosSinCentavos(Math.max(0, r.libre));
    }
  }

  /** Gasto promedio por día en los últimos 14 días (o desde el primer movimiento). Pide al menos 3 días de historia. */
  function ritmoDeGasto(r) {
    var movs = estado.movimientos;
    if (!movs.length) return null;
    var primero = movs.reduce(function (min, m) { return m.fecha < min ? m.fecha : min; }, r.hoy);
    var desde = cdSumarDias(r.hoy, -13);
    if (primero > desde) desde = primero;
    var dias = cdDiasEntre(desde, r.hoy) + 1;
    if (dias < 3) return null;
    var total = movs.reduce(function (t, m) { return m.tipo === 'compra' && m.fecha >= desde && m.fecha <= r.hoy ? t + (Number(m.monto) || 0) : t; }, 0);
    return total > 0 ? { diario: total / dias, dias: dias } : null;
  }

  /** 'AAAA-MM-DD' de hoy en la hora de México (la misma zona que usa la hoja de Google). */
  function hoyMexico() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    catch (e) { return estado.resumen.hoy; }
  }

  function pintarAvisos(r, vacio) {
    var ul = $('#avisos'); ul.innerHTML = '';
    if (vacio) return;
    r.avisos.forEach(function (a) {
      // La tarjeta Libre y la de crédito ya dicen esto; aquí solo lo urgente.
      if (a.clave === 'libre_bajo' || (a.clave === 'pago_pendiente' && a.nivel === 'info')) return;
      if (a.clave === 'tope_cashback' && !cbActivo()) return;
      if (a.clave === 'libre_negativo') a = { nivel: a.nivel, clave: a.clave, texto: 'La tarjeta debe ' + cdPesos(-r.libre) + ' más de lo que tienes en débito. Mejor no usarla hasta recibir más dinero.' };
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
      { t: '¿La tarjeta ya debe algo?', s: 'Escribe el saldo total que ves en DiDi', fn: function () { abrirForm('otro', null, { clase: 'deuda' }); } },
      { t: 'Revisa los datos de tu tarjeta', s: 'Día de corte y día límite de pago', fn: function () { mostrarVista('ajustes'); } }
    ].forEach(function (p, i) {
      caja.appendChild(h('button', { class: 'paso', type: 'button', onclick: p.fn, html:
        '<span class="paso-num">' + (i + 1) + '</span><span class="paso-txt"><b>' + esc(p.t) + '</b><small>' + esc(p.s) + '</small></span>' + ico('chevron') }));
    });
  }

  function tcCashback() {
    if (!cbActivo()) return '';
    var ps = catsConCb().map(pctCat), max = Math.max.apply(null, ps.concat([0]));
    if (!max) return '';
    var iguales = ps.every(function (p) { return p === max; });
    return '<span class="tc-cb">' + (iguales ? '' : 'hasta ') + esc(String(max)) + '% cashback</span>';
  }

  function pintarTarjeta(r, cfg) {
    var t = r.tarjeta, html, lim = limiteSiguiente(r), proximo = cdRedondear(r.deuda_tarjeta - t.por_pagar);
    html = '<div class="tc-top"><span class="tc-nombre"><span class="tc-chip" aria-hidden="true"></span>Tarjeta de crédito</span>' +
      tcCashback() + '</div>';
    var accion = 'Ya pagué';
    // El botón "Pagué tarjeta" lleva un punto cuando se acerca el día límite (rojo si es hoy, mañana o ya pasó).
    var bp = $('.accion[data-form="pago_tarjeta"]');
    if (bp) {
      var urg = t.por_pagar > 0 ? (t.estado === 'vencido' || t.dias_para_pagar <= 1 ? 'urgente' : t.dias_para_pagar <= 5 ? 'pronto' : '') : '';
      bp.classList.toggle('pendiente', !!urg); bp.classList.toggle('urgente', urg === 'urgente');
    }
    if (t.por_pagar > 0) {
      var vencido = t.estado === 'vencido', d = t.dias_para_pagar;
      var clase = vencido || d <= 1 ? 'urgente' : d <= 5 ? 'pronto' : '';
      var dias = vencido ? '<b>Vencido</b>' : d === 0 ? '<b>Hoy</b>' : d === 1 ? '<b>Mañana</b>' : 'Faltan <b>' + d + '</b> días';
      html += '<p class="tc-etq">' + (vencido ? 'Pago vencido' : 'Toca pagar') + '</p>' +
        '<p class="tc-monto num">' + montoHtml(t.por_pagar) + '</p>' +
        '<div class="tc-plazo"><span>' + (vencido ? 'Era el ' : 'Antes del ') + esc(fecha(t.fecha_limite)) + '</span><span class="tc-dias ' + clase + '">' + dias + '</span></div>';
      if (proximo > 0) html += '<div class="tc-total"><span>Debe en total <b class="num">' + cdPesos(r.deuda_tarjeta) + '</b></span><span>' + pesosSinCentavos(proximo) + ' son del siguiente pago</span></div>';
      if (!t.alcanza_en_debito) html += '<p class="tc-falta">' + ico('warn') + '<span>En débito te faltan <b>' + cdPesos(t.falta_en_debito) + '</b> para este pago.</span></p>';
    } else if (r.deuda_tarjeta > 0) {
      // Nada vencido; lo comprado desde el corte se paga en el siguiente estado de cuenta.
      var faltan = cdDiasEntre(r.hoy, lim);
      html += '<p class="tc-etq">Nada que pagar por ahora</p><p class="tc-monto num">' + montoHtml(r.deuda_tarjeta) + '</p>' +
        '<div class="tc-plazo"><span>Se paga antes del ' + esc(fecha(lim)) + '</span><span class="tc-dias">Faltan <b>' + faltan + '</b> días</span></div>';
      accion = 'Pagar antes';
    } else {
      html += '<p class="tc-etq">Tarjeta</p><p class="tc-monto ok">' + ico('check') + 'Sin deuda</p>';
      accion = '';
    }
    if (accion) html += '<span class="tarjeta-accion">' + accion + ' ' + ico('chevron') + '</span>';
    var el = $('#tarjeta-credito');
    el.innerHTML = html;
    el.classList.toggle('tocable', !!accion);
    if (accion) {
      el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.setAttribute('aria-label', 'Anotar un pago a la tarjeta');
      el.onclick = function () { abrirForm('pago_tarjeta'); };
    } else { el.removeAttribute('role'); el.removeAttribute('tabindex'); el.onclick = null; }
  }

  /** Débito en una fila: lo que deberías ver en DiDi y cuánto de eso es para la tarjeta. Al tocar, Cuadrar. */
  function pintarCuentas(r) {
    var t = r.tarjeta, nota, barra = '';
    if (r.deuda_tarjeta > 0 && r.saldo_debito > 0) {
      var parte = Math.min(100, Math.round(r.deuda_tarjeta / r.saldo_debito * 100));
      barra = '<span class="fdb-pista" aria-hidden="true"><span style="width:' + parte + '%;background:var(--lime)"></span><span style="width:' + (100 - parte) + '%;background:var(--mint)"></span></span>';
    }
    if (t.por_pagar > 0 && !t.alcanza_en_debito) nota = '<span class="mal">Faltan <b>' + cdPesos(t.falta_en_debito) + '</b> para pagar la tarjeta</span>';
    else if (r.deuda_tarjeta > 0) nota = '<b>' + pesosSinCentavos(Math.min(r.deuda_tarjeta, Math.max(0, r.saldo_debito))) + '</b> es para la tarjeta';
    else nota = 'Todo es libre';
    var el = $('#fila-debito');
    el.className = 'fila-cashback fila-debito tocable';
    el.innerHTML = '<span class="fcb-ico">' + ico('wallet') + '</span>' +
      '<span class="fcb-txt"><small>Deberías ver en DiDi débito</small><b class="num">' + montoHtml(r.saldo_debito) + '</b>' + barra + '<small class="fdb-nota">' + nota + '</small></span>' +
      '<span class="tarjeta-accion">Cuadrar ' + ico('chevron') + '</span>';
    el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.setAttribute('aria-label', 'Cuadrar el débito con DiDi');
    el.onclick = function () { abrirForm('otro', null, { clase: 'ajuste' }); };
  }

  /** Línea de tiempo: lo que viene, en orden, con cuántos días faltan. */
  function pintarFechas(r) {
    var g = $('#grupo-fechas'), t = r.tarjeta, ev = [];
    if (t.por_pagar > 0) ev.push({ f: t.fecha_limite, ico: 'card', tono: 'pago', t: t.estado === 'vencido' ? 'Pago de la tarjeta (vencido)' : 'Pagar la tarjeta', s: 'Para no pagar intereses', m: t.por_pagar });
    ev.push({ f: t.siguiente_corte, ico: 'calendar', tono: 'corte', t: 'Corte de la tarjeta', s: 'Lo de después va al siguiente pago' });
    var lim = limiteSiguiente(r), proximo = cdRedondear(r.deuda_tarjeta - t.por_pagar);
    if (proximo > 0) ev.push({ f: lim, ico: 'card', tono: 'siguiente', t: t.por_pagar > 0 ? 'Siguiente pago de la tarjeta' : 'Pago de la tarjeta', s: 'Lo que llevas desde el corte', m: proximo });
    ev = ev.filter(function (e) { return e.f >= r.hoy || e.tono === 'pago'; }).sort(function (a, b) { return a.f < b.f ? -1 : a.f > b.f ? 1 : 0; });
    g.innerHTML = '';
    g.appendChild(h('div', { class: 'grupo-cabeza' }, [h('h2', { class: 'grupo-titulo', text: 'Próximas fechas' })]));
    var lista = h('div', { class: 'lista-ios linea-tiempo' });
    ev.forEach(function (e) {
      var d = cdDiasEntre(r.hoy, e.f);
      var cuando = d < 0 ? 'Venció' : d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : 'En ' + d + ' días';
      var urg = e.tono === 'pago' && d <= 1 ? ' urgente' : e.tono === 'pago' && d <= 5 ? ' pronto' : '';
      lista.appendChild(h('div', { class: 'evento ev-' + e.tono, html:
        '<span class="ev-punto">' + ico(e.ico) + '</span>' +
        '<span class="ev-txt"><b>' + esc(e.t) + '</b><small>' + esc(fecha(e.f)) + ' · ' + esc(e.s) + '</small></span>' +
        '<span class="ev-der">' + (e.m != null ? '<b class="num">' + pesosSinCentavos(e.m) + '</b>' : '') + '<span class="ev-cuando' + urg + '">' + cuando + '</span></span>' }));
    });
    g.appendChild(lista);
  }

  /** Cashback encendido = hay un porcentaje mayor a 0 en Ajustes. Apagado, no aparece en ningún lado. */
  function cbActivo() { return !!estado && Number(estado.config.cashback_pct) > 0; }
  /** % de cashback de una categoría (0 si no tiene o está apagado). */
  function pctCat(c) { return cbActivo() ? cdPctCategoria(c, estado.config) : 0; }
  /** Las categorías con cashback, con su nombre tal como está en la lista de categorías. */
  function catsConCb() { return cdLista(estado.config.categorias).filter(function (c) { return pctCat(c) > 0; }); }
  function chipCb(pct) { return pct > 0 ? ' <span class="chip-cb">' + esc(String(pct)) + '%</span>' : ''; }

  /** ¿Este movimiento es un uso del cashback? (aplicado a la tarjeta o pasado al débito) */
  function esUsoCashback(m) { return m.tipo === 'cashback' || (m.tipo === 'ajuste' && (m.origen === 'cashback' || /^cashback/i.test(String(m.descripcion || '')))); }

  /**
   * Cashback en DiDi (así funciona DiDi Card): cada compra con cashback suma a una "cuenta Cashback"
   * aparte, en máximo 2 días hábiles. No baja la deuda sola: tú decides usarlo en el pago de la
   * tarjeta o pasarlo al monedero. Vence a los 365 días. Aquí se estima lo que hay por usar.
   */
  function saldoCashback(r, cfg) {
    var tope = cfg.cashback_tope === '' || cfg.cashback_tope == null ? null : Number(cfg.cashback_tope);
    var desde = cdSumarDias(r.hoy, -365), porMes = {}, usado = 0;
    estado.movimientos.forEach(function (m) {
      if (m.tipo === 'compra' && m.medio === 'credito' && m.cashback === 'si' && m.fecha >= desde && m.fecha <= r.hoy) {
        var k = String(m.fecha).slice(0, 7); porMes[k] = (porMes[k] || 0) + (Number(m.monto) || 0) * cdPctCompra(m, cfg) / 100;
      } else if (esUsoCashback(m)) usado += Math.abs(Number(m.monto) || 0);
    });
    var ganado = 0, mes = 0;
    Object.keys(porMes).forEach(function (k) {
      var g = porMes[k]; if (tope != null && tope > 0) g = Math.min(g, tope);
      ganado += g; if (k === r.hoy.slice(0, 7)) mes = g;
    });
    return { porUsar: cdRedondear(Math.max(0, ganado - usado)), mes: cdRedondear(mes), usado: cdRedondear(usado), tope: tope };
  }

  /** Cashback en una fila: cuánto hay por usar en DiDi y, al tocar, anotar que lo usaste. */
  function pintarCashback(r, cfg) {
    var cb = saldoCashback(r, cfg), el = $('#fila-cashback');
    var nota = 'Este mes llevas ' + pesosSinCentavos(cb.mes) + (cb.tope ? ' de ' + pesosSinCentavos(cb.tope) : '');
    el.className = 'fila-cashback tocable';
    el.innerHTML = '<span class="fcb-ico">' + ico('sparkle') + '</span>' +
      '<span class="fcb-txt"><small>Cashback por usar en DiDi</small><b class="num">' + montoHtml(cb.porUsar) + '</b><small>' + nota + '</small></span>' +
      '<span class="tarjeta-accion">Lo usé ' + ico('chevron') + '</span>';
    el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.setAttribute('aria-label', 'Anotar que usaste tu cashback');
    el.onclick = function () { abrirForm('otro', null, { clase: 'cashback' }); };
  }

  /** Este mes: lo que entró y salió en el mes de calendario. Termina en el mismo Libre de arriba. */
  function resumenMes(r, cfg) {
    var inicio = r.hoy.slice(0, 8) + '01', m = { inicio: inicio, recibido: 0, gastado: 0, credito: 0, debito: 0, otros: 0, otrosMas: 0, otrosMenos: 0, cats: {} };
    estado.movimientos.forEach(function (x) {
      if (x.fecha < inicio || x.fecha > r.hoy) return;
      var monto = cdRedondear(x.monto), e = cdEfecto(x, cfg);
      if (x.tipo === 'deposito') m.recibido += monto;
      else if (x.tipo === 'compra') {
        m.gastado += monto;
        if (x.medio === 'debito') m.debito += monto; else m.credito += monto;
        var c = x.categoria || 'Otro'; m.cats[c] = cdRedondear((m.cats[c] || 0) + monto);
      } else { m.otros += e.libre; if (e.libre > 0) m.otrosMas += e.libre; else m.otrosMenos -= e.libre; }
    });
    ['recibido', 'gastado', 'credito', 'debito', 'otros', 'otrosMas', 'otrosMenos'].forEach(function (k) { m[k] = cdRedondear(m[k]); });
    // Lo que había al empezar el mes = lo que queda menos lo que pasó en el mes; así siempre cuadra.
    m.antes = cdRedondear(r.libre - m.recibido + m.gastado - m.otros);
    return m;
  }

  function pintarPeriodo(r, cfg) {
    var g = $('#grupo-periodo'), m = resumenMes(r, cfg);
    var nombreMes = new Date(Number(m.inicio.slice(0, 4)), Number(m.inicio.slice(5, 7)) - 1, 1).toLocaleDateString('es-MX', { month: 'long' });
    g.innerHTML = '';
    var verCompras = h('button', { class: 'grupo-link', type: 'button', text: 'Ver compras', onclick: function () { filtro = 'compra'; mesMov = null; mostrarVista('movimientos'); pintarMovimientos(); } });
    g.appendChild(h('div', { class: 'grupo-cabeza' }, [h('h2', { class: 'grupo-titulo', text: 'Este mes' }), m.gastado ? verCompras : null]));
    var caja = h('div', { class: 'lista-ios mes-caja' });

    // La cuenta del mes como ticket: cada renglón dice con su ícono y color si entra (menta) o sale (ámbar),
    // y termina en lo que queda, resaltado. Arriba, una barra: de todo lo que tuviste, cuánto salió.
    var entro = cdRedondear(m.recibido + m.otrosMas), salio = cdRedondear(m.gastado + m.otrosMenos);
    var tuviste = cdRedondear(Math.max(0, m.antes) + entro);
    var pSale = tuviste > 0 ? Math.min(100, Math.round(salio / tuviste * 100)) : (salio > 0 ? 100 : 0);
    var redondo = function (n) { return '$' + Math.round(Math.abs(n)).toLocaleString('es-MX'); };
    var renglon = function (tipo, icono, etq, sub, valor) {
      return '<div class="tk-fila tk-' + tipo + '"><span class="tk-ico">' + ico(icono) + '</span>' +
        '<span class="tk-etq">' + etq + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="tk-valor num">' + valor + '</span></div>';
    };
    var tk = '';
    if (m.antes) tk += renglon(m.antes > 0 ? 'antes' : 'sale', 'wallet', m.antes > 0 ? 'Traías del mes pasado' : 'Debías del mes pasado', '', (m.antes < 0 ? '−' : '') + redondo(m.antes));
    var subEntro = m.recibido && m.otrosMas ? redondo(m.recibido) + ' recibido · ' + redondo(m.otrosMas) + ' en saldos y ajustes' : m.otrosMas ? 'Saldos y ajustes que anotaste' : '';
    tk += renglon('entra', 'arrow-down', 'Entró', subEntro, '+' + redondo(entro));
    var partes = [];
    if (m.credito) partes.push(redondo(m.credito) + ' tarjeta');
    if (m.debito) partes.push(redondo(m.debito) + ' débito');
    if (m.otrosMenos) partes.push(redondo(m.otrosMenos) + (m.gastado ? ' deudas y ajustes' : ' en deuda que anotaste'));
    tk += renglon('sale', 'arrow-up', m.gastado ? 'Salió' : 'Salió', partes.join(' · '), '−' + redondo(salio));
    // El resultado lleva su propia barra: qué parte de lo que tuviste sigue libre. Así el gráfico mide el número que tiene al lado.
    var pQueda = 100 - pSale, totalHtml;
    if (r.libre < 0) totalHtml = '<small>Salió ' + redondo(-r.libre) + ' más de lo que has tenido este mes</small>';
    else if (tuviste > 0) totalHtml = '<div class="tk-total-barra" role="img" aria-label="' + pQueda + ' por ciento de lo que has tenido"><span style="width:' + Math.max(2, pQueda) + '%"></span></div>' +
      '<small><b>' + pQueda + '%</b> de los ' + redondo(tuviste) + ' que has tenido este mes</small>';
    else totalHtml = '';
    tk += '<div class="tk-total' + (r.libre < 0 ? ' neg' : '') + '"><div class="tk-total-top"><span>Te queda libre</span><b class="num">' + (r.libre < 0 ? '−' : '') + redondo(r.libre) + '</b></div>' + totalHtml + '</div>';
    caja.appendChild(h('div', { class: 'tk', html: tk }));

    var cats = Object.keys(m.cats).sort(function (a, b) { return m.cats[b] - m.cats[a]; });
    if (cats.length) {
      var max = m.cats[cats[0]], conCb = catsConCb();
      var lista = h('div', { class: 'cats' });
      cats.forEach(function (c) {
        lista.appendChild(h('div', { class: 'cat' + (conCb.indexOf(c) >= 0 ? ' con-cb' : ''), html:
          '<span class="cat-ico">' + ico(icoCategoria(c)) + '</span>' +
          '<div class="cat-linea"><span>' + esc(c) + '</span><span>' + cdPesos(m.cats[c]) + '</span></div>' +
          '<div class="cat-pista"><div class="cat-relleno" data-w="' + Math.max(3, Math.round(m.cats[c] / max * 100)) + '"></div></div>' }));
      });
      caja.appendChild(lista);
      requestAnimationFrame(function () { $$('[data-w]', lista).forEach(function (b) { b.style.clipPath = 'inset(0 ' + (100 - Number(b.dataset.w)) + '% 0 0 round 99px)'; }); });
    } else {
      caja.appendChild(h('p', { class: 'mes-vacio', text: 'Sin compras en ' + nombreMes + ' todavía. Aquí verás en qué se va el dinero.' }));
    }
    g.appendChild(caja);
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
    estado.movimientos.slice(0, 3).forEach(function (m) { lista.appendChild(filaMov(m, true)); });
    g.appendChild(lista);
  }

  /* ===================== movimientos ===================== */

  function nombreMov(m) {
    if (m.tipo === 'compra') return m.descripcion || m.categoria || 'Compra';
    if (m.tipo === 'deposito') return m.descripcion || 'Dinero recibido';
    if (m.tipo === 'pago_tarjeta') return 'Pago a la tarjeta';
    if (m.tipo === 'cashback') return 'Cashback';
    if (esUsoCashback(m) && m.tipo === 'ajuste') return m.medio === 'credito' ? 'Cashback a la tarjeta' : 'Cashback a tu débito';
    var d = String(m.descripcion || '').split(' (')[0].trim();
    return d || (m.medio === 'credito' ? 'Cuadre de tarjeta' : 'Cuadre de débito');
  }
  function detalleMov(m, conFecha) {
    var d;
    if (m.tipo === 'compra') d = (m.medio === 'debito' ? 'Débito' : 'Tarjeta') + (m.categoria && m.descripcion && m.descripcion !== m.categoria ? ' · ' + m.categoria : '') + (m.origen === 'wallet' ? ' · automático' : m.origen === 'atajo' ? ' · rápido' : '');
    else if (m.tipo === 'deposito') d = 'A tu débito';
    else if (m.tipo === 'pago_tarjeta') d = 'De débito a la tarjeta';
    else if (m.tipo === 'cashback') d = 'Regreso de la tarjeta';
    else if (esUsoCashback(m)) d = 'Usaste tu cashback';
    else d = m.medio === 'credito' ? (Number(m.monto) < 0 ? 'Baja la deuda de la tarjeta' : 'Sube la deuda de la tarjeta') : (Number(m.monto) < 0 ? 'Baja tu débito' : 'Sube tu débito');
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
    if (esUsoCashback(m)) return 'sparkle';
    return { deposito: 'arrow-down', pago_tarjeta: 'card', cashback: 'sparkle', ajuste: 'pencil' }[m.tipo] || 'tag';
  }
  function formDeMov(m) { return m.tipo === 'pago_tarjeta' ? 'pago_tarjeta' : (m.tipo === 'cashback' || m.tipo === 'ajuste') ? 'otro' : m.tipo; }

  function filaMov(m, conFecha) {
    var efecto = cdEfecto(m, estado.config).libre;
    var signo = efecto > 0 ? '+' : efecto < 0 ? '−' : '';
    var clase = efecto > 0 ? ' mas' : efecto === 0 ? ' neutro' : '';
    return h('button', { class: 'mov', type: 'button', onclick: function () { abrirForm(formDeMov(m), m); }, html:
      '<span class="mov-ico t-' + (esUsoCashback(m) ? 'cashback' : m.tipo) + (m.medio === 'debito' ? ' debito' : '') + '">' + ico(icoMov(m)) + '</span>' +
      '<span class="mov-txt"><b>' + esc(nombreMov(m)) + (m.tipo === 'compra' && m.cashback === 'si' && cbActivo() ? ' <span class="mov-cb">' + esc(String(cdPctCompra(m, estado.config))) + '%</span>' : '') + '</b><small>' + esc(detalleMov(m, conFecha)) + '</small></span>' +
      '<span class="mov-monto' + clase + '">' + signo + cdPesos(Math.abs(m.monto)) + '</span>' });
  }

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function nombreMes(ym) { var p = ym.split('-'); var n = MESES[Number(p[1]) - 1]; return n.charAt(0).toUpperCase() + n.slice(1) + (p[0] !== estado.resumen.hoy.slice(0, 4) ? ' ' + p[0] : ''); }
  function mesMover(ym, d) { var p = ym.split('-').map(Number), m = p[1] - 1 + d, y = p[0] + Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); }

  /**
   * Movimientos: un mes a la vez. Arriba, el resumen del mes en tres totales que también sirven
   * de filtro (tocar uno muestra solo eso; tocarlo otra vez vuelve a todo). Abajo, los días.
   */
  function pintarMovimientos() {
    var cont = $('#lista-movs'); cont.innerHTML = '';
    var hoyMes = estado.resumen.hoy.slice(0, 7);
    if (!mesMov || mesMov > hoyMes) mesMov = hoyMes;
    var primero = estado.movimientos.reduce(function (a, m) { var k = String(m.fecha).slice(0, 7); return !a || k < a ? k : a; }, null) || hoyMes;
    if (mesMov < primero) mesMov = primero;
    var delMes = estado.movimientos.filter(function (m) { return String(m.fecha).slice(0, 7) === mesMov; });

    // Selector de mes
    var ant = h('button', { type: 'button', class: 'mes-flecha', 'aria-label': 'Mes anterior', html: ico('chevron') });
    var sig = h('button', { type: 'button', class: 'mes-flecha', 'aria-label': 'Mes siguiente', html: ico('chevron') });
    ant.disabled = mesMov <= primero; sig.disabled = mesMov >= hoyMes;
    ant.onclick = function () { mesMov = mesMover(mesMov, -1); filtro = 'todos'; animarLista = true; pintarMovimientos(); };
    sig.onclick = function () { mesMov = mesMover(mesMov, 1); filtro = 'todos'; animarLista = true; pintarMovimientos(); };
    cont.appendChild(h('div', { class: 'mes-nav' }, [ant, h('h2', { class: 'mes-nombre', text: nombreMes(mesMov) }), sig]));

    // Resumen del mes (y filtro)
    var t = { compra: 0, deposito: 0, pago_tarjeta: 0, credito: 0, debito: 0, nCompra: 0, nDep: 0, nPago: 0 };
    delMes.forEach(function (m) {
      var n = cdRedondear(m.monto);
      if (m.tipo === 'compra') { t.compra += n; t.nCompra++; if (m.medio === 'debito') t.debito += n; else t.credito += n; }
      else if (m.tipo === 'deposito') { t.deposito += n; t.nDep++; }
      else if (m.tipo === 'pago_tarjeta') { t.pago_tarjeta += n; t.nPago++; }
    });
    var veces = function (n, uno, varios) { return n === 1 ? '1 ' + uno : n + ' ' + varios; };
    var ICO_T = { compra: 'cart', deposito: 'arrow-down', pago_tarjeta: 'card' };
    var tile = function (tipo, etq, monto, nota, tono) {
      var on = filtro === tipo;
      var b = h('button', { type: 'button', class: 'resumen-tile ' + tono + (on ? ' activo' : '') + (monto ? '' : ' cero'), 'aria-pressed': on ? 'true' : 'false',
        'aria-label': (on ? 'Dejar de filtrar ' : 'Ver solo ') + etq.toLowerCase(),
        html: '<span class="rt-cabeza"><span class="rt-ico">' + ico(ICO_T[tipo]) + '</span><span class="rt-etq">' + etq + '</span>' +
          '<span class="rt-ver" aria-hidden="true">' + ico(on ? 'x' : 'chevron-down') + '</span></span>' +
          '<span class="rt-monto num">' + pesosSinCentavos(Math.round(monto)) + '</span><span class="rt-nota">' + nota + '</span>' });
      b.onclick = function () { filtro = on ? 'todos' : tipo; animarLista = true; pintarMovimientos(); };
      return b;
    };
    var notaGasto = t.nCompra ? (t.debito && t.credito ? 'Tarjeta ' + pesosSinCentavos(Math.round(t.credito)) + ' · Débito ' + pesosSinCentavos(Math.round(t.debito)) : veces(t.nCompra, 'compra', 'compras')) : 'Sin compras';
    var primeraVez = !leer('caudal.pistaFiltro');
    if (primeraVez) guardar('caudal.pistaFiltro', 1);
    cont.appendChild(h('div', { class: 'resumen-movs' + (filtro !== 'todos' ? ' hay-filtro' : '') + (primeraVez ? ' pista' : '') }, [
      tile('compra', 'Gastaste', t.compra, notaGasto, 'rt-gasto'),
      h('div', { class: 'resumen-fila' }, [
        tile('deposito', 'Recibiste', t.deposito, t.nDep ? veces(t.nDep, 'vez', 'veces') : 'Nada', 'rt-recibido'),
        tile('pago_tarjeta', 'Pagaste', t.pago_tarjeta, t.nPago ? veces(t.nPago, 'pago', 'pagos') + ' a tarjeta' : 'Nada a la tarjeta', 'rt-pago')
      ])
    ]));

    var lista0 = h('div', { class: 'movs-lista' + (animarLista ? ' cambia-lista' : '') }); animarLista = false;
    cont.appendChild(lista0); cont = lista0;
    var NOMBRE_F = { compra: 'compras', deposito: 'dinero recibido', pago_tarjeta: 'pagos a la tarjeta' };
    var movs = delMes.filter(function (m) { return filtro === 'todos' || m.tipo === filtro; });
    if (filtro !== 'todos') {
      var quitar = h('button', { type: 'button', class: 'filtro-quitar', text: 'Ver todo' });
      quitar.onclick = function () { filtro = 'todos'; pintarMovimientos(); };
      cont.appendChild(h('div', { class: 'filtro-aviso' }, [h('span', { text: 'Solo ' + NOMBRE_F[filtro] }), quitar]));
    }
    if (!movs.length) {
      cont.appendChild(h('div', { class: 'vacio', html: ico('list') + '<b>' + (filtro === 'todos' ? 'Nada en ' + nombreMes(mesMov).toLowerCase() : 'Sin ' + NOMBRE_F[filtro] + ' este mes') + '</b>' + (mesMov === hoyMes ? 'Lo que anotes aparecerá aquí.' : '') }));
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
        h('h3', { class: 'dia-titulo', html: '<span>' + esc(titulo) + '</span><span>' + (gasto && filtro !== 'deposito' && filtro !== 'pago_tarjeta' ? cdPesos(gasto) + ' en compras' : '') + '</span>' }),
        lista
      ]));
    });
  }

  /* ===================== ajustes ===================== */

  var SECCIONES_CFG = [
    { t: 'Tú', c: ['nombre'] },
    { t: 'Tarjeta de crédito', c: ['dia_corte', 'dia_limite'], pie: 'Los dos días vienen en el estado de cuenta de DiDi.', vista: 'fechas' },
    { t: 'Compras', c: ['categorias', 'categoria_default'] },
    { t: 'Cashback', c: ['cashback_pct', 'categorias_cashback', 'cashback_tope'] },
    { t: 'Recordatorios', c: ['aviso_libre_bajo', 'avisos_dias_antes', 'avisos_correo'], pie: 'Los correos salen cada mañana a las 8, solo si hay algo que recordar.' }
  ];
  // Ya no se usan desde que el Libre es débito menos tarjeta; se conservan en la hoja pero no se muestran.
  var CFG_OCULTOS = { monto_periodo: 1, periodo_dias: 1, limite_credito: 1, dias_para_pagar: 1, url_app: 1 };
  var CAMPOS_ANCHOS = { categorias: 1, categorias_cashback: 1, categoria_default: 1, avisos_dias_antes: 1, avisos_correo: 1, cashback_periodo: 1, cashback_destino: 1 };
  var ETQ_OPCION = { mes: 'Mes', corte: 'De corte a corte', tarjeta: 'La tarjeta', debito: 'Débito' };
  // Textos más claros que los de la hoja (la hoja guarda los mismos valores).
  var ETQ_CFG = {
    nombre: ['Nombre', 'Cómo te saluda la app.'],
    dia_corte: ['Día de corte', 'Cuando DiDi cierra el estado de cuenta.'],
    dia_limite: ['Día límite de pago', 'Hasta cuándo puedes pagar sin intereses.'],
    categorias: ['Tus categorías', 'Toca × para quitar una o agrega otra.'],
    categoria_default: ['Categoría del ícono Anotar', 'Las compras rápidas se guardan en esta.'],

    cashback_tope: ['Tope al mes', 'Lo máximo que regresa. DiDi Card: $500.'],
    aviso_libre_bajo: ['Avisar si el Libre baja de', 'En pesos. Vacío = no avisar.'],
    avisos_dias_antes: ['Recordar el pago', 'Elige con cuánta anticipación te avisa.'],
    avisos_correo: ['Mandar recordatorios a', 'Correos separados por coma. Vacío = no mandar.']
  };
  var DIAS_AVISO = [{ v: '7', t: '7 días antes' }, { v: '5', t: '5 días' }, { v: '3', t: '3 días' }, { v: '2', t: '2 días' }, { v: '1', t: '1 día' }, { v: '0', t: 'El mismo día' }];

  /** Chips para elegir. multi: varios; la lista se guarda separada por coma en un input oculto (id cfg-clave). */
  function chipsElegir(id, opciones, valor, multi, alCambiar) {
    var oculto = h('input', { type: 'hidden', id: id, value: valor });
    var cont = h('div', { class: 'chips-cfg', role: multi ? 'group' : 'radiogroup' });
    var elegidos = function () { return cdLista(oculto.value); };
    opciones.forEach(function (o) {
      var on = elegidos().indexOf(o.v) >= 0;
      var b = h('button', { type: 'button', class: 'chip' + (on ? ' activo' : ''), 'aria-pressed': on ? 'true' : 'false', html: (multi ? '<span class="chip-marca">' + ico('check') + '</span>' : '') + esc(o.t) + (o.extra || '') });
      b.addEventListener('click', function () {
        var lista = elegidos(), i = lista.indexOf(o.v);
        if (multi) { if (i >= 0) lista.splice(i, 1); else lista.push(o.v); }
        else lista = [o.v];
        if (multi) lista.sort(function (x, y) { return opciones.findIndex(function (q) { return q.v === x; }) - opciones.findIndex(function (q) { return q.v === y; }); });
        oculto.value = lista.join(',');
        $$('.chip', cont).forEach(function (x, k) { var si = lista.indexOf(opciones[k].v) >= 0; x.classList.toggle('activo', si); x.setAttribute('aria-pressed', si ? 'true' : 'false'); });
        oculto.dispatchEvent(new Event('change', { bubbles: true }));
        if (alCambiar) alCambiar(lista);
      });
      cont.appendChild(b);
    });
    cont.appendChild(oculto);
    return cont;
  }

  /** Editor de categorías: chips con × y un campo para agregar. */
  function editorCategorias(id, valor, alCambiar) {
    var oculto = h('input', { type: 'hidden', id: id, value: valor });
    var cont = h('div', { class: 'chips-cfg' });
    var pintar = function () {
      cont.innerHTML = '';
      cdLista(oculto.value).forEach(function (c, i, arr) {
        var b = h('span', { class: 'chip chip-quitable', html: '<span class="cat-mini">' + ico(icoCategoria(c)) + '</span><span class="chip-txt">' + esc(c) + '</span>' });
        if (arr.length > 1) {
          var x = h('button', { type: 'button', class: 'chip-x', 'aria-label': 'Quitar ' + c, html: ico('x') });
          x.addEventListener('click', function () { var l = cdLista(oculto.value); l.splice(i, 1); fijar(l); });
          b.appendChild(x);
        }
        cont.appendChild(b);
      });
      var nuevo = h('input', { type: 'text', class: 'chip-nuevo', placeholder: '+ Agregar', autocapitalize: 'sentences', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'Agregar categoría' });
      var agregar = function () {
        var v = nuevo.value.trim().replace(/,/g, ' ');
        if (!v) return;
        var l = cdLista(oculto.value);
        if (l.map(function (x) { return x.toLowerCase(); }).indexOf(v.toLowerCase()) < 0) l.push(v.charAt(0).toUpperCase() + v.slice(1));
        fijar(l, true);
      };
      nuevo.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
      nuevo.addEventListener('blur', agregar);
      cont.appendChild(nuevo);
      cont.appendChild(oculto);
    };
    var fijar = function (l, enfocar) {
      oculto.value = l.join(',');
      pintar();
      oculto.dispatchEvent(new Event('change', { bubbles: true }));
      if (alCambiar) alCambiar(l);
      if (enfocar) { var n = $('.chip-nuevo', cont); if (n) n.focus(); }
    };
    pintar();
    return cont;
  }

  /** Vista previa de las fechas con los días escritos, para confirmar que están bien. */
  function previaFechas() {
    var el = $('#cfg-previa'); if (!el) return;
    var dc = Number(($('#cfg-dia_corte') || {}).value), dl = Number(($('#cfg-dia_limite') || {}).value);
    if (!(dc >= 1 && dc <= 31) || !(dl >= 1 && dl <= 31)) { el.innerHTML = '<span class="previa-error">' + ico('warn') + 'Escribe días entre 1 y 31</span>'; return; }
    var hoy = estado.resumen.hoy, ult = cdUltimoCorte(hoy, dc), sig = cdSiguienteCorte(ult, dc);
    var cfg = { dia_corte: dc, dia_limite: dl, dias_para_pagar: '' };
    el.innerHTML = '<div class="previa-item">' + ico('calendar') + '<span><small>Próximo corte</small><b>' + esc(fecha(sig, false)) + '</b></span></div>' +
      '<div class="previa-item">' + ico('card') + '<span><small>Ese estado se paga antes del</small><b>' + esc(fecha(cdLimiteDe(sig, cfg), false)) + '</b></span></div>';
  }

  /**
   * Selector segmentado con una ficha de vidrio que se desliza. Se toca una opción o se arrastra
   * la ficha con el dedo (como en iOS); al soltar se queda en la opción más cercana.
   */
  function segmentado(id, lista, valor, alCambiar) {
    var oculto = h('input', { type: 'hidden', id: id, value: valor });
    var cont = h('div', { class: 'segmentado', role: 'radiogroup' });
    var ficha = h('span', { class: 'seg-ficha', 'aria-hidden': 'true' });
    cont.appendChild(ficha);
    var actual = lista.findIndex(function (o) { return o.v === valor; });
    var poner = function (i) { cont.style.setProperty('--n', lista.length); cont.style.setProperty('--i', i); cont.classList.toggle('sin-eleccion', i < 0); };
    poner(actual);
    var elegir = function (idx) {
      poner(idx);
      if (idx === actual) return;
      actual = idx;
      var o = lista[idx];
      oculto.value = o.v;
      $$('.segmento', cont).forEach(function (x, k) { var on = k === idx; x.classList.toggle('activo', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
      // Pequeño "aplastón" de la ficha al llegar: se siente como algo físico.
      ficha.classList.remove('llega'); void ficha.offsetWidth; ficha.classList.add('llega');
      oculto.dispatchEvent(new Event('change', { bubbles: true }));
      if (alCambiar) alCambiar(o.v);
    };
    var botones = lista.map(function (o, idx) {
      var b = h('button', { type: 'button', class: 'segmento' + (idx === actual ? ' activo' : ''), role: 'radio', 'aria-checked': idx === actual ? 'true' : 'false', text: o.t });
      b.addEventListener('click', function () { if (!arrastrado) elegir(idx); });
      cont.appendChild(b);
      return b;
    });
    // Arrastrar la ficha
    var arrastrado = false, x0 = null;
    var indiceEn = function (x) { var r = cont.getBoundingClientRect(); return Math.max(0, Math.min(lista.length - 1, Math.floor((x - r.left) / (r.width / lista.length)))); };
    cont.addEventListener('pointerdown', function (e) {
      if (actual < 0 || indiceEn(e.clientX) !== actual) { x0 = null; return; }
      x0 = e.clientX; arrastrado = false;
    });
    cont.addEventListener('pointermove', function (e) {
      if (x0 == null) return;
      if (!arrastrado && Math.abs(e.clientX - x0) > 6) { arrastrado = true; cont.classList.add('arrastrando'); try { cont.setPointerCapture(e.pointerId); } catch (er) {} }
      if (arrastrado) { var i = indiceEn(e.clientX); poner(i); botones.forEach(function (b, k) { b.classList.toggle('bajo-dedo', k === i); }); }
    });
    var fin = function (e) {
      if (x0 == null) return;
      x0 = null;
      if (arrastrado) {
        cont.classList.remove('arrastrando'); botones.forEach(function (b) { b.classList.remove('bajo-dedo'); });
        elegir(indiceEn(e.clientX));
        setTimeout(function () { arrastrado = false; }, 0);
      }
    };
    cont.addEventListener('pointerup', fin);
    cont.addEventListener('pointercancel', function () { x0 = null; arrastrado = false; cont.classList.remove('arrastrando'); poner(actual); });
    cont.appendChild(oculto);
    return cont;
  }

  /**
   * Cashback en Ajustes: un interruptor y, debajo, cada categoría con su porcentaje (− 6% +).
   * Se guarda en la hoja como categorias_cashback = "Súper:6, Farmacia:2" y cashback_pct = el mayor
   * (0 = apagado). Al apagar se conservan los porcentajes para cuando se vuelva a prender.
   */
  function editorCashback(cfg, lista, filasCb) {
    var pcts = {}, base = Number(cfg.cashback_pct) || 0;
    cdLista(cfg.categorias_cashback).forEach(function (x) {
      var k = x.lastIndexOf(':'), nom = (k >= 0 ? x.slice(0, k) : x).trim();
      var p = k >= 0 && x.slice(k + 1).trim() !== '' ? Number(x.slice(k + 1)) : (base || Number(leer('caudal.cbPct')) || 6);
      if (nom && p > 0) pcts[nom.toLowerCase()] = p;
    });
    var activo = base > 0;
    var inPct = h('input', { type: 'hidden', id: 'cfg-cashback_pct', value: String(base || 0) });
    var inCats = h('input', { type: 'hidden', id: 'cfg-categorias_cashback', value: cfg.categorias_cashback || '' });
    var sw = h('label', { class: 'fila campo-fila cb-switch', html:
      '<span class="cb-switch-txt"><b>Llevar el cashback</b><small></small></span>' +
      '<span class="switch"><input type="checkbox" id="cfg-cb-on"' + (activo ? ' checked' : '') + '><i></i></span>' });
    var pie = sw.querySelector('small');
    sw.appendChild(inPct); sw.appendChild(inCats);
    lista.appendChild(sw);
    var cont = h('div', { class: 'cb-cats' }), filaCats = h('div', { class: 'fila cb-cats-fila' }, [cont]);
    lista.appendChild(filaCats); filasCb.push(filaCats);

    var sincronizar = function () {
      var cats = cdLista($('#cfg-categorias') ? $('#cfg-categorias').value : cfg.categorias);
      var partes = [], max = 0;
      cats.forEach(function (c) { var p = pcts[c.toLowerCase()] || 0; if (p > 0) { partes.push([c, p]); max = Math.max(max, p); } });
      // Las que llevan el % mayor van sin número (ese % se guarda en cashback_pct); así la hoja se lee sencilla.
      inCats.value = partes.map(function (x) { return x[1] === max ? x[0] : x[0] + ':' + x[1]; }).join(', ');
      inPct.value = activo && max > 0 ? String(max) : '0';
      pie.textContent = !activo ? 'Apagado, no aparece en ningún lado de la app.'
        : partes.length ? partes.length + (partes.length === 1 ? ' categoría regresa dinero.' : ' categorías regresan dinero.') : 'Sube el porcentaje de alguna categoría.';
    };
    var avisar = function () { inCats.dispatchEvent(new Event('change', { bubbles: true })); };

    var fila = function (c) {
      var k = c.toLowerCase();
      var el = h('div', { class: 'cb-cat' });
      var num = h('b', { class: 'cb-num num' });
      var menos = h('button', { type: 'button', class: 'cb-paso', 'aria-label': 'Menos cashback en ' + c, html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>' });
      var mas = h('button', { type: 'button', class: 'cb-paso', 'aria-label': 'Más cashback en ' + c, html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12M12 6v12"/></svg>' });
      var pintar = function (animar) {
        var p = pcts[k] || 0;
        el.classList.toggle('con', p > 0);
        num.innerHTML = p > 0 ? p + '<small>%</small>' : '<span class="cb-no">No</span>';
        menos.disabled = !(p > 0);
        if (animar) { num.classList.remove('salta'); void num.offsetWidth; num.classList.add('salta'); }
      };
      var paso = function (d) {
        var p = Math.max(0, Math.min(30, (pcts[k] || 0) + d));
        if (p === (pcts[k] || 0)) return;
        if (p > 0) pcts[k] = p; else delete pcts[k];
        pintar(true); sincronizar(); avisar();
      };
      menos.addEventListener('click', function () { paso(-1); });
      mas.addEventListener('click', function () { paso(1); });
      el.appendChild(h('span', { class: 'cb-cat-ico', html: ico(icoCategoria(c)) }));
      el.appendChild(h('span', { class: 'cb-cat-nom', text: c }));
      el.appendChild(h('span', { class: 'cb-paso-grupo' }, [menos, num, mas]));
      pintar(false);
      return el;
    };
    var rehacer = function (cats) {
      cont.innerHTML = '';
      cats.forEach(function (c) { cont.appendChild(fila(c)); });
      sincronizar();
    };
    sw.querySelector('input').addEventListener('change', function (e) {
      e.stopPropagation();
      activo = this.checked;
      if (activo && !Object.keys(pcts).length) pcts[(cdLista(cfg.categorias)[0] || 'Súper').toLowerCase()] = Number(leer('caudal.cbPct')) || 6;
      if (!activo) guardar('caudal.cbPct', String(Math.max.apply(null, Object.keys(pcts).map(function (k) { return pcts[k]; }).concat([0])) || ''));
      filasCb.forEach(function (x) { x.hidden = !activo; });
      sincronizar(); avisar();
    });
    rehacer(cdLista(cfg.categorias));
    filaCats.hidden = !activo;
    return { rehacer: rehacer, activo: function () { return activo; } };
  }

  function pintarConfig() {
    var f = $('#form-config');
    if (f.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // no borrar lo que se está escribiendo
    f.innerHTML = '';
    var campos = estado.campos || CAUDAL_CONFIG, porClave = {};
    campos.forEach(function (c) { porClave[c[0]] = c; });
    var cfg = estado.config;
    var opcionesCat = function (lista, conCb) {
      return lista.map(function (c) { return { v: c, t: c }; });
    };
    // Al cambiar las categorías se rehacen los chips que dependen de ellas.
    var rehacerDependientes = function (lista) {
      if (cbEditor) cbEditor.rehacer(lista);
      [['categoria_default', false]].forEach(function (par) {
        var vieja = $('#cfg-' + par[0]); if (!vieja) return;
        var valor = cdLista(vieja.value).filter(function (x) { return lista.indexOf(x) >= 0; });
        if (!par[1] && !valor.length) valor = [lista[0]];
        var nuevo = chipsElegir('cfg-' + par[0], opcionesCat(lista, false), valor.join(','), par[1]);
        vieja.parentNode.replaceWith(nuevo);
      });
    };

    var cbEditor = null;
    SECCIONES_CFG.forEach(function (s) {
      var claves = s.c.filter(function (k) { return porClave[k] && !CFG_OCULTOS[k]; });
      if (!claves.length) return;
      var lista = h('div', { class: 'lista-ios' });
      var esCb = s.t === 'Cashback', filasCb = [];
      if (esCb) {
        cbEditor = editorCashback(cfg, lista, filasCb);
        claves = claves.filter(function (k) { return k !== 'cashback_pct' && k !== 'categorias_cashback'; });
      }
      claves.forEach(function (clave) {
        var c = porClave[clave], tipo = c[2], valor = cfg[clave], id = 'cfg-' + clave, control;
        var etq = ETQ_CFG[clave] || [c[3], c[4]];
        valor = valor === '' || valor == null ? '' : String(valor);
        if (clave === 'categorias') control = editorCategorias(id, valor, rehacerDependientes);
        else if (clave === 'categoria_default') control = chipsElegir(id, opcionesCat(cdLista(cfg.categorias), false), valor, false);
        else if (clave === 'categorias_cashback') control = chipsElegir(id, opcionesCat(cdLista(cfg.categorias), false), valor, true);
        else if (clave === 'avisos_dias_antes') control = chipsElegir(id, DIAS_AVISO, valor, true);
        else if (tipo.indexOf('opcion:') === 0) {
          control = segmentado(id, tipo.slice(7).split(',').map(function (o) { return { v: o, t: ETQ_OPCION[o] || o }; }), valor);
        } else {
          var esNum = tipo === 'numero';
          var input = h('input', { id: id, name: clave, value: valor, type: 'text', autocomplete: 'off', autocapitalize: esNum || clave === 'avisos_correo' ? 'off' : 'sentences',
            inputmode: esNum ? (clave.indexOf('dia_') === 0 ? 'numeric' : 'decimal') : clave === 'avisos_correo' ? 'email' : null,
            placeholder: clave === 'cashback_tope' ? 'Sin tope' : clave === 'aviso_libre_bajo' ? 'No avisar' : esNum ? '—' : clave === 'avisos_correo' ? 'nombre@correo.com' : '', enterkeyhint: 'done' });
          // Prefijos y sufijos para que se entienda qué se escribe.
          var antes = clave === 'cashback_tope' || clave === 'aviso_libre_bajo' ? '$' : clave.indexOf('dia_') === 0 ? 'Día' : '';
          var despues = clave === 'cashback_pct' ? '%' : '';
          control = antes || despues ? h('span', { class: 'campo-unidad' }, [antes ? h('span', { class: 'unidad', text: antes }) : null, input, despues ? h('span', { class: 'unidad', text: despues }) : null]) : input;
          if (clave.indexOf('dia_') === 0) input.addEventListener('input', previaFechas);
        }
        var filaCampo = h('div', { class: 'fila campo-fila' + (CAMPOS_ANCHOS[clave] ? ' campo-ancho' : '') }, [
          h('label', { for: id, html: '<b>' + esc(etq[0]) + '</b>' + (etq[1] ? '<small>' + esc(etq[1]) + '</small>' : '') }), control
        ]);
        if (esCb) { filasCb.push(filaCampo); filaCampo.hidden = !cbEditor.activo(); }
        lista.appendChild(filaCampo);
      });
      if (s.vista === 'fechas') lista.appendChild(h('div', { class: 'fila cfg-previa', id: 'cfg-previa', 'aria-live': 'polite' }));
      f.appendChild(h('section', { class: 'grupo' }, [h('h2', { class: 'grupo-etq', text: s.t }), lista, s.pie ? h('p', { class: 'grupo-pie', text: s.pie }) : null]));
    });
    previaFechas();
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
    var g = $('#hoja-guardar'); if (g) g.classList.toggle('apagado', !t || Number(t) === 0);
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

  function diferenciaCuadre() {
    var r = estado.resumen, v = valorDe('clase'), n = teclado.txt === '' ? NaN : Number(teclado.txt);
    var actual = v === 'debito' ? r.saldo_debito : r.deuda_tarjeta;
    return isNaN(n) ? NaN : cdRedondear(n - actual);
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
    cdLista(estado.config.categorias).forEach(function (c) {
      var b = h('button', { type: 'button', class: 'chip' + (c === valor ? ' activo' : ''), role: 'radio', 'aria-checked': c === valor ? 'true' : 'false', 'data-cat': c,
        html: ico(icoCategoria(c)) + esc(c) + chipCb(pctCat(c)) });
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
        if (credito && pctCat(cat) > 0) txt += ' · cashback ≈ ' + cdPesos(n * pctCat(cat) / 100);
      } else txt = 'Tienes ' + cdPesos(r.libre + previo) + ' libres';
    } else if (tipo === 'deposito') {
      txt = n > 0 ? 'Tendrías ' + cdPesos(r.libre + n - previo) + ' libres' : 'Lo que llegó a tu DiDi débito';
    } else if (tipo === 'pago_tarjeta') {
      txt = n > 0 ? (r.tarjeta.por_pagar - n + previo > 0 ? 'Quedarían ' + cdPesos(r.tarjeta.por_pagar - n + previo) + ' por pagar' : 'Quedas al corriente') : 'Pagar la tarjeta no cambia tu Libre';
    } else if (formActual.cuadrar && valorDe('clase') === 'cashback') {
      var cbS = saldoCashback(r, cfg), aTarjeta = valorDe('cbdest') !== 'debito';
      txt = n > 0 ? (aTarjeta ? 'La tarjeta deberá ' + cdPesos(n) + ' menos' : 'Entran ' + cdPesos(n) + ' a tu débito') + ': tu Libre sube'
        : 'Tienes ≈ ' + cdPesos(cbS.porUsar) + ' por usar. El monto exacto está en DiDi › Cashback';
    } else if (formActual.cuadrar && valorDe('clase') !== 'cashback') {
      var esDeb = valorDe('clase') === 'debito', dif = diferenciaCuadre();
      var enC = $('#f-encorte') && $('#f-encorte').closest('.fila-switch');
      if (enC) enC.hidden = esDeb || !(dif > 0);
      if (isNaN(dif)) txt = 'Según Caudal: ' + cdPesos(esDeb ? estado.resumen.saldo_debito : estado.resumen.deuda_tarjeta);
      else if (!dif) txt = 'Ya cuadra. No hay nada que corregir.';
      else if (esDeb) txt = dif > 0 ? 'Faltaban ' + cdPesos(dif) + ' en Caudal: tu Libre sube' : 'Sobraban ' + cdPesos(-dif) + ' en Caudal: tu Libre baja. ¿Faltó anotar una compra?';
      else txt = dif > 0 ? 'La tarjeta debe ' + cdPesos(dif) + ' más: tu Libre baja' : 'La tarjeta debe ' + cdPesos(-dif) + ' menos: tu Libre sube';
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
      cuerpo.appendChild(detalles('Nota y fecha', [filaDetalle('descripcion', 'Nota', mov && mov.descripcion, 'Ej. Dinero de la semana'), filaDetalle('fecha', 'Fecha', (mov && mov.fecha) || r.hoy, '', 'date')], !!mov));
      monto = mov ? mov.monto : '';
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
    } else if (!mov) {
      // Cuadrar: se escribe lo que dice DiDi y Caudal anota solo la diferencia.
      titulo = 'Cuadrar con DiDi';
      formActual.cuadrar = true;
      var selC = pre.clase === 'deuda' ? 'tarjeta' : pre.clase === 'cashback' && cbActivo() ? 'cashback' : 'debito';
      var pregunta = h('p', { class: 'hoja-pregunta', id: 'f-pregunta' });
      var limC = r.tarjeta.fecha_limite, vencC = cdDiasEntre(r.hoy, limC) < 0;
      var enCorteC = h('label', { class: 'fila-switch', html:
        '<span>La diferencia ya viene en el estado de cuenta<small>' + (vencC ? 'Ese pago venció el ' : 'Se suma al pago del ') + esc(fecha(limC, false)) + '</small></span>' +
        '<span class="switch"><input type="checkbox" id="f-encorte"><i></i></span>' });
      enCorteC.querySelector('input').addEventListener('change', actualizarNota);
      var destino = h('div', { class: 'hoja-seccion cb-destino' }, [segmentado('f-cbdest', [{ v: 'tarjeta', t: 'En la tarjeta' }, { v: 'debito', t: 'A mi débito' }], (leer('caudal.cbDestino') || estado.config.cashback_destino) === 'debito' ? 'debito' : 'tarjeta', actualizarNota)]);
      var ponerClase = function (v) {
        pregunta.textContent = v === 'debito' ? '¿Cuánto ves hoy en tu DiDi débito?' : v === 'tarjeta' ? '¿Cuánto dice DiDi que debe tu tarjeta?' : '¿Cuánto cashback usaste?';
        destino.hidden = v !== 'cashback';
        enCorteC.hidden = true;
        teclado.txt = '';
        pintarMonto();
      };
      cuerpo.appendChild(h('div', { class: 'hoja-seccion' }, [segmentado('f-clase', [{ v: 'debito', t: 'Débito' }, { v: 'tarjeta', t: 'Tarjeta' }].concat(cbActivo() ? [{ v: 'cashback', t: 'Cashback' }] : []), selC, ponerClase)]));
      cuerpo.appendChild(pregunta);
      cuerpo.appendChild(seccionMonto());
      cuerpo.appendChild(destino);
      cuerpo.appendChild(detalles('Nota y fecha', [filaDetalle('descripcion', 'Nota', '', 'Opcional'), filaDetalle('fecha', 'Fecha', r.hoy, '', 'date'), enCorteC], false));
      enCorteC.hidden = true;
      destino.hidden = selC !== 'cashback';
      pregunta.textContent = selC === 'debito' ? '¿Cuánto ves hoy en tu DiDi débito?' : selC === 'tarjeta' ? '¿Cuánto dice DiDi que debe tu tarjeta?' : '¿Cuánto cashback usaste?';
      monto = '';
    } else {
      titulo = 'Editar movimiento';
      var sel = pre.clase || (mov ? (mov.tipo === 'cashback' ? 'cashback' : (mov.medio === 'credito' ? 'deuda' : 'ajuste')) : 'cashback');
      var signo = h('div', { class: 'hoja-seccion', id: 'f-signo-caja' }, [segmentado('f-signo', [{ v: 'suma', t: 'Agregar' }, { v: 'resta', t: 'Quitar' }],
        mov && Number(mov.monto) < 0 ? 'resta' : 'suma', function (v) { teclado.negativo = v === 'resta'; pintarMonto(); })]);
      cuerpo.appendChild(h('div', { class: 'hoja-seccion' }, [segmentado('f-clase', (cbActivo() || sel === 'cashback' ? [{ v: 'cashback', t: 'Cashback' }] : []).concat([{ v: 'ajuste', t: 'Saldo' }, { v: 'deuda', t: 'Deuda' }]), sel, function (v) {
        signo.hidden = v === 'cashback';
        enCorte.hidden = v !== 'deuda';
        teclado.negativo = v !== 'cashback' && valorDe('signo') === 'resta';
        pintarMonto();
      })]));
      cuerpo.appendChild(signo);
      signo.hidden = sel === 'cashback';
      var limHoy = r.tarjeta.fecha_limite, vencida = cdDiasEntre(r.hoy, limHoy) < 0;
      var enCorte = h('label', { class: 'fila-switch', id: 'f-encorte-caja', html:
        '<span>Ya viene en el estado de cuenta<small>' + (vencida ? 'Su pago venció el ' : 'Hay que pagarlo antes del ') + esc(fecha(limHoy, false)) + '</small></span>' +
        '<span class="switch"><input type="checkbox" id="f-encorte"' + (mov && mov.fecha <= r.tarjeta.ultimo_corte ? ' checked' : '') + '><i></i></span>' });
      enCorte.hidden = sel !== 'deuda';
      enCorte.querySelector('input').addEventListener('change', actualizarNota);
      cuerpo.appendChild(enCorte);
      teclado.negativo = sel !== 'cashback' && mov && Number(mov.monto) < 0;
      cuerpo.appendChild(seccionMonto());
      cuerpo.appendChild(detalles('Nota y fecha', [filaDetalle('descripcion', 'Nota', mov && mov.descripcion, sel === 'ajuste' ? 'Ej. Saldo inicial' : ''), filaDetalle('fecha', 'Fecha', (mov && mov.fecha) || r.hoy, '', 'date')], !!mov));
      monto = mov ? mov.monto : '';
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

  /**
   * Arrastrar la hoja, como en iOS: sigue el dedo 1:1, hacia arriba resiste (rubber band),
   * el fondo se aclara según baja, y al soltar decide por velocidad, no solo por distancia.
   */
  function arrastreHoja() {
    var hoja = $('#hoja'), capa = $('#hoja-capa'), y0 = null, dy = 0, muestras = [];
    hoja.addEventListener('touchstart', function (e) {
      if (hoja.scrollTop > 0 || e.target.closest('.chips, input, .teclado, .segmentado')) { y0 = null; return; }
      y0 = e.touches[0].clientY; dy = 0; muestras = [{ y: y0, t: performance.now() }];
    }, { passive: true });
    hoja.addEventListener('touchmove', function (e) {
      if (y0 == null) return;
      var y = e.touches[0].clientY, crudo = y - y0;
      if (Math.abs(crudo) > 4 && !hoja.classList.contains('arrastrando')) { hoja.classList.add('arrastrando'); capa.classList.add('arrastrando'); }
      // Hacia abajo 1:1; hacia arriba cada vez cuesta más.
      dy = crudo >= 0 ? crudo : -12 * (1 - Math.exp(crudo / 60));
      hoja.style.transform = 'translate3d(0,' + dy + 'px,0)';
      var alto = hoja.offsetHeight || 1;
      capa.style.backgroundColor = 'rgba(0,0,0,' + (0.55 * Math.max(0, 1 - Math.max(0, dy) / alto)).toFixed(3) + ')';
      muestras.push({ y: y, t: performance.now() }); if (muestras.length > 5) muestras.shift();
    }, { passive: true });
    var soltar = function () {
      if (y0 == null) return;
      var a = muestras[0], b = muestras[muestras.length - 1], v = b && a && b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0; // px/ms
      hoja.classList.remove('arrastrando'); capa.classList.remove('arrastrando');
      capa.style.backgroundColor = '';
      // Proyecta a dónde iría con la inercia del dedo (como iOS) antes de decidir.
      var destino = dy + v * 180;
      if (dy > 8 && (v > 0.5 || destino > hoja.offsetHeight * 0.35)) cerrarForm(); else hoja.style.transform = '';
      y0 = null;
    };
    hoja.addEventListener('touchend', soltar);
    hoja.addEventListener('touchcancel', soltar);
  }

  function valorDe(n) { var el = $('#f-' + n); return el ? String(el.value).trim() : ''; }

  async function enviarForm(ev) {
    ev.preventDefault();
    if (!formActual) return;
    var tipo = formActual.tipo, mov = { monto: teclado.txt, fecha: valorDe('fecha'), descripcion: valorDe('descripcion') };
    if (tipo === 'compra') { mov.tipo = 'compra'; mov.medio = valorDe('medio'); mov.categoria = valorDe('categoria'); }
    else if (tipo === 'deposito') { mov.tipo = 'deposito'; mov.nuevo_periodo = false; }
    else if (tipo === 'pago_tarjeta') { mov.tipo = 'pago_tarjeta'; }
    else if (formActual.cuadrar && valorDe('clase') === 'cashback') {
      // Usar el cashback: aplicado al pago baja la deuda; pasado al monedero sube el débito. En ambos el Libre sube.
      var aT = valorDe('cbdest') !== 'debito', x = cdLeerMonto(teclado.txt);
      guardar('caudal.cbDestino', aT ? 'tarjeta' : 'debito'); // DiDi pregunta cada vez; aquí se recuerda la última
      mov = { tipo: 'ajuste', medio: aT ? 'credito' : 'debito', monto: (aT ? '-' : '') + (Number(x) || 0).toFixed(2), fecha: valorDe('fecha'), origen: 'cashback',
        descripcion: valorDe('descripcion') || (aT ? 'Cashback a la tarjeta' : 'Cashback a tu débito') };
      return guardarMov(mov, x);
    }
    else if (formActual.cuadrar && valorDe('clase') !== 'cashback') {
      var dif = diferenciaCuadre(), esDebito = valorDe('clase') === 'debito';
      if (isNaN(dif)) { sacudir(); mostrarErrorForm('Escribe lo que ves en DiDi.'); return; }
      if (!dif) { cerrarForm(); avisar('Ya cuadra con DiDi', 3500); return; }
      mov = { tipo: 'ajuste', medio: esDebito ? 'debito' : 'credito', monto: (dif < 0 ? '-' : '') + Math.abs(dif).toFixed(2), fecha: valorDe('fecha'),
        descripcion: valorDe('descripcion') || (esDebito ? 'Cuadre de débito' : 'Cuadre de tarjeta') };
      if (!esDebito && dif > 0 && $('#f-encorte') && $('#f-encorte').checked && mov.fecha > estado.resumen.tarjeta.ultimo_corte) mov.fecha = estado.resumen.tarjeta.ultimo_corte;
      return guardarMov(mov, Math.abs(dif));
    }
    else {
      var clase = valorDe('clase');
      mov.tipo = clase === 'cashback' ? 'cashback' : 'ajuste';
      mov.medio = clase === 'deuda' ? 'credito' : 'debito';
      // Deuda que ya está en el estado de cuenta: se fecha en el corte para que cuente en "Toca pagar".
      if (clase === 'deuda' && $('#f-encorte') && $('#f-encorte').checked && mov.fecha > estado.resumen.tarjeta.ultimo_corte) mov.fecha = estado.resumen.tarjeta.ultimo_corte;
      if (clase !== 'cashback' && valorDe('signo') === 'resta') mov.monto = '-' + mov.monto;
      if (formActual.mov && esUsoCashback(formActual.mov)) { mov.origen = 'cashback'; if (!mov.descripcion) mov.descripcion = mov.medio === 'credito' ? 'Cashback a la tarjeta' : 'Cashback a tu débito'; }
    }
    return guardarMov(mov, cdLeerMonto(teclado.txt));
  }

  async function guardarMov(mov, n) {
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
      el.classList.remove('entra', 'cambia');
    });
    var vista = $('#vista-' + v);
    void vista.offsetWidth;
    // La primera vez entra con calma; al cambiar de pestaña (muchas veces al día) solo un fundido corto.
    vista.classList.add(mostrarVista._ya ? 'cambia' : 'entra');
    mostrarVista._ya = true;
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

    registrarSW();
  }

  /**
   * Actualización de la app. En iPhone la app instalada casi nunca se cierra de verdad: al volver,
   * iOS la despierta sin recargar y nunca revisa si hay versión nueva. Por eso:
   * - se revisa al abrir y cada vez que vuelve al frente (sin caché HTTP);
   * - cuando la versión nueva toma el control, se recarga sola si no hay una hoja abierta.
   */
  function registrarSW() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    var habia = !!navigator.serviceWorker.controller, recargando = false;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
      var revisar = function () { reg.update().catch(function () {}); };
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') revisar(); });
      setInterval(revisar, 30 * 60 * 1000);
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!habia || recargando) { habia = true; return; }
      recargando = true;
      var recargar = function () { location.reload(); };
      if ($('#hoja-capa') && !$('#hoja-capa').hidden) {
        // No interrumpir mientras anota: recarga al cerrar la hoja o al volver a la app.
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') recargar(); });
        var obs = new MutationObserver(function () { if ($('#hoja-capa').hidden) recargar(); });
        obs.observe($('#hoja-capa'), { attributes: true, attributeFilter: ['hidden'] });
      } else recargar();
    });
    if (window.caches) caches.keys().then(function (ks) {
      var v = ks.filter(function (k) { return k.indexOf('caudal-v') === 0; })[0];
      if (v && $('#version-app')) $('#version-app').textContent = ' · versión ' + v.replace('caudal-v', '');
    }).catch(function () {});
  }

  arrancar();
})();
