create unique index audit_logs_moderation_event_unique
  on public.audit_logs (
    workspace_id,
    event_type,
    target_type,
    target_id
  )
  where target_type = 'moderation_action_request'
    and event_type in ('moderation_succeeded', 'moderation_failed');
