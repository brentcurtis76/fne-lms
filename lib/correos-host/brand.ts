/**
 * GENERA's brand file for the Correos kit (`lib/correos/`). One brand file per client; this is the
 * Fundación's. Colours and font stack come from `styles/fne-tokens.css` (lines 160-167 and 414).
 *
 * The sender below is what campaigns will use from release 3. The test send of release 1 does NOT use it:
 * it goes out as today's sender (`resolveSender()` in `lib/email/provider.ts`).
 *
 * NOT FINAL: the second footer line is a placeholder. Brent supplies the postal address and the reply
 * mailbox before release 2; until then no reply address is set and no address is invented.
 */
import type { Brand } from '../correos';

/** A logo that exists under `public/`; the host turns it into an absolute address. */
export const GENERA_LOGO_PATH = '/logos/fne-logo-bw.png';

/** The picture the preview's sample email shows; it exists under `public/`. */
export const GENERA_SAMPLE_PICTURE_PATH = '/images/collaborative-photo.png';

export const GENERA_FOOTER_PLACEHOLDER = '[Texto provisional, no definitivo: dirección postal y casilla de respuesta pendientes]';

function absolute(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

export function generaBrand(baseUrl: string): Brand {
  return {
    name: 'Fundación Nueva Educación',
    logo: {
      url: absolute(baseUrl, GENERA_LOGO_PATH),
      description: 'Fundación Nueva Educación',
      // public/logos/fne-logo-bw.png is 2063 x 733 px; drawn at 180 px wide.
      width: 180,
      height: 64,
    },
    accentColor: '#fbbf24',
    onAccentColor: '#0a0a0a',
    fontStack:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    footerLines: ['Fundación Nueva Educación', GENERA_FOOTER_PLACEHOLDER],
    sender: { name: 'Fundación Nueva Educación', address: 'novedades@boletin.nuevaeducacion.org' },
    language: 'es',
  };
}

export function generaSamplePictureUrl(baseUrl: string): string {
  return absolute(baseUrl, GENERA_SAMPLE_PICTURE_PATH);
}
