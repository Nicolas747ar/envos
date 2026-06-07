/* EnVos — MOTOR v0 (heurísticas honestas, NO la inteligencia final).
   Esto observa RECURRENCIAS en tus datos. No afirma causalidad.
   Cuando "demos vida al motor" (fase posterior), acá entra el análisis real.
   Reglas de oro respetadas:
     - nunca mostrar nada con menos de MIN_SAMPLES muestras
     - siempre reportar muestras y confianza
     - lenguaje observacional ("se asocia", "recurrencia"), nunca "causa". */
window.EnVos = window.EnVos || {};

EnVos.engine = (function () {
  const MIN_SAMPLES = 3;
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const round = Math.round;

  // Devuelve observaciones: {id, text, samples, confidence, domain, suggest}
  function observe(decisions) {
    const closed = decisions.filter(d => d.status === "closed");
    const out = [];
    if (closed.length < MIN_SAMPLES) return out;

    // 1. Dominios con baja precisión de predicción
    const byDomain = {};
    closed.forEach(d => (byDomain[d.domain] ??= []).push(d));
    Object.entries(byDomain).forEach(([dom, list]) => {
      if (list.length < MIN_SAMPLES) return;
      const acc = round(avg(list.map(d => d.outcome.predictionHit)));
      if (acc < 45) {
        out.push({
          id: "lowdom-" + dom, domain: dom, samples: list.length, confidence: 100 - acc,
          text: `En decisiones de <b>${dom}</b> tus predicciones aciertan en promedio ${acc}%. Recurrencia observada: te cuesta anticipar resultados en este dominio.`,
          suggest: `Cuando decido sobre ${dom}, suelo predecir mal el resultado.`
        });
      }
    });

    // 2. Sobreconfianza: cuando estás MUY seguro, ¿acertás?
    const sure = closed.filter(d => d.confidence >= 80);
    if (sure.length >= MIN_SAMPLES) {
      const acc = round(avg(sure.map(d => d.outcome.predictionHit)));
      if (acc < 65) {
        out.push({
          id: "overconf", domain: "otro", samples: sure.length, confidence: 80 - acc,
          text: `Cuando tu confianza inicial es alta (≥80%), acertás solo ${acc}% de las veces. Recurrencia: tu seguridad no se asocia con mejores predicciones.`,
          suggest: `Cuando estoy muy seguro de una decisión, suelo equivocarme igual.`
        });
      }
    }

    // 3. Brecha entre tu mejor y peor dominio
    const domAcc = Object.entries(byDomain)
      .filter(([, l]) => l.length >= MIN_SAMPLES)
      .map(([dom, l]) => ({ dom, acc: round(avg(l.map(d => d.outcome.predictionHit))), n: l.length }))
      .sort((a, b) => b.acc - a.acc);
    if (domAcc.length >= 2) {
      const best = domAcc[0], worst = domAcc[domAcc.length - 1];
      if (best.acc - worst.acc >= 30) {
        out.push({
          id: "gap", domain: worst.dom, samples: best.n + worst.n, confidence: best.acc - worst.acc,
          text: `Te conocés bien en <b>${best.dom}</b> (${best.acc}%) pero te cuesta en <b>${worst.dom}</b> (${worst.acc}%). La diferencia es marcada.`,
          suggest: `Soy mucho peor prediciendo ${worst.dom} que ${best.dom}.`
        });
      }
    }

    // 4. Decisiones que predijiste bien pero te dejaron insatisfecho (o al revés)
    const mismatch = closed.filter(d => d.outcome.predictionHit >= 70 && d.outcome.satisfaction <= 2);
    if (mismatch.length >= MIN_SAMPLES) {
      out.push({
        id: "rightbutsad", domain: "otro", samples: mismatch.length, confidence: 60,
        text: `Hay ${mismatch.length} casos donde acertaste tu predicción pero quedaste insatisfecho. Recurrencia: a veces conseguís lo que esperabas y aún así no te hace bien.`,
        suggest: `A veces predigo bien el resultado pero igual no me hace feliz.`
      });
    }

    return out;
  }

  return { observe, MIN_SAMPLES };
})();
