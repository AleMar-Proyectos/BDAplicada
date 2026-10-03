import { api, auth } from './api.js';

const $ = (id) => document.getElementById(id);

const formatoFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
const fecha = (valor) => (valor ? formatoFecha.format(new Date(valor)) : 'Primer ingreso');

const TIPOS = { administrador: 'Administrador', concesionaria: 'Concesionaria', independiente: 'Independiente' };

function irAlLogin(motivo) {
  window.location.replace(`/login.html${motivo ? `?motivo=${motivo}` : ''}`);
}

function pintarUsuario(u) {
  $('nombre-usuario').textContent = u.nombre;
  $('correo-usuario').textContent = u.correo;
  $('avatar').textContent = u.nombre.trim().charAt(0).toUpperCase();
  $('saludo').textContent = `Hola, ${u.nombre.split(' ')[0]}`;
  $('d-usuario').textContent = u.usuario;
  $('d-rol').textContent = u.rol;
  $('d-tipo').textContent = TIPOS[u.tipo] ?? u.tipo;
  $('d-acceso').textContent = fecha(u.ultimoAcceso);
}

async function verificarConDotnet() {
  const estado = $('estado-net');
  try {
    const r = await api('/api/net/perfil');
    $('d-expira').textContent = r.tokenExpira ? formatoFecha.format(new Date(r.tokenExpira)) : '—';
    $('d-alta').textContent = fecha(r.perfil?.fechaAlta);
    estado.className = 'estado estado--ok';
    estado.textContent = '✓ La API .NET validó la firma del JWT y el rol admin';
  } catch (err) {
    if (err.status === 401) return irAlLogin('SESION_INVALIDA');
    estado.className = 'estado estado--error';
    estado.textContent = `✕ ${err.message}`;
  }
}

async function iniciar() {
  try {
    const { usuario } = await auth.sesion();
    pintarUsuario(usuario);
  } catch (err) {
    return irAlLogin(err.codigo === 'SIN_PERMISO' ? 'SIN_PERMISO' : 'SESION_INVALIDA');
  }
  verificarConDotnet();
}

$('btn-salir').addEventListener('click', async (e) => {
  e.currentTarget.disabled = true;
  try {
    await auth.logout();
  } finally {
    irAlLogin('LOGOUT');
  }
});

// Si el navegador muestra la página desde la caché (botón "atrás" después de
// cerrar sesión), se vuelve a verificar la sesión.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) iniciar();
});

iniciar();
