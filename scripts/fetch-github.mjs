#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf8'));
const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error('Missing GITHUB_TOKEN environment variable.');
  process.exit(1);
}

const now = new Date();
const from = new Date(now);
from.setFullYear(now.getFullYear() - 1);

const query = /* GraphQL */ `
  query Profile($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      login
      name
      bio
      location
      createdAt
      followers { totalCount }
      following { totalCount }
      repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: UPDATED_AT, direction: DESC}) {
        totalCount
        nodes {
          name
          url
          isPrivate
          isFork
          isArchived
          pushedAt
          updatedAt
          stargazerCount
          forkCount
          issues(states: OPEN) { totalCount }
          primaryLanguage { name color }
        }
      }
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

async function graphql(queryText, variables) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': `${config.username}-profile-broadcast`
    },
    body: JSON.stringify({ query: queryText, variables })
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}: ${await response.text()}`);
  }

  const body = await response.json();
  if (body.errors?.length) throw new Error(body.errors.map((error) => error.message).join('\n'));
  return body.data;
}

function calculateStreaks(days) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let longest = 0;
  let running = 0;

  for (const day of sorted) {
    if (day.contributionCount > 0) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  let index = sorted.length - 1;
  const today = new Date().toISOString().slice(0, 10);
  if (index >= 0 && sorted[index].date === today && sorted[index].contributionCount === 0) index -= 1;

  let current = 0;
  while (index >= 0 && sorted[index].contributionCount > 0) {
    current += 1;
    index -= 1;
  }

  return { current, longest };
}

function recentRepositories(repositories) {
  const excluded = new Set([config.username, ...(config.tower?.exclude ?? [])].map((name) => String(name).toLowerCase()));
  const limit = Number(config.tower?.limit ?? 5);

  return repositories
    .filter((repo) => !repo.isPrivate && !repo.isFork && !repo.isArchived && !excluded.has(repo.name.toLowerCase()))
    .sort((a, b) => new Date(b.pushedAt ?? b.updatedAt ?? 0) - new Date(a.pushedAt ?? a.updatedAt ?? 0))
    .slice(0, limit)
    .map((repo) => ({
      name: repo.name,
      url: repo.url,
      language: repo.primaryLanguage?.name ?? 'Mixed',
      languageColor: repo.primaryLanguage?.color ?? null,
      stars: repo.stargazerCount,
      pushedAt: repo.pushedAt ?? repo.updatedAt
    }));
}

const result = await graphql(query, {
  login: config.username,
  from: from.toISOString(),
  to: now.toISOString()
});

if (!result.user) throw new Error(`GitHub user ${config.username} was not found.`);

const user = result.user;
const publicRepositories = (user.repositories.nodes ?? []).filter((repo) => !repo.isPrivate);
const calendar = user.contributionsCollection.contributionCalendar.weeks
  .flatMap((week) => week.contributionDays)
  .slice(-364);
const streaks = calculateStreaks(calendar);

await fs.mkdir(path.join(root, 'data'), { recursive: true });

const output = {
  generatedAt: now.toISOString(),
  identity: {
    name: user.name,
    bio: user.bio,
    location: user.location
  },
  profile: {
    repositories: user.repositories.totalCount,
    stars: publicRepositories.reduce((sum, repo) => sum + repo.stargazerCount, 0),
    followers: user.followers.totalCount,
    following: user.following.totalCount,
    commits: user.contributionsCollection.totalCommitContributions,
    pullRequests: user.contributionsCollection.totalPullRequestContributions,
    issues: user.contributionsCollection.totalIssueContributions,
    reviews: user.contributionsCollection.totalPullRequestReviewContributions,
    contributions: user.contributionsCollection.contributionCalendar.totalContributions,
    privateContributions: user.contributionsCollection.restrictedContributionsCount,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    forks: publicRepositories.reduce((sum, repo) => sum + repo.forkCount, 0),
    openIssues: publicRepositories.reduce((sum, repo) => sum + repo.issues.totalCount, 0),
    accountCreatedAt: user.createdAt
  },
  recentRepositories: recentRepositories(publicRepositories)
};

await fs.writeFile(path.join(root, 'data', 'github.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Fetched live GitHub data and timing tower repositories for ${config.username}.`);
