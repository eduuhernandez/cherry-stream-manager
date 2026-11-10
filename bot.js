const { analizarComprobante } = require('./lectorVouchers');
let sock = null;
﻿const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  delay 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

// 1. Inicializar Firebase Admin
const serviceAccount = require('./serviceAccount.json');
if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}
const db = getFirestore();

// 2. Cargar Catálogo Dinámico y Menú Visual
const catalog = require('./catalogData.json');
const menuContent = fs.readFileSync(path.join(__dirname, 'menuText.txt'), 'utf8');

const ALIAS_MAP = {};
const ALIAS_PRICES = {};

for (const category of Object.values(catalog)) {
  for (const [alias, data] of Object.entries(category)) {
    ALIAS_MAP[alias] = data.name;
    ALIAS_PRICES[alias] = data.price;
  }
}

// 3. Configuración de Operador
const ADMIN_NUMBERS = [
  '98630283317462',
  '5517667021',
  '525517667021',
  '5215517667021',
  '639559603306'
];

let isConnecting = false;

async function startBot() {
  if (isConnecting) return;
  isConnecting = true;

  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info_baileys'));

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true
  });
  registerActiveSocket(sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n🍒 ESCANEA ESTE CÓDIGO QR CON WHATSAPP:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      isConnecting = false;
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`⚠️ Conexión cerrada (Código: ${statusCode || 'desconocido'}). Reconectando: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(startBot, 4000);
      } else {
        console.log('❌ Sesión cerrada desde WhatsApp.');
      }
    } else if (connection === 'open') {
      isConnecting = false;
      console.log('\n🍒 CHERRY STREAM BOT EN LÍNEA Y CONECTADO CON ÉXITO 🍒\n');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    // Grupos habilitados

    const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || '').trim();
    if (!body) return;

    console.log(`📩 Mensaje recibido de ${from}: "${body}"`);

    const cleanTo10Digits = (raw) => {
      const digits = String(raw || '').replace(/\D/g, '');
      return digits.slice(-10);
    };

    const isGroup = from.endsWith('@g.us');
    const participantJid = isGroup ? (msg.key.participant || '') : from;

    let senderPhone = participantJid.split('@')[0];
    const realJid = msg.key.remoteJidAlt || (msg.key.participantAlt || '');
    if (realJid) {
      senderPhone = realJid.split('@')[0];
    } else if (participantJid.includes('98630283317462') || from.includes('98630283317462')) {
      senderPhone = '5517667021';
    }
    senderPhone = cleanTo10Digits(senderPhone);

    const isAdmin = ADMIN_NUMBERS.some(id => participantJid.includes(id) || from.includes(id) || senderPhone.includes(cleanTo10Digits(id)));

    const sendSafeMessage = async (text, targetJid = from) => {
      try {
        await sock.sendPresenceUpdate('composing', targetJid);
        await delay(500);
        await sock.sendMessage(targetJid, { text });
        await sock.sendPresenceUpdate('paused', targetJid);
      } catch (err) {
        console.error('Error enviando mensaje:', err);
      }
    };

    // COMANDO: SALUDO / BIENVENIDA
    if (/^(hola|buenas|inicio|start)/i.test(body)) {
      const welcomeText = "🍒✨ *¡BIENVENIDO A CHERRY STREAM MX!* ✨🍒\n" +
        "Tu portal favorito de streaming y entretenimiento al mejor precio. 🍿🎧\n\n" +
        "🌐 *Visita nuestra tienda oficial:*\nhttps://cherrystream.netlify.app\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "📌 *COMANDOS DISPONIBLES:*\n" +
        "- *-stock* ➔ Ver catálogo y alias con precios\n" +
        "- *-menu* ➔ Ver guía y opciones del bot\n" +
        "- *-saldo* ➔ Consultar tu saldo disponible\n" +
        "- *-web* ➔ Conoce las ventajas de la tienda online\n" +
        "- *-registrar <Código>* ➔ Registro de cliente (Ej: -registrar Abcd12)\n" +
        "- *-comprar <alias>* ➔ Comprar con saldo o generar orden (Ej: -comprar net)\n" +
        "- *-miservicio* ➔ Consultar tus cuentas activas\n" +
        "- *-pagos* ➔ Cuentas de transferencia SPEI\n" +
        "- *-reglas* ➔ Políticas de uso y términos de garantía\n" +
        (isAdmin ? "\n👑 *COMANDOS OPERADOR:*\n- *-usuarios* ➔ Consultar clientes registrados\n- *-acreditar <monto> [user]* ➔ Recargar saldo\n- *-entregar <alias> <user|tel>* ➔ Despachar servicio\n" : "") +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Escribe *-stock* para conocer todos los productos disponibles.";

      await sendSafeMessage(welcomeText);
      return;
    }

    // COMANDO: -menu
    if (body.toLowerCase() === '-menu') {
      const menuGuide = "🍒✨ *MENÚ PRINCIPAL CHERRY STREAM MX* ✨🍒\n" +
        "Tu portal de streaming y entretenimiento al mejor precio. 🍿🎧\n\n" +
        "🌐 *Tienda Web:* https://cherrystream.netlify.app\n\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "📌 *COMANDOS DISPONIBLES:*\n" +
        "- *-stock* ➔ Ver lista de precios y códigos de compra\n" +
        "- *-saldo* ➔ Consultar tu saldo disponible para compras\n" +
        "- *-web* ➔ Conocer la plataforma web interactiva\n" +
        "- *-registrar <Código>* ➔ Vincular tu usuario (Ej: `-registrar Abcd12`)\n" +
        "- *-comprar <alias>* ➔ Comprar servicio (Ej: `-comprar net`)\n" +
        "- *-miservicio* ➔ Consultar tus cuentas adquiridas\n" +
        "- *-pagos* ➔ Cuentas bancarias SPEI\n" +
        "- *-reglas* ➔ Términos de garantía y políticas\n" +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "Escribe *-stock* para ver todos los servicios disponibles.";

      await sendSafeMessage(menuGuide);
      return;
    }

    // COMANDO: -stock
    // COMANDO: -stock (Consulta stock y catálogo en vivo de Firestore)
    if (body.toLowerCase() === '-stock' || body.toLowerCase() === '-catalogo') {
      try {
        const invSnap = await db.collection('inventory').where('status', '==', 'disponible').get();
        const stockMap = {};
        invSnap.forEach(doc => {
          const d = doc.data();
          const al = (d.alias || d.serviceAlias || '').toLowerCase().trim();
          if (al) stockMap[al] = (stockMap[al] || 0) + 1;
        });

        const catalogItems = [
  {
    "name": "Apple TV+",
    "alias": "app",
    "price": 20
  },
  {
    "name": "Universal+",
    "alias": "uni",
    "price": 25
  },
  {
    "name": "ViX 1 Mes",
    "alias": "vx1",
    "price": 8
  },
  {
    "name": "Crunchyroll",
    "alias": "cru",
    "price": 20
  },
  {
    "name": "ViX Anual Completa",
    "alias": "vca",
    "price": 60
  },
  {
    "name": "Canva Edu 1 Mes",
    "alias": "ca1",
    "price": 18
  },
  {
    "name": "Spotify 6 Meses",
    "alias": "sp6",
    "price": 110
  },
  {
    "name": "ViX 3 Meses",
    "alias": "vx3",
    "price": 15
  },
  {
    "name": "Disney+ Hulu",
    "alias": "dhu",
    "price": 25
  },
  {
    "name": "YouTube Invitación",
    "alias": "yti",
    "price": 20
  },
  {
    "name": "Max / HBO",
    "alias": "max",
    "price": 15
  },
  {
    "name": "Netflix Perfil Privado",
    "alias": "nep",
    "price": 75
  },
  {
    "name": "Canva Edu Anual",
    "alias": "caa",
    "price": 25
  },
  {
    "name": "ViX 1 Mes Completa",
    "alias": "vxc",
    "price": 17
  },
  {
    "name": "Apple TV+ Completa",
    "alias": "apc",
    "price": 35
  },
  {
    "name": "Fox One",
    "alias": "fox",
    "price": 20
  },
  {
    "name": "Spotify 1 Mes (a tus datos)",
    "alias": "sp1",
    "price": 45
  },
  {
    "name": "Paramount+",
    "alias": "par",
    "price": 15
  },
  {
    "name": "Disney+ Estándar",
    "alias": "dis",
    "price": 15
  },
  {
    "name": "YouTube Familiar",
    "alias": "ytf",
    "price": 65
  },
  {
    "name": "Disney+ Hulu Completa",
    "alias": "dhc",
    "price": 70
  },
  {
    "name": "MUBI Completa",
    "alias": "muc",
    "price": 30
  },
  {
    "name": "Crunchyroll Completa",
    "alias": "crc",
    "price": 45
  },
  {
    "name": "ViX 5 Meses",
    "alias": "vx5",
    "price": 25
  },
  {
    "name": "Fox One Completa",
    "alias": "fxc",
    "price": 45
  },
  {
    "name": "Paramount+ Completa",
    "alias": "pac",
    "price": 45
  },
  {
    "name": "Prime Video",
    "alias": "prm",
    "price": 15
  },
  {
    "name": "Netflix Perfil",
    "alias": "net",
    "price": 50
  },
  {
    "name": "ViX 2 Meses",
    "alias": "vx2",
    "price": 15
  },
  {
    "name": "Prime Video Completa",
    "alias": "prc",
    "price": 40
  },
  {
    "name": "IPTV / IPTV Pro",
    "alias": "ipt",
    "price": 25
  },
  {
    "name": "ViX 12 Meses (Anual)",
    "alias": "vya",
    "price": 25
  },
  {
    "name": "Netflix Completa",
    "alias": "nec",
    "price": 200
  },
  {
    "name": "ChatGPT Go Compartido",
    "alias": "gpt",
    "price": 50
  },
  {
    "name": "Disney+ Estándar Completa",
    "alias": "dsc",
    "price": 50
  },
  {
    "name": "Duolingo 1 Mes",
    "alias": "du1",
    "price": 30
  },
  {
    "name": "Claro Video",
    "alias": "cla",
    "price": 45
  },
  {
    "name": "Duolingo 12 Meses",
    "alias": "dua",
    "price": 30
  },
  {
    "name": "YouTube Individual",
    "alias": "yt1",
    "price": 45
  },
  {
    "name": "MUBI",
    "alias": "mub",
    "price": 15
  },
  {
    "name": "Spotify 3 Meses",
    "alias": "sp3",
    "price": 80
  },
  {
    "name": "Apple Music 1 Mes",
    "alias": "amu",
    "price": 35
  },
  {
    "name": "Deezer 1 Mes",
    "alias": "dzr",
    "price": 35
  },
  {
    "name": "Amazon Music",
    "alias": "azm",
    "price": 20
  },
  {
    "name": "Universal+ Completa",
    "alias": "unc",
    "price": 42
  },
  {
    "name": "Max / HBO Completa",
    "alias": "mxc",
    "price": 45
  }
];

        let response = "🍒📋 *CATÁLOGO Y DISPONIBILIDAD EN TIEMPO REAL* 📋🍒\n\n";
        catalogItems.forEach(it => {
          const qty = stockMap[it.alias] || 0;
          const badge = qty > 0 ? ("🟢 Disponibles: " + qty) : "⚪ Sobre Pedido";
          response += "🍿 *" + it.name + "* ➔ `-comprar " + it.alias + "`\n" +
                      "💰 $" + it.price + " MXN | " + badge + "\n\n";
        });

        response += "━━━━━━━━━━━━━━━━━━━━\n" +
                    "👉 *¿Cómo comprar?* Escribe: `-comprar <alias>`\n" +
                    "💰 *Tu saldo:* Consulta con `-saldo`\n" +
                    "🌐 *Tienda Web:* Compra en línea con tu usuario";

        await sendSafeMessage(response);
      } catch (err) {
        console.error("Error al consultar stock dinámico:", err);
        await sendSafeMessage("⚠️ Error al consultar el stock en la base de datos.");
      }
      return;
    }

    // COMANDO: -saldo (Público general)
    if (body.toLowerCase() === '-saldo') {
      try {
        const qSnap = await db.collection('customers').where('phone', '==', senderPhone).limit(1).get();
        if (qSnap.empty) {
          await sendSafeMessage("⚠️ *No encontramos una cuenta vinculada a este número de WhatsApp.*\n\nPor favor regístrate primero usando:\n`-registrar <Código>` (Ej: `-registrar Abcd12`)");
          return;
        }

        const customerDoc = qSnap.docs[0];
        const customerData = customerDoc.data();
        const balance = customerData.balance || 0;

        const saldoMsg = "🍒💰 *TU SALDO EN CHERRY STREAM* 💰🍒\n\n" +
          `👤 *Usuario:* ${customerData.customerCode || customerDoc.id}\n` +
          `📱 *Teléfono:* ${senderPhone}\n` +
          `💵 *Saldo disponible:* *$${balance.toFixed(2)} MXN*\n\n` +
          "💡 *Tip:* Al usar *-comprar <alias>*, si tienes suficiente saldo se descuenta automáticamente y se activa tu cuenta.";

        await sendSafeMessage(saldoMsg);
      } catch (err) {
        console.error('Error al consultar saldo:', err);
        await sendSafeMessage('⚠️ Ocurrió un error al consultar tu saldo.');
      }
      return;
    }

    // COMANDO: -web
    if (body.toLowerCase() === '-web') {
      const webMsg = "🍒🌐 *TIENDA OFICIAL CHERRY STREAM MX* 🌐🍒\n\n" +
        "Explora todo nuestro catálogo digital interactivo desde cualquier dispositivo:\n\n" +
        "👉 *https://cherrystream.netlify.app*\n\n" +
        "✨ *¿Qué encuentras en la web?*\n" +
        "- Precios actualizados en tiempo real en MXN.\n" +
        "- Filtros por categorías: Perfiles, Cuentas Completas, Música y Más.\n" +
        "- Pedidos directos y catálogo visual optimizado.\n\n" +
        "¡Haz tu pedido en línea o usa *-comprar <alias>* aquí mismo! 🍿";

      await sendSafeMessage(webMsg);
      return;
    }

    // COMANDO: -pagos
    if (body.toLowerCase() === '-pagos') {
      const paymentMsg = "🍒💳 *MÉTODOS DE PAGO DISPONIBLES* 💳🍒\n\n" +
        "Aceptamos transferencias electrónicas (SPEI):\n\n" +
        "🏦 *Banco:* [Tu Banco / STP / BBVA]\n" +
        "👤 *Titular:* [Nombre de la cuenta]\n" +
        "🔢 *CLABE:* `646000000000000000`\n\n" +
        "⚠️ *Importante:* Al realizar tu pago, envía tu comprobante aquí junto con tu folio de orden para activar tu servicio o recargar tu saldo.";

      await sendSafeMessage(paymentMsg);
      return;
    }

    // COMANDO: -reglas
    if (body.toLowerCase() === '-reglas') {
      const rulesMsg = "🍒📜 *POLÍTICAS Y GARANTÍA CHERRY STREAM* 📜🍒\n\n" +
        "- 🚫 Prohibido cambiar correo o contraseña de las cuentas.\n" +
        "- 👤 En perfiles individuales, usar únicamente el perfil asignado.\n" +
        "- ⏳ Las garantías cubren el tiempo contratado.\n" +
        "- ⚡ Si respetas las reglas, tu servicio funcionará sin interrupciones.";

      await sendSafeMessage(rulesMsg);
      return;
    }

    // COMANDO: -registrar <Codigo>
    if (body.toLowerCase().startsWith('-registrar')) {
      const parts = body.split(' ');
      const code = parts[1]?.trim();
      const codeRegex = /^[A-Z][a-z]{3}\d{2}$/;

      if (!code || !codeRegex.test(code)) {
        await sendSafeMessage(
          "❌ *Formato incorrecto.*\n\nEl código de registro debe tener exactamente:\n- 1 Letra Mayúscula\n- 3 Letras Minúsculas\n- 2 Números\n\n📌 *Ejemplo válido:* `-registrar Abcd12`"
        );
        return;
      }

      try {
        await db.collection('customers').doc(code).set({
          customerCode: code,
          phone: senderPhone,
          balance: 0,
          registeredAt: FieldValue.serverTimestamp(),
          source: 'whatsapp_bot'
        }, { merge: true });

        await sendSafeMessage(
          `🍒 *¡REGISTRO EXITOSO!* 🍒\n\nTu cuenta ha quedado vinculada con el código: *${code}*.\nYa puedes consultar tu *-saldo* y comprar tus servicios.`
        );
      } catch (err) {
        console.error('Error registrando usuario:', err);
        await sendSafeMessage('⚠️ Ocurrió un error al registrar en la base de datos.');
      }
      return;
    }

    // COMANDO: -comprar <alias> (Con deducción automática de saldo)
    // COMANDO: -comprar <alias>
    if (body.toLowerCase().startsWith('-comprar')) {
      const parts = body.trim().split(/\s+/);
      const rawAlias = (parts[1] || '').toLowerCase().trim();

      let catalog = [];
      try {
        catalog = JSON.parse(fs.readFileSync('catalogData.json', 'utf8'));
      } catch (e) {
        catalog = [];
      }

      const item = catalog.find(c => c.alias.toLowerCase() === rawAlias);

      if (!item) {
        await sendSafeMessage('❌ *Alias no reconocido:* ' + rawAlias + '\n\nEscribe *-stock* para revisar los códigos disponibles.');
        return;
      }

      try {
        // 1. Obtener cliente y validar saldo
        const qSnap = await db.collection('customers').where('phone', '==', senderPhone).limit(1).get();
        if (qSnap.empty) {
          await sendSafeMessage('⚠️ *No encontramos una cuenta vinculada a este número de WhatsApp.*\nRegístrate con: `-registrar <Usuario>`');
          return;
        }

        const customerDoc = qSnap.docs[0];
        const customerRef = customerDoc.ref;
        const customerData = customerDoc.data();
        const customerName = customerData.customerCode || customerDoc.id;
        const currentBalance = customerData.balance || 0;

        if (currentBalance < item.price) {
          await sendSafeMessage('⚠️ *SALDO INSUFICIENTE*\n\n🍿 *Servicio:* ' + item.name + '\n💰 *Precio:* $' + item.price + ' MXN\n💵 *Tu saldo actual:* $' + currentBalance.toFixed(2) + ' MXN\n\nEscribe *-pagos* para recargar saldo.');
          return;
        }

        // 2. Extraer cuenta en stock
        const invSnap = await db.collection('inventory')
          .where('alias', '==', rawAlias)
          .where('status', '==', 'disponible')
          .limit(1)
          .get();

        if (invSnap.empty) {
          await sendSafeMessage('⚠️ *SIN STOCK INMEDIATO*\n\nEl servicio *' + item.name + '* está sobre pedido. No se descontó saldo.');
          return;
        }

        const accountDoc = invSnap.docs[0];
        const accountData = accountDoc.data();
        const newBalance = currentBalance - item.price;

        // 3. Descontar en Firestore de forma atómica
        const batch = db.batch();

        batch.update(customerRef, {
          balance: newBalance,
          updatedAt: FieldValue.serverTimestamp()
        });

        batch.update(accountDoc.ref, {
          status: 'entregado',
          assignedTo: senderPhone,
          assignedUser: customerName,
          deliveredAt: FieldValue.serverTimestamp()
        });

        const orderRef = db.collection('orders').doc();
        batch.set(orderRef, {
          customerUser: customerName,
          customerPhone: senderPhone,
          alias: rawAlias,
          serviceName: item.name,
          price: item.price,
          status: 'completado',
          source: 'whatsapp_bot',
          createdAt: FieldValue.serverTimestamp()
        });

        await batch.commit();

        // 4. Calcular stock disponible restante
        const remainingSnap = await db.collection('inventory')
          .where('alias', '==', rawAlias)
          .where('status', '==', 'disponible')
          .get();
        const stockRestante = remainingSnap.size;

        // 5. Preparar mensaje de entrega privada con credenciales
        let privateMsg = '🎉 *¡ENTREGA DE SERVICIO: ' + item.name.toUpperCase() + '!* 🎉\n';
        privateMsg += '━━━━━━━━━━━━━━━━━━━━\n';
        privateMsg += '👤 *Correo / Usuario:* ' + accountData.email + '\n';
        privateMsg += '🔑 *Contraseña:* ' + accountData.password + '\n';
        if (accountData.profile) privateMsg += '🏷️ *Perfil:* ' + accountData.profile + '\n';
        if (accountData.pin) privateMsg += '🔢 *PIN:* ' + accountData.pin + '\n';
        if (accountData.expiration) privateMsg += '⏳ *Vence:* ' + accountData.expiration + '\n';
        privateMsg += '━━━━━━━━━━━━━━━━━━━━\n';
        privateMsg += '📌 *Reglas:* No alterar datos ni perfiles para mantener garantía.\n\n';
        privateMsg += '🍒⚡ *¡COMPRA ENTREGADA CON ÉXITO!* ⚡🍒\n';
        privateMsg += '👤 *Cliente:* ' + customerName + '\n';
        privateMsg += '💵 *Monto cobrado:* -$' + item.price + ' MXN\n';
        privateMsg += '💰 *Tu saldo restante:* $' + newBalance.toFixed(2) + ' MXN\n';
        privateMsg += '📦 *Stock restante en bóveda:* ' + stockRestante + ' disponible(s)';

        const isGroup = from && from.endsWith('@g.us');

        if (isGroup) {
          // Enviar credenciales al privado del participante
          const targetJid = (msg.key.participant || senderPhone).replace(/@.*/, '') + '@s.whatsapp.net';
          try {
            await sock.sendMessage(targetJid, { text: privateMsg });
          } catch (ePriv) {
            console.error('Error enviando al privado:', ePriv.message);
          }

          // Enviar ficha pública al grupo
          const groupReceipt = '🍒⚡ *¡COMPRA DESPACHADA CON ÉXITO!* ⚡🍒\n' +
            '━━━━━━━━━━━━━━━━━━━━\n' +
            '🍿 *Servicio:* ' + item.name + ' (' + item.alias + ')\n' +
            '👤 *Cliente:* @' + senderPhone.replace(/[^0-9]/g, '') + '\n' +
            '💰 *Precio:* $' + item.price + ' MXN\n' +
            '📦 *Stock restante:* ' + (stockRestante > 0 ? ('🟢 ' + stockRestante + ' disponible(s)') : '⚪ Agotado / Sobre Pedido') + '\n' +
            '━━━━━━━━━━━━━━━━━━━━\n' +
            '🔒 *Tus accesos han sido enviados a tu chat privado por seguridad.*\n\n' +
            '👉 Compra el tuyo con `-comprar ' + item.alias + '` o revisa `-stock`.';

          await sock.sendMessage(from, {
            text: groupReceipt,
            mentions: [targetJid]
          });
        } else {
          // Chat directo/privado: responder directamente aquí
          await sendSafeMessage(privateMsg);
        }

      } catch (err) {
        console.error('Error al procesar compra:', err);
        await sendSafeMessage('⚠️ Ocurrió un error al despachar la compra.');
      }
      return;
    }

    if (body.toLowerCase() === '-miservicio') {
      try {
        const snapshot = await db.collection('inventory')
          .where('assignedTo', '==', senderPhone)
          .where('status', '==', 'ocupada')
          .get();

        if (snapshot.empty) {
          await sendSafeMessage('ℹ️ No tienes servicios activos asociados a tu número de WhatsApp actualmente.');
          return;
        }

        let msgServices = "🍒 *TUS SERVICIOS ACTIVOS EN CHERRY STREAM:* 🍒\n\n";
        snapshot.forEach(doc => {
          const d = doc.data();
          msgServices += `📺 *${ALIAS_MAP[d.alias] || d.alias}*\n` +
            `📧 Correo: ${d.email}\n` +
            `🔑 Contraseña: ${d.password}\n` +
            (d.profile ? `👤 Perfil: ${d.profile}\n` : '') +
            (d.pin ? `🔒 PIN: ${d.pin}\n` : '') +
            (d.expiration ? `⏳ Vence: ${d.expiration}\n` : '') +
            "────────────────────\n";
        });

        await sendSafeMessage(msgServices);
      } catch (err) {
        console.error('Error consultando miservicio:', err);
        await sendSafeMessage('⚠️ Ocurrió un error al consultar tus cuentas en Firestore.');
      }
      return;
    }

    // COMANDO: -usuarios (Solo Admin)
    if (body.toLowerCase() === '-usuarios') {
      if (!isAdmin) {
        await sendSafeMessage('⛔ Este comando es exclusivo para el operador de Cherry Stream.');
        return;
      }

      try {
        const snapshot = await db.collection('customers').orderBy('registeredAt', 'desc').limit(15).get();
        if (snapshot.empty) {
          await sendSafeMessage('📋 No hay usuarios registrados aún en Firestore.');
          return;
        }

        let userList = "🍒 *ÚLTIMOS USUARIOS REGISTRADOS:* 🍒\n\n";
        snapshot.forEach(doc => {
          const data = doc.data();
          const cleanPhone = (data.phone || '').replace(/\D/g, '').slice(-10);
          const currentBal = data.balance !== undefined ? `$${data.balance} MXN` : '$0 MXN';
          userList += `- *Código:* ${data.customerCode || doc.id} | *Tel:* ${cleanPhone} | *Saldo:* ${currentBal}\n`;
        });

        await sendSafeMessage(userList);
      } catch (err) {
        console.error('Error listando usuarios:', err);
        await sendSafeMessage('⚠️ Error al consultar Firestore.');
      }
      return;
    }

    // COMANDO: -acreditar <monto> [user|tel] (Solo Admin)
    
        // COMANDO OPERADOR: -addstock (Carga multiline)
    if (body.toLowerCase().startsWith('-addstock')) {
      if (!isAdmin) {
        await sendSafeMessage('⛔ Acceso restringido al operador.');
        return;
      }

      const rawLines = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const headerParts = rawLines[0].split(/\s+/);
      const alias = (headerParts[1] || '').toLowerCase().trim();

      if (!alias) {
        await sendSafeMessage('⚠️ Formato incorrecto.\nUsa:\n-addstock alias\ncorreo:pass:perfil:pin');
        return;
      }

      const accountLines = rawLines.slice(1);
      if (accountLines.length === 0) {
        await sendSafeMessage('⚠️ No incluiste ninguna cuenta. Escribe una por linea.');
        return;
      }

      let insertedCount = 0;
      const batch = db.batch();

      for (const line of accountLines) {
        const parts = line.split(':');
        const email = (parts[0] || '').trim();
        const password = (parts[1] || '').trim();
        const profile = (parts[2] || '').trim() || null;
        const pin = (parts[3] || '').trim() || null;
        const expiration = (parts[4] || '').trim() || null;

        if (email && password) {
          const docRef = db.collection('inventory').doc();
          batch.set(docRef, {
            alias: alias,
            email: email,
            password: password,
            profile: profile,
            pin: pin,
            expiration: expiration,
            status: 'disponible',
            createdAt: FieldValue.serverTimestamp(),
            assignedTo: null,
            assignedUser: null
          });
          insertedCount++;
        }
      }

      if (insertedCount === 0) {
        await sendSafeMessage('⚠️ No se detectaron cuentas validas.');
        return;
      }

      await batch.commit();

      const snap = await db.collection('inventory')
        .where('alias', '==', alias)
        .where('status', '==', 'disponible')
        .get();

      let serviceTitle = alias.toUpperCase();
      try {
        const cat = JSON.parse(fs.readFileSync('catalogData.json', 'utf8'));
        const found = cat.find(c => c.alias === alias);
        if (found) serviceTitle = found.name + ' (' + alias + ')';
      } catch(e) {}

      const reply = '📦 *BÓVEDA ACTUALIZADA | CHERRY STREAM* 📦\n' +
        '━━━━━━━━━━━━━━━━━━━━\n' +
        '✅ *Servicio:* ' + serviceTitle + '\n' +
        '📥 *Cuentas ingresadas:* ' + insertedCount + '\n' +
        '📊 *Stock total en bóveda:* ' + snap.size + ' disponible(s)\n\n' +
        '⚡ Listas para despacho con -comprar ' + alias + ' o compra web.';

      await sendSafeMessage(reply);
      return;
    }

    if (body.toLowerCase().startsWith('-acreditar')) {
      if (!isAdmin) {
        await sendSafeMessage('⛔ Comando exclusivo del operador.');
        return;
      }

      const parts = body.split(' ').filter(p => p.trim() !== '');
      const amountStr = parts[1];
      const amount = parseFloat(amountStr);

      if (isNaN(amount) || amount <= 0) {
        await sendSafeMessage("❌ *Monto no válido.*\n\n*Formas de uso:*\n1. Respondiendo al mensaje del cliente: `-acreditar 100`\n2. Con código de usuario: `-acreditar 100 Eduu15`\n3. Con número a 10 dígitos: `-acreditar 100 5517667021`");
        return;
      }

      const contextInfo = msg.message.extendedTextMessage?.contextInfo;
      let targetPhone = '';
      let targetUserCode = '';
      let targetDocRef = null;

      if (contextInfo?.participant || contextInfo?.remoteJid) {
        const quotedRaw = contextInfo.participant || contextInfo.remoteJid;
        if (quotedRaw.includes('98630283317462')) {
          targetPhone = '5517667021';
        } else {
          targetPhone = cleanTo10Digits(quotedRaw.split('@')[0]);
        }
      } else if (parts[2]) {
        const param = parts[2].trim();
        const codeRegex = /^[A-Z][a-z]{3}\d{2}$/;
        if (codeRegex.test(param)) {
          targetUserCode = param;
        } else {
          targetPhone = cleanTo10Digits(param);
        }
      } else {
        await sendSafeMessage("⚠️ *No especificaste usuario ni respondiste a un mensaje.*\n\nEjemplos:\n- Cita un mensaje y escribe: `-acreditar 100`\n- Escribe directo: `-acreditar 100 Eduu15`");
        return;
      }

      try {
        if (targetUserCode) {
          const doc = await db.collection('customers').doc(targetUserCode).get();
          if (doc.exists) {
            targetDocRef = doc.ref;
            targetPhone = doc.data().phone || '';
          }
        } else if (targetPhone) {
          const qSnap = await db.collection('customers').where('phone', '==', targetPhone).limit(1).get();
          if (!qSnap.empty) {
            targetDocRef = qSnap.docs[0].ref;
            targetUserCode = qSnap.docs[0].id;
          }
        }

        if (!targetDocRef) {
          await sendSafeMessage(`⚠️ No se encontró ningún cliente registrado con el identificador proporcionado (${targetUserCode || targetPhone}). Pídele que use *-registrar*.`);
          return;
        }

        let newBalance = 0;
        await db.runTransaction(async (transaction) => {
          const freshDoc = await transaction.get(targetDocRef);
          const current = freshDoc.data().balance || 0;
          newBalance = current + amount;
          transaction.update(targetDocRef, {
            balance: newBalance,
            lastTopUp: FieldValue.serverTimestamp()
          });
        });

        await db.collection('topups').add({
          customerCode: targetUserCode,
          phone: targetPhone,
          amount: amount,
          finalBalance: newBalance,
          date: FieldValue.serverTimestamp(),
          admin: senderPhone
        });

        await sendSafeMessage(`✅ *RECARGA ACREDITADA CON ÉXITO*\n\n👤 *Usuario:* ${targetUserCode}\n📱 *Teléfono:* ${targetPhone}\n💵 *Monto sumado:* +$${amount.toFixed(2)} MXN\n💰 *Nuevo saldo total:* $${newBalance.toFixed(2)} MXN`);

        if (targetPhone) {
          const clientJid = (targetPhone.startsWith('52') ? targetPhone : `521${targetPhone}`) + '@s.whatsapp.net';
          const notificationClient = `🍒💳 *¡SALDO ACREDITADO!* 💳🍒\n\n` +
            `Se han recargado *$${amount.toFixed(2)} MXN* a tu cuenta de Cherry Stream.\n` +
            `💰 *Tu saldo disponible actual es:* *$${newBalance.toFixed(2)} MXN*\n\n` +
            `¡Gracias por tu compra! Ya puedes usar tu saldo con *-comprar <alias>*. 🍿`;

          await sendSafeMessage(notificationClient, clientJid);
        }

      } catch (err) {
        console.error('Error al acreditar saldo:', err);
        await sendSafeMessage('⚠️ Ocurrió un error al registrar el saldo en Firestore.');
      }
      return;
    }

    // COMANDO: -entregar <alias> <user o telefono> (Solo Admin)
    
    // ==========================================
    // COMANDO -DELSTOCK (ELIMINAR CUENTA DE BÓVEDA)
    // ==========================================
    if (body.toLowerCase().startsWith('-delstock')) {
      if (!isAdmin) {
        await sendSafeMessage('⛔ Comando exclusivo del operador.');
        return;
      }

      const parts = body.trim().split(/\s+/);
      const alias = (parts[1] || '').toLowerCase().trim();

      if (!alias) {
        await sendSafeMessage(
          "⚠️ *FORMATO INCORRECTO*\n\n" +
          "Usa:\n" +
          "`-delstock <alias>`\n\n" +
          "💡 *Ejemplo para vaciar stock de un servicio:*\n" +
          "`-delstock net`\n" +
          "`-delstock prm`"
        );
        return;
      }

      try {
        let catalog = [];
        try {
          catalog = JSON.parse(fs.readFileSync('catalogData.json', 'utf8'));
        } catch (e) {
          catalog = [];
        }
        const srv = catalog.find(c => c.alias.toLowerCase() === alias);
        const serviceTitle = srv ? srv.name : alias.toUpperCase();

        const qSnap = await db.collection('inventory')
          .where('alias', '==', alias)
          .where('status', '==', 'disponible')
          .get();

        if (qSnap.empty) {
          await sendSafeMessage(`ℹ️ No hay cuentas disponibles en stock para *${serviceTitle}* (${alias}).`);
          return;
        }

        const count = qSnap.size;
        const batch = db.batch();
        qSnap.forEach(doc => {
          batch.delete(doc.ref);
        });

        await batch.commit();

        await sendSafeMessage(
          `🗑️ *VACIADO DE BÓVEDA COMPLETADO* 🗑️\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🍿 *Servicio:* ${serviceTitle} (${alias})\n` +
          `📦 *Cuentas eliminadas:* ${count}\n` +
          `📊 *Stock actual disponible:* ⚪ Agotado (0)\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⚡ _El inventario en la tienda web se ha actualizado a cero._`
        );
      } catch (err) {
        console.error("Error en -delstock masivo:", err);
        await sendSafeMessage("⚠️ Error al purgar el inventario: " + err.message);
      }
      return;
    }

    // ==========================================
    // COMANDO -CORTE (RESUMEN DIARIO DE CAJA)
    // ==========================================
    // ==========================================
    // COMANDO -REPORTAR (TICKET CON EVIDENCIA A ENCARGADAS)
    // ==========================================
    // ==========================================
    // COMANDOS -PAGO / -PAGOS
    // ==========================================
    if (body.toLowerCase() === '-pago' || body.toLowerCase() === '-pagos') {
      const pText = "🎃🩸 *MÉTODOS DE PAGO – CHERRY STREAMING MX* 🩸🎃🍒\n\n💳 *MÉTODO DE PAGO 1*\n\n💳 *Tarjeta / Cuenta:*\n728969000137647238\n\n🏛️ *Transferencia SPEI*\n👤 *Titular:* Iolany Navarro\n\n👀 *CONCEPTO OBLIGATORIO:* COMIDA 🍽️\n\n🚨 *REGLAS CRÍTICAS DE PAGO* 🚨\n✅ El concepto debe decir únicamente *\"COMIDA\"*.\n❌ No colocar nada relacionado con streaming.\n❌ No escribir Netflix, Disney, perfil, cuenta ni nombres de plataformas.\n⚠️ *Si el concepto contiene algo diferente a \"COMIDA\", el pago no será validado.*\n\n📸 *COMPROBANTE DE PAGO* 🧾\nEnvía tu comprobante con foto al bot o al grupo para validar tu recarga de saldo o entrega.\n\n🍒🩸 *CHERRY STREAMING MX* 🩸🍒\n🎃 _¡Gracias por tu preferencia!_";
      await sendSafeMessage(pText);
      return;
    }

    // ==========================================
    if (body.toLowerCase().startsWith('-reportar')) {
      const parts = body.trim().split(/\s+/);
      const alias = (parts[1] || '').toLowerCase().trim();
      const customerNote = parts.slice(2).join(' ') || 'Sin observaciones adicionales';

      if (!alias) {
        await sendSafeMessage(
          "🛡️ *SISTEMA DE SOPORTE Y GARANTÍAS* 🛡️\n\n" +
          "Para reportar una falla, envía un mensaje o foto con:\n" +
          "`-reportar <alias> [motivo de la falla]`\n\n" +
          "💡 *Ejemplo:*\n" +
          "`-reportar prm contraseña incorrecta`\n\n" +
          "📸 _Si envías foto, pon ese texto en el pie de foto como evidencia._"
        );
        return;
      }

      try {
        const cleanSenderPhone = cleanTo10Digits(senderPhone);

        // 1. Buscar cuentas entregadas al cliente bajo ese alias (filtro en memoria sin requerir índice compuesto)
        const userOrdersSnap = await db.collection('inventory')
          .where('alias', '==', alias)
          .where('assignedTo', '==', cleanSenderPhone)
          .get();

        let oldAccount = null;
        let deliveredDate = null;
        let diffDays = 0;
        let tieneGarantia = false;
        let statusGarantia = "⚠️ Sin registro de compra previa con este número";

        if (!userOrdersSnap.empty) {
          const docs = [];
          userOrdersSnap.forEach(d => docs.push(d.data()));
          // Ordenar por fecha de entrega más reciente
          docs.sort((a, b) => {
            const timeA = a.deliveredAt?.toDate ? a.deliveredAt.toDate().getTime() : 0;
            const timeB = b.deliveredAt?.toDate ? b.deliveredAt.toDate().getTime() : 0;
            return timeB - timeA;
          });

          oldAccount = docs[0];
          if (oldAccount.deliveredAt && oldAccount.deliveredAt.toDate) {
            deliveredDate = oldAccount.deliveredAt.toDate();
            diffDays = Math.floor((new Date() - deliveredDate) / (1000 * 60 * 60 * 24));
            if (diffDays <= 30) {
              tieneGarantia = true;
              statusGarantia = "🟢 APLICA GARANTÍA (" + (30 - diffDays) + " días restantes)";
            } else {
              tieneGarantia = false;
              statusGarantia = "🔴 FUERA DE GARANTÍA (" + diffDays + " días transcurridos)";
            }
          } else {
            tieneGarantia = true;
            statusGarantia = "🟢 GARANTÍA ACTIVA";
          }
        }

        const ticketId = 'TCK-' + Date.now().toString().slice(-6);
        const reportTime = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

        // 2. Extraer buffer de imagen si viene adjunta
        let mediaBuffer = null;
        let isImage = false;
        if (msg.message?.imageMessage) {
          isImage = true;
          try {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            mediaBuffer = await downloadMediaMessage(msg, 'buffer', {});
          } catch (eMedia) {
            console.warn("Aviso procesando imagen:", eMedia.message);
          }
        }

        // 3. Registrar ticket en Firestore
        await db.collection('support_tickets').doc(ticketId).set({
          ticketId: ticketId,
          customerPhone: cleanSenderPhone,
          alias: alias,
          serviceName: alias.toUpperCase(),
          deliveredAccount: oldAccount ? (oldAccount.email || 'N/A') : 'No localizada',
          diffDays: diffDays,
          hasWarranty: tieneGarantia,
          customerNote: customerNote,
          status: 'pendiente_revision',
          hasEvidenceImage: !!mediaBuffer,
          createdAt: FieldValue.serverTimestamp()
        });

        // 4. Preparar alerta para ambas encargadas
        const staffPhones = ['5215566132733@s.whatsapp.net', '5212223255157@s.whatsapp.net'];

        let alertStaff = "🚨 *NUEVO REPORTE DE FALLA | " + ticketId + "* 🚨\n";
        alertStaff += "━━━━━━━━━━━━━━━━━━━━\n";
        alertStaff += "👤 *Cliente:* +" + cleanSenderPhone + "\n";
        alertStaff += "🍿 *Servicio:* " + alias.toUpperCase() + "\n";
        alertStaff += "🛡️ *Estado de Garantía:* " + statusGarantia + "\n";
        alertStaff += "📅 *Fecha:* " + reportTime + "\n";
        alertStaff += "━━━━━━━━━━━━━━━━━━━━\n";
        if (oldAccount) {
          alertStaff += "📧 *Cuenta entregada:* " + (oldAccount.email || 'N/A') + "\n";
          alertStaff += "🔑 *Clave:* " + (oldAccount.password || 'N/A') + "\n";
          if (oldAccount.profile) alertStaff += "🏷️ *Perfil:* " + oldAccount.profile + "\n";
          if (oldAccount.pin) alertStaff += "🔢 *PIN:* " + oldAccount.pin + "\n";
        }
        alertStaff += "📝 *Motivo reportado:* " + customerNote + "\n";
        alertStaff += "📸 *Evidencia adjunta:* " + (mediaBuffer ? "Sí (ver foto adjunta)" : "No enviada") + "\n";
        alertStaff += "━━━━━━━━━━━━━━━━━━━━\n";
        alertStaff += "⚡ _Para reponer escribe: -entregar " + alias + " " + cleanSenderPhone + "_";

        for (const staffJid of staffPhones) {
          try {
            if (mediaBuffer) {
              await sock.sendMessage(staffJid, { image: mediaBuffer, caption: alertStaff });
            } else {
              await sock.sendMessage(staffJid, { text: alertStaff });
            }
          } catch (staffErr) {
            console.error("Error enviando alerta a encargada:", staffErr.message);
          }
        }

        // 5. Confirmación para el cliente
        let clientReply = "✅ *REPORTE REGISTRADO CON ÉXITO* ✅\n";
        clientReply += "━━━━━━━━━━━━━━━━━━━━\n";
        clientReply += "🎫 *Número de Ticket:* " + ticketId + "\n";
        clientReply += "🍿 *Servicio:* " + alias.toUpperCase() + "\n";
        clientReply += "🛡️ *Garantía:* " + statusGarantia + "\n";
        clientReply += "📸 *Evidencia:* " + (mediaBuffer ? "Recibida correctamente" : "Sin imagen") + "\n";
        clientReply += "━━━━━━━━━━━━━━━━━━━━\n";
        clientReply += "👩‍💼 Las encargadas de soporte han recibido tu caso y te darán seguimiento a la brevedad.";

        await sendSafeMessage(clientReply);
        console.log("✅ [TICKET GENERADO] " + ticketId + " enviado a encargadas.");

      } catch (err) {
        console.error("Error en -reportar:", err);
        await sendSafeMessage("⚠️ Error al registrar reporte: " + err.message);
      }
      return;
    }

    if (body.toLowerCase() === '-corte') {
      if (!isAdmin) {
        await sendSafeMessage('⛔ Comando exclusivo del operador.');
        return;
      }

      try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // Consultar órdenes de hoy
        const ordersSnap = await db.collection('orders')
          .where('createdAt', '>=', startOfDay)
          .get();

        let totalRecaudado = 0;
        const ventasPorServicio = {};

        ordersSnap.forEach(d => {
          const o = d.data();
          const p = Number(o.price || 0);
          totalRecaudado += p;
          const sName = o.serviceName || o.alias || 'Otros';
          ventasPorServicio[sName] = (ventasPorServicio[sName] || 0) + 1;
        });

        // Revisar stock crítico
        let catalog = [];
        try {
          catalog = JSON.parse(fs.readFileSync('catalogData.json', 'utf8'));
        } catch(e) {}

        let stockCriticoMsg = "";
        for (const item of catalog) {
          const invSnap = await db.collection('inventory')
            .where('alias', '==', item.alias.toLowerCase())
            .where('status', '==', 'disponible')
            .get();
          if (invSnap.size <= 1) {
            stockCriticoMsg += `   • ${item.name} (${item.alias}): ${invSnap.size === 0 ? '⚪ Agotado' : '🟠 Solo 1'}\n`;
          }
        }

        let desglose = "";
        for (const [srv, qty] of Object.entries(ventasPorServicio)) {
          desglose += `   • ${srv}: ${qty} venta(s)\n`;
        }
        if (!desglose) desglose = "   _Sin ventas registradas hoy todavía._\n";

        const todayStr = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium' });

        const corteMsg = 
          `📊 *CORTE DE CAJA DIARIO | CHERRY STREAM* 📊\n` +
          `📅 *Fecha:* ${todayStr}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💵 *Total recaudado:* $${totalRecaudado.toFixed(2)} MXN\n` +
          `📦 *Cuentas vendidas hoy:* ${ordersSnap.size}\n\n` +
          `🛒 *Desglose de entregas:*\n${desglose}\n` +
          `⚠️ *Alertas de Stock Bajo / Agotado:*\n` +
          (stockCriticoMsg || "   ✅ Todo el catálogo cuenta con stock suficiente.\n") +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⚡ _Reporte generado automáticamente._`;

        await sendSafeMessage(corteMsg);

      } catch (err) {
        console.error("Error en -corte:", err);
        await sendSafeMessage("⚠️ Error al generar corte de caja: " + err.message);
      }
      return;
    }


    if (body.toLowerCase().startsWith('-entregar')) {
      if (!isAdmin) {
        await sendSafeMessage('⛔ Comando exclusivo del operador.');
        return;
      }

      const parts = body.split(' ');
      const alias = parts[1]?.toLowerCase().trim();
      const target = parts[2]?.trim();

      if (!alias || !target || !ALIAS_MAP[alias]) {
        await sendSafeMessage("❌ *Uso correcto:*\n`-entregar <alias> <user>`\n\nEjemplo: `-entregar net Abcd12` o con teléfono `-entregar net 5512345678`");
        return;
      }

      try {
        let targetPhone = '';
        const codeRegex = /^[A-Z][a-z]{3}\d{2}$/;

        if (codeRegex.test(target)) {
          const userDoc = await db.collection('customers').doc(target).get();
          if (!userDoc.exists) {
            await sendSafeMessage(`⚠️ No se encontró al usuario con código *${target}* en Firestore.`);
            return;
          }
          targetPhone = userDoc.data().phone;
        } else {
          targetPhone = target.replace(/[^0-9]/g, '').slice(-10);
        }

        if (!targetPhone) {
          await sendSafeMessage('⚠️ No se pudo determinar el número telefónico de destino.');
          return;
        }

        const targetJid = (targetPhone.startsWith('52') ? targetPhone : `521${targetPhone}`) + '@s.whatsapp.net';

        const querySnapshot = await db.collection('inventory')
          .where('alias', '==', alias)
          .where('status', '==', 'disponible')
          .limit(1)
          .get();

        if (querySnapshot.empty) {
          await sendSafeMessage(`⚠️ No hay cuentas disponibles en stock para el alias *"${alias}"*.`);
          return;
        }

        const accountDoc = querySnapshot.docs[0];
        const accountData = accountDoc.data();

        await accountDoc.ref.update({
          status: 'ocupada',
          assignedTo: targetPhone,
          assignedUser: target,
          deliveredAt: FieldValue.serverTimestamp()
        });

        const deliveryMsg = "🍒✨ *¡ENTREGA DE SERVICIO CHERRY STREAM!* ✨🍒\n\n" +
          `Tu cuenta para *${ALIAS_MAP[alias]}* ya está activa:\n\n` +
          `📧 *Correo:* ${accountData.email || 'N/A'}\n` +
          `🔑 *Contraseña:* ${accountData.password || 'N/A'}\n` +
          (accountData.profile ? `👤 *Perfil:* ${accountData.profile}\n` : '') +
          (accountData.pin ? `🔒 *PIN:* ${accountData.pin}\n` : '') +
          (accountData.expiration ? `⏳ *Vence:* ${accountData.expiration}\n` : '') +
          "\n📌 *Reglas:* No cambies contraseñas ni perfiles para mantener la garantía activa.\n\n" +
          "¡Gracias por tu preferencia! 🍿";

        await sendSafeMessage(deliveryMsg, targetJid);
        await sendSafeMessage(`✅ *Cuenta ${alias.toUpperCase()} entregada con éxito a ${target} (📱${targetPhone})*\nCorreo: ${accountData.email}`);

      } catch (err) {
        console.error('Error al entregar servicio:', err);
        await sendSafeMessage('⚠️ Ocurrió un error al despachar la cuenta desde Firestore.');
      }
      return;
    }
  });
}

// Iniciar proceso
startBot();



// ==========================================
// DESPACHADOR EN TIEMPO REAL: TIENDA WEB
// ==========================================
let globalSockInstance = null;

// REGISTRO DE SOCKET ACTIVO PARA TIENDA WEB
function registerActiveSocket(s) {
  globalSockInstance = s;
}

db.collection('web_dispatches')
  .where('status', '==', 'pendiente_envio_bot')
  .onSnapshot(async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added') {
        const orderDoc = change.doc;
        const order = orderDoc.data();
        const rawAlias = (order.alias || 'prm').toLowerCase().trim();
        const userCode = order.customerCode || order.customerName || 'Cliente';
        let targetPhone = String(order.customerPhone || '').replace(/\D/g, '').slice(-10);

        console.log("⚡ [ORDEN WEB RECIBIDA] Usuario:", userCode, "| Alias:", rawAlias, "| Tel:", targetPhone);

        try {
          // Si no vino teléfono en la orden, consultarlo directo en la colección customers por su código
          if (!targetPhone && userCode) {
            const uSnap = await db.collection('customers').doc(userCode).get();
            if (uSnap.exists) {
              targetPhone = String(uSnap.data().phone || '').replace(/\D/g, '').slice(-10);
            }
          }

          // 1. Tomar cuenta de la bóveda
          const invSnap = await db.collection('inventory')
            .where('alias', '==', rawAlias)
            .where('status', '==', 'disponible')
            .limit(1)
            .get();

          if (invSnap.empty) {
            console.warn("⚠️ [WEB] Sin stock disponible en bóveda para:", rawAlias);
            await orderDoc.ref.update({ status: 'error_sin_stock' });
            continue;
          }

          const accountDoc = invSnap.docs[0];
          const accountData = accountDoc.data();

          const batch = db.batch();

          batch.update(accountDoc.ref, {
            status: 'entregado',
            assignedTo: targetPhone,
            assignedUser: userCode,
            source: 'web_store_session',
            deliveredAt: FieldValue.serverTimestamp()
          });

          batch.update(orderDoc.ref, {
            status: 'completado',
            deliveredAt: FieldValue.serverTimestamp()
          });

          // Descontar saldo del cliente en Firestore
          let remainingBalText = "";
          const custRef = db.collection('customers').doc(userCode);
          const custDoc = await custRef.get();
          if (custDoc.exists) {
            const currentBal = Number(custDoc.data().balance || 0);
            const newBal = Math.max(0, currentBal - Number(order.price || 0));
            batch.update(custRef, {
              balance: newBal,
              updatedAt: FieldValue.serverTimestamp()
            });
            remainingBalText = "\n💰 *Tu saldo restante:* $" + newBal.toFixed(2) + " MXN";
          }

          await batch.commit();

          // 2. Enviar credenciales a WhatsApp
          if (globalSockInstance && targetPhone) {
            let targetJid = targetPhone + '@s.whatsapp.net';
            try {
              const [res] = await globalSockInstance.onWhatsApp('521' + targetPhone + '@s.whatsapp.net');
              if (res && res.exists) {
                targetJid = res.jid;
              } else {
                const [res2] = await globalSockInstance.onWhatsApp('52' + targetPhone + '@s.whatsapp.net');
                if (res2 && res2.exists) targetJid = res2.jid;
              }
            } catch (errCheck) {
              targetJid = '521' + targetPhone + '@s.whatsapp.net';
            }

            let privateMsg = '🎉 *¡ENTREGA DE COMPRA EN LÍNEA!* 🎉\n';
            privateMsg += '🍿 *Servicio:* ' + order.productName.toUpperCase() + '\n';
            privateMsg += '━━━━━━━━━━━━━━━━━━━━\n';
            privateMsg += '👤 *Correo / Usuario:* ' + accountData.email + '\n';
            privateMsg += '🔑 *Contraseña:* ' + accountData.password + '\n';
            if (accountData.profile) privateMsg += '🏷️ *Perfil:* ' + accountData.profile + '\n';
            if (accountData.pin) privateMsg += '🔢 *PIN:* ' + accountData.pin + '\n';
            if (accountData.expiration) privateMsg += '⏳ *Vence:* ' + accountData.expiration + '\n';
            privateMsg += '━━━━━━━━━━━━━━━━━━━━\n';
            privateMsg += '📌 *Reglas:* No modificar contraseñas ni perfiles ajenos.\n\n';
            privateMsg += '🍒⚡ *¡GRACIAS POR TU COMPRA!* ⚡🍒\n';
            privateMsg += '👤 *Usuario:* ' + userCode + remainingBalText;

            await globalSockInstance.sendMessage(targetJid, { text: privateMsg });
            console.log("✅ [ENTREGA WEB EXITOSA] Credenciales enviadas por WhatsApp a:", targetJid);
          }

        } catch (err) {
          console.error("Error en despacho de orden web:", err);
        }
      }
    }
  }, (err) => console.error("Error listener web:", err.message));



// ==========================================
// CRON: RECORDATORIOS AUTOMÁTICOS DE RENOVACIÓN
// ==========================================
async function checkUpcomingExpirations() {
  if (typeof sock === 'undefined' || !sock) return;

  console.log("🔍 [CRON RENOVACIONES] Verificando cuentas próximas a vencer...");
  try {
    const activeAccountsSnap = await db.collection('inventory')
      .where('status', '==', 'entregado')
      .get();

    if (activeAccountsSnap.empty) {
      console.log("ℹ️ [CRON] No hay cuentas entregadas para auditar.");
      return;
    }

    const now = new Date();

    for (const doc of activeAccountsSnap.docs) {
      const acc = doc.data();
      if (acc.renewalNotified) continue; // Ya se le avisó para este ciclo
      if (!acc.assignedTo || !acc.deliveredAt) continue;

      const deliveredDate = acc.deliveredAt.toDate ? acc.deliveredAt.toDate() : null;
      if (!deliveredDate) continue;

      const diffDays = Math.floor((now - deliveredDate) / (1000 * 60 * 60 * 24));
      const remainingDays = 30 - diffDays;

      // Disparar aviso cuando falten entre 2 y 3 días para expirar
      if (remainingDays >= 2 && remainingDays <= 3) {
        const clientPhone = String(acc.assignedTo).replace(/\D/g, '').slice(-10);
        const rawAlias = (acc.alias || 'servicio').toLowerCase().trim();

        // Resolver JID canónico
        let targetJid = clientPhone + '@s.whatsapp.net';
        try {
          const [res] = await sock.onWhatsApp('521' + clientPhone + '@s.whatsapp.net');
          if (res && res.exists) targetJid = res.jid;
          else {
            const [res2] = await sock.onWhatsApp('52' + clientPhone + '@s.whatsapp.net');
            if (res2 && res2.exists) targetJid = res2.jid;
          }
        } catch (eJid) {
          targetJid = '521' + clientPhone + '@s.whatsapp.net';
        }

        // Consultar saldo del cliente
        let userBalanceText = "$0.00 MXN";
        try {
          const userSnap = await db.collection('customers')
            .where('phone', '==', clientPhone)
            .limit(1)
            .get();
          if (!userSnap.empty) {
            const bal = Number(userSnap.docs[0].data().balance || 0);
            userBalanceText = "$" + bal.toFixed(2) + " MXN";
          }
        } catch (eBal) {}

        let reminderMsg = "⏳ *RECORDATORIO DE RENOVACIÓN | CHERRY STREAM* ⏳\n";
        reminderMsg += "━━━━━━━━━━━━━━━━━━━━\n";
        reminderMsg += "Hola! Tu suscripción de *" + rawAlias.toUpperCase() + "* está próxima a vencer:\n\n";
        reminderMsg += "📌 *Servicio:* " + rawAlias.toUpperCase() + "\n";
        reminderMsg += "👤 *Cuenta vinculada:* " + (acc.email || 'N/A') + "\n";
        reminderMsg += "⚠️ *Tiempo restante:* " + remainingDays + " días de vigencia\n";
        reminderMsg += "━━━━━━━━━━━━━━━━━━━━\n";
        reminderMsg += "💰 *Tu saldo disponible:* " + userBalanceText + "\n\n";
        reminderMsg += "✨ *¿Deseas renovar sin interrupciones?*\n";
        reminderMsg += "Escribe directamente:\n";
        reminderMsg += "`-comprar " + rawAlias + "`\n\n";
        reminderMsg += "O recarga saldo enviando: `-pagos`";

        await sock.sendMessage(targetJid, { text: reminderMsg });
        await doc.ref.update({ renewalNotified: true, renewalNotifiedAt: FieldValue.serverTimestamp() });

        console.log(`🔔 [AVISO RENOVACIÓN ENVIADO] ${rawAlias} a ${clientPhone} (Restan ${remainingDays} días)`);
      }
    }
  } catch (err) {
    console.error("Error en tarea programada de renovaciones:", err.message);
  }
}

// Iniciar revisión cada 24 horas y a los 30s del arranque
setInterval(checkUpcomingExpirations, 24 * 60 * 60 * 1000);
setTimeout(checkUpcomingExpirations, 30 * 1000);
