// Carta virtual: servidor principal (Node.js, sin dependencias externas)
// Ejecutar: npm start   (o: node --env-file-if-exists=.env server.js)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import { config, wompiDe, whatsappConfigurado } from './src/config.js';
import * as db from './src/datos.js';
import { urlCheckout, eventoValido, consultarTransaccion } from './src/wompi.js';
import { avisarCliente, avisarRestaurante } from './src/whatsapp.js';
import { describirItem, mensajePedido } from './src/texto.js';

const PUBLICO = join(dirname(fileURLToPath(import.meta.url)), 'public');
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};
const ESTADOS_COCINA = ['nuevo', 'preparando', 'enviado', 'entregado'];

// ---------- utilidades HTTP ----------
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function leerJson(req, limite = 100_000) {
  let tam = 0;
  const partes = [];
  for await (const parte of req) {
    tam += parte.length;
    if (tam > limite) throw Object.assign(new Error('Solicitud muy grande'), { status: 413 });
    partes.push(parte);
  }
  try {
    return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('JSON inválido'), { status: 400 });
  }
}

async function servirArchivo(res, ruta) {
  const limpia = normalize(decodeURIComponent(ruta)).replace(/^(\.\.[/\\])+/, '');
  const archivo = join(PUBLICO, limpia === '/' ? 'index.html' : limpia);
  if (!archivo.startsWith(PUBLICO)) return json(res, 403, { error: 'Prohibido' });
  try {
    const contenido = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream' });
    res.end(contenido);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
}

// ---------- lógica de negocio ----------

// Teléfono colombiano -> formato internacional sin "+": 3001234567 -> 573001234567
function normalizarTelefono(t) {
  const d = String(t || '').replace(/\D/g, '');
  if (/^3\d{9}$/.test(d)) return '57' + d;
  if (/^573\d{9}$/.test(d)) return d;
  return null;
}

function nuevaReferencia(slug) {
  const ini = slug.split('-').map((p) => p[0]).join('').toUpperCase().slice(0, 3);
  const fecha = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `${ini}-${fecha}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

// Versión pública de la carta (sin datos internos)
function cartaPublica(r) {
  return {
    slug: r.slug,
    nombre: r.nombre,
    eslogan: r.eslogan,
    colorPrimario: r.colorPrimario,
    logo: r.logo || null,
    logoAncho: Boolean(r.logoAncho),
    whatsapp: r.whatsapp,
    direccion: r.direccion,
    abierto: r.abierto !== false,
    soloDomicilio: Boolean(r.soloDomicilio),
    horarioTexto: r.horarioTexto || '',
    costoDomicilio: r.domicilioAparte ? 0 : r.costoDomicilio || 0,
    domicilioAparte: Boolean(r.domicilioAparte),
    pedidoMinimo: r.pedidoMinimo || 0,
    adicionales: r.adicionales || [],
    maxPorAdicional: r.maxPorAdicional || 3,
    pago: pagoPublico(r),
    categorias: r.categorias,
  };
}

// Cómo cobra cada restaurante: "transferencia" (QR / Nequi, se verifica a mano) o "wompi" (pasarela)
const tipoPago = (r) => (r.pago?.tipo === 'wompi' ? 'wompi' : 'transferencia');
const pagoPublico = (r) => ({
  tipo: tipoPago(r),
  efectivo: r.pago?.efectivo !== false,
  qr: r.pago?.qr || null,
  qrDescarga: r.pago?.qrDescarga || r.pago?.qr || null,
  cuentas: r.pago?.cuentas || [],
  instrucciones: r.pago?.instrucciones || '',
});

// Valida la personalización de un producto: qué ingredientes quitó y qué adicionales agregó.
// Devuelve { sin: [nombres], adicionales: [{id, nombre, precio, cantidad}], precioUnitario }
function personalizar(r, p, it) {
  const removibles = new Set((p.ingredientes || []).filter((i) => !i.fijo).map((i) => i.nombre));
  const sin = [...new Set(Array.isArray(it.sin) ? it.sin : [])].filter((n) => removibles.has(n));

  const catalogo = new Map((r.adicionales || []).map((a) => [a.id, a]));
  const permitidos = p.adicionales === false ? new Set() : new Set(p.adicionales || catalogo.keys());
  const maximo = r.maxPorAdicional || 3;
  const adicionales = [];
  for (const [id, n] of Object.entries(it.adicionales && typeof it.adicionales === 'object' ? it.adicionales : {})) {
    const a = catalogo.get(id);
    const cantidad = Math.floor(Number(n));
    if (!a || !permitidos.has(id) || !(cantidad >= 1)) continue;
    adicionales.push({ id, nombre: a.nombre, precio: a.precio, cantidad: Math.min(cantidad, maximo) });
  }
  const precioUnitario = p.precio + adicionales.reduce((s, a) => s + a.precio * a.cantidad, 0);
  return { sin, adicionales, precioUnitario };
}


// Los precios SIEMPRE se calculan en el servidor, nunca se confía en lo que manda el navegador.
function armarPedido(r, cuerpo) {
  const productos = new Map(r.categorias.flatMap((c) => c.productos).map((p) => [p.id, p]));
  const items = [];
  for (const it of Array.isArray(cuerpo.items) ? cuerpo.items : []) {
    const p = productos.get(it.id);
    const cantidad = Math.floor(Number(it.cantidad));
    if (!p || !p.disponible || !(cantidad >= 1 && cantidad <= 50)) continue;
    const { sin, adicionales, precioUnitario } = personalizar(r, p, it);
    items.push({
      id: p.id,
      nombre: p.nombre,
      precioBase: p.precio,
      precio: precioUnitario, // precio base + adicionales, por unidad
      cantidad,
      sin,
      adicionales,
      nota: String(it.nota || '').replace(/\s+/g, ' ').trim().slice(0, 140),
    });
  }
  if (!items.length) throw Object.assign(new Error('El carrito está vacío'), { status: 400 });

  const c = cuerpo.cliente || {};
  const nombre = String(c.nombre || '').trim().slice(0, 80);
  const telefono = normalizarTelefono(c.telefono);
  // Cocina oculta ("soloDomicilio": true): nunca se acepta recoger
  const entrega = cuerpo.entrega === 'recoger' && !r.soloDomicilio ? 'recoger' : 'domicilio';
  const direccion = String(c.direccion || '').trim().slice(0, 160);

  if (nombre.length < 2) throw Object.assign(new Error('Escribe tu nombre'), { status: 400 });
  if (!telefono) throw Object.assign(new Error('Escribe un celular válido (10 dígitos, empieza por 3)'), { status: 400 });
  if (entrega === 'domicilio' && direccion.length < 5)
    throw Object.assign(new Error('Escribe la dirección de entrega'), { status: 400 });

  const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  if (subtotal < (r.pedidoMinimo || 0))
    throw Object.assign(new Error(`El pedido mínimo es $${r.pedidoMinimo.toLocaleString('es-CO')}`), { status: 400 });
  // "domicilioAparte": el valor del domicilio varía (zona, clima…) y se cobra aparte, no suma al total
  const domicilioAparte = entrega === 'domicilio' && Boolean(r.domicilioAparte);
  const domicilio = entrega === 'domicilio' && !domicilioAparte ? r.costoDomicilio || 0 : 0;
  const total = subtotal + domicilio;

  // Medio de pago: efectivo (contra entrega) o transferencia / QR
  const aceptaEfectivo = r.pago?.efectivo !== false;
  const metodoPago = cuerpo.metodoPago === 'efectivo' && aceptaEfectivo ? 'efectivo' : 'transferencia';
  if (cuerpo.metodoPago === 'efectivo' && !aceptaEfectivo)
    throw Object.assign(new Error('Este restaurante no recibe efectivo'), { status: 400 });
  let pagaCon = null;
  if (metodoPago === 'efectivo' && cuerpo.pagaCon) {
    pagaCon = Math.round(Number(String(cuerpo.pagaCon).replace(/\D/g, '')));
    if (!(pagaCon > 0)) pagaCon = null;
    else if (pagaCon < total)
      throw Object.assign(new Error(`El valor con el que pagas es menor al valor del pedido ($${total.toLocaleString('es-CO')})`), { status: 400 });
  }

  return {
    referencia: nuevaReferencia(r.slug),
    restaurante: r.slug,
    items,
    subtotal,
    domicilio,
    domicilioAparte,
    total,
    entrega,
    metodoPago,
    pagaCon,
    cliente: {
      nombre,
      telefono,
      direccion: entrega === 'domicilio' ? direccion : '',
      barrio: String(c.barrio || '').trim().slice(0, 80),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || '') ? c.email : '',
      notas: String(c.notas || '').trim().slice(0, 300),
    },
    // transferencia: esperando_pago -> por_verificar (envió el pedido por WhatsApp) -> pagado | rechazado
    // efectivo: contra_entrega (se cobra al entregar)
    estado: metodoPago === 'efectivo' ? 'contra_entrega' : 'esperando_pago',
    estadoCocina: 'nuevo',
    pago: null,
    notificado: false,
    creado: new Date().toISOString(),
  };
}

// Aplica el resultado de un pago (venga del webhook, de la consulta a Wompi o del simulador)
async function aplicarPago(referencia, { status, transaccionId, montoCentavos, metodo, origen }) {
  const pedido = db.buscarPedido(referencia);
  if (!pedido) return null;
  if (pedido.estado === 'pagado') return pedido; // ya procesado: no repetir notificación

  let estado = pedido.estado;
  if (status === 'APPROVED') {
    if (Number(montoCentavos) !== pedido.total * 100) {
      console.warn(`[ALERTA] Monto distinto en ${referencia}: esperado ${pedido.total * 100}, recibido ${montoCentavos}`);
      estado = 'rechazado';
    } else {
      estado = 'pagado';
    }
  } else if (['DECLINED', 'VOIDED', 'ERROR'].includes(status)) {
    estado = 'rechazado';
  }

  db.actualizarPedido(referencia, {
    estado,
    pago: { status, transaccionId, metodo: metodo || null, origen, fecha: new Date().toISOString() },
  });

  if (estado === 'pagado') await notificar(referencia);
  return db.buscarPedido(referencia);
}

async function notificar(referencia, { avisarAlRestaurante = true } = {}) {
  const pedido = db.buscarPedido(referencia);
  const r = db.restaurante(pedido.restaurante);
  const resultado = {};
  try {
    resultado.cliente = await avisarCliente(pedido, r);
  } catch (e) {
    console.error('Error avisando al cliente:', e.message);
    resultado.cliente = { error: e.message };
  }
  try {
    resultado.restaurante = avisarAlRestaurante ? await avisarRestaurante(pedido, r) : { omitido: true };
  } catch (e) {
    console.error('Error avisando al restaurante:', e.message);
    resultado.restaurante = { error: e.message };
  }
  db.actualizarPedido(referencia, { notificado: !resultado.cliente?.error, notificacion: resultado });
}

const estadoPublico = (p) => ({
  referencia: p.referencia,
  restaurante: p.restaurante,
  estado: p.estado,
  estadoCocina: p.estadoCocina,
  total: p.total,
  items: p.items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, detalle: describirItem(i) })),
  entrega: p.entrega,
  nombre: p.cliente.nombre.split(' ')[0],
  comprobante: Boolean(p.comprobante),
  metodoPago: p.metodoPago || 'transferencia',
  pagaCon: p.pagaCon || null,
  domicilioAparte: Boolean(p.domicilioAparte),
});

const esAdmin = (req, url) =>
  Boolean(config.adminKey) && (req.headers['x-admin-key'] || url.searchParams.get('clave')) === config.adminKey;

// ---------- rutas ----------
async function manejar(req, res) {
  const url = new URL(req.url, config.baseUrl);
  const ruta = url.pathname;
  const m = req.method;
  let k;

  // Lista de restaurantes
  if (m === 'GET' && ruta === '/api/restaurantes') {
    return json(res, 200, db.restaurantes().map(({ slug, nombre, eslogan, colorPrimario, logo, logoAncho, abierto }) =>
      ({ slug, nombre, eslogan, colorPrimario, logo: logo || null, logoAncho: Boolean(logoAncho), abierto: abierto !== false })));
  }

  // Carta de un restaurante
  if (m === 'GET' && (k = ruta.match(/^\/api\/restaurantes\/([\w-]+)$/))) {
    const r = db.restaurante(k[1]);
    return r ? json(res, 200, cartaPublica(r)) : json(res, 404, { error: 'Restaurante no encontrado' });
  }

  // Crear pedido -> devuelve a dónde mandar al cliente a pagar
  if (m === 'POST' && ruta === '/api/pedidos') {
    const cuerpo = await leerJson(req);
    const r = db.restaurante(cuerpo.restaurante);
    if (!r) return json(res, 404, { error: 'Restaurante no encontrado' });
    if (r.abierto === false) return json(res, 400, { error: 'El restaurante está cerrado en este momento' });

    const pedido = db.crearPedido(armarPedido(r, cuerpo));
    const volver = `${config.baseUrl}/estado.html?ref=${pedido.referencia}`;
    let urlPago = `/pago.html?ref=${pedido.referencia}`; // transferencia: QR / Nequi
    if (tipoPago(r) === 'wompi') {
      urlPago = wompiDe(r.slug).configurado ? urlCheckout(pedido, volver) : `/simular-pago.html?ref=${pedido.referencia}`;
    }
    return json(res, 201, {
      referencia: pedido.referencia,
      total: pedido.total,
      metodoPago: pedido.metodoPago,
      urlPago,
      // Texto del pedido para enviarlo por WhatsApp (incluye datos del cliente: solo se entrega aquí)
      mensajeWhatsapp: mensajePedido(pedido, r),
    });
  }

  // Estado de un pedido (lo consulta la página de confirmación)
  if (m === 'GET' && (k = ruta.match(/^\/api\/pedidos\/([\w-]+)$/))) {
    let p = db.buscarPedido(k[1]);
    if (!p) return json(res, 404, { error: 'Pedido no encontrado' });

    // Respaldo: si Wompi nos devolvió con ?id=<transacción>, verificamos directamente con Wompi
    const idTx = url.searchParams.get('id');
    if (idTx && p.estado === 'esperando_pago' && wompiDe(p.restaurante).configurado) {
      try {
        const tx = await consultarTransaccion(idTx);
        if (tx?.reference === p.referencia) {
          p = await aplicarPago(p.referencia, {
            status: tx.status, transaccionId: tx.id, montoCentavos: tx.amount_in_cents,
            metodo: tx.payment_method_type, origen: 'consulta',
          });
        }
      } catch (e) {
        console.error('No se pudo consultar Wompi:', e.message);
      }
    }
    return json(res, 200, estadoPublico(p));
  }

  // El cliente avisa que ya transfirió (con o sin foto del comprobante)
  if (m === 'POST' && (k = ruta.match(/^\/api\/pedidos\/([\w-]+)\/reportar-pago$/))) {
    const p = db.buscarPedido(k[1]);
    if (!p) return json(res, 404, { error: 'Pedido no encontrado' });
    if (p.metodoPago === 'efectivo') {
      return json(res, 200, estadoPublico(db.actualizarPedido(p.referencia, { enviadoWhatsapp: new Date().toISOString() })));
    }
    if (!['esperando_pago', 'por_verificar'].includes(p.estado))
      return json(res, 409, { error: 'Este pedido ya fue procesado' });

    const { imagen } = await leerJson(req, 6_000_000);
    let comprobante = p.comprobante || null;
    if (imagen) {
      const mm = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(imagen));
      if (!mm) return json(res, 400, { error: 'La imagen del comprobante no es válida' });
      const datos = Buffer.from(mm[2], 'base64');
      if (datos.length > 4_000_000) return json(res, 413, { error: 'La imagen es muy pesada' });
      comprobante = db.guardarComprobante(p.referencia, datos, mm[1] === 'jpeg' ? 'jpg' : mm[1]);
    }
    const actualizado = db.actualizarPedido(p.referencia, {
      estado: 'por_verificar',
      comprobante,
      reportado: new Date().toISOString(),
      enviadoWhatsapp: new Date().toISOString(),
    });
    console.log(`[PAGO POR VERIFICAR] ${p.referencia} · $${p.total.toLocaleString('es-CO')}${comprobante ? ' · con comprobante' : ''}`);
    return json(res, 200, estadoPublico(actualizado));
  }

  // Evento de Wompi (configurar en el panel de Wompi: URL de eventos = BASE_URL/webhooks/wompi)
  if (m === 'POST' && ruta === '/webhooks/wompi') {
    const evento = await leerJson(req);
    const tx = evento?.data?.transaction;
    if (evento.event !== 'transaction.updated' || !tx) return json(res, 200, { ok: true, ignorado: true });

    const pedido = db.buscarPedido(tx.reference);
    if (!pedido) return json(res, 200, { ok: true, ignorado: 'referencia desconocida' });

    if (!eventoValido(evento, wompiDe(pedido.restaurante).eventsSecret)) {
      console.warn(`[ALERTA] Evento Wompi con firma inválida para ${tx.reference}`);
      return json(res, 401, { error: 'Firma inválida' });
    }
    await aplicarPago(tx.reference, {
      status: tx.status, transaccionId: tx.id, montoCentavos: tx.amount_in_cents,
      metodo: tx.payment_method_type, origen: 'webhook',
    });
    return json(res, 200, { ok: true });
  }

  // Simulador de pago (solo cuando el restaurante NO tiene Wompi configurado)
  if (m === 'POST' && ruta === '/api/simular-pago') {
    const { referencia, resultado } = await leerJson(req);
    const p = db.buscarPedido(referencia);
    if (!p) return json(res, 404, { error: 'Pedido no encontrado' });
    if (wompiDe(p.restaurante).configurado) return json(res, 403, { error: 'Wompi está configurado: usa el pago real' });
    const actualizado = await aplicarPago(referencia, {
      status: resultado === 'rechazar' ? 'DECLINED' : 'APPROVED',
      transaccionId: 'SIM-' + randomBytes(4).toString('hex'),
      montoCentavos: p.total * 100,
      metodo: 'SIMULADO',
      origen: 'simulador',
    });
    return json(res, 200, estadoPublico(actualizado));
  }

  // ---- Panel del restaurante ----
  if (ruta.startsWith('/api/admin/')) {
    if (!esAdmin(req, url)) return json(res, 401, { error: 'Clave incorrecta' });

    if (m === 'GET' && ruta === '/api/admin/pedidos') {
      res.setHeader('X-Whatsapp-Automatico', whatsappConfigurado() ? '1' : '0');
      return json(res, 200, db.listarPedidos(url.searchParams.get('restaurante') || ''));
    }
    // Ver la foto del comprobante
    if (m === 'GET' && (k = ruta.match(/^\/api\/admin\/pedidos\/([\w-]+)\/comprobante$/))) {
      const p = db.buscarPedido(k[1]);
      const archivo = p?.comprobante && db.leerComprobante(p.comprobante);
      if (!archivo) return json(res, 404, { error: 'Sin comprobante' });
      res.writeHead(200, { 'Content-Type': TIPOS[extname(p.comprobante)] || 'image/jpeg', 'Cache-Control': 'private, max-age=3600' });
      return res.end(archivo);
    }

    // El restaurante confirma (ya vio la plata en su Nequi) o rechaza el pago
    if (m === 'POST' && (k = ruta.match(/^\/api\/admin\/pedidos\/([\w-]+)\/pago$/))) {
      const { accion } = await leerJson(req);
      const p = db.buscarPedido(k[1]);
      if (!p) return json(res, 404, { error: 'Pedido no encontrado' });
      if (p.estado === 'pagado') return json(res, 409, { error: 'Este pedido ya está confirmado' });
      if (accion === 'confirmar') {
        db.actualizarPedido(p.referencia, {
          estado: 'pagado',
          pago: { metodo: p.metodoPago === 'efectivo' ? 'EFECTIVO' : 'TRANSFERENCIA', origen: 'manual', fecha: new Date().toISOString() },
        });
        await notificar(p.referencia, { avisarAlRestaurante: false });
      } else if (accion === 'rechazar') {
        db.actualizarPedido(p.referencia, { estado: 'rechazado' });
      } else {
        return json(res, 400, { error: 'Acción inválida' });
      }
      return json(res, 200, { ...db.buscarPedido(p.referencia), whatsappAutomatico: whatsappConfigurado() });
    }

    if (m === 'POST' && (k = ruta.match(/^\/api\/admin\/pedidos\/([\w-]+)\/estado$/))) {
      const { estadoCocina } = await leerJson(req);
      if (!ESTADOS_COCINA.includes(estadoCocina)) return json(res, 400, { error: 'Estado inválido' });
      const p = db.actualizarPedido(k[1], { estadoCocina });
      return p ? json(res, 200, p) : json(res, 404, { error: 'Pedido no encontrado' });
    }
    return json(res, 404, { error: 'Ruta no encontrada' });
  }

  // Enlace corto por restaurante: /r/hard-burgers
  if (m === 'GET' && (k = ruta.match(/^\/r\/([\w-]+)\/?$/))) {
    res.writeHead(302, { Location: `/carta.html?r=${k[1]}` });
    return res.end();
  }

  if (m === 'GET') return servirArchivo(res, ruta);
  return json(res, 404, { error: 'Ruta no encontrada' });
}

const servidor = createServer((req, res) => {
  manejar(req, res).catch((e) => {
    if (!e.status) console.error(e);
    json(res, e.status || 500, { error: e.status ? e.message : 'Error interno' });
  });
});

servidor.listen(config.port, () => {
  console.log(`Carta virtual en ${config.baseUrl}`);
  for (const r of db.restaurantes()) {
    const pagos = tipoPago(r) === 'transferencia'
      ? 'transferencia (QR / Nequi)'
      : wompiDe(r.slug).configurado ? `Wompi (${config.wompiEnv})` : 'Wompi SIMULADO';
    console.log(`  · ${r.nombre}: ${config.baseUrl}/r/${r.slug}  [pagos: ${pagos}]`);
  }
  console.log(`  WhatsApp: ${whatsappConfigurado() ? 'automático (Cloud API)' : 'manual: botón en el panel (sin API)'}`);
  console.log(`  Panel: ${config.baseUrl}/admin.html${config.adminKey ? '' : '  (define ADMIN_KEY en .env)'}`);
});
