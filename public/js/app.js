// ── State ─────────────────────────────────────────────────────────────────────
let currentUser    = null;
let editingEventId = null;
let allEvents      = [];
let adminAllEvents = [];
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();

const CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CAL_DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  const me = await api('GET', '/api/me');
  if (me.loggedIn) { currentUser = me; showApp(); }
})();

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

async function apiForm(method, url, formData) {
  const res = await fetch(url, { method, body: formData });
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) =>
    t.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'signup' && i === 1)));
  document.getElementById('loginForm').classList.toggle('active', tab === 'login');
  document.getElementById('signupForm').classList.toggle('active', tab === 'signup');
}

function previewPhoto(input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('photoPreview');
    img.src = e.target.result;
    img.style.display = 'block';
    document.getElementById('photoPlaceholder').style.display = 'none';
  };
  reader.readAsDataURL(input.files[0]);
}

async function doLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.classList.remove('show');
  const data = await api('POST', '/api/login', {
    username: document.getElementById('loginUsername').value,
    password: document.getElementById('loginPassword').value
  });
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  currentUser = { ...data, loggedIn: true };
  showApp();
}

async function doSignup(e) {
  e.preventDefault();
  const errEl = document.getElementById('signupError');
  errEl.classList.remove('show');

  const fd = new FormData();
  fd.append('username',  document.getElementById('signupUsername').value);
  fd.append('password',  document.getElementById('signupPassword').value);
  fd.append('full_name', document.getElementById('signupName').value);
  const photoFile = document.getElementById('signupPhoto').files[0];
  if (photoFile) fd.append('photo', photoFile);

  const data = await apiForm('POST', '/api/signup', fd);
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  currentUser = { ...data, loggedIn: true };
  showApp();
}

async function doLogout() {
  await api('POST', '/api/logout');
  currentUser = null;
  document.getElementById('headerUserArea').style.display = 'none';
  document.getElementById('authPage').classList.add('active');
  document.getElementById('appPage').classList.remove('active');
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  // Clear signup form so previous user's details don't persist
  document.getElementById('signupName').value = '';
  document.getElementById('signupUsername').value = '';
  document.getElementById('signupPassword').value = '';
  document.getElementById('signupPhoto').value = '';
  const preview = document.getElementById('photoPreview');
  preview.src = '';
  preview.style.display = 'none';
  document.getElementById('photoPlaceholder').style.display = '';
}

// ── Profile modal ─────────────────────────────────────────────────────────────
function openProfileModal() {
  document.getElementById('profileFullName').value = currentUser.fullName || '';
  document.getElementById('profileUsername').value = currentUser.username || '';
  document.getElementById('profileRole').value     = currentUser.role || '';
  document.getElementById('profileError').classList.remove('show');
  document.getElementById('profileAvatarDisplay').innerHTML =
    avatarHtml(currentUser.photo_user_id, currentUser.fullName, 'lg');
  document.getElementById('profileModal').classList.add('open');
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.remove('open');
}

async function saveProfileName() {
  const fullName = document.getElementById('profileFullName').value.trim();
  const errEl    = document.getElementById('profileError');
  errEl.classList.remove('show');
  if (!fullName) { errEl.textContent = 'Name is required.'; errEl.classList.add('show'); return; }
  const data = await api('PUT', '/api/profile/name', { full_name: fullName });
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  currentUser.fullName = data.fullName;
  document.getElementById('headerGreeting').textContent = `Hi, ${data.fullName}`;
  updateHeaderAvatar();
  toast('Profile updated!', 'success');
  closeProfileModal();
}

async function uploadProfilePhoto() {
  const file = document.getElementById('profilePhotoInput').files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('photo', file);
  const data = await apiForm('POST', '/api/profile/photo', fd);
  if (data.error) { toast(data.error, 'error'); return; }
  currentUser.photo_user_id = data.photo_user_id;
  updateHeaderAvatar();
  document.getElementById('profileAvatarDisplay').innerHTML =
    avatarHtml(data.photo_user_id, currentUser.fullName, 'lg');
  toast('Photo updated!', 'success');
}

// ── Show app ──────────────────────────────────────────────────────────────────
function updateHeaderAvatar() {
  const btn = document.getElementById('headerAvatar');
  if (!btn) return;
  if (currentUser.photo_user_id) {
    btn.style.backgroundImage = `url(/api/photos/${currentUser.photo_user_id})`;
    btn.textContent = '';
  } else {
    btn.style.backgroundImage = '';
    btn.textContent = (currentUser.fullName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
}

function showApp() {
  document.getElementById('authPage').classList.remove('active');
  document.getElementById('appPage').classList.add('active');
  document.getElementById('headerGreeting').textContent = `Hi, ${currentUser.fullName}`;
  document.getElementById('headerUserArea').style.display = 'flex';
  updateHeaderAvatar();

  if (currentUser.role === 'admin') {
    document.getElementById('adminNav').style.display = 'flex';
    document.getElementById('participantNav').style.display = 'none';
    document.getElementById('adminContent').style.display = 'block';
    document.getElementById('participantContent').style.display = 'none';
    switchAdminTab('adminEventsTab', document.querySelector('#adminNav .nav-tab'));
    loadAdminEvents();
    loadAdminUsers();
  } else {
    document.getElementById('participantNav').style.display = 'flex';
    document.getElementById('adminNav').style.display = 'none';
    document.getElementById('participantContent').style.display = 'block';
    document.getElementById('adminContent').style.display = 'none';
    loadParticipantEvents();
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tabId, el) {
  document.getElementById('participantNav').querySelectorAll('.nav-tab')
    .forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('participantContent').querySelectorAll('.tab-content')
    .forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
}

function switchAdminTab(tabId, el) {
  document.getElementById('adminNav').querySelectorAll('.nav-tab')
    .forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('adminContent').querySelectorAll('.tab-content')
    .forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
}

// ── List / Calendar view toggle ───────────────────────────────────────────────
function setParticipantView(view) {
  document.getElementById('upcomingListView').style.display = view === 'list' ? '' : 'none';
  document.getElementById('upcomingCalView').style.display  = view === 'calendar' ? '' : 'none';
  document.getElementById('pListBtn').classList.toggle('active', view === 'list');
  document.getElementById('pCalBtn').classList.toggle('active', view === 'calendar');
  if (view === 'calendar') renderCalendar('upcomingCalendar', allEvents, false);
}

function setAdminView(view) {
  document.getElementById('adminEventsListView').style.display = view === 'list' ? '' : 'none';
  document.getElementById('adminEventsCalView').style.display  = view === 'calendar' ? '' : 'none';
  document.getElementById('aListBtn').classList.toggle('active', view === 'list');
  document.getElementById('aCalBtn').classList.toggle('active', view === 'calendar');
  if (view === 'calendar') renderCalendar('adminEventsCalendar', adminAllEvents, true);
}

// ── Calendar ──────────────────────────────────────────────────────────────────
function renderCalendar(containerId, events, isAdmin) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const monthPfx    = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;

  const byDay = {};
  events.forEach(e => {
    const start = e.start_time || e.date_time;
    if (!start || !start.startsWith(monthPfx)) return;
    const day = parseInt(start.slice(8, 10), 10);
    (byDay[day] = byDay[day] || []).push(e);
  });

  const today = new Date();
  const isCurMonth = today.getFullYear() === calYear && today.getMonth() === calMonth;

  let html = `
    <div class="cal-nav">
      <button class="btn btn-secondary btn-sm" onclick="calNav(-1,'${containerId}',${isAdmin})">&#8249;</button>
      <span class="cal-month-label">${CAL_MONTHS[calMonth]} ${calYear}</span>
      <button class="btn btn-secondary btn-sm" onclick="calNav(1,'${containerId}',${isAdmin})">&#8250;</button>
    </div>
    <div class="cal-grid">
      ${CAL_DAYS.map(d => `<div class="cal-day-header">${d}</div>`).join('')}`;

  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day cal-day-empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = isCurMonth && today.getDate() === day;
    const dayEvs  = byDay[day] || [];
    html += `
      <div class="cal-day${isToday ? ' cal-today' : ''}">
        <span class="cal-day-num">${day}</span>
        <div class="cal-events">
          ${dayEvs.map(e => `<div class="cal-event-pill" onclick="showCalEventDetail(${e.id},${isAdmin})">${esc(e.title)}${e.recurrence ? ' ↻' : ''}</div>`).join('')}
        </div>
      </div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

function calNav(dir, containerId, isAdmin) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar(containerId, isAdmin ? adminAllEvents : allEvents, isAdmin);
}

function showCalEventDetail(id, isAdmin) {
  const events = isAdmin ? adminAllEvents : allEvents;
  const e = events.find(ev => ev.id === id);
  if (!e) return;

  const start   = e.start_time || e.date_time;
  const end     = e.end_time;
  const timeStr = end
    ? `${formatDateTime(start)} – ${sameDay(start, end) ? formatTime(end) : formatDateTime(end)}`
    : formatDateTime(start);

  let actions = '';
  if (isAdmin) {
    const seriesBtn = e.recurrence_group_id
      ? `<button class="btn btn-danger btn-sm" onclick="closeEventDetailModal();deleteEventGroup('${e.recurrence_group_id}')">Delete Series</button>`
      : '';
    actions = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
        <button class="btn btn-secondary btn-sm" onclick="closeEventDetailModal();viewRegistrations(${e.id},'${esc(e.title)}')">Attendees (${e.registrant_count})</button>
        <button class="btn btn-secondary btn-sm" onclick="closeEventDetailModal();openEditEventModal(${e.id})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="closeEventDetailModal();deleteEvent(${e.id})">Delete</button>
        ${seriesBtn}
      </div>`;
  } else {
    const registered = !!e.registration_id;
    const checkedIn  = !!e.checked_in;
    const isPast     = new Date(start) < new Date();
    if (checkedIn) {
      actions = `<div style="margin-top:16px"><span class="checked-in-badge">✓ Checked in</span></div>`;
    } else if (registered) {
      actions = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
          ${!isPast ? `<button class="btn btn-success btn-sm" onclick="closeEventDetailModal();doCheckin(${e.id})">Check In</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="closeEventDetailModal();doUnregister(${e.id})">Cancel Registration</button>
        </div>`;
    } else {
      actions = `<div style="margin-top:16px"><button class="btn btn-primary" onclick="closeEventDetailModal();doRegister(${e.id})">Register</button></div>`;
    }
  }

  document.getElementById('eventDetailTitle').textContent = e.title;
  document.getElementById('eventDetailBody').innerHTML = `
    <div style="margin-bottom:12px">
      <span class="event-type-badge" style="background:var(--red);color:#fff">${esc(e.event_type)}</span>
      ${e.recurrence ? `<span class="event-type-badge" style="background:#555;color:#fff;margin-left:6px">↻ ${recurrenceLabel(e.recurrence)}</span>` : ''}
    </div>
    <div class="event-meta" style="margin-bottom:0">
      <div class="event-meta-item"><span class="icon">🕐</span>${timeStr}</div>
      <div class="event-meta-item"><span class="icon">📍</span>${esc(e.location)}
        <a class="btn-map-link" href="https://www.google.com/maps/search/${encodeURIComponent(e.location)}" target="_blank" rel="noopener">🗺 Map</a>
      </div>
      ${!isAdmin ? `<div class="event-meta-item"><span class="icon">👥</span>${e.registrant_count} registered</div>` : ''}
    </div>
    ${e.notes ? `<div class="event-notes" style="margin-top:12px">${esc(e.notes)}</div>` : ''}
    ${actions}`;

  document.getElementById('eventDetailModal').classList.add('open');
}

function closeEventDetailModal() {
  document.getElementById('eventDetailModal').classList.remove('open');
}

function recurrenceLabel(r) {
  return { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' }[r] || r;
}

function updateRecurrenceHint() {
  const v = document.getElementById('eventRecurrence').value;
  const hints = {
    weekly:   'Will create 12 weekly sessions.',
    biweekly: 'Will create 6 sessions every 2 weeks.',
    monthly:  'Will create 6 monthly sessions.'
  };
  document.getElementById('recurrenceHint').textContent = hints[v] || '';
}

async function deleteEventGroup(groupId) {
  if (!confirm('Delete ALL sessions in this recurring series? All registrations will also be removed.')) return;
  await api('DELETE', `/api/events/group/${groupId}`);
  toast('All sessions in series deleted.', 'success');
  loadAdminEvents();
}

// ── Participant: events ───────────────────────────────────────────────────────
async function loadParticipantEvents() {
  allEvents = await api('GET', '/api/events');
  renderUpcoming();
  renderMyEvents();
  if (document.getElementById('upcomingCalView').style.display !== 'none')
    renderCalendar('upcomingCalendar', allEvents, false);
}

function renderUpcoming() {
  const now = new Date();
  const upcoming = allEvents.filter(e => new Date(e.start_time || e.date_time) >= now);
  const el = document.getElementById('upcomingEvents');
  if (!upcoming.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>No upcoming sessions scheduled.</p></div>`;
    return;
  }
  el.innerHTML = upcoming.map(eventCard).join('');
}

function renderMyEvents() {
  const mine     = allEvents.filter(e => e.registration_id);
  const now      = new Date();
  const upcoming = mine.filter(e => new Date(e.start_time || e.date_time) >= now);
  const past     = mine
    .filter(e => new Date(e.start_time || e.date_time) < now)
    .sort((a, b) => new Date(b.start_time || b.date_time) - new Date(a.start_time || a.date_time));

  const el          = document.getElementById('myEvents');
  const toggleBtn   = document.getElementById('archiveToggleBtn');
  const archiveEl   = document.getElementById('myEventsArchive');
  const archiveList = document.getElementById('myEventsArchiveList');

  archiveEl.style.display = 'none';

  if (!mine.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>You haven't registered for any sessions yet.</p></div>`;
    toggleBtn.style.display = 'none';
    return;
  }

  el.innerHTML = upcoming.length
    ? upcoming.map(eventCard).join('')
    : `<div class="empty-state"><div class="empty-icon">📋</div><p>No upcoming registered sessions.</p></div>`;

  if (past.length) {
    archiveList.innerHTML = past.map(archivedEventCard).join('');
    toggleBtn.textContent = `View archive (${past.length}) ›`;
    toggleBtn.style.display = '';
  } else {
    toggleBtn.style.display = 'none';
  }
}

function archivedEventCard(e) {
  const start   = e.start_time || e.date_time;
  const end     = e.end_time;
  const timeStr = end
    ? `${formatDateTime(start)} – ${sameDay(start, end) ? formatTime(end) : formatDateTime(end)}`
    : formatDateTime(start);
  const badge = e.checked_in
    ? `<span class="checked-in-badge">✓ Attended</span>`
    : `<span class="status-badge status-absent">Registered</span>`;
  return `
    <div class="event-card">
      <div class="event-card-header" style="background:#777">
        <h3>${esc(e.title)}</h3>
        <span class="event-type-badge">${esc(e.event_type)}</span>
      </div>
      <div class="event-card-body">
        <div class="event-meta">
          <div class="event-meta-item"><span class="icon">🕐</span>${timeStr}</div>
          <div class="event-meta-item"><span class="icon">📍</span>${esc(e.location)}</div>
        </div>
        <div class="event-card-actions">${badge}</div>
      </div>
    </div>`;
}

function toggleArchive() {
  const archiveEl = document.getElementById('myEventsArchive');
  const toggleBtn = document.getElementById('archiveToggleBtn');
  const open = archiveEl.style.display !== 'none';
  archiveEl.style.display = open ? 'none' : '';
  const count = document.getElementById('myEventsArchiveList').children.length;
  toggleBtn.textContent = open ? `View archive (${count}) ›` : '‹ Hide archive';
}

function avatarHtml(photoUserId, fullName, size = 'sm') {
  const initials = (fullName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if (photoUserId) {
    return `<img src="/api/photos/${photoUserId}" alt="${esc(fullName)}" class="participant-avatar${size === 'lg' ? '-lg' : ''}">`;
  }
  return `<div class="avatar-placeholder${size === 'lg' ? '-lg' : ''}">${initials}</div>`;
}

function eventCard(e) {
  const start     = e.start_time || e.date_time;
  const end       = e.end_time;
  const registered = !!e.registration_id;
  const checkedIn  = !!e.checked_in;
  const isPast     = new Date(start) < new Date();
  const timeStr    = end
    ? `${formatDateTime(start)} – ${sameDay(start, end) ? formatTime(end) : formatDateTime(end)}`
    : formatDateTime(start);

  let actions = '';
  if (checkedIn) {
    actions = `<span class="checked-in-badge">✓ Checked in${e.checked_in_at ? ' at ' + formatTime(e.checked_in_at) : ''}</span>`;
  } else if (registered) {
    actions = `
      ${!isPast ? `<button class="btn btn-success btn-sm" onclick="doCheckin(${e.id})">Check In</button>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="doUnregister(${e.id})">Cancel Registration</button>`;
  } else {
    actions = `<button class="btn btn-primary btn-sm" onclick="doRegister(${e.id})">Register</button>`;
  }

  return `
    <div class="event-card" id="card-${e.id}">
      <div class="event-card-header">
        <h3>${esc(e.title)}</h3>
        <span class="event-type-badge">${esc(e.event_type)}</span>
      </div>
      <div class="event-card-body">
        <div class="event-meta">
          <div class="event-meta-item"><span class="icon">🕐</span>${timeStr}</div>
          <div class="event-meta-item">
            <span class="icon">📍</span>
            <span>${esc(e.location)}</span>
            <a class="btn-map-link" href="https://www.google.com/maps/search/${encodeURIComponent(e.location)}" target="_blank" rel="noopener">🗺 Map</a>
          </div>
          <div class="event-meta-item"><span class="icon">👥</span>${e.registrant_count} registered</div>
        </div>
        ${e.notes ? `<div class="event-notes">${esc(e.notes)}</div>` : ''}
        <div class="event-card-actions">${actions}</div>
      </div>
    </div>`;
}

async function doRegister(id) {
  const data = await api('POST', `/api/events/${id}/register`);
  if (data.error) { toast(data.error, 'error'); return; }
  toast('Registered!', 'success');
  loadParticipantEvents();
}

async function doUnregister(id) {
  if (!confirm('Cancel your registration for this session?')) return;
  await api('DELETE', `/api/events/${id}/register`);
  toast('Registration cancelled.', 'success');
  loadParticipantEvents();
}

async function doCheckin(id) {
  const data = await api('POST', `/api/events/${id}/checkin`);
  if (data.error) { toast(data.error, 'error'); return; }
  toast('Checked in! Welcome!', 'success');
  loadParticipantEvents();
}


// ── Event types ───────────────────────────────────────────────────────────────
async function loadEventTypes(selectedValue) {
  const types = await api('GET', '/api/event-types');
  const sel = document.getElementById('eventType');
  sel.innerHTML = `<option value="">— Select type —</option>` +
    types.map(t => `<option value="${esc(t.name)}" ${t.name === selectedValue ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
}

function openAddEventTypeModal() {
  document.getElementById('newEventTypeName').value = '';
  document.getElementById('eventTypeError').classList.remove('show');
  document.getElementById('eventTypeModal').classList.add('open');
}

function closeEventTypeModal() { document.getElementById('eventTypeModal').classList.remove('open'); }

async function saveEventType(e) {
  e.preventDefault();
  const name   = document.getElementById('newEventTypeName').value.trim();
  const errEl  = document.getElementById('eventTypeError');
  errEl.classList.remove('show');
  const data = await api('POST', '/api/event-types', { name });
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  closeEventTypeModal();
  toast(`Event type "${name}" added.`, 'success');
  const currentVal = document.getElementById('eventType').value;
  await loadEventTypes(currentVal);
  document.getElementById('eventType').value = name;
}

// ── Admin: events ─────────────────────────────────────────────────────────────
async function loadAdminEvents() {
  const events = await api('GET', '/api/events');
  adminAllEvents = events;
  const el = document.getElementById('adminEventsList');
  if (!events.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>No sessions yet. Add one above.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="admin-events-grid">${events.map(e => {
    const start   = e.start_time || e.date_time;
    const end     = e.end_time;
    const timeStr = end
      ? `${formatDateTime(start)} – ${sameDay(start,end) ? formatTime(end) : formatDateTime(end)}`
      : formatDateTime(start);
    return `
      <div class="admin-event-card">
        <div class="event-card-header">
          <h3>${esc(e.title)}</h3>
          <span class="event-type-badge">${esc(e.event_type)}</span>
        </div>
        <div class="event-card-body">
          <div class="event-meta">
            <div class="event-meta-item"><span class="icon">🕐</span>${timeStr}</div>
            <div class="event-meta-item"><span class="icon">📍</span>${esc(e.location)}
              <a class="btn-map-link" href="https://www.google.com/maps/search/${encodeURIComponent(e.location)}" target="_blank" rel="noopener">🗺 Map</a>
            </div>
            <div class="event-meta-item"><span class="icon">👥</span><strong>${e.registrant_count}</strong> registered
              ${e.recurrence ? `<span style="margin-left:8px;font-size:0.75rem;background:#f0f0f0;border-radius:4px;padding:2px 6px">↻ ${recurrenceLabel(e.recurrence)}</span>` : ''}
            </div>
          </div>
          ${e.notes ? `<div class="event-notes">${esc(e.notes)}</div>` : ''}
          <div class="event-card-actions">
            <button class="btn btn-secondary btn-sm" onclick="viewRegistrations(${e.id},'${esc(e.title)}')">Attendees</button>
            <button class="btn btn-secondary btn-sm" onclick="openEditEventModal(${e.id})">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteEvent(${e.id})">Delete</button>
          </div>
        </div>
      </div>`;
  }).join('')}</div>`;
  if (document.getElementById('adminEventsCalView').style.display !== 'none')
    renderCalendar('adminEventsCalendar', adminAllEvents, true);
}

async function openAddEventModal() {
  editingEventId = null;
  document.getElementById('eventModalTitle').textContent = 'Add Training Session';
  document.getElementById('eventTitle').value = '';
  document.getElementById('eventStartTime').value = '';
  document.getElementById('eventEndTime').value = '';
  document.getElementById('eventEndTime').dataset.manuallySet = '';
  document.getElementById('eventLocation').value = '';
  document.getElementById('eventNotes').value = '';
  document.getElementById('eventRecurrence').value = '';
  document.getElementById('recurrenceHint').textContent = '';
  document.getElementById('recurrenceGroup').style.display = '';
  document.getElementById('eventModalError').classList.remove('show');
  await loadEventTypes('');
  document.getElementById('eventModal').classList.add('open');
}

document.getElementById('eventStartTime').addEventListener('input', function () {
  if (!this.value) return;
  const end = document.getElementById('eventEndTime');
  // Only auto-set if end is blank or was previously auto-set (not manually changed)
  if (end.dataset.manuallySet) return;
  const d = new Date(this.value);
  d.setHours(d.getHours() + 2);
  const pad = n => String(n).padStart(2, '0');
  end.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
});

document.getElementById('eventEndTime').addEventListener('input', function () {
  // Mark as manually changed so auto-fill stops overwriting it
  this.dataset.manuallySet = '1';
});

async function openEditEventModal(id) {
  const events = await api('GET', '/api/events');
  const e = events.find(ev => ev.id === id);
  if (!e) return;
  editingEventId = id;
  document.getElementById('eventModalTitle').textContent = 'Edit Training Session';
  document.getElementById('eventTitle').value = e.title;
  document.getElementById('eventStartTime').value = (e.start_time || e.date_time || '').slice(0, 16);
  document.getElementById('eventEndTime').value   = (e.end_time || e.start_time || '').slice(0, 16);
  document.getElementById('eventLocation').value  = e.location;
  document.getElementById('eventNotes').value     = e.notes || '';
  document.getElementById('recurrenceGroup').style.display = 'none';
  document.getElementById('eventModalError').classList.remove('show');
  await loadEventTypes(e.event_type);
  document.getElementById('eventModal').classList.add('open');
}

function closeEventModal() { document.getElementById('eventModal').classList.remove('open'); }

async function saveEvent(e) {
  e.preventDefault();
  const errEl = document.getElementById('eventModalError');
  errEl.classList.remove('show');
  const start = document.getElementById('eventStartTime').value;
  const end   = document.getElementById('eventEndTime').value;
  if (end < start) {
    errEl.textContent = 'End time must be after start time.';
    errEl.classList.add('show');
    return;
  }
  const body = {
    title:      document.getElementById('eventTitle').value,
    event_type: document.getElementById('eventType').value,
    start_time: start, end_time: end,
    location:   document.getElementById('eventLocation').value,
    notes:      document.getElementById('eventNotes').value,
    ...(!editingEventId && { recurrence: document.getElementById('eventRecurrence').value || null })
  };
  const data = await api(editingEventId ? 'PUT' : 'POST',
    editingEventId ? `/api/events/${editingEventId}` : '/api/events', body);
  if (data.error) { errEl.textContent = data.error; errEl.classList.add('show'); return; }
  closeEventModal();
  const count = data.count || 1;
  toast(editingEventId ? 'Session updated.' : count > 1 ? `${count} sessions added!` : 'Session added!', 'success');
  loadAdminEvents();
}

async function deleteEvent(id) {
  const ev = adminAllEvents.find(e => e.id === id);
  if (ev?.recurrence_group_id) {
    const justOne = confirm('Delete just this single session?\n\nOK = this session only\nCancel = delete the entire recurring series');
    if (justOne) {
      await api('DELETE', `/api/events/${id}`);
      toast('Session deleted.', 'success');
      loadAdminEvents();
    } else {
      await deleteEventGroup(ev.recurrence_group_id);
    }
  } else {
    if (!confirm('Delete this session? All registrations will also be removed.')) return;
    await api('DELETE', `/api/events/${id}`);
    toast('Session deleted.', 'success');
    loadAdminEvents();
  }
}

// ── Admin: registrations modal ────────────────────────────────────────────────
async function viewRegistrations(eventId, title) {
  document.getElementById('regsModalTitle').textContent = `Attendees — ${title}`;
  document.getElementById('regsModalBody').innerHTML = '<p>Loading…</p>';
  document.getElementById('regsModal').classList.add('open');

  const regs = await api('GET', `/api/admin/events/${eventId}/registrations`);
  if (!regs.length) {
    document.getElementById('regsModalBody').innerHTML =
      `<div class="empty-state"><div class="empty-icon">👥</div><p>No one registered yet.</p></div>`;
    return;
  }
  document.getElementById('regsModalBody').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th></th><th>Name</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${regs.map(r => `<tr>
            <td>${avatarHtml(r.photo_user_id, r.full_name)}</td>
            <td><strong>${esc(r.full_name)}</strong><br><small style="color:#888">${esc(r.username)}</small></td>
            <td>${r.checked_in
              ? `<span class="status-badge status-checkedin">Checked In${r.checked_in_at ? ' ' + formatTime(r.checked_in_at) : ''}</span>`
              : `<span class="status-badge status-registered">Registered</span>`}</td>
            <td>${!r.checked_in
              ? `<button class="btn btn-success btn-sm" onclick="adminCheckin(${eventId},${r.user_id})">Check In</button>`
              : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function adminCheckin(eventId, userId) {
  const data = await api('POST', `/api/admin/events/${eventId}/checkin`, { user_id: userId });
  if (data.error) { toast(data.error, 'error'); return; }
  toast('Checked in!', 'success');
  const title = document.getElementById('regsModalTitle').textContent.replace('Attendees — ', '');
  viewRegistrations(eventId, title);
}

function closeRegsModal() { document.getElementById('regsModal').classList.remove('open'); }

// ── Admin: participants list ───────────────────────────────────────────────────
async function loadAdminUsers() {
  const users = await api('GET', '/api/admin/users');
  const el = document.getElementById('adminUsersList');
  if (!users.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><p>No users yet.</p></div>`;
    return;
  }
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th></th><th>Name</th><th>Role</th><th>Joined</th><th>Change Role</th><th>Details</th></tr></thead>
        <tbody>
          ${users.map(u => `<tr>
            <td>${avatarHtml(u.photo_user_id, u.full_name)}</td>
            <td>
              <strong>${esc(u.full_name)}</strong><br>
              <small style="color:#888">${esc(u.username)}</small>
              ${u.admin_notes ? `<br><small style="color:#aaa;font-style:italic">${esc(u.admin_notes.slice(0,40))}${u.admin_notes.length > 40 ? '…' : ''}</small>` : ''}
            </td>
            <td><span class="status-badge ${u.role === 'admin' ? 'status-checkedin' : 'status-registered'}">${u.role}</span></td>
            <td style="white-space:nowrap">${formatDate(u.created_at)}</td>
            <td>
              <select onchange="changeRole(${u.id}, this.value)">
                <option value="participant" ${u.role === 'participant' ? 'selected' : ''}>Participant</option>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
              </select>
            </td>
            <td style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" onclick="openParticipantModal(${u.id})">View</button>
              ${u.role !== 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteParticipant(${u.id},'${esc(u.full_name)}')">Delete</button>` : ''}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function deleteParticipant(userId, fullName) {
  if (!confirm(`Are you sure you want to delete ${fullName}?\n\nThis will permanently remove their account and all registrations.`)) return;
  const data = await api('DELETE', `/api/admin/users/${userId}`);
  if (data.error) { toast(data.error, 'error'); return; }
  toast(`${fullName} has been deleted.`, 'success');
  loadAdminUsers();
}

async function changeRole(userId, role) {
  await api('PUT', `/api/admin/users/${userId}/role`, { role });
  toast(`Role updated to ${role}.`, 'success');
}

// ── Admin: participant details modal ──────────────────────────────────────────
async function openParticipantModal(userId) {
  document.getElementById('participantModalTitle').textContent = 'Participant Details';
  document.getElementById('participantModalBody').innerHTML = '<p>Loading…</p>';
  document.getElementById('participantModal').classList.add('open');

  const users = await api('GET', '/api/admin/users');
  const u = users.find(x => x.id === userId);
  if (!u) return;

  document.getElementById('participantModalTitle').textContent = u.full_name;
  document.getElementById('participantModalBody').innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      ${avatarHtml(u.photo_user_id, u.full_name, 'lg')}
      <div style="font-size:0.85rem;color:#888">@${esc(u.username)}</div>
      <span class="status-badge ${u.role === 'admin' ? 'status-checkedin' : 'status-registered'}" style="margin-top:6px;display:inline-block">${u.role}</span>
    </div>
    <div style="margin-bottom:4px;font-size:0.8rem;color:#555;font-weight:600">Joined: ${formatDate(u.created_at)}</div>

    <div class="form-group" style="margin-top:16px">
      <label>Upload / Replace Photo</label>
      <input type="file" id="adminPhotoUpload" accept="image/*" style="width:100%;font-size:0.9rem">
      <button class="btn btn-secondary btn-sm" style="margin-top:6px" onclick="uploadParticipantPhoto(${u.id})">Upload Photo</button>
    </div>

    <div class="form-group" style="margin-top:12px">
      <label>Admin Notes</label>
      <textarea id="participantNotes" style="width:100%;min-height:100px;padding:10px;border:1px solid #ddd;border-radius:8px;font-family:inherit;font-size:0.9rem;resize:vertical"
        placeholder="Add notes about this participant…">${esc(u.admin_notes || '')}</textarea>
    </div>
    <button class="btn btn-primary" style="width:100%" onclick="saveParticipantNotes(${u.id})">Save Notes</button>`;
}

async function uploadParticipantPhoto(userId) {
  const file = document.getElementById('adminPhotoUpload').files[0];
  if (!file) { toast('Please select a photo first.', 'error'); return; }
  const fd = new FormData();
  fd.append('photo', file);
  const data = await apiForm('POST', `/api/admin/users/${userId}/photo`, fd);
  if (data.error) { toast(data.error, 'error'); return; }
  toast('Photo updated!', 'success');
  closeParticipantModal();
  await loadAdminUsers();
}

async function saveParticipantNotes(userId) {
  const notes = document.getElementById('participantNotes').value;
  await api('PUT', `/api/admin/users/${userId}/notes`, { notes });
  toast('Notes saved.', 'success');
  closeParticipantModal();
  loadAdminUsers();
}

function closeParticipantModal() { document.getElementById('participantModal').classList.remove('open'); }

// ── Utilities ─────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { weekday:'short', month:'short', day:'numeric', year:'numeric' })
    + ' ' + d.toLocaleTimeString('en-CA', { hour:'2-digit', minute:'2-digit' });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-CA', { hour:'2-digit', minute:'2-digit' });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { year:'numeric', month:'short', day:'numeric' });
}

function sameDay(a, b) { return a && b && a.slice(0,10) === b.slice(0,10); }

let toastTimer;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast toast-${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// Close modals on backdrop click
['eventModal','regsModal','eventTypeModal','participantModal','eventDetailModal','profileModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.id === id) document.getElementById(id).classList.remove('open');
  });
});
