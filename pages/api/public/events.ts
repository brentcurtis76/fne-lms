import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { parseLocalDate } from '../../../utils/dateUtils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[Events API] Starting to fetch events...');
    
    // Fetch all published events
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('is_published', true)
      .order('date_start', { ascending: true });

    if (error) {
      console.error('[Events API] Error fetching events:', error);
      console.error('[Events API] Error details:', JSON.stringify(error, null, 2));
      return res.status(500).json({ error: 'Error fetching events', details: error.message });
    }
    
    console.log(`[Events API] Successfully fetched ${events?.length || 0} events`);

    // Separate past and future events
    // Events are only past after their entire day has finished
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const pastEvents = [];
    const futureEvents = [];

    for (const event of events || []) {
      // Use parseLocalDate to avoid timezone issues
      const eventStartDate = parseLocalDate(event.date_start);
      const eventEndDate = event.date_end ? parseLocalDate(event.date_end) : eventStartDate;
      
      // Get just the date part (no time) for comparison
      const eventEndDay = new Date(
        eventEndDate.getFullYear(),
        eventEndDate.getMonth(),
        eventEndDate.getDate()
      );
      
      // An event is only considered past if its end date is BEFORE today
      // If the event end date is today or in the future, it's still current/upcoming
      if (eventEndDay < todayStart) {
        // Event ended before today - it's past
        pastEvents.push(event);
      } else {
        // Event is happening today or in the future - it's current/upcoming
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