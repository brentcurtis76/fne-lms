import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all published events
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('is_published', true)
      .order('date_start', { ascending: true });

    if (error) {
      console.error('Error fetching events:', error);
      return res.status(500).json({ error: 'Error fetching events' });
    }

    // Separate past and future events
    const now = new Date();
    const pastEvents = [];
    const futureEvents = [];

    for (const event of events || []) {
      const eventEndDate = event.date_end ? new Date(event.date_end) : new Date(event.date_start);
      
      if (eventEndDate < now) {
        pastEvents.push(event);
      } else {
        futureEvents.push(event);
      }
    }

    // Sort past events by date_start descending (most recent first)
    pastEvents.sort((a, b) => {
      const dateA = new Date(a.date_start).getTime();
      const dateB = new Date(b.date_start).getTime();
      return dateB - dateA; // Descending order
    });

    // Sort future events by date_start ascending (soonest first)
    futureEvents.sort((a, b) => {
      const dateA = new Date(a.date_start).getTime();
      const dateB = new Date(b.date_start).getTime();
      return dateA - dateB; // Ascending order
    });

    return res.status(200).json({
      pastEvents,
      futureEvents,
      allEvents: events
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}