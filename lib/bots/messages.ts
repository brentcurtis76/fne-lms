// All user-facing Spanish (es-CL) copy and inline keyboards for the expense
// bot. Pure functions only — no I/O — so the engine and tests stay simple.

import {
  BotPendingItemRow,
  DraftReportSummary,
  ExpenseCategoryRow,
  Keyboard,
  NormalizedExtraction
} from './types';
import { encodeId } from './store';

export const LOW_CATEGORY_CONFIDENCE = 0.6;

// --- formatting helpers ------------------------------------------------------

/** Escape Telegram legacy-Markdown control chars in dynamic values. */
export function esc(value: string): string {
  return value.replace(/([_*`[])/g, '\\$1');
}

export function fmtCLP(amount: number): string {
  return `$${Math.round(amount).toLocaleString('es-CL')}`;
}

export function fmtAmount(amount: number, currency: string): string {
  if (currency === 'USD') return `US$ ${amount.toLocaleString('es-CL', { minimumFractionDigits: 2 })}`;
  if (currency === 'EUR') return `€ ${amount.toLocaleString('es-CL', { minimumFractionDigits: 2 })}`;
  return fmtCLP(amount);
}

/** ISO YYYY-MM-DD → DD-MM-YYYY */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

const CATEGORY_EMOJI: Record<string, string> = {
  'alimentación': '🍽',
  'capacitación': '🎓',
  'comunicaciones': '📱',
  'hospedaje': '🏨',
  'materiales': '📦',
  'otros': '📌',
  'servicios': '🔧',
  'tecnología': '💻',
  'transporte': '🚌'
};

export function categoryEmoji(name: string): string {
  return CATEGORY_EMOJI[name.trim().toLowerCase()] ?? '🏷';
}

// --- static copy ---------------------------------------------------------------

export const LINK_PROMPT = `👋 ¡Hola! Soy el bot de rendición de gastos de la Fundación.

Para empezar necesito vincular tu cuenta:
1️⃣ Entra a la plataforma web → *Rendición de Gastos*
2️⃣ Toca *«Conectar Telegram»* y copia el código
3️⃣ Envíame el código aquí (ej: \`A3F9K2M7\`)

El código vence en 15 minutos.`;

export const LINK_BAD = `❌ Ese código no es válido o ya venció. Genera uno nuevo en la plataforma (Rendición de Gastos → Conectar Telegram) y envíamelo.`;

export const LINK_LOCKED = `🔒 Demasiados intentos fallidos. Espera 15 minutos y vuelve a intentarlo con un código nuevo.`;

export const linkOk = (firstName: string) =>
  `✅ ¡Listo, ${esc(firstName)}! Tu cuenta quedó vinculada.\n\nEnvíame una foto de tu boleta y yo me encargo del resto. 📸`;

export const welcome = (firstName: string) => `👋 ¡Hola, ${esc(firstName)}! Envíame una foto de tu boleta o factura y la agrego a tu rendición.

📋 /reportes — ver tus reportes y totales
📨 /enviar — enviar un reporte a aprobación
❓ /ayuda — cómo funciona`;

export const PROCESSING = '🔍 Leyendo tu boleta…';

export const DISCARDED = '🗑 Boleta descartada. No se guardó nada.';

export const queued = (queueCount: number) =>
  `📸 Recibida. La proceso apenas termines con la boleta actual (${queueCount} en cola).`;

export const QUEUE_CLEARED = '🗑 Listo, descarté todas las fotos pendientes.';

export const QUEUE_BUSY = 'Ya hay una boleta en proceso — termina esa primero.';

export const QUEUE_RESUME = '▶️ Continuando con la siguiente boleta…';

export const NEED_AMOUNT = '💵 No pude leer el monto de la boleta. Usa ✏️ Editar → 💵 Monto antes de confirmar.';

export const NEED_DATE = '📅 No pude leer la fecha de la boleta. Usa ✏️ Editar → 📅 Fecha antes de confirmar.';

export const queuePrompt = (queueCount: number) =>
  `Tienes ${queueCount} ${queueCount === 1 ? 'foto pendiente' : 'fotos pendientes'} en cola.`;

export const UNREADABLE = `😕 No pude leer bien la foto. Inténtalo de nuevo con buena luz, la boleta plana y completa en el encuadre. 📸`;

export const NO_PERMISSION = `🔒 Tu cuenta no tiene habilitada la rendición de gastos. Pide acceso a la administración y vuelve a intentarlo.`;

export const NO_CATEGORIES = `⚙️ No hay categorías de gasto configuradas en el sistema. Avísale a la administración; sin categorías no puedo guardar gastos.`;

export const EXPIRED = `⌛ Esta boleta llevaba más de 3 días esperando confirmación, así que la descarté. Reenvíame la foto y la procesamos de nuevo. 📸`;

export const STALE_TOAST = 'Esta boleta ya fue procesada o expiró';

export const NUDGE = `Funciono con fotos y botones 🙂 Envíame una foto de tu boleta, o escribe /ayuda para ver lo que puedo hacer.`;

export const UNSUPPORTED = `Solo puedo procesar fotos o PDF de boletas y facturas. 📸`;

export const FILE_TOO_BIG = `📐 El archivo es muy pesado. Envía la boleta como foto (no como archivo) o un PDF de menos de 10 MB.`;

export const SAVE_ERROR = `😓 Algo falló al guardar el gasto. No se guardó nada — inténtalo de nuevo con el botón ✅, o más tarde.`;

export const REPORT_NOT_EDITABLE = `⚠️ Ese reporte ya no está en borrador, así que no puedo agregarle gastos. Elige otro reporte o crea uno nuevo.`;

export const SUBMIT_NONE = `No tienes borradores para enviar. Envíame una boleta para empezar. 📸`;

export const SUBMIT_EMPTY = `Este reporte aún no tiene gastos. Agrega al menos uno antes de enviarlo.`;

export const SUBMIT_CONFLICT = `⚠️ Ese reporte ya no está en borrador (quizás ya lo enviaste). Revisa /reportes.`;

export const submitOk = (reportName: string) =>
  `🎉 *Reporte enviado.* 📬 La persona aprobadora fue notificada por correo.\n\nRevisa el estado cuando quieras con /reportes.`;

export const CANCELLED = 'Operación cancelada.';

export const NOTHING_PENDING = 'No hay nada pendiente. Envíame una boleta cuando quieras. 📸';

export const ALREADY_LINKED = 'Tu cuenta ya está vinculada ✅ Envíame una foto de tu boleta. 📸';

export const STATUS_EMPTY = 'Aún no tienes reportes. Envíame una foto de una boleta y creamos el primero. 📸';

export const HELP = `❓ *Cómo funciona*

1️⃣ Sácale una foto a tu boleta y envíamela
2️⃣ Reviso los datos y te muestro un resumen
3️⃣ Confirmas con un toque y queda guardada en tu reporte

📋 /reportes — tus reportes y totales
📨 /enviar — enviar un reporte a aprobación
🚫 /cancelar — cancelar lo que esté pendiente
❓ /ayuda — este mensaje

Para ediciones mayores (eliminar gastos, editar reportes enviados) usa la plataforma web.`;

export const saved = (args: {
  amount: number;
  currency: string;
  categoryName: string;
  vendor: string | null;
  reportName: string;
  totalAmount: number;
  itemCount: number;
}) => `✅ *Gasto guardado*

💵 ${fmtAmount(args.amount, args.currency)} · ${categoryEmoji(args.categoryName)} ${esc(args.categoryName)}${args.vendor ? ` · ${esc(args.vendor)}` : ''}
📂 *${esc(args.reportName)}*: ahora *${fmtCLP(args.totalAmount)}* (${args.itemCount} ${args.itemCount === 1 ? 'gasto' : 'gastos'})

Envíame otra boleta cuando quieras. 📸`;

export const notReceipt = (hasData: boolean) =>
  hasData
    ? `🤔 Esto no parece una boleta ni factura, pero detecté un monto. Si me equivoqué, dime:`
    : `🤔 Esto no parece una boleta ni factura. Envíame una foto de un documento de compra. 📸`;

// --- the receipt card ---------------------------------------------------------

export interface CardContext {
  item: BotPendingItemRow;
  receipt: NormalizedExtraction;
  categoryName: string | null;
  drafts: DraftReportSummary[];
  /** Resolved target: a draft summary, 'new', or null (must choose). */
  target: DraftReportSummary | 'new' | null;
  newReportName: string;
  queuePosition?: { index: number; total: number };
  variant: 'main' | 'lowcat' | 'dup' | 'category_grid' | 'report_picker' | 'edit_menu';
  duplicate?: { reportName: string } | null;
  categories?: ExpenseCategoryRow[];
}

export function buildCard(ctx: CardContext): { text: string; keyboard: Keyboard } {
  const P = encodeId(ctx.item.id);
  const r = ctx.receipt;

  const header = ctx.queuePosition && ctx.queuePosition.total > 1
    ? `🧾 *Boleta ${ctx.queuePosition.index} de ${ctx.queuePosition.total}*`
    : `🧾 *Boleta detectada*`;

  const dupBanner = ctx.duplicate
    ? `\n⚠️ *Posible duplicado:* ya guardaste un gasto de ${r.amount !== null ? fmtAmount(r.amount, r.currency) : 'este monto'}${r.vendor ? ` en ${esc(r.vendor)}` : ''}${r.expenseDate ? ` el ${fmtDate(r.expenseDate)}` : ''}${ctx.duplicate.reportName ? ` (reporte *${esc(ctx.duplicate.reportName)}*)` : ''}.\n`
    : '';

  const targetLine =
    ctx.target === 'new'
      ? `📂 Se creará el reporte: *${esc(ctx.newReportName)}*`
      : ctx.target
        ? `📂 Se agregará a: *${esc(ctx.target.report_name)}* (${fmtCLP(ctx.target.total_amount)})`
        : `📂 ¿A qué reporte lo agrego? 👇`;

  const categoryLine =
    ctx.variant === 'lowcat'
      ? `🏷 Categoría: ¿cuál corresponde? 👇`
      : `🏷 Categoría: ${ctx.categoryName ? `${categoryEmoji(ctx.categoryName)} ${esc(ctx.categoryName)}` : '—'}`;

  const text = `${header}
${dupBanner}
🏪 Comercio: ${r.vendor ? esc(r.vendor) : '—'}
📅 Fecha: ${r.expenseDate ? fmtDate(r.expenseDate) : '—'}
💵 Monto: ${r.amount !== null ? `${fmtAmount(r.amount, r.currency)} ${r.currency}` : '—'}
🔢 N° doc: ${r.expenseNumber ? esc(r.expenseNumber) : '—'}
${categoryLine}
📝 Descripción: ${r.description ? esc(r.description) : '—'}
${targetLine}`;

  return { text, keyboard: buildCardKeyboard(ctx, P) };
}

function buildCardKeyboard(ctx: CardContext, P: string): Keyboard {
  switch (ctx.variant) {
    case 'category_grid': {
      const rows: Keyboard = [];
      const cats = ctx.categories ?? [];
      for (let i = 0; i < cats.length; i += 3) {
        rows.push(
          cats.slice(i, i + 3).map((c) => ({
            label: `${categoryEmoji(c.name)} ${c.name}`,
            data: `cs:${P}:${encodeId(c.id)}`
          }))
        );
      }
      rows.push([{ label: '← Volver', data: `bk:${P}` }]);
      return rows;
    }

    case 'report_picker': {
      const rows: Keyboard = ctx.drafts.slice(0, 4).map((d) => [
        { label: `${d.report_name} · ${fmtCLP(d.total_amount)}`, data: `rs:${P}:${encodeId(d.id)}` }
      ]);
      rows.push([{ label: `➕ Nuevo: "${ctx.newReportName}"`, data: `rn:${P}` }]);
      rows.push([{ label: '← Volver', data: `bk:${P}` }]);
      return rows;
    }

    case 'edit_menu':
      return [
        [
          { label: '💵 Monto', data: `ef:${P}:m` },
          { label: '📅 Fecha', data: `ef:${P}:f` },
          { label: '🏪 Comercio', data: `ef:${P}:c` }
        ],
        [
          { label: '🔢 N° doc', data: `ef:${P}:n` },
          { label: '📝 Descripción', data: `ef:${P}:d` },
          { label: '💱 Moneda', data: `ef:${P}:$` }
        ],
        [{ label: '← Volver', data: `bk:${P}` }]
      ];

    case 'lowcat': {
      const guesses = ctx.receipt.categoryGuesses.slice(0, 3);
      const rows: Keyboard = [
        guesses.map((g) => ({
          label: `${categoryEmoji(g.name)} ${g.name}`,
          data: `cs:${P}:${encodeId(g.categoryId)}`
        }))
      ];
      rows.push([{ label: '🏷 Ver todas', data: `cg:${P}` }]);
      rows.push([{ label: '🗑 Descartar', data: `x:${P}` }]);
      return rows;
    }

    case 'dup':
      return [
        [{ label: '💾 Guardar igual', data: `dx:${P}` }],
        [
          { label: '🏷 Categoría', data: `cg:${P}` },
          { label: '📂 Reporte', data: `rg:${P}` }
        ],
        [
          { label: '✏️ Editar', data: `em:${P}` },
          { label: '🗑 Descartar', data: `x:${P}` }
        ]
      ];

    case 'main':
    default: {
      const rows: Keyboard = [];
      if (ctx.target === 'new') {
        rows.push([{ label: '✅ Confirmar y crear reporte', data: `ok:${P}:n` }]);
      } else if (ctx.target) {
        rows.push([{ label: '✅ Confirmar', data: `ok:${P}` }]);
      } else {
        // 2+ drafts: choosing the report IS the confirm.
        for (const d of ctx.drafts.slice(0, 4)) {
          rows.push([
            { label: `💾 ${d.report_name} · ${fmtCLP(d.total_amount)}`, data: `ok:${P}:${encodeId(d.id)}` }
          ]);
        }
        rows.push([{ label: '➕ Nuevo reporte', data: `ok:${P}:n` }]);
      }
      rows.push([
        { label: '🏷 Categoría', data: `cg:${P}` },
        { label: '📂 Reporte', data: `rg:${P}` }
      ]);
      rows.push([
        { label: '✏️ Editar', data: `em:${P}` },
        { label: '🗑 Descartar', data: `x:${P}` }
      ]);
      return rows;
    }
  }
}

export function notReceiptKeyboard(itemId: string): Keyboard {
  const P = encodeId(itemId);
  return [
    [
      { label: '✅ Usar igual', data: `ur:${P}` },
      { label: '🗑 Descartar', data: `x:${P}` }
    ]
  ];
}

export function queueKeyboard(): Keyboard {
  return [
    [
      { label: '▶️ Continuar', data: 'qn' },
      { label: '🗑 Descartar todas', data: 'qx' }
    ]
  ];
}

// --- edit prompts ----------------------------------------------------------------

export const EDIT_PROMPTS: Record<string, string> = {
  m: '💵 Escríbeme el monto correcto, solo números (ej: 12490):',
  f: '📅 Escríbeme la fecha correcta en formato dd-mm-aaaa (ej: 05-06-2026):',
  c: '🏪 Escríbeme el nombre del comercio:',
  n: '🔢 Escríbeme el número de la boleta o factura:',
  d: '📝 Escríbeme una breve descripción del gasto:'
};

export const EDIT_INVALID_HINTS: Record<string, string> = {
  m: 'Debe ser un número mayor que cero, sin puntos ni símbolos (ej: 12490)',
  f: 'Usa el formato dd-mm-aaaa y una fecha que no sea futura (ej: 05-06-2026)',
  c: 'Escríbeme un nombre de hasta 100 caracteres',
  n: 'Escríbeme un número de documento de hasta 50 caracteres',
  d: 'Escríbeme una descripción de hasta 200 caracteres'
};

export const editInvalid = (field: string) =>
  `🤔 No entendí ese valor. ${EDIT_INVALID_HINTS[field] ?? ''}. O usa /cancelar para volver.`;

export function currencyKeyboard(itemId: string): Keyboard {
  const P = encodeId(itemId);
  return [
    [
      { label: 'CLP', data: `cu:${P}:CLP` },
      { label: 'US$', data: `cu:${P}:USD` },
      { label: '€', data: `cu:${P}:EUR` }
    ],
    [{ label: '← Volver', data: `bk:${P}` }]
  ];
}

// --- status & submit -----------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  submitted: 'esperando aprobación',
  approved: 'aprobado',
  rejected: 'rechazado'
};

export function statusMessage(groups: {
  drafts: DraftReportSummary[];
  submitted: DraftReportSummary[];
  decided: DraftReportSummary[];
}): string {
  const lines: string[] = ['📋 *Tus reportes*'];

  if (groups.drafts.length > 0) {
    lines.push('', '📝 *Borradores*');
    for (const r of groups.drafts) {
      lines.push(`• ${esc(r.report_name)} — ${fmtCLP(r.total_amount)} · ${r.item_count} ${r.item_count === 1 ? 'gasto' : 'gastos'}`);
    }
  }
  if (groups.submitted.length > 0) {
    lines.push('', '📨 *Enviados*');
    for (const r of groups.submitted) {
      lines.push(`• ${esc(r.report_name)} — ${fmtCLP(r.total_amount)} · esperando aprobación`);
    }
  }
  if (groups.decided.length > 0) {
    lines.push('', '✅ *Resueltos (últimos 3)*');
    for (const r of groups.decided) {
      lines.push(`• ${esc(r.report_name)} — ${fmtCLP(r.total_amount)} · ${STATUS_LABELS[r.status] ?? r.status}`);
    }
  }

  lines.push('', 'Para enviar un borrador a aprobación: /enviar');
  return lines.join('\n');
}

export function submitPickMessage(): string {
  return '📨 ¿Qué reporte quieres enviar a aprobación?';
}

export function submitPickKeyboard(drafts: DraftReportSummary[]): Keyboard {
  const rows: Keyboard = drafts.slice(0, 8).map((d) => [
    {
      label: `${d.report_name} · ${fmtCLP(d.total_amount)} · ${d.item_count} ${d.item_count === 1 ? 'gasto' : 'gastos'}`,
      data: `sb:${encodeId(d.id)}`
    }
  ]);
  rows.push([{ label: '← Cancelar', data: 'sx' }]);
  return rows;
}

export function submitConfirmMessage(report: DraftReportSummary, startDate: string, endDate: string): string {
  return `📨 *Enviar a aprobación*

📂 ${esc(report.report_name)}
📅 ${fmtDate(startDate)} – ${fmtDate(endDate)}
🧾 ${report.item_count} ${report.item_count === 1 ? 'gasto' : 'gastos'}
💵 Total: ${fmtCLP(report.total_amount)} CLP

Una vez enviado no podrás agregarle más gastos.`;
}

export function submitConfirmKeyboard(reportId: string): Keyboard {
  return [
    [
      { label: '✅ Enviar', data: `sb!:${encodeId(reportId)}` },
      { label: '← Cancelar', data: 'sx' }
    ]
  ];
}
