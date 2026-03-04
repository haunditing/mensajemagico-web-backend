/**
 * Servicio de Contexto Regional
 * Modo estricto: solo ajusta pronominalizacion y registro sintactico.
 * No inyecta personalidad regional ni jerga nueva.
 */

const REGIONAL_CONFIG = [
  // --- COLOMBIA ---
  {
    id: "costa_caribe_col",
    keywords: [
      "cartagena",
      "barranquilla",
      "santa marta",
      "valledupar",
      "atlántico",
      "bolívar",
      "magdalena",
      "cesar",
    ],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: Usuario en ${location}. Ajusta solo pronominalizacion y sintaxis del Caribe colombiano, sin agregar jerga nueva ni rasgos estereotipados.`,
  },
  {
    id: "paisa_col",
    keywords: [
      "medellín",
      "medellin",
      "antioquia",
      "pereira",
      "manizales",
      "armenia",
      "risaralda",
      "caldas",
      "quindío",
    ],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: Usuario en ${location}. Usa voseo paisa y sintaxis cercana solo si coincide con la muestra del usuario. No agregues verbos de jerga si no aparecen en su estilo.`,
  },
  {
    id: "bogota_col",
    keywords: ["bogotá", "bogota", "cundinamarca"],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: Usuario en ${location}. Ajusta registro urbano neutro y pronominalizacion local sin estereotipos ni jerga inventada.`,
  },
  {
    id: "colombia_general",
    keywords: ["colombia"], // Fallback para otras ciudades de Colombia
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: Usuario en ${location}. Mantén sintaxis colombiana neutra con pronominalizacion consistente y sin muletillas nuevas.`,
  },

  // --- ARGENTINA ---
  {
    id: "argentina_rioplatense",
    keywords: [
      "argentina",
      "buenos aires",
      "caba",
      "rosario",
      "córdoba",
      "mendoza",
      "la plata",
    ],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: Usuario en ${location}. Prioriza voseo rioplatense en pronombres y conjugacion, sin introducir jerga que no exista en la muestra del usuario.`,
  },

  // --- MÉXICO ---
  {
    id: "mexico_cdmx",
    keywords: ["ciudad de méxico", "cdmx", "df"],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: Usuario en ${location}. Ajusta tuteo y registro de CDMX de forma neutra, sin frases estereotipadas.`,
  },
  {
    id: "mexico_general",
    keywords: [
      "méxico",
      "mexico",
      "guadalajara",
      "monterrey",
      "puebla",
      "cancún",
    ],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: Usuario en ${location}. Mantén tuteo mexicano neutro y sintaxis natural, sin jerga nueva no presente en el estilo usuario.`,
  },

  // --- CHILE ---
  {
    id: "chile_general",
    keywords: ["chile", "santiago", "valparaíso", "concepción"],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: Usuario en ${location}. Ajusta registro chileno neutro y pronominalizacion local, sin modismos agregados.`,
  },

  // --- PERÚ ---
  {
    id: "peru_general",
    keywords: ["perú", "peru", "lima", "cusco", "arequipa"],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: Usuario en ${location}. Mantén sintaxis peruana neutra y cortesia local, evitando jerga no presente en la muestra del usuario.`,
  },
];

const getRegionalBoost = (userLocation, planLevel, neutralMode, styleSample = "") => {
  // Solo aplicamos lógica regional para usuarios Premium
  if (planLevel !== "premium" || !userLocation) return "";

  // Si el usuario activó el Modo Neutro, ignoramos la región
  if (neutralMode) return "";

  const locNormalized = userLocation.toLowerCase();

  const region = REGIONAL_CONFIG.find((r) =>
    r.keywords.some((keyword) => locNormalized.includes(keyword)),
  );

  if (!region) return "";

  const hasStyle = typeof styleSample === "string" && styleSample.trim().length > 0;
  const slangGuard = hasStyle
    ? " Regla estricta: no agregues jerga o verbos regionales que no aparezcan literal en la muestra del usuario."
    : " Regla estricta: mantente en pronominalizacion y sintaxis neutra; evita jerga regional.";

  return `${region.prompt(userLocation)}${slangGuard}`;
};

module.exports = {
  getRegionalBoost,
};
