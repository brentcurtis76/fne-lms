import React from 'react';
import { ResponsiveFunctionalPageHeader } from '../layout/FunctionalPageHeader';
import { Calendar, Save, Send, Plus, X, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SessionCreate, SessionCreateDecisions } from '../../hooks/useSessionCreate';

/**
 * Today's admin form «Programar Sesión», the classic view: the page's body moved out of
 * `pages/admin/sessions/create.tsx` unchanged (redesign 6, release SA). It draws only what
 * `useSessionCreate()` gives it and the decisions the page worked out with `decide()` after its
 * loading and refusal returns (each condition has one copy, in the hook); the frame (`MainLayout`)
 * and the loading and refusal screens stay in the page.
 */
export default function SessionCreateClasico({
  sessionCreate,
  decisions,
}: {
  sessionCreate: SessionCreate;
  decisions: SessionCreateDecisions;
}) {
  const {
    schools,
    communities,
    consultantsError,
    hourTypes,
    contratos,
    selectedHourTypeKey,
    selectedContratoId,
    availableHours,
    availableHoursLoading,
    formData,
    facilitators,
    isRecurring,
    recurrenceFrequency,
    recurrenceCount,
    customDates,
    previewDates,
    handleInputChange,
    handleModalityChange,
    handleRemoveFacilitator,
    handleToggleLead,
    handleToggleRole,
    handleAddCustomDate,
    handleRemoveCustomDate,
    handleSaveDraft,
    handleScheduleSession,
    retryConsultants,
    handleConsultantSelect,
    handleHourTypeChange,
    handleContratoChange,
    chooseSingleSession,
    chooseRecurringSeries,
    handleFrequencyChange,
    handleCountChange,
    handleCustomDateInput,
    handleZoomManagedChange,
  } = sessionCreate;
  const {
    zoomManagedAvailable,
    spainTimePreview,
    communitySelectDisabled,
    showHourTypesLoading,
    showHourTypesError,
    showHourTypeSelects,
    contratoSelectDisabled,
    showNoContratos,
    showHoursChip,
    hasHoursBucket,
    hoursLevel,
    showConsultants,
    showConsultantsLoading,
    showConsultantsError,
    showConsultantsEmpty,
    showFacilitators,
    consultantOf,
    facilitatorRoleLabel,
    showConsultantSelector,
    consultantSelectorDisabled,
    selectableConsultants,
    earliestDate,
    showRecurrence,
    showRecurrenceCount,
    showCustomDates,
    canRemoveCustomDate,
    showPreview,
    previewRow,
    showMeetingFields,
    showZoomManagedHelp,
    showManualMeetingFields,
    showLocation,
    showSeriesCountInButtons,
    draftDisabled,
    scheduleDisabled,
  } = decisions;

  return (
    <>
      <ResponsiveFunctionalPageHeader
        icon={<Calendar />}
        title="Programar Sesión"
        subtitle="Crear una nueva sesión de consultoría para una comunidad de crecimiento"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
          <p className="text-sm text-gray-600 mb-6">
            * Campos obligatorios
          </p>
          <div className="space-y-6">
            {/* Row 1: School + Community */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Colegio <span className="text-red-500">*</span>
                </label>
                <select
                  name="school_id"
                  value={formData.school_id}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  required
                >
                  <option value={0}>Seleccione un colegio</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comunidad de Crecimiento <span className="text-red-500">*</span>
                </label>
                <select
                  name="growth_community_id"
                  value={formData.growth_community_id}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  disabled={communitySelectDisabled}
                  required
                >
                  <option value="">Seleccione una comunidad</option>
                  {communities.map((community) => (
                    <option key={community.id} value={community.id}>
                      {community.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 1b: Tipo de Hora + Contrato (Hour Tracking) */}
            {showHourTypesLoading && (
              <p className="text-sm text-gray-500">Cargando tipos de hora...</p>
            )}
            {showHourTypesError && (
              <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                No se pudieron cargar los tipos de hora. La sesión puede crearse sin seguimiento de horas.
              </p>
            )}
            {showHourTypeSelects && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="hour-type-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Hora
                  </label>
                  <select
                    id="hour-type-select"
                    value={selectedHourTypeKey}
                    onChange={handleHourTypeChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  >
                    <option value="">Seleccione tipo de hora</option>
                    {hourTypes.map((ht) => (
                      <option key={ht.key} value={ht.key}>
                        {ht.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="contrato-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Contrato
                  </label>
                  <select
                    id="contrato-select"
                    value={selectedContratoId}
                    onChange={handleContratoChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                    disabled={contratoSelectDisabled}
                  >
                    <option value="">Seleccione un contrato</option>
                    {contratos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                  {showNoContratos && (
                    <p className="text-xs text-gray-500 mt-1">
                      No hay contratos activos para este colegio.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Available hours badge — three-state: green (healthy), yellow (<25%), red (0) */}
            {showHoursChip && (
              <div className="flex items-center gap-2">
                {availableHoursLoading ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-gray-100 text-gray-600">
                    Cargando horas disponibles...
                  </span>
                ) : hasHoursBucket ? (() => {
                  const { isExhausted, isWarning } = hoursLevel(availableHours as number);
                  const badgeClass = isExhausted
                    ? 'bg-red-100 text-red-800'
                    : isWarning
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-green-100 text-green-800';
                  const badgeText = isExhausted
                    ? 'Sin horas disponibles en este tipo (se registrará como sobrepresupuesto)'
                    : isWarning
                    ? `${(availableHours as number).toFixed(1)} horas disponibles en este tipo — ¡Quedan menos del 25%!`
                    : `${(availableHours as number).toFixed(1)} horas disponibles en este tipo`;
                  return (
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${badgeClass}`}>
                      {badgeText}
                    </span>
                  );
                })() : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                    No hay asignación de horas para este tipo en el contrato seleccionado
                  </span>
                )}
              </div>
            )}

            {/* Row 2 (Moved from Row 9): Consultants */}
            {showConsultants && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Consultor(es) asignados <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-600 mb-3">
                  Debe asignar al menos un consultor antes de crear la sesión.
                </p>

                {/* Loading state */}
                {showConsultantsLoading && (
                  <div className="flex items-center justify-center p-4 bg-gray-50 rounded-lg mb-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand_accent mr-2"></div>
                    <span className="text-sm text-gray-700">Cargando consultores...</span>
                  </div>
                )}

                {/* Error state */}
                {showConsultantsError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-red-800">Error al cargar consultores</h4>
                        <p className="text-sm text-red-700 mt-1">{consultantsError}</p>
                      </div>
                      <button
                        type="button"
                        onClick={retryConsultants}
                        className="ml-2 px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Reintentar
                      </button>
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {showConsultantsEmpty && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                    <p className="text-sm text-yellow-800">
                      No hay consultores disponibles para este colegio. Verifique que existan usuarios con rol activo de consultor.
                    </p>
                  </div>
                )}

                {/* Current facilitators list */}
                {showFacilitators && (
                  <div className="mb-4 space-y-2">
                    {facilitators.map((facilitator) => {
                      const consultant = consultantOf(facilitator);
                      if (!consultant) return null;

                      return (
                        <div
                          key={facilitator.user_id}
                          className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">
                              {consultant.first_name} {consultant.last_name}
                            </div>
                            <div className="text-sm text-gray-500">{consultant.email}</div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => handleToggleRole(facilitator.user_id)}
                              className="px-2 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300"
                            >
                              {facilitatorRoleLabel(facilitator)}
                            </button>

                            <label className="flex items-center text-sm">
                              <input
                                type="checkbox"
                                checked={facilitator.is_lead}
                                onChange={() => handleToggleLead(facilitator.user_id)}
                                className="mr-1"
                              />
                              Consultor principal
                            </label>

                            <button
                              type="button"
                              onClick={() => handleRemoveFacilitator(facilitator.user_id)}
                              aria-label={`Quitar consultor ${consultant.first_name} ${consultant.last_name}`}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Quitar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Consultant selector */}
                {showConsultantSelector && (
                  <select
                    onChange={handleConsultantSelect}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                    disabled={consultantSelectorDisabled}
                  >
                    <option value="">Agregar consultor...</option>
                    {selectableConsultants()
                      .map((consultant) => (
                        <option key={consultant.id} value={consultant.id}>
                          {consultant.first_name} {consultant.last_name} ({consultant.email})
                        </option>
                      ))}
                  </select>
                )}
              </div>
            )}

            {/* Row 2: Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Título de la Sesión <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                maxLength={200}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                placeholder="Ej: Sesión de planificación trimestral"
                required
              />
            </div>

            {/* Row 3: Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                placeholder="Descripción de la sesión..."
              />
            </div>

            {/* Row 4: Objectives */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Objetivos
              </label>
              <textarea
                name="objectives"
                value={formData.objectives}
                onChange={handleInputChange}
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                placeholder="Objetivos de la sesión..."
              />
            </div>

            {/* Row 5: Date + Times */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="session_date"
                  value={formData.session_date}
                  onChange={handleInputChange}
                  min={earliestDate()}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hora de inicio <span className="text-gray-500 font-normal">(hora Chile)</span>{' '}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  name="start_time"
                  value={formData.start_time}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hora de término <span className="text-gray-500 font-normal">(hora Chile)</span>{' '}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  name="end_time"
                  value={formData.end_time}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  required
                />
              </div>
            </div>

            {/*
              Spain preview: the session is scheduled in Chile time but partly
              delivered from Spain, and the offset shifts twice a year in each
              hemisphere. Read-only and derived on every render — nothing about
              Spain is stored or submitted. Renders only once a date is chosen,
              because without one there is no offset to be right about.
            */}
            {spainTimePreview && (
              <p
                data-testid="create-session-spain-preview"
                className="text-sm text-gray-600 -mt-2"
              >
                En España: <span className="font-medium">{spainTimePreview}</span>
              </p>
            )}

            {/* Row 6: Recurrence Toggle */}
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de sesión
              </legend>
              <div className="flex space-x-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    checked={!isRecurring}
                    onChange={chooseSingleSession}
                    className="w-4 h-4 text-brand_accent border-gray-300 focus:ring-brand_accent mr-2"
                  />
                  <span>Sesión única</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    checked={isRecurring}
                    onChange={chooseRecurringSeries}
                    className="w-4 h-4 text-brand_accent border-gray-300 focus:ring-brand_accent mr-2"
                  />
                  <span>Serie recurrente</span>
                </label>
              </div>
            </fieldset>

            {/* Row 7: Recurrence Settings (conditional) */}
            {showRecurrence && (
              <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded-lg space-y-4">
                <h4 className="font-medium text-gray-900">Configuración de recurrencia</h4>

                {/* Frequency Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Frecuencia
                  </label>
                  <select
                    value={recurrenceFrequency}
                    onChange={handleFrequencyChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  >
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="monthly">Mensual</option>
                    <option value="custom">Fechas personalizadas</option>
                  </select>
                </div>

                {/* Count Input (for non-custom) */}
                {showRecurrenceCount && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Número de sesiones (2-52)
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={52}
                      value={recurrenceCount}
                      onChange={handleCountChange}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                    />
                  </div>
                )}

                {/* Custom Dates Input */}
                {showCustomDates && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fechas personalizadas
                    </label>
                    <div className="space-y-2">
                      {customDates.map((date, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="date"
                            value={date}
                            onChange={(e) => handleCustomDateInput(index, e)}
                            min={earliestDate()}
                            className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                          />
                          {canRemoveCustomDate && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomDate(index)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded"
                              aria-label="Eliminar fecha"
                            >
                              <X size={20} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCustomDate}
                      className="mt-2 inline-flex items-center px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
                    >
                      <Plus size={16} className="mr-1" />
                      Agregar fecha
                    </button>
                  </div>
                )}

                {/* Preview Panel */}
                {showPreview && (
                  <div className="bg-white p-4 rounded border border-gray-200">
                    <h5 className="text-sm font-medium text-gray-700 mb-2">
                      Vista previa ({previewDates.length} sesiones)
                    </h5>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {previewDates.map((date, index) => {
                        const { parsedDate, isWeekend } = previewRow(date);

                        return (
                          <div
                            key={index}
                            className={`flex items-center justify-between text-sm p-2 rounded ${
                              isWeekend ? 'bg-yellow-50 text-yellow-900' : 'bg-gray-50'
                            }`}
                          >
                            <span className="font-medium">Sesión {index + 1}</span>
                            <span>
                              {format(parsedDate, 'EEEE, dd MMMM yyyy', { locale: es })}
                            </span>
                            {isWeekend && (
                              <span className="flex items-center text-yellow-600 text-xs">
                                <AlertTriangle size={14} className="mr-1" />
                                Fin de semana
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Row 8: Modality */}
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-2">
                Modalidad <span className="text-red-500">*</span>
              </legend>
              <div className="flex space-x-4">
                {(['presencial', 'online', 'hibrida'] as const).map((mod) => (
                  <label key={mod} className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="modality"
                      value={mod}
                      checked={formData.modality === mod}
                      onChange={() => handleModalityChange(mod)}
                      className="w-4 h-4 text-brand_accent border-gray-300 focus:ring-brand_accent mr-2"
                    />
                    <span className="capitalize">{mod}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Row 7: Conditional - Meeting Link + Provider */}
            {showMeetingFields && (
              <div className="space-y-4">
                {zoomManagedAvailable && (
                  <div>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="is_zoom_managed"
                        data-testid="session-zoom-managed"
                        checked={formData.is_zoom_managed}
                        onChange={handleZoomManagedChange}
                        className="w-4 h-4 text-brand_accent border-gray-300 rounded focus:ring-brand_accent mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Generar reunión Zoom
                      </span>
                    </label>
                    {showZoomManagedHelp && (
                      <p
                        data-testid="session-zoom-managed-help"
                        className="mt-2 text-xs text-gray-500"
                      >
                        GENERA crea la reunión y su enlace cuando se apruebe la sesión.
                      </p>
                    )}
                  </div>
                )}

                {showManualMeetingFields && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Enlace de reunión <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="url"
                        name="meeting_link"
                        value={formData.meeting_link}
                        onChange={handleInputChange}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                        placeholder="https://zoom.us/j/123456789"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Proveedor de reunión
                      </label>
                      <select
                        name="meeting_provider"
                        value={formData.meeting_provider}
                        onChange={handleInputChange}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                      >
                        <option value="">Auto-detectar</option>
                        <option value="zoom">Zoom</option>
                        <option value="google_meet">Google Meet</option>
                        <option value="teams">Microsoft Teams</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Row 8: Conditional - Location */}
            {showLocation && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ubicación <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  placeholder="Ej: Sala de profesores"
                />
              </div>
            )}


            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:justify-end space-y-2 sm:space-y-0 sm:space-x-4 pt-6 border-t">
              <button
                onClick={handleSaveDraft}
                disabled={draftDisabled}
                className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <Save size={20} className="mr-2" />
                {showSeriesCountInButtons
                  ? `Guardar serie como borrador (${previewDates.length} sesiones)`
                  : 'Guardar borrador'}
              </button>

              <button
                onClick={handleScheduleSession}
                disabled={scheduleDisabled}
                className="inline-flex items-center justify-center px-4 py-2 bg-brand_accent text-brand_primary font-semibold hover:bg-brand_accent_hover rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={20} className="mr-2" />
                {showSeriesCountInButtons
                  ? `Programar serie (${previewDates.length} sesiones)`
                  : 'Programar sesión'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
