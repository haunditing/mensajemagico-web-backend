/**
 * Servicio de Contexto Regional
 * Centraliza la lógica para adaptar los mensajes a la cultura local del usuario.
 * Escalable: Solo agrega objetos a REGIONAL_CONFIG para soportar nuevas zonas.
 */

const REGIONAL_CONFIG = [
  {
    id: "costa_caribe_col",
    keywords: ["cartagena", "barranquilla", "santa marta", "valledupar"],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: El usuario está en ${location}. Inyecta la esencia, el carisma y el ritmo local de esta región en el mensaje (ej. calidez costeña, referencias sutiles), pero manteniendo la elegancia y sofisticación del plan Premium.`,
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
    ],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: El usuario está en ${location}. Inyecta la amabilidad paisa, la cercanía y el optimismo característico de la región (ej. calidez, trato cercano, uso sutil de 'vos' si aplica), manteniendo la elegancia Premium.`,
  },
  {
    id: "bogota_col",
    keywords: ["bogotá", "bogota"],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: El usuario está en ${location}. Inyecta la cortesía, la formalidad cálida y el estilo urbano/sofisticado de la capital (cultura rola/cachaca), manteniendo la elegancia Premium.`,
  },
  // Ejemplo de escalabilidad internacional:
  {
    id: "mexico_cdmx",
    keywords: ["ciudad de méxico", "cdmx", "df"],
    prompt: (location) =>
      `[MODO REGIONAL ACTIVO]: El usuario está en ${location}. Inyecta la calidez y cortesía mexicana (ej. uso sutil de 'ahorita', amabilidad), manteniendo un tono sofisticado y Premium.`,
  },
];

const getRegionalBoost = (userLocation, planLevel) => {
  // Solo aplicamos lógica regional para usuarios Premium
  if (planLevel !== "premium" || !userLocation) return "";

  const locNormalized = userLocation.toLowerCase();

  const region = REGIONAL_CONFIG.find((r) =>
    r.keywords.some((keyword) => locNormalized.includes(keyword)),
  );

  return region ? region.prompt(userLocation) : "";
};

module.exports = {
  getRegionalBoost,
};
