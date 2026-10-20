QibitAI canvas plugin 0.1.56

- Make new reply characters appear in order, then settle from 20% to full ink over 120 ms. Apply the initial paint inside the mutation checkpoint so an arriving batch cannot flash at full strength before fading. Keep the full Markdown DOM, selection and input intact.
- Animate live first batches and larger group polling batches. Compress adjacent characters into shared highlight ranges, use static ranges and binary text lookup, and keep timestamps monotonic so the reveal cannot move backwards within a frame. Oversized batches remain immediately readable.
- Let the last letters finish their short sweep when generation ends. Carry the remaining animation from a temporary group reply to its matching durable message in the same window; do not replay loaded history.
- Keep employee ownership, permissions, task queues, model-maker icons and the floating composer unchanged. Reduced motion, hidden tabs, unsupported browsers and closed windows release visual work immediately.
