const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");

const app = initializeApp({
  credential: cert(serviceAccount)
});

const auth = getAuth(app);
const db = getFirestore(app);

async function gestionarLicencia() {
  const args = process.argv.slice(2);
  const email = args[0];
  const dias = parseInt(args[1], 10) || 30;

  if (!email) {
    console.log("\n❌ Uso: node activar.js <correo> <dias>");
    console.log("Ejemplo: node activar.js cliente@gmail.com 30\n");
    process.exit(1);
  }

  try {
    const userRecord = await auth.getUserByEmail(email);
    const uid = userRecord.uid;
    const ahora = Date.now();
    const duracionMs = dias * 24 * 60 * 60 * 1000;
    const nuevaFechaVencimiento = ahora + duracionMs;

    await db.collection("users").doc(uid).set({
      email: email,
      status: "active",
      validUntil: nuevaFechaVencimiento,
      updatedAt: ahora
    }, { merge: true });

    const fechaLegible = new Date(nuevaFechaVencimiento).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    console.log(`\n==========================================`);
    console.log(`✅ [MEMBRESÍA ACTIVADA EXITOSAMENTE]`);
    console.log(`👤 Usuario: ${email}`);
    console.log(`🆔 UID: ${uid}`);
    console.log(`📅 Vigencia asignada: +${dias} días`);
    console.log(`⏳ Fecha de corte: ${fechaLegible}`);
    console.log(`==========================================\n`);

  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`\n❌ Error: El usuario '${email}' no existe en Firebase. Debe registrarse primero en la web.\n`);
    } else {
      console.error("\n❌ Error:", error.message, "\n");
    }
  } finally {
    process.exit(0);
  }
}

gestionarLicencia();