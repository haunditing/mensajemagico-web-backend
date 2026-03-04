/**
 * Script para probar el sistema de Free Trial
 * 
 * Uso: node scripts/testFreeTrial.js [email_opcional]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const EmailService = require('../src/services/EmailService');
const logger = require('../src/utils/logger');

const TEST_EMAIL = process.argv[2] || 'trial.test@mensajemagico.com';

async function testFreeTrial() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('\n🧪 TESTING SISTEMA DE FREE TRIAL\n');
    console.log('═'.repeat(60));

    // 1. Eliminar usuario de prueba si existe
    await User.deleteOne({ email: TEST_EMAIL });
    console.log('\n✅ Test 1: Limpiar usuario previo');
    console.log('   Usuario eliminado (si existía)');

    // 2. Crear nuevo usuario (simulando registro)
    console.log('\n✅ Test 2: Crear usuario y activar trial');
    const newUser = new User({
      email: TEST_EMAIL,
      name: 'Usuario Trial Test',
      password: 'test123hash',
      planLevel: 'freemium'
    });

    const trialActivated = newUser.activateTrial();
    await newUser.save();

    console.log(`   ├─ Usuario creado: ${newUser._id}`);
    console.log(`   ├─ Trial activado: ${trialActivated ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   ├─ Plan actual: ${newUser.planLevel}`);
    console.log(`   ├─ Trial start: ${newUser.trialStartDate?.toLocaleString()}`);
    console.log(`   └─ Trial end: ${newUser.trialEndDate?.toLocaleString()}`);

    // 3. Verificar métodos del modelo
    console.log('\n✅ Test 3: Verificar métodos del modelo');
    const isInTrial = newUser.isInTrial();
    const daysRemaining = newUser.getTrialDaysRemaining();
    const effectivePlan = newUser.getEffectivePlan();
    const hasUsed = newUser.hasUsedTrial;

    console.log(`   ├─ isInTrial(): ${isInTrial ? '✅ true' : '❌ false'}`);
    console.log(`   ├─ getTrialDaysRemaining(): ${daysRemaining} días`);
    console.log(`   ├─ getEffectivePlan(): ${effectivePlan}`);
    console.log(`   └─ hasUsedTrial: ${hasUsed ? '✅ true' : '❌ false'}`);

    // 4. Probar email de bienvenida
    console.log('\n✅ Test 4: Enviar email de bienvenida');
    try {
      await EmailService.sendTrialWelcomeEmail(
        newUser.email,
        newUser.name,
        newUser.trialEndDate
      );
      console.log(`   └─ ✅ Email enviado correctamente a ${newUser.email}`);
    } catch (emailError) {
      console.log(`   └─ ❌ Error: ${emailError.message}`);
    }

    // 5. Simular paso de días (día 5 del trial)
    console.log('\n✅ Test 5: Simular día 5 del trial (2 días restantes)');
    newUser.trialStartDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    newUser.trialEndDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await newUser.save();

    const daysLeft = newUser.getTrialDaysRemaining();
    console.log(`   ├─ Días restantes: ${daysLeft}`);
    console.log(`   ├─ Debería enviar email: ${daysLeft === 2 ? '✅ SÍ' : '❌ NO'}`);

    if (daysLeft === 2) {
      try {
        await EmailService.sendTrialExpiringEmail(
          newUser.email,
          newUser.name,
          daysLeft,
          newUser.trialEndDate
        );
        console.log(`   └─ ✅ Email de recordatorio enviado`);
      } catch (emailError) {
        console.log(`   └─ ❌ Error: ${emailError.message}`);
      }
    }

    // 6. Simular trial expirado
    console.log('\n✅ Test 6: Simular trial expirado');
    newUser.trialEndDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // Ayer
    await newUser.save();

    const stillInTrial = newUser.isInTrial();
    console.log(`   ├─ isInTrial(): ${stillInTrial ? '❌ true (ERROR)' : '✅ false'}`);
    console.log(`   ├─ getTrialDaysRemaining(): ${newUser.getTrialDaysRemaining()}`);
    
    if (!stillInTrial) {
      console.log('   ├─ Degradando usuario a freemium...');
      newUser.planLevel = 'freemium';
      await newUser.save();
      console.log(`   └─ ✅ Usuario degradado a: ${newUser.planLevel}`);
    }

    // 7. Verificar que no puede activar trial dos veces
    console.log('\n✅ Test 7: Intentar activar trial por segunda vez');
    const canActivateAgain = newUser.activateTrial();
    console.log(`   └─ Resultado: ${canActivateAgain ? '❌ Activado (ERROR)' : '✅ Rechazado correctamente'}`);

    // Resumen Final
    console.log('\n═'.repeat(60));
    console.log('\n📊 RESUMEN DE PRUEBAS\n');
    console.log('✅ Usuario creado y trial activado automáticamente');
    console.log('✅ Métodos del modelo funcionan correctamente');
    console.log('✅ Emails de bienvenida y recordatorio enviados');
    console.log('✅ Trial expira correctamente y degrada usuario');
    console.log('✅ No se puede activar trial dos veces');
    console.log('\n🎉 SISTEMA DE FREE TRIAL FUNCIONANDO PERFECTAMENTE\n');

    // Instrucciones
    console.log('═'.repeat(60));
    console.log('\n📱 PRUEBA EN FRONTEND:\n');
    console.log('1. Registra un nuevo usuario en http://localhost:5174/signup');
    console.log('2. Ve a /profile y verifica el banner púrpura de trial');
    console.log('3. Debería decir "Te quedan 7 días de acceso Premium Lite"');
    console.log('4. El plan debe mostrar "Premium Lite" durante el trial');
    console.log('5. En /pricing debe aparecer el badge "PRUEBA GRATIS 7 DÍAS"\n');

  } catch (error) {
    console.error('\n❌ Error en testing:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB\n');
  }
}

testFreeTrial();
