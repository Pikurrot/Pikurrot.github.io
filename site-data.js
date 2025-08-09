async function loadData() {
  const res = await fetch('site-data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Failed to load site-data.json');
  return res.json();
}

function fmtDuration(startISO, endISO) {
  const start = new Date(startISO);
  const end = endISO ? new Date(endISO) : new Date();
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  if (months < 0) { years -= 1; months += 12; }
  const parts = [];
  if (years > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`);
  if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
  if (parts.length === 0) parts.push('0 months');
  return parts.join(', ');
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function iconFor(type) {
  switch (type) {
    case 'page':
      return 'https://img.icons8.com/?size=100&id=69143&format=png&color=000000';
    case 'arxiv':
      return 'https://cdn.simpleicons.org/arxiv/000000';
    case 'github':
      return 'https://cdn.simpleicons.org/github/000000';
    default:
      return 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/link-45deg.svg';
  }
}

function renderProject(p) {
  const venue = p.venue || {};
  const badge = venue.url && !venue.muted
    ? `<a class="badge-venue" href="${venue.url}" target="_blank" rel="noreferrer">${venue.text}</a>`
    : `<div class="badge-venue ${venue.muted ? 'badge-venue--muted' : ''}">${venue.text || ''}</div>`;
  const authors = (p.authors || []).map(a => {
    const cls = a.me ? 'author-me' : '';
    const href = a.url || '#';
    return `<a class="${cls}" href="${href}">${a.name}</a>`;
  }).join(', ');
  const links = (p.links || []).map(l => `
    <a class="proj-link" href="${l.url}" target="_blank" rel="noreferrer">
      <img width="16" height="16" src="${iconFor(l.type)}" alt="${l.text}" />
      <span>${l.text}</span>
    </a>`).join('');
  return el(`
    <article class="project-card">
      <div class="proj-right">
        <img class="proj-media" src="${p.media}" alt="Project preview" />
      </div>
      <div class="proj-left">
        <h3 class="proj-title">${p.title}</h3>
        <div class="proj-authors">${authors}</div>
        ${badge}
        <div class="proj-links">${links}</div>
      </div>
    </article>
  `);
}

function renderExperience(e) {
  const duration = fmtDuration(e.start, e.end);
  const endText = e.end ? new Date(e.end).toLocaleString(undefined, { year: 'numeric', month: 'short' }) : 'Present';
  const startText = new Date(e.start).toLocaleString(undefined, { year: 'numeric', month: 'short' });
  return el(`
    <article class="experience-item">
      <div class="exp-left">
        <img class="exp-logo" src="${e.logo || 'assets/company.png'}" alt="Company logo" />
      </div>
      <div class="exp-right">
        <h3 class="exp-title">${e.title}</h3>
        <div><span class="exp-company">${e.company}</span> · <span class="exp-type">${e.type || ''}</span></div>
        <div class="exp-meta">${startText} – ${endText} · ${duration}</div>
        <div class="exp-location">${e.location || ''}</div>
        <p class="exp-desc">${e.description || ''}</p>
      </div>
    </article>
  `);
}

function renderEducation(ed) {
  const endText = ed.end ? new Date(ed.end).toLocaleString(undefined, { year: 'numeric', month: 'short' }) : 'Present';
  const startText = new Date(ed.start).toLocaleString(undefined, { year: 'numeric', month: 'short' });
  return el(`
    <article class="experience-item">
      <div class="exp-left">
        <img class="exp-logo" src="${ed.logo || 'assets/school.png'}" alt="Institution logo" />
      </div>
      <div class="exp-right">
        <h3 class="exp-title">${ed.title}</h3>
        <div><span class="exp-company">${ed.company}</span> · <span class="exp-type">${ed.type || ''}</span></div>
        <div class="exp-meta">${startText} – ${endText}</div>
        <div class="exp-location">${ed.location || ''}</div>
        <p class="exp-desc">${ed.description || ''}</p>
      </div>
    </article>
  `);
}

function renderHonor(h) {
  const dt = new Date(h.date);
  const dateText = dt.toLocaleString(undefined, { year: 'numeric', month: 'short' });
  return el(`
    <li class="honor-item">
      <div><span class="honor-title">${h.title}</span> — <span class="honor-place">${h.place}</span></div>
      <div class="honor-date">${dateText}</div>
      <div class="honor-desc">${h.description || ''}</div>
    </li>
  `);
}

async function fetchLastCommitDate() {
  try {
    const res = await fetch('https://api.github.com/repos/Pikurrot/Pikurrot.github.io/commits?per_page=1', { headers: { 'Accept': 'application/vnd.github+json' } });
    if (!res.ok) throw new Error('GitHub API error');
    const data = await res.json();
    const date = new Date(data[0]?.commit?.committer?.date || Date.now());
    return date.toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    return new Date().toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }
}

async function renderFooter() {
  const el = document.getElementById('site-footer');
  if (!el) return;
  const lastUpdated = await fetchLastCommitDate();
  el.innerHTML = `
    <div>© ${new Date().getFullYear()} Eric López — All rights reserved.</div>
    <small>Last updated: ${lastUpdated}</small>
    <small>Template created by myself.</small>
  `;
}

// expose hydrate for SPA
window.hydrateSiteData = async function hydrateSiteData() {
  try {
    const data = await loadData();
    const featured = document.getElementById('featured-projects');
    if (featured) {
      featured.innerHTML = '';
      data.projects.slice(0, 2).forEach(p => featured.appendChild(renderProject(p)));
    }
    const projPage = document.getElementById('projects-page-list');
    if (projPage) {
      projPage.innerHTML = '';
      data.projects.forEach(p => projPage.appendChild(renderProject(p)));
    }
    const expList = document.getElementById('experience-list');
    if (expList) {
      expList.innerHTML = '';
      data.experience.forEach(e => expList.appendChild(renderExperience(e)));
    }
    const eduList = document.getElementById('education-list');
    if (eduList) {
      eduList.innerHTML = '';
      data.education.forEach(ed => eduList.appendChild(renderEducation(ed)));
    }
    const honorsList = document.getElementById('honors-list');
    if (honorsList) {
      honorsList.innerHTML = '';
      data.honors.forEach(h => honorsList.appendChild(renderHonor(h)));
    }
    await renderFooter();
  } catch (e) {
    console.error(e);
  }
};

// initial hydrate
window.hydrateSiteData(); 