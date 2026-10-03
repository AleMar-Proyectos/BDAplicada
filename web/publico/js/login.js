import { auth, ErrorApi } from './api.js';

const $ = (id) => document.getElementById(id);

const form = $('form-login');
const inputUsuario = $('usuario');
const inputPassword = $('password');
const boton = $('btn-ingresar');
const aviso = $('aviso');

/** Mensajes cuando se llega al login redirigido desde otra página. */
const MOTIVOS = {
  SESION_INVALIDA: { tipo: 'info', texto: 'Tu sesión expiró. Volvé a ingresar.' },
  SIN_PERMISO: { tipo: 'error', texto: 'Tu cuenta no tiene permiso para acceder al panel de control.' },
  CUENTA_INACTIVA: { tipo: 'error', texto: 'Tu cuenta está deshabilitada.' },
  LOGOUT: { tipo: 'ok', texto: 'Cerraste sesión correctamente.' },
};

// ---------------------------------------------------------------------------
// Avisos y errores de campo
// ---------------------------------------------------------------------------
function mostrarAviso(texto, tipo = 'error') {
  aviso.className = `aviso aviso--${tipo}`;
  aviso.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  $('aviso-texto').textContent = texto;
  aviso.hidden = false;
}

function ocultarAviso() {
  aviso.hidden = true;
}

function errorCampo(input, mensaje) {
  const p = $(`${input.id}-error`);
  input.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
  p.textContent = mensaje ?? '';
  p.hidden = !mensaje;
}

function validar() {
  const usuario = inputUsuario.value.trim();
  const password = inputPassword.value;
  let primero = null;

  if (usuario.length < 3) {
    errorCampo(inputUsuario, usuario ? 'Revisá el usuario o correo.' : 'Ingresá tu usuario o correo.');
    primero ??= inputUsuario;
  } else {
    errorCampo(inputUsuario, null);
  }

  if (!password) {
    errorCampo(inputPassword, 'Ingresá tu contraseña.');
    primero ??= inputPassword;
  } else {
    errorCampo(inputPassword, null);
  }

  primero?.focus();
  return !primero;
}

function cargando(activo) {
  boton.disabled = activo;
  boton.querySelector('.spinner').hidden = !activo;
  boton.querySelector('.boton__texto').textContent = activo ? 'Verificando…' : 'Ingresar';
  form.setAttribute('aria-busy', String(activo));
}

// ---------------------------------------------------------------------------
// Envío del formulario
// ---------------------------------------------------------------------------
form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (boton.disabled) return; // evita doble envío
  ocultarAviso();
  if (!validar()) return;

  cargando(true);
  try {
    const respuesta = await auth.login(inputUsuario.value.trim(), inputPassword.value);
    boton.querySelector('.boton__texto').textContent = 'Ingresando…';
    window.location.replace(respuesta.redirigirA ?? '/tablero'); // redirección automática al tablero
  } catch (err) {
    cargando(false);
    const mensaje = err instanceof ErrorApi ? err.message : 'Ocurrió un error inesperado.';
    mostrarAviso(mensaje);

    if (err.codigo === 'CREDENCIALES_INVALIDAS') {
      inputPassword.value = '';
      inputPassword.setAttribute('aria-invalid', 'true');
      inputPassword.focus();
    }
  }
});

// Limpiar el error de un campo al corregirlo
for (const input of [inputUsuario, inputPassword]) {
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') errorCampo(input, null);
  });
}

// ---------------------------------------------------------------------------
// Mostrar / ocultar contraseña y aviso de Bloq Mayús
// ---------------------------------------------------------------------------
$('ver-password').addEventListener('click', (e) => {
  const visible = inputPassword.type === 'text';
  inputPassword.type = visible ? 'password' : 'text';
  e.currentTarget.setAttribute('aria-pressed', String(!visible));
  e.currentTarget.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  inputPassword.focus();
});

for (const tipo of ['keydown', 'keyup']) {
  inputPassword.addEventListener(tipo, (e) => {
    if (typeof e.getModifierState === 'function') {
      $('mayus').hidden = !e.getModifierState('CapsLock');
    }
  });
}

// ---------------------------------------------------------------------------
// Al cargar: motivo de la redirección y, si ya hay sesión, ir directo al tablero
// ---------------------------------------------------------------------------
async function iniciar() {
  const parametros = new URLSearchParams(window.location.search);
  const motivo = MOTIVOS[parametros.get('motivo')];
  if (motivo) mostrarAviso(motivo.texto, motivo.tipo);
  if (parametros.has('motivo')) history.replaceState(null, '', window.location.pathname);

  try {
    await auth.sesion();
    window.location.replace('/tablero');
  } catch {
    inputUsuario.focus(); // sin sesión: se queda en el login
  }
}

iniciar();
