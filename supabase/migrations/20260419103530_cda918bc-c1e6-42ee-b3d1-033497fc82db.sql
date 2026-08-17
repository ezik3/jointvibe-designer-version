-- Allow followers to see 'private' (followers-only) posts of users they follow.
-- Public posts and own posts are already covered by existing "Anyone can view public posts" policy.
CREATE POLICY "Followers can view followers-only posts"
ON public.posts
FOR SELECT
TO authenticated
USING (
  visibility = 'private'
  AND EXISTS (
    SELECT 1 FROM public.user_follows uf
    WHERE uf.follower_id = auth.uid()
      AND uf.following_id = posts.user_id
  )
);