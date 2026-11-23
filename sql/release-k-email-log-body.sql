-- Release K — keep the full email (body and reply-to) so Order History can show exactly what was sent.
-- Safe to run more than once. Run on STAGING first, then PROD before deploying.
alter table public.email_log add column if not exists body_html text;
alter table public.email_log add column if not exists reply_to text;
