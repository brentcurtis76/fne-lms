import { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

// Helper function to generate slug from title
function generateSlug(title: string): string {
  const baseSlug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .trim();
  
  // Add timestamp to ensure uniqueness
  const timestamp = Date.now().toString(36);
  return `${baseSlug}-${timestamp}`;
}

// Helper to convert TipTap JSON to HTML
function tiptapToHtml(json: any): string {
  if (!json || !json.content) return '';
  
  let html = '';
  
  const processNode = (node: any): string => {
    let nodeHtml = '';
    
    switch (node.type) {
      case 'paragraph':
        nodeHtml = `<p>${processContent(node.content)}</p>`;
        break;
      case 'heading':
        const level = node.attrs?.level || 2;
        nodeHtml = `<h${level}>${processContent(node.content)}</h${level}>`;
        break;
      case 'bulletList':
        nodeHtml = `<ul>${processContent(node.content)}</ul>`;
        break;
      case 'orderedList':
        nodeHtml = `<ol>${processContent(node.content)}</ol>`;
        break;
      case 'listItem':
        nodeHtml = `<li>${processContent(node.content)}</li>`;
        break;
      case 'blockquote':
        nodeHtml = `<blockquote>${processContent(node.content)}</blockquote>`;
        break;
      case 'codeBlock':
        nodeHtml = `<pre><code>${processContent(node.content)}</code></pre>`;
        break;
      case 'hardBreak':
        nodeHtml = '<br>';
        break;
      case 'text':
        nodeHtml = processText(node);
        break;
      default:
        nodeHtml = processContent(node.content);
    }
    
    return nodeHtml;
  };
  
  const processContent = (content: any): string => {
    if (!content) return '';
    if (Array.isArray(content)) {
      return content.map(processNode).join('');
    }
    return '';
  };
  
  const processText = (node: any): string => {
    let text = node.text || '';
    
    // Apply marks (formatting)
    if (node.marks) {
      node.marks.forEach((mark: any) => {
        switch (mark.type) {
          case 'bold':
            text = `<strong>${text}</strong>`;
            break;
          case 'italic':
            text = `<em>${text}</em>`;
            break;
          case 'underline':
            text = `<u>${text}</u>`;
            break;
          case 'link':
            text = `<a href="${mark.attrs.href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
            break;
          case 'code':
            text = `<code>${text}</code>`;
            break;
        }
      });
    }
    
    return text;
  };
  
  if (json.content) {
    html = json.content.map(processNode).join('');
  }
  
  return html;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient({ req, res });
  
  // Check authentication
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  console.log('[news API] Auth check:', { user: user?.id, userError });
  
  if (!user) {
    console.log('[news API] No user found');
    return res.status(401).json({ error: 'No autorizado' });
  }

  // Check if user is admin, consultor, or community_manager
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('role_type')
    .eq('user_id', user.id)
    .eq('is_active', true);

  console.log('[news API] Roles check:', { 
    userId: user.id, 
    roles, 
    rolesError,
    roleTypes: roles?.map(r => r.role_type)
  });

  const isAdmin = roles?.some(r => ['admin', 'consultor', 'community_manager'].includes(r.role_type));
  
  console.log('[news API] Admin check:', { isAdmin, hasRoles: !!roles?.length });
  
  if (!isAdmin) {
    console.log('[news API] Access denied - not admin');
    return res.status(403).json({ error: 'Sin permisos para esta acción' });
  }

  // Handle different methods
  switch (req.method) {
    case 'GET':
      // Get all articles (including drafts) for admin
      try {
        // Try to get with display_date first
        let { data, error } = await supabase
          .from('news_articles')
          .select(`
            *,
            author:profiles!author_id (
              id,
              first_name,
              last_name,
              avatar_url
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        return res.status(200).json(data || []);
      } catch (error) {
        console.error('Error fetching admin news:', error);
        return res.status(500).json({ error: 'Error al cargar las noticias' });
      }

    case 'POST':
      // Create new article
      try {
        const { title, content, featured_image, is_published, display_date } = req.body;

        if (!title || !content) {
          return res.status(400).json({ error: 'Título y contenido son requeridos' });
        }

        const slug = generateSlug(title);
        const content_html = tiptapToHtml(content);

        const insertData: any = {
          title,
          slug,
          content,
          content_html,
          featured_image,
          is_published: is_published || false,
          author_id: user.id
        };

        // Add display_date if provided, otherwise it will use the database default (NOW())
        if (display_date) {
          insertData.display_date = new Date(display_date).toISOString();
        }

        const { data, error } = await supabase
          .from('news_articles')
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;

        return res.status(201).json(data);
      } catch (error: any) {
        console.error('Error creating article:', error);
        if (error.code === '23505') { // Unique constraint violation
          return res.status(400).json({ error: 'Ya existe un artículo con ese título' });
        }
        return res.status(500).json({ error: 'Error al crear el artículo' });
      }

    case 'PUT':
      // Update article
      try {
        const { id, title, content, featured_image, is_published, display_date } = req.body;

        if (!id) {
          return res.status(400).json({ error: 'ID del artículo requerido' });
        }

        const updates: any = {
          updated_at: new Date().toISOString()
        };

        if (title !== undefined) updates.title = title;
        if (content !== undefined) {
          updates.content = content;
          updates.content_html = tiptapToHtml(content);
        }
        if (featured_image !== undefined) updates.featured_image = featured_image;
        if (is_published !== undefined) updates.is_published = is_published;
        
        // Only update display_date if it's provided and not undefined
        // This prevents errors if the column doesn't exist yet
        if (display_date !== undefined && display_date !== null) {
          // First check if we can update display_date
          try {
            updates.display_date = new Date(display_date).toISOString();
          } catch (e) {
            console.log('[news API] Warning: Could not parse display_date:', display_date);
            // Don't include display_date in updates if parsing fails
          }
        }

        const { data, error } = await supabase
          .from('news_articles')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json(data);
      } catch (error) {
        console.error('Error updating article:', error);
        return res.status(500).json({ error: 'Error al actualizar el artículo' });
      }

    case 'DELETE':
      // Delete article
      try {
        const { id } = req.query;

        if (!id) {
          return res.status(400).json({ error: 'ID del artículo requerido' });
        }

        const { error } = await supabase
          .from('news_articles')
          .delete()
          .eq('id', id);

        if (error) throw error;

        return res.status(200).json({ message: 'Artículo eliminado exitosamente' });
      } catch (error) {
        console.error('Error deleting article:', error);
        return res.status(500).json({ error: 'Error al eliminar el artículo' });
      }

    default:
      return res.status(405).json({ error: 'Método no permitido' });
  }
}