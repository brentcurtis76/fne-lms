-- GENERA fixes F18f (19 Nov 2026), EC-M4: a thread's counters are kept by the database.
--
-- Until now nothing counted: createThread wrote message_count 1 and
-- participant_count 1 by hand, and the browser's later update of the thread
-- reached only the thread's creator (message_threads_update_own). This adds a
-- trigger on community_messages that recounts the thread of every inserted,
-- deleted or soft-deleted message, for every writer, and repairs the counters of
-- every existing thread once. Additive only: update_thread_stats is left alone;
-- no grant to anon or authenticated; no rule changes.

CREATE FUNCTION public.refresh_thread_counters() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
 v_thread uuid := COALESCE(NEW.thread_id, OLD.thread_id);
BEGIN
 IF v_thread IS NULL THEN
  RETURN COALESCE(NEW, OLD);
 END IF;
 -- Lock the thread row in a statement of its own first: two people writing in
 -- one thread at the same moment wait here, and the count below (a new
 -- statement, a new snapshot) then sees the other writer's committed message.
 PERFORM 1 FROM public.message_threads WHERE id = v_thread FOR UPDATE;
 IF NOT FOUND THEN
  RETURN COALESCE(NEW, OLD);
 END IF;
 UPDATE public.message_threads t
    SET message_count = (SELECT count(*) FROM public.community_messages m
                          WHERE m.thread_id = v_thread AND m.is_deleted = false),
        participant_count = (SELECT count(DISTINCT m.author_id) FROM public.community_messages m
                              WHERE m.thread_id = v_thread AND m.is_deleted = false),
        last_message_at = COALESCE((SELECT max(m.created_at) FROM public.community_messages m
                                     WHERE m.thread_id = v_thread AND m.is_deleted = false), t.last_message_at),
        updated_at = now()
  WHERE t.id = v_thread;
 RETURN COALESCE(NEW, OLD);
END $$;

REVOKE ALL ON FUNCTION public.refresh_thread_counters() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.refresh_thread_counters() IS
 'Recounts the thread of a message after it is written, deleted or marked deleted: how many messages are not deleted, '
 'how many different people wrote them, and the time of the latest one (kept as it was when no message is left). '
 'Runs for every writer through the trigger trg_refresh_thread_counters; nobody calls it directly.';

CREATE TRIGGER trg_refresh_thread_counters
 AFTER INSERT OR DELETE OR UPDATE OF is_deleted ON public.community_messages
 FOR EACH ROW EXECUTE FUNCTION public.refresh_thread_counters();

-- One-time repair of every thread's counters (counters only).
UPDATE public.message_threads t
   SET message_count = (SELECT count(*) FROM public.community_messages m
                         WHERE m.thread_id = t.id AND m.is_deleted = false),
       participant_count = (SELECT count(DISTINCT m.author_id) FROM public.community_messages m
                             WHERE m.thread_id = t.id AND m.is_deleted = false),
       last_message_at = COALESCE((SELECT max(m.created_at) FROM public.community_messages m
                                    WHERE m.thread_id = t.id AND m.is_deleted = false), t.last_message_at);
