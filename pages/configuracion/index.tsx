import type { GetServerSideProps } from 'next';

/**
 * `/configuracion` opens the notification settings (NOTIF plan D7), which verify the caller themselves. Accounts that are
 * offered it also have «Apariencia» (`/configuracion/apariencia`), reached from a link on that page.
 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/configuracion/notificaciones', permanent: false },
});

export default function ConfiguracionIndex() {
  return null;
}
