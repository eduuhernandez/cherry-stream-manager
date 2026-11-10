const fs = require('fs');

// --- 1. AJUSTAR GESTOR.HTML ---
if (fs.existsSync('gestor.html')) {
  let g = fs.readFileSync('gestor.html', 'utf8');

  // Arreglar el array de Super Admins
  const cleanArray = `const SUPER_ADMIN_EMAILS = [
      'iolanycastillo27@gmail.com',
      'jorgehimawari@gmail.com',
      'xolanybami21@gmail.com',
      'edduardohg18@gmail.com',
      'admin@cherrystream.com'
    ];`;
  g = g.replace(/const\s+SUPER_ADMIN_EMAILS\s*=\s*\[[\s\S]*?\];/m, cleanArray);

  // Lógica de badges: PROPIETARIA para Iolany, ADMIN para el resto
  const oldRender = "(esSA ? '<span style=\"background:#0f172a; color:#fff; font-size:0.75rem; padding:3px 8px; border-radius:6px; font-weight:700;\">ADMIN</span>' : '')";
  const newRender = "(email.toLowerCase() === 'iolanycastillo27@gmail.com' ? '<span style=\"background:#be123c; color:#fff; font-size:0.75rem; padding:3px 8px; border-radius:6px; font-weight:700;\">PROPIETARIA</span>' : (esSA ? '<span style=\"background:#0f172a; color:#fff; font-size:0.75rem; padding:3px 8px; border-radius:6px; font-weight:700;\">ADMIN</span>' : ''))";

  if (g.includes(oldRender)) {
    g = g.replace(oldRender, newRender);
  } else {
    // Reemplazo flexible por expresión regular si variaban espacios
    g = g.replace(/\(esSA\s*\?\s*'<span style="background:#0f172a;[^']*ADMIN<\/span>'\s*:\s*''\)/, newRender);
  }

  fs.writeFileSync('gestor.html', g, 'utf8');
  console.log('OK: gestor.html actualizado.');
}

// --- 2. AJUSTAR INDEX.HTML ---
if (fs.existsSync('index.html')) {
  let idx = fs.readFileSync('index.html', 'utf8');

  // Ocultar de raíz el botón gris central "Panel Gestor" mediante estilo inyectado
  if (!idx.includes('id="cherry-hide-old-gestor"')) {
    const hideStyle = `<style id="cherry-hide-old-gestor">
      /* Ocultar el botón viejo flotante sobre el logo */
      a:has(span:contains("Panel Gestor")),
      button:has(span:contains("Panel Gestor")),
      a[href="gestor.html"]:not(#btn-header-gestor) {
        display: none !important;
      }
    </style>\n`;
    idx = idx.replace('</head>', hideStyle + '</head>');
  }

  // Inyectar el script que inserta el engrane al lado de Mis Cuentas
  if (!idx.includes('id="cherry-gear-injector"')) {
    const gearScript = `
    <script id="cherry-gear-injector">
      document.addEventListener("DOMContentLoaded", function() {
        const ADMIN_LIST = [
          "iolanycastillo27@gmail.com",
          "jorgehimawari@gmail.com",
          "xolanybami21@gmail.com",
          "edduardohg18@gmail.com",
          "admin@cherrystream.com"
        ];

        // Buscar botón Mis Cuentas en la cabecera
        const links = Array.from(document.querySelectorAll("a, button"));
        const btnCuentas = links.find(el => el.textContent.includes("Mis Cuentas"));

        // Ocultar cualquier botón que diga "Panel Gestor"
        links.forEach(el => {
          if (el.textContent.includes("Panel Gestor")) {
            el.style.display = "none";
          }
        });

        if (btnCuentas && !document.getElementById("btn-gear-admin")) {
          const gear = document.createElement("a");
          gear.id = "btn-gear-admin";
          gear.href = "admin.html";
          gear.title = "Configurar Precios (Admin)";
          gear.innerHTML = "⚙️";
          gear.style.cssText = "display:none; text-decoration:none; padding:7px 11px; background:#be123c; color:#fff; border-radius:8px; font-size:15px; margin-left:6px; cursor:pointer;";
          btnCuentas.parentNode.insertBefore(gear, btnCuentas.nextSibling);

          if (window.firebase) {
            firebase.auth().onAuthStateChanged(function(u) {
              if (u && u.email && ADMIN_LIST.includes(u.email.toLowerCase().trim())) {
                gear.style.display = "inline-flex";
              } else {
                gear.style.display = "none";
              }
            });
          }
        }
      });
    </script>\n`;
    idx = idx.replace('</body>', gearScript + '</body>');
  }

  fs.writeFileSync('index.html', idx, 'utf8');
  console.log('OK: index.html actualizado.');
}
