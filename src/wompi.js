// Integración con Wompi (Colombia): Web Checkout + verificación de eventos.
// Docs: https://docs.wompi.co

import { createHash, timingSafeEqual } from 'node:crypto';
import { wompiDe, apiWompi } from './config.js';

const sha256 = (texto) => createHash('sha256').update(texto).digest('hex');

// Firma de integridad: SHA256(referencia + montoEnCentavos + moneda + secretoIntegridad)
export function firmaIntegridad(referencia, montoCentavos, moneda, secreto) {
  return sha256(`${referencia}${montoCentavos}${moneda}${secreto}`);
}

// URL del Web Checkout de Wompi para un pedido
export function urlCheckout(pedido, redirectUrl) {
  const w = wompiDe(pedido.restaurante);
  const montoCentavos = pedido.total * 100;
  const p = new URLSearchParams({
    'public-key': w.publicKey,
    currency: 'COP',
    'amount-in-cents': String(montoCentavos),
    reference: pedido.referencia,
    'signature:integrity': firmaIntegridad(pedido.referencia, montoCentavos, 'COP', w.integritySecret),
    'redirect-url': redirectUrl,
    'customer-data:full-name': pedido.cliente.nombre,
    'customer-data:phone-number': pedido.cliente.telefono.replace(/^57/, ''),
    'customer-data:phone-number-prefix': '+57',
  });
  if (pedido.cliente.email) p.set('customer-data:email', pedido.cliente.email);
  return `https://checkout.wompi.co/p/?${p.toString()}`;
}

// Valida el checksum de un evento de Wompi.
// checksum = SHA256(valores de signature.properties concatenados + timestamp + secretoEventos)
export function eventoValido(evento, secretoEventos) {
  if (!secretoEventos || !evento?.signature?.properties || !evento.signature.checksum) return false;
  const valor = (ruta) => ruta.split('.').reduce((obj, k) => (obj == null ? obj : obj[k]), evento.data);
  const cadena = evento.signature.properties.map(valor).join('') + evento.timestamp + secretoEventos;
  const esperado = Buffer.from(sha256(cadena));
  const recibido = Buffer.from(String(evento.signature.checksum).toLowerCase());
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

// Consulta una transacción directamente a Wompi (respaldo si el evento se demora)
export async function consultarTransaccion(idTransaccion) {
  const r = await fetch(`${apiWompi()}/transactions/${encodeURIComponent(idTransaccion)}`);
  if (!r.ok) throw new Error(`Wompi respondió ${r.status}`);
  const json = await r.json();
  return json.data; // { id, status, reference, amount_in_cents, payment_method_type, ... }
}
