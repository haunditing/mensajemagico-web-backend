// Estrategia ejemplo para SMS
function buildPrompt(payload) {
  return {
    instructions: "Crea un SMS promocional en español, breve y directo. Incluye una llamada a la acción clara.",
    theme: payload.theme,
    tone: payload.tone,
    contextWords: payload.contextWords || [],
    intention: payload.intention,
  };
}

function parseResponse(aiResponse) {
  return {
    mainContent: aiResponse,
    hashtags: [],
    callToAction: "Responde este SMS para más detalles.",
  };
}

module.exports = { buildPrompt, parseResponse };
