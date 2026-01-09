import { NextApiRequest, NextApiResponse } from 'next';

// YouTube channel ID for @NuevaEducacionFundacion
// Found via YouTube API search - this is the official Fundación Nueva Educación channel from Chile
const YOUTUBE_CHANNEL_ID = 'UC2C7CUiz8-DNn__7W8aZ6fA'; // Nueva Educacion (@nuevaeducacionfundacion)
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  channelTitle: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const limit = parseInt(req.query.limit as string) || 2;

  // If no API key, return mock data for development
  if (!YOUTUBE_API_KEY) {
    console.warn('[YouTube API] No API key configured, returning placeholder data');

    // Return placeholder videos
    const placeholderVideos: YouTubeVideo[] = [
      {
        id: 'placeholder1',
        title: 'Bienvenidos a Fundación Nueva Educación',
        description: 'Conoce nuestra misión de transformar la educación en Chile.',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        publishedAt: new Date().toISOString(),
        channelTitle: 'Fundación Nueva Educación'
      },
      {
        id: 'placeholder2',
        title: 'Testimonios de Docentes Transformados',
        description: 'Escucha las historias de transformación de nuestros docentes.',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
        publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        channelTitle: 'Fundación Nueva Educación'
      }
    ];

    return res.status(200).json({
      videos: placeholderVideos.slice(0, limit),
      isPlaceholder: true
    });
  }

  try {
    // First, get the uploads playlist ID for the channel
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${YOUTUBE_CHANNEL_ID}&key=${YOUTUBE_API_KEY}`
    );

    if (!channelResponse.ok) {
      throw new Error('Failed to fetch channel data');
    }

    const channelData = await channelResponse.json();
    const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

    if (!uploadsPlaylistId) {
      throw new Error('Could not find uploads playlist');
    }

    // Get latest videos from the uploads playlist
    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${limit}&key=${YOUTUBE_API_KEY}`
    );

    if (!videosResponse.ok) {
      throw new Error('Failed to fetch videos');
    }

    const videosData = await videosResponse.json();

    const videos: YouTubeVideo[] = videosData.items?.map((item: any) => ({
      id: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail: item.snippet.thumbnails?.maxres?.url ||
                 item.snippet.thumbnails?.high?.url ||
                 item.snippet.thumbnails?.medium?.url ||
                 item.snippet.thumbnails?.default?.url,
      publishedAt: item.snippet.publishedAt,
      channelTitle: item.snippet.channelTitle
    })) || [];

    // Cache for 1 hour
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

    return res.status(200).json({ videos, isPlaceholder: false });
  } catch (error) {
    console.error('[YouTube API] Error:', error);

    // Return placeholder on error
    const placeholderVideos: YouTubeVideo[] = [
      {
        id: 'error1',
        title: 'Video no disponible',
        description: 'No se pudieron cargar los videos de YouTube.',
        thumbnail: '/images/video-placeholder.jpg',
        publishedAt: new Date().toISOString(),
        channelTitle: 'Fundación Nueva Educación'
      }
    ];

    return res.status(200).json({
      videos: placeholderVideos,
      isPlaceholder: true,
      error: 'Could not fetch YouTube videos'
    });
  }
}
