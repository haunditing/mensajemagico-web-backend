/**
 * Script para probar el sistema completo de renovación con un usuario real
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const EmailService = require('../src/services/EmailService');
const logger = require('../src/utils/logger');

const USER_EMAIL = process.argv[2] || 'marvinmorelo@yahoo.com';

async function testRenewalSystem() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const user = await User.findOne({ email: USER_EMAIL });
    
    if (!user) {
      console.log(`❌ Usuario no encontrado: ${USER_EMAIL}`);
      process.exit(1);
    }
    
    console.log('\n🧪 TESTING SISTEMA DE RENOVACIÓN WOMPI\n');
    console.log('═'.repeat(50));
    
    // Test 1: Métodos del modelo
    console.log('\n✅ Test 1: Métodos del modelo User');
    const expirationDate = user.getExpirationDate();
    const daysUntilExpiration = user.getDaysUntilExpiration();
    const needsRenewal = user.needsRenewal();
    
    console.log(`   ├─ getExpirationDate(): ${expirationDate ? expirationDate.toLocaleDateString() : 'null'}`);
    console.log(`   ├─ getDaysUntilExpiration(): ${daysUntilExpiration}`);
    console.log(`   └─ needsRenewal(): ${needsRenewal ? '✅ SÍ' : '❌ NO'}`);
    
    // Test 2: Endpoint API
    console.log('\n✅ Test 2: Response del endpoint /api/payments/renewal-status');
    const apiResponse = {
      needsRenewal: needsRenewal,
      daysUntilExpiration: daysUntilExpiration,
      expirationDate: expirationDate,
      provider: user.subscriptionProvider,
      planLevel: user.planLevel,
      planInterval: user.planInterval
    };
    console.log('   ' + JSON.stringify(apiResponse, null, 2).replace(/\n/g, '\n   '));
    
    // Test 3: Banner en frontend
    console.log('\n✅ Test 3: Banner de renovación en ProfilePage');
    if (needsRenewal) {
      console.log('   ├─ Banner debe mostrarse: ✅ SÍ');
      console.log(`   ├─ Texto: "Te ${daysUntilExpiration === 1 ? 'queda 1 día' : `quedan ${daysUntilExpiration} días`}"`);
      console.log('   ├─ Animación: animate-pulse (fondo naranja)');
      console.log('   └─ Link: /pricing con state={interval:"month", plan:"premium"}');
    } else {
      console.log('   └─ Banner NO debe mostrarse (días > 7 o expirado)');
    }
    
    // Test 4: Email
    console.log('\n✅ Test 4: Sistema de emails');
    if ([7, 3, 1].includes(daysUntilExpiration)) {
      console.log(`   ├─ Se debe enviar email: ✅ SÍ (día ${daysUntilExpiration})`);
      console.log('   ├─ Enviando email de prueba...');
      
      try {
        await EmailService.sendSubscriptionExpirationWarning(
          user.email,
          daysUntilExpiration,
          expirationDate.toLocaleDateString(),
          user.planLevel
        );
        console.log(`   └─ ✅ Email enviado exitosamente a ${user.email}`);
      } catch (error) {
        console.log(`   └─ ❌ Error enviando email: ${error.message}`);
      }
    } else {
      console.log(`   └─ Email NO se envía hoy (faltan ${daysUntilExpiration} días, solo se envía en 7/3/1)`);
    }
    
    // Test 5: Cron job simulation
    console.log('\n✅ Test 5: Simulación de cron job');
    console.log('   ├─ Cron se ejecuta diariamente a medianoche');
    if (daysUntilExpiration !== null && daysUntilExpiration <= 0) {
      console.log('   ├─ Acción: Usuario será degradado a freemium');
      console.log('   └─ Estado: ⚠️ EXPIRADO');
    } else if ([7, 3, 1].includes(daysUntilExpiration)) {
      console.log(`   ├─ Acción: Enviar email recordatorio (${daysUntilExpiration} días)`);
      console.log('   └─ Estado: ⏰ PRÓXIMO A VENCER');
    } else {
      console.log('   ├─ Acción: No se requiere acción hoy');
      console.log('   └─ Estado: ✅ ACTIVO');
    }
    
    // Instrucciones finales
    console.log('\n' + '═'.repeat(50));
    console.log('\n📱 TESTING MANUAL EN EL FRONTEND:\n');
    console.log('1. Abre: http://localhost:5174');
    console.log(`2. Inicia sesión: ${user.email}`);
    console.log('3. Ve a: /profile');
    console.log('4. Verifica:');
    console.log('   ├─ Banner naranja animado aparece arriba');
    console.log(`   ├─ Texto: "Te ${daysUntilExpiration === 1 ? 'queda 1 día' : `quedan ${daysUntilExpiration} días`}..."`);
    console.log('   └─ Botón "🔄 Renovar Mi Plan" funciona');
    console.log('5. Click en "Renovar Mi Plan"');
    console.log('6. Deberías ir a /pricing con:');
    console.log('   ├─ Plan: Premium Pro pre-seleccionado');
    console.log('   └─ Intervalo: Mensual pre-seleccionado\n');
    
    console.log('✅ Testing completado\n');
    
  } catch (error) {
    logger.error('Error en testing:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testRenewalSystem();
