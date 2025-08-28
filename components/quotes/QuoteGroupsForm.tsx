import { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, Users, Plane, Home, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-hot-toast';

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

interface QuoteGroupsFormProps {
  quoteId?: string;
  groups: TravelGroup[];
  onChange: (groups: TravelGroup[]) => void;
  singleRoomPrice: number;
  doubleRoomPrice: number;
  onSingleRoomPriceChange: (price: number) => void;
  onDoubleRoomPriceChange: (price: number) => void;
}

export default function QuoteGroupsForm({ 
  quoteId, 
  groups, 
  onChange, 
  singleRoomPrice,
  doubleRoomPrice,
  onSingleRoomPriceChange,
  onDoubleRoomPriceChange
}: QuoteGroupsFormProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set([0]));

  // Calculate nights for a group
  const calculateNights = (arrival: string, departure: string): number => {
    if (!arrival || !departure) return 0;
    const arrivalDate = new Date(arrival);
    const departureDate = new Date(departure);
    const nights = Math.floor((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, nights);
  };

  // Add a new group
  const addGroup = () => {
    const newGroup: TravelGroup = {
      group_name: `Grupo ${groups.length + 1}`,
      num_participants: 1,
      arrival_date: '',
      departure_date: '',
      flight_price: 0,
      room_type: 'double',
      room_price_per_night: doubleRoomPrice
    };
    onChange([...groups, newGroup]);
    setExpandedGroups(new Set([...expandedGroups, groups.length]));
  };

  // Remove a group
  const removeGroup = (index: number) => {
    if (groups.length === 1) {
      toast.error('Debe mantener al menos un grupo');
      return;
    }
    const newGroups = groups.filter((_, i) => i !== index);
    onChange(newGroups);
  };

  // Update a specific group
  const updateGroup = (index: number, field: keyof TravelGroup, value: any) => {
    const updatedGroups = [...groups];
    updatedGroups[index] = {
      ...updatedGroups[index],
      [field]: value
    };

    // Update room price when room type changes
    if (field === 'room_type') {
      updatedGroups[index].room_price_per_night = value === 'single' ? singleRoomPrice : doubleRoomPrice;
    }

    // Calculate nights if dates change
    if (field === 'arrival_date' || field === 'departure_date') {
      const nights = calculateNights(
        field === 'arrival_date' ? value : updatedGroups[index].arrival_date,
        field === 'departure_date' ? value : updatedGroups[index].departure_date
      );
      updatedGroups[index].nights = nights;
    }

    onChange(updatedGroups);
  };

  // Toggle group expansion
  const toggleGroupExpansion = (index: number) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedGroups(newExpanded);
  };

  // Calculate totals for summary
  const calculateTotals = () => {
    let totalParticipants = 0;
    let totalFlights = 0;
    let totalAccommodation = 0;

    groups.forEach(group => {
      const nights = calculateNights(group.arrival_date, group.departure_date);
      totalParticipants += group.num_participants;
      totalFlights += group.flight_price * group.num_participants;
      totalAccommodation += nights * group.room_price_per_night * group.num_participants;
    });

    return { totalParticipants, totalFlights, totalAccommodation };
  };

  const totals = calculateTotals();

  return (
    <div className="space-y-6">
      {/* Room Prices Configuration */}
      <div className="bg-gray-50 rounded-2xl p-6 border-2 border-gray-200">
        <h3 className="text-lg font-bold mb-4 flex items-center">
          <Home className="mr-2" size={20} />
          Configuración de Precios de Habitación
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Precio Habitación Individual (CLP por noche)
            </label>
            <input
              type="number"
              value={singleRoomPrice}
              onChange={(e) => onSingleRoomPriceChange(Number(e.target.value))}
              min="0"
              step="1000"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
              placeholder="Ej: 150000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Precio Habitación Doble (CLP por noche)
            </label>
            <input
              type="number"
              value={doubleRoomPrice}
              onChange={(e) => onDoubleRoomPriceChange(Number(e.target.value))}
              min="0"
              step="1000"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
              placeholder="Ej: 100000"
            />
          </div>
        </div>
      </div>

      {/* Travel Groups */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">Grupos de Viaje</h3>
          <button
            type="button"
            onClick={addGroup}
            className="flex items-center px-4 py-2 bg-black text-white rounded-full hover:bg-gray-800 transition-colors"
          >
            <Plus className="mr-2" size={18} />
            Agregar Grupo
          </button>
        </div>

        {groups.map((group, index) => (
          <div key={index} className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden">
            {/* Group Header */}
            <div 
              className="p-6 bg-gray-50 cursor-pointer flex items-center justify-between"
              onClick={() => toggleGroupExpansion(index)}
            >
              <div className="flex items-center space-x-4">
                <h4 className="font-bold text-lg">{group.group_name || `Grupo ${index + 1}`}</h4>
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <span className="flex items-center">
                    <Users className="mr-1" size={16} />
                    {group.num_participants} personas
                  </span>
                  {group.arrival_date && group.departure_date && (
                    <span className="flex items-center">
                      <Calendar className="mr-1" size={16} />
                      {calculateNights(group.arrival_date, group.departure_date)} noches
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {groups.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeGroup(index);
                    }}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                {expandedGroups.has(index) ? (
                  <ChevronUp size={20} />
                ) : (
                  <ChevronDown size={20} />
                )}
              </div>
            </div>

            {/* Group Details (Collapsible) */}
            {expandedGroups.has(index) && (
              <div className="p-6 space-y-6">
                {/* Group Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre del Grupo (Opcional)
                  </label>
                  <input
                    type="text"
                    value={group.group_name}
                    onChange={(e) => updateGroup(index, 'group_name', e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
                    placeholder="Ej: Primera Semana, Grupo A, etc."
                  />
                </div>

                {/* Number of Participants */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Número de Participantes
                  </label>
                  <input
                    type="number"
                    value={group.num_participants}
                    onChange={(e) => updateGroup(index, 'num_participants', Number(e.target.value))}
                    min="1"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
                  />
                </div>

                {/* Travel Dates */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha de Llegada
                    </label>
                    <input
                      type="date"
                      value={group.arrival_date}
                      onChange={(e) => updateGroup(index, 'arrival_date', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha de Salida
                    </label>
                    <input
                      type="date"
                      value={group.departure_date}
                      onChange={(e) => updateGroup(index, 'departure_date', e.target.value)}
                      min={group.arrival_date}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Show calculated nights */}
                {group.arrival_date && group.departure_date && (
                  <div className="bg-blue-50 text-blue-900 px-4 py-3 rounded-lg">
                    <span className="font-medium">
                      {calculateNights(group.arrival_date, group.departure_date)} noches en Barcelona
                    </span>
                  </div>
                )}

                {/* Flight Price */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Plane className="inline mr-1" size={16} />
                    Precio del Vuelo por Persona (CLP)
                  </label>
                  <input
                    type="number"
                    value={group.flight_price}
                    onChange={(e) => updateGroup(index, 'flight_price', Number(e.target.value))}
                    min="0"
                    step="10000"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
                    placeholder="Ej: 800000"
                  />
                </div>

                {/* Room Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Habitación
                  </label>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div
                      onClick={() => updateGroup(index, 'room_type', 'single')}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        group.room_type === 'single'
                          ? 'border-black bg-black text-white'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div className="font-medium">Individual</div>
                      <div className="text-sm mt-1 opacity-80">
                        ${singleRoomPrice.toLocaleString('es-CL')} CLP/noche
                      </div>
                    </div>
                    <div
                      onClick={() => updateGroup(index, 'room_type', 'double')}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        group.room_type === 'double'
                          ? 'border-black bg-black text-white'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      <div className="font-medium">Doble</div>
                      <div className="text-sm mt-1 opacity-80">
                        ${doubleRoomPrice.toLocaleString('es-CL')} CLP/noche
                      </div>
                    </div>
                  </div>
                </div>

                {/* Group Subtotal */}
                {group.arrival_date && group.departure_date && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h5 className="font-medium mb-2">Subtotal del Grupo</h5>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Vuelos ({group.num_participants} × ${group.flight_price.toLocaleString('es-CL')})</span>
                        <span>${(group.flight_price * group.num_participants).toLocaleString('es-CL')} CLP</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Alojamiento ({calculateNights(group.arrival_date, group.departure_date)} noches × {group.num_participants} personas)</span>
                        <span>${(calculateNights(group.arrival_date, group.departure_date) * group.room_price_per_night * group.num_participants).toLocaleString('es-CL')} CLP</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      {groups.length > 1 && (
        <div className="bg-black text-white rounded-2xl p-6">
          <h4 className="text-lg font-bold mb-4">Resumen de Todos los Grupos</h4>
          <div className="grid md:grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold">{totals.totalParticipants}</div>
              <div className="text-sm opacity-80">Participantes Totales</div>
            </div>
            <div>
              <div className="text-2xl font-bold">${totals.totalFlights.toLocaleString('es-CL')}</div>
              <div className="text-sm opacity-80">Total Vuelos (CLP)</div>
            </div>
            <div>
              <div className="text-2xl font-bold">${totals.totalAccommodation.toLocaleString('es-CL')}</div>
              <div className="text-sm opacity-80">Total Alojamiento (CLP)</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}