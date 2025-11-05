-- First, delete all existing programs to ensure we only have the correct ones
DELETE FROM public.pasantias_programs;

-- Insert only the 2 correct programs with proper pricing
INSERT INTO public.pasantias_programs (name, description, price, pdf_url, display_order, is_active) VALUES
('Programa para Líderes Pedagógicos',
 'Pasantía internacional para líderes educativos con visitas a escuelas innovadoras, talleres especializados y certificación internacional. Precio regular: $2.500.000 CLP. Precio especial: $2.000.000 CLP si se paga antes del 30 de noviembre de 2025.', 
 2500000.00, 
 'https://heyzine.com/flip-book/9723a41fa1.html', 
 1,
 true),
('Programa Estratégico para Directivos',
 'Experiencia intensiva de liderazgo educativo y gestión del cambio para equipos directivos. Precio regular: $2.500.000 CLP. Precio especial: $2.000.000 CLP si se paga antes del 30 de noviembre de 2025.', 
 2500000.00, 
 'https://heyzine.com/flip-book/562763b1bb.html', 
 2,
 true);