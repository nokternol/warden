-- Sign-in is owner-only: the first Plex account to sign in owns the instance and every
-- other account is refused. An install that let several accounts sign in keeps only its
-- earliest user, the first sign-in and so the owner, and removes the rest. No table
-- references a user; a removed user's session stops resolving to a user on its next request.
DELETE FROM `user` WHERE `id` <> (SELECT MIN(`id`) FROM `user`);
