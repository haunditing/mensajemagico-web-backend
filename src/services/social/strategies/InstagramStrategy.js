// Estrategia profesional para Instagram
function buildPrompt(payload) {
  return {
    instructions: `Responde ÚNICAMENTE en formato JSON válido. No incluyas prosa introductoria.\n\nReglas de Oro:\n- Aplica la técnica AIDA (Atención, Interés, Deseo, Acción) en cada contenido.\n- El Hook debe detener el scroll: usa preguntas retóricas o datos contundentes en la primera línea.\n- Usa emojis con propósito para estructurar la lectura, no los amontones.\n- Lenguaje directo y humano: evita palabras corporativas, habla como un humano a otro humano.\n- Integra storytelling: cuenta una mini historia o situación real relevante.\n- Si el usuario es de Latinoamérica, usa español neutro y cercano, evitando modismos excesivos.\n\nInput:\nProducto: ${payload.theme}\nObjetivo: ${payload.intention}\nTono: ${payload.tone}\nCTA: ${payload.callToAction || ""}\n\nEstructura de salida:\n{\n  "campaign_id": "uuid",\n  "strategy_summary": "Breve explicación de la lógica detrás de la campaña",\n  "content_plan": [\n    {\n      "day": 1,\n      "type": "Reel/Teaser",\n      "hook": "Frase de impacto inicial",\n      "body": "Cuerpo del post",\n      "visual_suggestion": "Descripción de qué mostrar en el video/imagen",\n      "hashtags": ["#tag1", "#tag2"]\n    },\n    { "day": 3, "type": "Carousel/Educativo", ... },\n    { "day": 7, "type": "Post/Venta", "cta_included": true, ... }\n  ]\n}\n`,
    theme: payload.theme,
    tone: payload.tone,
    contextWords: payload.contextWords || [],
    intention: payload.intention,
    callToAction: payload.callToAction || "",
  };
}

function parseResponse(aiResponse) {
  // Extraer JSON aunque venga con markdown o texto adicional
  let jsonText = aiResponse;
  const match = aiResponse.match(/\{[\s\S]*\}/);
  if (match) jsonText = match[0];
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    // Si falla, mostrar el texto plano como fallback
    return {
      campaign_id: "",
      strategy_summary: "",
      content_plan: [],
      raw: aiResponse,
    };
  }
  return {
    campaign_id: parsed.campaign_id || "",
    strategy_summary: parsed.strategy_summary || "",
    content_plan: Array.isArray(parsed.content_plan) ? parsed.content_plan : [],
    raw: aiResponse,
  };
}

module.exports = { buildPrompt, parseResponse };
