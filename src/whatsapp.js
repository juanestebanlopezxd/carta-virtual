// Envío de mensajes por la WhatsApp Cloud API (Meta).
// Para escribirle a un cliente por iniciativa del negocio se usa una PLANTILLA aprobada en Meta.

import { config, whatsappConfigurado } from './config.js';
import { describirItem } from './texto.js';

const pesos = (n) => '$' + Number(n).toLocaleString('es-CO');

async function enviarPlantilla({ para, plantilla, parametros, phoneNumberId }) {
  const { token, apiVersion, lang } = config.whatsapp;
  const cuerpo = {
    messaging_product: 'whatsapp',
    to: para,
    type: 'template',
    template: {
      name: plantilla,
      language: { code: lang },
      components: [
        { type: 'body', parameters: parametros.map((t) => ({ type: 'text', text: String(t) })) },
      ],
    },
  };

  if (!whatsappConfigurado()) {
    console.log(`\n[MODO PRUEBA] WhatsApp a +${para} (plantilla "${plantilla}"):`, parametros.join(' | '));
    return { simulado: true };
  }

  const r = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId || config.whatsapp.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    }
  );
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${JSON.stringify(json.error || json)}`);
  return { id: json.messages?.[0]?.id };
}

// Plantilla "pago_confirmado" (sugerida):
// "Hola {{1}}, recibimos tu pago de {{2}} en {{3}}. Tu pedido {{4}} ya está en preparación. ¡Gracias!"
export function avisarCliente(pedido, restaurante) {
  return enviarPlantilla({
    para: pedido.cliente.telefono,
    plantilla: config.whatsapp.templateCliente,
    parametros: [pedido.cliente.nombre.split(' ')[0], pesos(pedido.total), restaurante.nombre, pedido.referencia],
    phoneNumberId: restaurante.whatsappPhoneNumberId,
  });
}

// Plantilla "nuevo_pedido" (sugerida):
// "Nuevo pedido pagado {{1}}: {{2}}. Total {{3}}. Entrega: {{4}}. Cliente: {{5}}"
export function avisarRestaurante(pedido, restaurante) {
  if (!config.whatsapp.templateRestaurante || !restaurante.whatsapp) return Promise.resolve({ omitido: true });
  // WhatsApp no permite saltos de línea en los parámetros de plantilla: se separa con " | "
  const resumen = pedido.items.map(describirItem).join(' | ').slice(0, 700);
  const entrega = pedido.entrega === 'domicilio' ? `Domicilio a ${pedido.cliente.direccion}` : 'Recoge en el local';
  return enviarPlantilla({
    para: restaurante.whatsapp,
    plantilla: config.whatsapp.templateRestaurante,
    parametros: [pedido.referencia, resumen, pesos(pedido.total), entrega, `${pedido.cliente.nombre} +${pedido.cliente.telefono}`],
    phoneNumberId: restaurante.whatsappPhoneNumberId,
  });
}
