// Redesign inventory — reads one source file and lists what it offers.
// No type checker and no build: the file is parsed once and walked.
// Used by scripts/redesign/inventory.mjs. See docs/plan/redesign/inventory/README.md.
import ts from 'typescript';

const SK = ts.SyntaxKind;

const CHART_TAGS = new Set([
  'BarChart', 'LineChart', 'AreaChart', 'PieChart', 'RadarChart', 'ComposedChart',
  'ScatterChart', 'RadialBarChart', 'Treemap', 'FunnelChart', 'Sankey',
]);
const SERIES_TAGS = new Set(['Bar', 'Line', 'Area', 'Pie', 'Radar', 'Scatter', 'RadialBar', 'Funnel']);
const OWNER_TAGS = new Set(['button', 'a', 'Link', 'NextLink', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'th', 'option', 'label', 'Button', 'legend', 'summary']);
const FIELD_TAGS = new Set(['input', 'textarea', 'select', 'Input', 'Textarea', 'Select', 'Checkbox', 'Switch']);
const POPUP_RE = /(Modal|Dialog|Drawer|Popover|Sheet|Lightbox)(V\d+)?$/;
const SKIP_PROPS = new Set([
  'className', 'class', 'style', 'variant', 'size', 'color', 'type', 'id', 'key', 'name', 'mode', 'position',
  'align', 'side', 'href', 'src', 'icon', 'as', 'target', 'rel', 'method', 'role', 'htmlFor', 'width', 'height',
  'fill', 'stroke', 'dataKey', 'layout', 'autoComplete', 'inputMode', 'accept', 'currentPage', 'd', 'viewBox',
  'strokeLinecap', 'strokeLinejoin', 'xmlns', 'fillRule', 'clipRule', 'value', 'defaultValue', 'ref', 'tabIndex',
  'stackId', 'yAxisId', 'xAxisId', 'nameKey', 'testId', 'pattern', 'lang', 'dir', 'loading', 'crossOrigin',
  'containerClassName', 'wrapperClassName', 'iconClassName', 'format', 'locale', 'theme', 'direction', 'field',
]);
const TOAST_FN = /^(toast(\.(success|error|loading|warn|info|custom|promise))?|toastSuccess|toastError|toastInfo|toastLoading|toastPromise|notifyError|notifySuccess|showToast|showError|showSuccess)$/;
const MSG_SETTER = /^set[A-Z]?\w*(Error|Message|Success|Warning|Notice|Feedback|Msg)\w*$/;
const ACCESS_CALL = /(^|\.)(hasRole|getUserRoles|getHighestRole|getUserPrimaryRole|checkUserAccess|hasPermission|hasAnyPermission|hasAllPermissions|isGlobalAdmin|hasAdminPrivileges|metadataHasRole|checkIsAdmin|getEffectiveRoleAndStatus|checkProfileCompletion|getServerSession)$/;
const ACCESS_VAR = /^(ALLOWED_ROLES|allowedRoles|isAdmin|hasAccess|canAccess|canEdit|canView|canManage|isAuthorized|accessDenied|authorized|isReadOnly|readOnly)$/;
const DENIAL_TEXT = /acceso denegado|no tienes permiso|sin autorizaci[oó]n|no autorizado|no tiene acceso|no tienes acceso|acceso restringido|solo (los )?administradores/i;
const EVENTS = ['onKeyDown', 'onKeyUp', 'onKeyPress', 'onDrop', 'onDragOver', 'onDragStart', 'onDragEnd', 'onDragEnter', 'onDragLeave', 'onPaste', 'onDoubleClick', 'onContextMenu', 'onMouseEnter', 'onMouseLeave', 'onMouseDown', 'onScroll', 'onBlur', 'onFocus', 'onTouchStart', 'onTouchEnd', 'onWheel', 'onInput'];
const MEDIA_TAGS = new Set(['iframe', 'video', 'audio', 'canvas', 'embed', 'object', 'img', 'Image']);
const RESP_RE = /(?:^|[\s'"`])((?:(?:sm|md|lg|xl|2xl):)?(?:hidden|sr-only)|(?:sm|md|lg|xl|2xl):(?:block|flex|inline|inline-flex|inline-block|grid|table-cell|table-row))(?=[\s'"`]|$)/g;
const LIST_SKIP = /^(id|key|value|href|icon|color|className|class|type|variant|size|path|url|route|slug|code|field|accessor|dataKey|name_key|table|column|bucket|method|role|permission|mime|format|locale|event|status|category|kind|action|tag|testId|src|image|img|bg|bgColor|textColor|borderColor|iconColor|style|gradient|fill|stroke)$/;
const DB_OPS = new Set(['select', 'insert', 'update', 'delete', 'upsert', 'upload', 'download', 'remove', 'createSignedUrl', 'getPublicUrl', 'list', 'move', 'copy']);

const squash = (s) => s.replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const hasLetters = (s) => /[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(s);

function looksHuman(s) {
  if (!s || !hasLetters(s) || s.length < 2) return false;
  if (/^[\/#.@]/.test(s) || /^https?:/.test(s)) return false;
  const tokens = s.split(/\s+/);
  const classy = tokens.filter((t) => /^[a-z0-9_:\[\]\/#.%()-]+$/.test(t) && /[-:\[_]/.test(t)).length;
  if (classy * 2 > tokens.length) return false;
  if (tokens.length === 1) {
    // one word: keep "Guardar", "PDF", "Sí"; drop ids, keys, css words, mime types, header names
    if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Bearer|UTC|ASC|DESC|NULL)$/.test(s)) return false;
    return /^[¿¡]?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+[.:!?…]*$/.test(s) || /^[A-ZÁÉÍÓÚÑ]{2,12}$/.test(s);
  }
  return true;
}

export function extractFile(rel, text) {
  const kind = /\.(tsx|jsx|broken)$/.test(rel) ? ts.ScriptKind.TSX : /\.(js|mjs)$/.test(rel) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  const rows = [];
  const imports = [];
  const apiRefs = [];
  const dbRefs = []; // { what: "table:x" | "rpc:x" | "bucket:x", ops, top }
  const idRefs = new Set();
  const flags = { ssr: false, staticProps: false, usesMainLayout: false, usesLegacyHeader: false, lines: text.split('\n').length };
  const labelFor = new Map();
  const storageKeys = new Set();
  const queryKeys = new Set();
  const pathRefs = [];
  const localNames = new Set();
  for (const st of sf.statements) if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && /^(\.|@\/)/.test(st.moduleSpecifier.text) && st.importClause && !st.importClause.isTypeOnly) {
    if (st.importClause.name) localNames.add(st.importClause.name.text);
    const nb = st.importClause.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) localNames.add(el.name.text);
  }
  for (const m of text.matchAll(/const\s+(\w+)\s*=\s*dynamic\(/g)) localNames.add(m[1]);
  const returns = new Map(); // function name -> texts it returns
  // Chart tags count only when they come from recharts (lucide has icons named BarChart, PieChart…).
  const chartNames = new Set();
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]recharts['"]/g)) for (const part of m[1].split(',')) { const nm = part.trim().split(/\s+as\s+/).pop(); if (nm) chartNames.add(nm.trim()); }
  for (const m of text.matchAll(/const\s+(\w+)\s*=\s*dynamic\([^;]*?import\(\s*['"]recharts['"]\s*\)/g)) chartNames.add(m[1]);

  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const src = (n, max = 90) => cut(squash(n.getText(sf)), max);
  const add = (row) => { rows.push(row); return row; };

  const tagOf = (n) => (ts.isJsxElement(n) ? n.openingElement.tagName.getText(sf) : n.tagName.getText(sf));
  const attrsOf = (n) => {
    const el = ts.isJsxElement(n) ? n.openingElement : n;
    const out = {};
    for (const a of el.attributes.properties) {
      if (!ts.isJsxAttribute(a)) continue;
      const name = a.name.getText(sf);
      if (!a.initializer) out[name] = { lit: 'true', node: null };
      else if (ts.isStringLiteral(a.initializer)) out[name] = { lit: a.initializer.text, node: a.initializer };
      else if (ts.isJsxExpression(a.initializer) && a.initializer.expression) {
        const e = a.initializer.expression;
        if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) out[name] = { lit: e.text, node: e };
        else out[name] = { expr: src(e, 80), node: e };
      }
    }
    return out;
  };
  const val = (a) => (a ? (a.lit !== undefined ? a.lit : `{${a.expr}}`) : undefined);

  // A template literal as text: static parts kept, each ${…} shown short.
  function template(n, hole) {
    if (ts.isNoSubstitutionTemplateLiteral(n) || ts.isStringLiteral(n)) return n.text;
    let out = n.head.text;
    for (const span of n.templateSpans) out += (hole ?? `{${src(span.expression, 28)}}`) + span.literal.text;
    return out;
  }
  const hasJsx = (n) => {
    let found = false;
    const walk = (x) => { if (found) return; if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) { found = true; return; } ts.forEachChild(x, walk); };
    walk(n);
    return found;
  };

  // Text a person reads inside a node (children of an element, or an expression).
  function collectText(n, out, icons) {
    if (!n) return;
    if (ts.isJsxText(n)) { const t = squash(n.text); if (t) out.push(t); return; }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) { if (squash(n.text)) out.push(squash(n.text)); return; }
    if (ts.isTemplateExpression(n)) { out.push(squash(template(n))); return; }
    if (ts.isJsxExpression(n)) { collectText(n.expression, out, icons); return; }
    if (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n)) { collectText(n.expression, out, icons); return; }
    if (ts.isConditionalExpression(n)) {
      const a = []; const b = [];
      collectText(n.whenTrue, a, icons); collectText(n.whenFalse, b, icons);
      const parts = [a.join(' '), b.join(' ')].filter(Boolean);
      if (parts.length) out.push(parts.join(' / '));
      return;
    }
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      if (op === SK.AmpersandAmpersandToken) { const a = []; collectText(n.right, a, icons); if (a.length) out.push(`[${a.join(' ')}]`); return; }
      if (op === SK.BarBarToken || op === SK.QuestionQuestionToken) {
        const a = []; const b = [];
        collectText(n.left, a, icons); collectText(n.right, b, icons);
        const parts = [a.join(' '), b.join(' ')].filter(Boolean);
        if (parts.length) out.push(parts.join(' / '));
        return;
      }
      if (op === SK.PlusToken) {
        const a = []; collectText(n.left, a, icons); collectText(n.right, a, icons);
        if (a.some((x) => !/^\{.*\}$/.test(x))) out.push(...a); else out.push(`{${src(n, 36)}}`);
        return;
      }
      if (/^[-*/%]$/.test(n.operatorToken.getText(sf))) out.push(`{${src(n, 36)}}`);
      return;
    }
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) { for (const c of n.children) collectText(c, out, icons); return; }
    if (ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sf);
      if (tag === 'img') { const a = attrsOf(n); if (a.alt && a.alt.lit) out.push(`[img: ${a.alt.lit}]`); }
      else if (/^[A-Z]/.test(tag) && icons) icons.push(tag);
      return;
    }
    if (ts.isIdentifier(n) || ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
      if (n.getText(sf) !== 'null' && n.getText(sf) !== 'undefined') out.push(`{${src(n, 36)}}`);
      return;
    }
    if (ts.isCallExpression(n)) {
      if (hasJsx(n)) { const walk = (x) => { if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) collectText(x, out, icons); else ts.forEachChild(x, walk); }; ts.forEachChild(n, walk); }
      else out.push(`{${src(n, 36)}}`);
      return;
    }
  }
  function textOf(n) {
    const out = []; const icons = [];
    if (ts.isJsxElement(n)) for (const c of n.children) collectText(c, out, icons);
    let t = squash(out.join(' '));
    if (!t && icons.length) t = `[icon ${icons[0]}]`;
    return cut(t, 240);
  }
  // Literal texts of an expression used as a message (toast, confirm, alert, setError).
  function messageText(n) {
    if (!n) return '';
    const out = [];
    const walk = (x) => {
      if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) { if (hasLetters(x.text)) out.push(squash(x.text)); return; }
      if (ts.isTemplateExpression(x)) { out.push(squash(template(x))); return; }
      if (ts.isConditionalExpression(x)) { walk(x.whenTrue); walk(x.whenFalse); return; }
      if (ts.isBinaryExpression(x)) { if (/[=<>]/.test(x.operatorToken.getText(sf))) return; walk(x.left); walk(x.right); return; }
      if (ts.isParenthesizedExpression(x) || ts.isAsExpression(x)) { walk(x.expression); return; }
      if (ts.isObjectLiteralExpression(x)) { for (const p of x.properties) if (ts.isPropertyAssignment(p) && !/^(id|icon|duration|position|style|className)$/.test(p.name.getText(sf))) walk(p.initializer); return; }
      if (ts.isArrowFunction(x)) { if (!ts.isBlock(x.body)) walk(x.body); return; }
      if (ts.isJsxElement(x) || ts.isJsxFragment(x)) { const t = []; collectText(x, t); if (t.length) out.push(squash(t.join(' '))); return; }
    };
    walk(n);
    return cut(out.length ? out.join(' / ') : `{${src(n, 70)}}`, 300);
  }
  // A path as written in code: `/a/${id}/b` -> /a/[*]/b
  function pathText(n) {
    if (!n) return null;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if (ts.isTemplateExpression(n)) return template(n, '\u0000');
    if (ts.isObjectLiteralExpression(n)) {
      for (const p of n.properties) if (ts.isPropertyAssignment(p) && p.name.getText(sf) === 'pathname') return pathText(p.initializer);
      return null;
    }
    if (ts.isConditionalExpression(n)) return pathText(n.whenTrue) || pathText(n.whenFalse);
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === SK.PlusToken) { const l = pathText(n.left); return l ? l + '\u0000' : null; }
    return null;
  }

  function label(n, a) {
    if (a.id && a.id.lit && labelFor.has(a.id.lit)) return labelFor.get(a.id.lit);
    let p = n.parent; let depth = 0;
    while (p && depth < 4) {
      if (ts.isJsxElement(p)) {
        depth++;
        if (tagOf(p) === 'label') return textOf(p);
        for (const c of p.children) if (ts.isJsxElement(c) && (tagOf(c) === 'label' || tagOf(c) === 'Label') && c !== n) { const t = textOf(c); if (t) return t; }
      }
      p = p.parent;
    }
    return '';
  }

  function propTexts(n) {
    const el = ts.isJsxElement(n) ? n.openingElement : n;
    const out = [];
    for (const a of el.attributes.properties) {
      if (!ts.isJsxAttribute(a) || !a.initializer) continue;
      const name = a.name.getText(sf);
      if (SKIP_PROPS.has(name) || name.startsWith('data-') || /^on[A-Z]/.test(name) || /ClassName$/.test(name)) continue;
      const found = [];
      const walk = (x, key) => {
        if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) { if (looksHuman(x.text) || (x === a.initializer && x.text)) found.push(squash(x.text)); return; }
        if (ts.isTemplateExpression(x)) { const t = squash(template(x)); if (looksHuman(t)) found.push(t); return; }
        if (ts.isArrowFunction(x) || ts.isFunctionExpression(x) || ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) return;
        if (ts.isCallExpression(x)) return;
        if (ts.isPropertyAssignment(x)) { const k = x.name.getText(sf); if (SKIP_PROPS.has(k) || /^on[A-Z]/.test(k)) return; walk(x.initializer, k); return; }
        if (ts.isBinaryExpression(x) && /===|!==|==|!=/.test(x.operatorToken.getText(sf))) return;
        if (ts.isConditionalExpression(x)) { walk(x.whenTrue); walk(x.whenFalse); return; }
        ts.forEachChild(x, (c) => walk(c, key));
      };
      walk(a.initializer);
      if (found.length) out.push(`${name}: ${found.join(' / ')}`);
    }
    return out;
  }

  // First pass: labels by htmlFor, id references, and names that stand for a fixed text (const x = `a-${b}`).
  const constText = new Map();
  (function pre(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer) || ts.isTemplateExpression(n.initializer))) {
      const t = template(n.initializer);
      if (t.length <= 80) constText.set(n.name.text, t);
    }
    if (ts.isJsxElement(n) && (tagOf(n) === 'label' || tagOf(n) === 'Label')) {
      const a = attrsOf(n);
      if (a.htmlFor && a.htmlFor.lit) labelFor.set(a.htmlFor.lit, textOf(n));
    }
    if (ts.isJsxAttribute(n) && /^(htmlFor|aria-labelledby|aria-describedby|aria-controls)$/.test(n.name.getText(sf)) && n.initializer && ts.isStringLiteral(n.initializer)) {
      for (const id of n.initializer.text.split(/\s+/)) idRefs.add(id);
    }
    ts.forEachChild(n, pre);
  })(sf);

  const whenOf = (ctx) => { const c = ctx.when.slice(-4); return c.length > 1 ? c.map((x) => (/\|\|/.test(x) ? `(${x})` : x)).join(' && ') : c.join(''); };
  const push = (ctx, cond) => ({ ...ctx, when: [...ctx.when, cond] });
  const base = (n, ctx) => {
    const r = { line: line(n) };
    if (ctx.fn) r.in = ctx.fn;
    if (ctx.top) r.top = ctx.top;
    const w = whenOf(ctx); if (w) r.when = w;
    if (ctx.resp && ctx.resp.length) r.screen = [...new Set(ctx.resp)].join(' ');
    return r;
  };

  function handleJsx(n, ctx) {
    const tag = tagOf(n);
    const a = attrsOf(n);
    const b = base(n, ctx);
    const hook = {};
    const named = (x) => (x.node && ts.isIdentifier(x.node) && constText.has(x.node.text) ? constText.get(x.node.text) : x.node && ts.isTemplateExpression(x.node) ? template(x.node) : val(x));
    if (a['data-testid']) hook.testid = named(a['data-testid']);
    if (a['data-tour']) hook.tour = named(a['data-tour']);
    if (a.id && a.id.lit) hook.id = a.id.lit;
    else if (a.id && a.id.node && (ts.isTemplateExpression(a.id.node) || (ts.isIdentifier(a.id.node) && constText.has(a.id.node.text)))) hook.id = named(a.id);
    const withHook = (r) => (Object.keys(hook).length ? { ...r, hook } : r);
    const role = a.role && a.role.lit;
    const cls = (a.className && (a.className.lit || a.className.expr)) || '';
    const lower = /^[a-z]/.test(tag);
    let emitted = false;
    const start = rows.length;
    const also = EVENTS.filter((k) => a[k]);

    if (tag === 'MainLayout') flags.usesMainLayout = true;

    if (CHART_TAGS.has(tag) && chartNames.has(tag)) {
      const series = [];
      const walk = (x, mapped) => {
        if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && x.expression.name.text === 'map') { ts.forEachChild(x, (c) => walk(c, true)); return; }
        if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x)) {
          const t = tagOf(x);
          if (SERIES_TAGS.has(t) && (chartNames.has(t) || chartNames.size === 0)) {
            const sa = attrsOf(x);
            let cells = 0; let cellsMapped = false;
            const cw = (y, m) => { if (ts.isCallExpression(y) && ts.isPropertyAccessExpression(y.expression) && y.expression.name.text === 'map') { ts.forEachChild(y, (c) => cw(c, true)); return; } if ((ts.isJsxElement(y) || ts.isJsxSelfClosingElement(y)) && tagOf(y) === 'Cell') { cells++; if (m) cellsMapped = true; } ts.forEachChild(y, (c) => cw(c, m)); };
            ts.forEachChild(x, (c) => cw(c, false));
            series.push({ tag: t, dataKey: val(sa.dataKey), name: val(sa.name), fill: val(sa.fill) || val(sa.stroke), stackId: val(sa.stackId), mapped: !!mapped, ...(cells ? { cells: cellsMapped ? 'one colour per data row' : cells } : {}) });
          }
        }
        ts.forEachChild(x, (c) => walk(c, mapped));
      };
      ts.forEachChild(n, (c) => walk(c, false));
      add({ kind: 'chart', ...b, text: tag, series });
      emitted = true;
    } else if (tag === 'button' || tag === 'Button' || tag === 'IconButton') {
      const text = textOf(n) || val(a['aria-label']) || val(a.title) || '';
      add(withHook({ kind: role === 'tab' ? 'tab' : 'button', ...b, text, ...(a.onClick ? { action: val(a.onClick) } : {}), ...(a.type && a.type.lit === 'submit' ? { submit: true } : {}), ...(a.disabled ? { disabled: val(a.disabled) } : {}), ...(a['aria-label'] ? { aria: val(a['aria-label']) } : {}), ...(a.title ? { title: val(a.title) } : {}) }));
      emitted = true;
    } else if (tag === 'a' || tag === 'Link' || tag === 'NextLink') {
      const hrefNode = a.href && a.href.node;
      const p = hrefNode ? pathText(hrefNode) : null;
      const target = p !== null ? p.replace(/\u0000/g, '[*]') : val(a.href) || '';
      const text = textOf(n) || val(a['aria-label']) || val(a.title) || '';
      add(withHook({ kind: role === 'tab' ? 'tab' : 'link', ...b, text, target, ...(a.onClick ? { action: val(a.onClick) } : {}), ...(a.target ? { newTab: true } : {}), ...(a.download ? { download: true } : {}) }));
      if (a.download) add({ kind: 'download', ...b, text: `<a download> ${text}`, how: 'link with download' });
      emitted = true;
    } else if (FIELD_TAGS.has(tag)) {
      const type = tag === 'input' || tag === 'Input' ? (a.type ? val(a.type) : 'text') : tag.toLowerCase();
      if (type === 'hidden') { emitted = true; }
      else {
        let options;
        if (tag === 'select' && ts.isJsxElement(n)) {
          options = [];
          const walk = (x, mapped) => {
            if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && x.expression.name.text === 'map') { ts.forEachChild(x, (c) => walk(c, true)); return; }
            if (ts.isJsxElement(x) && tagOf(x) === 'option') { options.push(mapped ? `(lista) ${textOf(x)}` : textOf(x)); return; }
            ts.forEachChild(x, (c) => walk(c, mapped));
          };
          for (const c of n.children) walk(c, false);
        }
        add(withHook({ kind: 'field', ...b, text: label(n, a) || val(a['aria-label']) || val(a.placeholder) || val(a.name) || '', type, ...(a.name ? { name: val(a.name) } : {}), ...(a.placeholder ? { placeholder: val(a.placeholder) } : {}), ...(a['aria-label'] ? { aria: val(a['aria-label']) } : {}), ...(a.required ? { required: val(a.required) } : {}), ...(a.disabled ? { disabled: val(a.disabled) } : {}), ...(a.accept ? { accept: val(a.accept) } : {}), ...(['maxLength', 'minLength', 'min', 'max', 'step', 'pattern', 'rows', 'multiple', 'readOnly'].some((k) => a[k]) ? { limits: ['maxLength', 'minLength', 'min', 'max', 'step', 'pattern', 'multiple', 'readOnly'].filter((k) => a[k]).map((k) => `${k}=${val(a[k])}`).join(' ') } : {}), ...(a.onChange ? { action: val(a.onChange) } : {}), ...(options && options.length ? { options } : {}) }));
        emitted = true;
      }
    } else if (MEDIA_TAGS.has(tag)) {
      add(withHook({ kind: 'media', ...b, text: [tag, val(a.alt) ? `alt ${val(a.alt)}` : '', val(a.title), val(a.src)].filter(Boolean).join(' · ') }));
      emitted = true;
    } else if (tag === 'Tab' || tag === 'TabsTrigger') {
      add(withHook({ kind: 'tab', ...b, text: ts.isJsxElement(n) ? textOf(n) : '' }));
      emitted = true;
    } else if (/^h[1-6]$/.test(tag)) {
      const text = textOf(n);
      if (text) add(withHook({ kind: 'heading', ...b, text, level: Number(tag[1]) }));
      emitted = true;
    } else if (tag === 'th') {
      const text = textOf(n);
      if (text) add({ kind: 'column', ...b, text });
      emitted = true;
    } else if (tag === 'label' || tag === 'Label' || tag === 'legend' || tag === 'summary') {
      const text = textOf(n);
      if (text) add({ kind: 'label', ...b, text, ...(a.htmlFor ? { for: val(a.htmlFor) } : {}) });
      emitted = true;
    } else if (tag === 'form') {
      add(withHook({ kind: 'form', ...b, text: a.onSubmit ? val(a.onSubmit) : '(sin onSubmit)' }));
      emitted = true;
    } else if (tag === 'option') {
      emitted = true;
    } else if (role === 'tab' || role === 'menuitem') {
      add(withHook({ kind: 'tab', ...b, text: (ts.isJsxElement(n) ? textOf(n) : '') || val(a['aria-label']) || '', ...(a.onClick ? { action: val(a.onClick) } : {}) }));
      emitted = true;
    } else if (role === 'dialog' || role === 'alertdialog' || (lower && /\bfixed\b[^"']*\binset-0\b/.test(cls) && ts.isJsxElement(n))) {
      let title = '';
      const walk = (x) => { if (title) return; if (ts.isJsxElement(x) && /^h[1-6]$/.test(tagOf(x))) { title = textOf(x); return; } ts.forEachChild(x, walk); };
      walk(n);
      add(withHook({ kind: 'popup', ...b, text: title || val(a['aria-label']) || '(sin título)', how: 'written in this file', ...(a['aria-labelledby'] ? { labelledby: val(a['aria-labelledby']) } : {}) }));
      emitted = true;
    } else if (!lower && (POPUP_RE.test(tag) || (localNames.has(tag) && (a.isOpen || a.open || a.show || a.visible || a.isVisible)))) {
      const open = a.isOpen || a.open || a.show || a.visible || a.isVisible;
      const pt = propTexts(n);
      add(withHook({ kind: 'popup', ...b, text: tag, how: 'component', ...(open ? { open: val(open) } : {}), ...(pt.length ? { props: pt.join(' · ') } : {}) }));
      emitted = true;
    }

    if (!emitted) {
      if (a.onClick) {
        const text = (ts.isJsxElement(n) ? textOf(n) : '') || val(a['aria-label']) || val(a.title) || '';
        add(withHook({ kind: 'clickable', ...b, text: cut(text, 120), tag, action: val(a.onClick) }));
        emitted = true;
      }
      if (!lower) {
        const pt = propTexts(n);
        if (pt.length || localNames.has(tag.split('.')[0])) { add(withHook({ kind: 'piece', ...b, text: pt.join(' · '), tag })); emitted = true; }
      } else {
        for (const k of ['title', 'aria-label', 'placeholder', 'alt']) if (a[k] && a[k].lit && looksHuman(a[k].lit) && !a.onClick) add({ kind: 'text', ...b, text: a[k].lit, attr: k });
      }
      if (!emitted && lower && role && !a.onClick) add({ kind: 'hook', ...b, text: `role=${role}${a['aria-live'] ? ' aria-live=' + val(a['aria-live']) : ''}`, type: 'role', tag });
      if (!emitted && Object.keys(hook).length) add({ kind: 'hook', ...b, text: Object.entries(hook).map(([k, v]) => `${k}=${v}`).join(' '), type: 'mark', tag });
    }
    {
      const mine = rows.slice(start).filter((r) => r.kind !== 'text' && r.kind !== 'download');
      if (mine.length) {
        if (a['aria-label'] && !mine[0].aria && val(a['aria-label']) !== mine[0].text) mine[0].aria = val(a['aria-label']);
        if (a.title && lower && !mine[0].title && val(a.title) !== mine[0].text) mine[0].title = val(a.title);
      } else if (lower) for (const k of ['aria-label', 'title']) if (a[k] && a[k].expr && /[`'"]/.test(a[k].expr)) add({ kind: 'text', ...b, text: messageText(a[k].node), attr: k });
    }
    if (also.length) {
      const mine = rows.slice(start).filter((r) => r.kind !== 'text' && r.kind !== 'download');
      const words = also.map((k) => `${k}=${val(a[k])}`).join(' · ');
      if (mine.length) mine[0].also = words; else add({ kind: 'gesture', ...b, text: words, tag });
    }
    return OWNER_TAGS.has(tag) || tag === 'select';
  }

  function handleCall(n, ctx) {
    const callee = n.expression;
    const ct = squash(callee.getText(sf));
    const b = base(n, ctx);
    const a0 = n.arguments[0];

    if (ct === 'require' && a0 && ts.isStringLiteral(a0)) imports.push(a0.text);
    if (callee.kind === SK.ImportKeyword && a0 && ts.isStringLiteral(a0)) imports.push(a0.text);

    if (TOAST_FN.test(ct)) {
      if (ct === 'toast.promise' || ct === 'toastPromise') add({ kind: 'toast', ...b, text: messageText(n.arguments[1] || a0), variant: 'promise' });
      else if (a0) add({ kind: 'toast', ...b, text: messageText(a0), variant: ct.includes('.') ? ct.split('.')[1] : ct.replace(/^toast|^notify|^show/, '').toLowerCase() || 'plain' });
      return;
    }
    if (/^(window\.)?(confirm|alert|prompt)$/.test(ct) && a0) { add({ kind: ct.replace('window.', ''), ...b, text: messageText(a0) }); return; }
    if (MSG_SETTER.test(ct) && a0 && !ts.isArrowFunction(a0)) {
      const t = messageText(a0);
      if (!t.startsWith('{') && looksHuman(t)) add({ kind: 'message', ...b, text: t, via: ct });
    }
    if (/(^|\.)(router|Router)\.(push|replace)$/.test(ct) || /^window\.(open|location\.(assign|replace))$/.test(ct) || ct === 'navigate') {
      const p = pathText(a0);
      add({ kind: 'nav', ...b, text: p !== null ? p.replace(/\u0000/g, '[*]') : `{${a0 ? src(a0, 60) : ''}}`, via: ct });
    }
    if (ts.isPropertyAccessExpression(callee)) {
      const name = callee.name.text;
      const recv = squash(callee.expression.getText(sf));
      if (name === 'from' && a0 && (ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0))) {
        const ops = [];
        let x = n;
        while (x.parent && ts.isPropertyAccessExpression(x.parent) && x.parent.parent && ts.isCallExpression(x.parent.parent)) { ops.push(x.parent.name.text); x = x.parent.parent; }
        dbRefs.push({ what: (/storage/.test(recv) ? 'bucket:' : 'table:') + a0.text, ops: ops.filter((o) => DB_OPS.has(o)), top: ctx.top || null });
      }
      if (name === 'from' && a0 && ts.isIdentifier(a0) && /storage|supabase|client|admin/i.test(recv)) {
        const ops = []; let x = n;
        while (x.parent && ts.isPropertyAccessExpression(x.parent) && x.parent.parent && ts.isCallExpression(x.parent.parent)) { ops.push(x.parent.name.text); x = x.parent.parent; }
        dbRefs.push({ what: (/storage/.test(recv) ? 'bucket:' : 'table:') + `{${a0.text}}`, ops: ops.filter((o) => DB_OPS.has(o)), top: ctx.top || null });
      }
      if (name === 'rpc' && a0 && ts.isStringLiteral(a0)) dbRefs.push({ what: 'rpc:' + a0.text, ops: [], top: ctx.top || null });
      if (name === 'getElementById' && a0 && ts.isStringLiteral(a0)) { idRefs.add(a0.text); add({ kind: 'hook', ...b, text: `getElementById('${a0.text}')`, type: 'lookup' }); }
      if (/^querySelector(All)?$/.test(name) && a0) { const t = messageText(a0); for (const m of t.matchAll(/#([\w-]+)/g)) idRefs.add(m[1]); add({ kind: 'hook', ...b, text: `${name}(${cut(t, 100)})`, type: 'lookup' }); }
      if (/^(scrollIntoView|scrollTo|scrollBy)$/.test(name) && recv !== 'window') add({ kind: 'hook', ...b, text: `${cut(recv, 50)}.${name}()`, type: 'scroll' });
      if (name === 'addEventListener' && a0 && ts.isStringLiteral(a0)) add({ kind: 'hook', ...b, text: `${cut(recv, 40)}.addEventListener('${a0.text}')`, type: 'listener' });
      if (name === 'get' && /searchParams|URLSearchParams|urlParams|queryParams/i.test(recv) && a0 && ts.isStringLiteral(a0)) queryKeys.add(a0.text);
      if (name === 'focus' && n.arguments.length === 0) add({ kind: 'hook', ...b, text: `${cut(recv, 50)}.focus()`, type: 'focus' });
      if (/^(localStorage|sessionStorage)$/.test(recv.replace(/^window\./, '')) && /^(getItem|setItem|removeItem)$/.test(name) && a0) {
        const k = `${recv.replace(/^window\./, '')}: ${messageText(a0)}`;
        if (!storageKeys.has(k)) { storageKeys.add(k); add({ kind: 'hook', ...b, text: k, type: 'storage' }); }
      }
      if ((name === 'save' && /pdf|doc/i.test(recv)) || name === 'writeFile' || (name === 'createObjectURL') || (name === 'toBlob' && /Packer/.test(recv)) || (name === 'print' && recv === 'window')) add({ kind: 'download', ...b, text: `${cut(recv, 40)}.${name}()`, how: name });
    }
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'push' && a0 && (ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0) || ts.isTemplateExpression(a0)) && !/router$/i.test(squash(callee.expression.getText(sf)))) {
      const t = messageText(a0);
      if (looksHuman(t) && /\s/.test(t)) add({ kind: 'message', ...b, text: t, via: `${cut(squash(callee.expression.getText(sf)), 30)}.push` });
    }
    if (/^(window\.)?setTimeout$/.test(ct) && n.arguments[1] && !(ts.isNumericLiteral(n.arguments[1]) && Number(n.arguments[1].text) < 1000)) add({ kind: 'hook', ...b, text: `setTimeout(…, ${src(n.arguments[1], 30)})`, type: 'timer' });
    if (/^(window\.)?setInterval$/.test(ct)) add({ kind: 'hook', ...b, text: `setInterval(…, ${n.arguments[1] ? src(n.arguments[1], 30) : '?'})`, type: 'timer' });
    if (ct === 'saveAs' || ct === 'html2canvas') add({ kind: 'download', ...b, text: `${ct}()`, how: ct });
    if (ACCESS_CALL.test(ct)) {
      let stmt = n; while (stmt.parent && !ts.isStatement(stmt) && !ts.isVariableDeclaration(stmt)) stmt = stmt.parent;
      if (hasJsx(stmt)) stmt = n.parent && (ts.isBinaryExpression(n.parent) || ts.isPrefixUnaryExpression(n.parent)) ? n.parent : n;
      add({ kind: 'access', ...b, text: src(stmt, 150), via: ct.split('.').pop() });
    }
  }

  function apiRef(n, ctx) {
    const full = ts.isTemplateExpression(n) ? template(n, '\u0000') : n.text;
    const hit = full.match(/^(?:\u0000|https?:\/\/[^/\s]+)?(\/api\/.*)$/);
    if (!hit) return;
    const raw = hit[1];
    let method = '?';
    const p = n.parent;
    if (p && ts.isCallExpression(p) && p.arguments[0] === n) {
      const ct = squash(p.expression.getText(sf));
      const m = ct.match(/\.(get|post|put|patch|delete)$/i);
      if (m) method = m[1].toUpperCase();
      const opt = p.arguments[1];
      if (opt && ts.isObjectLiteralExpression(opt)) {
        const mp = opt.properties.find((q) => ts.isPropertyAssignment(q) && q.name.getText(sf) === 'method');
        if (mp && ts.isStringLiteral(mp.initializer)) method = mp.initializer.text.toUpperCase();
        else if (mp) method = '{…}';
        else if (/fetch/i.test(ct)) method = 'GET';
      } else if (!opt && /fetch/i.test(ct)) method = 'GET';
    }
    apiRefs.push({ raw, method, line: line(n), top: ctx.top || null, ...(p && ts.isCallExpression(p) && p.arguments[0] === n ? { called: squash(p.expression.getText(sf)).slice(0, 40) } : {}) });
  }

  function fnName(n) {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
    if (ts.isMethodDeclaration(n) && n.name) return n.name.getText(sf);
    if (ts.isVariableDeclaration(n) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) && ts.isIdentifier(n.name)) return n.name.text;
    return null;
  }

  function visit(n, ctx) {
    if (ts.isImportDeclaration(n)) {
      if (!(n.importClause && n.importClause.isTypeOnly) && ts.isStringLiteral(n.moduleSpecifier)) {
        imports.push(n.moduleSpecifier.text);
        if (/components\/layout\/Header$/.test(n.moduleSpecifier.text)) flags.usesLegacyHeader = true;
      }
      return;
    }
    if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) && !n.isTypeOnly) { imports.push(n.moduleSpecifier.text); return; }
    if (ts.isTypeNode(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return;

    const name = fnName(n);
    if (name) {
      if (name === 'getServerSideProps') flags.ssr = true;
      if (name === 'getStaticProps') flags.staticProps = true;
      ctx = { ...ctx, fn: name, when: [] };
    }
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      if (n.name.text === 'getServerSideProps') flags.ssr = true;
      if (n.name.text === 'getStaticProps') flags.staticProps = true;
      if (ACCESS_VAR.test(n.name.text) && n.initializer && !ts.isArrowFunction(n.initializer)) add({ kind: 'access', ...base(n, ctx), text: src(n, 150), via: 'declaration' });
      let init = n.initializer;
      while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init))) init = init.expression;
      if (init && (ts.isArrayLiteralExpression(init) || ts.isObjectLiteralExpression(init))) {
        const items = [];
        const walk = (x) => {
          if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) { if (looksHuman(x.text)) items.push(squash(x.text)); return; }
          if (ts.isTemplateExpression(x)) { const t = squash(template(x)); if (looksHuman(t)) items.push(t); return; }
          if (ts.isArrowFunction(x) || ts.isFunctionExpression(x) || ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x) || ts.isCallExpression(x)) return;
          if (ts.isPropertyAssignment(x)) { if (LIST_SKIP.test(x.name.getText(sf).replace(/['"]/g, ''))) return; walk(x.initializer); return; }
          if (ts.isBinaryExpression(x) && /[=<>]/.test(x.operatorToken.getText(sf))) return;
          if (ts.isConditionalExpression(x)) {
            const mark = (branch, word) => { const at = items.length; walk(branch); for (let i = at; i < items.length; i++) items[i] += ` [${word} ${src(x.condition, 40)}]`; };
            mark(x.whenTrue, 'if'); mark(x.whenFalse, 'if not');
            return;
          }
          ts.forEachChild(x, walk);
        };
        walk(init);
        if (items.length) add({ kind: 'list', ...base(n, ctx), text: n.name.text, items: [...new Set(items)].slice(0, 80).map((t) => cut(t, 160)) });
      } else if (init && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init) || ts.isTemplateExpression(init) || ts.isConditionalExpression(init))) {
        const t = messageText(init);
        if (!t.startsWith('{') && looksHuman(t) && /\s/.test(t)) add({ kind: 'list', ...base(n, ctx), text: n.name.text, items: [t] });
      }
    }
    if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.initializer && /(^|\.)router\.query$/.test(squash(n.initializer.getText(sf)))) for (const el of n.name.elements) queryKeys.add((el.propertyName || el.name).getText(sf));
    if (ts.isPropertyAccessExpression(n) && /(^|\.)router\.query$/.test(squash(n.expression.getText(sf)))) queryKeys.add(n.name.text);
    if (ts.isReturnStatement(n) && n.expression && ctx.fn && (ts.isStringLiteral(n.expression) || ts.isNoSubstitutionTemplateLiteral(n.expression) || ts.isTemplateExpression(n.expression) || ts.isConditionalExpression(n.expression))) {
      const t = messageText(n.expression);
      if (!t.startsWith('{') && looksHuman(t)) { if (!returns.has(ctx.fn)) returns.set(ctx.fn, { line: line(n), top: ctx.top, items: [] }); returns.get(ctx.fn).items.push(t); }
    }

    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
      apiRef(n, ctx);
      { const raw = ts.isTemplateExpression(n) ? template(n, '[*]') : n.text; if (/^\/[a-z]/.test(raw) && !raw.startsWith('/api/') && raw.length < 120 && !/\s/.test(raw)) pathRefs.push({ raw, line: line(n) }); }
      if (ts.isTemplateExpression(n)) for (const s of n.templateSpans) visit(s.expression, ctx);
      return;
    }

    if (ts.isThrowStatement(n) && n.expression && ts.isNewExpression(n.expression) && n.expression.arguments && n.expression.arguments[0]) {
      const t = messageText(n.expression.arguments[0]);
      if (!t.startsWith('{') && looksHuman(t) && /\s/.test(t)) add({ kind: 'message', ...base(n, ctx), text: t, via: 'throw (shown by whoever catches it)' });
    }
    if (ts.isIfStatement(n)) {
      const c = src(n.expression, 170);
      const then = n.thenStatement;
      const ret = ts.isReturnStatement(then) ? then : ts.isBlock(then) && then.statements.length === 1 && ts.isReturnStatement(then.statements[0]) ? then.statements[0] : null;
      if (ret && ctx.fn && /^[A-Z]/.test(ctx.fn) && (!ret.expression || ret.expression.kind === SK.NullKeyword)) add({ kind: 'gate', ...base(n, ctx), text: c });
      visit(n.expression, ctx);
      visit(n.thenStatement, push(ctx, c));
      if (n.elseStatement) visit(n.elseStatement, push(ctx, `!(${c})`));
      return;
    }
    if (ts.isConditionalExpression(n)) {
      const c = src(n.condition, 170);
      visit(n.condition, ctx);
      visit(n.whenTrue, push(ctx, c));
      visit(n.whenFalse, push(ctx, `!(${c})`));
      return;
    }
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      if (op === SK.AmpersandAmpersandToken) { visit(n.left, ctx); visit(n.right, hasJsx(n.right) ? push(ctx, src(n.left, 170)) : ctx); return; }
      if (op === SK.BarBarToken && hasJsx(n.right)) { visit(n.left, ctx); visit(n.right, push(ctx, `!(${src(n.left, 170)})`)); return; }
      if (op === SK.EqualsToken && /^(window\.|document\.)?location(\.href)?$/.test(squash(n.left.getText(sf)))) {
        const p = pathText(n.right);
        add({ kind: 'nav', ...base(n, ctx), text: p !== null ? p.replace(/\u0000/g, '[*]') : `{${src(n.right, 60)}}`, via: 'location.href' });
      }
      if (op === SK.EqualsToken && /\.download$/.test(squash(n.left.getText(sf)))) add({ kind: 'download', ...base(n, ctx), text: `archivo: ${messageText(n.right)}`, how: 'a.download' });
    }
    if (ts.isCaseClause(n) && n.parent && n.parent.parent && ts.isSwitchStatement(n.parent.parent)) {
      const c = `${src(n.parent.parent.expression, 40)} === ${src(n.expression, 40)}`;
      for (const s of n.statements) visit(s, push(ctx, c));
      return;
    }
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === 'destination') {
      const p = pathText(n.initializer);
      add({ kind: 'nav', ...base(n, ctx), text: p !== null ? p.replace(/\u0000/g, '[*]') : `{${src(n.initializer, 60)}}`, via: 'server redirect' });
    }
    if (ts.isCallExpression(n)) {
      handleCall(n, ctx);
      if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'map' && n.arguments.length && hasJsx(n)) {
        visit(n.expression, ctx);
        const c = `each ${src(n.expression.expression, 50)}`;
        for (const arg of n.arguments) visit(arg, push(ctx, c));
        return;
      }
    }
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const el = ts.isJsxElement(n) ? n.openingElement : n;
      const clsAttr = el.attributes.properties.find((x) => ts.isJsxAttribute(x) && x.name.getText(sf) === 'className');
      if (clsAttr && clsAttr.initializer) { const tokens = [...clsAttr.initializer.getText(sf).matchAll(RESP_RE)].map((m) => m[1]); if (tokens.length) ctx = { ...ctx, resp: [...(ctx.resp || []), ...tokens] }; }
      let owner = handleJsx(n, ctx);
      if (!owner && !ctx.owner && ts.isJsxElement(n)) {
        const kids = n.children.filter((c) => !(ts.isJsxText(c) && !squash(c.text)));
        const simple = (c) => ts.isJsxText(c) || (ts.isJsxExpression(c) && (!c.expression || !hasJsx(c.expression)));
        if (kids.length && kids.every(simple) && kids.some((c) => ts.isJsxExpression(c) && c.expression)) {
          const t = textOf(n);
          const fixed = kids.some((c) => ts.isJsxText(c) && hasLetters(c.text)) || /[A-Za-zÁÉÍÓÚáéíóúñÑ]{2}/.test(t.replace(/\{[^}]*\}/g, ''));
          if (t) { const r = add({ kind: fixed ? 'text' : 'value', ...base(n, ctx), text: cut(t, 300) }); if (DENIAL_TEXT.test(t)) r.access = true; owner = true; }
        }
      }
      const next = owner ? { ...ctx, owner: true } : ctx;
      if (ts.isJsxElement(n)) {
        ts.forEachChild(n.openingElement, (c) => visit(c, { ...ctx, inAttr: true }));
        for (const c of n.children) visit(c, { ...next, inAttr: false });
      } else ts.forEachChild(n, (c) => visit(c, { ...ctx, inAttr: true }));
      return;
    }
    if (ts.isJsxText(n)) {
      if (!ctx.owner) { const t = squash(n.text); if (t && hasLetters(t)) { const r = add({ kind: 'text', ...base(n, ctx), text: cut(t, 300) }); if (DENIAL_TEXT.test(t)) r.access = true; } }
      return;
    }
    if (ts.isJsxExpression(n) && !ctx.inAttr && n.expression && !ctx.owner) {
      const e = n.expression;
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e) || ts.isConditionalExpression(e) || ts.isBinaryExpression(e)) {
        const out = [];
        const lit = (x) => {
          if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) { if (hasLetters(x.text)) out.push(squash(x.text)); }
          else if (ts.isTemplateExpression(x)) out.push(squash(template(x)));
          else if (ts.isConditionalExpression(x)) { lit(x.whenTrue); lit(x.whenFalse); }
          else if (ts.isBinaryExpression(x) && !/[=<>]/.test(x.operatorToken.getText(sf))) { lit(x.left); lit(x.right); }
          else if (ts.isParenthesizedExpression(x)) lit(x.expression);
        };
        lit(e);
        const t = out.filter(hasLetters).join(' / ');
        if (t) { const r = add({ kind: 'text', ...base(n, ctx), text: cut(t, 300) }); if (DENIAL_TEXT.test(t)) r.access = true; }
      }
    }
    ts.forEachChild(n, (c) => visit(c, ctx));
  }

  // Module map: which top-level names exist, what each one uses, what is exported and imported.
  // It lets the inventory follow "screen imports X from file F" to X only, not to everything in F.
  const bare = () => Object.create(null); // no inherited keys: a function may be called 'constructor'
  const mod = { tops: bare(), exports: bare(), reexports: bare(), star: [], binds: bare(), module: { uses: new Set(), whole: [] } };
  const topNodes = [];
  const hasMod = (st, k) => (ts.canHaveModifiers(st) ? ts.getModifiers(st) || [] : []).some((m) => m.kind === k);
  const bindNames = (name, out) => { if (ts.isIdentifier(name)) out.push(name.text); else for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindNames(el.name, out); return out; };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      if (!ts.isStringLiteral(st.moduleSpecifier)) continue;
      const spec = st.moduleSpecifier.text;
      const ic = st.importClause;
      if (!ic) { mod.module.whole.push(spec); continue; }
      if (ic.isTypeOnly) continue;
      if (ic.name) mod.binds[ic.name.text] = { spec, imported: 'default' };
      if (ic.namedBindings) {
        if (ts.isNamespaceImport(ic.namedBindings)) mod.binds[ic.namedBindings.name.text] = { spec, imported: '*' };
        else for (const el of ic.namedBindings.elements) if (!el.isTypeOnly) mod.binds[el.name.text] = { spec, imported: (el.propertyName || el.name).text };
      }
      topNodes.push([null, st]);
    } else if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly) continue;
      if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
        if (st.exportClause && ts.isNamedExports(st.exportClause)) for (const el of st.exportClause.elements) mod.reexports[el.name.text] = { spec: st.moduleSpecifier.text, imported: (el.propertyName || el.name).text };
        else mod.star.push(st.moduleSpecifier.text);
      } else if (st.exportClause && ts.isNamedExports(st.exportClause)) for (const el of st.exportClause.elements) mod.exports[el.name.text] = (el.propertyName || el.name).text;
      topNodes.push([null, st]);
    } else if (ts.isExportAssignment(st)) {
      if (ts.isIdentifier(st.expression)) { mod.exports.default = st.expression.text; topNodes.push([null, st]); }
      else { mod.exports.default = 'default'; topNodes.push(['default', st]); }
    } else if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) {
      const name = st.name ? st.name.text : 'default';
      if (hasMod(st, SK.ExportKeyword)) mod.exports[hasMod(st, SK.DefaultKeyword) ? 'default' : name] = name;
      topNodes.push([name, st]);
    } else if (ts.isVariableStatement(st)) {
      const names = [];
      for (const d of st.declarationList.declarations) bindNames(d.name, names);
      if (hasMod(st, SK.ExportKeyword)) for (const nm of names) mod.exports[nm] = nm;
      topNodes.push([names[0] || null, st, names]);
    } else if (ts.isEnumDeclaration(st)) {
      if (hasMod(st, SK.ExportKeyword)) mod.exports[st.name.text] = st.name.text;
      topNodes.push([st.name.text, st]);
    } else topNodes.push([null, st]);
  }
  for (const [name, , names] of topNodes) for (const nm of names || (name ? [name] : [])) mod.tops[nm] = mod.tops[name] || (mod.tops[name] = { uses: new Set(), whole: [] });
  for (const [name, st] of topNodes) {
    const part = name ? mod.tops[name] : mod.module;
    const walk = (x) => {
      if (ts.isIdentifier(x)) { const t = x.text; if (t !== name && (t in mod.tops || t in mod.binds)) part.uses.add(t); return; }
      if (ts.isCallExpression(x) && x.arguments[0] && ts.isStringLiteral(x.arguments[0]) && (x.expression.kind === SK.ImportKeyword || x.expression.getText(sf) === 'require')) part.whole.push(x.arguments[0].text);
      ts.forEachChild(x, walk);
    };
    if (!ts.isImportDeclaration(st)) ts.forEachChild(st, walk);
    visit(st, { when: [], fn: null, owner: false, inAttr: false, top: name });
  }
  for (const k of Object.keys(mod.tops)) mod.tops[k] = { uses: [...mod.tops[k].uses], whole: mod.tops[k].whole };
  mod.module = { uses: [...mod.module.uses], whole: mod.module.whole };

  {
    const DENY = /(^|\.)(from|select|eq|neq|in|is|or|order|rpc|like|ilike|not|filter|match|getItem|setItem|removeItem|addEventListener|removeEventListener|querySelector|querySelectorAll|getElementById|includes|startsWith|endsWith|split|replace|replaceAll|join|test|indexOf|toLocaleDateString|toLocaleString|toLocaleTimeString|createElement|setAttribute|getAttribute|log|warn|debug|info|captureException|captureMessage|describe|it|expect|require|dynamic|useRouter|channel|on|emit|track|setHeader|localeCompare|padStart|padEnd|Error|TypeError)$/;
    const hay = rows.map((r) => [r.text, r.placeholder, r.props, r.aria, r.title, ...(r.items || []), ...(r.options || [])].filter(Boolean).join('\n')).join('\n');
    const seen = new Set();
    const sweep = (x, top) => {
      if (ts.isImportDeclaration(x) || ts.isExportDeclaration(x) || ts.isTypeNode(x) || ts.isInterfaceDeclaration(x) || ts.isTypeAliasDeclaration(x)) return;
      if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) || ts.isTemplateExpression(x)) {
        const p = x.parent;
        const attr = p && ts.isJsxAttribute(p) ? p : p && ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent) ? p.parent : null;
        const skip = (p && ts.isPropertyAssignment(p) && (p.name === x || LIST_SKIP.test(p.name.getText(sf).replace(/['"]/g, '')))) ||
          (p && ts.isBinaryExpression(p) && /[=<>]/.test(p.operatorToken.getText(sf)) && p.operatorToken.kind !== SK.EqualsToken) ||
          (p && (ts.isCaseClause(p) || ts.isElementAccessExpression(p))) ||
          (attr && (SKIP_PROPS.has(attr.name.getText(sf)) || attr.name.getText(sf).startsWith('data-') || /ClassName$/.test(attr.name.getText(sf)))) ||
          (p && (ts.isCallExpression(p) || ts.isNewExpression(p)) && (DENY.test(squash(p.expression.getText(sf))) || /^console\./.test(squash(p.expression.getText(sf)))));
        if (!skip) {
          const t = squash(ts.isTemplateExpression(x) ? template(x) : x.text);
          const fixed = ts.isTemplateExpression(x) ? [x.head.text, ...x.templateSpans.map((sp) => sp.literal.text)].map(squash).sort((a, b) => b.length - a.length)[0] : t;
          if (t.length <= 400 && fixed.length >= 3 && looksHuman(t) && (/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(t) || /(^|[\s(«"'])[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/.test(t)) && !hay.includes(fixed) && !seen.has(t)) {
            seen.add(t);
            add({ kind: 'string', line: line(x), ...(top ? { top, in: top } : {}), text: cut(t, 300) });
          }
        }
        if (ts.isTemplateExpression(x)) for (const sp of x.templateSpans) sweep(sp.expression, top);
        return;
      }
      ts.forEachChild(x, (c) => sweep(c, top));
    };
    for (const [name, st] of topNodes) sweep(st, name);
  }
  for (const [fn, v] of returns) add({ kind: 'list', line: v.line, in: fn, ...(v.top ? { top: v.top } : {}), text: `${fn}()`, items: [...new Set(v.items)].slice(0, 80) });
  for (const k of [...queryKeys].sort()) add({ kind: 'hook', line: 1, text: `?${k}`, type: 'address value' });
  // Element ids that the same file looks up or points at: fragile.
  for (const r of rows) if (r.hook && r.hook.id && idRefs.has(r.hook.id)) r.hook.idUsed = true;

  return { rows, imports: [...new Set(imports)], apiRefs, dbRefs, pathRefs, flags, mod };
}

// What an API file answers to, read by pattern (no walk needed).
export function apiFacts(text) {
  const methods = new Set();
  for (const m of text.matchAll(/req\.method\s*[!=]==?\s*['"]([A-Z]+)['"]|case\s+['"](GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)['"]/g)) methods.add(m[1] || m[2]);
  const guards = new Set();
  for (const m of text.matchAll(/\b(checkIsAdmin|getApiUser|hasAdminPrivileges|getUserRoles|requireAuth|requireAdmin|CRON_SECRET|createServiceRoleClient|getServerSession|hasRole|hasPermission|verifyWebhook|x-vercel-cron|auth\.getUser|metadataHasRole|validateApiAuth|isGlobalAdmin)\b/g)) guards.add(m[1]);
  return { methods: [...methods].sort(), guards: [...guards].sort() };
}
