/**
 * Servicio de Contexto Regional
 * Centraliza la lógica para adaptar los mensajes a la cultura local del usuario.
 * Escalable: Solo agrega objetos a REGIONAL_CONFIG para soportar nuevas zonas.
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
      `[MODO REGIONAL ACTIVO]: El usuario está en ${location}. Inyecta la esencia, el carisma y el ritmo local de la Costa Caribe en el mensaje (calidez, alegría, espontaneidad), pero manteniendo la elegancia y sofisticación del plan Premium.`,
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
      `[MODO REGIONAL ACTIVO]: El usuario está en ${location}. Inyecta la amabilidad paisa/cafetera, la cercanía y el optimismo característico de la región (ej. calidez, trato cercano, uso sutil de 'vos' si aplica), manteniendo la elegancia Premium.`,
  },
  {
    id: "bogota_col",
    keywords: ["bogotá", "bogota", "cundinamarca"],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: El usuario está en ${location}. Inyecta la cortesía, la formalidad cálida y el estilo urbano/sofisticado de la capital (cultura rola/cachaca), manteniendo la elegancia Premium.`,
  },
  {
    id: "colombia_general",
    keywords: ["colombia"], // Fallback para otras ciudades de Colombia
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: El usuario está en ${location}. Usa un tono cálido y amable, característico de Colombia, manteniendo la sofisticación Premium.`,
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
      `[MODO REGIONAL ACTIVO]: El usuario está en ${location}. Usa el 'voseo' (vos) y un tono argentino cálido, expresivo y con carácter. Evita el 'tú'. Mantén la elegancia y sofisticación Premium.`,
  },

  // --- MÉXICO ---
  {
    id: "mexico_cdmx",
    keywords: ["ciudad de méxico", "cdmx", "df"],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: El usuario está en ${location}. Inyecta el estilo chilango educado y cálido, con la cortesía característica de la capital, manteniendo un tono sofisticado y Premium.`,
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
      `[MODO REGIONAL ACTIVO]: El usuario está en ${location}. Inyecta la calidez, cortesía y hospitalidad mexicana (ej. amabilidad, 'tú' cercano), manteniendo un tono sofisticado y Premium.`,
  },

  // --- CHILE ---
  {
    id: "chile_general",
    keywords: ["chile", "santiago", "valparaíso", "concepción"],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: El usuario está en ${location}. Usa un tono cercano y cálido propio de Chile, evitando modismos excesivamente informales (slang), pero manteniendo la identidad local y la elegancia Premium.`,
  },

  // --- PERÚ ---
  {
    id: "peru_general",
    keywords: ["perú", "peru", "lima", "cusco", "arequipa"],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: El usuario está en ${location}. Usa un tono amable, respetuoso, suave y lírico, característico de Perú. Mantén la sofisticación Premium.`,
  },
];

const getRegionalBoost = (userLocation, planLevel, neutralMode) => {
  // Solo aplicamos lógica regional para usuarios Premium
  if (planLevel !== "premium" || !userLocation) return "";

  // Si el usuario activó el Modo Neutro, ignoramos la región
  if (neutralMode) return "";

  const locNormalized = userLocation.toLowerCase();

  const region = REGIONAL_CONFIG.find((r) =>
    r.keywords.some((keyword) => locNormalized.includes(keyword)),
  );

  return region ? region.prompt(userLocation) : "";
};

module.exports = {
  getRegionalBoost,
};
