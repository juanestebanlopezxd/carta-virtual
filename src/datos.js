// Almacenamiento sencillo en archivos JSON.
// Sirve para arrancar; cuando haya volumen, cambiar por una base de datos (PostgreSQL, SQLite...).

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const archivoRestaurantes = join(raiz, 'restaurantes.json');
const archivoPedidos = join(raiz, 'pedidos.json');
const carpetaComprobantes = join(raiz, 'comprobantes');

if (!existsSync(carpetaComprobantes)) mkdirSync(carpetaComprobantes, { recursive: true });

// Las cartas se releen en cada consulta: si editas restaurantes.json, el cambio se ve sin reiniciar.
export function restaurantes() {
  return JSON.parse(readFileSync(archivoRestaurantes, 'utf8'));
}

export function restaurante(slug) {
  return restaurantes().find((r) => r.slug === slug) || null;
}

let pedidos = existsSync(archivoPedidos) ? JSON.parse(readFileSync(archivoPedidos, 'utf8')) : [];

function guardar() {
  const tmp = archivoPedidos + '.tmp';
  writeFileSync(tmp, JSON.stringify(pedidos, null, 2));
  renameSync(tmp, archivoPedidos); // escritura atómica
}

export function crearPedido(pedido) {
  pedidos.push(pedido);
  guardar();
  return pedido;
}

export function buscarPedido(referencia) {
  return pedidos.find((p) => p.referencia === referencia) || null;
}

export function actualizarPedido(referencia, cambios) {
  const p = buscarPedido(referencia);
  if (!p) return null;
  Object.assign(p, cambios, { actualizado: new Date().toISOString() });
  guardar();
  return p;
}

export function listarPedidos(slug) {
  return pedidos
    .filter((p) => !slug || p.restaurante === slug)
    .slice()
    .reverse();
}

// Fotos de comprobantes de transferencia: data/comprobantes/<referencia>.<ext>
export function guardarComprobante(referencia, datos, ext) {
  const nombre = `${referencia.replace(/[^\w-]/g, '')}.${ext}`;
  writeFileSync(join(carpetaComprobantes, nombre), datos);
  return nombre;
}

export function leerComprobante(nombre) {
  const archivo = join(carpetaComprobantes, basename(nombre));
  return existsSync(archivo) ? readFileSync(archivo) : null;
}
