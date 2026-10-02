/* =========================================================
   VerboVerde — lógica de la app
   Requiere js/verbos.js (define la constante VERBOS).
   ========================================================= */
(function () {
  'use strict';

  const CLAVE_STORAGE = 'verboverde:progreso:v1';
  const PREGUNTAS_POR_RONDA = 10;
  const ACIERTOS_PARA_DOMINAR = 3;

  const TIPOS = {
    completar: 'Completar formas',
    opcion: 'Opción múltiple',
    traduccion: 'Traducción'
  };
  const NOMBRE_FORMA = {
    base: 'infinitivo',
    pasado: 'pasado',
    participio: 'participio',
    gerundio: 'gerundio'
  };

  const ICONO_VOZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  /* ---------------------------------------------------------
     Utilidades
     --------------------------------------------------------- */
  function esc(t) {
    return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function barajar(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function azar(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function normalizar(t) {
    return String(t)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[.,;:¡!¿?"“”]/g, ' ')
      .replace(/[’`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^to /, '');
  }

  /** Lista de variantes aceptadas: "was/were" -> ["was", "were"] */
  function variantes(valor) { return valor.split('/').map(normalizar); }
  function primera(valor) { return valor.split('/')[0]; }
  function mostrarForma(valor) { return valor.split('/').join(' / '); }

  /** Acepta "was", "were", "was/were", "was, were", "was or were"… */
  function esCorrecta(respuesta, valor) {
    const validas = variantes(valor);
    const limpia = String(respuesta).toLowerCase().trim();
    if (!limpia) return false;
    const partes = limpia.split(/\s*(?:\/|,| or | o )\s*/).map(normalizar).filter(Boolean);
    return partes.length > 0 && partes.every(p => validas.includes(p));
  }

  /** Forma regular inventada para distractores: choose -> choosed */
  function regularizar(base) {
    const palabras = base.split(' ');
    const v = palabras[0];
    let r;
    if (/e$/.test(v)) r = v + 'd';
    else if (/[^aeiou]y$/.test(v)) r = v.slice(0, -1) + 'ied';
    else r = v + 'ed';
    palabras[0] = r;
    return palabras.join(' ');
  }

  function fechaLocal(d = new Date()) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function ayer() { const d = new Date(); d.setDate(d.getDate() - 1); return fechaLocal(d); }

  function porcentaje(ok, total) { return total ? Math.round((ok / total) * 100) : 0; }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function textoFlotante(texto, origen) {
    const r = origen.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'flotante';
    el.textContent = texto;
    el.style.left = (r.left + r.width / 2) + 'px';
    el.style.top = (r.top + 10) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  /* ---------------------------------------------------------
     Estado y localStorage
     --------------------------------------------------------- */
  function estadoInicial() {
    return {
      verbos: {}, // base -> { ok, fallos, seguidos, ultimo }
      tipos: {
        completar: { ok: 0, total: 0 },
        opcion: { ok: 0, total: 0 },
        traduccion: { ok: 0, total: 0 }
      },
      racha: { ultimo: null, dias: 0, mejor: 0 }
    };
  }

  function cargar() {
    const base = estadoInicial();
    try {
      const raw = localStorage.getItem(CLAVE_STORAGE);
      if (!raw) return base;
      const d = JSON.parse(raw);
      return {
        verbos: d.verbos || {},
        tipos: Object.assign(base.tipos, d.tipos || {}),
        racha: Object.assign(base.racha, d.racha || {})
      };
    } catch (e) {
      return base;
    }
  }

  function guardar() {
    try { localStorage.setItem(CLAVE_STORAGE, JSON.stringify(estado)); } catch (e) { /* modo privado o sin espacio */ }
  }

  let estado = cargar();

  function stats(base) {
    if (!estado.verbos[base]) estado.verbos[base] = { ok: 0, fallos: 0, seguidos: 0 };
    return estado.verbos[base];
  }

  function registrar(base, correcto, tipo) {
    const s = stats(base);
    if (correcto) { s.ok++; s.seguidos++; } else { s.fallos++; s.seguidos = 0; }
    s.ultimo = Date.now();
    if (tipo && estado.tipos[tipo]) {
      estado.tipos[tipo].total++;
      if (correcto) estado.tipos[tipo].ok++;
    }
    marcarDia();
    guardar();
  }

  function marcarDia() {
    const hoy = fechaLocal();
    const r = estado.racha;
    if (r.ultimo === hoy) return;
    r.dias = r.ultimo === ayer() ? r.dias + 1 : 1;
    r.ultimo = hoy;
    r.mejor = Math.max(r.mejor || 0, r.dias);
    actualizarRachaMini();
  }

  function rachaActual() {
    const r = estado.racha;
    return (r.ultimo === fechaLocal() || r.ultimo === ayer()) ? r.dias : 0;
  }

  function esDominado(base) {
    const s = estado.verbos[base];
    return !!s && s.seguidos >= ACIERTOS_PARA_DOMINAR;
  }

  function esDificil(base) {
    const s = estado.verbos[base];
    return !!s && s.fallos > 0 && s.seguidos < ACIERTOS_PARA_DOMINAR;
  }

  function verbosDificiles() {
    return VERBOS
      .filter(v => esDificil(v.base))
      .sort((a, b) => {
        const sa = estado.verbos[a.base], sb = estado.verbos[b.base];
        return (sb.fallos - sb.ok * 0.5) - (sa.fallos - sa.ok * 0.5);
      });
  }

  /** Los verbos fallados pesan más; los dominados, menos. */
  function peso(base) {
    const s = estado.verbos[base];
    if (!s) return 1.5;
    let w = 1 + Math.max(0, s.fallos * 2 - s.ok * 0.5);
    if (s.fallos > 0 && s.seguidos === 0) w += 2;
    if (s.seguidos >= ACIERTOS_PARA_DOMINAR) w *= 0.35;
    return w;
  }

  /** Elige n verbos sin repetir (si alcanza), según su peso. */
  function elegirPonderado(pool, n) {
    const resultado = [];
    let restantes = pool.slice();
    while (resultado.length < n) {
      if (!restantes.length) restantes = pool.slice(); // pocos verbos: se permiten repeticiones
      const pesos = restantes.map(v => peso(v.base));
      let r = Math.random() * pesos.reduce((a, b) => a + b, 0);
      let i = 0;
      while (r > pesos[i] && i < pesos.length - 1) { r -= pesos[i]; i++; }
      const elegido = restantes.splice(i, 1)[0];
      if (resultado.length && resultado[resultado.length - 1] === elegido && restantes.length) {
        restantes.push(elegido); // evita el mismo verbo dos veces seguidas
        continue;
      }
      resultado.push(elegido);
    }
    return resultado;
  }

  /* ---------------------------------------------------------
     Pronunciación (Web Speech API)
     --------------------------------------------------------- */
  const voz = { disponible: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window, voice: null };

  function elegirVoz() {
    const voces = speechSynthesis.getVoices();
    voz.voice =
      voces.find(v => /en[-_]US/i.test(v.lang) && /Google|Samantha|Natural/i.test(v.name)) ||
      voces.find(v => /en[-_]US/i.test(v.lang)) ||
      voces.find(v => /^en/i.test(v.lang)) || null;
  }

  function hablar(texto) {
    if (!voz.disponible) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'en-US';
    if (voz.voice) u.voice = voz.voice;
    u.rate = 0.85;
    speechSynthesis.speak(u);
  }

  function textoVerbo(v) {
    return [v.base, v.pasado, v.participio].map(f => f.split('/').join(', ')).join('... ');
  }

  function botonVoz(texto, extraClase = '') {
    return `<button type="button" class="btn-voz ${extraClase}" data-hablar="${esc(texto)}" aria-label="Escuchar pronunciación" title="Escuchar">${ICONO_VOZ}</button>`;
  }

  if (voz.disponible) {
    elegirVoz();
    speechSynthesis.onvoiceschanged = elegirVoz;
  } else {
    document.body.classList.add('sin-voz');
  }

  // Un solo listener para todos los botones de voz de la página
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-hablar]');
    if (!btn) return;
    e.stopPropagation();
    hablar(btn.dataset.hablar);
  }, true);

  /* ---------------------------------------------------------
     Navegación entre secciones (#hash)
     --------------------------------------------------------- */
  const RUTAS = ['estudio', 'tarjetas', 'ejercicios', 'progreso'];

  function irA(ruta) {
    if (!RUTAS.includes(ruta)) ruta = 'estudio';
    $$('[data-vista]').forEach(s => { s.hidden = s.dataset.vista !== ruta; });
    $$('.nav-link').forEach(a => {
      const activo = a.dataset.ruta === ruta;
      a.classList.toggle('activo', activo);
      if (activo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (ruta === 'estudio') renderTabla();
    if (ruta === 'tarjetas' && !fc.mazo.length) armarMazo();
    if (ruta === 'ejercicios') actualizarInicioEjercicios();
    if (ruta === 'progreso') renderProgreso();
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', () => irA(location.hash.slice(1)));

  function actualizarRachaMini() { $('#racha-mini').textContent = rachaActual(); }

  /* ---------------------------------------------------------
     1. Tabla de estudio
     --------------------------------------------------------- */
  const COLUMNAS = ['pasado', 'participio', 'gerundio', 'es'];
  const ocultas = new Set();

  function marcaEstado(base) {
    if (esDominado(base)) return '<span class="punto punto-dominado" title="Dominado"></span>';
    if (esDificil(base)) return '<span class="punto punto-dificil" title="Difícil"></span>';
    return '<span class="punto punto-vacio" title="Sin dominar"></span>';
  }

  function renderTabla() {
    const q = normalizar($('#buscar').value);
    const lista = VERBOS.filter(v =>
      !q || [v.base, v.pasado, v.participio, v.gerundio, v.es].some(x => normalizar(x).includes(q))
    );

    $('#tabla-cuerpo').innerHTML = lista.map(v => `
      <tr>
        <td>
          <div class="celda-base">
            ${botonVoz(textoVerbo(v))}
            <span><span class="to">to</span> <strong>${esc(v.base)}</strong></span>
            ${marcaEstado(v.base)}
          </div>
        </td>
        ${COLUMNAS.map(c => `<td data-col="${c}" class="${ocultas.has(c) ? 'tapada' : ''}">${esc(c === 'es' ? v.es : mostrarForma(v[c]))}</td>`).join('')}
      </tr>`).join('');

    $('#tabla-vacia').hidden = lista.length > 0;
  }

  function initTabla() {
    $('#total-verbos').textContent = VERBOS.length;
    $('#buscar').addEventListener('input', renderTabla);

    $$('.toggles .chip[data-col]').forEach(btn => {
      btn.addEventListener('click', () => {
        const col = btn.dataset.col;
        if (ocultas.has(col)) ocultas.delete(col); else ocultas.add(col);
        btn.setAttribute('aria-pressed', ocultas.has(col));
        renderTabla();
      });
    });

    $('#revelar-todo').addEventListener('click', () => {
      ocultas.clear();
      $$('.toggles .chip[data-col]').forEach(b => b.setAttribute('aria-pressed', 'false'));
      renderTabla();
    });

    // Tocar una celda tapada la revela (y otra vez la vuelve a tapar)
    $('#tabla-cuerpo').addEventListener('click', e => {
      const td = e.target.closest('td[data-col]');
      if (!td || !ocultas.has(td.dataset.col)) return;
      const tapada = td.classList.toggle('tapada');
      td.classList.toggle('revelada', !tapada);
    });
  }

  /* ---------------------------------------------------------
     2. Flashcards
     --------------------------------------------------------- */
  const fc = { mazo: [], i: 0, sabidas: 0, repasadas: 0 };

  function armarMazo() {
    const tipo = $('#fc-mazo').value;
    let lista = VERBOS;
    if (tipo === 'pendientes') lista = VERBOS.filter(v => !esDominado(v.base));
    if (tipo === 'dificiles') lista = verbosDificiles();

    if (!lista.length) {
      toast(tipo === 'dificiles' ? 'No tienes verbos difíciles todavía. Usamos todos.' : '¡Ya dominas todos! Usamos la lista completa.');
      $('#fc-mazo').value = 'todos';
      lista = VERBOS;
    }
    fc.mazo = barajar(lista);
    fc.i = 0; fc.sabidas = 0; fc.repasadas = 0;
    $('#fc-fin').hidden = true;
    $('#fc-zona').hidden = false;
    mostrarTarjeta();
  }

  function mostrarTarjeta() {
    const card = $('#flashcard');
    const v = fc.mazo[fc.i];
    // Regresa al frente sin animación para no revelar la siguiente respuesta
    card.classList.add('sin-anim');
    card.classList.remove('volteada', 'salir-ok', 'salir-repasar');
    void card.offsetWidth;
    card.classList.remove('sin-anim');

    const enIngles = $('#fc-dir').value === 'en';
    $('#fc-frente').innerHTML = enIngles
      ? `<span class="fc-etiqueta">Infinitivo</span>
         <div class="fc-palabra"><span class="to">to</span>${esc(v.base)}</div>
         ${botonVoz(v.base, 'grande')}
         <span class="fc-marca">${marcaEstado(v.base)}</span>`
      : `<span class="fc-etiqueta">¿Cómo se dice en inglés?</span>
         <div class="fc-palabra es">${esc(v.es)}</div>
         <span class="fc-marca">${marcaEstado(v.base)}</span>`;

    $('#fc-reverso').innerHTML = `
      <div class="fc-formas">
        ${['base', 'pasado', 'participio', 'gerundio'].map(f => `
          <div class="fc-forma"><small>${NOMBRE_FORMA[f]}</small><b>${esc(mostrarForma(v[f]))}</b></div>`).join('')}
      </div>
      <span class="fc-significado">${esc(v.es)}</span>
      ${botonVoz(textoVerbo(v), 'grande')}`;

    $('#fc-contador').textContent = `${fc.i + 1} / ${fc.mazo.length}`;
    $('#fc-barra').style.width = porcentaje(fc.i, fc.mazo.length) + '%';
  }

  function voltear() { $('#flashcard').classList.toggle('volteada'); }

  function responderTarjeta(laSabe) {
    const v = fc.mazo[fc.i];
    if (!v) return;
    registrar(v.base, laSabe, null);
    const card = $('#flashcard');
    if (laSabe) {
      fc.sabidas++;
      textoFlotante('+1 🌿', card);
    } else {
      fc.repasadas++;
      // Vuelve a aparecer unas tarjetas más adelante
      const pos = Math.min(fc.mazo.length, fc.i + 4 + Math.floor(Math.random() * 3));
      fc.mazo.splice(pos, 0, v);
    }
    card.classList.add(laSabe ? 'salir-ok' : 'salir-repasar');
    setTimeout(() => {
      fc.i++;
      if (fc.i >= fc.mazo.length) terminarMazo();
      else mostrarTarjeta();
    }, 280);
  }

  function terminarMazo() {
    $('#fc-barra').style.width = '100%';
    $('#fc-zona').hidden = true;
    $('#fc-fin').hidden = false;
    $('#fc-fin-texto').textContent = `Te supiste ${fc.sabidas} ${fc.sabidas === 1 ? 'tarjeta' : 'tarjetas'} y marcaste ${fc.repasadas} para repasar.`;
  }

  function initFlashcards() {
    const card = $('#flashcard');
    card.addEventListener('click', voltear);
    card.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); voltear(); }
    });
    $('#fc-sabe').addEventListener('click', () => responderTarjeta(true));
    $('#fc-repasar').addEventListener('click', () => responderTarjeta(false));
    $('#fc-barajar').addEventListener('click', armarMazo);
    $('#fc-mazo').addEventListener('change', armarMazo);
    $('#fc-dir').addEventListener('change', mostrarTarjeta);
    $('#fc-reiniciar').addEventListener('click', armarMazo);

    // Atajos: espacio voltea, → me la sé, ← repasar
    document.addEventListener('keydown', e => {
      if ($('#vista-tarjetas').hidden || $('#fc-zona').hidden) return;
      if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) return;
      if (e.key === ' ' && document.activeElement !== card) { e.preventDefault(); voltear(); }
      if (e.key === 'ArrowRight') responderTarjeta(true);
      if (e.key === 'ArrowLeft') responderTarjeta(false);
    });
  }

  /* ---------------------------------------------------------
     3. Ejercicios
     --------------------------------------------------------- */
  let ronda = null;

  function actualizarInicioEjercicios() {
    const n = verbosDificiles().length;
    $('#ej-num-dif').textContent = n;
    if (!n) $('#ej-dificiles').checked = false;
  }

  function mostrarPantallaEj(cual) {
    $('#ej-inicio').hidden = cual !== 'inicio';
    $('#ej-juego').hidden = cual !== 'juego';
    $('#ej-fin').hidden = cual !== 'fin';
  }

  function nuevaRonda(tipo, pool) {
    if (!pool) {
      pool = VERBOS;
      if ($('#ej-dificiles').checked) {
        const dif = verbosDificiles();
        if (dif.length) pool = dif;
        else toast('Aún no tienes verbos difíciles. Practicarás con todos.');
      }
    }
    const verbos = elegirPonderado(pool, PREGUNTAS_POR_RONDA);
    ronda = {
      tipo,
      pool,
      preguntas: verbos.map(v => crearPregunta(v, tipo === 'mixto' ? azar(Object.keys(TIPOS)) : tipo)),
      i: 0,
      aciertos: 0,
      fallos: [],
      respondida: false
    };
    mostrarPantallaEj('juego');
    mostrarPregunta();
  }

  function crearPregunta(v, tipo) {
    if (tipo === 'completar') {
      // Se muestra una forma y hay que escribir las otras dos
      const dada = azar(['base', 'base', 'pasado', 'participio']);
      return { tipo, v, dada, pedir: ['base', 'pasado', 'participio'].filter(f => f !== dada) };
    }
    if (tipo === 'opcion') {
      const forma = azar(['pasado', 'participio']);
      return { tipo, v, forma, opciones: generarOpciones(v, forma) };
    }
    // traducción
    return { tipo, v, forma: azar(['base', 'base', 'pasado', 'participio']) };
  }

  function generarOpciones(v, forma) {
    const correcta = mostrarForma(v[forma]);
    const invalidas = new Set(variantes(v[forma]));
    const usadas = new Set();
    const distractores = [];

    const agregar = texto => {
      const n = normalizar(texto);
      if (!n || invalidas.has(n) || usadas.has(n)) return;
      usadas.add(n);
      distractores.push(texto);
    };

    // Primero, errores típicos del mismo verbo
    const otra = forma === 'pasado' ? 'participio' : 'pasado';
    barajar([...v[otra].split('/'), v.base, regularizar(v.base), v.gerundio])
      .forEach(t => { if (distractores.length < 3) agregar(t); });

    // Si faltan, formas de otros verbos
    const otros = barajar(VERBOS.filter(x => x !== v));
    for (const x of otros) {
      if (distractores.length >= 3) break;
      agregar(primera(x[forma]));
    }

    return barajar([correcta, ...distractores.slice(0, 3)]);
  }

  function enunciadoVerbo(v, forma) {
    const texto = forma === 'base' ? `to ${v.base}` : primera(v[forma]);
    return `<div class="enunciado-verbo">${esc(texto)} ${botonVoz(forma === 'base' ? v.base : v[forma].split('/').join(', '))}</div>`;
  }

  function mostrarPregunta() {
    const p = ronda.preguntas[ronda.i];
    const cont = $('#ej-pregunta');
    ronda.respondida = false;

    $('#ej-tipo').textContent = TIPOS[p.tipo];
    $('#ej-contador').textContent = `Pregunta ${ronda.i + 1} de ${ronda.preguntas.length}`;
    $('#ej-aciertos').textContent = ronda.aciertos;
    $('#ej-barra').style.width = porcentaje(ronda.i, ronda.preguntas.length) + '%';
    $('#ej-feedback').hidden = true;
    $('#ej-form').classList.remove('acierto', 'fallo');

    const btn = $('#ej-accion');
    btn.textContent = 'Comprobar';
    btn.hidden = false;

    if (p.tipo === 'completar') {
      cont.innerHTML = `
        <p class="enunciado">Completa las formas que faltan de este verbo:</p>
        <p class="enunciado-es">Significado: <strong>${esc(p.v.es)}</strong></p>
        <div class="campos tres">
          ${['base', 'pasado', 'participio'].map(f => `
            <label class="campo-resp">
              <span>${NOMBRE_FORMA[f]}</span>
              ${f === p.dada
                ? `<div class="dato-fijo">${f === 'base' ? 'to ' : ''}${esc(mostrarForma(p.v[f]))}</div>`
                : `<input class="input" data-forma="${f}" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${f === 'base' ? 'sin «to»' : '…'}">`}
            </label>`).join('')}
        </div>`;
    } else if (p.tipo === 'opcion') {
      btn.hidden = true; // se responde tocando una opción
      cont.innerHTML = `
        <p class="enunciado">¿Cuál es el <span class="resaltar">${NOMBRE_FORMA[p.forma]}</span> de…</p>
        ${enunciadoVerbo(p.v, 'base')}
        <p class="enunciado-es">${esc(p.v.es)}</p>
        <div class="opciones">
          ${p.opciones.map((o, idx) => `
            <button type="button" class="opcion" data-valor="${esc(o)}">
              <span class="opcion-letra">${'ABCD'[idx]}</span><span>${esc(o)}</span>
            </button>`).join('')}
        </div>`;
    } else {
      cont.innerHTML = `
        <p class="enunciado">Escribe en inglés el <span class="resaltar">${NOMBRE_FORMA[p.forma]}</span> de:</p>
        <div class="enunciado-verbo">«${esc(p.v.es)}»</div>
        <p class="enunciado-es">${p.forma === 'base' ? 'Puedes escribirlo con o sin «to».' : 'Solo la forma en inglés.'}</p>
        <label class="campo-resp">
          <span>Tu respuesta</span>
          <input class="input" data-forma="${p.forma}" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Escribe aquí…">
        </label>`;
    }

    const primerInput = $('input', cont);
    if (primerInput) setTimeout(() => primerInput.focus({ preventScroll: true }), 50);
  }

  function comprobar(valorOpcion) {
    const p = ronda.preguntas[ronda.i];
    let correcto;

    if (p.tipo === 'opcion') {
      correcto = esCorrecta(valorOpcion, p.v[p.forma]);
      $$('.opcion', $('#ej-pregunta')).forEach(b => {
        b.disabled = true;
        if (esCorrecta(b.dataset.valor, p.v[p.forma])) b.classList.add('ok');
        else if (b.dataset.valor === valorOpcion) b.classList.add('mal');
      });
    } else {
      const inputs = $$('input[data-forma]', $('#ej-pregunta'));
      if (inputs.every(i => !i.value.trim())) {
        inputs[0].focus();
        toast('Escribe tu respuesta primero 🙂');
        return;
      }
      correcto = true;
      inputs.forEach(inp => {
        const ok = esCorrecta(inp.value, p.v[inp.dataset.forma]);
        inp.classList.add(ok ? 'ok' : 'mal');
        inp.readOnly = true;
        if (!ok) correcto = false;
      });
    }

    ronda.respondida = true;
    registrar(p.v.base, correcto, p.tipo);

    const form = $('#ej-form');
    void form.offsetWidth;
    form.classList.add(correcto ? 'acierto' : 'fallo');

    if (correcto) {
      ronda.aciertos++;
      $('#ej-aciertos').textContent = ronda.aciertos;
      textoFlotante(esDominado(p.v.base) && stats(p.v.base).seguidos === ACIERTOS_PARA_DOMINAR ? '¡Dominado! 🌟' : '+1', form);
    } else {
      ronda.fallos.push(p.v);
    }

    const formas = `<b>to ${esc(p.v.base)}</b> – <b>${esc(mostrarForma(p.v.pasado))}</b> – <b>${esc(mostrarForma(p.v.participio))}</b>`;
    const fb = $('#ej-feedback');
    fb.className = 'feedback ' + (correcto ? 'ok' : 'mal');
    fb.innerHTML = correcto
      ? `<span class="feedback-icono" aria-hidden="true">✅</span>
         <div>${azar(['¡Correcto!', '¡Muy bien!', '¡Excelente!', '¡Así se hace!'])}<br><small>${formas}</small></div>
         ${botonVoz(textoVerbo(p.v))}`
      : `<span class="feedback-icono" aria-hidden="true">❌</span>
         <div>Casi. La respuesta correcta es:<br>${respuestaCorrecta(p)}<br><small>${formas}</small></div>
         ${botonVoz(textoVerbo(p.v))}`;
    fb.hidden = false;

    const btn = $('#ej-accion');
    btn.hidden = false;
    btn.textContent = ronda.i + 1 < ronda.preguntas.length ? 'Siguiente →' : 'Ver resultado';
    btn.focus({ preventScroll: true });
    btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function respuestaCorrecta(p) {
    if (p.tipo === 'completar') {
      return p.pedir.map(f => `${NOMBRE_FORMA[f]}: <b>${esc(mostrarForma(p.v[f]))}</b>`).join(' · ');
    }
    return `<b>${esc(mostrarForma(p.v[p.forma]))}</b>`;
  }

  function siguiente() {
    ronda.i++;
    if (ronda.i >= ronda.preguntas.length) terminarRonda();
    else mostrarPregunta();
  }

  function terminarRonda() {
    const total = ronda.preguntas.length;
    const pct = porcentaje(ronda.aciertos, total);
    $('#ej-barra').style.width = '100%';
    mostrarPantallaEj('fin');

    const puntaje = $('#ej-fin-puntaje');
    puntaje.style.setProperty('--pct', pct + '%');
    puntaje.innerHTML = `<span>${ronda.aciertos}/${total}</span>`;

    $('#ej-fin-titulo').textContent =
      pct === 100 ? '¡Ronda perfecta! 🌟' :
      pct >= 80 ? '¡Muy bien! 🌿' :
      pct >= 50 ? '¡Vas por buen camino! 🌱' : '¡Sigue practicando! 💪';
    $('#ej-fin-texto').textContent = ronda.fallos.length
      ? 'Estos son los verbos que fallaste. Aparecerán más seguido en las próximas rondas:'
      : 'No fallaste ninguno. ¡Sigue así!';

    // Verbos únicos fallados
    const unicos = [...new Set(ronda.fallos)];
    $('#ej-fin-fallos').innerHTML = unicos.map(v =>
      `<li><b>to ${esc(v.base)}</b><span>${esc(mostrarForma(v.pasado))} – ${esc(mostrarForma(v.participio))}</span></li>`
    ).join('');
    $('#ej-fallos').hidden = unicos.length === 0;
    ronda.unicosFallados = unicos;
  }

  function initEjercicios() {
    $$('.tipo-card').forEach(b => b.addEventListener('click', () => nuevaRonda(b.dataset.tipo)));

    $('#ej-form').addEventListener('submit', e => {
      e.preventDefault();
      if (!ronda) return;
      if (ronda.respondida) siguiente();
      else if (ronda.preguntas[ronda.i].tipo !== 'opcion') comprobar();
    });

    // Enter en un campo que no es el último pasa al siguiente campo
    $('#ej-pregunta').addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || ronda.respondida) return;
      const inputs = $$('input[data-forma]', $('#ej-pregunta'));
      const idx = inputs.indexOf(e.target);
      if (idx < inputs.length - 1 && !inputs[idx + 1].value.trim()) {
        e.preventDefault();
        inputs[idx + 1].focus();
      }
    });

    $('#ej-pregunta').addEventListener('click', e => {
      const op = e.target.closest('.opcion');
      if (op && !op.disabled && !ronda.respondida) comprobar(op.dataset.valor);
    });

    $('#ej-salir').addEventListener('click', () => {
      if (ronda && ronda.i > 0 && !confirm('¿Salir de la ronda? Tus respuestas ya quedaron guardadas en tu progreso.')) return;
      ronda = null;
      actualizarInicioEjercicios();
      mostrarPantallaEj('inicio');
    });

    $('#ej-otra').addEventListener('click', () => nuevaRonda(ronda.tipo, ronda.pool));
    $('#ej-fallos').addEventListener('click', () => nuevaRonda(ronda.tipo, ronda.unicosFallados));
    $('#ej-menu').addEventListener('click', () => { actualizarInicioEjercicios(); mostrarPantallaEj('inicio'); });
  }

  /* ---------------------------------------------------------
     4. Progreso
     --------------------------------------------------------- */
  function renderProgreso() {
    const t = estado.tipos;
    const ok = Object.values(t).reduce((a, x) => a + x.ok, 0);
    const total = Object.values(t).reduce((a, x) => a + x.total, 0);
    const dominados = VERBOS.filter(v => esDominado(v.base)).length;

    $('#p-total').textContent = porcentaje(ok, total) + '%';
    $('#p-racha').textContent = rachaActual();
    $('#p-mejor').textContent = 'Mejor: ' + (estado.racha.mejor || 0);
    $('#p-dominados').textContent = dominados;
    $('#p-respondidas').textContent = total;

    $('#p-barra-dom').style.width = porcentaje(dominados, VERBOS.length) + '%';
    $('#p-dom-texto').textContent = `${dominados} de ${VERBOS.length} verbos (${porcentaje(dominados, VERBOS.length)}%)`;

    $('#p-tipos').innerHTML = Object.keys(TIPOS).map(k => `
      <div class="tipo-fila">
        <span>${TIPOS[k]}</span>
        <small>${t[k].total ? `${porcentaje(t[k].ok, t[k].total)}% · ${t[k].ok}/${t[k].total}` : 'Sin intentos'}</small>
        <div class="barra"><div class="barra-relleno" style="width:${porcentaje(t[k].ok, t[k].total)}%"></div></div>
      </div>`).join('');

    const dif = verbosDificiles();
    $('#p-dificiles').innerHTML = dif.map(v => {
      const s = estado.verbos[v.base];
      return `<li class="chip-dificil">
        <b>${esc(v.base)}</b> ${botonVoz(textoVerbo(v))}
        <small title="Fallos">${s.fallos} ✗</small>
      </li>`;
    }).join('');
    $('#p-sin-dificiles').hidden = dif.length > 0;
    $('#p-practicar').disabled = dif.length === 0;
    actualizarRachaMini();
  }

  function initProgreso() {
    $('#p-practicar').addEventListener('click', () => {
      const dif = verbosDificiles();
      if (!dif.length) return;
      $('#ej-dificiles').checked = true;
      location.hash = '#ejercicios';
      nuevaRonda('mixto', dif);
    });

    $('#p-reiniciar').addEventListener('click', () => {
      if (!confirm('¿Seguro que quieres borrar todo tu progreso? Esto no se puede deshacer.')) return;
      estado = estadoInicial();
      guardar();
      fc.mazo = [];
      renderProgreso();
      toast('Progreso reiniciado. ¡A empezar de nuevo! 🌱');
    });
  }

  /* ---------------------------------------------------------
     Inicio
     --------------------------------------------------------- */
  initTabla();
  initFlashcards();
  initEjercicios();
  initProgreso();
  actualizarRachaMini();
  irA(location.hash.slice(1));
})();
