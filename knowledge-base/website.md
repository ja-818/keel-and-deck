# Houston Website (gethouston.ai)

## Location & Stack

| What | Where |
|------|-------|
| Source | `website/src/` |
| Build output | `website/_site/` |
| Generator | 11ty (Eleventy) v3 |
| Config | `website/eleventy.config.js` |
| Deploy | `cd website && npx wrangler pages deploy _site --project-name=houston-site --branch=main --commit-dirty=true` |
| Dev server | `cd website && npx eleventy --serve` (http://localhost:8080) |
| Live URL | https://gethouston.ai/ |
| Hosting | Cloudflare Pages (project: `houston-site`) |
| Cache headers | `website/src/_headers` |

## Pages

| Page | Source | URL | Audience |
|------|--------|-----|----------|
| Landing | `src/index.html` | `/` | Individual users (anyone who works) |
| Startups | `src/startups/index.html` | `/startups/` | Founders building AI-native products on Houston |
| Learn (5 chapters) | `src/learn/*.html` | `/learn/` | Developers/founders building agents |
| Vision | `src/vision/index.html` | `/vision/` | Founders + investors (category-defining essay) |

## Learn Guide Structure

| Chapter | File | Content |
|---------|------|---------|
| 01 | `01-the-shift.html` | Why AI-as-feature hits a ceiling, AI-native concept |
| 02 | `02-symmetric-participation.html` | Humans and AI as equal participants in the workspace |
| 03 | `03-build-your-first-agent.html` | houston.json + CLAUDE.md, tabs, import, publish |
| 04 | `04-custom-components.html` | Custom React bundle.js, Vite setup, props, Houston packages |
| 05 | `05-workspace-templates.html` | workspace.json, multi-agent repos, GitHub import |

## Shared Partials (`src/_includes/`)

| Partial | Used by |
|---------|---------|
| `base.njk` | All pages (DOCTYPE, head, body shell, General Sans font, favicon) |
| `nav-landing.njk` | Landing page |
| `nav-startups.njk` | Startups page (dark nav, white text) |
| `nav-docs.njk` | Learn + Vision pages |
| `footer-landing.njk` | Landing page (4-column) |
| `footer-startups.njk` | Startups page (3-column) |
| `footer-learn.njk` | Learn + Vision pages |
| `sidebar-learn.njk` | Learn pages (chapter navigation, `activeChapter` param) |

## Startups Page Design

- **Dark hero** with gradient glow, white text
- **Cycling headline**: "Ship the Claude Code for [your industry / taxes / legal / ...]" (blur-letter-stagger animation)
- **Concept strip**: 4-column numbered cards (01-04) explaining AI-native shift
- **Comparison**: SimpleBooks vs SmartBooks (white/dark columns, capability-focused)
- **Platform section**: Full-width dark with 01/02/03 pillars
- **Proof**: Tax story ("1 evening" stat card)
- **Steps**: Three cards (Define / Test / Deploy)
- **Pricing**: Open source vs Houston Cloud (joined cards)
- **Nav is dark-themed** (white text, dark scrolled background)

## Key Messaging

- Houston is a **platform**, never a "framework" or "library"
- Individual users: "AI agents that do the work for you"
- Founders: "Ship the Claude Code for your industry"
- Open source = trust + escape hatch, not the selling point
- Houston Cloud = deploy to customers with custom branding (waitlist)
- The internal React/Rust packages are infrastructure, not the developer product

## Deploy Workflow

```bash
cd website
npx eleventy                    # Build to _site/
npx wrangler pages deploy _site \
  --project-name=houston-site \
  --branch=main \
  --commit-dirty=true
```

IMPORTANT: `--branch=main` is required for production deploy. Without it, deploys go to a preview URL.
