import React from 'react';
import { formatEventDate } from '../utils/dateUtils';

interface Event {
  id: string;
  title: string;
  location: string;
  date_start: string;
  date_end?: string;
  time?: string;
  description?: string;
  link_url?: string;
  link_display?: string;
  is_published: boolean;
}

interface EventsTimelineProps {
  pastEvents: Event[];
  futureEvents: Event[];
  loading?: boolean;
  isUpdating?: boolean;
}

export default function EventsTimeline({ pastEvents, futureEvents, loading, isUpdating }: EventsTimelineProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);
  const startX = React.useRef(0);
  const scrollLeft = React.useRef(0);
  
  // Handle mouse down on timeline
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    
    isDragging.current = true;
    startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
    scrollLeft.current = scrollContainerRef.current.scrollLeft;
    
    // Change cursor and prevent text selection
    scrollContainerRef.current.style.cursor = 'grabbing';
    scrollContainerRef.current.style.userSelect = 'none';
  };
  
  // Handle mouse move while dragging
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollContainerRef.current) return;
    
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5; // Multiply for faster scrolling
    scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;
  };
  
  // Handle mouse up
  const handleMouseUp = () => {
    if (!scrollContainerRef.current) return;
    
    isDragging.current = false;
    scrollContainerRef.current.style.cursor = 'grab';
    scrollContainerRef.current.style.userSelect = '';
  };
  
  // Handle mouse leave
  const handleMouseLeave = () => {
    if (!scrollContainerRef.current) return;
    
    isDragging.current = false;
    scrollContainerRef.current.style.cursor = 'grab';
    scrollContainerRef.current.style.userSelect = '';
  };
  
  // Touch event handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollContainerRef.current) return;
    
    isDragging.current = true;
    startX.current = e.touches[0].pageX - scrollContainerRef.current.offsetLeft;
    scrollLeft.current = scrollContainerRef.current.scrollLeft;
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || !scrollContainerRef.current) return;
    
    const x = e.touches[0].pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeft.current - walk;
  };
  
  const handleTouchEnd = () => {
    isDragging.current = false;
  };
  
  // Trigger animations and center the next future event when component mounts
  React.useEffect(() => {
    const timelineEvents = document.querySelectorAll('.timeline-event');
    timelineEvents.forEach((event, index) => {
      setTimeout(() => {
        const element = event as HTMLElement;
        element.classList.remove('opacity-0');
        element.classList.add('opacity-100');
        element.style.transition = 'opacity 0.5s ease-in-out';
      }, index * 100);
    });
    
    // Center the first future event (next upcoming event)
    if (scrollContainerRef.current && futureEvents.length > 0) {
      // Wait for DOM to be fully rendered
      setTimeout(() => {
        if (scrollContainerRef.current) {
          // Find all timeline event elements
          const eventElements = scrollContainerRef.current.querySelectorAll('.timeline-event');
          
          // The first future event is at index = pastEvents.length
          const firstFutureEventIndex = pastEvents.length;
          
          if (eventElements[firstFutureEventIndex]) {
            const targetEvent = eventElements[firstFutureEventIndex] as HTMLElement;
            
            // Get the event's position relative to the scroll container
            const eventRect = targetEvent.getBoundingClientRect();
            const containerRect = scrollContainerRef.current.getBoundingClientRect();
            
            // Calculate the event's position within the scrollable area
            const eventCenterInContainer = targetEvent.offsetLeft + (targetEvent.offsetWidth / 2);
            
            // Calculate scroll position to center the event
            const containerCenterX = scrollContainerRef.current.offsetWidth / 2;
            const scrollPosition = eventCenterInContainer - containerCenterX;
            
            // Scroll to center the event
            scrollContainerRef.current.scrollTo({
              left: Math.max(0, scrollPosition),
              behavior: 'smooth'
            });
          }
        }
      }, 500); // Give more time for full render
    }
  }, [pastEvents, futureEvents]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  if (pastEvents.length === 0 && futureEvents.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">No hay eventos disponibles en este momento.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Update indicator */}
      {isUpdating && (
        <div className="absolute top-0 right-0 z-20 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-bl-lg text-sm font-medium flex items-center">
          <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Actualizando eventos...
        </div>
      )}
      
      {/* Gradient overlay on edges for depth */}
      <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-gray-50 to-transparent z-10 pointer-events-none"></div>
      <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-gray-50 to-transparent z-10 pointer-events-none"></div>
      
      {/* Timeline Line with gradient */}
      <div className="absolute top-[280px] left-0 right-0 h-[3px] bg-gradient-to-r from-gray-200 via-gray-400 to-gray-200 timeline-line" style={{ zIndex: 1 }}></div>
      
      {/* Animated pulse on the line */}
      <div className="absolute top-[279px] left-0 h-[5px] w-40 bg-gradient-to-r from-transparent via-yellow-400 to-transparent opacity-50 animate-pulse" 
           style={{ 
             zIndex: 2,
             animation: 'slide 8s linear infinite'
           }}></div>
      
      {/* Scrollable Events Container with Drag Support */}
      <div 
        className="overflow-x-auto pb-6 timeline-container" 
        ref={scrollContainerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: 'grab' }}
      >
        <div className="flex space-x-3 px-4" style={{ minWidth: 'max-content', minHeight: '560px', alignItems: 'stretch' }}>
          
          {/* Past Events - Faded */}
          {pastEvents.map((event, index) => {
            const isEven = index % 2 === 0;
            return (
              <div key={event.id} className="timeline-event opacity-0 relative flex flex-col items-center" style={{ width: '220px', flexShrink: 0 }}>
                {isEven ? (
                  <>
                    {/* Event above the line */}
                    <div className="group cursor-pointer opacity-50 relative" style={{ marginBottom: '30px' }}>
                      {/* Decorative accent line */}
                      <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-gray-300 to-transparent opacity-50"></div>
                      <div className="bg-white rounded-xl shadow-xl p-4 transform transition-all duration-500 hover:scale-105 hover:shadow-2xl border-2 border-gray-300 hover:-translate-y-2 relative overflow-hidden">
                        {/* Subtle pattern overlay */}
                        <div className="absolute inset-0 opacity-5">
                          <div className="absolute inset-0" style={{
                            backgroundImage: 'radial-gradient(circle at 1px 1px, gray 1px, transparent 1px)',
                            backgroundSize: '20px 20px'
                          }}></div>
                        </div>
                        <div className="flex justify-center mb-3">
                          <span className="bg-gray-500 text-white px-4 py-2 rounded-full text-sm font-bold">
                            {formatEventDate(event.date_start)}
                            {event.date_end && event.date_end !== event.date_start && ` - ${formatEventDate(event.date_end)}`}
                          </span>
                        </div>
                        <h3 className="text-base font-bold mb-2 text-gray-500 leading-tight">{event.title}</h3>
                        <p className="text-gray-400 text-sm mb-2">📍 {event.location}</p>
                        {event.time && (
                          <p className="text-gray-400 text-xs mb-2">⏰ {event.time}</p>
                        )}
                        {event.link_url && (
                          <a 
                            href={event.link_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-block mt-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors underline relative"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {event.link_display || 'Ver más'} →
                          </a>
                        )}
                        {!event.link_url && (
                          <span className="inline-block mt-2 text-sm text-gray-400">Evento finalizado</span>
                        )}
                        <div className="overflow-hidden max-h-0 group-hover:max-h-40 transition-all duration-500">
                          <div className="pt-4 border-t border-gray-200">
                            {event.description && (
                              <p className="text-gray-500 text-sm mb-2">{event.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Timeline dot with pulse effect */}
                    <div className="absolute top-[265px] z-10">
                      <div className="w-6 h-6 bg-gray-400 rounded-full border-4 border-gray-50 shadow-xl"></div>
                    </div>
                    <div className="flex-1"></div>
                  </>
                ) : (
                  <>
                    {/* Event below the line */}
                    <div className="flex-1"></div>
                    {/* Timeline dot with pulse effect */}
                    <div className="absolute top-[265px] z-10">
                      <div className="w-6 h-6 bg-gray-400 rounded-full border-4 border-gray-50 shadow-xl"></div>
                    </div>
                    <div className="group cursor-pointer opacity-50 relative" style={{ marginTop: '30px' }}>
                      <div className="bg-white rounded-lg shadow-lg p-4 transform transition-all duration-300 hover:scale-105 hover:shadow-xl hover:translate-y-4 border-2 border-gray-300" style={{ zIndex: 20, position: 'relative' }}>
                        <div className="flex justify-center mb-3">
                          <span className="bg-gray-500 text-white px-4 py-2 rounded-full text-sm font-bold">
                            {formatEventDate(event.date_start)}
                            {event.date_end && event.date_end !== event.date_start && ` - ${formatEventDate(event.date_end)}`}
                          </span>
                        </div>
                        <h3 className="text-base font-bold mb-2 text-gray-500 leading-tight">{event.title}</h3>
                        <p className="text-gray-400 text-sm mb-2">📍 {event.location}</p>
                        {event.time && (
                          <p className="text-gray-400 text-xs mb-2">⏰ {event.time}</p>
                        )}
                        {event.link_url && (
                          <a 
                            href={event.link_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-block mt-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors underline relative"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {event.link_display || 'Ver más'} →
                          </a>
                        )}
                        {!event.link_url && (
                          <span className="inline-block mt-2 text-sm text-gray-400">Evento finalizado</span>
                        )}
                        <div className="overflow-hidden max-h-0 group-hover:max-h-40 transition-all duration-500">
                          <div className="pt-4 border-t border-gray-200">
                            {event.description && (
                              <p className="text-gray-500 text-sm mb-2">{event.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Future Events */}
          {futureEvents.map((event, index) => {
            // Continue the alternating pattern from past events
            const totalPastEvents = pastEvents.length;
            const isEven = (totalPastEvents + index) % 2 === 0;
            
            return (
              <div key={event.id} className="timeline-event opacity-0 relative flex flex-col items-center" style={{ width: '220px', flexShrink: 0 }}>
                {isEven ? (
                  <>
                    {/* Event above the line */}
                    <div className="group cursor-pointer relative" style={{ marginBottom: '30px' }}>
                      {/* "PRÓXIMO" badge for the first future event */}
                      {index === 0 && (
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 z-30">
                          <div className="bg-[#FFC107] text-black px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-lg">
                            PRÓXIMO
                          </div>
                        </div>
                      )}
                      {/* Glow effect for next event */}
                      {index === 0 && (
                        <div className="absolute inset-0 bg-gradient-to-r from-[#FFC107] to-[#FFD54F] rounded-xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity"></div>
                      )}
                      {/* Decorative accent line */}
                      <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-[#FFC107] to-transparent"></div>
                      <div className={`bg-white rounded-xl shadow-2xl p-4 transform transition-all duration-500 hover:scale-105 hover:shadow-3xl hover:-translate-y-4 border-2 relative overflow-hidden ${index === 0 ? 'border-[#FFC107] shadow-[#FFC107]/20' : 'border-transparent hover:border-[#FFC107]'}`} style={{ zIndex: 20 }}>
                        {/* Dynamic background gradient */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-yellow-50 opacity-20"></div>
                        {/* Subtle pattern overlay */}
                        <div className="absolute inset-0 opacity-5">
                          <div className="absolute inset-0" style={{
                            backgroundImage: 'radial-gradient(circle at 1px 1px, #FFC107 1px, transparent 1px)',
                            backgroundSize: '20px 20px'
                          }}></div>
                        </div>
                        <div className="flex justify-center mb-3 relative z-10">
                          <span className="bg-black text-white px-4 py-2 rounded-full text-sm font-bold">
                            {formatEventDate(event.date_start)}
                            {event.date_end && event.date_end !== event.date_start && ` - ${formatEventDate(event.date_end)}`}
                          </span>
                        </div>
                        <h3 className="text-base font-bold mb-2 group-hover:text-[#FFC107] transition-colors leading-tight relative z-10">{event.title}</h3>
                        <p className="text-gray-600 text-sm mb-2 relative z-10">📍 {event.location}</p>
                        {event.time && (
                          <p className="text-gray-600 text-xs mb-2 relative z-10">⏰ {event.time}</p>
                        )}
                        {event.link_url && (
                          <a 
                            href={event.link_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-block mt-2 text-sm font-bold text-black hover:text-[#FFC107] transition-colors underline relative z-10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {event.link_display || 'Más información'} →
                          </a>
                        )}
                        <div className="overflow-hidden max-h-0 group-hover:max-h-40 transition-all duration-500 relative z-10">
                          <div className="pt-4 border-t border-gray-200">
                            {event.description && (
                              <p className="text-gray-700 text-sm mb-2">{event.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Timeline dot with animation for future events */}
                    <div className="absolute top-[261px] z-10">
                      <div className="relative">
                        {index === 0 && (
                          <div className="absolute inset-0 w-8 h-8 bg-[#FFC107] rounded-full animate-ping opacity-30"></div>
                        )}
                        <div className="w-8 h-8 bg-gradient-to-br from-black to-gray-800 rounded-full border-4 border-white shadow-2xl hover:from-[#FFC107] hover:to-[#FFB300] transition-all duration-300 hover:scale-125 cursor-pointer"></div>
                      </div>
                    </div>
                    <div className="flex-1"></div>
                  </>
                ) : (
                  <>
                    {/* Event below the line */}
                    <div className="flex-1"></div>
                    {/* Timeline dot with animation for future events */}
                    <div className="absolute top-[261px] z-10">
                      <div className="relative">
                        {index === 0 && (
                          <div className="absolute inset-0 w-8 h-8 bg-[#FFC107] rounded-full animate-ping opacity-30"></div>
                        )}
                        <div className="w-8 h-8 bg-gradient-to-br from-black to-gray-800 rounded-full border-4 border-white shadow-2xl hover:from-[#FFC107] hover:to-[#FFB300] transition-all duration-300 hover:scale-125 cursor-pointer"></div>
                      </div>
                    </div>
                    <div className="group cursor-pointer relative" style={{ marginTop: '30px' }}>
                      {/* "PRÓXIMO" badge for the first future event */}
                      {index === 0 && (
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 z-30">
                          <div className="bg-[#FFC107] text-black px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-lg">
                            PRÓXIMO
                          </div>
                        </div>
                      )}
                      <div className={`bg-white rounded-lg shadow-lg p-4 transform transition-all duration-300 hover:scale-105 hover:shadow-xl hover:translate-y-4 border-2 ${index === 0 ? 'border-[#FFC107]' : 'border-transparent hover:border-[#FFC107]'}`} style={{ zIndex: 20, position: 'relative' }}>
                        <div className="flex justify-center mb-3 relative z-10">
                          <span className="bg-black text-white px-4 py-2 rounded-full text-sm font-bold">
                            {formatEventDate(event.date_start)}
                            {event.date_end && event.date_end !== event.date_start && ` - ${formatEventDate(event.date_end)}`}
                          </span>
                        </div>
                        <h3 className="text-base font-bold mb-2 group-hover:text-[#FFC107] transition-colors leading-tight relative z-10">{event.title}</h3>
                        <p className="text-gray-600 text-sm mb-2 relative z-10">📍 {event.location}</p>
                        {event.time && (
                          <p className="text-gray-600 text-xs mb-2 relative z-10">⏰ {event.time}</p>
                        )}
                        {event.link_url && (
                          <a 
                            href={event.link_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-block mt-2 text-sm font-bold text-black hover:text-[#FFC107] transition-colors underline relative z-10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {event.link_display || 'Más información'} →
                          </a>
                        )}
                        <div className="overflow-hidden max-h-0 group-hover:max-h-40 transition-all duration-500 relative z-10">
                          <div className="pt-4 border-t border-gray-200">
                            {event.description && (
                              <p className="text-gray-700 text-sm mb-2">{event.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* If no events */}
          {pastEvents.length === 0 && futureEvents.length === 0 && (
            <div className="timeline-event opacity-0 relative flex flex-col items-center" style={{ width: '220px', flexShrink: 0 }}>
              <div className="bg-white rounded-lg shadow-lg p-4">
                <div className="text-center">
                  <p className="text-gray-600">Próximamente nuevos eventos</p>
                </div>
              </div>
              <div className="w-4 h-4 bg-gray-400 rounded-full border-4 border-white shadow-lg mt-6 z-10"></div>
            </div>
          )}
        </div>
      </div>
      
      {/* Scroll Indicator */}
      {(pastEvents.length + futureEvents.length) > 3 && (
        <div className="absolute right-0 top-1/2 transform -translate-y-1/2 bg-gradient-to-l from-gray-50 to-transparent w-20 h-full pointer-events-none flex items-center justify-end pr-2">
          <svg className="w-8 h-8 text-gray-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </div>
      )}
    </div>
  );
}
