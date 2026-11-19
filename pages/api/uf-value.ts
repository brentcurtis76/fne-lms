import type { NextApiRequest, NextApiResponse } from 'next';
import { todayInChile, isUsableUFNumber } from '../../lib/uf-service';

interface UFResponse {
  success: boolean;
  valor?: number;
  fecha?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UFResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Today is the calendar day in Chile (never the server's UTC day).
    const today = todayInChile(new Date());
    const [year, month, dayText] = today.split('-');
    const day = parseInt(dayText, 10);

    // Fetch from SII UF page for current year
    const siiUrl = `https://www.sii.cl/valores_y_fechas/uf/uf${year}.htm`;
    
    // N89: never wait on the SII for more than 5 seconds.
    const response = await fetch(siiUrl, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`SII fetch failed: ${response.status}`);
    }

    const html = await response.text();
    
    // Parse the HTML to extract current month's UF values
    // SII format: the page contains a table with monthly UF values
    // We need to find the current month's table and extract today's value
    
    const ufValue = extractUFFromSII(html, month, day);
    
    // N187: success only for a number inside the service's accepted range.
    if (isUsableUFNumber(ufValue)) {
      // Cache the result for 10 minutes, never served stale (another day's
      // answer must not come back as today's).
      res.setHeader('Cache-Control', 'public, s-maxage=600');
      
      return res.status(200).json({
        success: true,
        valor: ufValue,
        fecha: today
      });
    } else {
      throw new Error('Could not extract UF value from SII page');
    }
    
  } catch (error) {
    console.error('Error fetching UF from SII:', error);
    
    // N89: say honestly that today's value could not be read; give no value.
    return res.status(200).json({
      success: false,
      error: 'No se pudo obtener la UF de hoy'
    });
  }
}

export function extractUFFromSII(html: string, month: string, day: number): number | null {
  try {
    // N187: the SII's real yearly page holds one block per month,
    // «<div class='meses' id='mes_noviembre'>», each with one table whose
    // heading cell is «<th colspan='6'><h2>Noviembre</h2></th>», newest month
    // first and after a list of options that names every month. A day is
    // «<th width='40'><strong>18</strong></th> <td width='200'>41.357,30</td>»,
    // three days per row. Pure: reads only (html, month, day).
    const monthIds = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const index = parseInt(month, 10) - 1;
    if (!(index >= 0 && index < 12)) return null;

    const tableContent = findMonthTable(html, monthIds[index], monthNames[index]);
    if (tableContent === null) {
      console.log('Month table not found for:', monthNames[index]);
      return null;
    }

    // Every header or data cell of the table, in order, as its tag and its
    // text (inner tags such as <strong> removed, trimmed).
    const cells = Array.from(tableContent.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)).map((m) => ({
      tag: m[1].toLowerCase(),
      text: m[2].replace(/<[^>]*>/g, '').trim(),
    }));

    // The day cell is matched as a NUMBER: its trimmed text, read as an
    // integer, equals the day («2» and «02» are day 2; «12», «20», «22» are
    // not). Its value is the very next cell, which must be a data cell.
    const at = cells.findIndex((c) => /^\d+$/.test(c.text) && parseInt(c.text, 10) === day);
    if (at < 0 || at + 1 >= cells.length || cells[at + 1].tag !== 'td') {
      // The requested day's row is missing: no value (never a neighbouring day's).
      console.log('Today\'s value not found');
      return null;
    }

    // The value is accepted only when written the Chilean way and nothing
    // else: digits in groups of three separated by dots (or no dots at all),
    // then optionally a comma and one to four decimals. An empty cell (a day
    // not published yet, or one the month does not have) is no value.
    const ufString = cells[at + 1].text;
    if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,4})?$/.test(ufString)) {
      console.log(`Today's value is not a Chilean number: «${ufString.slice(0, 40)}»`);
      return null;
    }
    const ufValue = parseChileanNumber(ufString);

    console.log(`Found UF value for day ${day}: ${ufString} -> ${ufValue}`);
    return ufValue;

  } catch (error) {
    console.error('Error extracting UF from HTML:', error);
    return null;
  }
}

/**
 * The inside of the month's own table, or null. A table is the month's table
 * only if it says so itself: its FIRST row holds a heading cell (th) whose
 * text, tags removed and trimmed, is exactly the month's name (case and
 * accents ignored), as the real page's «<th colspan='6'><h2>Noviembre</h2></th>».
 * With a «mes_<month>» block, the candidate is the first table after the
 * block's id and before the next «mes_» id; there is no fallback when the
 * block exists. Without it, the candidate is the first table on the page that
 * says so itself. Only a plain table is read: a candidate holding another
 * «<table» before its first closing table tag gives null.
 */
function findMonthTable(html: string, monthId: string, monthName: string): string | null {
  const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const wanted = fold(monthName);

  // The text between a table's opening tag and its first closing table tag.
  const tableAt = (text: string, open: RegExpMatchArray): string | null => {
    const from = open.index! + open[0].length;
    const close = text.slice(from).search(/<\/table\s*>/i);
    return close < 0 ? null : text.slice(from, from + close);
  };

  const saysSoItself = (inner: string): boolean => {
    const firstRow = inner.match(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/i);
    if (!firstRow) return false;
    return Array.from(firstRow[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th\s*>/gi))
      .some((m) => fold(m[1].replace(/<[^>]*>/g, '').trim()) === wanted);
  };

  const readable = (inner: string | null): string | null => {
    if (inner === null) return null;
    if (/<table\b/i.test(inner)) return null; // not a plain table
    return saysSoItself(inner) ? inner : null;
  };

  const block = html.match(new RegExp(`id\\s*=\\s*['"]mes_${monthId}['"][^>]*>`, 'i'));
  if (block) {
    const from = block.index! + block[0].length;
    const next = html.slice(from).search(/id\s*=\s*['"]mes_/i);
    const segment = next < 0 ? html.slice(from) : html.slice(from, from + next);
    const open = segment.match(/<table\b[^>]*>/i);
    return open ? readable(tableAt(segment, open)) : null;
  }

  for (const open of Array.from(html.matchAll(/<table\b[^>]*>/gi))) {
    const inner = tableAt(html, open);
    if (inner !== null && saysSoItself(inner)) return readable(inner);
  }
  return null;
}

function getMostRecentUFValue(tableContent: string): number | null {
  try {
    // Find all UF values in the table
    const valueRegex = /<td[^>]*>\d{1,2}<\/td>\s*<td[^>]*>([\d.,]+)<\/td>/gi;
    const matches = Array.from(tableContent.matchAll(valueRegex));
    
    if (matches.length === 0) {
      return null;
    }
    
    // Get the last (most recent) value
    const lastMatch = matches[matches.length - 1];
    const ufString = lastMatch[1];
    const ufValue = parseChileanNumber(ufString);
    
    console.log(`Most recent UF value: ${ufString} -> ${ufValue}`);
    return ufValue;
    
  } catch (error) {
    console.error('Error getting most recent UF value:', error);
    return null;
  }
}

function parseChileanNumber(numberString: string): number {
  // Convert Chilean number format "39.184,40" to JavaScript number
  // Remove thousand separators (.) and convert decimal separator (,) to (.)
  const cleaned = numberString
    .replace(/\./g, '') // Remove thousand separators
    .replace(',', '.'); // Convert decimal separator
  
  return parseFloat(cleaned);
}