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

  /* ───────────── datos de ejemplo / reset ───────────── */
  function loadDemo() {
    const now = Date.now();
    const ago = (d) => now - d * DAY;
    const closed = (daysAgo, title, domain, chosen, discarded, prediction, conf, hit, sat, learning) => ({
      id: uid(), createdAt: ago(daysAgo), title, domain, chosen, discarded, prediction,
      confidence: conf, horizonDays: 30, reviewAt: ago(daysAgo) + 30 * DAY,
      hypothesisId: null, status: "closed",
      outcome: { closedAt: ago(Math.max(1, daysAgo - 30)), whatHappened: "", predictionHit: hit, satisfaction: sat, learning, predictionError: conf - hit }
    });
    const open = (createdDaysAgo, reviewInDays, title, domain, chosen, discarded, prediction, conf) => ({
      id: uid(), createdAt: ago(createdDaysAgo), title, domain, chosen, discarded, prediction,
      confidence: conf, horizonDays: 30, reviewAt: now + reviewInDays * DAY,
      hypothesisId: null, status: "open", outcome: null
    });

    const r1 = closed(40, "Le escribo a mi ex para vernos", "relaciones", "Le mando un mensaje", "Dejarlo así", "Vamos a poder vernos tranqui, como amigos", 75, 20, 1, "Creo que puedo controlar cómo termina, y no.");
    const r2 = closed(38, "Cena familiar decidido a no discutir", "relaciones", "Voy y me quedo callado si saltan temas", "Inventar excusa y no ir", "Esta vez la llevo sin pelearme", 70, 30, 2, "Subestimo cuánto me activan.");
    const r3 = closed(33, "Le digo a un amigo lo que me molesta", "relaciones", "Se lo planteo de frente", "Tragármelo", "Lo va a tomar bien y hablamos", 80, 35, 2, "");
    const r4 = closed(20, "Organizo yo la salida del grupo", "relaciones", "Me encargo de coordinar todo", "Que lo haga otro", "Se prenden casi todos", 65, 40, 3, "");
    const t1 = closed(45, "Acepto el proyecto nuevo en el laburo", "trabajo", "Digo que sí", "Quedarme en lo seguro", "Voy a aprender un montón", 85, 85, 4, "");
    const t2 = closed(28, "Le pido feedback directo a mi jefe", "trabajo", "Le pido una reunión 1:1", "No preguntar", "Me da puntos concretos para mejorar", 70, 80, 4, "");
    const t3 = closed(15, "Rechazo una reunión que no aporta", "trabajo", "Aviso que no puedo y propongo resumen por mail", "Ir igual por compromiso", "No pasa nada malo y gano tiempo", 75, 90, 5, "");
    const o1 = open(5, 25, "Empiezo a anotar todos mis gastos del mes", "dinero", "Registro cada gasto en una nota", "Seguir sin mirar", "Voy a gastar menos al verlo escrito", 60);
    const o2 = open(35, -5, "Cambio el gimnasio a la mañana", "salud", "Voy 7am antes del trabajo", "Seguir de noche (y faltar)", "Voy a ser más constante", 55);

    write(KEYS.decisions, [r1, r2, r3, r4, t1, t2, t3, o1, o2]);

    const hypId = uid();
    write(KEYS.hypotheses, [{
      id: hypId, createdAt: ago(18),
      statement: "Cuando decido sobre relaciones, soy demasiado optimista.",
      domain: "relaciones",
      evidence: [r1, r2, r3, r4].map(d => ({ decisionId: d.id, stance: "apoya", addedAt: ago(17) }))
    }]);

    write(KEYS.experiments, [{
      id: uid(), createdAt: ago(10), hypothesisId: hypId,
      intervention: "Antes de una decisión sobre una relación, esperar 24hs y bajar mi confianza un escalón.",
      startDate: new Date(ago(10)).toISOString().slice(0, 10),
      endDate: new Date(now + 20 * DAY).toISOString().slice(0, 10),
      status: "en_curso", result: null
    }]);
  }

  function clearAll() {
    [KEYS.decisions, KEYS.hypotheses, KEYS.experiments].forEach(k => localStorage.removeItem(k));
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
    loadDemo, clearAll, exportAll, importAll
  };
})();
