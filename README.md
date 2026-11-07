# conflux

Everything I post elsewhere, in one feed. A GitHub Action pulls from my accounts every so often, saves it as JSON in `data/`, and publishes a static site to Pages.

Sources and site settings are in `config/sources.json`. `npm test` to test, `npm run preview` to look at it.

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
