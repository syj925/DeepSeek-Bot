QibitAI canvas plugin 0.1.55

- Show recognizable model-maker artwork in the compact model button and model rows. Infer the maker from the model itself, so Claude and MiniMax do not inherit the gateway's icon; unknown models use a neutral fallback. Group chats still choose an employee before editing that employee's model.
- Add soft focus, background and send-control transitions to home and chat composers. Multiline drafts expand and contract smoothly; the home box supports Shift+Enter for a new line. Keep the shell editor, caret and Chinese IME intact, and keep chat input floating while history scrolls.
- Fade newly streamed characters to full ink over 240 ms, with brief staggering, without wrapping text or replacing Markdown nodes. Keep Markdown labels and text selection stable. Smooth small transcript growth only while following the latest reply; scrolling history keeps control with the reader.
- Honor reduced motion, pause visual work in hidden tabs and clean up each window independently. Browsers without the text-highlight API show streamed text immediately. Employee ownership, permissions, queues and hosted update behavior are unchanged.
