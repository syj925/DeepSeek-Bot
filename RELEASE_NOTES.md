QibitAI canvas plugin 0.1.53

- Change an employee model through its responsible supervisor chat when the user explicitly requests it. Report the previous and saved model after a successful update.
- Keep the employee model for ordinary delegated work; task type, priority and optimization suggestions no longer select another model automatically.
- Support an explicitly requested one-off task model without changing employee settings. Running turns and tasks already queued with a captured model retain that route.
- Preserve department ownership, independent Main Bots, profile defaults and access permissions. Team leaders can change only their own employees model or thinking level.
- Validate model availability and reject missing or ambiguous choices without substituting another model.
