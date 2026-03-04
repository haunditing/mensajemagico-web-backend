/**
 * Script para establecer contraseña al usuario de prueba
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

const TEST_USER_EMAIL = 'test.wompi.renewal@mensajemagico.com';
const TEST_PASSWORD = 'test123';

async function setPassword() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
    
    const result = await User.updateOne(
      { email: TEST_USER_EMAIL },
      { $set: { password: hashedPassword } }
    );
    
    if (result.matchedCount === 0) {
      console.log('❌ Usuario no encontrado');
      process.exit(1);
    }
    
    console.log('\n✅ Contraseña establecida exitosamente\n');
    console.log('📧 Email:', TEST_USER_EMAIL);
    console.log('🔑 Password:', TEST_PASSWORD);
    console.log('\n🚀 Ya puedes iniciar sesión en http://localhost:5174\n');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

setPassword();
