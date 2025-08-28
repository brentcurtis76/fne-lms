import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { Calendar, Users, Plane, Building, DollarSign, Save, Send, Eye, FileText, CheckCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import QuoteGroupsForm from './QuoteGroupsForm';

interface Program {
  id: string;
  name: string;
  description: string;
  price: number;
  pdf_url: string | null;
  display_order: number;
}

interface TravelGroup {
  id?: string;
  group_name: string;
  num_participants: number;
  arrival_date: string;
  departure_date: string;
  nights?: number;
  flight_price: number;
  room_type: 'single' | 'double';
  room_price_per_night: number;
  accommodation_total?: number;
  flight_total?: number;
}

interface QuoteFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void>;
  isEditing?: boolean;
}

export default function QuoteFormV2({ initialData, onSubmit, isEditing = false }: QuoteFormProps) {
  const [loading, setLoading] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [useGroups, setUseGroups] = useState(initialData?.use_groups || false);
  const [groups, setGroups] = useState<TravelGroup[]>([]);
  const [singleRoomPrice, setSingleRoomPrice] = useState(initialData?.single_room_price || 150000);
  const [doubleRoomPrice, setDoubleRoomPrice] = useState(initialData?.double_room_price || 100000);
  
  const [formData, setFormData] = useState({
    // Client Information
    client_name: initialData?.client_name || '',
    client_email: initialData?.client_email || '',
    client_phone: initialData?.client_phone || '',
    client_institution: initialData?.client_institution || '',
    
    // Legacy single group fields (for backwards compatibility)
    arrival_date: initialData?.arrival_date || '',
    departure_date: initialData?.departure_date || '',
    flight_price: initialData?.flight_price || 0,
    flight_notes: initialData?.flight_notes || '',
    room_type: initialData?.room_type || 'double',
    single_room_price: singleRoomPrice,
    double_room_price: doubleRoomPrice,
    num_pasantes: initialData?.num_pasantes || 1,
    
    // Program Selection
    selected_programs: initialData?.selected_programs || [],
    
    // Early Bird Discount
    apply_early_bird_discount: initialData?.apply_early_bird_discount || false,
    early_bird_payment_date: initialData?.early_bird_payment_date || '2025-09-30',
    
    // Additional Information
    notes: initialData?.notes || 'Los valores de pasajes y estadía son referenciales. El precio definitivo a pagar se debe actualizar el día que se firme el contrato y realice el primer pago.',
    internal_notes: initialData?.internal_notes || '',
    
    // Status
    status: initialData?.status || 'draft',
    valid_until: initialData?.valid_until || '',
    
    // New groups flag
    use_groups: useGroups
  });

  // Load programs on mount
  useEffect(() => {
    fetchPrograms();
    if (isEditing && initialData?.id) {
      fetchGroups(initialData.id);
    } else if (!isEditing) {
      // Initialize with one default group
      setGroups([{
        group_name: 'Grupo Principal',
        num_participants: 1,
        arrival_date: '',
        departure_date: '',
        flight_price: 0,
        room_type: 'double',
        room_price_per_night: doubleRoomPrice
      }]);
    }
  }, []);

  const fetchPrograms = async () => {
    try {
      const response = await fetch('/api/quotes/programs');
      const data = await response.json();
      if (data.programs) {
        setPrograms(data.programs);
      }
    } catch (error) {
      console.error('Error loading programs:', error);
    }
  };

  const fetchGroups = async (quoteId: string) => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/groups`);
      const data = await response.json();
      if (data.groups && data.groups.length > 0) {
        setGroups(data.groups);
        setUseGroups(true);
        setFormData(prev => ({ ...prev, use_groups: true }));
      }
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  // Calculate nights for single group mode
  const nights = useMemo(() => {
    if (!useGroups && formData.arrival_date && formData.departure_date) {
      const arrival = new Date(formData.arrival_date);
      const departure = new Date(formData.departure_date);
      const diffTime = Math.abs(departure.getTime() - arrival.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 0;
    }
    return 0;
  }, [useGroups, formData.arrival_date, formData.departure_date]);

  // Calculate totals
  const calculations = useMemo(() => {
    let accommodationTotal = 0;
    let flightTotal = 0;
    let totalParticipants = 0;
    let programTotal = 0;

    if (useGroups) {
      // Calculate from groups
      groups.forEach(group => {
        if (group.arrival_date && group.departure_date) {
          const arrival = new Date(group.arrival_date);
          const departure = new Date(group.departure_date);
          const nights = Math.floor((departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
          
          totalParticipants += group.num_participants;
          flightTotal += group.flight_price * group.num_participants;
          
          // Calculate accommodation based on room type for this group
          if (group.room_type === 'single') {
            // Single rooms: one room per person
            accommodationTotal += nights * group.room_price_per_night * group.num_participants;
          } else {
            // Double rooms: calculate number of rooms needed (2 people per room)
            const roomsNeeded = Math.ceil(group.num_participants / 2);
            accommodationTotal += nights * group.room_price_per_night * roomsNeeded;
          }
        }
      });
    } else {
      // Calculate from single group
      const roomPrice = formData.room_type === 'single' 
        ? formData.single_room_price 
        : formData.double_room_price;
      
      // Calculate accommodation based on room type
      if (formData.room_type === 'single') {
        // Single rooms: one room per person
        accommodationTotal = nights * roomPrice * formData.num_pasantes;
      } else {
        // Double rooms: calculate number of rooms needed (2 people per room)
        const roomsNeeded = Math.ceil(formData.num_pasantes / 2);
        accommodationTotal = nights * roomPrice * roomsNeeded;
      }
      
      flightTotal = (Number(formData.flight_price) || 0) * formData.num_pasantes;
      totalParticipants = formData.num_pasantes;
    }

    // Calculate program costs with potential discount
    const selectedPrograms = programs.filter(p => formData.selected_programs.includes(p.id));
    const originalProgramTotal = selectedPrograms.reduce((sum, p) => sum + p.price, 0) * totalParticipants;
    
    // Apply early bird discount if enabled ($500,000 CLP discount per program per person)
    let discountAmount = 0;
    if (formData.apply_early_bird_discount && selectedPrograms.length > 0) {
      discountAmount = 500000 * selectedPrograms.length * totalParticipants;
      programTotal = Math.max(0, originalProgramTotal - discountAmount);
    } else {
      programTotal = originalProgramTotal;
    }

    const totalPerPerson = totalParticipants > 0 
      ? (flightTotal + accommodationTotal + programTotal) / totalParticipants
      : 0;
    
    const grandTotal = flightTotal + accommodationTotal + programTotal;

    return {
      accommodationTotal,
      programTotal,
      originalProgramTotal,
      discountAmount,
      flightTotal,
      totalPerPerson,
      grandTotal,
      totalParticipants
    };
  }, [nights, formData, programs, groups, useGroups]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const toggleProgram = (programId: string) => {
    setFormData(prev => ({
      ...prev,
      selected_programs: prev.selected_programs.includes(programId)
        ? prev.selected_programs.filter((id: string) => id !== programId)
        : [...prev.selected_programs, programId]
    }));
  };

  const toggleGroupsMode = () => {
    const newUseGroups = !useGroups;
    setUseGroups(newUseGroups);
    setFormData(prev => ({ ...prev, use_groups: newUseGroups }));

    // If switching to groups mode and no groups exist, create one from existing data
    if (newUseGroups && groups.length === 0) {
      const initialGroup: TravelGroup = {
        group_name: 'Grupo Principal',
        num_participants: formData.num_pasantes,
        arrival_date: formData.arrival_date,
        departure_date: formData.departure_date,
        flight_price: formData.flight_price,
        room_type: formData.room_type,
        room_price_per_night: formData.room_type === 'single' ? singleRoomPrice : doubleRoomPrice
      };
      setGroups([initialGroup]);
    }
  };

  const handleSubmit = async (e: React.FormEvent, action: 'save' | 'send' | 'preview') => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData = {
        ...formData,
        use_groups: useGroups,
        single_room_price: singleRoomPrice,
        double_room_price: doubleRoomPrice,
        status: action === 'send' ? 'sent' : formData.status,
        groups: useGroups ? groups : undefined,
        // If using groups, calculate totals from groups
        num_pasantes: useGroups ? calculations.totalParticipants : formData.num_pasantes,
        grand_total: calculations.grandTotal,
        total_per_person: calculations.totalPerPerson
      };

      await onSubmit(submitData);
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(e) => handleSubmit(e, 'save')} className="space-y-8">
      {/* Client Information */}
      <div className="bg-white rounded-2xl border-2 border-black p-8">
        <h3 className="text-2xl font-bold mb-6">Información del Cliente</h3>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre del Cliente *
            </label>
            <input
              type="text"
              name="client_name"
              value={formData.client_name}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
              placeholder="Nombre completo o institución"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Institución
            </label>
            <input
              type="text"
              name="client_institution"
              value={formData.client_institution}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
              placeholder="Nombre de la escuela o institución"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              name="client_email"
              value={formData.client_email}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
              placeholder="correo@ejemplo.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Teléfono
            </label>
            <input
              type="tel"
              name="client_phone"
              value={formData.client_phone}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
              placeholder="+56 9 XXXX XXXX"
            />
          </div>
        </div>
      </div>

      {/* Groups Mode Toggle */}
      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-lg">Modo de Grupos de Viaje</h4>
            <p className="text-sm text-gray-600 mt-1">
              {useGroups 
                ? 'Permite múltiples grupos con diferentes fechas de viaje'
                : 'Un solo grupo con las mismas fechas para todos'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleGroupsMode}
            className="flex items-center space-x-2 px-4 py-2 bg-white rounded-full border-2 border-yellow-400 hover:bg-yellow-100 transition-colors"
          >
            {useGroups ? (
              <>
                <ToggleRight className="text-yellow-600" size={24} />
                <span className="font-medium">Grupos Múltiples</span>
              </>
            ) : (
              <>
                <ToggleLeft className="text-gray-400" size={24} />
                <span className="font-medium">Grupo Único</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Travel Details */}
      {useGroups ? (
        <QuoteGroupsForm
          quoteId={initialData?.id}
          groups={groups}
          onChange={setGroups}
          singleRoomPrice={singleRoomPrice}
          doubleRoomPrice={doubleRoomPrice}
          onSingleRoomPriceChange={setSingleRoomPrice}
          onDoubleRoomPriceChange={setDoubleRoomPrice}
        />
      ) : (
        // Original single group form
        <div className="bg-white rounded-2xl border-2 border-black p-8">
          <h3 className="text-2xl font-bold mb-6 flex items-center">
            <Calendar className="mr-3" size={28} />
            Detalles del Viaje
          </h3>
          
          <div className="space-y-6">
            {/* Travel Dates */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha de Llegada a Barcelona *
                </label>
                <input
                  type="date"
                  name="arrival_date"
                  value={formData.arrival_date}
                  onChange={handleInputChange}
                  required={!useGroups}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha de Salida de Barcelona *
                </label>
                <input
                  type="date"
                  name="departure_date"
                  value={formData.departure_date}
                  onChange={handleInputChange}
                  min={formData.arrival_date}
                  required={!useGroups}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
                />
              </div>
            </div>
            
            {/* Show calculated nights */}
            {nights > 0 && (
              <div className="bg-blue-50 text-blue-900 px-4 py-3 rounded-lg">
                <span className="font-medium">{nights} noches en Barcelona</span>
              </div>
            )}
            
            {/* Number of Participants */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                <Users className="mr-2" size={18} />
                Número de Pasantes *
              </label>
              <input
                type="number"
                name="num_pasantes"
                value={formData.num_pasantes}
                onChange={handleInputChange}
                min="1"
                required={!useGroups}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
              />
            </div>
            
            {/* Flight Price */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                <Plane className="mr-2" size={18} />
                Precio Aproximado del Vuelo (CLP)
              </label>
              <input
                type="number"
                name="flight_price"
                value={formData.flight_price}
                onChange={handleInputChange}
                min="0"
                step="10000"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
                placeholder="Precio por persona en CLP"
              />
            </div>
            
            {/* Room Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Tipo de Habitación
              </label>
              <div className="grid md:grid-cols-2 gap-4">
                <div
                  onClick={() => setFormData(prev => ({ ...prev, room_type: 'single' }))}
                  className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.room_type === 'single'
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <h4 className="font-bold text-lg mb-2">Habitación Individual</h4>
                  <div className="space-y-2">
                    <p className="text-sm opacity-80">Una cama, baño privado</p>
                    <div>
                      <label className={`block text-xs mb-1 ${
                        formData.room_type === 'single' ? 'text-white' : 'text-gray-500'
                      }`}>
                        Precio por noche (CLP):
                      </label>
                      <input
                        type="number"
                        value={singleRoomPrice}
                        onChange={(e) => setSingleRoomPrice(Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                        min="0"
                        step="1000"
                        className={`w-full px-3 py-2 rounded ${
                          formData.room_type === 'single'
                            ? 'bg-white/20 text-white border border-white/30'
                            : 'border border-gray-300'
                        }`}
                      />
                    </div>
                  </div>
                </div>
                
                <div
                  onClick={() => setFormData(prev => ({ ...prev, room_type: 'double' }))}
                  className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.room_type === 'double'
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <h4 className="font-bold text-lg mb-2">Habitación Doble</h4>
                  <div className="space-y-2">
                    <p className="text-sm opacity-80">Dos camas, baño privado</p>
                    <div>
                      <label className={`block text-xs mb-1 ${
                        formData.room_type === 'double' ? 'text-white' : 'text-gray-500'
                      }`}>
                        Precio por noche (CLP):
                      </label>
                      <input
                        type="number"
                        value={doubleRoomPrice}
                        onChange={(e) => setDoubleRoomPrice(Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                        min="0"
                        step="1000"
                        className={`w-full px-3 py-2 rounded ${
                          formData.room_type === 'double'
                            ? 'bg-white/20 text-white border border-white/30'
                            : 'border border-gray-300'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Early Bird Discount */}
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl border-2 border-orange-300 p-8">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-xl font-bold mb-2 flex items-center">
              🎉 Descuento por Pago Anticipado
            </h3>
            <p className="text-gray-700 mb-4">
              Aplica un descuento de <strong>$500.000 CLP por programa</strong> si el pago se realiza antes del 30 de septiembre de 2025.
            </p>
            <div className="bg-white/80 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="font-medium">Aplicar descuento por pago anticipado</label>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, apply_early_bird_discount: !prev.apply_early_bird_discount }))}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                    formData.apply_early_bird_discount ? 'bg-green-600' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    formData.apply_early_bird_discount ? 'translate-x-7' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              {formData.apply_early_bird_discount && (
                <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-800">
                    ✅ Se aplicará un descuento de <strong>${(calculations.discountAmount || 0).toLocaleString('es-CL')} CLP</strong> al total
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Fecha límite de pago: 30 de septiembre de 2025
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Programs Selection */}
      <div className="bg-white rounded-2xl border-2 border-black p-8">
        <h3 className="text-2xl font-bold mb-6 flex items-center">
          <Building className="mr-3" size={28} />
          Programas de Pasantía
        </h3>
        
        <div className="space-y-4">
          {programs.map((program) => (
            <div
              key={program.id}
              onClick={() => toggleProgram(program.id)}
              className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                formData.selected_programs.includes(program.id)
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <CheckCircle
                      className={`mr-3 ${
                        formData.selected_programs.includes(program.id)
                          ? 'text-white'
                          : 'text-gray-400'
                      }`}
                      size={24}
                    />
                    <h4 className="font-bold text-lg">{program.name}</h4>
                  </div>
                  {program.description && (
                    <p className={`text-sm ml-9 ${
                      formData.selected_programs.includes(program.id)
                        ? 'text-white/80'
                        : 'text-gray-600'
                    }`}>
                      {program.description}
                    </p>
                  )}
                  {program.pdf_url && (
                    <a
                      href={program.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center mt-2 ml-9 text-sm underline ${
                        formData.selected_programs.includes(program.id)
                          ? 'text-white/80 hover:text-white'
                          : 'text-blue-600 hover:text-blue-700'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Ver folleto →
                    </a>
                  )}
                </div>
                <div className="text-right ml-4">
                  <div className="text-2xl font-bold">
                    ${program.price.toLocaleString('es-CL')}
                  </div>
                  <div className="text-sm opacity-80">CLP por persona</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Additional Notes */}
      <div className="bg-white rounded-2xl border-2 border-black p-8">
        <h3 className="text-2xl font-bold mb-6">Notas Adicionales</h3>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notas para el Cliente
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors resize-none"
              placeholder="Información adicional visible para el cliente..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notas Internas
            </label>
            <textarea
              name="internal_notes"
              value={formData.internal_notes}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors resize-none"
              placeholder="Notas privadas, no visibles para el cliente..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Válido Hasta
            </label>
            <input
              type="date"
              name="valid_until"
              value={formData.valid_until}
              onChange={handleInputChange}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Totals Summary */}
      <div className="bg-black text-white rounded-2xl p-8">
        <h3 className="text-2xl font-bold mb-6 flex items-center">
          <DollarSign className="mr-3" size={28} />
          Resumen de Costos
        </h3>
        
        <div className="space-y-4 text-lg">
          {useGroups && calculations.totalParticipants > 0 && (
            <div className="flex justify-between items-center pb-4 border-b border-white/20">
              <span>Participantes Totales:</span>
              <span className="font-bold">{calculations.totalParticipants} personas</span>
            </div>
          )}
          
          <div className="flex justify-between items-center pb-4 border-b border-white/20">
            <span>Vuelos:</span>
            <span className="font-bold">${calculations.flightTotal.toLocaleString('es-CL')} CLP</span>
          </div>
          
          <div className="flex justify-between items-center pb-4 border-b border-white/20">
            <span>Alojamiento Total:</span>
            <span className="font-bold">
              ${calculations.accommodationTotal.toLocaleString('es-CL')} CLP
            </span>
          </div>
          
          <div className="flex justify-between items-center pb-4 border-b border-white/20">
            <span>Programas ({formData.selected_programs.length} seleccionados):</span>
            <div className="text-right">
              {formData.apply_early_bird_discount && calculations.discountAmount > 0 ? (
                <>
                  <div className="text-sm line-through opacity-60">
                    ${calculations.originalProgramTotal.toLocaleString('es-CL')} CLP
                  </div>
                  <div className="font-bold">
                    ${calculations.programTotal.toLocaleString('es-CL')} CLP
                  </div>
                </>
              ) : (
                <span className="font-bold">
                  ${calculations.programTotal.toLocaleString('es-CL')} CLP
                </span>
              )}
            </div>
          </div>
          
          {formData.apply_early_bird_discount && calculations.discountAmount > 0 && (
            <div className="flex justify-between items-center pb-4 border-b border-white/20 text-green-400">
              <span>🎉 Descuento por Pago Anticipado:</span>
              <span className="font-bold">
                -${calculations.discountAmount.toLocaleString('es-CL')} CLP
              </span>
            </div>
          )}
          
          <div className="flex justify-between items-center text-xl font-bold pt-4 border-t-2 border-white">
            <span>Total por Persona:</span>
            <span className="text-2xl">${calculations.totalPerPerson.toLocaleString('es-CL')} CLP</span>
          </div>
          
          {calculations.totalParticipants > 1 && (
            <div className="flex justify-between items-center text-2xl font-bold pt-4 border-t-2 border-white bg-white/10 rounded-lg p-4 mt-4">
              <span>TOTAL GENERAL ({calculations.totalParticipants} personas):</span>
              <span className="text-3xl">${calculations.grandTotal.toLocaleString('es-CL')} CLP</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-end">
        <button
          type="button"
          onClick={(e) => handleSubmit(e, 'save')}
          disabled={loading}
          className="flex items-center justify-center px-8 py-4 border-2 border-black rounded-full font-medium hover:bg-gray-100 transition-all duration-300 disabled:opacity-50"
        >
          <Save className="mr-2" size={20} />
          Guardar Borrador
        </button>
        
        <button
          type="button"
          onClick={(e) => handleSubmit(e, 'send')}
          disabled={loading}
          className="flex items-center justify-center px-8 py-4 bg-black text-white rounded-full font-medium hover:bg-gray-800 transition-all duration-300 disabled:opacity-50"
        >
          <Eye className="mr-2" size={20} />
          Generar Página Web
        </button>
      </div>
    </form>
  );
}