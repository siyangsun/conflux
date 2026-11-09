# conflux

One feed of everything I post elsewhere. A GitHub Action fetches my accounts every 15 minutes (hourly overnight UTC), stores the items as JSON in `data/`, and deploys a static site to GitHub Pages.

Sources and site settings live in `config/sources.json`. Run `npm test` for the tests and `npm run preview` to build and serve the site locally.

## More sources (public, no keys)

Turn on `rss` in `config/sources.json` and add `{ "source": "<label>", "url": "<feed>" }` per feed. The label is the name shown on the site.

- Bluesky `https://bsky.app/profile/HANDLE/rss`
- Mastodon `https://INSTANCE/@USER.rss`
- Letterboxd `https://letterboxd.com/USER/rss/`
- Goodreads `https://www.goodreads.com/review/list_rss/ID?shelf=read`
- Medium `https://medium.com/feed/@USER`
- Pinboard `https://feeds.pinboard.in/rss/u:USER/`
- Reddit `https://www.reddit.com/user/USER/submitted.rss` (often blocks GitHub Actions IPs)

`hackernews` takes a `username` and reads the public Algolia API.
