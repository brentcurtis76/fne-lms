import React from 'react';
import { Calendar, Users, Plane, Building, DollarSign, FileText, MapPin, Clock, CheckCircle, ExternalLink, Download, Mail, Phone } from 'lucide-react';
import jsPDF from 'jspdf';
import { toast } from 'react-hot-toast';

interface Program {
  id: string;
  name: string;
  description: string;
  price: number;
  pdf_url: string | null;
}

interface Quote {
  id: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_institution?: string;
  arrival_date: string;
  departure_date: string;
  nights: number;
  flight_price: number;
  flight_notes?: string;
  room_type: string;
  single_room_price: number;
  double_room_price: number;
  num_pasantes: number;
  selected_programs: string[];
  program_total: number;
  accommodation_total: number;
  total_per_person: number;
  grand_total: number;
  notes?: string;
  status: string;
  valid_until?: string;
  created_at: string;
  programs: Program[];
  apply_early_bird_discount?: boolean;
  discount_amount?: number;
  original_program_total?: number;
  viaticos_type?: 'daily' | 'total' | null;
  viaticos_amount?: number;
  viaticos_total?: number;
  viaticos_display_amount?: number;
}

interface QuotePublicViewProps {
  quote: Quote;
}

export default function QuotePublicView({ quote }: QuotePublicViewProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Calculate the actual per-person program cost
  const calculateProgramCostPerPerson = () => {
    if (!quote.programs || quote.programs.length === 0) return 0;
    
    // Sum up the base prices of selected programs
    const baseProgramTotal = quote.programs.reduce((sum, program) => sum + program.price, 0);
    
    // Apply early bird discount if active ($500,000 per program)
    if (quote.apply_early_bird_discount) {
      const discountPerPerson = 500000 * quote.programs.length;
      return Math.max(0, baseProgramTotal - discountPerPerson);
    }
    
    return baseProgramTotal;
  };

  const programCostPerPerson = calculateProgramCostPerPerson();

  const generatePDF = () => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.width;
    const pageHeight = pdf.internal.pageSize.height;
    let yPos = 20;
    
    // Helper function to add rounded rectangles with shadow effect
    const addRoundedRect = (x: number, y: number, width: number, height: number, radius: number, fillColor?: [number, number, number], strokeColor?: [number, number, number]) => {
      if (fillColor) {
        pdf.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
        pdf.roundedRect(x, y, width, height, radius, radius, 'F');
      }
      if (strokeColor) {
        pdf.setDrawColor(strokeColor[0], strokeColor[1], strokeColor[2]);
        pdf.roundedRect(x, y, width, height, radius, radius, 'S');
      } else if (!fillColor) {
        pdf.roundedRect(x, y, width, height, radius, radius);
      }
    };
    
    // Helper to wrap text
    const wrapText = (text: string, maxWidth: number): string[] => {
      return pdf.splitTextToSize(text, maxWidth);
    };
    
    // HEADER - Black background with more padding
    addRoundedRect(15, yPos, pageWidth - 30, 40, 6, [0, 0, 0]);
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.setFont(undefined, 'bold');
    pdf.text('FUNDACIÓN NUEVA EDUCACIÓN', pageWidth / 2, yPos + 14, { align: 'center' });
    
    pdf.setFontSize(12);
    pdf.setFont(undefined, 'normal');
    pdf.text('Propuesta Pasantía Internacional - Barcelona 2025', pageWidth / 2, yPos + 26, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
    yPos += 55; // More spacing
    
    // CLIENT INFO SECTION with better spacing
    pdf.setFillColor(249, 250, 251);
    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth(1);
    addRoundedRect(15, yPos, pageWidth - 30, quote.client_institution ? 32 : 26, 5, [249, 250, 251], [229, 231, 235]);
    
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(75, 85, 99);
    pdf.text('INFORMACIÓN DEL CLIENTE', 20, yPos + 8);
    
    pdf.setFont(undefined, 'normal');
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(9);
    
    const clientY = yPos + 16;
    pdf.text(`Cliente: ${quote.client_name}`, 20, clientY);
    if (quote.client_institution) {
      pdf.text(`Institución: ${quote.client_institution}`, 20, clientY + 6);
    }
    
    // Right align dates and quote number
    pdf.setFontSize(8);
    pdf.setTextColor(107, 114, 128);
    if (quote.quote_number) {
      pdf.setFont(undefined, 'bold');
      pdf.text(`Cotización #${quote.quote_number}`, pageWidth - 20, clientY - 6, { align: 'right' });
      pdf.setFont(undefined, 'normal');
    }
    pdf.text(`Fecha: ${formatDate(quote.created_at)}`, pageWidth - 20, clientY, { align: 'right' });
    if (quote.valid_until) {
      pdf.text(`Válido hasta: ${formatDate(quote.valid_until)}`, pageWidth - 20, clientY + 6, { align: 'right' });
    }
    
    pdf.setTextColor(0, 0, 0);
    yPos += (quote.client_institution ? 42 : 36);
    
    // TRAVEL DETAILS - Better spacing and layout
    pdf.setFontSize(13);
    pdf.setFont(undefined, 'bold');
    pdf.text('Detalles del Viaje', 20, yPos);
    yPos += 10;
    
    // Travel info cards with better spacing
    const cardSpacing = 5;
    const totalCardWidth = pageWidth - 30 - (cardSpacing * 2);
    const cardWidth = totalCardWidth / 3;
    const cardHeight = 28;
    
    // Card 1: Dates
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(209, 213, 219);
    pdf.setLineWidth(1);
    addRoundedRect(15, yPos, cardWidth, cardHeight, 4, [255, 255, 255], [209, 213, 219]);
    
    pdf.setFontSize(8);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(59, 130, 246);
    pdf.text('FECHAS', 20, yPos + 7);
    
    pdf.setFont(undefined, 'normal');
    pdf.setTextColor(55, 65, 81);
    pdf.setFontSize(8);
    pdf.text(`Llegada: ${formatDate(quote.arrival_date)}`, 20, yPos + 14);
    pdf.text(`Salida: ${formatDate(quote.departure_date)}`, 20, yPos + 21);
    
    // Card 2: Accommodation
    addRoundedRect(15 + cardWidth + cardSpacing, yPos, cardWidth, cardHeight, 4, [255, 255, 255], [209, 213, 219]);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(239, 68, 68);
    pdf.text('ALOJAMIENTO', 20 + cardWidth + cardSpacing, yPos + 7);
    
    pdf.setFont(undefined, 'normal');
    pdf.setTextColor(55, 65, 81);
    pdf.text(`${quote.nights} noches`, 20 + cardWidth + cardSpacing, yPos + 14);
    pdf.text(`Habitación ${quote.room_type === 'single' ? 'Individual' : 'Doble'}`, 20 + cardWidth + cardSpacing, yPos + 21);
    
    // Card 3: Participants
    addRoundedRect(15 + (cardWidth + cardSpacing) * 2, yPos, cardWidth, cardHeight, 4, [255, 255, 255], [209, 213, 219]);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(34, 197, 94);
    pdf.text('PARTICIPANTES', 20 + (cardWidth + cardSpacing) * 2, yPos + 7);
    
    pdf.setFontSize(11);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text(`${quote.num_pasantes} personas`, 20 + (cardWidth + cardSpacing) * 2, yPos + 16);
    
    pdf.setFont(undefined, 'normal');
    pdf.setTextColor(0, 0, 0);
    yPos += cardHeight + 15;
    
    // PROGRAMS SECTION
    if (quote.programs && quote.programs.length > 0) {
      // Check if we need a new page for programs section
      const totalProgramsHeight = quote.programs.length * 40; // Approximate height
      if (yPos + totalProgramsHeight > pageHeight - 100) {
        pdf.addPage();
        yPos = 20;
      }
      
      pdf.setFontSize(13);
      pdf.setFont(undefined, 'bold');
      pdf.text('Programas Seleccionados', 20, yPos);
      yPos += 10;
      
      quote.programs.forEach((program, index) => {
        // Check for page break before each program
        if (index > 0 && yPos + 40 > pageHeight - 80) {
          pdf.addPage();
          yPos = 20;
        }
        
        // Program card with white background and border
        const programCardHeight = 32;
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(59, 130, 246);
        pdf.setLineWidth(1.5);
        addRoundedRect(15, yPos, pageWidth - 30, programCardHeight, 5, [255, 255, 255], [59, 130, 246]);
        
        // Check mark circle
        pdf.setFillColor(34, 197, 94);
        pdf.circle(25, yPos + 10, 4, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(10);
        pdf.text('✓', 25, yPos + 11, { align: 'center' });
        
        // Program name
        pdf.setTextColor(0, 0, 0);
        pdf.setFont(undefined, 'bold');
        pdf.setFontSize(11);
        pdf.text(program.name, 35, yPos + 10);
        
        // Price (right aligned)
        pdf.setFont(undefined, 'bold');
        pdf.setFontSize(12);
        pdf.setTextColor(59, 130, 246);
        const priceText = quote.apply_early_bird_discount ? '$2.000.000' : '$2.500.000';
        pdf.text(`${priceText} CLP`, pageWidth - 20, yPos + 10, { align: 'right' });
        
        // Per person text
        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(107, 114, 128);
        pdf.text('por persona', pageWidth - 20, yPos + 16, { align: 'right' });
        
        // Description (wrapped and limited)
        pdf.setFontSize(8);
        pdf.setTextColor(75, 85, 99);
        const shortDesc = program.description.substring(0, 100) + '...';
        const wrappedDesc = wrapText(shortDesc, pageWidth - 60);
        pdf.text(wrappedDesc[0] || '', 35, yPos + 18);
        if (wrappedDesc[1]) {
          pdf.text(wrappedDesc[1], 35, yPos + 24);
        }
        
        pdf.setTextColor(0, 0, 0);
        yPos += programCardHeight + 8;
      });
    }
    
    yPos += 8;
    
    // Check if we need a new page for cost summary
    const costBoxHeight = quote.num_pasantes > 1 ? 95 : 75;
    if (yPos + costBoxHeight > pageHeight - 40) {
      pdf.addPage();
      yPos = 20;
    }
    
    // COST SUMMARY - Black box with improved contrast
    addRoundedRect(10, yPos, pageWidth - 20, costBoxHeight, 5, [0, 0, 0]);
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont(undefined, 'bold');
    pdf.text('Resumen de Costos', 20, yPos + 12);
    
    // Cost breakdown box - lighter gray for better contrast
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.5);
    addRoundedRect(15, yPos + 18, pageWidth - 30, 45, 3, [255, 255, 255], [200, 200, 200]);
    
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'bold');
    pdf.text('Costo por Persona', 20, yPos + 26);
    
    pdf.setFont(undefined, 'normal');
    pdf.setFontSize(9);
    
    const leftCol = 20;
    const rightCol = pageWidth - 25;
    let lineY = yPos + 34;
    
    // Flight cost
    pdf.setTextColor(75, 85, 99);
    pdf.text('Vuelo internacional', leftCol, lineY);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`$${quote.flight_price.toLocaleString('es-CL')} CLP`, rightCol, lineY, { align: 'right' });
    lineY += 7;
    
    // Accommodation cost
    const accommodationPerPerson = quote.accommodation_total / quote.num_pasantes;
    pdf.setTextColor(75, 85, 99);
    pdf.text(`Alojamiento (${quote.nights} noches)`, leftCol, lineY);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`$${Math.round(accommodationPerPerson).toLocaleString('es-CL')} CLP`, rightCol, lineY, { align: 'right' });
    lineY += 7;
    
    // Programs cost with discount indication
    pdf.setTextColor(75, 85, 99);
    let programLabel = `Programas (${quote.programs?.length || 0})`;
    if (quote.apply_early_bird_discount) {
      programLabel += ' - Descuento aplicado';
      pdf.setTextColor(34, 197, 94); // Green for discount
    }
    pdf.text(programLabel, leftCol, lineY);
    
    // Show strikethrough original price if discounted
    if (quote.apply_early_bird_discount && quote.programs?.length > 0) {
      const originalPerPerson = quote.programs.reduce((sum, p) => sum + p.price, 0);
      pdf.setTextColor(156, 163, 175);
      pdf.setFontSize(8);
      const strikeX = rightCol - 40;
      pdf.text(`$${originalPerPerson.toLocaleString('es-CL')}`, strikeX, lineY - 2, { align: 'right' });
      // Draw strikethrough line
      pdf.setDrawColor(156, 163, 175);
      pdf.setLineWidth(0.3);
      const textWidth = pdf.getTextWidth(`$${originalPerPerson.toLocaleString('es-CL')}`);
      pdf.line(strikeX - textWidth, lineY - 3, strikeX, lineY - 3);
    }
    
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(9);
    pdf.text(`$${programCostPerPerson.toLocaleString('es-CL')} CLP`, rightCol, lineY, { align: 'right' });
    lineY += 7;
    
    // Viáticos if applicable
    if (quote.viaticos_display_amount && quote.viaticos_display_amount > 0) {
      pdf.setTextColor(75, 85, 99);
      const viaticosLabel = quote.viaticos_type === 'daily' ? 
        `Viáticos (${quote.nights + 1} días)` : 
        'Viáticos (monto total)';
      pdf.text(viaticosLabel, leftCol, lineY);
      pdf.setTextColor(0, 0, 0);
      const viaticosPerPerson = Math.round(quote.viaticos_display_amount / quote.num_pasantes);
      pdf.text(`$${viaticosPerPerson.toLocaleString('es-CL')} CLP`, rightCol, lineY, { align: 'right' });
      lineY += 7;
    }
    
    // Adjust divider line position based on whether viáticos are included
    const dividerY = quote.viaticos_display_amount && quote.viaticos_display_amount > 0 ? yPos + 59 : yPos + 52;
    
    // Divider line
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.5);
    pdf.line(leftCol, dividerY, rightCol, dividerY);
    
    // Total per person
    const totalY = quote.viaticos_display_amount && quote.viaticos_display_amount > 0 ? yPos + 66 : yPos + 59;
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'bold');
    pdf.text('Total por persona', leftCol, totalY);
    pdf.setFontSize(11);
    pdf.text(`$${quote.total_per_person.toLocaleString('es-CL')} CLP`, rightCol, totalY, { align: 'right' });
    
    // Grand total yellow box with better spacing
    if (quote.num_pasantes > 1) {
      yPos += 67;
      
      // Gradient-like yellow box
      pdf.setFillColor(255, 193, 7);
      pdf.setDrawColor(255, 160, 0);
      pdf.setLineWidth(1);
      addRoundedRect(15, yPos, pageWidth - 30, 20, 4, [255, 193, 7], [255, 160, 0]);
      
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'bold');
      pdf.text('TOTAL GENERAL', 20, yPos + 8);
      
      pdf.setFontSize(8);
      pdf.setFont(undefined, 'normal');
      pdf.text(`Para ${quote.num_pasantes} personas`, 20, yPos + 14);
      
      pdf.setFontSize(13);
      pdf.setFont(undefined, 'bold');
      pdf.text(`$${quote.grand_total.toLocaleString('es-CL')} CLP`, rightCol, yPos + 11, { align: 'right' });
      
      yPos += 25;
    } else {
      yPos += costBoxHeight + 10;
    }
    
    // Early bird notice if applicable
    if (quote.apply_early_bird_discount) {
      // Check if we need a new page for early bird notice
      if (yPos + 25 > pageHeight - 40) {
        pdf.addPage();
        yPos = 20;
      }
      
      pdf.setDrawColor(34, 197, 94); // Green
      pdf.setLineWidth(1.5);
      pdf.setFillColor(240, 253, 244); // Light green bg
      addRoundedRect(10, yPos, pageWidth - 20, 25, 4, [240, 253, 244]);
      
      pdf.setTextColor(34, 197, 94);
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'bold');
      pdf.text('Descuento por Pago Anticipado Aplicado', 15, yPos + 8);
      
      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      const savings = 500000 * (quote.programs?.length || 0);
      pdf.text(`Ahorro de $${savings.toLocaleString('es-CL')} CLP por persona`, 25, yPos + 15);
      pdf.text('Válido pagando antes del 30 de noviembre de 2025', 25, yPos + 21);
      
      yPos += 30;
    }
    
    // Additional notes if any
    if (quote.notes && yPos < pageHeight - 50) {
      // Calculate dynamic height based on content
      const wrappedNotes = wrapText(quote.notes, pageWidth - 40);
      const notesHeight = Math.min(40, 10 + (wrappedNotes.length * 5));
      
      // Light gray background with border
      pdf.setFillColor(249, 250, 251);
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.5);
      addRoundedRect(10, yPos, pageWidth - 20, notesHeight, 4, [249, 250, 251], [229, 231, 235]);
      
      pdf.setTextColor(55, 65, 81);
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'bold');
      pdf.text('Información Adicional', 15, yPos + 8);
      
      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(75, 85, 99);
      let noteY = yPos + 15;
      wrappedNotes.slice(0, 5).forEach(line => {
        pdf.text(line, 15, noteY);
        noteY += 5;
      });
      
      yPos += notesHeight + 10;
    }
    
    // Contact Information Section
    if (yPos < pageHeight - 30) {
      // Professional contact card
      pdf.setFillColor(0, 0, 0);
      addRoundedRect(10, pageHeight - 30, pageWidth - 20, 20, 4, [0, 0, 0]);
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(9);
      pdf.setFont(undefined, 'normal');
      pdf.text('Email: info@nuevaeducacion.org', 20, pageHeight - 18);
      pdf.text('Tel: +56 9 4162 3577', pageWidth / 2 - 20, pageHeight - 18);
      pdf.text('Web: www.nuevaeducacion.org', pageWidth - 60, pageHeight - 18);
      
      pdf.setFontSize(8);
      pdf.text('© 2025 Fundación Nueva Educación', pageWidth / 2, pageHeight - 10, { align: 'center' });
    }
    
    // Save with a nice filename
    const date = new Date().toISOString().split('T')[0];
    pdf.save(`Propuesta_Barcelona_${quote.client_name.replace(/\s+/g, '_')}_${date}.pdf`);
    toast.success('PDF descargado exitosamente');
  };

  const handleContact = () => {
    window.location.href = 'mailto:info@nuevaeducacion.org?subject=Consulta sobre cotización pasantía Barcelona';
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-black text-white py-8">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black mb-2">FUNDACIÓN NUEVA EDUCACIÓN</h1>
              <p className="text-white/80">Cotización Pasantía Internacional Barcelona</p>
            </div>
            <img 
              src="/Logo BW.png?v=3" 
              alt="FNE" 
              className="h-16 w-auto filter brightness-0 invert"
              onError={(e) => e.currentTarget.style.display = 'none'}
            />
          </div>
        </div>
      </header>

      {/* Status Bar */}
      {quote.status === 'sent' || quote.status === 'viewed' ? (
        <div className="bg-yellow-50 border-b-2 border-yellow-200 py-3">
          <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
            <div className="flex items-center text-yellow-700">
              <CheckCircle className="mr-2" size={20} />
              <span className="font-medium">Cotización activa</span>
            </div>
            {quote.valid_until && (
              <div className="text-sm text-yellow-600">
                Válida hasta: {formatDate(quote.valid_until)}
              </div>
            )}
          </div>
        </div>
      ) : quote.status === 'expired' ? (
        <div className="bg-red-50 border-b-2 border-red-200 py-3">
          <div className="max-w-5xl mx-auto px-6 flex items-center text-red-700">
            <Clock className="mr-2" size={20} />
            <span className="font-medium">Esta cotización ha expirado</span>
          </div>
        </div>
      ) : null}

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Client Info */}
        <div className="bg-gray-50 rounded-2xl p-8 mb-8">
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-2xl font-bold">Información del Cliente</h2>
            {quote.quote_number && (
              <div className="text-right">
                <p className="text-sm text-gray-600 mb-1">N° Cotización</p>
                <p className="text-2xl font-mono font-bold">#{quote.quote_number}</p>
              </div>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Cliente</p>
              <p className="text-lg font-medium">{quote.client_name}</p>
            </div>
            {quote.client_institution && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Institución</p>
                <p className="text-lg font-medium">{quote.client_institution}</p>
              </div>
            )}
            {quote.client_email && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Email</p>
                <p className="text-lg font-medium">{quote.client_email}</p>
              </div>
            )}
            {quote.client_phone && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Teléfono</p>
                <p className="text-lg font-medium">{quote.client_phone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Travel Details */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* Dates and Accommodation */}
          <div className="bg-white border-2 border-black rounded-2xl p-8">
            <h3 className="text-xl font-bold mb-6 flex items-center">
              <Calendar className="mr-3" size={24} />
              Detalles del Viaje
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-gray-600">Fecha de llegada</span>
                <span className="font-medium">{formatDate(quote.arrival_date)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-gray-600">Fecha de salida</span>
                <span className="font-medium">{formatDate(quote.departure_date)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-gray-600">Duración</span>
                <span className="font-bold text-lg">{quote.nights} noches</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-gray-600">Número de pasantes</span>
                <span className="font-bold text-lg flex items-center">
                  <Users className="mr-2" size={20} />
                  {quote.num_pasantes} {quote.num_pasantes === 1 ? 'persona' : 'personas'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-gray-600">Tipo de habitación</span>
                <span className="font-medium">
                  {quote.room_type === 'single' ? 'Individual' : 'Doble'}
                </span>
              </div>
            </div>
          </div>

          {/* Flight Info */}
          <div className="bg-white border-2 border-black rounded-2xl p-8">
            <h3 className="text-xl font-bold mb-6 flex items-center">
              <Plane className="mr-3" size={24} />
              Información de Vuelo
            </h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-gray-600 mb-2">Precio estimado del vuelo</p>
                <p className="text-3xl font-bold">${quote.flight_price.toLocaleString()} USD</p>
                <p className="text-sm text-gray-500 mt-1">Por persona</p>
              </div>
              
              {quote.flight_notes && (
                <div className="bg-gray-50 rounded-lg p-4 mt-4">
                  <p className="text-sm text-gray-700">{quote.flight_notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Programs */}
        {quote.programs && quote.programs.length > 0 && (
          <div className="bg-white border-2 border-black rounded-2xl p-8 mb-8">
            <h3 className="text-xl font-bold mb-6 flex items-center">
              <FileText className="mr-3" size={24} />
              Programas Incluidos
            </h3>
            
            <div className="space-y-4">
              {quote.programs.map((program) => (
                <div key={program.id} className="border rounded-xl p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-bold text-lg mb-2 flex items-center">
                        <CheckCircle className="mr-2 text-yellow-600" size={20} />
                        {program.name}
                      </h4>
                      {program.description && (
                        <p className="text-gray-600 ml-7">{program.description}</p>
                      )}
                      {program.pdf_url && (
                        <a
                          href={program.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center mt-3 ml-7 text-blue-600 hover:text-blue-700 font-medium"
                        >
                          <ExternalLink className="mr-1" size={16} />
                          Ver folleto del programa
                        </a>
                      )}
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-2xl font-bold">${program.price.toLocaleString('es-CL')}</p>
                      <p className="text-sm text-gray-500">CLP por persona</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cost Summary */}
        <div className="bg-black text-white rounded-2xl p-4 sm:p-8 mb-8">
          <h3 className="text-xl sm:text-2xl font-bold mb-6 sm:mb-8 flex items-center">
            <DollarSign className="mr-2 sm:mr-3" size={24} />
            Resumen de Costos
          </h3>
          
          <div className="space-y-6">
            {/* Breakdown per person */}
            <div className="bg-white/10 rounded-xl p-4 sm:p-6">
              <h4 className="font-bold mb-4 text-base sm:text-lg">Costo por Persona</h4>
              
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-white/80 text-sm sm:text-base">Vuelo internacional</span>
                  <span className="font-medium text-sm sm:text-base whitespace-nowrap">
                    ${quote.flight_price.toLocaleString('es-CL')} CLP
                  </span>
                </div>
                
                <div className="flex justify-between items-start gap-2">
                  <span className="text-white/80 text-sm sm:text-base">
                    Alojamiento ({quote.nights} noches)
                  </span>
                  <span className="font-medium text-sm sm:text-base whitespace-nowrap">
                    ${(quote.accommodation_total / quote.num_pasantes).toLocaleString('es-CL')} CLP
                  </span>
                </div>
                
                <div className="flex justify-between items-start">
                  <span className="text-white/80 flex-1">
                    Programas ({quote.programs?.length || 0})
                    {quote.apply_early_bird_discount && (
                      <span className="text-yellow-600 text-xs block sm:inline ml-0 sm:ml-2 mt-1 sm:mt-0">
                        (Descuento aplicado)
                      </span>
                    )}
                  </span>
                  <div className="text-right ml-4 flex-shrink-0">
                    {quote.apply_early_bird_discount && quote.programs?.length > 0 ? (
                      <>
                        <div className="text-xs line-through opacity-60 hidden">
                          ${(quote.programs.reduce((sum, p) => sum + p.price, 0)).toLocaleString('es-CL')} CLP
                        </div>
                        <div className="font-medium">
                          ${programCostPerPerson.toLocaleString('es-CL')} CLP
                        </div>
                      </>
                    ) : (
                      <span className="font-medium">
                        ${programCostPerPerson.toLocaleString('es-CL')} CLP
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Viáticos */}
                {quote.viaticos_display_amount && quote.viaticos_display_amount > 0 && (
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-white/80 text-sm sm:text-base">
                      Viáticos {quote.viaticos_type === 'daily' ? 
                        `(${quote.nights + 1} días)` : 
                        '(monto total)'}
                    </span>
                    <span className="font-medium text-sm sm:text-base whitespace-nowrap">
                      ${Math.round(quote.viaticos_display_amount / quote.num_pasantes).toLocaleString('es-CL')} CLP
                    </span>
                  </div>
                )}
                
                <div className="border-t border-white/20 pt-3 mt-3">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold text-base sm:text-xl">Total por persona</span>
                    <span className="font-bold text-lg sm:text-2xl whitespace-nowrap">
                      ${quote.total_per_person.toLocaleString('es-CL')} <span className="text-sm sm:text-lg">CLP</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Grand Total for multiple participants */}
            {quote.num_pasantes > 1 && (
              <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-black rounded-xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
                  <div>
                    <p className="font-bold text-lg sm:text-2xl">TOTAL GENERAL</p>
                    <p className="text-xs sm:text-sm opacity-80">Para {quote.num_pasantes} personas</p>
                  </div>
                  <p className="font-black text-2xl sm:text-4xl">
                    ${quote.grand_total.toLocaleString('es-CL')} <span className="text-lg sm:text-2xl">CLP</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Early Bird Discount Notice */}
        {quote.apply_early_bird_discount && (
          <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-2xl p-8 mb-8 border-2 border-yellow-300">
            <div>
              <h3 className="text-xl font-bold mb-2 text-yellow-800">
                Descuento por Pago Anticipado Aplicado
              </h3>
              <p className="text-yellow-700 mb-2">
                Se ha aplicado un descuento de <strong>${(500000 * (quote.programs?.length || 0)).toLocaleString('es-CL')} CLP por persona</strong> en los programas seleccionados.
              </p>
              <p className="text-sm text-yellow-700">
                Este descuento es válido realizando el pago antes del <strong>30 de noviembre de 2025</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Additional Notes */}
        {quote.notes && (
          <div className="bg-gray-50 rounded-2xl p-8 mb-8">
            <h3 className="text-xl font-bold mb-4">Información Adicional</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}

        {/* What's Included */}
        <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-8 mb-8 border">
          <h3 className="text-xl font-bold mb-6">¿Qué incluye la experiencia?</h3>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start">
              <CheckCircle className="mr-3 text-yellow-600 flex-shrink-0 mt-1" size={20} />
              <div>
                <p className="font-medium">Codocencia en Aulas</p>
                <p className="text-sm text-gray-600">
                  Participa activamente como co-docente en escuelas innovadoras
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <CheckCircle className="mr-3 text-yellow-600 flex-shrink-0 mt-1" size={20} />
              <div>
                <p className="font-medium">Visitas a Escuelas</p>
                <p className="text-sm text-gray-600">
                  Conoce las metodologías más vanguardistas de Europa
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <CheckCircle className="mr-3 text-yellow-600 flex-shrink-0 mt-1" size={20} />
              <div>
                <p className="font-medium">Talleres Especializados</p>
                <p className="text-sm text-gray-600">
                  Workshops con expertos internacionales en educación
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <CheckCircle className="mr-3 text-yellow-600 flex-shrink-0 mt-1" size={20} />
              <div>
                <p className="font-medium">Certificación Internacional</p>
                <p className="text-sm text-gray-600">
                  Reconocimiento oficial de tu participación y aprendizajes
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Barcelona Info */}
        <div className="bg-white border-2 border-black rounded-2xl overflow-hidden mb-8">
          <div className="grid md:grid-cols-2">
            <div className="p-8">
              <h3 className="text-xl font-bold mb-4 flex items-center">
                <MapPin className="mr-2" size={24} />
                Barcelona, España
              </h3>
              <p className="text-gray-700 mb-4">
                Vive una experiencia transformadora en una de las ciudades más innovadoras de Europa en educación.
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center">
                  <CheckCircle className="mr-2 text-yellow-600" size={16} />
                  Ciudad cosmopolita y multicultural
                </li>
                <li className="flex items-center">
                  <CheckCircle className="mr-2 text-yellow-600" size={16} />
                  Hub de innovación educativa
                </li>
                <li className="flex items-center">
                  <CheckCircle className="mr-2 text-yellow-600" size={16} />
                  Red de escuelas colaboradoras
                </li>
                <li className="flex items-center">
                  <CheckCircle className="mr-2 text-yellow-600" size={16} />
                  Experiencia cultural enriquecedora
                </li>
              </ul>
            </div>
            <div className="bg-gray-100 h-64 md:h-auto flex items-center justify-center">
              <img 
                src="/barcelona-skyline.jpg" 
                alt="Barcelona" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  if (e.currentTarget.parentElement) {
                    e.currentTarget.parentElement.innerHTML = '<div class="text-gray-400 text-center p-8">Barcelona, España</div>';
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={generatePDF}
            className="flex items-center justify-center px-8 py-4 bg-yellow-500 text-black rounded-full font-medium hover:bg-yellow-600 transition-all duration-300"
          >
            <Download className="mr-2" size={20} />
            Descargar PDF
          </button>
          <button
            onClick={handleContact}
            className="flex items-center justify-center px-8 py-4 bg-black text-white rounded-full font-medium hover:bg-gray-800 transition-all duration-300"
          >
            <Mail className="mr-2" size={20} />
            Contactar para Reservar
          </button>
        </div>

        {/* Contact Info */}
        <div className="mt-12 pt-8 border-t text-center">
          <p className="text-gray-600 mb-4">¿Tienes preguntas? Contáctanos:</p>
          <div className="flex justify-center items-center">
            <a href="mailto:info@nuevaeducacion.org" className="flex items-center text-black hover:underline">
              <Mail className="mr-2" size={18} />
              info@nuevaeducacion.org
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-black text-white py-8 mt-16">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="mb-2">© 2025 Fundación Nueva Educación</p>
          <p className="text-white/60 text-sm">Transformando la educación, un viaje a la vez</p>
        </div>
      </footer>
    </div>
  );
}