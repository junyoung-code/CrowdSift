<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## CrowdSift project rules

- Treat `docs/product-context.md` and `docs/CrowdSift_Project_Context_v1.0.pdf` as the product source of truth. The Markdown file is the concise implementation guide; the PDF contains the fuller context.
- Build the first real vertical slice before secondary dashboards: YouTube connection → choose one video → import 20–50 comments → AI classification → database storage → Comment Inbox.
- Never present a mock integration, sample metric, or placeholder response as real connected data.
- Keep raw YouTube comments, AI outputs, sanitized feedback, user actions, evidence records, and audit logs structurally separate.
- AI may recommend moderation, but irreversible actions require explicit user confirmation.
- Preserve source content before a moderation action and never overwrite the original with sanitized text.
- Keep the initial UI responsive and accessible. Harmful comment text should be hidden by default when comment features are introduced.
- Keep secrets server-side. Commit only `.env.example`, never a populated `.env` file.
- Before reporting a change as complete, run `npm run lint` and `npm run build`.
- Prefer the smallest implementation that advances the approved vertical slice. Do not add billing, multi-platform support, or unrelated dashboards without a new decision.
