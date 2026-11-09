(function() {
  const oldModal = document.getElementById("modalRecargaCherry");
  if (oldModal) oldModal.remove();

  // Modal interactivo
  const modalHTML = `
  <div id="modalRecargaCherry" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 999999; backdrop-filter: blur(6px); align-items: center; justify-content: center; font-family: system-ui, -apple-system, sans-serif;">
    <div style="background: #181924; border: 1px solid #2d3047; border-radius: 16px; width: 92%; max-width: 440px; padding: 24px; color: #fff; box-shadow: 0 15px 35px rgba(0,0,0,0.6); position: relative;">
      <button id="btnCerrarModalCherry" style="position: absolute; top: 14px; right: 16px; background: none; border: none; color: #888; font-size: 1.6rem; cursor: pointer; line-height: 1;">&times;</button>
      
      <h3 style="margin: 0 0 6px 0; font-size: 1.25rem; display: flex; align-items: center; gap: 8px;">
        <span>⚡</span> Recargar Saldo con IA
      </h3>
      <p style="margin: 0 0 16px 0; font-size: 0.85rem; color: #aaa;">
        Ingresa los datos de tu comprobante. Gemini validará que coincidan con la captura antes de acreditar.
      </p>

      <div style="display: flex; gap: 10px; margin-bottom: 12px;">
        <div style="flex: 1;">
          <label style="display: block; font-size: 0.75rem; color: #aaa; margin-bottom: 4px; font-weight: 600;">Monto ($ MXN) *</label>
          <input type="number" step="0.5" id="inpCherryMonto" placeholder="Ej: 250.00" style="width: 100%; box-sizing: border-box; background: #0f1017; border: 1px solid #2d3047; border-radius: 8px; padding: 9px 12px; color: #fff; font-size: 0.9rem; outline: none;">
        </div>
        <div style="flex: 1.3;">
          <label style="display: block; font-size: 0.75rem; color: #aaa; margin-bottom: 4px; font-weight: 600;">Folio / Rastreo *</label>
          <input type="text" id="inpCherryFolio" placeholder="Folio o referencia" style="width: 100%; box-sizing: border-box; background: #0f1017; border: 1px solid #2d3047; border-radius: 8px; padding: 9px 12px; color: #fff; font-size: 0.9rem; outline: none;">
        </div>
      </div>

      <div id="dropzoneCherry" style="border: 2px dashed #444a70; border-radius: 12px; padding: 18px 14px; text-align: center; cursor: pointer; background: #0f1017;">
        <div id="prevCherryCont" style="display: none; margin-bottom: 8px;">
          <img id="imgCherryPreview" src="" alt="Comprobante" style="max-height: 130px; max-width: 100%; border-radius: 8px; object-fit: contain;">
        </div>
        <div id="phCherryUpload">
          <span style="font-size: 1.8rem;">📥</span>
          <p style="margin: 6px 0 0 0; font-size: 0.85rem; color: #ddd; font-weight: 500;">Haz clic o arrastra tu comprobante aquí</p>
          <span style="font-size: 0.7rem; color: #777;">Formatos: JPG, PNG, WebP</span>
        </div>
      </div>
      <input type="file" id="inputCherryVoucher" accept="image/*" style="display: none;">

      <div id="statusCherry" style="margin-top: 12px; font-size: 0.85rem; text-align: center; min-height: 20px;"></div>

      <button id="btnCherryEnviar" disabled style="width: 100%; margin-top: 12px; background: #00e676; color: #0b2e13; font-weight: 700; border: none; padding: 12px; border-radius: 8px; cursor: not-allowed; opacity: 0.5; font-size: 0.95rem;">
        Validar y Acreditar Saldo
      </button>
    </div>
  </div>`;
  
  document.body.insertAdjacentHTML("beforeend", modalHTML);

  let cherryBase64 = null;
  let cherryMime = "image/jpeg";

  const modal = document.getElementById("modalRecargaCherry");
  const btnCerrar = document.getElementById("btnCerrarModalCherry");
  const dropzone = document.getElementById("dropzoneCherry");
  const fileInput = document.getElementById("inputCherryVoucher");
  const imgPreview = document.getElementById("imgCherryPreview");
  const prevCont = document.getElementById("prevCherryCont");
  const phUpload = document.getElementById("phCherryUpload");
  const statusTxt = document.getElementById("statusCherry");
  const btnEnviar = document.getElementById("btnCherryEnviar");
  const inpMonto = document.getElementById("inpCherryMonto");
  const inpFolio = document.getElementById("inpCherryFolio");

  function validarFormulario() {
    const m = parseFloat(inpMonto.value);
    const f = inpFolio.value.trim();
    if (!isNaN(m) && m > 0 && f.length >= 3 && cherryBase64) {
      btnEnviar.disabled = false;
      btnEnviar.style.opacity = "1";
      btnEnviar.style.cursor = "pointer";
    } else {
      btnEnviar.disabled = true;
      btnEnviar.style.opacity = "0.5";
      btnEnviar.style.cursor = "not-allowed";
    }
  }

  inpMonto.addEventListener("input", validarFormulario);
  inpFolio.addEventListener("input", validarFormulario);

  window.abrirRecargaCherry = function() {
    cherryBase64 = null;
    fileInput.value = "";
    inpMonto.value = "";
    inpFolio.value = "";
    prevCont.style.display = "none";
    phUpload.style.display = "block";
    statusTxt.innerHTML = "";
    validarFormulario();
    btnEnviar.innerText = "Validar y Acreditar Saldo";
    modal.style.setProperty("display", "flex", "important");
  };

  btnCerrar.onclick = () => { modal.style.setProperty("display", "none", "important"); };
  dropzone.onclick = () => fileInput.click();

  fileInput.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    cherryMime = file.type || "image/jpeg";
    const reader = new FileReader();
    reader.onload = function(evt) {
      const full = evt.target.result;
      cherryBase64 = full.split(",")[1];
      imgPreview.src = full;
      prevCont.style.display = "block";
      phUpload.style.display = "none";
      validarFormulario();
    };
    reader.readAsDataURL(file);
  };

  btnEnviar.onclick = async function() {
    const montoDeclarado = parseFloat(inpMonto.value);
    const folioDeclarado = inpFolio.value.trim();

    if (!cherryBase64 || isNaN(montoDeclarado) || !folioDeclarado) {
      statusTxt.innerHTML = '<span style="color: #ff5252;">⚠️ Llena todos los campos.</span>';
      return;
    }

    btnEnviar.disabled = true;
    btnEnviar.style.opacity = "0.6";
    btnEnviar.innerText = "Validando con IA...";
    statusTxt.innerHTML = '<span style="color: #64b5f6;">⏳ Cotejando datos con Gemini 3.8 Flash...</span>';

    try {
      const userCode = localStorage.getItem("cherry_user_code") || localStorage.getItem("userCode") || "Eduu15";
      const userPhone = localStorage.getItem("userPhone") || localStorage.getItem("customerPhone") || "";

      const res = await fetch("http://160.34.219.154:3000/api/validar-voucher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64Data: cherryBase64,
          mimeType: cherryMime,
          phone: userPhone,
          userCode: userCode,
          montoDeclarado: montoDeclarado,
          folioDeclarado: folioDeclarado
        })
      });
      const data = await res.json();

      if (!data.ok) {
        statusTxt.innerHTML = '<span style="color: #ff5252;">⚠️ ' + (data.error || "No se pudo validar") + '</span>';
        btnEnviar.disabled = false;
        btnEnviar.style.opacity = "1";
        btnEnviar.innerText = "Reintentar";
        return;
      }

      statusTxt.innerHTML = '<span style="color: #00e676; font-weight: bold;">🎉 ¡Recarga de $' + Number(data.monto).toFixed(2) + ' MXN acreditada!</span>';
      btnEnviar.innerText = "✅ Saldo Acreditado";

      const balSpan = document.getElementById("authBalanceDisplay");
      if (balSpan) {
        balSpan.innerText = Number(data.nuevoSaldo).toFixed(2);
      }

      setTimeout(() => { modal.style.setProperty("display", "none", "important"); }, 2000);
    } catch (err) {
      statusTxt.innerHTML = '<span style="color: #ff5252;">❌ Error de conexión al servidor.</span>';
      btnEnviar.disabled = false;
      btnEnviar.style.opacity = "1";
      btnEnviar.innerText = "Reintentar";
    }
  };
})();
