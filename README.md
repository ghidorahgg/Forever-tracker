# GhidorahGG Forever Tracker

Fan-made static web app for **World of Warcraft: Forever** (launch Nov 4, 2026, 3:00 PM PST).

- Legacy challenge checklist (65 standard challenges + beta-only 16-point challenge), each with source links and a confidence tag
- Multiple characters (localStorage), account points, per-character perk planner (cap 16) with automatic gate/prereq cascade, "what to do next"
- Shareable URL (`#p=…`) encoding the full plan
- Camp buff conflict checker for Basic (3) / Journeyman (5) / Expert (10) campfires
- Dungeon Quests tab: Classic 1–60 dungeon quests for Alliance, Horde, and both, with Wowhead links and checkboxes stored in localStorage (`src/data/dungeon-quests.json`)
- Talents tab: Classic 1.12 calculator for all 9 classes (51 points, tier gates, prerequisites). Share a build with `#t=class/points`. The last build for each class is saved in localStorage (`src/data/talents.json`)
- Launch countdown in PST + viewer's local time

Data lives in `src/data/legacy.json` (own wording; sourced from wowfdb.com, foreverdb.net, wowhead.com, theforeverera.com, Blizzard news). Beta data may change at launch.

## Develop
```
npm install
npm run dev      # local dev
npm run build    # outputs dist/
npm run preview  # serve dist/
```

## Deploy (free)
- **GitHub Pages:** push to `main` of a GitHub repo; set *Settings → Pages → Source: GitHub Actions*. `.github/workflows/deploy.yml` builds and publishes `dist/`. (`base: './'` makes sub-path hosting work.)
- **Cloudflare Pages:** connect the repo, build command `npm run build`, output `dist`.
- **Analytics:** paste your Cloudflare Web Analytics beacon into the placeholder comment in `index.html`.

## License
No license has been chosen yet, so all rights are reserved by default. Add a LICENSE file before accepting contributions or reuse.

Not affiliated with or endorsed by Blizzard Entertainment. World of Warcraft is a trademark of Blizzard Entertainment, Inc.
Made for the [GhidorahGG YouTube channel](https://www.youtube.com/@GhidorahGG).
