import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useUser, useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '../../components/layout/MainLayout';
import { getUserPrimaryRole } from '../../utils/roleUtils';
import { formatEventDate, formatDateForInput } from '../../utils/dateUtils';
import { toast } from 'react-hot-toast';

interface Event {
  id?: string;
  title: string;
  location: string;
  date_start: string;
  date_end?: string;
  time?: string;
  description?: string;
  link_url?: string;
  link_display?: string;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
}

export default function EventsManagement() {
  const router = useRouter();
  const user = useUser();
  const supabase = useSupabaseClient();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Event>({
    title: '',
    location: '',
    date_start: '',
    date_end: '',
    time: '',
    description: '',
    link_url: '',
    link_display: '',
    is_published: true
  });

  useEffect(() => {
    checkAuthorization();
  }, [user]);

  useEffect(() => {
    if (isAuthorized) {
      fetchEvents();
    }
  }, [isAuthorized]);

  const checkAuthorization = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    const primaryRole = await getUserPrimaryRole(user.id);
    if (!['admin', 'community_manager'].includes(primaryRole)) {
      router.push('/dashboard');
      return;
    }

    setUserRole(primaryRole);
    setIsAuthorized(true);
  };

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('date_start', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.title || !formData.location || !formData.date_start) {
      toast.error('Por favor completa todos los campos requeridos');
      return;
    }
    
    try {
      // Process the URL to ensure it has a protocol
      let processedUrl = formData.link_url;
      if (processedUrl && !processedUrl.match(/^https?:\/\//i)) {
        processedUrl = 'https://' + processedUrl;
      }

      const eventData: any = {
        title: formData.title,
        location: formData.location,
        date_start: formData.date_start,
        date_end: formData.date_end || null,  // Convert empty string to null
        time: formData.time || null,  // Convert empty string to null
        description: formData.description || null,  // Convert empty string to null
        link_url: processedUrl || null,
        link_display: formData.link_display || null,  // Convert empty string to null
        is_published: formData.is_published
      };

      if (editingEvent?.id) {
        // Update existing event - DO NOT include created_by in updates
        console.log('Updating event:', editingEvent.id, eventData);
        
        const { data: updatedEvent, error } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', editingEvent.id)
          .select()
          .single();

        if (error) {
          console.error('Update error details:', error);
          throw error;
        }
        
        console.log('Event updated successfully:', updatedEvent);
        
        // Update the local state immediately with the returned data
        setEvents(prevEvents => 
          prevEvents.map(event => 
            event.id === editingEvent.id ? updatedEvent : event
          )
        );
        
        toast.success('Evento actualizado exitosamente. La línea de tiempo se actualizará automáticamente.', {
          duration: 5000,
          icon: '✅'
        });
      } else {
        // Create new event - include created_by only for new events
        eventData.created_by = user?.id;
        
        const { data: newEvent, error } = await supabase
          .from('events')
          .insert([eventData])
          .select()
          .single();

        if (error) {
          console.error('Insert error details:', error);
          throw error;
        }
        
        console.log('Event created successfully:', newEvent);
        
        // Add the new event to the local state immediately
        setEvents(prevEvents => [newEvent, ...prevEvents]);
        
        toast.success('Evento creado exitosamente');
      }

      setShowModal(false);
      resetForm();
      
      // Refresh the events list to ensure consistency
      setTimeout(() => {
        fetchEvents();
      }, 500);
      
    } catch (error: any) {
      console.error('Error saving event:', error);
      const errorMessage = error?.message || 'Error al guardar el evento';
      toast.error(errorMessage);
    }
  };

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
    
    setFormData({
      ...event,
      date_start: formatDateForInput(event.date_start),
      date_end: formatDateForInput(event.date_end),
      // Ensure other fields are properly set
      time: event.time || '',
      description: event.description || '',
      link_url: event.link_url || '',
      link_display: event.link_display || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    setDeletingEventId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deletingEventId) return;

    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', deletingEventId);

      if (error) throw error;
      
      toast.success('Evento eliminado exitosamente');
      fetchEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Error al eliminar el evento');
    } finally {
      setShowDeleteConfirm(false);
      setDeletingEventId(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeletingEventId(null);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      location: '',
      date_start: '',
      date_end: '',
      time: '',
      description: '',
      link_url: '',
      link_display: '',
      is_published: true
    });
    setEditingEvent(null);
  };


  if (!isAuthorized || loading) {
    return (
      <MainLayout
        user={user}
        isAdmin={userRole === 'admin'}
        userRole={userRole}
        currentPage="Eventos"
      >
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      user={user}
      isAdmin={userRole === 'admin'}
      userRole={userRole}
      currentPage="Eventos"
    >
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800">Gestión de Eventos</h1>
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Nuevo Evento
            </button>
          </div>

          {/* Events List */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Título
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ubicación
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatEventDate(event.date_start)}
                        {event.date_end && ` - ${formatEventDate(event.date_end)}`}
                      </div>
                      {event.time && (
                        <div className="text-xs text-gray-500">{event.time}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{event.title}</div>
                      {event.description && (
                        <div className="text-xs text-gray-500 truncate max-w-xs">
                          {event.description}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{event.location}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        event.is_published 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {event.is_published ? 'Publicado' : 'Borrador'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEdit(event)}
                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(event.id!)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3 text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                  <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">
                  Eliminar Evento
                </h3>
                <div className="mt-2 px-7 py-3">
                  <p className="text-sm text-gray-500">
                    ¿Estás seguro de que quieres eliminar este evento?
                  </p>
                  {deletingEventId && events.find(e => e.id === deletingEventId) && (
                    <p className="text-sm font-medium text-gray-900 mt-2">
                      "{events.find(e => e.id === deletingEventId)?.title}"
                    </p>
                  )}
                  <p className="text-sm text-gray-500 mt-2">
                    Esta acción no se puede deshacer.
                  </p>
                </div>
                <div className="items-center px-4 py-3">
                  <button
                    onClick={confirmDelete}
                    className="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    Eliminar
                  </button>
                  <button
                    onClick={cancelDelete}
                    className="mt-3 px-4 py-2 bg-gray-100 text-gray-700 text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Form Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  {editingEvent ? 'Editar Evento' : 'Nuevo Evento'}
                </h3>
                
                <form onSubmit={handleSubmit}>
                  <div className="grid grid-cols-1 gap-4">
                    {/* Title */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Título *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      />
                    </div>

                    {/* Location */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Ubicación *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        placeholder="ej: Santiago, Chile o Virtual"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      />
                    </div>

                    {/* Date Range */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Fecha Inicio *
                        </label>
                        <input
                          type="date"
                          required
                          value={formData.date_start}
                          onChange={(e) => setFormData({ ...formData, date_start: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Fecha Fin (opcional)
                        </label>
                        <input
                          type="date"
                          value={formData.date_end || ''}
                          onChange={(e) => setFormData({ ...formData, date_end: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                      </div>
                    </div>

                    {/* Time */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Hora (opcional)
                      </label>
                      <input
                        type="text"
                        value={formData.time || ''}
                        onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                        placeholder="ej: 10:00 - 12:00"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Descripción
                      </label>
                      <textarea
                        rows={3}
                        value={formData.description || ''}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      />
                    </div>

                    {/* Link */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          URL del Enlace
                        </label>
                        <input
                          type="text"
                          value={formData.link_url || ''}
                          onChange={(e) => {
                            let url = e.target.value;
                            // Auto-add https:// if user enters a URL without protocol
                            if (url && !url.match(/^https?:\/\//i) && url.includes('.')) {
                              url = 'https://' + url;
                            }
                            setFormData({ ...formData, link_url: url });
                          }}
                          placeholder="ejemplo.com o https://ejemplo.com"
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Texto del Enlace
                        </label>
                        <input
                          type="text"
                          value={formData.link_display || ''}
                          onChange={(e) => setFormData({ ...formData, link_display: e.target.value })}
                          placeholder="ej: Inscríbete aquí"
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                      </div>
                    </div>

                    {/* Published Status */}
                    <div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.is_published}
                          onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                          className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">Publicado</span>
                      </label>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-6 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        resetForm();
                      }}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      {editingEvent ? 'Actualizar' : 'Crear'} Evento
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}