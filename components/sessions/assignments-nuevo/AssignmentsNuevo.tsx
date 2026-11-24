import React from 'react';
import { GraduationCap, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../ui/kit';
import type { BadgeTone } from '../../ui/kit';

/**
 * «Consultorías» (`/admin/consultant-assignments`) in the new look (redesign 6S, release SC), drawn only
 * for an account that chose it. It draws the page's own state and calls the page's own handlers, in
 * today's order and with today's words: the header with its search and main action, the two filters, the
 * four numbers (over every row, as today), the table and its two empty sentences. The one difference of
 * form: «Eliminar» asks its question in the kit's window instead of the browser's, and only its
 * «Confirmar» calls the page's deletion. The assignment pop-up is the page's own, drawn by the page.
 */

/** The fields of one assignment this view reads (the page's own type has more). */
export interface AssignmentRow {
  id: string;
  consultant_id: string;
  assignment_type: string;
  is_active: boolean;
  starts_at?: string;
  ends_at?: string;
  consultant?: { first_name: string; last_name: string; email: string } | null;
  student?: { first_name: string; last_name: string; email: string } | null;
  school?: { name: string } | null;
  generation?: { name: string } | null;
  community?: { name: string } | null;
  affected_students_count?: number;
}

export interface AssignmentsNuevoProps<T extends AssignmentRow> {
  assignments: T[];
  filteredAssignments: T[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterType: string;
  onFilterTypeChange: (value: string) => void;
  filterStatus: string;
  onFilterStatusChange: (value: string) => void;
  assignmentTypeLabels: Record<string, string>;
  getPermissionBadges: (assignment: T) => string[];
  formatDateTime: (dateString?: string) => string;
  isAssignmentActive: (assignment: T) => boolean;
  onCreate: () => void;
  onEdit: (assignment: T) => void;
  /** The deletion itself, without a question (the page's handler asks the browser's in today's look). */
  onDeleteConfirmed: (assignmentId: string) => void | Promise<void>;
}

const LABEL = 'font-mont text-[0.625rem] font-bold uppercase tracking-[0.14em] text-gray-600';

// The type pill: the complete assignment stands out; the other types are plain words.
const TYPE_TONE: Record<string, BadgeTone> = {
  comprehensive: 'accent',
};

export default function AssignmentsNuevo<T extends AssignmentRow>({
  assignments,
  filteredAssignments,
  searchTerm,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterStatus,
  onFilterStatusChange,
  assignmentTypeLabels,
  getPermissionBadges,
  formatDateTime,
  isAssignmentActive,
  onCreate,
  onEdit,
  onDeleteConfirmed,
}: AssignmentsNuevoProps<T>) {
  const [toDelete, setToDelete] = React.useState<string | null>(null);

  const stats = [
    { label: 'Asignaciones Activas', value: assignments.filter((a) => a.is_active).length },
    { label: 'Completas', value: assignments.filter((a) => a.assignment_type === 'comprehensive').length },
    { label: 'Consultores Únicos', value: new Set(assignments.map((a) => a.consultant_id)).size },
    { label: 'Estudiantes Afectados', value: assignments.reduce((total, a) => total + (a.affected_students_count || 1), 0) },
  ];

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-8 sm:px-6 lg:px-8" data-testid="assignments-nuevo">
      <PageHeader
        icon={<GraduationCap className="h-6 w-6" />}
        title="Consultorías"
        description="Gestión de asignaciones consultor-estudiante para seguimiento y mentorías"
        searchValue={searchTerm}
        onSearchChange={onSearchChange}
        searchPlaceholder="Buscar por nombre o email..."
        primaryAction={{ label: 'Nueva Asignación', onClick: onCreate, icon: <Plus className="h-4 w-4" aria-hidden="true" /> }}
      />

      {/* Filters: today's two lists, named for screen readers. */}
      <div className="grid gap-3 sm:grid-cols-2 md:max-w-xl">
        <Select value={filterType} onChange={(e) => onFilterTypeChange(e.target.value)} aria-label="Tipo">
          <option value="all">Todos los tipos</option>
          <option value="comprehensive">Completa</option>
          <option value="monitoring">Monitoreo</option>
          <option value="mentoring">Mentoría</option>
          <option value="evaluation">Evaluación</option>
          <option value="support">Apoyo</option>
        </Select>
        <Select value={filterStatus} onChange={(e) => onFilterStatusChange(e.target.value)} aria-label="Estado">
          <option value="all">Todas las asignaciones</option>
          <option value="active">Solo activas</option>
          <option value="inactive">Solo inactivas</option>
        </Select>
      </div>

      {/* The four numbers, over every assignment (not the filtered ones), as today. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardBody className="grid gap-1">
              <span className="text-2xl font-extrabold text-brand_primary">{stat.value}</span>
              <span className={`${LABEL} break-words`}>{stat.label}</span>
            </CardBody>
          </Card>
        ))}
      </div>

      <Table stackOnPhone>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Consultor</TableHeaderCell>
            <TableHeaderCell>Estudiante</TableHeaderCell>
            <TableHeaderCell>Tipo</TableHeaderCell>
            <TableHeaderCell>Permisos</TableHeaderCell>
            <TableHeaderCell>Duración</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            <TableHeaderCell>Acciones</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredAssignments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} primary className="text-center text-gray-600">
                {searchTerm || filterType !== 'all' || filterStatus !== 'all'
                  ? 'No se encontraron asignaciones que coincidan con los filtros.'
                  : 'No hay asignaciones creadas aún.'}
              </TableCell>
            </TableRow>
          ) : (
            filteredAssignments.map((assignment) => {
              const active = isAssignmentActive(assignment);
              const count = assignment.affected_students_count;
              return (
                <TableRow key={assignment.id}>
                  <TableCell primary>
                    <span className="grid min-w-0 gap-0.5 text-left">
                      <span className="break-words font-semibold">
                        {assignment.consultant?.first_name || assignment.consultant?.last_name
                          ? `${assignment.consultant?.first_name || ''} ${assignment.consultant?.last_name || ''}`.trim()
                          : 'Sin nombre'}
                      </span>
                      <span className="break-all text-xs text-gray-600">{assignment.consultant?.email || 'Sin email'}</span>
                    </span>
                  </TableCell>
                  <TableCell label="Estudiante">
                    {assignment.student ? (
                      <span className="grid min-w-0 gap-0.5">
                        <span className="break-words font-semibold">
                          {assignment.student.first_name} {assignment.student.last_name}
                        </span>
                        <span className="break-all text-xs text-gray-600">{assignment.student.email}</span>
                      </span>
                    ) : (
                      <span className="grid min-w-0 gap-0.5">
                        <span className="break-words font-semibold">
                          {assignment.community
                            ? `Comunidad: ${assignment.community.name}`
                            : assignment.generation
                              ? `Generación: ${assignment.generation.name}`
                              : assignment.school
                                ? `Escuela: ${assignment.school.name}`
                                : 'Asignación Grupal'}
                        </span>
                        <span className="text-xs text-gray-600">
                          {count} estudiante{count !== 1 ? 's' : ''} afectado{count !== 1 ? 's' : ''}
                        </span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell label="Tipo">
                    <Badge tone={TYPE_TONE[assignment.assignment_type] ?? 'neutral'} plain>
                      {assignmentTypeLabels[assignment.assignment_type] || assignment.assignment_type}
                    </Badge>
                  </TableCell>
                  <TableCell label="Permisos">
                    <span className="inline-flex flex-wrap justify-end gap-1 min-[761px]:justify-start">
                      {getPermissionBadges(assignment).map((permission, index) => (
                        <Badge key={index} tone="neutral" plain>
                          {permission}
                        </Badge>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell label="Duración">
                    <span className="grid gap-0.5">
                      <span>Inicio: {formatDateTime(assignment.starts_at)}</span>
                      <span>Fin: {formatDateTime(assignment.ends_at)}</span>
                    </span>
                  </TableCell>
                  <TableCell label="Estado">
                    <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Activa' : 'Inactiva'}</Badge>
                  </TableCell>
                  <TableCell label="Acciones">
                    <span className="inline-flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => onEdit(assignment)}>
                        Editar
                      </Button>
                      <Button variant="danger-outline" onClick={() => setToDelete(assignment.id)}>
                        Eliminar
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={toDelete !== null}
        title="¿Está seguro de que desea eliminar esta asignación?"
        tone="danger"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const chosen = toDelete;
          setToDelete(null);
          if (chosen) void onDeleteConfirmed(chosen);
        }}
        data-testid="assignment-delete-confirm"
      />
    </div>
  );
}
