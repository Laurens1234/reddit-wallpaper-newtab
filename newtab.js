// Default wallpaper settings
const DEFAULT_SETTINGS = {
  subreddit: 'EarthPorn, wallpaper, wallpapers',
  sort: 'hot',
  time: 'week',
  minResolution: 0,
  allowNsfw: false,
  slideshowInterval: 0,
  allowImages: true,
  allowGifs: true,
  allowVideos: true,
  favoritesOnly: false,
  zenMode: false,
  // Local wallpapers
  useLocalWallpapers: false,
  localWallpapers: [],
  // Clock settings
  clockFormat: '24h',
  dateFormat: 'long',
  // Weather settings
  showWeather: false,
  weatherLocation: '',
  weatherUnits: 'celsius',
  // Timer settings
  showTimer: false,
  timerPosition: 'top-left',
  // Scheduled subreddits
  useSchedule: false,
  schedule: {
    morning: '',   // 6am-12pm
    afternoon: '', // 12pm-6pm
    evening: '',   // 6pm-12am
    night: ''      // 12am-6am
  },
  // Color filter
  colorFilter: 'none',
  hoverOnly: {
    clock: false,
    search: false,
    shortcuts: false,
    wallpaperInfo: false
  }
};

const CACHE_KEY = 'earthporn_wallpapers';
const CURRENT_WALLPAPER_KEY = 'current_wallpaper';
const SETTINGS_KEY = 'wallpaper_settings';
const RECENT_SUBREDDITS_KEY = 'recent_subreddits';
const FAVORITES_KEY = 'favorite_wallpapers';
const BLACKLIST_KEY = 'blacklisted_wallpapers';
const WALLPAPER_HISTORY_KEY = 'wallpaper_history';
const LOCAL_WALLPAPERS_KEY = 'local_wallpapers';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const MAX_RECENT_SUBREDDITS = 5;
const MAX_HISTORY = 50;

let slideshowInterval = null;
let currentWallpaperData = null;
let wallpaperHistory = [];
let historyIndex = -1;

// Initialize the new tab
document.addEventListener('DOMContentLoaded', async () => {
  updateClock();
  setInterval(updateClock, 1000);
  
  setupSearch();
  setupModal();
  setupSettingsModal();
  setupFavoritesModal();
  await loadShortcuts();
  await loadWallpaperHistory();
  await loadWallpaper();
  
  // Apply hover-only settings (with zen mode override)
  const settings = await getWallpaperSettings();
  applyHoverSettings(settings.hoverOnly || {}, settings.zenMode || false);
  
  // Initialize weather
  if (settings.showWeather && settings.weatherLocation) {
    updateWeather();
    setInterval(updateWeather, 30 * 60 * 1000); // Update every 30 min
  }
  
  // Initialize timer
  await initTimer();
  
  // Weather widget click - open weather website
  document.getElementById('weather-widget')?.addEventListener('click', openWeatherWebsite);

  document.getElementById('refresh-btn').addEventListener('click', () => {
    location.reload();
  });
  
  // History back button
  document.getElementById('back-btn')?.addEventListener('click', goBackInHistory);
  
  document.getElementById('settings-btn').addEventListener('click', () => {
    openSettingsModal();
  });
  
  document.getElementById('download-btn').addEventListener('click', downloadWallpaper);
  document.getElementById('favorite-btn').addEventListener('click', toggleFavorite);
  document.getElementById('blacklist-btn').addEventListener('click', blacklistWallpaper);
  
  // Search wallpapers button
  document.getElementById('search-wallpapers-btn')?.addEventListener('click', openSearchModal);
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
  
  // Initialize slideshow if enabled
  initSlideshow();
});

// Keyboard shortcuts handler
function handleKeyboard(e) {
  // Don't trigger if typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  switch(e.key.toLowerCase()) {
    case 'r':
      location.reload();
      break;
    case 'd':
      downloadWallpaper();
      break;
    case 'f':
      toggleFavorite();
      break;
    case 'b':
      blacklistWallpaper();
      break;
    case 'arrowleft':
      goBackInHistory();
      break;
  }
}

// Clock functionality
async function updateClock() {
  const settings = await getWallpaperSettings();
  const now = new Date();
  const format = settings.clockFormat || '24h';
  
  // Determine if 12-hour format
  const is12Hour = format.startsWith('12h');
  const showSeconds = format.includes('seconds');
  
  let hours = now.getHours();
  let ampm = '';
  
  if (is12Hour) {
    ampm = hours >= 12 ? ' PM' : ' AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
  }
  
  const hoursStr = hours.toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  
  let timeStr = `${hoursStr}:${minutes}`;
  if (showSeconds) {
    timeStr += `:${seconds}`;
  }
  timeStr += ampm;
  
  document.getElementById('clock').textContent = timeStr;
  
  // Format date based on setting
  let dateStr;
  switch (settings.dateFormat) {
    case 'short':
      dateStr = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      break;
    case 'numeric':
      dateStr = now.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' });
      break;
    case 'weekday':
      dateStr = now.toLocaleDateString(undefined, { weekday: 'long' });
      break;
    case 'full':
    default:
      dateStr = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      break;
  }
  document.getElementById('date').textContent = dateStr;
}

// Search functionality
function setupSearch() {
  const searchInput = document.getElementById('search-input');
  
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && searchInput.value.trim()) {
      const query = searchInput.value.trim();
      // Use the browser's default search engine via the omnibox
      if (chrome.search && chrome.search.query) {
        chrome.search.query({ text: query, disposition: 'CURRENT_TAB' });
      } else {
        // Fallback to Google search
        window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      }
    }
  });
}

// Load browser shortcuts (top sites)
async function loadShortcuts() {
  const shortcutsContainer = document.getElementById('shortcuts');
  
  try {
    // Get top sites from Chrome API
    const topSites = await chrome.topSites.get();
    
    // Get custom shortcuts and removed shortcuts from storage
    const stored = await chrome.storage.local.get(['custom_shortcuts', 'removed_shortcuts']);
    const customShortcuts = stored.custom_shortcuts || [];
    const removedShortcuts = stored.removed_shortcuts || [];
    
    // Filter out removed shortcuts from top sites
    const filteredTopSites = topSites.filter(site => {
      const hostname = new URL(site.url).hostname;
      return !removedShortcuts.includes(hostname);
    });
    
    // Combine: top sites first, then custom shortcuts at the end
    const combined = [];
    
    // Add filtered top sites first
    for (const site of filteredTopSites) {
      combined.push(site);
    }
    
    // Add all custom shortcuts at the end (no duplicate filtering)
    for (const shortcut of customShortcuts) {
      const hostname = new URL(shortcut.url).hostname;
      if (!removedShortcuts.includes(hostname)) {
        combined.push(shortcut);
      }
    }
    
    shortcutsContainer.innerHTML = '';
    
    combined.forEach((site, index) => {
      const shortcut = createShortcutElement(site, index);
      shortcutsContainer.appendChild(shortcut);
    });
    
    // Add the "Add Shortcut" button
    const addButton = createAddShortcutButton();
    shortcutsContainer.appendChild(addButton);
  } catch (error) {
    console.error('Error loading shortcuts:', error);
  }
}

// Create the Add Shortcut button
function createAddShortcutButton() {
  const wrapper = document.createElement('div');
  wrapper.className = 'shortcut add-shortcut';
  wrapper.title = 'Add shortcut';
  
  wrapper.addEventListener('click', () => {
    openAddModal();
  });
  
  const iconDiv = document.createElement('div');
  iconDiv.className = 'shortcut-icon add-icon';
  iconDiv.innerHTML = '+';
  
  const titleSpan = document.createElement('span');
  titleSpan.className = 'shortcut-title';
  titleSpan.textContent = 'Add shortcut';
  
  wrapper.appendChild(iconDiv);
  wrapper.appendChild(titleSpan);
  
  return wrapper;
}

// Create a shortcut element
function createShortcutElement(site, index) {
  const wrapper = document.createElement('div');
  wrapper.className = 'shortcut';
  
  // Right-click to edit
  wrapper.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openEditModal(site, index);
  });
  
  // Link element
  const a = document.createElement('a');
  a.href = site.url;
  a.className = 'shortcut-link';
  a.title = site.title;
  
  const iconDiv = document.createElement('div');
  iconDiv.className = 'shortcut-icon';
  
  // Start with fallback (first letter)
  iconDiv.classList.add('fallback');
  iconDiv.textContent = site.title.charAt(0).toUpperCase();
  
  // Try to load favicon - create image but don't add to DOM until loaded
  const domain = new URL(site.url).hostname;
  const img = new Image();
  
  img.onload = () => {
    // Favicon loaded successfully, replace fallback
    iconDiv.classList.remove('fallback');
    iconDiv.textContent = '';
    img.className = 'shortcut-favicon';
    iconDiv.appendChild(img);
  };
  
  // Silently ignore errors - fallback is already shown
  img.onerror = () => {};
  
  // Set src last to start loading
  img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  
  const titleSpan = document.createElement('span');
  titleSpan.className = 'shortcut-title';
  titleSpan.textContent = site.title;
  
  a.appendChild(iconDiv);
  a.appendChild(titleSpan);
  
  wrapper.appendChild(a);
  
  return wrapper;
}

// Open edit modal
let currentEditIndex = null;
let currentEditSite = null;
let isAddingNew = false;
let isEditingTopSite = false;

function openEditModal(site, index) {
  currentEditIndex = index;
  currentEditSite = site;
  isAddingNew = false;
  isEditingTopSite = !site.custom; // Top sites don't have the custom flag
  
  document.getElementById('modal-title').textContent = 'Edit Shortcut';
  document.getElementById('edit-name').value = site.title;
  document.getElementById('edit-url').value = site.url;
  document.getElementById('edit-url').disabled = isEditingTopSite;
  document.getElementById('modal-remove').style.display = 'block';
  document.getElementById('edit-modal').classList.remove('hidden');
}

function openAddModal() {
  currentEditIndex = null;
  currentEditSite = null;
  isAddingNew = true;
  isEditingTopSite = false;
  
  document.getElementById('modal-title').textContent = 'Add Shortcut';
  document.getElementById('edit-name').value = '';
  document.getElementById('edit-url').value = '';
  document.getElementById('edit-url').disabled = false;
  document.getElementById('modal-remove').style.display = 'none';
  document.getElementById('edit-modal').classList.remove('hidden');
  document.getElementById('edit-name').focus();
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  currentEditIndex = null;
  currentEditSite = null;
  isAddingNew = false;
  isEditingTopSite = false;
}

async function saveShortcut() {
  let name = document.getElementById('edit-name').value.trim();
  let url = document.getElementById('edit-url').value.trim();
  
  // For top sites, use the original URL (can only edit name)
  if (isEditingTopSite && currentEditSite) {
    url = currentEditSite.url;
  }
  
  if (!url) {
    alert('Please enter a URL');
    return;
  }
  
  // Add https:// if no protocol specified
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  // Validate URL
  try {
    new URL(url);
  } catch {
    alert('Please enter a valid URL');
    return;
  }
  
  // If no name provided, generate one from the URL
  if (!name) {
    name = generateShortcutName(url);
  }
  
  // Get existing custom shortcuts
  const stored = await chrome.storage.local.get(['custom_shortcuts', 'removed_shortcuts']);
  let customShortcuts = stored.custom_shortcuts || [];
  let removedShortcuts = stored.removed_shortcuts || [];
  
  // Add or update the shortcut
  const newShortcut = { title: name, url: url, custom: true };
  
  if (isAddingNew) {
    // Adding a brand new shortcut
    customShortcuts.push(newShortcut);
  } else if (currentEditSite) {
    // Check if we're editing an existing custom shortcut
    const existingIndex = customShortcuts.findIndex(s => s.url === currentEditSite.url);
    if (existingIndex >= 0) {
      // Update existing custom shortcut
      customShortcuts[existingIndex] = newShortcut;
    } else {
      // Editing a top site - hide the original and add custom shortcut
      const topSiteHostname = new URL(currentEditSite.url).hostname;
      if (!removedShortcuts.includes(topSiteHostname)) {
        removedShortcuts.push(topSiteHostname);
      }
      customShortcuts.push(newShortcut);
    }
  }
  
  await chrome.storage.local.set({ 
    custom_shortcuts: customShortcuts,
    removed_shortcuts: removedShortcuts
  });
  
  closeEditModal();
  await loadShortcuts();
}

async function removeShortcut(site, index) {
  // Get existing removed shortcuts
  const stored = await chrome.storage.local.get(['custom_shortcuts', 'removed_shortcuts']);
  let customShortcuts = stored.custom_shortcuts || [];
  let removedShortcuts = stored.removed_shortcuts || [];
  
  // Check if it's a custom shortcut
  const customIndex = customShortcuts.findIndex(s => s.url === site.url);
  if (customIndex >= 0) {
    customShortcuts.splice(customIndex, 1);
  } else {
    // It's a top site or default - add to removed list
    const hostname = new URL(site.url).hostname;
    if (!removedShortcuts.includes(hostname)) {
      removedShortcuts.push(hostname);
    }
  }
  
  await chrome.storage.local.set({ 
    custom_shortcuts: customShortcuts,
    removed_shortcuts: removedShortcuts
  });
  
  await loadShortcuts();
}

// Generate a smart name from a URL
function generateShortcutName(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    const pathname = urlObj.pathname;
    const params = urlObj.searchParams;
    
    // YouTube - try to get video/playlist info
    if (hostname.includes('youtube.com')) {
      if (params.has('list')) {
        return 'YouTube Playlist';
      }
      if (params.has('v') || pathname.includes('/watch')) {
        return 'YouTube Video';
      }
      if (pathname.includes('/channel') || pathname.includes('/@')) {
        return 'YouTube Channel';
      }
      return 'YouTube';
    }
    
    // Reddit - get subreddit name
    if (hostname.includes('reddit.com')) {
      const match = pathname.match(/\/r\/([^\/]+)/);
      if (match) {
        return 'r/' + match[1];
      }
      return 'Reddit';
    }
    
    // GitHub - get repo name
    if (hostname.includes('github.com')) {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return parts[1]; // repo name
      }
      if (parts.length === 1) {
        return parts[0]; // user/org name
      }
      return 'GitHub';
    }
    
    // Twitter/X - get profile or tweet
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 1 && parts[0] !== 'search') {
        return '@' + parts[0];
      }
      return 'Twitter';
    }
    
    // Google services
    if (hostname.includes('google.com')) {
      if (hostname.includes('docs.')) return 'Google Docs';
      if (hostname.includes('drive.')) return 'Google Drive';
      if (hostname.includes('mail.')) return 'Gmail';
      if (hostname.includes('calendar.')) return 'Calendar';
      if (pathname.includes('/maps')) return 'Google Maps';
      return 'Google';
    }
    
    // Default: capitalize the domain name
    const domainName = hostname.split('.')[0];
    return domainName.charAt(0).toUpperCase() + domainName.slice(1);
  } catch {
    return 'Shortcut';
  }
}

// Setup modal event listeners
function setupModal() {
  document.getElementById('modal-cancel').addEventListener('click', closeEditModal);
  document.getElementById('modal-save').addEventListener('click', saveShortcut);
  document.getElementById('modal-remove').addEventListener('click', async () => {
    if (currentEditSite) {
      await removeShortcut(currentEditSite, currentEditIndex);
      closeEditModal();
    }
  });
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-modal') {
      closeEditModal();
    }
  });
  
  // Enter key to save
  document.getElementById('edit-url').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveShortcut();
  });
}

// Setup settings modal
function setupSettingsModal() {
  const sortSelect = document.getElementById('settings-sort');
  const timePeriodGroup = document.getElementById('time-period-group');
  const subredditInput = document.getElementById('settings-subreddit');
  const recentDropdown = document.getElementById('recent-subreddits');
  
  // Show/hide time period based on sort selection
  sortSelect.addEventListener('change', () => {
    timePeriodGroup.style.display = sortSelect.value === 'top' ? 'block' : 'none';
  });
  
  // Show recent subreddits dropdown on focus
  subredditInput.addEventListener('focus', () => showRecentSubreddits());
  
  // Hide dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.subreddit-input-wrapper')) {
      recentDropdown.classList.add('hidden');
    }
  });
  
  document.getElementById('settings-cancel').addEventListener('click', closeSettingsModal);
  document.getElementById('settings-save').addEventListener('click', saveSettings);
  document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') {
      closeSettingsModal();
    }
  });
  
  // Add scheduled subreddit button
  document.getElementById('add-scheduled-btn')?.addEventListener('click', addScheduledSubredditRow);
  
  // Setup search modal
  setupSearchModal();
  
  // Setup color filter modal
  setupColorFilterModal();
  
  // Setup local wallpapers modal
  setupLocalWallpapersModal();
}

// Setup search modal event listeners
function setupSearchModal() {
  const searchModal = document.getElementById('search-modal');
  const searchQuery = document.getElementById('search-query');
  
  document.getElementById('search-cancel')?.addEventListener('click', closeSearchModal);
  document.getElementById('search-submit')?.addEventListener('click', () => {
    searchWallpapers(searchQuery?.value || '');
  });
  
  searchQuery?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      searchWallpapers(searchQuery.value);
    }
  });
  
  searchModal?.addEventListener('click', (e) => {
    if (e.target.id === 'search-modal') {
      closeSearchModal();
    }
  });
}

// Setup color filter modal event listeners
function setupColorFilterModal() {
  const colorModal = document.getElementById('color-filter-modal');
  
  document.getElementById('color-filter-btn')?.addEventListener('click', openColorFilterModal);
  document.getElementById('color-filter-close')?.addEventListener('click', closeColorFilterModal);
  document.getElementById('clear-color-filter')?.addEventListener('click', clearColorFilter);
  
  colorModal?.addEventListener('click', (e) => {
    if (e.target.id === 'color-filter-modal') {
      closeColorFilterModal();
    }
  });
  
  // Color button click handlers
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      setColorFilter(color);
    });
  });
}

// Setup local wallpapers modal event listeners
function setupLocalWallpapersModal() {
  const localModal = document.getElementById('local-wallpapers-modal');
  const fileInput = document.getElementById('local-wallpaper-input');
  
  document.getElementById('manage-local-btn')?.addEventListener('click', openLocalWallpapersModal);
  document.getElementById('local-wallpapers-close')?.addEventListener('click', closeLocalWallpapersModal);
  
  document.getElementById('upload-local-btn')?.addEventListener('click', () => {
    fileInput?.click();
  });
  
  fileInput?.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadLocalWallpapers(files);
    }
    // Reset file input so same file can be selected again
    fileInput.value = '';
  });
  
  localModal?.addEventListener('click', (e) => {
    if (e.target.id === 'local-wallpapers-modal') {
      closeLocalWallpapersModal();
    }
  });
}

function openColorFilterModal() {
  const modal = document.getElementById('color-filter-modal');
  modal?.classList.remove('hidden');
  
  // Highlight active color if any
  updateColorFilterUI();
}

function closeColorFilterModal() {
  document.getElementById('color-filter-modal')?.classList.add('hidden');
}

async function setColorFilter(color) {
  const settings = await getWallpaperSettings();
  settings.colorFilter = color;
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  
  updateColorFilterUI();
  showToast(`Filtering by ${color} colors`);
  
  // Trigger new wallpaper fetch with filter
  closeColorFilterModal();
  location.reload();
}

async function clearColorFilter() {
  const settings = await getWallpaperSettings();
  settings.colorFilter = null;
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  
  updateColorFilterUI();
  showToast('Color filter cleared');
  
  document.getElementById('color-filter-btn')?.classList.remove('active');
  closeColorFilterModal();
  location.reload();
}

async function updateColorFilterUI() {
  const settings = await getWallpaperSettings();
  const activeColor = settings.colorFilter;
  
  // Update button states
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.color === activeColor);
  });
  
  // Update current filter display
  const currentFilterEl = document.getElementById('current-color-filter');
  const activeColorNameEl = document.getElementById('active-color-name');
  
  if (activeColor && currentFilterEl && activeColorNameEl) {
    activeColorNameEl.textContent = activeColor.charAt(0).toUpperCase() + activeColor.slice(1);
    currentFilterEl.classList.remove('hidden');
  } else {
    currentFilterEl?.classList.add('hidden');
  }
  
  // Update toolbar button
  document.getElementById('color-filter-btn')?.classList.toggle('active', !!activeColor);
}

// Scheduled subreddits UI helpers
function renderScheduledSubreddits(scheduled) {
  const container = document.getElementById('scheduled-subreddits-list');
  if (!container) return;
  
  container.innerHTML = '';
  
  scheduled.forEach((item, index) => {
    const row = createScheduledSubredditRow(item, index);
    container.appendChild(row);
  });
}

function createScheduledSubredditRow(item = { startTime: '09:00', endTime: '17:00', subreddit: '' }, index) {
  const row = document.createElement('div');
  row.className = 'scheduled-item';
  row.dataset.index = index;
  
  row.innerHTML = `
    <input type="time" class="scheduled-start" value="${item.startTime}" title="Start time">
    <span>-</span>
    <input type="time" class="scheduled-end" value="${item.endTime}" title="End time">
    <input type="text" class="scheduled-subreddit" value="${item.subreddit}" placeholder="Subreddit name">
    <button type="button" class="btn-remove" title="Remove">✕</button>
  `;
  
  row.querySelector('.btn-remove').addEventListener('click', () => {
    row.remove();
  });
  
  return row;
}

function addScheduledSubredditRow() {
  const container = document.getElementById('scheduled-subreddits-list');
  if (!container) return;
  
  const index = container.children.length;
  const row = createScheduledSubredditRow({ startTime: '09:00', endTime: '17:00', subreddit: '' }, index);
  container.appendChild(row);
}

function getScheduledSubredditsFromUI() {
  const container = document.getElementById('scheduled-subreddits-list');
  if (!container) return [];
  
  const scheduled = [];
  container.querySelectorAll('.scheduled-item').forEach(row => {
    const startTime = row.querySelector('.scheduled-start')?.value || '';
    const endTime = row.querySelector('.scheduled-end')?.value || '';
    const subreddit = row.querySelector('.scheduled-subreddit')?.value?.trim() || '';
    
    if (startTime && endTime && subreddit) {
      scheduled.push({ startTime, endTime, subreddit });
    }
  });
  
  return scheduled;
}

// Get recent subreddits from storage
async function getRecentSubreddits() {
  const result = await chrome.storage.local.get([RECENT_SUBREDDITS_KEY]);
  return result[RECENT_SUBREDDITS_KEY] || ['EarthPorn', 'SpacePorn', 'ArtPorn'];
}

// Save a subreddit to recent list
async function saveRecentSubreddit(subreddit) {
  const recent = await getRecentSubreddits();
  const normalized = subreddit.toLowerCase();
  
  // Remove if already exists (to move to top)
  const filtered = recent.filter(r => r.toLowerCase() !== normalized);
  
  // Add to beginning
  filtered.unshift(subreddit);
  
  // Keep only MAX_RECENT_SUBREDDITS
  const trimmed = filtered.slice(0, MAX_RECENT_SUBREDDITS);
  
  await chrome.storage.local.set({ [RECENT_SUBREDDITS_KEY]: trimmed });
}

// Show recent subreddits dropdown
async function showRecentSubreddits() {
  const dropdown = document.getElementById('recent-subreddits');
  const recent = await getRecentSubreddits();
  
  if (recent.length === 0) {
    dropdown.classList.add('hidden');
    return;
  }
  
  dropdown.innerHTML = '';
  
  recent.forEach(subreddit => {
    const item = document.createElement('div');
    item.className = 'recent-item';
    item.innerHTML = `<span class="recent-prefix">r/</span>${subreddit}`;
    item.addEventListener('click', () => {
      document.getElementById('settings-subreddit').value = subreddit;
      dropdown.classList.add('hidden');
    });
    dropdown.appendChild(item);
  });
  
  dropdown.classList.remove('hidden');
}

async function openSettingsModal() {
  const settings = await getWallpaperSettings();
  
  document.getElementById('settings-subreddit').value = settings.subreddit;
  document.getElementById('settings-sort').value = settings.sort;
  document.getElementById('settings-time').value = settings.time;
  document.getElementById('settings-resolution').value = settings.minResolution;
  document.getElementById('settings-nsfw').checked = settings.allowNsfw;
  document.getElementById('settings-slideshow').value = settings.slideshowInterval || 0;
  
  // Load media type settings
  document.getElementById('settings-images').checked = settings.allowImages !== false;
  document.getElementById('settings-gifs').checked = settings.allowGifs !== false;
  document.getElementById('settings-videos').checked = settings.allowVideos !== false;
  
  // Load hover-only settings
  const hoverOnly = settings.hoverOnly || {};
  document.getElementById('hover-clock').checked = hoverOnly.clock || false;
  document.getElementById('hover-search').checked = hoverOnly.search || false;
  document.getElementById('hover-shortcuts').checked = hoverOnly.shortcuts || false;
  document.getElementById('hover-wallpaper-info').checked = hoverOnly.wallpaperInfo || false;
  
  // Load clock format settings
  document.getElementById('settings-clock-format').value = settings.clockFormat || '24h';
  document.getElementById('settings-date-format').value = settings.dateFormat || 'full';
  
  // Load weather settings
  document.getElementById('settings-weather-enabled').checked = settings.showWeather || false;
  document.getElementById('settings-weather-location').value = settings.weatherLocation || '';
  document.getElementById('settings-weather-units').value = settings.weatherUnits || 'celsius';
  
  // Load timer settings
  document.getElementById('settings-timer-enabled').checked = settings.showTimer || false;
  document.getElementById('settings-timer-position').value = settings.timerPosition || 'top-left';
  
  // Load favorites only setting
  document.getElementById('settings-favorites-only').checked = settings.favoritesOnly || false;
  
  // Load local wallpapers setting
  document.getElementById('settings-local-wallpapers').checked = settings.useLocalWallpapers || false;
  
  // Load scheduled subreddits
  document.getElementById('settings-scheduled-enabled').checked = settings.scheduledEnabled || false;
  renderScheduledSubreddits(settings.scheduledSubreddits || []);
  
  // Load Zen Mode setting
  document.getElementById('settings-zen-mode').checked = settings.zenMode || false;
  
  // Show/hide time period based on current sort
  document.getElementById('time-period-group').style.display = 
    settings.sort === 'top' ? 'block' : 'none';
  
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

// Local Wallpapers functions
async function openLocalWallpapersModal() {
  document.getElementById('local-wallpapers-modal')?.classList.remove('hidden');
  await renderLocalWallpapers();
}

function closeLocalWallpapersModal() {
  document.getElementById('local-wallpapers-modal').classList.add('hidden');
}

async function renderLocalWallpapers() {
  const grid = document.getElementById('local-wallpapers-grid');
  if (!grid) return;
  
  const result = await chrome.storage.local.get([LOCAL_WALLPAPERS_KEY]);
  const localWallpapers = result[LOCAL_WALLPAPERS_KEY] || [];
  
  grid.innerHTML = '';
  
  if (localWallpapers.length === 0) {
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: rgba(255,255,255,0.6); padding: 40px;">No local wallpapers yet. Upload some images to get started!</p>';
    return;
  }
  
  localWallpapers.forEach((wallpaper, index) => {
    const item = document.createElement('div');
    item.className = 'local-wallpaper-item';
    
    const img = document.createElement('img');
    img.src = wallpaper.dataUrl;
    img.alt = wallpaper.name || 'Local wallpaper';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'local-wallpaper-delete';
    deleteBtn.innerHTML = '✕';
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteLocalWallpaper(index);
    });
    
    item.appendChild(img);
    item.appendChild(deleteBtn);
    
    // Click to set as current wallpaper
    item.addEventListener('click', () => {
      setLocalWallpaper(wallpaper);
      closeLocalWallpapersModal();
    });
    
    grid.appendChild(item);
  });
}

async function uploadLocalWallpapers(files) {
  if (!files || files.length === 0) return;
  
  // Convert FileList to Array
  const fileArray = Array.from(files);
  
  const result = await chrome.storage.local.get([LOCAL_WALLPAPERS_KEY]);
  const localWallpapers = result[LOCAL_WALLPAPERS_KEY] || [];
  
  const maxSize = 10 * 1024 * 1024; // 10MB per file
  let addedCount = 0;
  
  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    
    if (file.size > maxSize) {
      showToast(`Skipped ${file.name}: File too large (max 10MB)`);
      continue;
    }
    
    if (!file.type.startsWith('image/')) {
      showToast(`Skipped ${file.name}: Not an image file`);
      continue;
    }
    
    try {
      const dataUrl = await fileToDataUrl(file);
      localWallpapers.push({
        name: file.name,
        dataUrl: dataUrl,
        addedAt: Date.now()
      });
      addedCount++;
    } catch (err) {
      showToast(`Failed to upload ${file.name}`);
      console.error('Upload error:', err);
    }
  }
  
  if (addedCount > 0) {
    await chrome.storage.local.set({ [LOCAL_WALLPAPERS_KEY]: localWallpapers });
    showToast(`Added ${addedCount} wallpaper${addedCount > 1 ? 's' : ''}`);
    await renderLocalWallpapers();
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function deleteLocalWallpaper(index) {
  const result = await chrome.storage.local.get([LOCAL_WALLPAPERS_KEY]);
  const localWallpapers = result[LOCAL_WALLPAPERS_KEY] || [];
  
  if (index >= 0 && index < localWallpapers.length) {
    localWallpapers.splice(index, 1);
    await chrome.storage.local.set({ [LOCAL_WALLPAPERS_KEY]: localWallpapers });
    await renderLocalWallpapers();
    showToast('Wallpaper deleted');
  }
}

function setLocalWallpaper(wallpaper) {
  const wallpaperEl = document.getElementById('background');
  if (!wallpaperEl) return;
  
  wallpaperEl.src = wallpaper.dataUrl;
  
  // Update info bar
  const infoTitle = document.getElementById('info-title');
  const infoSubreddit = document.getElementById('info-subreddit');
  
  if (infoTitle) infoTitle.textContent = wallpaper.name || 'Local Wallpaper';
  if (infoSubreddit) infoSubreddit.textContent = 'Local Upload';
  
  // Hide favorite/download buttons for local wallpapers
  const favoriteBtn = document.getElementById('favorite-btn');
  const downloadBtn = document.getElementById('download-btn');
  const viewOriginalBtn = document.getElementById('view-original-btn');
  
  favoriteBtn?.classList.add('hidden');
  downloadBtn?.classList.add('hidden');
  viewOriginalBtn?.classList.add('hidden');
  
  showToast('Local wallpaper applied');
}

async function getRandomLocalWallpaper() {
  const result = await chrome.storage.local.get([LOCAL_WALLPAPERS_KEY]);
  const localWallpapers = result[LOCAL_WALLPAPERS_KEY] || [];
  
  if (localWallpapers.length === 0) {
    showToast('No local wallpapers available');
    return null;
  }
  
  const randomIndex = Math.floor(Math.random() * localWallpapers.length);
  return localWallpapers[randomIndex];
}

// Apply hover-only visibility settings
function applyHoverSettings(hoverOnly, zenMode = false) {
  const clockDateEl = document.getElementById('clock-date');
  const searchEl = document.getElementById('search-container');
  const shortcutsEl = document.getElementById('shortcuts-container');
  const wallpaperInfoEl = document.getElementById('wallpaper-info');
  const weatherWidget = document.getElementById('weather-widget');
  
  // Zen Mode overrides all individual settings
  if (zenMode) {
    clockDateEl?.classList.add('hover-only');
    searchEl?.classList.add('hover-only');
    shortcutsEl?.classList.add('hover-only');
    wallpaperInfoEl?.classList.add('hover-only');
    weatherWidget?.classList.add('hover-only');
    document.body.classList.add('zen-mode');
    return;
  }
  
  document.body.classList.remove('zen-mode');
  weatherWidget?.classList.remove('hover-only');
  
  // Clock & Date (single container)
  if (hoverOnly.clock) {
    clockDateEl?.classList.add('hover-only');
  } else {
    clockDateEl?.classList.remove('hover-only');
  }
  
  // Search
  if (hoverOnly.search) {
    searchEl?.classList.add('hover-only');
  } else {
    searchEl?.classList.remove('hover-only');
  }
  
  // Shortcuts
  if (hoverOnly.shortcuts) {
    shortcutsEl?.classList.add('hover-only');
  } else {
    shortcutsEl?.classList.remove('hover-only');
  }
  
  // Wallpaper Info (bottom bar) - this one shows on direct hover
  if (hoverOnly.wallpaperInfo) {
    wallpaperInfoEl?.classList.add('hover-only');
  } else {
    wallpaperInfoEl?.classList.remove('hover-only');
  }
}

async function saveSettings() {
  let subredditInput = document.getElementById('settings-subreddit').value.trim();
  
  // Parse and clean subreddits
  const subreddits = parseSubreddits(subredditInput);
  
  if (subreddits.length === 0) {
    alert('Please enter at least one subreddit name');
    return;
  }
  
  // Store as comma-separated string
  const subreddit = subreddits.join(', ');
  
  const sort = document.getElementById('settings-sort').value;
  const time = document.getElementById('settings-time').value;
  const minResolution = parseInt(document.getElementById('settings-resolution').value);
  const allowNsfw = document.getElementById('settings-nsfw').checked;
  const slideshowInterval = parseInt(document.getElementById('settings-slideshow').value);
  
  // Media type settings
  const allowImages = document.getElementById('settings-images').checked;
  const allowGifs = document.getElementById('settings-gifs').checked;
  const allowVideos = document.getElementById('settings-videos').checked;
  
  // At least one media type must be selected
  if (!allowImages && !allowGifs && !allowVideos) {
    alert('Please select at least one media type');
    return;
  }
  
  // Hover-only settings
  const hoverOnly = {
    clock: document.getElementById('hover-clock').checked,
    search: document.getElementById('hover-search').checked,
    shortcuts: document.getElementById('hover-shortcuts').checked,
    wallpaperInfo: document.getElementById('hover-wallpaper-info').checked
  };
  
  // Clock format settings
  const clockFormat = document.getElementById('settings-clock-format').value;
  const dateFormat = document.getElementById('settings-date-format').value;
  
  // Weather settings
  const showWeather = document.getElementById('settings-weather-enabled').checked;
  const weatherLocation = document.getElementById('settings-weather-location').value.trim();
  const weatherUnits = document.getElementById('settings-weather-units').value;
  
  // Timer settings
  const showTimer = document.getElementById('settings-timer-enabled').checked;
  const timerPosition = document.getElementById('settings-timer-position').value;
  
  // Favorites only setting
  const favoritesOnly = document.getElementById('settings-favorites-only').checked;
  
  // Local wallpapers setting
  const useLocalWallpapers = document.getElementById('settings-local-wallpapers').checked;
  
  // Scheduled subreddits
  const scheduledEnabled = document.getElementById('settings-scheduled-enabled').checked;
  const scheduledSubreddits = getScheduledSubredditsFromUI();
  
  // Zen Mode
  const zenMode = document.getElementById('settings-zen-mode').checked;
  
  const settings = { 
    subreddit, sort, time, minResolution, allowNsfw, slideshowInterval, 
    allowImages, allowGifs, allowVideos, hoverOnly,
    clockFormat, dateFormat,
    showWeather, weatherLocation, weatherUnits,
    showTimer, timerPosition,
    favoritesOnly,
    useLocalWallpapers,
    scheduledEnabled, scheduledSubreddits,
    zenMode
  };
  
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  
  // Apply hover-only settings immediately (with zen mode override)
  applyHoverSettings(hoverOnly, zenMode);
  
  // Update weather widget visibility
  const weatherWidget = document.getElementById('weather-widget');
  if (showWeather && weatherLocation) {
    weatherWidget?.classList.remove('hidden');
    updateWeather();
  } else {
    weatherWidget?.classList.add('hidden');
  }
  
  // Update timer widget visibility
  await initTimer();
  
  // Save each subreddit to recents
  for (const sub of subreddits) {
    await saveRecentSubreddit(sub);
  }
  
  // Restart slideshow with new interval
  initSlideshow();
  
  closeSettingsModal();
  
  // Clear all wallpaper caches and fetch new ones with new settings
  const allStorage = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(allStorage).filter(key => 
    key.startsWith(CACHE_KEY) || key === CURRENT_WALLPAPER_KEY
  );
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
  
  // Reload the page to apply all changes cleanly
  location.reload();
}

// Load wallpaper
async function loadWallpaper() {
  const loading = document.getElementById('loading');
  
  try {
    const settings = await getWallpaperSettings();
    
    // Check if using local wallpapers mode
    if (settings.useLocalWallpapers) {
      const localWallpaper = await getRandomLocalWallpaper();
      if (localWallpaper) {
        setLocalWallpaper(localWallpaper);
        loading.classList.add('hidden');
        return;
      } else {
        showToast('No local wallpapers available. Upload some images in settings!');
        // Fall back to Reddit wallpapers
      }
    }
    
    // Check if favorites only mode
    if (settings.favoritesOnly) {
      const favResult = await chrome.storage.local.get([FAVORITES_KEY]);
      const favorites = favResult[FAVORITES_KEY] || [];
      
      if (favorites.length > 0) {
        const randomIndex = Math.floor(Math.random() * favorites.length);
        const wallpaper = favorites[randomIndex];
        setWallpaperFast(wallpaper);
        await addToHistory(wallpaper);
        loading.classList.add('hidden');
        return;
      }
    }
    
    const cacheKey = `${CACHE_KEY}_${settings.subreddit}_${settings.sort}_${settings.time}_${settings.minResolution}_${settings.allowNsfw}`;
    const result = await chrome.storage.local.get([cacheKey]);
    const cached = result[cacheKey];
    
    // If we have cached wallpapers, pick a random one immediately
    if (cached && cached.wallpapers && cached.wallpapers.length > 0) {
      let wallpapers = cached.wallpapers;
      
      // Apply color filter if set
      if (settings.colorFilter && settings.colorFilter !== 'none') {
        console.log(`Applying color filter: ${settings.colorFilter}`);
        wallpapers = await filterByColor(wallpapers, settings.colorFilter);
        console.log(`After color filter: ${wallpapers.length} wallpapers`);
      }
      
      if (wallpapers.length === 0) {
        console.warn('No wallpapers left after color filtering, fetching new ones');
        await getNewWallpaper();
        return;
      }
      
      const randomIndex = Math.floor(Math.random() * wallpapers.length);
      const wallpaper = wallpapers[randomIndex];
      
      // Show wallpaper immediately (don't wait for preload)
      setWallpaperFast(wallpaper);
      await addToHistory(wallpaper);
      loading.classList.add('hidden');
      
      // Refresh cache in background if it's getting old (> 15 min)
      if (Date.now() - cached.timestamp > 15 * 60 * 1000) {
        fetchWallpapers(); // Don't await, runs in background
      }
    } else {
      // No cache, need to fetch
      await getNewWallpaper();
    }
  } catch (error) {
    console.error('Error loading wallpaper:', error);
    loading.classList.add('hidden');
    // Try to get a new wallpaper as fallback
    showToast('Error loading cached wallpaper, fetching new one...');
    await getNewWallpaper();
  }
}

// Get cached wallpaper
async function getCachedWallpaper() {
  try {
    const result = await chrome.storage.local.get([CURRENT_WALLPAPER_KEY]);
    if (result[CURRENT_WALLPAPER_KEY]) {
      const cached = result[CURRENT_WALLPAPER_KEY];
      // Check if cache is still valid (1 hour)
      if (Date.now() - cached.timestamp < 60 * 60 * 1000) {
        return cached;
      }
    }
    return null;
  } catch (error) {
    console.error('Error getting cached wallpaper:', error);
    return null;
  }
}

// Get current wallpaper settings
async function getWallpaperSettings() {
  const result = await chrome.storage.local.get([SETTINGS_KEY]);
  return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };
}

// Build Reddit API URL from settings
function buildRedditUrl(subreddit, settings) {
  const { sort, time } = settings;
  let url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=100`;
  if (sort === 'top') {
    url += `&t=${time}`;
  }
  return url;
}

// Parse subreddits string into array
function parseSubreddits(subredditString) {
  return subredditString
    .split(',')
    .map(s => {
      let sub = s.trim();
      // Handle URL format
      const urlMatch = sub.match(/reddit\.com\/r\/([^\/\s?]+)/i);
      if (urlMatch) {
        sub = urlMatch[1];
      } else {
        sub = sub.replace(/^r\//, '');
      }
      return sub;
    })
    .filter(s => s.length > 0);
}

// Get resolution from Reddit's preview data or title
function getResolution(post) {
  // Try to get from Reddit's preview data first (most reliable)
  if (post.preview && post.preview.images && post.preview.images[0]) {
    const source = post.preview.images[0].source;
    if (source && source.width && source.height) {
      return { width: source.width, height: source.height };
    }
  }
  
  // Fallback: parse from title
  const match = post.title.match(/[\[\(](\d{3,5})\s*[x×]\s*(\d{3,5})[\]\)]/i);
  if (match) {
    return { width: parseInt(match[1]), height: parseInt(match[2]) };
  }
  
  return null;
}

// Fetch wallpapers from Reddit
async function fetchWallpapers() {
  try {
    const settings = await getWallpaperSettings();
    
    // Use scheduled subreddit if enabled
    const subredditSource = getScheduledSubreddit(settings);
    const subreddits = parseSubreddits(subredditSource);
    
    if (subreddits.length === 0) {
      return [];
    }
    
    // Check cache first (include settings in cache key)
    const cacheKey = `${CACHE_KEY}_${settings.subreddit}_${settings.sort}_${settings.time}_${settings.minResolution}_${settings.allowNsfw}`;
    const result = await chrome.storage.local.get([cacheKey]);
    if (result[cacheKey]) {
      const cached = result[cacheKey];
      // Only use cache if it has wallpapers AND is not expired
      if (cached.wallpapers && cached.wallpapers.length > 0 && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.wallpapers;
      }
    }
    
    // Fetch from all subreddits
    const allWallpapers = [];
    
    for (const subreddit of subreddits) {
      try {
        const redditUrl = buildRedditUrl(subreddit, settings);
        const response = await fetch(redditUrl, {
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          console.warn(`Failed to fetch from r/${subreddit}, status: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        const posts = data.data.children;
        
        // Filter for valid image posts
        const wallpapers = posts
          .map(post => post.data)
          .filter(post => {
            // Skip text posts (self posts)
            if (post.is_self) {
              return false;
            }
            
            // Skip galleries (for now - they have multiple images)
            if (post.is_gallery) {
              return false;
            }
            
            // Check for video content (Reddit hosted videos, v.redd.it)
            const isVideo = post.is_video || 
                           (post.media && post.media.reddit_video) ||
                           (post.url && post.url.includes('v.redd.it')) ||
                           (post.preview && post.preview.reddit_video_preview);
            
            // Must have a valid image/video URL
            const url = post.url || '';
            const hasDirectImage = url.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i) || 
                            url.includes('i.redd.it') ||
                            url.includes('i.imgur.com');
            
            const hasDirectVideo = url.match(/\.(mp4|webm|gifv)(\?.*)?$/i) ||
                            url.includes('v.redd.it') ||
                            (url.includes('imgur.com') && url.endsWith('.gifv'));
            
            // Check if there's a preview image available (but only for link posts, not self posts)
            const hasPreview = post.post_hint === 'image' ||
                              post.post_hint === 'hosted:video' ||
                              post.post_hint === 'rich:video' ||
                              (post.preview && 
                               post.preview.images && 
                               post.preview.images[0] &&
                               post.preview.images[0].source &&
                               !post.is_self);
            
            // Check resolution if minResolution is set
            if (settings.minResolution > 0) {
              const resolution = getResolution(post);
              if (!resolution || resolution.width < settings.minResolution) {
                return false;
              }
            }
            
            // Check NSFW
            if (!settings.allowNsfw && post.over_18) {
              return false;
            }
            
            // Determine media type
            const isGif = url.includes('.gif') || 
                         (post.preview?.images?.[0]?.variants?.gif) ||
                         (post.preview?.reddit_video_preview?.is_gif) ||
                         (url.includes('imgur.com') && url.endsWith('.gifv'));
            
            const isVideoContent = (isVideo || hasDirectVideo) && !isGif;
            const isImageContent = (hasDirectImage || hasPreview) && !isGif && !isVideo && !hasDirectVideo;
            
            // Filter by media type settings
            if (isImageContent && settings.allowImages === false) {
              return false;
            }
            if (isGif && settings.allowGifs === false) {
              return false;
            }
            if (isVideoContent && settings.allowVideos === false) {
              return false;
            }
            
            return hasDirectImage || hasDirectVideo || hasPreview || isVideo;
          })
          .map(post => ({
            url: getImageUrl(post),
            title: cleanTitle(post.title),
            permalink: `https://www.reddit.com${post.permalink}`,
            author: post.author,
            subreddit: subreddit,
            resolution: getResolution(post)
          }))
          .filter(w => w.url); // Filter out any that couldn't get a URL;
        
        allWallpapers.push(...wallpapers);
      } catch (err) {
        console.warn(`Error fetching r/${subreddit}:`, err);
      }
    }
    const blacklistResult = await chrome.storage.local.get([BLACKLIST_KEY]);
    const blacklist = blacklistResult[BLACKLIST_KEY] || [];
    const filteredWallpapers = allWallpapers.filter(w => !blacklist.includes(w.url));
    
    // Remove duplicates by URL
    const uniqueWallpapers = [];
    const seenUrls = new Set();
    for (const w of filteredWallpapers) {
      if (w.url && !seenUrls.has(w.url)) {
        seenUrls.add(w.url);
        uniqueWallpapers.push(w);
      }
    }
    
    // Shuffle the wallpapers so we get variety from all subreddits
    const shuffled = uniqueWallpapers.sort(() => Math.random() - 0.5);
    
    // Only cache if we have wallpapers
    if (shuffled.length > 0) {
      await chrome.storage.local.set({
        [cacheKey]: {
          wallpapers: shuffled,
          timestamp: Date.now()
        }
      });
    }
    
    return shuffled;
  } catch (error) {
    console.error('Error fetching wallpapers:', error);
    return [];
  }
}

// Get direct image URL from post
function getImageUrl(post) {
  const url = post.url || '';
  
  // Debug logging for GIFs
  if (url.includes('.gif') || (post.preview?.images?.[0]?.variants?.gif) || post.preview?.reddit_video_preview) {
    console.log('GIF/Video post found:', {
      url: url,
      hasGifVariant: !!post.preview?.images?.[0]?.variants?.gif,
      hasRedditVideoPreview: !!post.preview?.reddit_video_preview,
      redditVideoUrl: post.preview?.reddit_video_preview?.fallback_url,
      isGif: post.preview?.reddit_video_preview?.is_gif
    });
  }
  
  // Check for Reddit hosted video (is_video posts)
  if (post.is_video && post.media && post.media.reddit_video) {
    const redditVideo = post.media.reddit_video;
    if (redditVideo.fallback_url) {
      console.log('Using Reddit hosted video URL:', redditVideo.fallback_url);
      return redditVideo.fallback_url;
    }
  }
  
  // Check for Reddit video preview (often used for GIFs and crossposts)
  if (post.preview && post.preview.reddit_video_preview) {
    const videoPreview = post.preview.reddit_video_preview;
    if (videoPreview.fallback_url) {
      console.log('Using Reddit video preview URL:', videoPreview.fallback_url);
      return videoPreview.fallback_url;
    }
  }
  
  // Check for animated GIF in preview variants first
  if (post.preview && post.preview.images && post.preview.images[0]) {
    const image = post.preview.images[0];
    
    // Check for GIF variant (animated)
    if (image.variants && image.variants.gif && image.variants.gif.source) {
      const gifUrl = image.variants.gif.source.url.replace(/&amp;/g, '&');
      console.log('Using GIF variant URL:', gifUrl);
      return gifUrl;
    }
  }
  
  // Get preview URL as potential fallback
  let previewUrl = null;
  if (post.preview && post.preview.images && post.preview.images[0]) {
    const image = post.preview.images[0];
    if (image.source && image.source.url) {
      previewUrl = image.source.url.replace(/&amp;/g, '&');
    }
  }
  
  // Handle i.redd.it links first (these are usually best quality)
  if (url.includes('i.redd.it')) {
    // For GIFs, always use direct URL (preview converts to static)
    if (url.includes('.gif')) {
      console.log('Using direct i.redd.it GIF URL:', url);
      return url;
    }
    // For other images, prefer preview URL as it's more reliable for older posts
    return previewUrl || url;
  }
  
  // If it's already a direct image URL, use it
  if (url.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
    const directUrl = url.split('?')[0];
    if (url.includes('.gif')) {
      console.log('Using direct GIF URL:', directUrl);
    }
    return directUrl; // Remove query params
  }
  
  // Handle Imgur .gifv - keep as .gifv, we'll play as video
  if (url.includes('imgur.com') && url.endsWith('.gifv')) {
    console.log('Using Imgur gifv (will play as video):', url);
    return url;
  }
  
  // Handle imgur links
  if (url.includes('imgur.com')) {
    if (url.includes('i.imgur.com')) {
      // Make sure we get the full size, not a thumbnail
      let imgurUrl = url;
      // Remove size suffixes like 's', 'm', 'l', 'h' before extension
      imgurUrl = imgurUrl.replace(/([a-zA-Z0-9]+)[smlh]\.(jpg|jpeg|png|gif|webp)$/i, '$1.$2');
      return imgurUrl;
    }
    // Convert imgur page URL to direct image
    const imgurId = url.split('/').pop().split('.')[0].split('?')[0];
    if (imgurId && imgurId.length > 0) {
      return `https://i.imgur.com/${imgurId}.jpg`;
    }
  }
  
  // Use preview URL if available
  if (previewUrl) {
    return previewUrl;
  }
  
  // Last resort: try the URL_overridden_by_dest
  if (post.url_overridden_by_dest) {
    return post.url_overridden_by_dest;
  }
  
  return null;
}

// Clean up the title
function cleanTitle(title) {
  // Remove resolution info and clean up
  return title
    .replace(/\[\d+\s*[x×]\s*\d+\]/gi, '')
    .replace(/\(\d+\s*[x×]\s*\d+\)/gi, '')
    .replace(/\[OC\]/gi, '')
    .replace(/\[OS\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Get a new wallpaper
async function getNewWallpaper(retryCount = 0) {
  const MAX_RETRIES = 5;
  const loading = document.getElementById('loading');
  
  try {
    const settings = await getWallpaperSettings();
    let wallpapers;
    
    // If using local wallpapers mode, use local wallpapers
    if (settings.useLocalWallpapers) {
      const localWallpaper = await getRandomLocalWallpaper();
      if (localWallpaper) {
        setLocalWallpaper(localWallpaper);
        loading.classList.add('hidden');
        return;
      } else {
        showToast('No local wallpapers available');
        loading.classList.add('hidden');
        return;
      }
    }
    
    // If favorites only mode is enabled, use favorites
    if (settings.favoritesOnly) {
      const favResult = await chrome.storage.local.get([FAVORITES_KEY]);
      wallpapers = favResult[FAVORITES_KEY] || [];
      
      if (wallpapers.length === 0) {
        showToast('No favorites saved. Add some wallpapers to favorites first!');
        loading.classList.add('hidden');
        // Fall back to regular wallpapers
        wallpapers = await fetchWallpapers();
      }
    } else {
      wallpapers = await fetchWallpapers();
    }
    
    if (wallpapers.length === 0) {
      showToast('No wallpapers found. Try a different subreddit or settings.');
      loading.classList.add('hidden');
      return;
    }
    
    // Apply color filter if set
    if (settings.colorFilter && settings.colorFilter !== 'none') {
      wallpapers = await filterByColor(wallpapers, settings.colorFilter);
    }
    
    // Pick a random wallpaper
    const randomIndex = Math.floor(Math.random() * wallpapers.length);
    const wallpaper = wallpapers[randomIndex];
    
    // Add to history
    await addToHistory(wallpaper);
    
    // Cache the current wallpaper
    await chrome.storage.local.set({
      [CURRENT_WALLPAPER_KEY]: {
        ...wallpaper,
        timestamp: Date.now()
      }
    });
    
    // Set wallpaper with a timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 10000)
    );
    
    try {
      await Promise.race([setWallpaper(wallpaper), timeoutPromise]);
    } catch (e) {
      // If timeout or error, just set the src directly
      document.getElementById('background').src = wallpaper.url;
      currentWallpaperData = wallpaper;
      updateWallpaperInfo(wallpaper);
    }
    
    loading.classList.add('hidden');
  } catch (error) {
    console.error('Error getting new wallpaper:', error);
    loading.classList.add('hidden');
    
    if (error.message === 'Failed to load image' && retryCount < MAX_RETRIES) {
      // Image failed to load, try another one
      console.log(`Retrying... attempt ${retryCount + 1}/${MAX_RETRIES}`);
      return getNewWallpaper(retryCount + 1);
    }
    
    if (error.message.includes('Failed to fetch')) {
      showToast('Could not connect to Reddit. Check your internet connection.');
    } else if (retryCount >= MAX_RETRIES) {
      showToast('Multiple images failed to load. Try refreshing.');
    }
  }
}

// Load a new wallpaper (alias for getNewWallpaper, used by error handlers)
async function loadNewWallpaper() {
  await getNewWallpaper();
}

// Check if URL is a video format
function isVideoUrl(url) {
  if (!url) return false;
  return url.endsWith('.gifv') || 
         url.endsWith('.mp4') || 
         url.endsWith('.webm') ||
         url.includes('v.redd.it');
}

// Set the wallpaper (fast version - no preload wait)
function setWallpaperFast(wallpaper) {
  const background = document.getElementById('background');
  const backgroundVideo = document.getElementById('background-video');
  
  // Check if it's a video
  if (isVideoUrl(wallpaper.url)) {
    // Hide image, show video
    background.style.display = 'none';
    backgroundVideo.classList.add('active');
    
    // Convert .gifv to .mp4 for Imgur
    let videoUrl = wallpaper.url;
    if (videoUrl.endsWith('.gifv')) {
      videoUrl = videoUrl.replace('.gifv', '.mp4');
    }
    
    backgroundVideo.src = videoUrl;
    backgroundVideo.play();
    
    currentWallpaperData = wallpaper;
    updateWallpaperInfo(wallpaper);
    updateFavoriteButton();
    return;
  }
  
  // It's an image - hide video, show image
  backgroundVideo.classList.remove('active');
  backgroundVideo.src = '';
  background.style.display = 'block';
  
  // Create a test image to check if URL loads
  const testImg = new Image();
  
  testImg.onload = () => {
    // Image loaded successfully, apply it directly
    background.src = wallpaper.url;
    
    currentWallpaperData = wallpaper;
    updateWallpaperInfo(wallpaper);
    updateFavoriteButton();
    
    // Analyze brightness and adjust UI
    analyzeImageBrightness(wallpaper.url);
  };
  
  testImg.onerror = () => {
    console.warn('Failed to load wallpaper:', wallpaper.url);
    showToast('Image failed to load, trying another...');
    // Automatically try to get a new wallpaper
    setTimeout(() => {
      getNewWallpaper();
    }, 500);
  };
  
  testImg.src = wallpaper.url;
}

// Set the wallpaper (with preload)
function setWallpaper(wallpaper) {
  return new Promise((resolve, reject) => {
    const background = document.getElementById('background');
    const backgroundVideo = document.getElementById('background-video');
    
    // Check if it's a video
    if (isVideoUrl(wallpaper.url)) {
      // Hide image, show video
      background.style.display = 'none';
      backgroundVideo.classList.add('active');
      
      // Convert .gifv to .mp4 for Imgur
      let videoUrl = wallpaper.url;
      if (videoUrl.endsWith('.gifv')) {
        videoUrl = videoUrl.replace('.gifv', '.mp4');
      }
      
      backgroundVideo.src = videoUrl;
      backgroundVideo.play();
      
      currentWallpaperData = wallpaper;
      updateWallpaperInfo(wallpaper);
      updateFavoriteButton();
      resolve();
      return;
    }
    
    // It's an image - hide video, show image
    backgroundVideo.classList.remove('active');
    backgroundVideo.src = '';
    background.style.display = 'block';
    
    // Preload the image completely
    const img = new Image();
    img.onload = () => {
      // Image is fully loaded, just set it directly
      background.src = wallpaper.url;
      
      currentWallpaperData = wallpaper;
      updateWallpaperInfo(wallpaper);
      updateFavoriteButton();
      
      // Analyze brightness and adjust UI
      analyzeImageBrightness(wallpaper.url);
      
      resolve();
    };
    img.onerror = () => {
      console.warn('Failed to preload wallpaper:', wallpaper.url);
      showToast('Image failed to load, trying another...');
      setTimeout(() => {
        getNewWallpaper();
      }, 500);
      reject(new Error('Failed to load image'));
    };
    img.src = wallpaper.url;
  });
}

// Analyze image brightness and adjust UI accordingly
function analyzeImageBrightness(imageUrl) {
  // Skip analysis for Reddit preview URLs (CORS blocked)
  // Default to dark mode styling which works well for most nature photos
  if (imageUrl.includes('preview.redd.it') || imageUrl.includes('i.redd.it')) {
    document.body.classList.remove('light-wallpaper');
    return;
  }
  
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Sample a small version for performance
      canvas.width = 50;
      canvas.height = 50;
      ctx.drawImage(img, 0, 0, 50, 50);
      
      const imageData = ctx.getImageData(0, 0, 50, 50);
      const data = imageData.data;
      
      let totalBrightness = 0;
      const pixelCount = data.length / 4;
      
      for (let i = 0; i < data.length; i += 4) {
        // Calculate perceived brightness (human eye is more sensitive to green)
        const brightness = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        totalBrightness += brightness;
      }
      
      const avgBrightness = totalBrightness / pixelCount;
      
      // Toggle light/dark mode based on brightness
      if (avgBrightness > 128) {
        document.body.classList.add('light-wallpaper');
      } else {
        document.body.classList.remove('light-wallpaper');
      }
    } catch (e) {
      // CORS or other error, default to dark mode
      document.body.classList.remove('light-wallpaper');
    }
  };
  
  img.onerror = () => {
    document.body.classList.remove('light-wallpaper');
  };
  
  img.src = imageUrl;
}

// Download current wallpaper
function downloadWallpaper() {
  if (!currentWallpaperData) {
    showToast('No wallpaper to download');
    return;
  }
  
  // Open image in new tab - user can right-click save from there
  // This avoids CORS issues with fetch
  const a = document.createElement('a');
  a.href = currentWallpaperData.url;
  a.target = '_blank';
  a.click();
  showToast('Opening image in new tab - right-click to save');
}

// Toggle favorite
async function toggleFavorite() {
  if (!currentWallpaperData) return;
  
  const result = await chrome.storage.local.get([FAVORITES_KEY]);
  const favorites = result[FAVORITES_KEY] || [];
  
  const index = favorites.findIndex(f => f.url === currentWallpaperData.url);
  
  if (index === -1) {
    // Add to favorites
    favorites.push({
      ...currentWallpaperData,
      savedAt: Date.now()
    });
    await chrome.storage.local.set({ [FAVORITES_KEY]: favorites });
    document.getElementById('favorite-btn').textContent = '♥';
    document.getElementById('favorite-btn').classList.add('favorited');
    showToast('Added to favorites');
  } else {
    // Remove from favorites
    favorites.splice(index, 1);
    await chrome.storage.local.set({ [FAVORITES_KEY]: favorites });
    document.getElementById('favorite-btn').textContent = '♡';
    document.getElementById('favorite-btn').classList.remove('favorited');
    showToast('Removed from favorites');
  }
}

// Blacklist current wallpaper
async function blacklistWallpaper() {
  if (!currentWallpaperData) return;
  
  const result = await chrome.storage.local.get([BLACKLIST_KEY]);
  const blacklist = result[BLACKLIST_KEY] || [];
  
  if (!blacklist.includes(currentWallpaperData.url)) {
    blacklist.push(currentWallpaperData.url);
    await chrome.storage.local.set({ [BLACKLIST_KEY]: blacklist });
    showToast('Wallpaper blacklisted');
    
    // Get a new wallpaper
    getNewWallpaper();
  }
}

// Check if wallpaper is blacklisted
async function isBlacklisted(url) {
  const result = await chrome.storage.local.get([BLACKLIST_KEY]);
  const blacklist = result[BLACKLIST_KEY] || [];
  return blacklist.includes(url);
}

// Check if wallpaper is favorited
async function isFavorited(url) {
  const result = await chrome.storage.local.get([FAVORITES_KEY]);
  const favorites = result[FAVORITES_KEY] || [];
  return favorites.some(f => f.url === url);
}

// Update favorite button state
async function updateFavoriteButton() {
  if (!currentWallpaperData) return;
  
  const favorited = await isFavorited(currentWallpaperData.url);
  const btn = document.getElementById('favorite-btn');
  btn.textContent = favorited ? '♥' : '♡';
  btn.classList.toggle('favorited', favorited);
}

// Show toast notification
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
}

// Initialize slideshow
async function initSlideshow() {
  const settings = await getWallpaperSettings();
  const interval = settings.slideshowInterval || 0;
  
  if (slideshowInterval) {
    clearInterval(slideshowInterval);
    slideshowInterval = null;
  }
  
  if (interval > 0) {
    slideshowInterval = setInterval(() => {
      getNewWallpaper();
    }, interval * 60 * 1000);
  }
}

// View favorites modal
function openFavoritesModal() {
  const modal = document.getElementById('favorites-modal');
  const grid = document.getElementById('favorites-grid');
  const noFavorites = document.getElementById('no-favorites');
  
  chrome.storage.local.get([FAVORITES_KEY], (result) => {
    const favorites = result[FAVORITES_KEY] || [];
    
    if (favorites.length === 0) {
      grid.classList.add('hidden');
      noFavorites.classList.remove('hidden');
    } else {
      grid.classList.remove('hidden');
      noFavorites.classList.add('hidden');
      
      grid.innerHTML = '';
      favorites.forEach((wallpaper, index) => {
        const item = document.createElement('div');
        item.className = 'favorite-item';
        item.innerHTML = `
          <img src="${wallpaper.url}" alt="${wallpaper.title}">
          <div class="favorite-overlay">
            <button class="favorite-use" title="Use this wallpaper">Use</button>
            <button class="favorite-remove" title="Remove from favorites">✕</button>
          </div>
        `;
        
        item.querySelector('.favorite-use').addEventListener('click', () => {
          setWallpaperFromFavorite(wallpaper);
          closeFavoritesModal();
        });
        
        item.querySelector('.favorite-remove').addEventListener('click', async () => {
          favorites.splice(index, 1);
          await chrome.storage.local.set({ [FAVORITES_KEY]: favorites });
          openFavoritesModal(); // Refresh
          showToast('Removed from favorites');
        });
        
        grid.appendChild(item);
      });
    }
  });
  
  modal.classList.remove('hidden');
}

function closeFavoritesModal() {
  document.getElementById('favorites-modal').classList.add('hidden');
}

// Set wallpaper from favorite
async function setWallpaperFromFavorite(wallpaper) {
  currentWallpaperData = wallpaper;
  setWallpaperFast(wallpaper);
  updateWallpaperInfo(wallpaper);
  updateFavoriteButton();
}

// Update wallpaper info display
function updateWallpaperInfo(wallpaper) {
  const titleElement = document.getElementById('wallpaper-title');
  const resElement = document.getElementById('wallpaper-resolution');
  
  titleElement.textContent = `📷 ${wallpaper.title} by u/${wallpaper.author}`;
  titleElement.onclick = () => window.open(wallpaper.permalink, '_blank');
  titleElement.style.cursor = 'pointer';
  
  if (wallpaper.resolution) {
    resElement.textContent = `${wallpaper.resolution.width}×${wallpaper.resolution.height}`;
  } else {
    resElement.textContent = '';
  }
}

// Setup favorites modal events
function setupFavoritesModal() {
  document.getElementById('view-favorites-btn').addEventListener('click', () => {
    closeSettingsModal();
    openFavoritesModal();
  });
  
  document.getElementById('favorites-close').addEventListener('click', closeFavoritesModal);
  
  document.getElementById('favorites-modal').addEventListener('click', (e) => {
    if (e.target.id === 'favorites-modal') {
      closeFavoritesModal();
    }
  });
  
  // Cached wallpapers modal
  document.getElementById('view-cached-btn').addEventListener('click', () => {
    closeSettingsModal();
    openCachedModal();
  });
  
  document.getElementById('cached-close').addEventListener('click', closeCachedModal);
  
  document.getElementById('clear-cache-btn').addEventListener('click', async () => {
    if (confirm('Clear all cached wallpapers?')) {
      const allStorage = await chrome.storage.local.get(null);
      const keysToRemove = Object.keys(allStorage).filter(key => key.startsWith(CACHE_KEY));
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }
      showToast('Cache cleared');
      openCachedModal(); // Refresh
    }
  });
  
  document.getElementById('cached-modal').addEventListener('click', (e) => {
    if (e.target.id === 'cached-modal') {
      closeCachedModal();
    }
  });
  
  // Blacklist modal
  document.getElementById('view-blacklist-btn').addEventListener('click', () => {
    closeSettingsModal();
    openBlacklistModal();
  });
  
  document.getElementById('blacklist-close').addEventListener('click', closeBlacklistModal);
  
  document.getElementById('clear-blacklist-btn').addEventListener('click', async () => {
    if (confirm('Clear entire blacklist? Blacklisted wallpapers will appear again.')) {
      await chrome.storage.local.remove([BLACKLIST_KEY]);
      showToast('Blacklist cleared');
      openBlacklistModal(); // Refresh
    }
  });
  
  document.getElementById('blacklist-modal').addEventListener('click', (e) => {
    if (e.target.id === 'blacklist-modal') {
      closeBlacklistModal();
    }
  });
  
  // Detect location button
  document.getElementById('detect-location-btn')?.addEventListener('click', detectLocation);
}

// View cached wallpapers modal
async function openCachedModal() {
  const modal = document.getElementById('cached-modal');
  const grid = document.getElementById('cached-grid');
  const noCached = document.getElementById('no-cached');
  const countSpan = document.getElementById('cached-count');
  
  const allStorage = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(allStorage).filter(key => key.startsWith(CACHE_KEY));
  
  let allWallpapers = [];
  
  for (const key of cacheKeys) {
    const cached = allStorage[key];
    if (cached && cached.wallpapers) {
      allWallpapers.push(...cached.wallpapers);
    }
  }
  
  // Remove duplicates by URL
  const uniqueWallpapers = [];
  const seenUrls = new Set();
  for (const w of allWallpapers) {
    if (!seenUrls.has(w.url)) {
      seenUrls.add(w.url);
      uniqueWallpapers.push(w);
    }
  }
  
  countSpan.textContent = `(${uniqueWallpapers.length})`;
  
  if (uniqueWallpapers.length === 0) {
    grid.classList.add('hidden');
    noCached.classList.remove('hidden');
  } else {
    grid.classList.remove('hidden');
    noCached.classList.add('hidden');
    
    grid.innerHTML = '';
    uniqueWallpapers.forEach((wallpaper) => {
      const item = document.createElement('div');
      item.className = 'favorite-item';
      item.innerHTML = `
        <img src="${wallpaper.url}" alt="${wallpaper.title}">
        <div class="favorite-overlay">
          <button class="favorite-use" title="Use this wallpaper">Use</button>
        </div>
      `;
      
      item.querySelector('.favorite-use').addEventListener('click', () => {
        setWallpaperFromFavorite(wallpaper);
        closeCachedModal();
      });
      
      grid.appendChild(item);
    });
  }
  
  modal.classList.remove('hidden');
}

function closeCachedModal() {
  document.getElementById('cached-modal').classList.add('hidden');
}

async function openBlacklistModal() {
  const modal = document.getElementById('blacklist-modal');
  const grid = document.getElementById('blacklist-grid');
  const noBlacklist = document.getElementById('no-blacklist');
  const countSpan = document.getElementById('blacklist-count');
  
  const data = await chrome.storage.local.get([BLACKLIST_KEY]);
  const blacklist = data[BLACKLIST_KEY] || [];
  
  countSpan.textContent = `(${blacklist.length})`;
  
  if (blacklist.length === 0) {
    grid.classList.add('hidden');
    noBlacklist.classList.remove('hidden');
  } else {
    grid.classList.remove('hidden');
    noBlacklist.classList.add('hidden');
    
    grid.innerHTML = '';
    blacklist.forEach((url, index) => {
      const item = document.createElement('div');
      item.className = 'favorite-item';
      item.innerHTML = `
        <img src="${url}" alt="Blacklisted ${index + 1}">
        <div class="favorite-overlay">
          <button class="favorite-remove" title="Remove from blacklist">Remove</button>
        </div>
      `;
      
      item.querySelector('.favorite-remove').addEventListener('click', async () => {
        await removeFromBlacklist(url);
        openBlacklistModal(); // Refresh
      });
      
      grid.appendChild(item);
    });
  }
  
  modal.classList.remove('hidden');
}

function closeBlacklistModal() {
  document.getElementById('blacklist-modal').classList.add('hidden');
}

async function removeFromBlacklist(url) {
  const data = await chrome.storage.local.get([BLACKLIST_KEY]);
  let blacklist = data[BLACKLIST_KEY] || [];
  blacklist = blacklist.filter(u => u !== url);
  await chrome.storage.local.set({ [BLACKLIST_KEY]: blacklist });
  showToast('Removed from blacklist');
}

// ==================== WEATHER ====================

async function updateWeather() {
  const settings = await getWallpaperSettings();
  const weatherWidget = document.getElementById('weather-widget');
  
  if (!settings.showWeather || !settings.weatherLocation) {
    weatherWidget?.classList.add('hidden');
    return;
  }
  
  try {
    // First get coordinates from city name using geocoding API
    const geoResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(settings.weatherLocation)}&count=1`
    );
    
    if (!geoResponse.ok) throw new Error('Geocoding failed');
    
    const geoData = await geoResponse.json();
    if (!geoData.results || geoData.results.length === 0) {
      throw new Error('Location not found');
    }
    
    const { latitude, longitude, name } = geoData.results[0];
    
    // Fetch weather data
    const unit = settings.weatherUnits === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=${unit}`
    );
    
    if (!weatherResponse.ok) throw new Error('Weather fetch failed');
    
    const weatherData = await weatherResponse.json();
    const current = weatherData.current;
    
    const temp = Math.round(current.temperature_2m);
    const tempUnit = unit === 'fahrenheit' ? '°F' : '°C';
    const weatherCode = current.weather_code;
    
    // Weather codes to emoji/description
    const weatherInfo = getWeatherInfo(weatherCode);
    
    // Update UI
    const iconEl = document.getElementById('weather-icon');
    const textEl = document.getElementById('weather-text');
    
    if (iconEl && textEl) {
      iconEl.textContent = weatherInfo.icon;
      textEl.innerHTML = `
        <span id="weather-temp">${temp}${tempUnit}</span>
        <span id="weather-desc">${weatherInfo.description}</span>
        <span id="weather-location">${name}</span>
      `;
      weatherWidget?.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Weather fetch failed:', error);
    weatherWidget?.classList.add('hidden');
  }
}

async function openWeatherWebsite() {
  const settings = await getWallpaperSettings();
  if (settings.weatherLocation) {
    const query = encodeURIComponent(settings.weatherLocation + ' weather');
    window.open(`https://www.google.com/search?q=${query}`, '_blank');
  }
}

async function detectLocation() {
  const locationInput = document.getElementById('settings-weather-location');
  const detectBtn = document.getElementById('detect-location-btn');
  
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser');
    return;
  }
  
  detectBtn.disabled = true;
  detectBtn.textContent = '⏳';
  
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const { latitude, longitude } = position.coords;
        
        // Use reverse geocoding API (nominatim style)
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
          {
            headers: {
              'User-Agent': 'WallpaperExtension/1.0'
            }
          }
        );
        
        if (!response.ok) throw new Error('Reverse geocoding failed');
        
        const data = await response.json();
        const address = data.address;
        
        // Get the most appropriate city name
        const cityName = address.city || address.town || address.village || 
                        address.municipality || address.county || 'Unknown';
        
        locationInput.value = cityName;
        showToast(`Location detected: ${cityName}`);
      } catch (error) {
        console.error('Location detection error:', error);
        showToast('Failed to detect location. Please enter manually.');
      } finally {
        detectBtn.disabled = false;
        detectBtn.textContent = '📍';
      }
    },
    (error) => {
      console.error('Geolocation error:', error);
      showToast('Location access denied. Please enter manually.');
      detectBtn.disabled = false;
      detectBtn.textContent = '📍';
    }
  );
}

function getWeatherInfo(code) {
  const weatherCodes = {
    0: { icon: '☀️', description: 'Clear' },
    1: { icon: '🌤️', description: 'Mostly Clear' },
    2: { icon: '⛅', description: 'Partly Cloudy' },
    3: { icon: '☁️', description: 'Cloudy' },
    45: { icon: '🌫️', description: 'Foggy' },
    48: { icon: '🌫️', description: 'Icy Fog' },
    51: { icon: '🌧️', description: 'Light Drizzle' },
    53: { icon: '🌧️', description: 'Drizzle' },
    55: { icon: '🌧️', description: 'Heavy Drizzle' },
    61: { icon: '🌧️', description: 'Light Rain' },
    63: { icon: '🌧️', description: 'Rain' },
    65: { icon: '🌧️', description: 'Heavy Rain' },
    66: { icon: '🌨️', description: 'Freezing Rain' },
    67: { icon: '🌨️', description: 'Heavy Freezing Rain' },
    71: { icon: '❄️', description: 'Light Snow' },
    73: { icon: '❄️', description: 'Snow' },
    75: { icon: '❄️', description: 'Heavy Snow' },
    77: { icon: '❄️', description: 'Snow Grains' },
    80: { icon: '🌦️', description: 'Light Showers' },
    81: { icon: '🌦️', description: 'Showers' },
    82: { icon: '⛈️', description: 'Heavy Showers' },
    85: { icon: '🌨️', description: 'Snow Showers' },
    86: { icon: '🌨️', description: 'Heavy Snow Showers' },
    95: { icon: '⛈️', description: 'Thunderstorm' },
    96: { icon: '⛈️', description: 'Thunderstorm with Hail' },
    99: { icon: '⛈️', description: 'Thunderstorm with Heavy Hail' }
  };
  
  return weatherCodes[code] || { icon: '🌡️', description: 'Unknown' };
}

// ==================== WALLPAPER HISTORY ====================

async function loadWallpaperHistory() {
  const data = await chrome.storage.local.get([WALLPAPER_HISTORY_KEY]);
  wallpaperHistory = data[WALLPAPER_HISTORY_KEY] || [];
  historyIndex = wallpaperHistory.length - 1;
  updateBackButton();
}

async function addToHistory(wallpaper) {
  if (!wallpaper || !wallpaper.url) return;
  
  // Don't add duplicates consecutively
  if (wallpaperHistory.length > 0 && wallpaperHistory[wallpaperHistory.length - 1].url === wallpaper.url) {
    return;
  }
  
  wallpaperHistory.push(wallpaper);
  
  // Limit history size
  if (wallpaperHistory.length > MAX_HISTORY) {
    wallpaperHistory = wallpaperHistory.slice(-MAX_HISTORY);
  }
  
  historyIndex = wallpaperHistory.length - 1;
  
  await chrome.storage.local.set({ [WALLPAPER_HISTORY_KEY]: wallpaperHistory });
  updateBackButton();
}

function updateBackButton() {
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    backBtn.style.opacity = historyIndex > 0 ? '1' : '0.3';
    backBtn.style.pointerEvents = historyIndex > 0 ? 'auto' : 'none';
  }
}

async function goBackInHistory() {
  if (historyIndex <= 0) return;
  
  historyIndex--;
  const wallpaper = wallpaperHistory[historyIndex];
  
  if (wallpaper) {
    await setWallpaperDirect(wallpaper);
    updateBackButton();
  }
}

async function setWallpaperDirect(wallpaper) {
  const background = document.getElementById('background');
  const backgroundVideo = document.getElementById('background-video');
  
  if (isVideoUrl(wallpaper.url)) {
    background.style.display = 'none';
    backgroundVideo.classList.add('active');
    let videoUrl = wallpaper.url;
    if (videoUrl.endsWith('.gifv')) {
      videoUrl = videoUrl.replace('.gifv', '.mp4');
    }
    backgroundVideo.src = videoUrl;
    backgroundVideo.play();
  } else {
    backgroundVideo.classList.remove('active');
    backgroundVideo.src = '';
    background.style.display = 'block';
    background.src = wallpaper.url;
  }
  
  currentWallpaperData = wallpaper;
  updateWallpaperInfo(wallpaper);
  updateFavoriteButton();
}

// ==================== SCHEDULED SUBREDDITS ====================

function getScheduledSubreddit(settings) {
  if (!settings.scheduledEnabled || !settings.scheduledSubreddits || settings.scheduledSubreddits.length === 0) {
    return settings.subreddit;
  }
  
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight
  
  for (const schedule of settings.scheduledSubreddits) {
    const [startHour, startMin] = schedule.startTime.split(':').map(Number);
    const [endHour, endMin] = schedule.endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    // Handle overnight schedules (e.g., 22:00 - 06:00)
    if (endMinutes < startMinutes) {
      // Schedule wraps around midnight
      if (currentTime >= startMinutes || currentTime < endMinutes) {
        return schedule.subreddit;
      }
    } else {
      // Normal schedule
      if (currentTime >= startMinutes && currentTime < endMinutes) {
        return schedule.subreddit;
      }
    }
  }
  
  // No matching schedule, use default
  return settings.subreddit;
}

// ==================== SEARCH WALLPAPERS ====================

function openSearchModal() {
  const modal = document.getElementById('search-modal');
  if (modal) {
    document.getElementById('search-query').value = '';
    document.getElementById('search-results').innerHTML = '';
    modal.classList.remove('hidden');
    document.getElementById('search-query').focus();
  }
}

function closeSearchModal() {
  document.getElementById('search-modal')?.classList.add('hidden');
}

async function searchWallpapers(query) {
  if (!query.trim()) return;
  
  const settings = await getWallpaperSettings();
  const subreddit = settings.subreddit.split(',')[0].trim(); // Use first subreddit
  
  const resultsEl = document.getElementById('search-results');
  resultsEl.innerHTML = '<div class="loading-search">Searching...</div>';
  
  try {
    const response = await fetch(
      `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&limit=50&sort=relevance`
    );
    
    if (!response.ok) throw new Error('Search failed');
    
    const data = await response.json();
    const posts = data.data.children
      .map(p => p.data)
      .filter(post => {
        if (post.is_self || post.is_gallery) return false;
        const url = post.url || '';
        return url.match(/\.(jpg|jpeg|png|gif|webp|mp4|gifv)(\?.*)?$/i) ||
               url.includes('i.redd.it') ||
               url.includes('i.imgur.com') ||
               url.includes('v.redd.it') ||
               post.preview?.reddit_video_preview;
      });
    
    if (posts.length === 0) {
      resultsEl.innerHTML = '<div class="no-results">No results found</div>';
      return;
    }
    
    resultsEl.innerHTML = '';
    posts.forEach(post => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      
      const thumbUrl = post.thumbnail && post.thumbnail.startsWith('http') 
        ? post.thumbnail 
        : (post.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&') || '');
      
      item.innerHTML = `
        <img src="${thumbUrl}" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>'">
        <span class="search-result-title">${post.title.substring(0, 50)}${post.title.length > 50 ? '...' : ''}</span>
      `;
      
      item.addEventListener('click', async () => {
        const wallpaper = {
          url: getImageUrlFromPost(post),
          title: cleanTitle(post.title),
          permalink: `https://www.reddit.com${post.permalink}`,
          author: post.author,
          subreddit: subreddit,
          resolution: getResolution(post)
        };
        
        if (wallpaper.url) {
          await addToHistory(wallpaper);
          await setWallpaperDirect(wallpaper);
          closeSearchModal();
        }
      });
      
      resultsEl.appendChild(item);
    });
  } catch (error) {
    console.error('Search error:', error);
    resultsEl.innerHTML = '<div class="no-results">Search failed. Try again.</div>';
  }
}

// Helper to get image URL from a post (used by search)
function getImageUrlFromPost(post) {
  const url = post.url || '';
  
  if (post.preview?.reddit_video_preview?.fallback_url) {
    return post.preview.reddit_video_preview.fallback_url;
  }
  
  if (post.is_video && post.media?.reddit_video?.fallback_url) {
    return post.media.reddit_video.fallback_url;
  }
  
  if (post.preview?.images?.[0]?.variants?.gif?.source?.url) {
    return post.preview.images[0].variants.gif.source.url.replace(/&amp;/g, '&');
  }
  
  if (url.includes('i.redd.it') || url.includes('i.imgur.com')) {
    return url;
  }
  
  if (url.match(/\.(jpg|jpeg|png|gif|webp|mp4|gifv)(\?.*)?$/i)) {
    return url;
  }
  
  if (post.preview?.images?.[0]?.source?.url) {
    return post.preview.images[0].source.url.replace(/&amp;/g, '&');
  }
  
  return null;
}

// ==================== COLOR FILTERING ====================

function getDominantColor(imageUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 50;
        canvas.height = 50;
        ctx.drawImage(img, 0, 0, 50, 50);
        
        const imageData = ctx.getImageData(0, 0, 50, 50);
        const data = imageData.data;
        
        let r = 0, g = 0, b = 0;
        const pixelCount = data.length / 4;
        
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
        
        r = Math.round(r / pixelCount);
        g = Math.round(g / pixelCount);
        b = Math.round(b / pixelCount);
        
        // Determine dominant color category
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const lightness = (max + min) / 2 / 255;
        
        if (lightness < 0.2) {
          resolve('dark');
        } else if (lightness > 0.8) {
          resolve('light');
        } else if (r > g && r > b) {
          resolve(r > 150 && g < 100 ? 'red' : 'warm');
        } else if (g > r && g > b) {
          resolve('green');
        } else if (b > r && b > g) {
          resolve('blue');
        } else if (r > 200 && g > 150 && b < 100) {
          resolve('warm');
        } else {
          resolve('neutral');
        }
      } catch (e) {
        resolve('neutral');
      }
    };
    
    img.onerror = () => resolve('neutral');
    img.src = imageUrl;
  });
}

async function filterByColor(wallpapers, colorFilter) {
  if (colorFilter === 'none') return wallpapers;
  
  // For performance, only analyze a subset
  const analyzed = [];
  for (const w of wallpapers.slice(0, 30)) {
    const color = await getDominantColor(w.url);
    if (color === colorFilter || 
        (colorFilter === 'warm' && (color === 'red' || color === 'warm')) ||
        (colorFilter === 'cool' && (color === 'blue' || color === 'green'))) {
      analyzed.push(w);
    }
  }
  
  return analyzed.length > 0 ? analyzed : wallpapers;
}

// Timer functionality
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;

function updateTimerDisplay() {
  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  document.getElementById('timer-display').textContent = display;
  
  // Update UI visibility
  updateTimerUI();
  
  // Timer finished
  if (timerSeconds <= 0 && timerRunning) {
    pauseTimer();
    showToast('Timer finished!');
    // Optional: play a sound or notification
  }
}

function updateTimerUI() {
  const display = document.getElementById('timer-display');
  const toggleBtn = document.getElementById('timer-toggle');
  const resetBtn = document.getElementById('timer-reset');
  const setBtn = document.getElementById('timer-set');
  
  if (timerSeconds === 0 && !timerRunning) {
    // No timer set - hide everything except set button
    display?.classList.add('hidden');
    toggleBtn?.classList.add('hidden');
    resetBtn?.classList.add('hidden');
    setBtn?.classList.remove('hidden');
  } else {
    // Timer is set - show all controls
    display?.classList.remove('hidden');
    toggleBtn?.classList.remove('hidden');
    resetBtn?.classList.remove('hidden');
    setBtn?.classList.remove('hidden');
  }
}

function startTimer() {
  if (timerRunning) return;
  if (timerSeconds <= 0) {
    showToast('Set a timer first!');
    return;
  }
  
  timerRunning = true;
  document.getElementById('timer-toggle').textContent = '⏸';
  document.getElementById('timer-toggle').title = 'Pause timer';
  
  timerInterval = setInterval(() => {
    timerSeconds--;
    updateTimerDisplay();
  }, 1000);
}

function pauseTimer() {
  timerRunning = false;
  document.getElementById('timer-toggle').textContent = '▶';
  document.getElementById('timer-toggle').title = 'Start timer';
  
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function toggleTimer() {
  if (timerRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function resetTimer() {
  pauseTimer();
  timerSeconds = 0;
  updateTimerDisplay();
}

function setTimer() {
  const input = prompt('Set timer (format: MM:SS or just minutes):', '05:00');
  if (!input) return;
  
  let minutes = 0;
  let seconds = 0;
  
  if (input.includes(':')) {
    const parts = input.split(':');
    minutes = parseInt(parts[0]) || 0;
    seconds = parseInt(parts[1]) || 0;
  } else {
    minutes = parseInt(input) || 0;
  }
  
  pauseTimer();
  timerSeconds = minutes * 60 + seconds;
  updateTimerDisplay();
  updateTimerUI();
}

async function initTimer() {
  const settings = await getWallpaperSettings();
  const timerWidget = document.getElementById('timer-widget');
  
  if (settings.showTimer) {
    timerWidget.classList.remove('hidden');
    // Remove all position classes first
    timerWidget.classList.remove('top-left', 'top-right', 'bottom-left', 'bottom-right');
    timerWidget.classList.add(settings.timerPosition || 'top-left');
  } else {
    timerWidget.classList.add('hidden');
  }
  
  // Event listeners (only add once)
  const toggleBtn = document.getElementById('timer-toggle');
  if (toggleBtn && !toggleBtn.dataset.initialized) {
    toggleBtn.addEventListener('click', toggleTimer);
    toggleBtn.dataset.initialized = 'true';
  }
  
  const resetBtn = document.getElementById('timer-reset');
  if (resetBtn && !resetBtn.dataset.initialized) {
    resetBtn.addEventListener('click', resetTimer);
    resetBtn.dataset.initialized = 'true';
  }
  
  const setBtn = document.getElementById('timer-set');
  if (setBtn && !setBtn.dataset.initialized) {
    setBtn.addEventListener('click', setTimer);
    setBtn.dataset.initialized = 'true';
  }
  
  updateTimerDisplay();
  updateTimerUI();
}
