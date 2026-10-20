QibitAI canvas plugin 0.1.57

- Make new reply characters appear in order, then settle from 20% to full ink over 120 ms. Fast completed replies that arrive without a live streaming row receive one guarded reveal only when they were produced after the open conversation visit. Apply the initial paint inside the mutation checkpoint so an arriving batch cannot flash at full strength before fading. Keep the full Markdown DOM, selection and input intact.
- Animate live first batches and larger group polling batches. Compress adjacent characters into shared highlight ranges, use static ranges and binary text lookup, and keep timestamps monotonic so the reveal cannot move backwards within a frame. Oversized batches remain immediately readable.
- Let the last letters finish their short sweep when generation ends. Carry the remaining animation from a temporary group reply to its matching durable message in the same window; do not replay loaded history.
- Keep employee ownership, permissions, task queues and model-maker icons unchanged. Add an original caret overlay that follows a measurable collapsed editor selection with an 80 ms glide, while preserving composition, selection and IME behavior.
- Keep the floating composer unchanged. Reduced motion, hidden tabs, unsupported browsers and closed windows release visual work immediately.
