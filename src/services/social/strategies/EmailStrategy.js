// Estrategia ejemplo para Email
function buildPrompt(payload) {
  return {
    instructions: "Redacta un email promocional en español, formal y persuasivo. Incluye asunto y despedida cordial.",
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
    callToAction: "Responde este correo para más información.",
  };
}

module.exports = { buildPrompt, parseResponse };
