/* Dictée — pantallas, sesiones, sincronización con Google Sheets. */
(function () {
  'use strict';
  const L = window.Logic;
  const SESSION_SIZE = 50;
  const $app = document.getElementById('app');

  // ---------- Vocabulario de ejemplo (el mismo que crea el script del Sheet) ----------
  const SAMPLE = [
    ['1', 'Hola', 'Bonjour', 'Salut', ''],
    ['2', 'Gracias', 'Merci', '', ''],
    ['3', 'Por favor', "S'il vous plaît", "S'il te plaît", ''],
    ['4', 'Sí', 'Oui', '', ''],
    ['5', 'El queso', 'Le fromage', '', ''],
    ['6', 'La casa', 'La maison', '', ''],
    ['7', 'El agua', "L'eau", '', ''],
    ['8', 'Mi hermana', 'Ma sœur', '', ''],
    ['9', 'El alumno', "L'élève", '', ''],
    ['10', 'Estoy cansada', 'Je suis fatiguée', 'Je me sens fatiguée', 'Femenino'],
    ['11', 'Tengo hambre', "J'ai faim", '', ''],
    ['12', '¿Cómo estás?', 'Comment ça va ?', 'Ça va ? | Comment vas-tu ?', ''],
    ['13', 'No lo sé', 'Je ne sais pas', '', ''],
    ['14', 'Hoy hace buen tiempo', "Il fait beau aujourd'hui", "Aujourd'hui, il fait beau", ''],
    ['15', '¿Dónde está la estación?', 'Où est la gare ?', '', 'Estación de tren'],
    ['16', 'Me gusta el café', "J'aime le café", '', ''],
    ['17', 'Mañana', 'Demain', '', ''],
    ['18', 'El fin de semana', 'Le week-end', '', ''],
    ['19', 'Trabajo en una oficina', 'Je travaille dans un bureau', '', ''],
    ['20', '¿Cuánto cuesta?', 'Combien ça coûte ?', 'Ça coûte combien ?', '']
  ].map(([id, es, fr, alts, note]) => ({ id, es, fr, alts: alts ? alts.split('|').map(s => s.trim()).filter(Boolean) : [], active: true, note }));

  // ---------- Almacenamiento local ----------
  const K = { cfg: 'dictee.cfg', vocab: 'dictee.vocab', events: 'dictee.events', run: 'dictee.run', known: 'dictee.known', last: 'dictee.lastRun' };
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('No se pudo guardar', key, e); }
  }

  const state = {
    cfg: load(K.cfg, { url: '' }),
    vocab: load(K.vocab, null),          // { items, at, source: 'sheet'|'sample' }
    events: load(K.events, []),
    run: load(K.run, null),
    known: load(K.known, {}),            // copia de todas las entradas vistas alguna vez
    lastRun: load(K.last, null),         // resumen de la última ronda terminada
    sync: { busy: false, error: '', at: null },
    view: 'home',
    calMonth: null
  };
  if (!state.vocab) state.vocab = { items: SAMPLE, at: null, source: 'sample' };
  rememberItems(state.vocab.items);

  function rememberItems(items) {
    items.forEach(it => { state.known[it.id] = it; });
    save(K.known, state.known);
  }
  const today = () => L.localDate();
  const activeItems = () => state.vocab.items.filter(it => it.active);
  const todayEvents = () => state.events.filter(e => e.d === today());
  const todaySummary = () => L.summarizeDay(todayEvents());
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pendingSync = () => state.events.filter(e => !e.x).length;

  if (state.run && state.run.date !== today()) { state.run = null; save(K.run, null); }

  // ---------- Utilidades de interfaz ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = x => Math.round(x * 100) + ' %';
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    almost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/><path d="M15 19h5" /></svg>',
    wrong: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  function go(view) { state.view = view; render(); window.scrollTo(0, 0); }

  function render() {
    const views = { home: renderHome, quiz: renderQuiz, summary: renderSummary, stats: renderStats, settings: renderSettings };
    (views[state.view] || renderHome)();
  }

  // ---------- Inicio ----------
  function dayStatusText(sum) {
    if (sum.completed) {
      return {
        title: 'Día completado',
        detail: sum.via === '80'
          ? 'Con un ' + pct(sum.best) + ' en la ronda principal.'
          : 'Has llegado al 90 % con el repaso de las falladas.',
        done: true
      };
    }
    if (sum.sessions.length) {
      const r = sum.bestRescue;
      const need = r ? Math.max(0, Math.ceil(L.RESCUE_GOAL * r.n - 1e-9) - r.score) : 0;
      return {
        title: 'Aún no completado',
        detail: 'Mejor ronda principal: ' + pct(sum.best) + '. ' +
          (sum.pending.length && need > 0
            ? (need === 1 ? 'Te falta 1 acierto' : 'Te faltan ' + need + ' aciertos') + ' en el repaso para llegar al 90 %.'
            : 'Haz otra sesión y llega al 80 %.'),
        done: false
      };
    }
    const n = Math.min(SESSION_SIZE, activeItems().length);
    return { title: 'Pendiente', detail: plural(n, 'pregunta', 'preguntas') + ' para hoy. Necesitas un 80 % para completar el día.', done: false };
  }

  function renderHome() {
    const sum = todaySummary();
    const st = dayStatusText(sum);
    const streak = L.streaks(L.daysTable(state.events), today());
    const run = state.run;
    const n = activeItems().length;
    const primary = run
      ? `<button class="btn btn-primary" data-act="continue">Continuar ${run.kind === 'main' ? 'la sesión' : 'el repaso'} (${run.idx} de ${run.items.length})</button>`
      : `<button class="btn btn-primary" data-act="start" ${n ? '' : 'disabled'}>${sum.sessions.length ? 'Nueva sesión' : 'Empezar sesión'}</button>`;
    const review = !run && sum.pending.length
      ? `<button class="btn" data-act="review">Repasar falladas (${sum.pending.length})</button>` : '';

    $app.innerHTML = `
      <div class="topbar">
        <span></span>
        <button class="icon-btn" data-act="settings" aria-label="Ajustes">${ICON.gear}</button>
      </div>
      <h1 class="home-title">Dictée</h1>
      <p class="home-sub">Francés escrito, cada día.</p>

      <section class="today" aria-label="Hoy">
        <p class="today-state ${st.done ? 'is-done' : ''}">${esc(st.title)}</p>
        <p class="today-detail">${esc(st.detail)}</p>
        <div class="today-meta">
          <div><div class="meta-num">${streak.current}</div><div class="meta-lbl">${streak.current === 1 ? 'día de racha' : 'días de racha'}</div></div>
          <div><div class="meta-num">${sum.sessions.length}</div><div class="meta-lbl">${sum.sessions.length === 1 ? 'sesión hoy' : 'sesiones hoy'}</div></div>
          <div><div class="meta-num">${sum.failedIds.length}</div><div class="meta-lbl">falladas hoy</div></div>
        </div>
      </section>

      <div class="home-actions stack">
        ${primary}
        ${review}
        <button class="btn" data-act="stats">Estadísticas</button>
      </div>
      <p class="sync-line">${syncLine()}</p>
    `;
  }

  function syncLine() {
    const v = state.vocab;
    const count = plural(activeItems().length, 'entrada activa', 'entradas activas');
    if (!state.cfg.url) {
      return `${count} de ejemplo. <button data-act="settings">Conectar tu Google Sheet</button>`;
    }
    if (state.sync.busy) return `${count} · Sincronizando…`;
    const parts = [count];
    if (v.at) parts.push('actualizado ' + timeAgo(v.at));
    const p = pendingSync();
    let txt = parts.join(', ') + '.';
    if (p) txt += ' ' + plural(p, 'respuesta pendiente', 'respuestas pendientes') + ' de enviar.';
    if (state.sync.error) txt = `<span class="sync-error">${esc(state.sync.error)}</span> ` + txt;
    return txt + ' <button data-act="sync">Actualizar</button>';
  }

  function timeAgo(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 60000;
    if (diff < 1) return 'ahora mismo';
    if (diff < 60) return 'hace ' + Math.round(diff) + ' min';
    if (diff < 60 * 24) return 'hace ' + Math.round(diff / 60) + ' h';
    return 'hace ' + Math.round(diff / 1440) + ' días';
  }

  // ---------- Sesiones ----------
  function startSession() {
    const sum = todaySummary();
    const picked = L.pickSession(activeItems(), sum.askedMain, SESSION_SIZE);
    if (!picked.length) return;
    state.run = {
      date: today(), kind: 'main', s: sum.nextSession, round: 0,
      items: picked.map(it => ({ id: it.id, es: it.es, fr: it.fr, alts: it.alts || [], note: it.note || '', s: sum.nextSession })),
      idx: 0, hits: 0, answered: null
    };
    save(K.run, state.run);
    go('quiz');
    focusAnswer();
  }

  function startReview() {
    const sum = todaySummary();
    if (!sum.pending.length) return;
    const items = sum.pending
      .map(p => {
        const it = state.vocab.items.find(x => x.id === p.id) || state.known[p.id];
        return it ? { id: it.id, es: it.es, fr: it.fr, alts: it.alts || [], note: it.note || '', s: p.s } : null;
      })
      .filter(Boolean);
    // orden aleatorio
    for (let i = items.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [items[i], items[k]] = [items[k], items[i]]; }
    state.run = { date: today(), kind: 'review', s: 0, round: sum.nextRound, items, idx: 0, hits: 0, answered: null };
    save(K.run, state.run);
    go('quiz');
    focusAnswer();
  }

  function focusAnswer() {
    const el = document.getElementById('answer');
    if (el && !el.readOnly) el.focus({ preventScroll: true });
  }

  function submitAnswer(text) {
    const run = state.run;
    if (!run || run.answered) return;
    const item = run.items[run.idx];
    const result = L.checkAnswer(text, item);
    const e = {
      u: uid(), t: L.localDateTime(), d: run.date, s: item.s, r: run.kind === 'main' ? 0 : run.round,
      n: run.kind === 'main' ? run.items.length : 0, id: item.id, a: text.trim(), res: result.status
    };
    state.events.push(e);
    save(K.events, state.events);
    if (result.status !== 'I') run.hits++;
    run.answered = { text: text.trim(), result };
    save(K.run, run);
    renderQuiz();
    if (state.events.filter(x => !x.x).length >= 10) syncPush();
  }

  function nextQuestion() {
    const run = state.run;
    if (!run || !run.answered) return;
    run.idx++;
    run.answered = null;
    if (run.idx >= run.items.length) {
      finishRun();
      return;
    }
    save(K.run, run);
    renderQuiz();
    focusAnswer();
  }

  function finishRun() {
    const run = state.run;
    state.lastRun = { kind: run.kind, s: run.s, round: run.round, total: run.items.length, hits: run.hits, date: run.date };
    save(K.last, state.lastRun);
    state.run = null;
    save(K.run, null);
    go('summary');
    syncAll();
  }

  // ---------- Pantalla de pregunta ----------
  function marked(parts) {
    return parts.map(p => p.mark === 'ok' ? esc(p.ch) : `<mark class="${p.mark}">${esc(p.ch)}</mark>`).join('');
  }

  function resultHtml(item, ans) {
    const r = ans.result;
    const main = item.fr;
    const ref = r.matched || main;
    const m = L.diffMarks(ans.text, ref);
    let head, body = '';
    if (r.status === 'C') {
      head = `<p class="verdict">${ICON.ok} ¡Correcto!</p>`;
      body = `<p class="r-text correct">${esc(ref)}</p>`;
    } else if (r.status === 'K') {
      head = `<p class="verdict">${ICON.almost} ¡Casi! Cuenta como acierto</p>`;
      body = `<p class="r-label">${r.accentsOnly ? 'Revisa los acentos' : 'Respuesta correcta'}</p>
              <p class="r-text correct">${marked(m.target)}</p>
              <p class="r-label">Tu respuesta</p>
              <p class="r-text mine">${marked(m.answer)}</p>`;
    } else {
      // Solo se marcan las diferencias si la respuesta se parece; si no, las marcas serían ruido
      const close = ans.text && r.distance <= Math.max(3, Math.round(L.stripAccents(L.normBase(ref)).length * 0.35));
      head = `<p class="verdict">${ICON.wrong} Incorrecto</p>`;
      body = `<p class="r-label">Respuesta correcta</p>
              <p class="r-text correct">${close ? marked(m.target) : esc(ref)}</p>
              <p class="r-label">Tu respuesta</p>
              <p class="r-text mine">${!ans.text ? '<span class="r-empty">Sin respuesta</span>' : close ? marked(m.answer) : esc(ans.text)}</p>`;
    }
    if (r.isAlt && r.status !== 'I') {
      body += `<p class="r-label">Has usado una alternativa válida. La respuesta principal es:</p>
               <p class="r-text mine">${esc(main)}</p>`;
    } else if (r.isAlt && r.status === 'I') {
      body += `<p class="r-label">También vale:</p><p class="r-text mine">${esc(main)}</p>`;
    }
    return `<div class="result is-${r.status}" role="status">${head}${body}</div>`;
  }

  function renderQuiz() {
    const run = state.run;
    if (!run) { go('home'); return; }
    const item = run.items[run.idx];
    const ans = run.answered;
    const total = run.items.length;
    const label = run.kind === 'main'
      ? `Pregunta ${run.idx + 1} de ${total}`
      : `Repaso ${run.round} · ${run.idx + 1} de ${total}`;
    const done = run.idx + (ans ? 1 : 0);

    $app.innerHTML = `
      <div class="topbar">
        <button class="icon-btn" data-act="exit" aria-label="Salir al inicio">${ICON.close}</button>
        <h1>${esc(label)}</h1>
        <span class="icon-btn" aria-label="Puntos">${run.hits} pts</span>
      </div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><span style="width:${(done / total) * 100}%"></span></div>

      <p class="prompt-hint">Escribe en francés</p>
      <p class="prompt" lang="es">${esc(item.es)}</p>
      ${item.note ? `<p class="prompt-note">${esc(item.note)}</p>` : ''}

      <form id="qform" autocomplete="off">
        <div class="field">
          <input id="answer" class="answer" type="text" lang="fr" inputmode="text"
            autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="${ans ? 'next' : 'done'}"
            aria-label="Tu traducción al francés" placeholder="Écris ici…" ${ans ? 'readonly' : ''} value="${ans ? esc(ans.text) : ''}">
        </div>
        ${ans ? resultHtml(item, ans) : ''}
        ${ans
          ? `<button class="btn btn-primary" type="submit" id="nextBtn">${run.idx + 1 >= total ? 'Ver resultado' : 'Siguiente'}</button>`
          : `<div class="btn-row">
               <button class="btn" type="button" data-act="skip">No lo sé</button>
               <button class="btn btn-primary" type="submit">Comprobar</button>
             </div>`}
      </form>
    `;
    const form = document.getElementById('qform');
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      if (state.run && state.run.answered) nextQuestion();
      else {
        const input = document.getElementById('answer');
        input.blur();
        submitAnswer(input.value);
      }
    });
    if (ans) {
      const btn = document.getElementById('nextBtn');
      if (btn) btn.focus({ preventScroll: true });
    }
  }

  // ---------- Resumen ----------
  function renderSummary() {
    const lr = state.lastRun;
    if (!lr) { go('home'); return; }
    const sum = todaySummary();
    const st = dayStatusText(sum);
    let head;
    if (lr.kind === 'main') {
      head = `<p class="prompt-hint">Sesión ${lr.s} terminada</p>
              <p class="score-big">${lr.hits}<small> / ${lr.total}</small></p>
              <p class="score-pct">${pct(lr.hits / lr.total)} de aciertos en la ronda principal</p>`;
    } else {
      const r = sum.bestRescue;
      head = `<p class="prompt-hint">Repaso ${lr.round} terminado</p>
              <p class="score-big">${lr.hits}<small> / ${lr.total}</small></p>
              <p class="score-pct">${r ? `Sesión ${r.s}: ${r.score} de ${r.n} sumando los repasos (${pct(r.scorePct)})` : ''}</p>`;
    }
    const canReview = sum.pending.length > 0;
    $app.innerHTML = `
      <div class="topbar">
        <button class="icon-btn" data-act="home" aria-label="Volver al inicio">${ICON.back} Inicio</button>
        <span></span>
      </div>
      ${head}
      <div class="day-box ${st.done ? 'done' : 'not'}">
        <h3>${esc(st.title)}</h3>
        <p>${esc(st.detail)}</p>
      </div>
      <div class="stack home-actions">
        ${canReview ? `<button class="btn ${st.done ? '' : 'btn-primary'}" data-act="review">Repasar falladas (${sum.pending.length})</button>` : ''}
        <button class="btn ${canReview && !st.done ? '' : 'btn-primary'}" data-act="start">Nueva sesión</button>
        <button class="btn btn-quiet" data-act="home">Volver al inicio</button>
      </div>
    `;
  }

  // ---------- Estadísticas ----------
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function renderStats() {
    const days = L.daysTable(state.events);
    const streak = L.streaks(days, today());
    const stats = L.itemStats(state.events);
    const active = activeItems();
    const mastered = active.filter(it => stats[it.id] && stats[it.id].mastered).length;
    const byId = {}; state.vocab.items.forEach(it => { byId[it.id] = it; });
    const fails = Object.values(stats)
      .filter(s => s.fails > 0 && byId[s.id])
      .sort((a, b) => b.fails - a.fails || b.fails / b.seen - a.fails / a.seen)
      .slice(0, 10);

    $app.innerHTML = `
      <div class="topbar">
        <button class="icon-btn" data-act="home" aria-label="Volver al inicio">${ICON.back} Inicio</button>
        <h1>Estadísticas</h1>
        <span style="width:44px"></span>
      </div>

      <div class="tiles">
        <div class="tile"><div class="meta-num">${streak.current}</div><div class="meta-lbl">racha actual</div></div>
        <div class="tile"><div class="meta-num">${streak.best}</div><div class="meta-lbl">racha máxima</div></div>
      </div>

      <section class="section" aria-label="Calendario">
        <h2>Calendario</h2>
        ${calendarHtml(days)}
      </section>

      <section class="section">
        <h2>Evolución del % de aciertos</h2>
        ${chartHtml(days)}
      </section>

      <section class="section">
        <h2>Las que más fallas</h2>
        ${fails.length ? `<ul class="fail-list">${fails.map(s => `
          <li><div><div class="fail-es">${esc(byId[s.id].es)}</div><div class="fail-fr" lang="fr">${esc(byId[s.id].fr)}</div></div>
          <div class="fail-num">${s.fails} de ${s.seen}</div></li>`).join('')}</ul>`
          : '<p class="empty">Todavía no has fallado ninguna.</p>'}
      </section>

      <section class="section">
        <h2>Progreso del vocabulario</h2>
        <div class="tile">
          <div class="meta-num">${mastered} <span class="meta-lbl">de ${active.length} dominadas</span></div>
          <div class="bar"><span style="width:${active.length ? (mastered / active.length) * 100 : 0}%"></span></div>
          <p class="help">Una entrada está dominada cuando la aciertas las últimas 3 veces que sale.</p>
        </div>
      </section>
    `;
    wireChart();
  }

  function calendarHtml(days) {
    const t = today();
    if (!state.calMonth) state.calMonth = t.slice(0, 7);
    const [y, m] = state.calMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const daysIn = new Date(y, m, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // lunes primero
    let cells = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => `<div class="dow">${d}</div>`).join('');
    for (let i = 0; i < offset; i++) cells += '<div></div>';
    for (let d = 1; d <= daysIn; d++) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const info = days[key];
      const cls = info ? (info.completed ? 'done' : 'tried') : 'none';
      const label = info ? (info.completed ? 'completado' : 'intentado sin completar') : 'sin practicar';
      cells += `<div class="day ${cls} ${key === t ? 'is-today' : ''}" title="${d}: ${label}" aria-label="${d} de ${MONTHS[m - 1]}: ${label}">${d}</div>`;
    }
    return `
      <div class="cal-head">
        <button class="icon-btn" data-act="cal-prev" aria-label="Mes anterior">${ICON.back}</button>
        <strong>${MONTHS[m - 1]} ${y}</strong>
        <button class="icon-btn" data-act="cal-next" aria-label="Mes siguiente" style="transform:scaleX(-1)">${ICON.back}</button>
      </div>
      <div class="cal">${cells}</div>
      <div class="legend">
        <span><i style="background:var(--go)"></i>Completado</span>
        <span><i style="background:var(--warn-wash);border:1.5px solid var(--warn-edge)"></i>Sin completar</span>
      </div>`;
  }

  function chartHtml(days) {
    const pts = Object.values(days).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-30);
    if (pts.length < 2) return '<p class="empty">Aparecerá cuando hayas practicado al menos dos días.</p>';
    const W = 520, H = 220, l = 40, r = 14, tp = 14, b = 30;
    // Eje x a escala de fechas, para que se vean los días sin practicar
    const dnum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8)) / 864e5;
    const d0 = dnum(pts[0].date), span = Math.max(1, dnum(pts[pts.length - 1].date) - d0);
    const x = i => l + ((dnum(pts[i].date) - d0) / span) * (W - l - r);
    const yv = v => tp + (1 - v) * (H - tp - b);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yv(p.best).toFixed(1)).join(' ');
    const ticks = [0, 0.5, 0.8, 1];
    const fmt = d => Number(d.slice(8)) + '/' + Number(d.slice(5, 7));
    const xl = [0, Math.floor((pts.length - 1) / 2), pts.length - 1];
    state.chartPts = pts.map((p, i) => ({ x: x(i), y: yv(p.best), label: fmt(p.date) + ': ' + pct(p.best) + (p.completed ? ' · completado' : '') }));
    return `<div class="chart" id="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mejor porcentaje de aciertos por día, últimos ${pts.length} días practicados">
        ${ticks.map(v => `<line x1="${l}" x2="${W - r}" y1="${yv(v)}" y2="${yv(v)}" stroke="var(--line)" stroke-width="1" ${v === 0.8 ? 'stroke-dasharray="4 4" stroke="var(--ink-soft)"' : ''}/>
          <text x="${l - 8}" y="${yv(v) + 4}" text-anchor="end" font-size="12" fill="var(--ink-soft)">${v * 100}%</text>`).join('')}
        <path d="${path}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${yv(p.best)}" r="4" fill="${p.completed ? 'var(--go)' : 'var(--surface)'}" stroke="${p.completed ? 'var(--surface)' : 'var(--ink)'}" stroke-width="2"/>`).join('')}
        ${xl.map(i => `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}" font-size="12" fill="var(--ink-soft)">${fmt(pts[i].date)}</text>`).join('')}
        <rect id="chartHit" x="${l}" y="0" width="${W - l - r}" height="${H}" fill="transparent"/>
      </svg>
      <div class="chart-tip" id="chartTip" hidden></div>
    </div>
    <div class="legend"><span><i style="background:var(--go)"></i>Día completado</span><span><i style="border:2px solid var(--ink)"></i>Sin completar</span><span><i style="height:0;border-top:2px dashed var(--ink-soft);border-radius:0"></i>Objetivo 80 %</span></div>`;
  }

  function wireChart() {
    const box = document.getElementById('chart');
    if (!box) return;
    const svg = box.querySelector('svg');
    const tip = document.getElementById('chartTip');
    const show = ev => {
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / svg.viewBox.baseVal.width;
      const cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left) / scale;
      let best = state.chartPts[0];
      state.chartPts.forEach(p => { if (Math.abs(p.x - cx) < Math.abs(best.x - cx)) best = p; });
      tip.hidden = false;
      tip.textContent = best.label;
      tip.style.left = (best.x * scale + (rect.left - box.getBoundingClientRect().left)) + 'px';
      tip.style.top = (best.y * scale + (rect.top - box.getBoundingClientRect().top)) + 'px';
    };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  }

  // ---------- Ajustes ----------
  function renderSettings(msg) {
    $app.innerHTML = `
      <div class="topbar">
        <button class="icon-btn" data-act="home" aria-label="Volver al inicio">${ICON.back} Inicio</button>
        <h1>Ajustes</h1>
        <span style="width:44px"></span>
      </div>

      <form id="cfgform">
        <label class="field-label" for="url">Enlace del script de tu Google Sheet</label>
        <input id="url" class="text-input" type="url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false"
          placeholder="https://script.google.com/macros/s/…/exec" value="${esc(state.cfg.url)}">
        <p class="help">Lo obtienes al implementar el script como aplicación web (paso 3 de la guía). Termina en <strong>/exec</strong>. Se guarda solo en este móvil.</p>
        <div class="stack" style="margin-top:16px">
          <button class="btn btn-primary" type="submit">Guardar y conectar</button>
        </div>
        ${msg ? `<p class="status-msg ${msg.ok ? 'ok' : 'err'}" role="status">${esc(msg.text)}</p>` : ''}
      </form>

      <section class="section">
        <h2>Datos en este móvil</h2>
        <p class="help">${plural(state.events.length, 'respuesta guardada', 'respuestas guardadas')}, ${plural(pendingSync(), 'pendiente', 'pendientes')} de enviar al Sheet.</p>
        <div class="stack" style="margin-top:12px">
          ${state.cfg.url ? '<button class="btn" data-act="sync">Sincronizar ahora</button>' : ''}
          <button class="btn btn-quiet danger" data-act="reset">Borrar los datos de este móvil</button>
        </div>
      </section>
    `;
    document.getElementById('cfgform').addEventListener('submit', async ev => {
      ev.preventDefault();
      const url = document.getElementById('url').value.trim();
      if (url && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
        renderSettings({ ok: false, text: 'El enlace no parece correcto: debe empezar por https://script.google.com/ y terminar en /exec.' });
        return;
      }
      state.cfg.url = url;
      save(K.cfg, state.cfg);
      if (!url) {
        renderSettings({ ok: true, text: 'Desconectado. Se usará el vocabulario guardado en el móvil.' });
        return;
      }
      renderSettings({ ok: true, text: 'Conectando…' });
      const ok = await syncAll();
      renderSettings(ok
        ? { ok: true, text: 'Conectado. ' + plural(activeItems().length, 'entrada activa', 'entradas activas') + ' descargadas.' }
        : { ok: false, text: 'No se ha podido conectar: ' + state.sync.error });
    });
  }

  // ---------- Sincronización con Google Sheets ----------
  function daysForEvents(evs) {
    const dates = Array.from(new Set(evs.map(e => e.d)));
    const all = L.daysTable(state.events);
    return dates.map(d => all[d]).filter(Boolean);
  }

  async function syncPush() {
    if (!state.cfg.url || state.sync.busy || !navigator.onLine) return false;
    const pending = state.events.filter(e => !e.x);
    if (!pending.length) return true;
    state.sync.busy = true;
    try {
      const res = await fetch(state.cfg.url, {
        method: 'POST',
        body: JSON.stringify({ action: 'push', events: pending.map(stripLocal), days: daysForEvents(pending) })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'respuesta inesperada del Sheet');
      const sent = new Set(pending.map(e => e.u));
      state.events.forEach(e => { if (sent.has(e.u)) e.x = 1; });
      save(K.events, state.events);
      state.sync.error = '';
      return true;
    } catch (err) {
      state.sync.error = errorText(err);
      return false;
    } finally {
      state.sync.busy = false;
    }
  }

  function stripLocal(e) { const c = Object.assign({}, e); delete c.x; return c; }

  async function syncPull() {
    if (!state.cfg.url || !navigator.onLine) return false;
    state.sync.busy = true;
    try {
      const res = await fetch(state.cfg.url + '?action=get&t=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'respuesta inesperada del Sheet');
      if (!Array.isArray(data.vocab)) throw new Error('el Sheet no ha devuelto vocabulario');
      state.vocab = { items: data.vocab, at: new Date().toISOString(), source: 'sheet' };
      save(K.vocab, state.vocab);
      rememberItems(data.vocab);
      // Une el historial del Sheet con el del móvil
      const local = new Map(state.events.map(e => [e.u, e]));
      (data.events || []).forEach(se => {
        const e = local.get(se.u);
        if (e) e.x = 1; else local.set(se.u, Object.assign({}, se, { x: 1 }));
      });
      state.events = Array.from(local.values()).sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
      save(K.events, state.events);
      state.sync.error = '';
      return true;
    } catch (err) {
      state.sync.error = errorText(err);
      return false;
    } finally {
      state.sync.busy = false;
    }
  }

  function errorText(err) {
    if (!navigator.onLine) return 'Sin conexión.';
    if (err && err.name === 'SyntaxError') return 'El enlace no devuelve datos del script. Revisa que sea el de la implementación (/exec) y que el acceso sea "Cualquier usuario".';
    return 'No se ha podido sincronizar (' + (err && err.message ? err.message : 'error de red') + ').';
  }

  async function syncAll() {
    if (!state.cfg.url) return false;
    if (state.view === 'home') { state.sync.busy = true; render(); state.sync.busy = false; }
    const pushed = await syncPush();
    const pulled = await syncPull();
    if (state.view === 'home' || state.view === 'summary') render();
    return pushed && pulled;
  }

  // ---------- Eventos ----------
  $app.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    switch (act) {
      case 'start': startSession(); break;
      case 'continue': go('quiz'); focusAnswer(); break;
      case 'review': startReview(); break;
      case 'skip': submitAnswer(''); break;
      case 'exit': go('home'); break;
      case 'home': go('home'); break;
      case 'stats': state.calMonth = null; go('stats'); break;
      case 'settings': go('settings'); break;
      case 'sync': syncAll().then(() => { if (state.view === 'settings') renderSettings(state.sync.error ? { ok: false, text: state.sync.error } : { ok: true, text: 'Sincronizado.' }); }); break;
      case 'cal-prev': case 'cal-next': {
        const [y, m] = state.calMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + (act === 'cal-prev' ? -1 : 1), 1);
        state.calMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        renderStats();
        break;
      }
      case 'reset':
        if (confirm('Se borrarán el vocabulario, las respuestas y los ajustes guardados en este móvil. Lo que ya esté en el Google Sheet no se toca. ¿Continuar?')) {
          Object.values(K).forEach(k => localStorage.removeItem(k));
          location.reload();
        }
        break;
    }
  });

  document.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && state.view === 'quiz' && state.run && state.run.answered && document.activeElement === document.body) {
      ev.preventDefault();
      nextQuestion();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') syncPush();
  });
  window.addEventListener('online', () => syncAll());

  // Si cambia el día con la app abierta, refresca el inicio
  let lastDay = today();
  setInterval(() => {
    if (today() !== lastDay) {
      lastDay = today();
      if (state.run && state.run.date !== lastDay && !state.run.answered && state.run.idx === 0) { state.run = null; save(K.run, null); }
      if (state.view === 'home') render();
    }
  }, 60000);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  render();
  syncAll();
})();
