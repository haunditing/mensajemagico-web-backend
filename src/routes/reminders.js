// src/routes/reminders.js
const express = require("express");
const router = express.Router();
const Reminder = require("../models/Reminder");
const User = require("../models/User");
const HolidayService = require("../services/HolidayService");
const authenticate = require("../middleware/auth"); // Asegúrate de tener este middleware
const logger = require("../utils/logger");

// Middleware para verificar Premium
const requirePremium = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    if (user.planLevel !== "premium") {
      return res.status(403).json({
        error: "Acceso denegado",
        upsell:
          "La función de Recordatorios es exclusiva para usuarios Premium.",
      });
    }
    next();
  } catch (error) {
    logger.error("Error verificando premium en recordatorios", { error });
    res.status(500).json({ error: "Error interno" });
  }
};

// GET /api/reminders - Obtener lista unificada
router.get("/", authenticate, requirePremium, async (req, res) => {
  try {
    // 1. Obtener recordatorios personalizados de la DB
    const customReminders = await Reminder.find({ userId: req.userId });

    // 3. Procesar personalizados para calcular próxima ocurrencia
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const processedCustom = customReminders.map((r) => {
      const rObj = r.toObject();
      
      // Si ya tiene nextOccurrence válido (guardado por creación o snooze), usarlo.
      // Si no (datos antiguos), calcularlo al vuelo.
      if (!r.nextOccurrence) {
        let nextDate = new Date(r.date);
        // Lógica de recurrencia anual
        if (r.isRecurring) {
          nextDate.setFullYear(today.getFullYear());
          // Si ya pasó este año (ignorando hora), sumar 1 año
          if (nextDate < today) {
            nextDate.setFullYear(today.getFullYear() + 1);
          }
        }
        rObj.nextOccurrence = nextDate;
      } else {
        rObj.nextOccurrence = r.nextOccurrence;
      }
      return rObj;
    });

    // 4. Unificar y ordenar por fecha más próxima
    const allReminders = processedCustom.sort((a, b) => {
      const dateA = a.nextOccurrence || a.date;
      const dateB = b.nextOccurrence || b.date;
      return new Date(dateA) - new Date(dateB);
    });

    res.json(allReminders);
  } catch (error) {
    logger.error("Error obteniendo recordatorios", { error });
    res.status(500).json({ error: "Error al cargar recordatorios" });
  }
});

// GET /api/reminders/holidays - Obtener festivos disponibles para agregar
router.get("/holidays", authenticate, async (req, res) => {
  try {
    const { country } = req.query;
    const holidays = HolidayService.getUpcomingHolidays(country);
    res.json(holidays);
  } catch (error) {
    logger.error("Error obteniendo festivos", { error });
    res.status(500).json({ error: "Error al cargar festivos" });
  }
});

// Helper para validar fechas pasadas (UTC)
const isDateInPast = (dateString) => {
  const inputDate = new Date(dateString);
  const now = new Date();
  // Crear fecha de "hoy" en UTC medianoche para comparar manzanas con manzanas
  const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return inputDate < todayUTC;
};

// POST /api/reminders - Crear nuevo
router.post("/", authenticate, requirePremium, async (req, res) => {
  try {
    const { title, date, type, isRecurring, notes, notificationTime, socialPlatform } = req.body;

    if (!title || !date) {
      return res.status(400).json({ error: "Título y fecha son requeridos" });
    }

    // Validar que no sea fecha pasada si no es recurrente
    if (!isRecurring && isDateInPast(date)) {
      return res.status(400).json({ error: "La fecha no puede estar en el pasado." });
    }

    // Calcular próxima ocurrencia inicial
    // FIX: Usar componentes locales para evitar que la zona horaria mueva la fecha al año siguiente
    // Soporte para ISO string (YYYY-MM-DDTHH:mm:ss.sssZ) o YYYY-MM-DD
    const cleanDate = date.toString().split('T')[0];
    const [y, m, d] = cleanDate.split('-').map(Number);
    const reminderDate = new Date(y, m - 1, d); // Fecha local 00:00
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let nextOccurrence = new Date(reminderDate);
    if (isRecurring) {
      nextOccurrence.setFullYear(today.getFullYear());
      // Comparar timestamps para precisión
      if (nextOccurrence.getTime() < today.getTime()) {
        nextOccurrence.setFullYear(today.getFullYear() + 1);
      }
    }

    const reminder = new Reminder({
      userId: req.userId,
      title,
      date: reminderDate,
      nextOccurrence: nextOccurrence, // Guardamos la fecha calculada
      type: type || "custom",
      isRecurring: isRecurring !== undefined ? isRecurring : true,
      notes,
      notificationTime: notificationTime || "09:00",
      socialPlatform
    });

    await reminder.save();
    res.status(201).json(reminder);
  } catch (error) {
    logger.error("Error creando recordatorio", { error });
    res.status(500).json({ error: "Error al guardar recordatorio" });
  }
});

// PUT /api/reminders/:id - Editar existente
router.put("/:id", authenticate, requirePremium, async (req, res) => {
  try {
    const { title, date, type, isRecurring, notes, notificationTime, socialPlatform } = req.body;
    
    const reminder = await Reminder.findOne({ _id: req.params.id, userId: req.userId });
    if (!reminder) {
      return res.status(404).json({ error: "Recordatorio no encontrado" });
    }

    // Actualizar campos simples
    if (title) reminder.title = title;
    if (type) reminder.type = type;
    if (isRecurring !== undefined) reminder.isRecurring = isRecurring;
    if (notes !== undefined) reminder.notes = notes;
    if (notificationTime) reminder.notificationTime = notificationTime;
    if (socialPlatform !== undefined) reminder.socialPlatform = socialPlatform;

    // Si cambia la fecha, recalcular próxima ocurrencia
    if (date) {
      // Validar fecha pasada en edición
      const recurringStatus = isRecurring !== undefined ? isRecurring : reminder.isRecurring;
      if (!recurringStatus && isDateInPast(date)) {
        return res.status(400).json({ error: "La fecha no puede estar en el pasado." });
      }

      const cleanDate = date.toString().split('T')[0];
      const [y, m, d] = cleanDate.split('-').map(Number);
      const newDate = new Date(y, m - 1, d);
      reminder.date = newDate;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let nextOccurrence = new Date(newDate);
      if (reminder.isRecurring) {
        nextOccurrence.setFullYear(today.getFullYear());
        if (nextOccurrence.getTime() < today.getTime()) {
          nextOccurrence.setFullYear(today.getFullYear() + 1);
        }
      }
      reminder.nextOccurrence = nextOccurrence;
    }

    await reminder.save();
    res.json(reminder);
  } catch (error) {
    logger.error("Error actualizando recordatorio", { error });
    res.status(500).json({ error: "Error al actualizar" });
  }
});

// POST /api/reminders/:id/snooze - Posponer recordatorio
router.post("/:id/snooze", authenticate, requirePremium, async (req, res) => {
  try {
    const { days, targetDate } = req.body;
    const reminder = await Reminder.findOne({ _id: req.params.id, userId: req.userId });

    if (!reminder) {
      return res.status(404).json({ error: "Recordatorio no encontrado" });
    }

    if (targetDate) {
      if (isDateInPast(targetDate)) {
        return res.status(400).json({ error: "La fecha debe ser futura" });
      }
      reminder.nextOccurrence = new Date(targetDate);
    } else {
      // Calcular nueva fecha sumando días
      // Si la fecha programada ya pasó, posponer desde "ahora". Si es futura, sumar a esa fecha.
      const now = new Date();
      const currentNext = reminder.nextOccurrence ? new Date(reminder.nextOccurrence) : new Date(reminder.date);
      const baseDate = currentNext < now ? now : currentNext;
      baseDate.setDate(baseDate.getDate() + parseInt(days || 1));
      reminder.nextOccurrence = baseDate;
    }

    await reminder.save();
    res.json(reminder);
  } catch (error) {
    logger.error("Error posponiendo recordatorio", { error });
    res.status(500).json({ error: "Error al posponer" });
  }
});

// DELETE /api/reminders/:id - Eliminar
router.delete("/:id", authenticate, requirePremium, async (req, res) => {
  try {
    const result = await Reminder.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!result) {
      return res.status(404).json({ error: "Recordatorio no encontrado" });
    }

    res.json({ message: "Recordatorio eliminado" });
  } catch (error) {
    logger.error("Error eliminando recordatorio", { error });
    res.status(500).json({ error: "Error al eliminar" });
  }
});

module.exports = router;
