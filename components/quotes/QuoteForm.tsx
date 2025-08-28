import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { Calendar, Users, Plane, Building, DollarSign, Save, Send, Eye, FileText, CheckCircle } from 'lucide-react';

interface Program {
  id: string;
  name: string;
  description: string;
  price: number;
  pdf_url: string | null;
  display_order: number;
}

interface QuoteFormProps {
  initialData?: any;
  onSubmit: (data: any) => Promise<void>;
  isEditing?: boolean;
}

export default function QuoteForm({ initialData, onSubmit, isEditing = false }: QuoteFormProps) {
  const [loading, setLoading] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [formData, setFormData] = useState({
    // Client Information
    client_name: initialData?.client_name || '',
    client_email: initialData?.client_email || '',
    client_phone: initialData?.client_phone || '',
    client_institution: initialData?.client_institution || '',
    
    // Travel Details
    arrival_date: initialData?.arrival_date || '',
    departure_date: initialData?.departure_date || '',
    
    // Flight Information
    flight_price: initialData?.flight_price || 0,
    flight_notes: initialData?.flight_notes || '',
    
    // Accommodation Details
    room_type: initialData?.room_type || 'double',
    single_room_price: initialData?.single_room_price || 450,
    double_room_price: initialData?.double_room_price || 350,
    num_pasantes: initialData?.num_pasantes || 1,
    
    // Program Selection
    selected_programs: initialData?.selected_programs || [],
    
    // Additional Information
    notes: initialData?.notes || 'Los valores de pasajes y estadía son referenciales. El precio definitivo a pagar se debe actualizar el día que se firme el contrato y realice el primer pago.',
    internal_notes: initialData?.internal_notes || '',
    
    // Status
    status: initialData?.status || 'draft',
    valid_until: initialData?.valid_until || ''
  });

  // Calculate nights
  const nights = useMemo(() => {
    if (formData.arrival_date && formData.departure_date) {
      const arrival = new Date(formData.arrival_date);
      const departure = new Date(formData.departure_date);
      const diffTime = Math.abs(departure.getTime() - arrival.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 0;
    }
    return 0;
  }, [formData.arrival_date, formData.departure_date]);

  // Calculate totals
  const calculations = useMemo(() => {
    const roomPrice = formData.room_type === 'single' 
      ? formData.single_room_price 
      : formData.double_room_price;
    
    const accommodationTotal = nights * roomPrice * formData.num_pasantes;
    
    const programTotal = programs
      .filter(p => formData.selected_programs.includes(p.id))
      .reduce((sum, p) => sum + p.price, 0) * formData.num_pasantes;
    
    const totalPerPerson = (Number(formData.flight_price) || 0) + 
                           (accommodationTotal / formData.num_pasantes) + 
                           (programTotal / formData.num_pasantes);
    
    const grandTotal = totalPerPerson * formData.num_pasantes;
    
    return {
      accommodationTotal,
      programTotal,
      totalPerPerson,
      grandTotal
    };
  }, [nights, formData, programs]);

  // Load programs on mount
  useEffect(() => {
    fetchPrograms();
  }, []);

  const fetchPrograms = async () => {
    try {
      const response = await fetch('/api/quotes/programs');
      const data = await response.json();
      if (data.programs) {
        setPrograms(data.programs);
      }
    } catch (error) {
      console.error('Error fetching programs:', error);
      toast.error('Error al cargar los programas');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  const handleProgramToggle = (programId: string) => {
    setFormData(prev => ({
      ...prev,
      selected_programs: prev.selected_programs.includes(programId)
        ? prev.selected_programs.filter((id: string) => id !== programId)
        : [...prev.selected_programs, programId]
    }));
  };

  const handleSubmit = async (e: React.FormEvent, action: 'save' | 'send' = 'save') => {
    e.preventDefault();
    
    if (!formData.client_name || !formData.arrival_date || !formData.departure_date) {
      toast.error('Por favor completa los campos requeridos');
      return;
    }
    
    if (new Date(formData.departure_date) <= new Date(formData.arrival_date)) {
      toast.error('La fecha de salida debe ser posterior a la fecha de llegada');
      return;
    }
    
    setLoading(true);
    try {
      const submitData = {
        ...formData,
        status: action === 'send' ? 'sent' : formData.status,
        ...calculations
      };
      
      await onSubmit(submitData);
      
      if (action === 'send') {
        toast.success('Cotización enviada exitosamente');
      } else {
        toast.success(isEditing ? 'Cotización actualizada' : 'Cotización guardada como borrador');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error('Error al guardar la cotización');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(e) => handleSubmit(e, 'save')} className="space-y-8">
      {/* Client Information */}
      <div className="bg-white rounded-2xl border-2 border-black p-8">
        <h3 className="text-2xl font-bold mb-6 flex items-center">
          <Building className="mr-3" size={28} />
          Información del Cliente
        </h3>
        
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
              placeholder="Nombre de la institución"
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
              placeholder="email@ejemplo.com"
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
              placeholder="+56 9 1234 5678"
            />
          </div>
        </div>
      </div>

      {/* Travel Details */}
      <div className="bg-white rounded-2xl border-2 border-black p-8">
        <h3 className="text-2xl font-bold mb-6 flex items-center">
          <Calendar className="mr-3" size={28} />
          Detalles del Viaje
        </h3>
        
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha de Llegada *
            </label>
            <input
              type="date"
              name="arrival_date"
              value={formData.arrival_date}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha de Salida *
            </label>
            <input
              type="date"
              name="departure_date"
              value={formData.departure_date}
              onChange={handleInputChange}
              required
              min={formData.arrival_date}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Noches en Barcelona
            </label>
            <div className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-lg font-bold text-lg">
              {nights} {nights === 1 ? 'noche' : 'noches'}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Número de Pasantes *
          </label>
          <div className="flex items-center space-x-4">
            <Users size={24} />
            <input
              type="number"
              name="num_pasantes"
              value={formData.num_pasantes}
              onChange={handleInputChange}
              required
              min="1"
              className="w-32 px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors text-center font-bold text-lg"
            />
            <span className="text-gray-600">personas</span>
          </div>
        </div>
      </div>

      {/* Flight Information */}
      <div className="bg-white rounded-2xl border-2 border-black p-8">
        <h3 className="text-2xl font-bold mb-6 flex items-center">
          <Plane className="mr-3" size={28} />
          Información de Vuelo
        </h3>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Precio Aproximado del Vuelo (CLP)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3.5 text-gray-500">$</span>
              <input
                type="number"
                name="flight_price"
                value={formData.flight_price}
                onChange={handleInputChange}
                step="1"
                min="0"
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
                placeholder="0"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notas sobre el Vuelo
            </label>
            <input
              type="text"
              name="flight_notes"
              value={formData.flight_notes}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
              placeholder="Ej: Vuelo directo Santiago-Barcelona"
            />
          </div>
        </div>
      </div>

      {/* Accommodation */}
      <div className="bg-white rounded-2xl border-2 border-black p-8">
        <h3 className="text-2xl font-bold mb-6 flex items-center">
          <Building className="mr-3" size={28} />
          Alojamiento
        </h3>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-4">
            Tipo de Habitación *
          </label>
          <div className="grid md:grid-cols-2 gap-4">
            <label className={`border-2 rounded-xl p-6 cursor-pointer transition-all ${
              formData.room_type === 'single' ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-gray-400'
            }`}>
              <input
                type="radio"
                name="room_type"
                value="single"
                checked={formData.room_type === 'single'}
                onChange={handleInputChange}
                className="sr-only"
              />
              <div className="font-bold text-lg mb-2">Habitación Individual</div>
              <div className="text-sm opacity-80">Una cama, baño privado</div>
            </label>
            
            <label className={`border-2 rounded-xl p-6 cursor-pointer transition-all ${
              formData.room_type === 'double' ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-gray-400'
            }`}>
              <input
                type="radio"
                name="room_type"
                value="double"
                checked={formData.room_type === 'double'}
                onChange={handleInputChange}
                className="sr-only"
              />
              <div className="font-bold text-lg mb-2">Habitación Doble</div>
              <div className="text-sm opacity-80">Dos camas, baño privado</div>
            </label>
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Precio Habitación Individual (CLP/noche)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3.5 text-gray-500">$</span>
              <input
                type="number"
                name="single_room_price"
                value={formData.single_room_price}
                onChange={handleInputChange}
                step="1"
                min="0"
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Precio Habitación Doble (CLP/noche)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3.5 text-gray-500">$</span>
              <input
                type="number"
                name="double_room_price"
                value={formData.double_room_price}
                onChange={handleInputChange}
                step="1"
                min="0"
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Programs */}
      <div className="bg-white rounded-2xl border-2 border-black p-8">
        <h3 className="text-2xl font-bold mb-6 flex items-center">
          <FileText className="mr-3" size={28} />
          Programas de Pasantía
        </h3>
        
        <div className="space-y-4">
          {programs.map((program) => (
            <div
              key={program.id}
              className={`border-2 rounded-xl p-6 cursor-pointer transition-all ${
                formData.selected_programs.includes(program.id)
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
              onClick={() => handleProgramToggle(program.id)}
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
          <div className="flex justify-between items-center pb-4 border-b border-white/20">
            <span>Vuelo:</span>
            <span className="font-bold">${(formData.flight_price || 0).toLocaleString('es-CL')} CLP</span>
          </div>
          
          <div className="flex justify-between items-center pb-4 border-b border-white/20">
            <span>Alojamiento ({nights} noches × ${
              (formData.room_type === 'single' ? formData.single_room_price : formData.double_room_price).toLocaleString('es-CL')
            } CLP):</span>
            <span className="font-bold">
              ${(calculations.accommodationTotal / formData.num_pasantes).toLocaleString('es-CL')} CLP
            </span>
          </div>
          
          <div className="flex justify-between items-center pb-4 border-b border-white/20">
            <span>Programas ({formData.selected_programs.length} seleccionados):</span>
            <span className="font-bold">
              ${(calculations.programTotal / formData.num_pasantes).toLocaleString('es-CL')} CLP
            </span>
          </div>
          
          <div className="flex justify-between items-center text-xl font-bold pt-4 border-t-2 border-white">
            <span>Total por Persona:</span>
            <span className="text-2xl">${calculations.totalPerPerson.toLocaleString('es-CL')} CLP</span>
          </div>
          
          {formData.num_pasantes > 1 && (
            <div className="flex justify-between items-center text-2xl font-bold pt-4 border-t-2 border-white bg-white/10 rounded-lg p-4 mt-4">
              <span>TOTAL GENERAL ({formData.num_pasantes} personas):</span>
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
          <Send className="mr-2" size={20} />
          Enviar Cotización
        </button>
      </div>
    </form>
  );
}