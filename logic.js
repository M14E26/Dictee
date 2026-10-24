/* Lógica pura de la app: corrección de respuestas y cálculos del día.
   Sin acceso al DOM ni al almacenamiento, para poder probarla aparte. */
(function (root) {
  'use strict';

  const MAIN_GOAL = 0.8;   // ronda principal
  const RESCUE_GOAL = 0.9; // principal + repasos
  const SHORT_WORD = 3;    // palabras de 1 a 3 letras: sin tolerancia

  // ---------- Normalización ----------

  // Minúsculas, sin puntuación ni apóstrofos, espacios simples. Conserva acentos.
  function normBase(s) {
    return String(s == null ? '' : s)
      .normalize('NFC')
      .toLowerCase()
      .replace(/['’‘`´ʼ]/g, '')
      .replace(/[.,;:!?¿¡«»"“”„()\[\]{}…\-–—_/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripAccents(s) {
    return s
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .normalize('NFC');
  }

  // Distancia de edición: letra de más, de menos, cambiada o dos contiguas intercambiadas.
  function editDistance(a, b) {
    const n = a.length, m = b.length;
    if (!n) return m;
    if (!m) return n;
    const d = [];
    for (let i = 0; i <= n; i++) { d.push(new Array(m + 1).fill(0)); d[i][0] = i; }
    for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          v = Math.min(v, d[i - 2][j - 2] + 1);
        }
        d[i][j] = v;
      }
    }
    return d[n][m];
  }

  function shortWordsOk(answer, target) {
    const tw = target.split(' ');
    const aw = answer.split(' ');
    if (aw.length === tw.length) {
      return tw.every((w, i) => w.length > SHORT_WORD || aw[i] === w);
    }
    const flat = answer.replace(/ /g, '');
    return tw.every(w => w.length > SHORT_WORD || flat.includes(w));
  }

  function allowedErrors(target) {
    if (target.includes(' ')) return 2;
    return target.length > SHORT_WORD ? 1 : 0;
  }

  // Compara una respuesta con una única respuesta válida.
  // status: 'C' correcto, 'K' casi (cuenta como acierto), 'I' incorrecto.
  function compareOne(answer, candidate) {
    const a1 = normBase(answer), c1 = normBase(candidate);
    if (!a1) return { status: 'I', distance: Infinity };
    if (a1 === c1) return { status: 'C', distance: 0 };
    const a2 = stripAccents(a1), c2 = stripAccents(c1);
    if (a2 === c2) return { status: 'K', distance: 0, accentsOnly: true };
    const dist = editDistance(a2, c2);
    if (dist <= allowedErrors(c2) && shortWordsOk(a2, c2)) {
      return { status: 'K', distance: dist };
    }
    return { status: 'I', distance: dist };
  }

  const RANK = { C: 0, K: 1, I: 2 };

  // item: { fr, alts: [] }. Devuelve la mejor coincidencia entre la principal y las alternativas.
  function checkAnswer(answer, item) {
    const cands = [item.fr].concat(item.alts || []).filter(c => normBase(c));
    let best = null;
    cands.forEach((cand, i) => {
      const r = compareOne(answer, cand);
      if (!best || RANK[r.status] < RANK[best.status] ||
          (r.status === best.status && r.distance < best.distance)) {
        best = Object.assign({ matched: cand, isAlt: i > 0 }, r);
      }
    });
    return best || { status: 'I', distance: Infinity, matched: item.fr, isAlt: false };
  }

  // ---------- Marcado de diferencias ----------

  const isLetter = ch => /\p{L}/u.test(ch);
  const base = ch => stripAccents(ch.toLowerCase());

  // Alinea respuesta y objetivo letra a letra. Devuelve marcas para ambos textos:
  // objetivo: 'ok' | 'accent' | 'letter' (letra que faltaba o era otra)
  // respuesta: 'ok' | 'accent' | 'letter' | 'extra'
  function diffMarks(answer, target) {
    const A = Array.from(String(answer || '')), T = Array.from(String(target || ''));
    const al = A.map(c => c.toLowerCase()), tl = T.map(c => c.toLowerCase());
    const gap = ch => (isLetter(ch) ? 1 : 0.1);
    const sub = (x, y) => {
      if (x === y) return 0;
      if (isLetter(x) && isLetter(y) && base(x) === base(y)) return 0.3;
      if (!isLetter(x) && !isLetter(y)) return 0.1;
      return 1;
    };
    const n = A.length, m = T.length;
    const d = [];
    for (let i = 0; i <= n; i++) d.push(new Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) d[i][0] = d[i - 1][0] + gap(al[i - 1]);
    for (let j = 1; j <= m; j++) d[0][j] = d[0][j - 1] + gap(tl[j - 1]);
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        d[i][j] = Math.min(
          d[i - 1][j - 1] + sub(al[i - 1], tl[j - 1]),
          d[i - 1][j] + gap(al[i - 1]),
          d[i][j - 1] + gap(tl[j - 1])
        );
      }
    }
    const aMarks = new Array(n).fill('ok'), tMarks = new Array(m).fill('ok');
    let i = n, j = m;
    const eq = (x, y) => Math.abs(x - y) < 1e-9;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && eq(d[i][j], d[i - 1][j - 1] + sub(al[i - 1], tl[j - 1]))) {
        const x = al[i - 1], y = tl[j - 1];
        if (x !== y && isLetter(y)) {
          const kind = isLetter(x) && base(x) === base(y) ? 'accent' : 'letter';
          tMarks[j - 1] = kind;
          aMarks[i - 1] = kind;
        }
        i--; j--;
      } else if (i > 0 && eq(d[i][j], d[i - 1][j] + gap(al[i - 1]))) {
        if (isLetter(al[i - 1])) aMarks[i - 1] = 'extra';
        i--;
      } else {
        if (isLetter(tl[j - 1])) tMarks[j - 1] = 'letter';
        j--;
      }
    }
    return {
      target: T.map((ch, k) => ({ ch, mark: tMarks[k] })),
      answer: A.map((ch, k) => ({ ch, mark: aMarks[k] }))
    };
  }

  // ---------- Fechas ----------

  const pad = x => String(x).padStart(2, '0');
  function localDate(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function localDateTime(d) {
    d = d || new Date();
    return localDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function addDays(dateStr, k) {
    const [y, mo, da] = dateStr.split('-').map(Number);
    const d = new Date(y, mo - 1, da + k, 12);
    return localDate(d);
  }

  // ---------- Cálculos del día ----------
  // Evento: { u, t, d, s, r, n, id, a, res }
  //   d fecha, s sesión (en repasos: sesión a la que suma), r ronda (0 principal, 1.. repasos),
  //   n tamaño de la sesión (solo ronda principal), res 'C' | 'K' | 'I'

  const hit = e => e.res !== 'I';

  function summarizeDay(dayEvents) {
    const evs = dayEvents.slice().sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : 0));
    const sessions = {};
    const lastById = {};
    const lastMainFailSession = {};
    let maxRound = 0;
    evs.forEach(e => {
      const s = sessions[e.s] || (sessions[e.s] = { s: e.s, n: 0, mainCount: 0, mainHits: 0, reviewHits: 0 });
      if (e.r === 0) {
        s.n = Math.max(s.n, e.n || 0);
        s.mainCount++;
        if (hit(e)) s.mainHits++; else lastMainFailSession[e.id] = e.s;
      } else {
        maxRound = Math.max(maxRound, e.r);
        if (hit(e)) s.reviewHits++;
      }
      lastById[e.id] = e;
    });
    const list = Object.values(sessions).filter(s => s.n > 0).sort((x, y) => x.s - y.s);
    list.forEach(s => {
      s.score = s.mainHits + s.reviewHits;
      s.mainPct = s.mainHits / s.n;
      s.scorePct = s.score / s.n;
      s.mainDone = s.mainCount >= s.n;
    });

    let completed = false, via = '';
    if (list.some(s => s.mainPct >= MAIN_GOAL - 1e-9)) { completed = true; via = '80'; }
    else if (list.some(s => s.scorePct >= RESCUE_GOAL - 1e-9)) { completed = true; via = '90'; }

    const failedIds = [];
    const seenFail = {};
    evs.forEach(e => { if (!hit(e) && !seenFail[e.id]) { seenFail[e.id] = 1; failedIds.push(e.id); } });
    const pending = failedIds
      .filter(id => lastById[id] && !hit(lastById[id]))
      .map(id => ({ id, s: lastMainFailSession[id] || lastById[id].s }));

    const best = list.length ? Math.max.apply(null, list.map(s => s.mainPct)) : 0;
    const bestRescue = list.length ? list.reduce((b, s) => (s.scorePct > b.scorePct ? s : b), list[0]) : null;
    const askedMain = {};
    evs.forEach(e => { if (e.r === 0) askedMain[e.id] = 1; });

    return {
      sessions: list, completed, via, best, bestRescue,
      failedIds, pending, nextRound: maxRound + 1,
      nextSession: list.length ? list[list.length - 1].s + 1 : 1,
      askedMain
    };
  }

  function groupByDay(events) {
    const out = {};
    events.forEach(e => { (out[e.d] || (out[e.d] = [])).push(e); });
    return out;
  }

  function daysTable(events) {
    const g = groupByDay(events);
    const out = {};
    Object.keys(g).forEach(d => {
      const s = summarizeDay(g[d]);
      out[d] = { date: d, sessions: s.sessions.length, best: s.best, completed: s.completed, via: s.via };
    });
    return out;
  }

  function streaks(days, today) {
    const done = d => days[d] && days[d].completed;
    let current = 0;
    let cursor = done(today) ? today : addDays(today, -1);
    while (done(cursor)) { current++; cursor = addDays(cursor, -1); }
    const dates = Object.keys(days).filter(done).sort();
    let best = 0, run = 0, prev = null;
    dates.forEach(d => {
      run = prev && addDays(prev, 1) === d ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    });
    return { current, best: Math.max(best, current) };
  }

  function itemStats(events) {
    const out = {};
    const evs = events.slice().sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : 0));
    evs.forEach(e => {
      const s = out[e.id] || (out[e.id] = { id: e.id, seen: 0, fails: 0, recent: [] });
      s.seen++;
      if (!hit(e)) s.fails++;
      s.recent.push(hit(e));
      if (s.recent.length > 3) s.recent.shift();
    });
    Object.values(out).forEach(s => { s.mastered = s.recent.length === 3 && s.recent.every(Boolean); });
    return out;
  }

  // Elige las preguntas de una sesión: primero las que no han salido hoy.
  function pickSession(activeItems, askedToday, size, rand) {
    rand = rand || Math.random;
    const shuffle = arr => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const k = Math.floor(rand() * (i + 1));
        const t = a[i]; a[i] = a[k]; a[k] = t;
      }
      return a;
    };
    const fresh = shuffle(activeItems.filter(it => !askedToday[it.id]));
    const used = shuffle(activeItems.filter(it => askedToday[it.id]));
    return shuffle(fresh.concat(used).slice(0, size));
  }

  const api = {
    MAIN_GOAL, RESCUE_GOAL, normBase, stripAccents, editDistance, compareOne, checkAnswer,
    diffMarks, localDate, localDateTime, addDays, summarizeDay, groupByDay, daysTable,
    streaks, itemStats, pickSession
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof self !== 'undefined' ? self : this);
