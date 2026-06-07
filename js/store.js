/* EnVos — capa de datos (local-first).
   Este archivo es el ACTIVO: define la estructura del registro
   Creencia -> Predicción -> Decisión -> Resultado -> Aprendizaje.
   Migra tal cual a Firestore cuando haga falta (cada colección = una collection). */
window.EnVos = window.EnVos || {};

EnVos.store = (function () {
  const KEYS = {
    decisions: "envos.decisions.v1",
    hypotheses: "envos.hypotheses.v1",
    experiments: "envos.experiments.v1"
  };
  const DAY = 86400000;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const read = (k) => JSON.parse(localStorage.getItem(k) || "[]");
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ───────────── DECISIONES (DecisionEntry + DecisionOutcome anidado) ───────────── */
  const getDecisions = () => read(KEYS.decisions);
  const getDecision = (id) => getDecisions().find(d => d.id === id);

  function addDecision(d) {
    const all = getDecisions();
    all.push({
      id: uid(),
      createdAt: Date.now(),
      title: d.title,
      domain: d.domain,
      chosen: d.chosen || "",
      discarded: d.discarded || "",
      prediction: d.prediction,
      confidence: d.confidence,            // 0-100, qué tan seguro estaba ANTES
      horizonDays: d.horizonDays,
      reviewAt: Date.now() + d.horizonDays * DAY,
      hypothesisId: d.hypothesisId || null, // decisión tomada para testear una hipótesis
      status: "open",
      outcome: null
    });
    write(KEYS.decisions, all);
  }

  function closeDecision(id, o) {
    const all = getDecisions();
    const d = all.find(x => x.id === id);
    if (!d) return;
    d.status = "closed";
    d.outcome = {
      closedAt: Date.now(),
      whatHappened: o.whatHappened || "",
      predictionHit: o.predictionHit,                 // 0-100, qué tan acertada resultó
      satisfaction: o.satisfaction,                   // 1-5
      learning: o.learning || "",
      predictionError: d.confidence - o.predictionHit // + = sobreconfianza, - = subestimó
    };
    write(KEYS.decisions, all);
  }

  function deleteDecision(id) {
    write(KEYS.decisions, getDecisions().filter(d => d.id !== id));
    // limpiar evidencia que apuntaba a esta decisión
    const hs = getHypotheses();
    hs.forEach(h => h.evidence = h.evidence.filter(e => e.decisionId !== id));
    write(KEYS.hypotheses, hs);
  }

  /* ───────────── HIPÓTESIS (HypothesisRegistry) ───────────── */
  const getHypotheses = () => read(KEYS.hypotheses);
  const getHypothesis = (id) => getHypotheses().find(h => h.id === id);

  function addHypothesis(h) {
    const all = getHypotheses();
    const obj = {
      id: uid(), createdAt: Date.now(),
      statement: h.statement,
      domain: h.domain || "otro",
      evidence: []   // [{decisionId, stance: "apoya"|"contradice"|"neutral", addedAt}]
    };
    all.push(obj);
    write(KEYS.hypotheses, all);
    return obj.id;
  }

  function linkEvidence(hypId, decisionId, stance) {
    const all = getHypotheses();
    const h = all.find(x => x.id === hypId);
    if (!h) return;
    h.evidence = h.evidence.filter(e => e.decisionId !== decisionId); // sin duplicados
    h.evidence.push({ decisionId, stance, addedAt: Date.now() });
    write(KEYS.hypotheses, all);
  }
  function unlinkEvidence(hypId, decisionId) {
    const all = getHypotheses();
    const h = all.find(x => x.id === hypId);
    if (!h) return;
    h.evidence = h.evidence.filter(e => e.decisionId !== decisionId);
    write(KEYS.hypotheses, all);
  }
  function deleteHypothesis(id) {
    write(KEYS.hypotheses, getHypotheses().filter(h => h.id !== id));
  }

  // Estado de una hipótesis SOLO a partir de evidencia. Nunca inventa certezas.
  function hypothesisStats(h) {
    const counted = h.evidence.filter(e => e.stance !== "neutral");
    const apoya = counted.filter(e => e.stance === "apoya").length;
    const contra = counted.filter(e => e.stance === "contradice").length;
    const samples = apoya + contra;
    const confidence = samples ? Math.round((apoya / samples) * 100) : 0;
    let status;
    if (samples < 3) status = "sin_datos";
    else if (confidence >= 75) status = "validada";
    else if (confidence <= 35) status = "refutada";
    else status = "parcial";
    return { samples, apoya, contra, neutral: h.evidence.length - counted.length, confidence, status };
  }

  /* ───────────── EXPERIMENTOS (PersonalExperiments) ───────────── */
  const getExperiments = () => read(KEYS.experiments);
  const getExperiment = (id) => getExperiments().find(e => e.id === id);

  function addExperiment(e) {
    const all = getExperiments();
    all.push({
      id: uid(), createdAt: Date.now(),
      hypothesisId: e.hypothesisId || null,
      intervention: e.intervention,
      startDate: e.startDate,
      endDate: e.endDate,
      status: "en_curso",
      result: null
    });
    write(KEYS.experiments, all);
  }
  function finishExperiment(id, result) {
    const all = getExperiments();
    const ex = all.find(x => x.id === id);
    if (!ex) return;
    ex.status = "terminado";
    ex.result = {
      closedAt: Date.now(),
      worked: result.worked,          // true | false | null
      conclusion: result.conclusion || "",
      note: result.note || ""
    };
    write(KEYS.experiments, all);
  }
  function deleteExperiment(id) {
    write(KEYS.experiments, getExperiments().filter(e => e.id !== id));
  }

  /* ───────────── backup ───────────── */
  function exportAll() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(), version: 1,
      decisions: getDecisions(), hypotheses: getHypotheses(), experiments: getExperiments()
    }, null, 2);
  }
  function importAll(json) {
    const data = JSON.parse(json);
    if (data.decisions) write(KEYS.decisions, data.decisions);
    if (data.hypotheses) write(KEYS.hypotheses, data.hypotheses);
    if (data.experiments) write(KEYS.experiments, data.experiments);
  }

  return {
    DAY,
    getDecisions, getDecision, addDecision, closeDecision, deleteDecision,
    getHypotheses, getHypothesis, addHypothesis, linkEvidence, unlinkEvidence,
    deleteHypothesis, hypothesisStats,
    getExperiments, getExperiment, addExperiment, finishExperiment, deleteExperiment,
    exportAll, importAll
  };
})();
