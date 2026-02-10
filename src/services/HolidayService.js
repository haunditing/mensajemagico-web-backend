// src/services/HolidayService.js

// Configuración básica de festivos por país (Mes es 0-indexado: 0=Enero, 11=Diciembre)
const HOLIDAYS_BY_COUNTRY = {
  CO: [
    { month: 0, day: 1, title: "Año Nuevo" },
    { month: 4, day: 1, title: "Día del Trabajo" },
    { month: 6, day: 20, title: "Día de la Independencia" },
    { month: 7, day: 7, title: "Batalla de Boyacá" },
    { month: 11, day: 8, title: "Inmaculada Concepción" },
    { month: 11, day: 25, title: "Navidad" },
  ],
  MX: [
    { month: 0, day: 1, title: "Año Nuevo" },
    { month: 1, day: 5, title: "Día de la Constitución" },
    { month: 2, day: 21, title: "Natalicio de Benito Juárez" },
    { month: 4, day: 1, title: "Día del Trabajo" },
    { month: 8, day: 16, title: "Día de la Independencia" },
    { month: 10, day: 20, title: "Revolución Mexicana" },
    { month: 11, day: 25, title: "Navidad" },
  ],
  AR: [
    { month: 0, day: 1, title: "Año Nuevo" },
    { month: 2, day: 24, title: "Día de la Memoria" },
    { month: 3, day: 2, title: "Día del Veterano" },
    { month: 4, day: 1, title: "Día del Trabajador" },
    { month: 4, day: 25, title: "Día de la Revolución de Mayo" },
    { month: 5, day: 20, title: "Día de la Bandera" },
    { month: 6, day: 9, title: "Día de la Independencia" },
    { month: 11, day: 25, title: "Navidad" },
  ],
  // Fallback genérico para otros países
  GENERIC: [
    { month: 0, day: 1, title: "Año Nuevo" },
    { month: 11, day: 25, title: "Navidad" },
  ],
};

const getUpcomingHolidays = (countryCode) => {
  const code = (countryCode || "GENERIC").toUpperCase();
  const templates = HOLIDAYS_BY_COUNTRY[code] || HOLIDAYS_BY_COUNTRY["GENERIC"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();

  return templates.map((h) => {
    // Crear fecha para este año
    let date = new Date(currentYear, h.month, h.day);

    // Si la fecha ya pasó este año, calculamos la del próximo
    if (date < today) {
      date.setFullYear(currentYear + 1);
    }

    return {
      _id: `holiday_${code}_${h.month}_${h.day}`, // ID virtual para el frontend
      title: h.title,
      date: date, // Fecha próxima
      type: "holiday",
      isRecurring: true,
      isAutomatic: true,
      country: code,
    };
  });
};

module.exports = { getUpcomingHolidays };
