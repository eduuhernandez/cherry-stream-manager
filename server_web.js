require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { getApps, initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { analizarComprobante } = require("./lectorVouchers");

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.static("."));

let db;
try {
  if (getApps().length === 0) {
    if (require("fs").existsSync("./firebase-credentials.json")) {
      initializeApp({ credential: cert(require("./firebase-credentials.json")) });
    } else {
      initializeApp();
    }
  }
  db = getFirestore();
  console.log("🔥 Firestore conectado correctamente en server_web");
} catch (e) {
  console.error("Error inicializando Firestore:", e.message);
}

app.post("/api/validar-voucher", async (req, res) => {
  try {
    const { base64Data, mimeType, phone, userCode, montoDeclarado, folioDeclarado } = req.body;

    if (!base64Data) {
      return res.status(400).json({ ok: false, error: "No se envió la captura del comprobante." });
    }

    const numMonto = parseFloat(montoDeclarado);
    const strFolio = String(folioDeclarado || "").trim().toUpperCase();

    if (isNaN(numMonto) || numMonto <= 0) {
      return res.status(400).json({ ok: false, error: "Ingresa un monto válido a recargar." });
    }

    if (!strFolio || strFolio.length < 3) {
      return res.status(400).json({ ok: false, error: "El folio o clave de rastreo es obligatorio." });
    }

    // 1. Anti-duplicados previo: verificar folio declarado en used_vouchers
    const voucherRef = db.collection("used_vouchers").doc(strFolio.replace(/\s+/g, ""));
    const voucherDoc = await voucherRef.get();
    if (voucherDoc.exists) {
      return res.status(409).json({
        ok: false,
        error: `El folio "${strFolio}" ya fue acreditado anteriormente.`
      });
    }

    // 2. Analizar captura con Gemini 3.8 Flash
    const analisis = await analizarComprobante({ base64Data, mimeType: mimeType || "image/jpeg" });

    if (!analisis.esComprobanteValido || analisis.monto <= 0) {
      return res.status(422).json({
        ok: false,
        error: "La imagen no parece ser un comprobante de transferencia válido o legible."
      });
    }

    // 3. Validación Cruzada: Monto declarado vs Monto detectado
    const diferencia = Math.abs(analisis.monto - numMonto);
    if (diferencia > 0.05) {
      return res.status(422).json({
        ok: false,
        error: `El monto que ingresaste ($${numMonto.toFixed(2)}) no coincide con el comprobante ($${analisis.monto.toFixed(2)} MXN).`
      });
    }

    // 4. Validación Cruzada: Folio / Clave de Rastreo (si Gemini detectó folio en la imagen)
    const folioDetectado = String(analisis.claveRastreo || "").toUpperCase().replace(/\s+/g, "");
    const folioLimpioDeclarado = strFolio.replace(/\s+/g, "");

    if (folioDetectado && !folioDetectado.includes(folioLimpioDeclarado) && !folioLimpioDeclarado.includes(folioDetectado)) {
      // Si ambos tienen más de 4 caracteres y no concuerdan
      if (folioDetectado.length >= 4 && folioLimpioDeclarado.length >= 4) {
        return res.status(422).json({
          ok: false,
          error: `El folio ingresado (${strFolio}) no concuerda con el detectado en la captura (${analisis.claveRastreo}).`
        });
      }
    }

    // 5. Buscar cliente en Firestore
    const cleanPhone = String(phone || "").replace(/\D/g, "").slice(-10);
    let userDoc = null;
    if (cleanPhone) {
      const qSnap = await db.collection("customers").where("phone", "==", cleanPhone).limit(1).get();
      if (!qSnap.empty) userDoc = qSnap.docs[0];
    }
    if (!userDoc && userCode) {
      const qCode = await db.collection("customers").where("customerCode", "==", userCode).limit(1).get();
      if (!qCode.empty) userDoc = qCode.docs[0];
    }

    if (!userDoc) {
      const newRef = db.collection("customers").doc();
      await newRef.set({
        phone: cleanPhone || userCode,
        customerCode: userCode || cleanPhone,
        balance: 0,
        createdAt: FieldValue.serverTimestamp()
      });
      userDoc = await newRef.get();
    }

    const prevBalance = Number(userDoc.data().balance || 0);
    const newBalance = prevBalance + numMonto;

    // 6. Transacción atómica en Firestore
    const batch = db.batch();
    batch.set(voucherRef, {
      claveRastreo: strFolio,
      claveDetectadaIA: analisis.claveRastreo || "",
      monto: numMonto,
      cuentaDestino: analisis.cuentaDestino || "",
      beneficiario: analisis.beneficiario || "",
      phone: cleanPhone || userDoc.data().phone,
      userCode: userCode || "",
      origen: "WEB_PORTAL",
      createdAt: FieldValue.serverTimestamp()
    });

    batch.update(userDoc.ref, {
      balance: newBalance,
      lastRechargeAt: FieldValue.serverTimestamp()
    });

    await batch.commit();

    return res.json({
      ok: true,
      monto: numMonto,
      nuevoSaldo: newBalance,
      folio: strFolio
    });

  } catch (error) {
    console.error("Error procesando comprobante web:", error);
    return res.status(500).json({ ok: false, error: error.message || "Error al procesar la solicitud." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor Web & API corriendo en http://localhost:${PORT}`);
});
