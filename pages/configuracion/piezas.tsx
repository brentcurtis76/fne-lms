import React, { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { ArrowRight, Download, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import MainLayout from '../../components/layout/MainLayout';
import { createServiceRoleClient, getForcedPasswordChangeVerdict, getServerSideUser } from '../../lib/api-auth';
import { forcedChangeRedirectPath } from '../../lib/auth/forced-password-change';
import { mayChooseLook } from '../../lib/look';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Count,
  Dialog,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Notice,
  PageHeader,
  Pagination,
  Radio,
  SearchInput,
  Select,
  Skeleton,
  Switch,
  Tab,
  TabLinks,
  TabList,
  TabPanel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  Textarea,
  useConfirm,
  type BadgeTone,
  type SortDirection,
} from '../../components/ui/kit';

/**
 * «Piezas de la interfaz» (redesign 5c): the shared pieces of components/ui/kit/, each in the states a
 * tester tries, in whichever look the account has. Offered only to the accounts that «Apariencia» is
 * offered to, with exactly that page's gate. Nothing here is saved and nothing is sent: the samples are
 * invented and live in the page's own state.
 */

const SETTINGS = '/configuracion/notificaciones';

export const getServerSideProps: GetServerSideProps = async (context) => {
  // The verified user (auth server), never the cookie's stored user.
  const viewer = await getServerSideUser(context);
  if (!viewer) {
    return { redirect: { destination: `/login?next=${encodeURIComponent(context.resolvedUrl)}`, permanent: false } };
  }
  const service = createServiceRoleClient();
  // The middleware's page gate also covers /configuracion; the forced-password rule is applied here as well (defence in depth).
  const verdict = await getForcedPasswordChangeVerdict(service, viewer.id);
  if (verdict !== 'allowed') {
    return { redirect: { destination: forcedChangeRedirectPath(verdict), permanent: false } };
  }

  const profile = await service
    .from('profiles')
    .select('can_run_qa_tests, learning_preferences')
    .eq('id', viewer.id)
    .maybeSingle();
  // Not offered to this account, or its profile could not be read: the section does not exist for it.
  if (profile.error || !mayChooseLook(profile.data)) {
    return { redirect: { destination: SETTINGS, permanent: false } };
  }
  return { props: {} };
};

interface Row {
  id: string;
  name: string;
  school: string;
  role: string;
  state: { word: string; tone: BadgeTone };
  progress: number;
}

const SCHOOLS = ['Colegio Ejemplo Norte', 'Escuela Ejemplo Sur', 'Liceo Ejemplo Centro'];
const ROLES = ['Docente', 'Equipo directivo', 'Consultor'];
const STATES: Row['state'][] = [
  { word: 'Activo', tone: 'success' },
  { word: 'Pendiente', tone: 'warning' },
  { word: 'Rechazado', tone: 'error' },
];
const PROGRESS = [62, 100, 15, 48, 87, 33, 0, 71, 54, 92, 26, 40];

/** Twelve invented rows: «Participante A» to «Participante L». */
const ROWS: Row[] = PROGRESS.map((progress, i) => ({
  id: `p-${i + 1}`,
  name: `Participante ${String.fromCharCode(65 + i)}`,
  school: SCHOOLS[i % SCHOOLS.length],
  role: ROLES[i % ROLES.length],
  state: STATES[i % STATES.length],
  progress,
}));
const PAGE_SIZE = 5;

const BADGES: Array<{ tone: BadgeTone; word: string }> = [
  { tone: 'neutral', word: 'Borrador' },
  { tone: 'success', word: 'Completada' },
  { tone: 'warning', word: 'Pendiente' },
  { tone: 'error', word: 'Cancelada' },
  { tone: 'info', word: 'En progreso' },
  { tone: 'accent', word: 'Nuevo' },
];

type TabValue = 'detalles' | 'materiales' | 'informe' | 'actividad';
const TAB_TEXT: Record<TabValue, string> = {
  detalles: 'Contenido de «Detalles»: fecha, lugar y objetivos de la sesión.',
  materiales: 'Contenido de «Materiales»: tres documentos de ejemplo.',
  informe: 'Contenido de «Informe»: el resumen que se escribe al terminar.',
  actividad: 'Contenido de «Actividad»: los cambios recientes.',
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section data-testid={`kit-section-${id}`} aria-labelledby={`kit-h-${id}`} className="space-y-4 border-t border-gray-200 py-8 nuevo:border-brand_primary/[0.24]">
      <h2 id={`kit-h-${id}`} className="text-lg font-semibold text-gray-900 nuevo:text-[1.0625rem] nuevo:font-extrabold nuevo:uppercase nuevo:tracking-[0.06em]">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function PiezasPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [answer, setAnswer] = useState<'Confirmado' | 'Cancelado' | null>(null);
  const { confirm, confirmDialog } = useConfirm('kit-confirm');
  const [sort, setSort] = useState<SortDirection>('none');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<TabValue>('detalles');
  const [search, setSearch] = useState('');
  const [cardClicks, setCardClicks] = useState(0);

  const sorted = useMemo(() => {
    if (sort === 'none') return ROWS;
    const factor = sort === 'ascending' ? 1 : -1;
    return [...ROWS].sort((a, b) => (a.progress - b.progress) * factor);
  }, [sort]);
  const shown = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const ask = async (danger: boolean) => {
    const yes = await confirm(
      danger
        ? {
            title: '¿Eliminar este curso?',
            message: 'Esta acción no se puede deshacer. Es solo una muestra: nada se elimina.',
            tone: 'danger',
            confirmLabel: 'Eliminar',
          }
        : {
            title: '¿Enviar el registro?',
            message: 'Una vez enviado no podrás modificar tus respuestas. Es solo una muestra: nada se envía.',
            confirmLabel: 'Sí, enviar',
            eyebrow: 'Confirmar',
          }
    );
    setAnswer(yes ? 'Confirmado' : 'Cancelado');
  };

  return (
    <MainLayout currentPage="configuracion" pageTitle="Piezas de la interfaz" breadcrumbs={[{ label: 'Configuración' }, { label: 'Piezas de la interfaz' }]}>
      <div data-testid="kit-page" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <p className="text-sm text-gray-700">Muestras de las piezas del diseño. Nada de lo que hagas aquí se guarda.</p>

        <Section id="buttons" title="Botones">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" data-testid="kit-btn-primary">
              Continuar lección <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Button>
            <Button data-testid="kit-btn-default">
              <Plus aria-hidden="true" className="h-4 w-4" />
              Nuevo usuario
            </Button>
            <Button variant="outline" data-testid="kit-btn-outline">
              Cancelar
            </Button>
            <Button variant="quiet" data-testid="kit-btn-quiet">
              <Download aria-hidden="true" className="h-4 w-4" />
              Exportar
            </Button>
            <Button variant="danger" data-testid="kit-btn-danger">
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Eliminar
            </Button>
            <Button variant="danger-outline" data-testid="kit-btn-danger-outline">
              Rechazar
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled data-testid="kit-btn-primary-disabled">
              Deshabilitado
            </Button>
            <Button disabled data-testid="kit-btn-disabled">
              Deshabilitado
            </Button>
            <Button loading data-testid="kit-btn-loading">
              Guardando…
            </Button>
            <Button size="sm" data-testid="kit-btn-small">
              Pequeño
            </Button>
            <Button variant="outline" size="sm" data-testid="kit-btn-small-outline">
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Editar
            </Button>
            <Button variant="outline" iconOnly aria-label="Más acciones" data-testid="kit-btn-icon">
              <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
            </Button>
            <Button variant="quiet" href="/configuracion/apariencia" data-testid="kit-btn-link">
              Ir a Apariencia
            </Button>
          </div>
        </Section>

        <Section id="fields" title="Campos">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Nombre" required help="Así la verán los docentes en su calendario.">
              <Input placeholder="Nombre de la sesión" data-testid="kit-field-name" />
            </Field>
            <Field label="Correo electrónico" error="Ingresa un correo válido.">
              <Input type="email" defaultValue="persona.ejemplo@" data-testid="kit-field-email" />
            </Field>
            <Field label="Colegio">
              <Select defaultValue="" data-testid="kit-field-school">
                <option value="" disabled>
                  Selecciona un colegio
                </option>
                {SCHOOLS.map((school) => (
                  <option key={school}>{school}</option>
                ))}
              </Select>
            </Field>
            <Field label="Buscar">
              <SearchInput
                placeholder="Buscar por nombre o correo..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                data-testid="kit-field-search"
              />
            </Field>
            <Field label="Campo bloqueado" disabled>
              <Input defaultValue="No editable" data-testid="kit-field-disabled" />
            </Field>
            <Field label="Descripción" help="Un texto largo: el campo crece hacia abajo." className="md:col-span-2">
              <Textarea
                data-testid="kit-field-description"
                defaultValue="Objetivos de la sesión: revisar cómo planificar la primera semana de un proyecto, acordar con el curso la pregunta que lo guiará y decidir qué evidencias conviene registrar en la bitácora. Este texto es largo a propósito, para ver cómo se comporta el campo con varias líneas."
              />
            </Field>
            <Field label="Modalidad" group>
              <Radio name="kit-modalidad" value="presencial" label="Presencial" defaultChecked data-testid="kit-field-radio-presencial" />
              <Radio name="kit-modalidad" value="en-linea" label="En línea" data-testid="kit-field-radio-en-linea" />
            </Field>
            <Field label="Opciones" group>
              <Checkbox label="Enviar recordatorio por correo" defaultChecked data-testid="kit-field-checkbox" />
              <Switch label="Notificaciones activas" defaultChecked data-testid="kit-field-switch" />
            </Field>
          </div>
        </Section>

        <Section id="dialogs" title="Ventana y confirmación">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setDialogOpen(true)} data-testid="kit-open-dialog">
              Abrir ventana
            </Button>
            <Button variant="outline" onClick={() => void ask(false)} data-testid="kit-open-confirm">
              Abrir confirmación
            </Button>
            <Button variant="danger-outline" onClick={() => void ask(true)} data-testid="kit-open-confirm-danger">
              Confirmación de eliminar
            </Button>
            <p role="status" aria-live="polite" className="text-sm text-gray-700">
              {answer && (
                <>
                  Respuesta: <strong data-testid="kit-confirm-result">{answer}</strong>
                </>
              )}
            </p>
          </div>
        </Section>

        <Section id="table" title="Tabla">
          <Table
            stackOnPhone
            aria-label="Participantes de ejemplo"
            data-testid="kit-table"
            footer={
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={sorted.length}
                onPageChange={setPage}
                noun="participantes"
                data-testid="kit-pagination"
              />
            }
          >
            <TableHead>
              <TableRow>
                <TableHeaderCell>
                  <span className="sr-only">Seleccionar</span>
                </TableHeaderCell>
                <TableHeaderCell>Participante</TableHeaderCell>
                <TableHeaderCell>Colegio</TableHeaderCell>
                <TableHeaderCell>Rol</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell
                  align="right"
                  sort={sort}
                  data-testid="kit-sort-progress"
                  onSort={() => {
                    setSort((current) => (current === 'ascending' ? 'descending' : 'ascending'));
                    setPage(1);
                  }}
                >
                  Avance
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.id} selected={selected === row.id} data-testid={`kit-row-${row.id}`}>
                  <TableCell label="Seleccionar">
                    <Radio
                      name="kit-row"
                      value={row.id}
                      checked={selected === row.id}
                      onChange={() => setSelected(row.id)}
                      label={<span className="sr-only">{`Seleccionar a ${row.name}`}</span>}
                      data-testid={`kit-select-${row.id}`}
                    />
                  </TableCell>
                  <TableCell primary label="Participante" className="font-medium">
                    {row.name}
                  </TableCell>
                  <TableCell label="Colegio">{row.school}</TableCell>
                  <TableCell label="Rol">{row.role}</TableCell>
                  <TableCell label="Estado">
                    <Badge tone={row.state.tone}>{row.state.word}</Badge>
                  </TableCell>
                  <TableCell label="Avance" align="right" data-testid={`kit-progress-${row.id}`}>
                    {`${row.progress}%`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-sm text-gray-600">En un teléfono cada fila se vuelve una ficha. Angosta la ventana para verlo.</p>
        </Section>

        <Section id="tabs" title="Pestañas">
          <Card>
            <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
              <div className="px-4 pt-1">
                <TabList label="Secciones de la sesión" data-testid="kit-tabs">
                  <Tab value="detalles" data-testid="kit-tab-detalles">
                    Detalles
                  </Tab>
                  <Tab value="materiales" data-testid="kit-tab-materiales">
                    Materiales <Count value={3} label="3 materiales" />
                  </Tab>
                  <Tab value="informe" data-testid="kit-tab-informe">
                    Informe
                  </Tab>
                  <Tab value="actividad" data-testid="kit-tab-actividad">
                    Actividad
                  </Tab>
                </TabList>
              </div>
              {(Object.keys(TAB_TEXT) as TabValue[]).map((value) => (
                <TabPanel key={value} value={value} className="p-4" data-testid={`kit-tabpanel-${value}`}>
                  <p className="text-sm text-gray-700">{TAB_TEXT[value]}</p>
                </TabPanel>
              ))}
            </Tabs>
          </Card>
          <TabLinks
            label="Páginas de configuración"
            data-testid="kit-tablinks"
            items={[
              { href: '/configuracion/notificaciones', label: 'Notificaciones', 'data-testid': 'kit-tablink-notificaciones' },
              { href: '/configuracion/apariencia', label: 'Apariencia', 'data-testid': 'kit-tablink-apariencia' },
              { href: '/configuracion/piezas', label: 'Piezas de la interfaz', current: true, 'data-testid': 'kit-tablink-piezas' },
            ]}
          />
        </Section>

        <Section id="badges" title="Insignias">
          <div className="flex flex-wrap items-center gap-3">
            {BADGES.map((badge) => (
              <Badge key={badge.tone} tone={badge.tone} data-testid={`kit-badge-${badge.tone}`}>
                {badge.word}
              </Badge>
            ))}
            <Badge tone="neutral" plain data-testid="kit-badge-plain">
              Docente
            </Badge>
            <Count value={7} label="7 notificaciones sin leer" data-testid="kit-count" />
          </div>
        </Section>

        <Section id="cards" title="Tarjetas">
          <div className="grid gap-4 md:grid-cols-3">
            <Card data-testid="kit-card-plain">
              <CardBody className="space-y-2">
                <p className="text-sm text-gray-600">Educadores activos</p>
                <p className="text-3xl font-bold text-gray-900">128</p>
                <p className="text-sm text-gray-600">En la escuela de ejemplo, últimos 30 días</p>
              </CardBody>
            </Card>
            <div className="space-y-2">
              <Card interactive onClick={() => setCardClicks((n) => n + 1)} data-testid="kit-card-interactive">
                <CardBody className="space-y-3">
                  <Badge tone="info">En progreso</Badge>
                  <CardTitle as="p">Aprendizaje basado en proyectos</CardTitle>
                  <p className="text-sm text-gray-600">8 lecciones · 62% completado</p>
                </CardBody>
              </Card>
              <p role="status" aria-live="polite" className="text-sm text-gray-600" data-testid="kit-card-clicks">
                {cardClicks > 0 ? `Tarjeta pulsada ${cardClicks} ${cardClicks === 1 ? 'vez' : 'veces'}.` : ''}
              </p>
            </div>
            <Card leading data-testid="kit-card-leading">
              <CardHeader>
                <CardTitle>Próxima sesión</CardTitle>
                <Badge>Programada</Badge>
              </CardHeader>
              <CardBody>
                <p className="text-sm">Jueves 19 de noviembre, 15:30 · Comunidad de ejemplo</p>
              </CardBody>
              <CardFooter>
                <Button variant="outline" size="sm" data-testid="kit-card-leading-action">
                  Ver sesión
                </Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        <Section id="notices" title="Avisos">
          <div className="space-y-3">
            <Notice title="Borrador guardado." data-testid="kit-notice-neutral">
              Puedes seguir más tarde desde donde quedaste.
            </Notice>
            <Notice tone="success" title="Registro enviado." data-testid="kit-notice-success">
              Tus respuestas ya están disponibles para el equipo directivo.
            </Notice>
            <Notice tone="warning" title="Solo lectura." data-testid="kit-notice-warning">
              Esta sesión ya fue completada y no admite cambios.
            </Notice>
            <Notice tone="error" title="No se pudo cargar." data-testid="kit-notice-error">
              Revisa tu conexión e intenta de nuevo.
            </Notice>
          </div>
        </Section>

        <Section id="states" title="Vacío y carga">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <EmptyState
                data-testid="kit-empty"
                title="Sin notificaciones"
                description="Te avisaremos cuando tengas algo nuevo."
                action={
                  <Button variant="outline" size="sm" data-testid="kit-empty-action">
                    Ver todas
                  </Button>
                }
              />
            </Card>
            <Card>
              <CardBody className="space-y-3" data-testid="kit-skeleton">
                <Skeleton width="40%" height={14} />
                <Skeleton width="80%" height={22} />
                <Skeleton width="60%" height={12} />
                <Skeleton width="100%" height={6} />
                <Skeleton width="30%" height={12} />
              </CardBody>
            </Card>
            <Card>
              <LoadingBlock data-testid="kit-loading" />
            </Card>
          </div>
        </Section>

        <Section id="header" title="Cabecera de página">
          <Card>
            <CardBody>
              <PageHeader
                data-testid="kit-page-header"
                eyebrow="Usuarios"
                title="Encabezado de ejemplo"
                description="Una línea que dice para qué sirve la página."
                secondaryAction={{ label: 'Exportar', onClick: () => undefined, 'data-testid': 'kit-header-secondary' }}
                primaryAction={{ label: 'Nuevo usuario', onClick: () => undefined, 'data-testid': 'kit-header-primary' }}
              />
            </CardBody>
          </Card>
        </Section>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        eyebrow="Usuarios"
        title="Gestión de roles"
        description="Participante A · participante.a@example.com"
        data-testid="kit-dialog"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="kit-dialog-cancel">
              Cancelar
            </Button>
            <Button onClick={() => setDialogOpen(false)} data-testid="kit-dialog-save">
              Asignar rol
            </Button>
          </>
        }
      >
        <Field label="Rol">
          <Select data-testid="kit-dialog-role">
            {ROLES.map((role) => (
              <option key={role}>{role}</option>
            ))}
          </Select>
        </Field>
        <Field label="Colegio">
          <Select data-testid="kit-dialog-school">
            {SCHOOLS.map((school) => (
              <option key={school}>{school}</option>
            ))}
          </Select>
        </Field>
      </Dialog>
      {confirmDialog}
    </MainLayout>
  );
}
