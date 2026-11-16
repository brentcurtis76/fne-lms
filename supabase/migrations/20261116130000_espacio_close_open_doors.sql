-- F3 (16 Nov 2026): Espacio Colaborativo, doors left open.
--   EC-S2    posts_with_engagement ran with its owner's rights and anon could read it:
--            it now runs with the caller's rights, and anon loses its grant.
--   EC-V8    an author could move their own post or comment into any community:
--            a post keeps its community and author, a comment its post, parent and author,
--            for every signed-in caller (backend work without a caller is not restricted).
--   EC-SMALL workspace_activities, post_reactions, post_mentions, message_reactions and
--            post_hashtags were readable beyond their community: reads (and the activity
--            insert) are now tied to what the caller can enter or see.
--            message_reactions: a reaction can be added only to a message the person can read.
-- Statements: ALTER VIEW, REVOKE, CREATE FUNCTION, CREATE TRIGGER, ALTER POLICY. Additive only.

-- EC-S2
ALTER VIEW public.posts_with_engagement SET (security_invoker = true);
REVOKE ALL ON public.posts_with_engagement FROM anon;

-- EC-V8
CREATE OR REPLACE FUNCTION public.community_content_keep_place() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  -- Backend and maintenance work (no signed-in caller) is not restricted.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'community_posts' THEN
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
      RAISE EXCEPTION 'A post cannot change community or author' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'post_comments' THEN
    IF NEW.post_id IS DISTINCT FROM OLD.post_id
       OR NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id
       OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
      RAISE EXCEPTION 'A comment cannot change post, parent or author' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER community_posts_keep_place BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.community_content_keep_place();
CREATE TRIGGER post_comments_keep_place BEFORE UPDATE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.community_content_keep_place();

-- EC-SMALL
ALTER POLICY "Users can view workspace activities" ON public.workspace_activities TO authenticated
  USING (public.can_access_workspace(auth.uid(), workspace_id));
ALTER POLICY "Users can insert their own activities" ON public.workspace_activities TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_access_workspace(auth.uid(), workspace_id));
ALTER POLICY "Users can view all reactions" ON public.post_reactions TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_reactions.post_id));
ALTER POLICY "Users can view mentions" ON public.post_mentions TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_mentions.post_id));
ALTER POLICY "message_reactions_select" ON public.message_reactions
  USING (public.access_message(message_id));
ALTER POLICY "message_reactions_insert" ON public.message_reactions
  WITH CHECK (auth.uid() = user_id AND public.access_message(message_id));
ALTER POLICY "Anyone can view hashtags" ON public.post_hashtags TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = post_hashtags.post_id));
