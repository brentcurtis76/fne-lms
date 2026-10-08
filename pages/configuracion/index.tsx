import type { GetServerSideProps } from 'next';

/** `/configuracion` has one section: the notification settings (NOTIF plan D7), which verify the caller themselves. */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/configuracion/notificaciones', permanent: false },
});

export default function ConfiguracionIndex() {
  return null;
}
