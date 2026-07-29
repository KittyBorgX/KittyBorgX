#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const themes = {
  tokyonight: {
    bg: '#0f111a', panel: '#16161e', panel2: '#1a1b26', border: '#3b4261', grid: '#24283b',
    text: '#c0caf5', soft: '#a9b1d6', muted: '#565f89', red: '#f7768e', redDeep: '#db4b4b',
    green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', purple: '#bb9af7', cyan: '#7dcfff', orange: '#ff9e64'
  },
  gruvbox: {
    bg: '#1d2021', panel: '#282828', panel2: '#32302f', border: '#504945', grid: '#3c3836',
    text: '#ebdbb2', soft: '#d5c4a1', muted: '#928374', red: '#fb4934', redDeep: '#cc241d',
    green: '#b8bb26', yellow: '#fabd2f', blue: '#83a598', purple: '#d3869b', cyan: '#8ec07c', orange: '#fe8019'
  }
};

const args = process.argv.slice(2);
const argValue = (key, fallback) => {
  const index = args.indexOf(key);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const requestedTheme = argValue('--theme', 'all');
const dataFile = path.resolve(root, argValue('--data', 'data/demo.json'));

function xml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function number(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value ?? 0));
}

function truncate(value, limit = 20) {
  const text = String(value ?? '');
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1))}…` : text;
}

function wrap(value, limit = 34) {
  const words = String(value ?? '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > limit && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function panel(x, y, w, h, title, t, options = {}) {
  const titleWidth = options.titleWidth ?? Math.max(150, title.length * 11 + 42);
  return `
    <g>
      <rect class="panel" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>
      ${title ? `<path d="M${x + 1} ${y + 42}H${x + w - 1}" class="separator"/>` : ''}
      ${title ? `<path d="M${x + 12} ${y}H${x + titleWidth}L${x + titleWidth - 15} ${y + 32}H${x + 12}Z" fill="${t.panel2}"/>` : ''}
      ${title ? `<text x="${x + 18}" y="${y + 27}" class="panel-title">${xml(title)}</text>` : ''}
    </g>`;
}

function stat(x, y, w, label, value, sub, colour, t) {
  return `
    <g>
      <path d="M${x + w} ${y + 14}V${y + 72}" stroke="${t.border}" stroke-width="1"/>
      <text x="${x + 18}" y="${y + 25}" class="stat-label">${xml(label)}</text>
      <text x="${x + 18}" y="${y + 54}" class="stat-value" fill="${colour}">${xml(value)}</text>
      <text x="${x + 18}" y="${y + 72}" class="stat-sub">${xml(sub)}</text>
    </g>`;
}

function parseDate(value) {
  const result = new Date(value ?? 0).getTime();
  return Number.isFinite(result) ? result : 0;
}

function formatGap(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `+${days}d ${String(hours).padStart(2, '0')}h`;
  if (hours > 0) return `+${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `+${minutes}m`;
}

function towerRows(repositories) {
  if (!repositories?.length) return [];
  const leader = parseDate(repositories[0].pushedAt);
  return repositories.map((repo, index) => {
    const current = parseDate(repo.pushedAt);
    const previous = index ? parseDate(repositories[index - 1].pushedAt) : current;
    return {
      ...repo,
      position: index + 1,
      interval: index === 0 ? '—' : formatGap(previous - current),
      leaderGap: index === 0 ? '+0.000' : formatGap(leader - current)
    };
  });
}

function timingTower(data, config, x, y, w, h, t) {
  const repos = towerRows((data.recentRepositories ?? []).slice(0, Number(config.tower?.limit ?? 6)));
  const colours = [t.red, t.yellow, t.green, t.blue, t.purple];
  const rowH = 92;

  if (!repos.length) {
    return `<text x="${x + w / 2}" y="${y + 185}" text-anchor="middle" class="tower-meta">NO LIVE REPOSITORY DATA</text>
      <text x="${x + w / 2}" y="${y + 212}" text-anchor="middle" class="tower-meta">RUN npm run update</text>`;
  }

  const header = `
    <rect x="${x + 12}" y="${y + 54}" width="${w - 24}" height="26" rx="6" fill="${t.panel2}" stroke="${t.border}"/>
    <text x="${x + 22}" y="${y + 72}" class="tower-header">P</text>
    <text x="${x + 62}" y="${y + 72}" class="tower-header">REPOSITORY</text>
    <text x="${x + w - 78}" y="${y + 72}" text-anchor="end" class="tower-header">INT</text>
    <text x="${x + w - 16}" y="${y + 72}" text-anchor="end" class="tower-header">LEADER</text>`;

  const rows = repos.map((repo, index) => {
    const rowY = y + 86 + index * rowH;
    const colour = colours[index % colours.length];
    const langColour = /^#[0-9a-f]{6}$/i.test(repo.languageColor ?? '') ? repo.languageColor : colour;
    const group = `
      <g>
        <rect x="${x + 12}" y="${rowY}" width="${w - 24}" height="72" rx="8" fill="${t.panel2}" stroke="${t.border}"/>
        <rect x="${x + 12}" y="${rowY}" width="32" height="72" rx="8" fill="${colour}"/>
        <text x="${x + 28}" y="${rowY + 43}" text-anchor="middle" class="tower-position">${repo.position}</text>
        <text x="${x + 56}" y="${rowY + 28}" class="tower-name">${xml(truncate(repo.name, 10))}</text>
        <circle cx="${x + 60}" cy="${rowY + 49}" r="4" fill="${langColour}"/>
        <text x="${x + 72}" y="${rowY + 54}" class="tower-stack">${xml(truncate(repo.language ?? 'Mixed', 10))}</text>
        <text x="${x + w - 78}" y="${rowY + 30}" text-anchor="end" class="tower-gap">${xml(repo.interval)}</text>
        <text x="${x + w - 16}" y="${rowY + 30}" text-anchor="end" class="tower-gap leader">${xml(repo.leaderGap)}</text>
      </g>`;
    return repo.url ? `<a href="${xml(repo.url)}">${group}</a>` : group;
  }).join('');

  return `${header}${rows}`;
}

function avatarAscii(avatar, x, y, t) {
  if (!avatar?.rows?.length) return '';
  const cellW = 9.1;
  const lineH = 16.1;
  let output = '';
  avatar.rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const char = cell?.ch ?? ' ';
      if (char === ' ') return;
      const fill = cell?.color || t.text;
      output += `<text x="${(x + columnIndex * cellW).toFixed(1)}" y="${(y + rowIndex * lineH).toFixed(1)}" class="ascii-char" fill="${fill}">${xml(char)}</text>`;
    });
  });
  return output;
}

function neofetchRows(config) {
  const n = config.neofetch ?? {};
  const contact = config.contact ?? {};
  return [
    ['User', `${config.username}@github`],
    ['Name', config.name],
    ['Role', config.role],
    ['Location', config.location],
    ['LinkedIn', contact.linkedin],
    ['Discord', contact.discord],
    ['Focus', config.focus],
    ['Building', config.building],
    ['Hobbies', config.hobbies],
    ['OS', n.os],
    ['Host', n.host],
    ['Shell', n.shell],
    ['Terminal', n.terminal],
    ['Editor', n.editor],
    ['Languages', n.languages],
    ['Status', config.status]
  ].filter(([, value]) => value);
}

function palette(x, y, t) {
  const colours = [t.red, t.yellow, t.green, t.cyan, t.blue, t.purple, t.soft, t.text];
  return colours.map((colour, index) => `<rect x="${x + index * 22}" y="${y}" width="16" height="12" rx="2" fill="${colour}"/>`).join('');
}

function radioTelemetry(x, baseline, width, t) {
  const barCount = 10;
  const gap = width / barCount;
  let output = `<line x1="${x}" y1="${baseline}" x2="${x + width}" y2="${baseline}" stroke="${t.red}" stroke-width="3" filter="url(#radioGlow)"/>`;

  for (let index = 0; index < barCount; index += 1) {
    const amplitude = 24 + Math.round(Math.abs(Math.sin(index * 1.17) + Math.cos(index * 0.63) * 0.55) * 33);
    const barX = x + index * gap + 4;
    const barWidth = Math.max(8, gap - 10);
    output += `<rect x="${barX.toFixed(1)}" y="${(baseline - amplitude).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${amplitude}" rx="1.5" fill="url(#radioBars)"/>`;
  }

  return output;
}

function splitRadioQuote(message) {
  const normalized = String(message ?? '').trim().replace(/[“”]/g, '');
  if (!normalized) return ['PUSH MODE ENABLED.', 'KEEP BUILDING.'];

  const comma = normalized.indexOf(',');
  if (comma > 0 && comma < 24) {
    return [
      normalized.slice(0, comma + 1).toUpperCase(),
      normalized.slice(comma + 1).trim().toUpperCase()
    ];
  }

  const lines = wrap(normalized.toUpperCase(), 22);
  return [lines[0] ?? normalized.toUpperCase(), lines.slice(1).join(' ') || ''];
}

function teamRadioBroadcast(x, y, w, h, message, t) {
  const [lineOne, lineTwo] = splitRadioQuote(message);
  const baseline = y + 194;
  return `
    <text x="${x + w - 200}" y="${y + 78}" class="radio-brand">KITTYBORGX</text>
    <text x="${x + w - 24}" y="${y + 116}" text-anchor="end" class="radio-word">RADIO</text>

    <text x="${x + 22}" y="${y + 190}" class="radio-number">01</text>
    ${radioTelemetry(x + 92, baseline, w - 118, t)}

    <rect x="${x + w - 72}" y="${y + 154}" width="48" height="24" rx="4" fill="${t.red}"/>
    <text x="${x + w - 48}" y="${y + 171}" text-anchor="middle" class="radio-badge">KBX</text>

    <text x="${x + 24}" y="${y + 242}" class="radio-quote-red">“${xml(lineOne)}</text>
    <text x="${x + 24}" y="${y + 278}" class="radio-quote-white">${xml(lineTwo)}”</text>

    <circle cx="${x + 28}" cy="${y + h - 23}" r="4" fill="${t.red}" filter="url(#glow)"/>
    <text x="${x + 42}" y="${y + h - 18}" class="radio-footer">CAR 01 · TEAM RADIO · LIVE</text>`;
}

function renderSvg(config, data, themeName, avatar) {
  const t = themes[themeName];
  const p = data.profile ?? {};
  const neoRows = neofetchRows(config);
  const generated = new Date(data.generatedAt ?? Date.now());
  const updated = Number.isNaN(generated.getTime())
    ? 'LIVE DATA'
    : generated.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });

  const statsX = 370;
  const statsY = 744;
  const statsW = 1200;
  const statW = statsW / 6;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title desc">
  <title id="title">${xml(config.username)} GitHub profile</title>
  <desc id="desc">F1 broadcast layout with a non-ASCII timing tower, Andrew-style neofetch panel, F1-style timing tower, a compact single-message team radio card and GitHub career stats.</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.bg}"/>
      <stop offset="1" stop-color="${t.panel}"/>
    </linearGradient>
    <linearGradient id="headerFade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${t.redDeep}" stop-opacity="0.28"/>
      <stop offset="0.45" stop-color="${t.panel2}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${t.bg}" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="radioBars" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${t.red}" stop-opacity="1"/>
      <stop offset="1" stop-color="${t.red}" stop-opacity=".12"/>
    </linearGradient>
    <filter id="radioGlow" x="-20%" y="-200%" width="140%" height="500%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse">
      <path d="M0 3.5H4" stroke="${t.text}" stroke-opacity="0.018"/>
    </pattern>
    <style>
      text { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
      .panel { fill: ${t.panel}; stroke: ${t.border}; stroke-width: 1.4; }
      .separator { stroke: ${t.border}; stroke-width: 1; opacity: .78; }
      .panel-title { fill: ${t.text}; font-size: 17px; font-weight: 800; letter-spacing: 1.4px; }
      .header-brand { fill: ${t.text}; font-size: 24px; font-weight: 850; letter-spacing: .2px; }
      .header-sub { fill: ${t.soft}; font-size: 17px; font-weight: 800; letter-spacing: 1.2px; }
      .header-meta { fill: ${t.soft}; font-size: 16px; font-weight: 700; letter-spacing: .8px; }
      .header-live { fill: ${t.red}; font-size: 19px; font-weight: 900; letter-spacing: 1px; }
      .terminal-title { fill: ${t.soft}; font-size: 16px; }
      .ascii-char { font-size: 13.7px; font-weight: 800; }
      .neo-user { fill: ${t.text}; font-size: 18px; font-weight: 850; }
      .neo-rule { fill: ${t.muted}; font-size: 15px; }
      .neo-label { fill: ${t.blue}; font-size: 13.4px; font-weight: 850; }
      .neo-value { fill: ${t.text}; font-size: 13.4px; }
      .prompt { fill: ${t.green}; font-size: 17px; font-weight: 700; }
      .tower-header { fill: ${t.soft}; font-size: 10.5px; font-weight: 900; letter-spacing: .8px; }
      .tower-position { fill: ${t.bg}; font-size: 24px; font-weight: 950; }
      .tower-name { fill: ${t.text}; font-size: 15px; font-weight: 850; }
      .tower-stack { fill: ${t.muted}; font-size: 12px; }
      .tower-gap { fill: ${t.text}; font-size: 10.5px; font-weight: 850; }
      .tower-gap.leader { fill: ${t.red}; }
      .tower-meta { fill: ${t.muted}; font-size: 13px; }
      .radio-brand { fill: ${t.red}; font-family: Arial, Helvetica, sans-serif; font-size: 29px; font-weight: 900; letter-spacing: -1px; }
      .radio-word { fill: ${t.text}; font-family: Arial, Helvetica, sans-serif; font-size: 28px; font-weight: 900; letter-spacing: -.8px; }
      .radio-number { fill: ${t.red}; font-family: Arial, Helvetica, sans-serif; font-size: 82px; font-weight: 900; letter-spacing: -5px; }
      .radio-badge { fill: ${t.bg}; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 900; }
      .radio-quote-red { fill: ${t.red}; font-family: Arial, Helvetica, sans-serif; font-size: 20px; font-weight: 850; letter-spacing: .3px; }
      .radio-quote-white { fill: ${t.text}; font-family: Arial, Helvetica, sans-serif; font-size: 20px; font-weight: 850; letter-spacing: .3px; }
      .radio-footer { fill: ${t.muted}; font-size: 10px; font-weight: 850; letter-spacing: .7px; }
      .radio-kicker { fill: ${t.muted}; font-size: 12px; font-weight: 800; letter-spacing: 1px; }
      .quote-line { fill: ${t.soft}; font-size: 13px; font-style: italic; }
      .stat-label { fill: ${t.muted}; font-size: 12px; font-weight: 800; letter-spacing: .6px; }
      .stat-value { font-size: 27px; font-weight: 900; }
      .stat-sub { fill: ${t.muted}; font-size: 10px; font-weight: 700; letter-spacing: .5px; }
      .footer { fill: ${t.muted}; font-size: 11px; font-weight: 800; letter-spacing: 1.3px; }
    </style>
  </defs>

  <rect width="1600" height="900" fill="url(#background)"/>
  <rect width="1600" height="900" fill="url(#scanlines)"/>

  <rect x="0" y="0" width="1600" height="74" fill="${t.bg}"/>
  <path d="M0 72H1600" stroke="${t.redDeep}" stroke-width="2"/>
  <text x="30" y="44" class="header-brand">${xml(config.brand)}</text>
  <text x="200" y="44" class="header-sub">${xml(config.eventTitle)}</text>
  <g transform="translate(420 23) skewX(-18)">
    ${[0, 1, 2, 3].map((index) => `<rect x="${index * 18}" y="${index % 2 ? 15 : 0}" width="16" height="16" fill="${index % 2 ? t.text : t.muted}" opacity=".75"/>`).join('')}
  </g>
  <text x="800" y="43" class="header-meta">SESSION: <tspan fill="${t.red}" font-weight="900">${xml(config.session)}</tspan></text>
  <rect x="1070" y="19" width="120" height="37" rx="8" fill="${t.red}" fill-opacity=".08" stroke="${t.red}"/>
  <circle cx="1091" cy="38.5" r="7" fill="${t.red}" filter="url(#glow)"/>
  <text x="1110" y="45" class="header-live">LIVE</text>
  <text x="1215" y="42" class="header-meta">${xml(config.location.split(',')[0].toUpperCase())}, IN</text>
  <text x="1568" y="42" text-anchor="end" class="header-meta">UTC+5:30      ${xml(updated)}</text>

  ${panel(30, 94, 320, 634, 'TIMING TOWER', t, { titleWidth: 188 })}
  ${timingTower(data, config, 30, 94, 320, 634, t)}

  ${panel(370, 94, 850, 634, '', t, { titleWidth: 0 })}
  <circle cx="396" cy="116" r="7" fill="${t.red}"/>
  <circle cx="419" cy="116" r="7" fill="${t.yellow}"/>
  <circle cx="442" cy="116" r="7" fill="${t.green}"/>
  <text x="477" y="122" class="terminal-title">${xml(config.username.toLowerCase())}@github ~</text>

  <text x="415" y="166" class="prompt">${xml(config.username.toLowerCase())}@github ~ $ neofetch</text>
  ${avatarAscii(avatar, 415, 224, t)}
  <text x="415" y="662" class="prompt">${xml(config.username.toLowerCase())}@github ~ $ █</text>

  <text x="795" y="210" class="neo-user">${xml(config.username)}@github</text>
  <text x="795" y="233" class="neo-rule">${'─'.repeat(34)}</text>
  ${neoRows.map(([label, value], index) => {
    const rowY = 254 + index * 25;
    return `<text x="795" y="${rowY}" class="neo-label">${xml(label)}</text><text x="918" y="${rowY}" class="neo-value">${xml(truncate(value, 28))}</text>`;
  }).join('')}

  ${panel(1240, 94, 330, 360, 'TEAM RADIO', t, { titleWidth: 166 })}
  <text x="1538" y="123" text-anchor="end" class="radio-kicker">((•))</text>
  ${teamRadioBroadcast(1240, 94, 330, 360, config.radioMessage, t)}

  <rect x="${statsX}" y="${statsY}" width="${statsW}" height="106" rx="10" fill="${t.panel}" stroke="${t.border}" stroke-width="1.4"/>
  ${stat(statsX, statsY + 8, statW, 'REPOSITORIES', number(p.repositories), 'CARS ENTERED', t.text, t)}
  ${stat(statsX + statW, statsY + 8, statW, 'STARS', number(p.stars), 'CHAMPIONSHIP POINTS', t.yellow, t)}
  ${stat(statsX + statW * 2, statsY + 8, statW, 'FOLLOWERS', number(p.followers), 'PIT CREW', t.blue, t)}
  ${stat(statsX + statW * 3, statsY + 8, statW, 'COMMITS', number(p.commits), 'LAPS COMPLETED', t.red, t)}
  ${stat(statsX + statW * 4, statsY + 8, statW, 'PULL REQUESTS', number(p.pullRequests), 'OVERTAKES', t.green, t)}
  ${stat(statsX + statW * 5, statsY + 8, statW - 1, 'CURRENT STREAK', `${number(p.currentStreak)} days`, 'CURRENT STINT', t.orange, t)}
  <text x="1570" y="888" text-anchor="end" class="footer">KITTYBORGX / BUILD / LEARN / RACE / REPEAT</text>
</svg>`;
}

async function main() {
  const config = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf8'));
  const data = JSON.parse(await fs.readFile(dataFile, 'utf8'));
  let avatar = null;
  try {
    avatar = JSON.parse(await fs.readFile(path.join(root, 'data', 'avatar-ascii.json'), 'utf8'));
  } catch {}
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });

  const selected = requestedTheme === 'all' ? Object.keys(themes) : [requestedTheme];
  for (const themeName of selected) {
    if (!themes[themeName]) throw new Error(`Unknown theme: ${themeName}`);
    const output = path.join(root, 'assets', `profile-${themeName}.svg`);
    await fs.writeFile(output, renderSvg(config, data, themeName, avatar), 'utf8');
    console.log(`Generated ${path.relative(root, output)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
