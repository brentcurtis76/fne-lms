import type { NextApiRequest, NextApiResponse } from 'next';

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
    // Get current year and month
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = now.getDate();

    // Fetch from SII UF page for current year
    const siiUrl = `https://www.sii.cl/valores_y_fechas/uf/uf${year}.htm`;
    
    const response = await fetch(siiUrl, {
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
    
    if (ufValue) {
      // Cache the result for 1 hour
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      
      return res.status(200).json({
        success: true,
        valor: ufValue,
        fecha: now.toISOString().split('T')[0]
      });
    } else {
      throw new Error('Could not extract UF value from SII page');
    }
    
  } catch (error) {
    console.error('Error fetching UF from SII:', error);
    
    // Return fallback value
    return res.status(200).json({
      success: false,
      valor: 39184, // Fallback to known current value
      fecha: new Date().toISOString().split('T')[0],
      error: 'Using fallback value - SII fetch failed'
    });
  }
}

function extractUFFromSII(html: string, month: string, day: number): number | null {
  try {
    // SII table structure: Look for table with UF values
    // The HTML contains tables with format like:
    // <td>01</td><td>39.184,40</td> (day 1, UF value)
    
    // Convert month number to month name in Spanish (SII uses month names)
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    const monthName = monthNames[parseInt(month) - 1];
    
    // Look for the month section
    const monthRegex = new RegExp(monthName + '.*?<table[^>]*>', 'is');
    const monthMatch = html.match(monthRegex);
    
    if (!monthMatch) {
      console.log('Month section not found for:', monthName);
      return null;
    }
    
    // Extract table content after the month name
    const tableStart = monthMatch.index! + monthMatch[0].length;
    const tableEndRegex = /<\/table>/i;
    const tableEndMatch = html.substring(tableStart).match(tableEndRegex);
    
    if (!tableEndMatch) {
      console.log('Table end not found');
      return null;
    }
    
    const tableContent = html.substring(tableStart, tableStart + tableEndMatch.index!);
    
    // Look for current day's UF value
    // Format: <td>DD</td><td>XX.XXX,XX</td>
    const dayStr = String(day).padStart(2, '0');
    const dayRegex = new RegExp(`<td[^>]*>${dayStr}</td>\\s*<td[^>]*>([\\d.,]+)</td>`, 'i');
    const dayMatch = tableContent.match(dayRegex);
    
    if (!dayMatch) {
      // If today's value not found, get the most recent available value
      console.log('Today\'s value not found, getting most recent');
      return getMostRecentUFValue(tableContent);
    }
    
    // Parse the UF value (format: "39.184,40")
    const ufString = dayMatch[1];
    const ufValue = parseChileanNumber(ufString);
    
    console.log(`Found UF value for day ${day}: ${ufString} -> ${ufValue}`);
    return ufValue;
    
  } catch (error) {
    console.error('Error extracting UF from HTML:', error);
    return null;
  }
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