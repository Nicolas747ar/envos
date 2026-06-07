/* EnVos — UI. Render por estado, sin frameworks. */
window.EnVos = window.EnVos || {};

EnVos.app = (function () {
  const S = EnVos.store;
  const E = EnVos.engine;
  const DAY = S.DAY;

  const DOMAINS = ["trabajo", "dinero", "relaciones", "salud", "otro"];
  const SAT_EMOJI = { 1: "😣", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const fmtDate = (ts) => new Date(ts).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  const daysLeft = (ts) => Math.ceil((ts - Date.now()) / DAY);
  const barColor = (v) => v >= 65 ? "var(--good)" : v >= 40 ? "var(--warn)" : "var(--bad)";
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const plusDaysISO = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

  let tab = "decisiones";

  /* ───────────── modal helper ───────────── */
  function showModal(html) {
    const root = $("modal-root");
    root.innerHTML = `<div class="modal-bg open" id="mbg"><div class="modal">
      <div class="grabber"></div>${html}</div></div>`;
    $("mbg").onclick = (e) => { if (e.target.id === "mbg") closeModal(); };
  }
  function closeModal() { $("modal-root").innerHTML = ""; }

  /* ───────────── nav ───────────── */
  function go(t) { tab = t; render(); window.scrollTo(0, 0); }

  function render() {
    document.querySelectorAll("nav button").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === tab));
    const main = $("app");
    if (tab === "decisiones") main.innerHTML = viewDecisiones();
    else if (tab === "patrones") main.innerHTML = viewPatrones();
    else if (tab === "hipotesis") main.innerHTML = viewHipotesis();
    else if (tab === "experimentos") main.innerHTML = viewExperimentos();
    else if (tab === "precision") main.innerHTML = viewPrecision();
  }

  /* ═════════════ DECISIONES ═════════════ */
  function viewDecisiones() {
    const all = S.getDecisions();
    const open = all.filter(d => d.status === "open").sort((a, b) => a.reviewAt - b.reviewAt);
    const closed = all.filter(d => d.status === "closed").sort((a, b) => b.outcome.closedAt - a.outcome.closedAt);

    let html = `<button class="btn-primary full-fab" onclick="EnVos.app.newDecision()">+ Registrar decisión</button>`;

    if (!all.length) {
      return html + `<div class="empty"><div class="big">🌱</div>
        Acá nace el activo de EnVos.<br>Registrá una decisión que estés pensando hoy.</div>`;
    }

    html += `<div class="section-title">Abiertas (${open.length})</div>`;
    if (!open.length) html += `<div class="empty">Sin decisiones esperando cierre.</div>`;
    open.forEach(d => {
      const dl = daysLeft(d.reviewAt), due = dl <= 0;
      html += `<div class="card ${due ? "due" : ""}">
        <div class="card-top"><h3>${esc(d.title)}</h3><span class="tag">${d.domain}</span></div>
        <div class="pred">Esperás: <b>${esc(d.prediction)}</b></div>
        <div class="meta">Confianza ${d.confidence}% · registrada ${fmtDate(d.createdAt)}</div>
        ${due ? `<div class="due-badge">⏰ Listo para revisar</div>` :
          `<div class="meta">Revisás en ${dl} día${dl === 1 ? "" : "s"} (${fmtDate(d.reviewAt)})</div>`}
        <div class="card-actions">
          <button class="btn-ghost" onclick="EnVos.app.closeCycle('${d.id}')">${due ? "Cerrar ciclo" : "Ya sé qué pasó →"}</button>
          <button class="btn-ghost danger" onclick="EnVos.app.removeDecision('${d.id}')">Borrar</button>
        </div></div>`;
    });

    if (closed.length) {
      html += `<div class="section-title">Cerradas (${closed.length})</div>`;
      closed.forEach(d => {
        const o = d.outcome;
        html += `<div class="card">
          <div class="card-top"><h3>${esc(d.title)}</h3><span class="tag">${d.domain}</span></div>
          <div class="meta">Predijiste con ${d.confidence}% · acertaste ${o.predictionHit}% ${SAT_EMOJI[o.satisfaction]}</div>
          ${o.learning ? `<div class="pred">📌 ${esc(o.learning)}</div>` : ""}
        </div>`;
      });
    }
    return html;
  }

  function newDecision() {
    const hyps = S.getHypotheses();
    const hypOptions = hyps.length
      ? `<label>¿Esta decisión testea una hipótesis? <span class="hint">opcional</span></label>
         <select id="nd-hyp"><option value="">— Ninguna —</option>
         ${hyps.map(h => `<option value="${h.id}">${esc(h.statement)}</option>`).join("")}</select>` : "";
    showModal(`
      <h2>Nueva decisión</h2>
      <label>¿Qué decisión estás considerando?</label>
      <input type="text" id="nd-title" placeholder="Ej: Cambiar de trabajo" />
      <label>Dominio</label>
      <div class="chips" id="nd-domain">${DOMAINS.map((d, i) =>
        `<button data-d="${d}" class="${i === 0 ? "sel" : ""}">${d}</button>`).join("")}</div>
      <label>¿Qué vas a hacer? <span class="hint">la opción que elegís</span></label>
      <textarea id="nd-chosen" placeholder="Acepto la propuesta"></textarea>
      <label>¿Qué alternativa descartás?</label>
      <textarea id="nd-discarded" placeholder="Quedarme donde estoy"></textarea>
      <label>¿Qué esperás que ocurra?</label>
      <textarea id="nd-pred" placeholder="Voy a estar más motivado y ganar más"></textarea>
      <label>¿Qué tan seguro estás de esa predicción?</label>
      <div class="slider-row">
        <input type="range" id="nd-conf" min="0" max="100" value="70" step="5"
          oninput="document.getElementById('nd-confv').textContent=this.value" />
        <span class="slider-val"><span id="nd-confv">70</span>%</span></div>
      <label>¿Cuándo querés revisar qué pasó?</label>
      <div class="chips" id="nd-horizon">
        <button data-h="7">7 días</button>
        <button data-h="30" class="sel">30 días</button>
        <button data-h="90">90 días</button></div>
      ${hypOptions}
      <button class="btn-primary" onclick="EnVos.app.saveDecision()">Guardar decisión</button>
    `);
    chipGroup("nd-domain", "d");
    chipGroup("nd-horizon", "h");
  }

  function saveDecision() {
    const title = $("nd-title").value.trim();
    const prediction = $("nd-pred").value.trim();
    if (!title || !prediction) { alert("Necesito al menos la decisión y qué esperás que pase."); return; }
    S.addDecision({
      title, prediction,
      domain: selected("nd-domain", "d"),
      chosen: $("nd-chosen").value.trim(),
      discarded: $("nd-discarded").value.trim(),
      confidence: +$("nd-conf").value,
      horizonDays: +selected("nd-horizon", "h"),
      hypothesisId: $("nd-hyp") ? $("nd-hyp").value || null : null
    });
    closeModal(); render();
  }

  function closeCycle(id) {
    const d = S.getDecision(id);
    if (!d) return;
    showModal(`
      <h2>Cerrar el ciclo</h2>
      <div class="ctx">${esc(d.title)}</div>
      <div class="card" style="margin:10px 0 4px;">
        <div class="meta" style="margin:0;">Tu predicción fue:</div>
        <div class="pred"><b>${esc(d.prediction)}</b></div>
        <div class="meta">Confianza que le diste: <b>${d.confidence}%</b></div></div>
      <label>¿Qué pasó realmente?</label>
      <textarea id="cc-happened" placeholder="El resultado real, sin filtro"></textarea>
      <label>¿Qué tan acertada resultó tu predicción?</label>
      <div class="slider-row">
        <input type="range" id="cc-hit" min="0" max="100" value="50" step="5"
          oninput="document.getElementById('cc-hitv').textContent=this.value" />
        <span class="slider-val"><span id="cc-hitv">50</span>%</span></div>
      <label>¿Qué tan conforme estás con cómo salió?</label>
      <div class="seg" id="cc-sat">${[1,2,3,4,5].map(s =>
        `<button data-s="${s}">${SAT_EMOJI[s]}</button>`).join("")}</div>
      <label>¿Qué aprendiste? <span class="hint">una línea, para vos del futuro</span></label>
      <textarea id="cc-learn" placeholder="La próxima, antes de decidir bajo presión..."></textarea>
      <button class="btn-primary" onclick="EnVos.app.saveCycle('${id}')">Registrar resultado</button>
    `);
    chipGroup("cc-sat", "s");
  }

  function saveCycle(id) {
    const sat = selected("cc-sat", "s");
    if (!sat) { alert("Marcá qué tan conforme quedaste."); return; }
    S.closeDecision(id, {
      whatHappened: $("cc-happened").value.trim(),
      predictionHit: +$("cc-hit").value,
      satisfaction: +sat,
      learning: $("cc-learn").value.trim()
    });
    closeModal(); render();
  }

  function removeDecision(id) {
    if (confirm("¿Borrar esta decisión? No se puede deshacer.")) { S.deleteDecision(id); render(); }
  }

  /* ═════════════ PATRONES (motor v0) ═════════════ */
  function viewPatrones() {
    const closed = S.getDecisions().filter(d => d.status === "closed");
    let html = `<div class="notice">Esto describe <b>recurrencias observadas</b> en tus datos —
      no es una verdad sobre vos ni una causa. Es evidencia para mirar y, si querés, testear.</div>`;
    if (closed.length < E.MIN_SAMPLES) {
      return html + `<div class="notice soft"><b>Pocos datos todavía.</b> Necesito al menos
        ${E.MIN_SAMPLES} ciclos cerrados para no inventar patrones. Llevás ${closed.length}.</div>
        <div class="empty"><div class="big">🔍</div>Los patrones aparecen solos cuando hay evidencia.</div>`;
    }
    const obs = E.observe(S.getDecisions());
    if (!obs.length) {
      return html + `<div class="empty"><div class="big">✅</div>
        Por ahora no hay recurrencias marcadas en tus datos. Seguí registrando.</div>`;
    }
    obs.forEach(o => {
      html += `<div class="card">
        <div class="pred">${o.text}</div>
        <div class="meta">Muestras: ${o.samples} · señal: ${o.confidence}%</div>
        <div class="card-actions">
          <button class="btn-ghost" onclick="EnVos.app.promote('${encodeURIComponent(o.suggest)}','${o.domain}')">
            Convertir en hipótesis →</button></div></div>`;
    });
    return html;
  }

  function promote(suggestEnc, domain) {
    newHypothesis(decodeURIComponent(suggestEnc), domain);
  }

  /* ═════════════ HIPÓTESIS ═════════════ */
  function viewHipotesis() {
    const hyps = S.getHypotheses();
    let html = `<button class="btn-primary full-fab" onclick="EnVos.app.newHypothesis()">+ Nueva hipótesis</button>`;
    if (!hyps.length) {
      return html + `<div class="empty"><div class="big">💡</div>
        Tus creencias sobre vos mismo.<br>"Cuando decido por miedo, suelo arrepentirme."<br>
        Se validan o se refutan con tus decisiones.</div>`;
    }
    hyps.forEach(h => {
      const st = S.hypothesisStats(h);
      html += `<div class="card tappable" onclick="EnVos.app.openHypothesis('${h.id}')">
        <div class="card-top"><h3>${esc(h.statement)}</h3>
          <span class="pill ${st.status}">${st.status.replace("_", " ")}</span></div>
        <div class="meta">${st.samples ? `Confianza ${st.confidence}% · ${st.samples} muestra${st.samples === 1 ? "" : "s"} (${st.apoya} a favor, ${st.contra} en contra)`
          : "Sin evidencia vinculada todavía"}</div></div>`;
    });
    return html;
  }

  function newHypothesis(prefill, domain) {
    showModal(`
      <h2>Nueva hipótesis</h2>
      <div class="ctx">Una creencia sobre vos que se pueda confirmar o refutar con decisiones reales.</div>
      <label>Hipótesis</label>
      <textarea id="nh-stmt" placeholder="Cuando decido por miedo, suelo arrepentirme.">${prefill ? esc(prefill) : ""}</textarea>
      <label>Dominio</label>
      <div class="chips" id="nh-domain">${DOMAINS.map((d, i) =>
        `<button data-d="${d}" class="${(domain ? d === domain : i === 0) ? "sel" : ""}">${d}</button>`).join("")}</div>
      <button class="btn-primary" onclick="EnVos.app.saveHypothesis()">Crear hipótesis</button>
    `);
    chipGroup("nh-domain", "d");
  }

  function saveHypothesis() {
    const statement = $("nh-stmt").value.trim();
    if (!statement) { alert("Escribí la hipótesis."); return; }
    const id = S.addHypothesis({ statement, domain: selected("nh-domain", "d") });
    closeModal(); go("hipotesis"); openHypothesis(id);
  }

  function openHypothesis(id) {
    const h = S.getHypothesis(id);
    if (!h) return;
    const st = S.hypothesisStats(h);
    const decById = (did) => S.getDecision(did);
    const evHtml = h.evidence.length ? h.evidence.map(e => {
      const d = decById(e.decisionId);
      return `<div class="evidence-line">
        <span class="stance ${e.stance}">${e.stance}</span> ·
        ${d ? esc(d.title) : "(decisión borrada)"}
        <button class="btn-ghost" style="float:right;padding:3px 8px;font-size:11px"
          onclick="EnVos.app.unlink('${id}','${e.decisionId}')">quitar</button></div>`;
    }).join("") : `<div class="meta">Todavía no vinculaste evidencia.</div>`;

    showModal(`
      <h2>Hipótesis</h2>
      <div class="card" style="margin:6px 0">
        <h3>${esc(h.statement)}</h3>
        <div class="card-top" style="margin-top:10px">
          <span class="tag">${h.domain}</span>
          <span class="pill ${st.status}">${st.status.replace("_", " ")}</span></div>
        <div class="meta">${st.samples ? `Confianza ${st.confidence}% — ${st.apoya} a favor, ${st.contra} en contra (${st.samples} muestras)`
          : "Sin evidencia que cuente todavía. Vinculá decisiones cerradas."}</div>
        ${st.status === "sin_datos" && st.samples ? `<div class="meta">Faltan muestras para concluir (mínimo ${E.MIN_SAMPLES}).</div>` : ""}
      </div>
      <div class="section-title">Evidencia</div>
      ${evHtml}
      <button class="btn-primary" onclick="EnVos.app.linkPicker('${id}')">+ Vincular una decisión</button>
      <button class="btn-ghost" style="width:100%;margin-top:10px" onclick="EnVos.app.newExperiment('${id}')">🧪 Crear experimento para probarla</button>
      <button class="btn-ghost danger" style="width:100%;margin-top:10px" onclick="EnVos.app.removeHypothesis('${id}')">Borrar hipótesis</button>
    `);
  }

  function linkPicker(hypId) {
    const h = S.getHypothesis(hypId);
    const linkedIds = new Set(h.evidence.map(e => e.decisionId));
    const closed = S.getDecisions().filter(d => d.status === "closed" && !linkedIds.has(d.id));
    if (!closed.length) {
      alert("No hay decisiones cerradas sin vincular. Cerrá ciclos primero — la evidencia sale de ahí.");
      return;
    }
    showModal(`
      <h2>Vincular decisión</h2>
      <div class="ctx">Elegí una decisión cerrada y decí si <b>apoya</b> o <b>contradice</b> la hipótesis.</div>
      ${closed.map(d => `<div class="card">
        <h3>${esc(d.title)}</h3>
        <div class="meta">Acertaste ${d.outcome.predictionHit}% ${SAT_EMOJI[d.outcome.satisfaction]} · ${d.domain}</div>
        <div class="card-actions">
          <button class="btn-ghost" style="color:var(--good);border-color:var(--good)"
            onclick="EnVos.app.doLink('${hypId}','${d.id}','apoya')">Apoya</button>
          <button class="btn-ghost danger" onclick="EnVos.app.doLink('${hypId}','${d.id}','contradice')">Contradice</button>
          <button class="btn-ghost" onclick="EnVos.app.doLink('${hypId}','${d.id}','neutral')">Neutral</button>
        </div></div>`).join("")}
    `);
  }
  function doLink(hypId, decId, stance) { S.linkEvidence(hypId, decId, stance); openHypothesis(hypId); }
  function unlink(hypId, decId) { S.unlinkEvidence(hypId, decId); openHypothesis(hypId); }
  function removeHypothesis(id) {
    if (confirm("¿Borrar esta hipótesis?")) { S.deleteHypothesis(id); closeModal(); go("hipotesis"); }
  }

  /* ═════════════ EXPERIMENTOS ═════════════ */
  function viewExperimentos() {
    const exps = S.getExperiments();
    let html = `<button class="btn-primary full-fab" onclick="EnVos.app.newExperiment()">+ Nuevo experimento</button>`;
    if (!exps.length) {
      return html + `<div class="empty"><div class="big">🧪</div>
        Probá un cambio concreto durante un tiempo<br>y registrá si funcionó.</div>`;
    }
    exps.sort((a, b) => b.createdAt - a.createdAt).forEach(ex => {
      const h = ex.hypothesisId ? S.getHypothesis(ex.hypothesisId) : null;
      html += `<div class="card">
        <div class="card-top"><h3>${esc(ex.intervention)}</h3>
          <span class="pill ${ex.status}">${ex.status.replace("_", " ")}</span></div>
        ${h ? `<div class="meta">Prueba: "${esc(h.statement)}"</div>` : ""}
        <div class="meta">${ex.startDate} → ${ex.endDate}</div>
        ${ex.result ? `<div class="pred">${ex.result.worked === true ? "✅ Funcionó" : ex.result.worked === false ? "❌ No funcionó" : "➖ Sin conclusión clara"}${ex.result.conclusion ? " · " + esc(ex.result.conclusion) : ""}</div>`
          : `<div class="card-actions"><button class="btn-ghost" onclick="EnVos.app.finishExp('${ex.id}')">Terminar y registrar</button></div>`}
        <div class="card-actions"><button class="btn-ghost danger" onclick="EnVos.app.removeExp('${ex.id}')">Borrar</button></div>
      </div>`;
    });
    return html;
  }

  function newExperiment(hypId) {
    const hyps = S.getHypotheses();
    showModal(`
      <h2>Nuevo experimento</h2>
      <div class="ctx">Un cambio concreto que vas a probar por un tiempo definido.</div>
      <label>¿Qué vas a probar? <span class="hint">la intervención</span></label>
      <textarea id="ne-int" placeholder="No tomar ninguna decisión laboral importante el mismo día que aparece"></textarea>
      ${hyps.length ? `<label>¿Qué hipótesis prueba? <span class="hint">opcional</span></label>
        <select id="ne-hyp"><option value="">— Ninguna —</option>
        ${hyps.map(h => `<option value="${h.id}" ${h.id === hypId ? "selected" : ""}>${esc(h.statement)}</option>`).join("")}</select>` : ""}
      <label>Desde</label><input type="date" id="ne-start" value="${todayISO()}" />
      <label>Hasta</label><input type="date" id="ne-end" value="${plusDaysISO(30)}" />
      <button class="btn-primary" onclick="EnVos.app.saveExperiment()">Iniciar experimento</button>
    `);
  }

  function saveExperiment() {
    const intervention = $("ne-int").value.trim();
    if (!intervention) { alert("Escribí qué vas a probar."); return; }
    S.addExperiment({
      intervention,
      hypothesisId: $("ne-hyp") ? $("ne-hyp").value || null : null,
      startDate: $("ne-start").value, endDate: $("ne-end").value
    });
    closeModal(); go("experimentos");
  }

  function finishExp(id) {
    showModal(`
      <h2>Terminar experimento</h2>
      <label>¿Funcionó?</label>
      <div class="chips" id="fe-worked">
        <button data-w="yes">✅ Sí</button>
        <button data-w="no">❌ No</button>
        <button data-w="unclear">➖ No está claro</button></div>
      <label>Conclusión <span class="hint">en una línea</span></label>
      <textarea id="fe-concl" placeholder="Esperar al día siguiente bajó mi arrepentimiento"></textarea>
      <button class="btn-primary" onclick="EnVos.app.saveFinishExp('${id}')">Registrar resultado</button>
    `);
    chipGroup("fe-worked", "w");
  }
  function saveFinishExp(id) {
    const w = selected("fe-worked", "w");
    const worked = w === "yes" ? true : w === "no" ? false : null;
    S.finishExperiment(id, { worked, conclusion: $("fe-concl").value.trim() });
    closeModal(); go("experimentos");
  }
  function removeExp(id) {
    if (confirm("¿Borrar este experimento?")) { S.deleteExperiment(id); render(); }
  }

  /* ═════════════ PRECISIÓN ═════════════ */
  function viewPrecision() {
    const closed = S.getDecisions().filter(d => d.status === "closed");
    let statsHtml;
    if (closed.length < E.MIN_SAMPLES) {
      statsHtml = `<div class="notice soft"><b>Pocos datos todavía.</b> Necesito al menos
        ${E.MIN_SAMPLES} ciclos cerrados para mostrarte algo confiable. Llevás ${closed.length}.</div>
        <div class="empty"><div class="big">🎯</div>Tu precisión se construye cada vez que cerrás un ciclo.<br>
        ¿Querés ver cómo se ve? Cargá datos de ejemplo acá abajo.</div>`;
    } else {
      const avgHit = Math.round(avg(closed.map(d => d.outcome.predictionHit)));
      const calib = Math.round(avg(closed.map(d => Math.abs(d.outcome.predictionError))));
      const bias = Math.round(avg(closed.map(d => d.outcome.predictionError)));
      const biasTxt = bias > 8 ? "Tendés a sobreestimar" : bias < -8 ? "Tendés a subestimar" : "Bien calibrado";
      const byDom = {};
      closed.forEach(d => (byDom[d.domain] ??= []).push(d.outcome.predictionHit));
      const rows = Object.entries(byDom)
        .map(([dom, hits]) => ({ dom, n: hits.length, acc: Math.round(avg(hits)) }))
        .sort((a, b) => b.acc - a.acc);
      statsHtml = `
        <div class="notice">Basado en <b>${closed.length} ciclos cerrados</b>. Describe lo observado
          en tus datos — evidencia que vas a ir afinando, no un veredicto.</div>
        <div class="stat-grid">
          <div class="stat"><div class="num">${avgHit}%</div><div class="lbl">Precisión promedio de tus predicciones</div></div>
          <div class="stat"><div class="num">${calib}<span style="font-size:18px">pts</span></div><div class="lbl">${biasTxt} (calibración)</div></div>
        </div>
        <div class="section-title">Precisión por dominio</div>
        ${rows.map(r => `<div class="domain-row">
          <span class="name">${r.dom}</span>
          <div class="bar"><div style="width:${r.acc}%;background:${barColor(r.acc)}"></div></div>
          <span class="pct">${r.acc}% <span class="n">(${r.n}${r.n < E.MIN_SAMPLES ? "*" : ""})</span></span>
        </div>`).join("")}
        ${rows.some(r => r.n < E.MIN_SAMPLES) ? `<p class="footer-note">* Menos de ${E.MIN_SAMPLES} muestras: tomalo con pinzas.</p>` : ""}`;
    }
    return statsHtml + `
      <div class="section-title">Datos</div>
      <button class="btn-ghost" style="width:100%" onclick="EnVos.app.demo()">✨ Cargar datos de ejemplo</button>
      <button class="btn-ghost" style="width:100%;margin-top:10px" onclick="EnVos.app.backup()">Exportar copia de seguridad</button>
      <button class="btn-ghost" style="width:100%;margin-top:10px" onclick="EnVos.app.restore()">Importar copia</button>
      <button class="btn-ghost danger" style="width:100%;margin-top:10px" onclick="EnVos.app.wipe()">Borrar todo</button>`;
  }

  function demo() {
    if (confirm("Esto reemplaza tus datos actuales por un set de EJEMPLO para que veas la app funcionando. ¿Seguir?")) {
      S.loadDemo(); go("decisiones");
    }
  }
  function wipe() {
    if (confirm("¿Borrar TODOS los datos? No se puede deshacer.")) { S.clearAll(); go("decisiones"); }
  }

  function backup() {
    const blob = new Blob([S.exportAll()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `envos-backup-${todayISO()}.json`;
    a.click();
  }
  function restore() {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/json";
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try { S.importAll(r.result); render(); alert("Datos importados."); }
        catch (e) { alert("Archivo inválido."); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  /* ───────────── helpers de chips ───────────── */
  function chipGroup(containerId, attr) {
    const cont = $(containerId);
    cont.querySelectorAll("button").forEach(b => b.onclick = () => {
      cont.querySelectorAll("button").forEach(x => x.classList.remove("sel"));
      b.classList.add("sel");
    });
  }
  function selected(containerId, attr) {
    const el = $(containerId).querySelector("button.sel");
    return el ? el.dataset[attr] : null;
  }

  function init() {
    document.querySelectorAll("nav button").forEach(b => b.onclick = () => go(b.dataset.tab));
    render();
  }

  return {
    init, go,
    newDecision, saveDecision, closeCycle, saveCycle, removeDecision,
    promote,
    newHypothesis, saveHypothesis, openHypothesis, linkPicker, doLink, unlink, removeHypothesis,
    newExperiment, saveExperiment, finishExp, saveFinishExp, removeExp,
    demo, wipe, backup, restore
  };
})();

document.addEventListener("DOMContentLoaded", EnVos.app.init);
