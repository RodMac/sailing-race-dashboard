function twelveTo24(time12) {
  const m = String(time12).trim().match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  const ap = m[3].toUpperCase();
  if (ap === 'AM') {
    if (hh === 12) hh = 0;
  } else if (hh !== 12) {
    hh += 12;
  }
  return `${String(hh).padStart(2, '0')}:${mm}`;
}

function aucklandNowKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export function parseTideForecastHtml(html) {
  const dateHeaderMatch = html.match(/<tr><th class="tide-table__day" colspan="4"[\s\S]*?<\/tr>/i);
  if (!dateHeaderMatch) throw new Error('Could not find tide date headers');
  const dates = [...dateHeaderMatch[0].matchAll(/data-date="([0-9-]+)"/g)].map((m) => m[1]);
  if (!dates.length) throw new Error('No tide dates found');

  const highRowMatch = html.match(/<tr class="tide-table__separator">[\s\S]*?<td class="tide-table__part tide-table__part--high[\s\S]*?<\/tr><tr class="tide-table__separator tide-table__separator--wide">/i);
  const lowRowMatch = html.match(/<tr class="tide-table__separator tide-table__separator--wide">[\s\S]*?<td class="tide-table__part tide-table__part--low[\s\S]*?<\/tr><tr class="tide-table__separator">/i);
  if (!highRowMatch || !lowRowMatch) throw new Error('Could not find tide rows');

  const cellRegex = /<td class="tide-table__part[^>]*>([\s\S]*?)<\/td>/g;
  const highRow = highRowMatch[0].replace(/<\/tr><tr class="tide-table__separator tide-table__separator--wide">$/i, '</tr>');
  const lowRow = lowRowMatch[0].replace(/<\/tr><tr class="tide-table__separator">$/i, '</tr>');
  const highCells = [...highRow.matchAll(cellRegex)].map((m) => m[1]);
  const lowCells = [...lowRow.matchAll(cellRegex)].map((m) => m[1]);

  const extractEvents = (cellHtml, type, date) => {
    const matches = [...cellHtml.matchAll(/<span class="tide-time__time[^>]*>\s*([^<]+)<\/span><span class="tide-time__height">\s*([^<]+)/g)];
    return matches.map((m) => ({
      type,
      date,
      time12: m[1].trim(),
      time24: twelveTo24(m[1].trim()),
      height: parseFloat(m[2]),
    })).filter((e) => e.time24);
  };

  const events = [];

  // Day 0 spans 4 AM/PM cells, later days each use a single combined cell.
  for (let i = 0; i < Math.min(4, highCells.length); i++) {
    events.push(...extractEvents(highCells[i] || '', 'High', dates[0]));
    events.push(...extractEvents(lowCells[i] || '', 'Low', dates[0]));
  }
  for (let i = 1; i < dates.length; i++) {
    const cellIndex = i + 3;
    events.push(...extractEvents(highCells[cellIndex] || '', 'High', dates[i]));
    events.push(...extractEvents(lowCells[cellIndex] || '', 'Low', dates[i]));
  }

  events.sort((a, b) => `${a.date} ${a.time24}`.localeCompare(`${b.date} ${b.time24}`));

  const nowKey = aucklandNowKey();
  const past = events.filter((e) => `${e.date} ${e.time24}` < nowKey).slice(-1);
  const future = events.filter((e) => `${e.date} ${e.time24}` >= nowKey).slice(0, 5);
  const visible = [...past, ...future].map((e) => ({
    ...e,
    past: `${e.date} ${e.time24}` < nowKey,
  }));
  const next = future[0] || null;

  return {
    source: 'tide-forecast.com',
    timezone: 'Pacific/Auckland',
    fetchedAt: new Date().toISOString(),
    nowKey,
    next,
    events: visible,
  };
}
