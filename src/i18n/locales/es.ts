/**
 * Spanish message catalogue (Phase 10, Slice 10.3).
 *
 * A `Partial` of the English catalogue: any key omitted here falls back to the
 * English string. Added as a real second locale so the language switch is
 * demonstrably functional, not a stub.
 */
import type { Messages } from '../index';

export const es: Partial<Messages> = {
  // Generic
  'common.done': 'Listo',
  'common.close': 'Cerrar',
  'common.on': 'activado',
  'common.off': 'desactivado',

  // App chrome
  'app.name': 'CODE NAME',
  'app.tagline': 'Entorno de agentes gobernado',

  // Settings entry point
  'settings.open': 'Ajustes',

  // Settings screen
  'settings.title': 'Ajustes',
  'settings.subtitle': 'Un único lugar para modelos, secretos, permisos y espacio de trabajo.',
  'settings.section.models': 'Administrador de proveedores',
  'settings.section.secrets': 'Secretos',
  'settings.section.gates': 'Permisos de capacidad',
  'settings.section.tuning': 'Ajuste fino',
  'settings.section.language': 'Idioma',
  'settings.section.logs': 'Registros',
  'settings.section.about': 'Acerca de',

  'settings.models.preset': 'Preajuste',
  'settings.models.endpoint': 'Proveedor',
  'settings.models.model': 'Modelo',
  'settings.models.noModels': 'No se detectaron modelos instalados. Inicia el servidor de modelos y vuelve a sondear desde la píldora de estado.',

  'settings.language.label': 'Idioma de la interfaz',
  'settings.language.help': 'El inglés siempre está disponible como respaldo para el texto no traducido.',

  'settings.logs.view': 'Ver registros',
  'settings.logs.help': 'Abre el directorio de registros local en tu gestor de archivos.',
  'settings.logs.desktopOnly': 'Los registros están disponibles en la aplicación de escritorio.',

  'settings.about.version': 'Versión',
  'settings.about.desc': 'Un espacio de trabajo gobernado de dos paneles, local primero, sobre un grafo de conocimiento y recuperación local SQLite KB, con un lienzo de ejecución agnóstico al modelo.',

  // Empty / loading / error states (Slice 10.4)
  'graph.loading': 'Cargando grafo de conocimiento…',
  'graph.empty.title': 'El grafo de conocimiento está vacío',
  'graph.empty.hint': 'Suelta una base de código o documento en este panel para ingerirlo e indexarlo.',
  'graph.noMatch.title': 'Ningún nodo coincide con tu consulta',
  'graph.noMatch.hint': 'Borra la consulta del grafo para volver a mostrar el grafo completo.',

  'chat.empty.title': 'Contexto aislado',
  'chat.empty.hint': 'Esperando entrada: envía un mensaje para comenzar.',
  'chat.thinking': 'Procesando…',

  'tools.empty': 'Sin herramientas registradas',
};
