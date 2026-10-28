import { UA } from "./feed.ts";
import type { SourceState } from "./types.ts";

const DAY = 864e5;
export const shouldBeOpen = (s: SourceState | undefined, now: number) =>
  !!s?.failing_since && now - Date.parse(s.failing_since) >= DAY;

// One issue per source: opened (or refreshed) after 24h of failures, closed on recovery.
export async function syncIssues(state: Record<string, SourceState>, now = Date.now()) {
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return;
  const gh = async (path: string, method = "GET", body?: object) => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": UA },
      body: body && JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`issues ${method} ${path} -> HTTP ${res.status}`);
    return res.json() as Promise<any>;
  };
  const open = (await gh("/issues?state=open&per_page=100")).filter((i: any) => !i.pull_request);
  for (const [name, s] of Object.entries(state)) {
    const title = `Fetcher failing: ${name}`;
    const existing = open.find((i: any) => i.title === title);
    if (shouldBeOpen(s, now)) {
      const body = `Failing since ${s.failing_since}.\n\nLast error: \`${s.last_error}\``;
      if (!existing) await gh("/issues", "POST", { title, body });
      else if (existing.body !== body) await gh(`/issues/${existing.number}`, "PATCH", { body });
    } else if (existing) {
      await gh(`/issues/${existing.number}/comments`, "POST", { body: "Recovered." });
      await gh(`/issues/${existing.number}`, "PATCH", { state: "closed" });
    }
  }
}
