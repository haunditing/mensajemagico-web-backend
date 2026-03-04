/**
 * Script para ajustar los días de vencimiento del usuario de prueba
 * 
 * Uso: node scripts/adjustTestUser.js [días]
 * Ejemplo: node scripts/adjustTestUser.js 7
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

const TEST_USER_EMAIL = 'test.wompi.renewal@mensajemagico.com';

async function adjustTestUser() {
  const daysUntilExpiration = parseInt(process.argv[2]) || 3;
  
  if (daysUntilExpiration < 0 || daysUntilExpiration > 30) {
    console.log('❌ Los días deben estar entre 0 y 30');
    process.exit(1);
  }
  
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Calcular la fecha de pago necesaria para el vencimiento deseado
    const lastPaymentDate = new Date();
    lastPaymentDate.setDate(lastPaymentDate.getDate() - (30 - daysUntilExpiration));
    
    const result = await User.updateOne(
      { email: TEST_USER_EMAIL },
      { $set: { lastPaymentDate: lastPaymentDate } }
    );
    
    if (result.matchedCount === 0) {
      console.log('❌ Usuario no encontrado. Ejecuta primero: node scripts/testWompiRenewal.js');
      process.exit(1);
    }
    
    const user = await User.findOne({ email: TEST_USER_EMAIL });
    const actualDays = user.getDaysUntilExpiration();
    const expirationDate = user.getExpirationDate();
    const needsRenewal = user.needsRenewal();
    
    console.log('\n✅ Usuario actualizado exitosamente\n');
    console.log(`📧 Email: ${TEST_USER_EMAIL}`);
    console.log(`📅 Último pago: ${lastPaymentDate.toLocaleDateString()}`);
    console.log(`⏰ Días hasta expiración: ${actualDays}`);
    console.log(`📆 Fecha de expiración: ${expirationDate.toLocaleDateString()}`);
    console.log(`🔔 Necesita renovación: ${needsRenewal ? 'SÍ' : 'NO'}`);
    console.log(`📬 Se enviará email: ${[7, 3, 1].includes(actualDays) ? 'SÍ' : 'NO (solo en días 7, 3, 1)'}`);
    
    console.log('\n📱 Ahora puedes:');
    console.log('1. Ir a http://localhost:5174');
    console.log(`2. Iniciar sesión con: ${TEST_USER_EMAIL}`);
    console.log('3. Ver tu perfil y verificar el banner de renovación\n');
    
  } catch (error) {
    logger.error('Error ajustando usuario:', error);
  } finally {
    await mongoose.disconnect();
  }
}

adjustTestUser();
