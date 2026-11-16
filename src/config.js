// Configuración leída de variables de entorno (.env)

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  baseUrl: (env.BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  adminKey: env.ADMIN_KEY || '',
  wompiEnv: env.WOMPI_ENV === 'production' ? 'production' : 'sandbox',
  whatsapp: {
    token: env.WHATSAPP_TOKEN || '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    apiVersion: env.WHATSAPP_API_VERSION || 'v21.0',
    templateCliente: env.WHATSAPP_TEMPLATE_CLIENTE || 'pago_confirmado',
    templateRestaurante: env.WHATSAPP_TEMPLATE_RESTAURANTE || '',
    lang: env.WHATSAPP_TEMPLATE_LANG || 'es',
  },
};

// "demo-burger" -> "DEMO_BURGER"
const sufijo = (slug) => slug.toUpperCase().replace(/[^A-Z0-9]/g, '_');

// Claves Wompi de un restaurante: primero las propias (con sufijo), si no, las globales.
export function wompiDe(slug) {
  const s = sufijo(slug);
  const leer = (nombre) => env[`${nombre}_${s}`] || env[nombre] || '';
  const claves = {
    publicKey: leer('WOMPI_PUBLIC_KEY'),
    privateKey: leer('WOMPI_PRIVATE_KEY'),
    integritySecret: leer('WOMPI_INTEGRITY_SECRET'),
    eventsSecret: leer('WOMPI_EVENTS_SECRET'),
  };
  claves.configurado = Boolean(claves.publicKey && claves.integritySecret);
  return claves;
}

export const whatsappConfigurado = () =>
  Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);

export const apiWompi = () =>
  config.wompiEnv === 'production' ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1';
