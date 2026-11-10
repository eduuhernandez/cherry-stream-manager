const fs = require('fs');
let idx = fs.readFileSync('index.html', 'utf8');

// Restaurar primero si se había reemplazado el texto "Mis Cuentas"
idx = idx.replace(/📋 Gestor<\/a> <a href="admin\.html" id="btn-header-admin-gear"[^>]*>⚙️<\/a>/g, '🍿 Mis Cuentas</a>');

// Definir los dos accesos independientes
const botonesExtra = `
  <a href="gestor.html" id="btn-header-gestor" style="text-decoration:none; padding:7px 12px; background:#2563eb; color:#ffffff; border-radius:8px; font-weight:600; font-size:13px; display:inline-flex; align-items:center; gap:5px; margin-left:6px; transition:0.2s;">
    📋 Gestor
  </a>
  <a href="admin.html" id="btn-header-admin-gear" title="Panel de Configuración y Precios" style="text-decoration:none; padding:6px 10px; background:#be123c; color:#ffffff; border-radius:8px; font-weight:bold; font-size:15px; display:inline-flex; align-items:center; justify-content:center; margin-left:4px; box-shadow:0 2px 6px rgba(190,18,60,0.3);">
    ⚙️
  </a>
`;

// Limpiar inyecciones previas de estos botones para no duplicar
idx = idx.replace(/<a[^>]*id="btn-header-gestor"[\s\S]*?<\/a>/gi, '');
idx = idx.replace(/<a[^>]*id="btn-header-admin-gear"[\s\S]*?<\/a>/gi, '');

// Insertar Gestor y Engrane justo después del botón "Mis Cuentas"
if (idx.includes('Mis Cuentas')) {
  idx = idx.replace(/(<a[^>]*>[\s\S]*?Mis Cuentas[\s\S]*?<\/a>)/i, `$1 ${botonesExtra}`);
} else if (idx.includes('btn-recargar')) {
  idx = idx.replace(/(<button[^>]*btn-recargar[^>]*>[\s\S]*?<\/button>)/i, `$1 ${botonesExtra}`);
}

fs.writeFileSync('index.html', idx, 'utf8');
console.log('BARRA_CONFIGURADA_CON_TODO');
