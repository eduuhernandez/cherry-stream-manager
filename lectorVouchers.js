require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

async function analizarComprobante({ base64Data, mimeType }) {
  if (!apiKey) {
    throw new Error("No se encontró GEMINI_API_KEY en las variables de entorno");
  }

  const prompt =
    'Analiza este comprobante de transferencia bancaria mexicano (SPEI, OXXO, BBVA, Mercado Pago, Nu, etc.). ' +
    'Devuelve EXCLUSIVAMENTE un objeto JSON válido sin bloques markdown ni texto extra con esta estructura: ' +
    '{ "esComprobanteValido": true, "monto": 70.00, "cuentaDestino": "terminacion o CLABE", "beneficiario": "nombre", "claveRastreo": "folio o clave de rastreo" }';

  const imagePart = {
    inlineData: {
      data: base64Data,
      mimeType: mimeType || "image/jpeg"
    }
  };

  const modelos = [
    "gemini-3.8-flash",
    "gemini-2.5-flash-lite",
    "gemini-1.5-flash"
  ];

  let result = null;
  let ultimoError = null;

  for (const m of modelos) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      result = await model.generateContent([prompt, imagePart]);
      if (result && result.response) break;
    } catch (err) {
      ultimoError = err;
      console.warn(`⚠️ Modelo ${m} falló: ${err.message?.split("\n")[0]}. Probando siguiente...`);
    }
  }

  if (!result || !result.response) {
    throw ultimoError || new Error("Ningún modelo de Gemini pudo procesar la imagen");
  }

  const rawText = result.response.text().trim();
  const jsonLimpio = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const data = JSON.parse(jsonLimpio);
    return {
      esComprobanteValido: Boolean(data.esComprobanteValido),
      monto: Number(data.monto) || 0,
      cuentaDestino: String(data.cuentaDestino || "").trim(),
      beneficiario: String(data.beneficiario || "").trim(),
      claveRastreo: String(data.claveRastreo || "").trim()
    };
  } catch (parseErr) {
    throw new Error(`Respuesta no parseable como JSON: ${rawText}`);
  }
}

module.exports = { analizarComprobante };