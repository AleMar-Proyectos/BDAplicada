/**
 * Error de aplicación con código HTTP y código de negocio estable.
 * El front decide qué mostrar según `codigo`, nunca parseando el mensaje.
 */
export class ErrorApp extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorApp';
    this.status = status;
    this.codigo = codigo;
  }
}

export const Errores = {
  credencialesInvalidas: () =>
    new ErrorApp(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos.'),
  sinSesion: () =>
    new ErrorApp(401, 'SESION_INVALIDA', 'Tu sesión no es válida o expiró. Volvé a ingresar.'),
  sinPermiso: () =>
    new ErrorApp(403, 'SIN_PERMISO', 'Tu cuenta no tiene permiso para acceder al panel de control.'),
  cuentaInactiva: () =>
    new ErrorApp(403, 'CUENTA_INACTIVA', 'Tu cuenta está deshabilitada. Contactá al administrador.'),
  demasiadosIntentos: () =>
    new ErrorApp(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Esperá unos minutos y volvé a probar.'),
  authNoDisponible: () =>
    new ErrorApp(503, 'AUTH_NO_DISPONIBLE', 'El servicio de autenticación no está disponible. Probá más tarde.'),
  datosInvalidos: (detalle) =>
    new ErrorApp(400, 'DATOS_INVALIDOS', detalle ?? 'Los datos enviados no son válidos.'),
};
