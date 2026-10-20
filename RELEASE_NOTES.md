QibitAI canvas plugin 0.1.58

- Give Bot mentions their own @ button beside the composer. It opens the current conversation's Bot candidates at the caret without opening model settings or changing any employee model.
- Accept inline @ after Chinese text in Bot conversations, while leaving email addresses, paths, code and reference tokens alone. Keep candidate insertion, selection and keyboard handling in the host input controller.
- Show model-maker artwork on the separate group model button. Members with the same maker share one icon; mixed makers use a compact icon stack. A group still has no shared model: changes apply only to the selected employee.
- Preserve streaming replies, the floating composer, employee ownership and existing group delivery rules.
