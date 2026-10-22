import { pool } from '../src/db.js';
import bcrypt from 'bcrypt';

async function seedPasswords() {
  try {
    const hashAdmin = await bcrypt.hash('admin123', 10);
    const hashSuper = await bcrypt.hash('sup123', 10);
    const hashOper = await bcrypt.hash('oper123', 10);
    const hashUsu = await bcrypt.hash('usu123', 10);

    // Santiago Galeano (admin)
    await pool.query('UPDATE perfiles SET password = $1 WHERE documento = $2', [hashAdmin, '1064123987']);
    // Santiago Ortiz (admin)
    await pool.query('UPDATE perfiles SET password = $1 WHERE documento = $2', [hashAdmin, '100123456']);
    // Nicolas Tamayo (supervisor)
    await pool.query('UPDATE perfiles SET password = $1 WHERE documento = $2', [hashSuper, '1002345678']);
    // Dolly Montoya (operador)
    await pool.query('UPDATE perfiles SET password = $1 WHERE documento = $2', [hashOper, '1003456789']);
    // Yury Torres (usuario)
    await pool.query('UPDATE perfiles SET password = $1 WHERE documento = $2', [hashUsu, '1040321654']);
    // Sofia Muñoz (usuario)
    await pool.query('UPDATE perfiles SET password = $1 WHERE documento = $2', [hashUsu, '1052987654']);
    // Prueba Password (usuario)
    await pool.query('UPDATE perfiles SET password = $1 WHERE documento = $2', [hashUsu, '99988877']);

    // NOTA: Santiago Suárez Duran (doc: 1038648135) NO SE TOCA.

    const check = await pool.query('SELECT documento, nombre_completo, password FROM perfiles');
    console.log('Resultados de perfiles:');
    check.rows.forEach(r => {
      console.log(`- ${r.nombre_completo} (${r.documento}): ${r.password ? r.password.slice(0, 15) + '...' : 'NULL'}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error seeding passwords:', err);
    process.exit(1);
  }
}

seedPasswords();
