/**
 * Variable interpolation for content block text.
 * Replaces {{variable}} placeholders with snapshot data at build time.
 *
 * Available variables:
 *   {{school_name}}      — School name (e.g., "Colegio San Ignacio")
 *   {{program_year}}     — Program year (e.g., "2026")
 *   {{service_name}}     — Service name from ficha
 *   {{total_hours}}      — Total program hours
 *   {{client_name}}      — Client trade name (falls back to school name)
 *   {{representative}}   — Client legal representative name
 *   {{destinatarios}}    — Target audience (comma-separated)
 *   {{city}}             — Client city
 *   {{comuna}}           — Client municipality
 *   {{school_code}}      — School code
 */

interface InterpolationContext {
  schoolName: string;
  programYear: number;
  serviceName: string;
  totalHours: number;
  destinatarios?: string[];
  cliente?: {
    nombreFantasia: string;
    nombreRepresentante: string;
    ciudad: string | null;
    comuna: string | null;
  } | null;
  schoolCode?: string | null;
}

function buildVariableMap(ctx: InterpolationContext): Record<string, string> {
  return {
    '{{school_name}}': ctx.schoolName,
    '{{program_year}}': String(ctx.programYear),
    '{{service_name}}': ctx.serviceName,
    '{{total_hours}}': String(ctx.totalHours),
    '{{client_name}}': ctx.cliente?.nombreFantasia ?? ctx.schoolName,
    '{{representative}}': ctx.cliente?.nombreRepresentante ?? '',
    '{{destinatarios}}': (ctx.destinatarios ?? []).join(', '),
    '{{city}}': ctx.cliente?.ciudad ?? '',
    '{{comuna}}': ctx.cliente?.comuna ?? '',
    '{{school_code}}': ctx.schoolCode ?? '',
  };
}

function replaceVariables(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [placeholder, value] of Object.entries(vars)) {
    if (result.includes(placeholder)) {
      result = result.split(placeholder).join(value);
    }
  }
  return result;
}

export interface ContentSection {
  type: string;
  text?: string;
  items?: string[];
  path?: string;
  level?: number;
}

export interface ContentBlock {
  key: string;
  titulo: string;
  contenido: { sections: ContentSection[] } | Record<string, unknown>;
  imagenes?: unknown[] | null;
}

/**
 * Interpolates {{variable}} placeholders in content block text and list items.
 * Returns new content blocks with interpolated text (does not mutate input).
 */
export function interpolateContentBlocks(
  blocks: ContentBlock[],
  ctx: InterpolationContext
): ContentBlock[] {
  const vars = buildVariableMap(ctx);

  return blocks.map((block) => {
    const contenido = block.contenido as { sections?: ContentSection[] };
    if (!contenido.sections) return block;

    const sections = contenido.sections.map((section) => {
      const result = { ...section };
      if (result.text) {
        result.text = replaceVariables(result.text, vars);
      }
      if (result.items) {
        result.items = result.items.map((item) => replaceVariables(item, vars));
      }
      return result;
    });

    return {
      ...block,
      contenido: { ...contenido, sections },
    };
  });
}
