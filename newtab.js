// Default wallpaper settings
const DEFAULT_SETTINGS = {
  subreddit: 'EarthPorn',
  sort: 'hot',
  time: 'week',
  minResolution: 0,
  allowNsfw: false,
  slideshowInterval: 0,
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
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const MAX_RECENT_SUBREDDITS = 5;

let slideshowInterval = null;
let currentWallpaperData = null;

// Initialize the new tab
document.addEventListener('DOMContentLoaded', async () => {
  updateClock();
  setInterval(updateClock, 1000);
  
  setupSearch();
  setupModal();
  setupSettingsModal();
  setupFavoritesModal();
  await loadShortcuts();
  await loadWallpaper();
  
  // Apply hover-only settings
  const settings = await getWallpaperSettings();
  applyHoverSettings(settings.hoverOnly || {});
  
  document.getElementById('refresh-btn').addEventListener('click', () => {
    location.reload();
  });
  
  document.getElementById('settings-btn').addEventListener('click', () => {
    openSettingsModal();
  });
  
  document.getElementById('download-btn').addEventListener('click', downloadWallpaper);
  document.getElementById('favorite-btn').addEventListener('click', toggleFavorite);
  document.getElementById('blacklist-btn').addEventListener('click', blacklistWallpaper);
  
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
  }
}

// Clock functionality
function updateClock() {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  document.getElementById('clock').textContent = `${hours}:${minutes}`;
  
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('date').textContent = now.toLocaleDateString(undefined, options);
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
    const existingUrls = new Set();
    
    // Add filtered top sites first
    for (const site of filteredTopSites) {
      const hostname = new URL(site.url).hostname;
      if (!existingUrls.has(hostname)) {
        combined.push(site);
        existingUrls.add(hostname);
      }
    }
    
    // Add custom shortcuts at the end (skip duplicates)
    for (const shortcut of customShortcuts) {
      const hostname = new URL(shortcut.url).hostname;
      if (!existingUrls.has(hostname) && !removedShortcuts.includes(hostname)) {
        combined.push(shortcut);
        existingUrls.add(hostname);
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
  
  // Try to get favicon
  const domain = new URL(site.url).hostname;
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  
  const img = document.createElement('img');
  img.src = faviconUrl;
  img.alt = site.title;
  img.onerror = () => {
    // Fallback to first letter
    iconDiv.classList.add('fallback');
    iconDiv.textContent = site.title.charAt(0);
    img.remove();
  };
  
  iconDiv.appendChild(img);
  
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
    const hostname = new URL(url).hostname;
    // Remove www. and get the domain name, capitalize first letter
    name = hostname.replace(/^www\./, '').split('.')[0];
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }
  
  // Get existing custom shortcuts and top sites
  const stored = await chrome.storage.local.get(['custom_shortcuts', 'removed_shortcuts']);
  let customShortcuts = stored.custom_shortcuts || [];
  let removedShortcuts = stored.removed_shortcuts || [];
  const topSites = await chrome.topSites.get();
  
  // Check for duplicates
  const newHostname = new URL(url).hostname;
  const currentHostname = currentEditSite ? new URL(currentEditSite.url).hostname : null;
  
  // When editing, allow the same URL if it's the one being edited
  const isEditingSameUrl = currentHostname === newHostname;
  
  if (!isEditingSameUrl) {
    // Check if URL already exists in top sites (excluding the one being edited)
    const existsInTopSites = topSites.some(site => {
      const siteHostname = new URL(site.url).hostname;
      return siteHostname === newHostname && siteHostname !== currentHostname;
    });
    if (existsInTopSites) {
      alert('This site already exists in your top sites!');
      return;
    }
    
    // Check if URL already exists in custom shortcuts
    const existsInCustom = customShortcuts.some(s => new URL(s.url).hostname === newHostname);
    if (existsInCustom) {
      alert('This shortcut already exists!');
      return;
    }
  }
  
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
  
  // Load hover-only settings
  const hoverOnly = settings.hoverOnly || {};
  document.getElementById('hover-clock').checked = hoverOnly.clock || false;
  document.getElementById('hover-search').checked = hoverOnly.search || false;
  document.getElementById('hover-shortcuts').checked = hoverOnly.shortcuts || false;
  document.getElementById('hover-wallpaper-info').checked = hoverOnly.wallpaperInfo || false;
  
  // Show/hide time period based on current sort
  document.getElementById('time-period-group').style.display = 
    settings.sort === 'top' ? 'block' : 'none';
  
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

// Apply hover-only visibility settings
function applyHoverSettings(hoverOnly) {
  const clockDateEl = document.getElementById('clock-date');
  const searchEl = document.getElementById('search-container');
  const shortcutsEl = document.getElementById('shortcuts-container');
  const wallpaperInfoEl = document.getElementById('wallpaper-info');
  
  // Clock & Date (single container)
  if (hoverOnly.clock) {
    clockDateEl.classList.add('hover-only');
  } else {
    clockDateEl.classList.remove('hover-only');
  }
  
  // Search
  if (hoverOnly.search) {
    searchEl.classList.add('hover-only');
  } else {
    searchEl.classList.remove('hover-only');
  }
  
  // Shortcuts
  if (hoverOnly.shortcuts) {
    shortcutsEl.classList.add('hover-only');
  } else {
    shortcutsEl.classList.remove('hover-only');
  }
  
  // Wallpaper Info (bottom bar) - this one shows on direct hover
  if (hoverOnly.wallpaperInfo) {
    wallpaperInfoEl.classList.add('hover-only');
  } else {
    wallpaperInfoEl.classList.remove('hover-only');
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
  
  // Hover-only settings
  const hoverOnly = {
    clock: document.getElementById('hover-clock').checked,
    search: document.getElementById('hover-search').checked,
    shortcuts: document.getElementById('hover-shortcuts').checked,
    wallpaperInfo: document.getElementById('hover-wallpaper-info').checked
  };
  
  const settings = { subreddit, sort, time, minResolution, allowNsfw, slideshowInterval, hoverOnly };
  
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  
  // Apply hover-only settings immediately
  applyHoverSettings(hoverOnly);
  
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
    const cacheKey = `${CACHE_KEY}_${settings.subreddit}_${settings.sort}_${settings.time}_${settings.minResolution}_${settings.allowNsfw}`;
    const result = await chrome.storage.local.get([cacheKey]);
    const cached = result[cacheKey];
    
    // If we have cached wallpapers, pick a random one immediately
    if (cached && cached.wallpapers && cached.wallpapers.length > 0) {
      const randomIndex = Math.floor(Math.random() * cached.wallpapers.length);
      const wallpaper = cached.wallpapers[randomIndex];
      
      // Show wallpaper immediately (don't wait for preload)
      setWallpaperFast(wallpaper);
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
    const subreddits = parseSubreddits(settings.subreddit);
    
    if (subreddits.length === 0) {
      return [];
    }
    
    // Check cache first (include settings in cache key)
    const cacheKey = `${CACHE_KEY}_${settings.subreddit}_${settings.sort}_${settings.time}_${settings.minResolution}_${settings.allowNsfw}`;
    const result = await chrome.storage.local.get([cacheKey]);
    if (result[cacheKey]) {
      const cached = result[cacheKey];
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
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
          console.warn(`Failed to fetch from r/${subreddit}`);
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
            
            // Skip videos
            if (post.is_video || post.media || (post.url && post.url.includes('v.redd.it'))) {
              return false;
            }
            
            // Skip galleries (for now - they have multiple images)
            if (post.is_gallery) {
              return false;
            }
            
            // Must have a valid image URL
            const url = post.url || '';
            const hasDirectImage = url.match(/\.(jpg|jpeg|png|webp)(\?.*)?$/i) || 
                            url.includes('i.redd.it') ||
                            url.includes('i.imgur.com');
            
            // Check if there's a preview image available (but only for link posts, not self posts)
            const hasPreview = post.post_hint === 'image' ||
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
            
            return (hasDirectImage || hasPreview) && post.score > 50;
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
    
    // Filter out blacklisted wallpapers
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
    
    // Cache the results
    await chrome.storage.local.set({
      [cacheKey]: {
        wallpapers: shuffled,
        timestamp: Date.now()
      }
    });
    
    return shuffled;
  } catch (error) {
    console.error('Error fetching wallpapers:', error);
    return [];
  }
}

// Get direct image URL from post
function getImageUrl(post) {
  const url = post.url || '';
  
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
    // For i.redd.it, prefer preview URL as it's more reliable for older posts
    return previewUrl || url;
  }
  
  // If it's already a direct image URL, use it
  if (url.match(/\.(jpg|jpeg|png|webp)(\?.*)?$/i)) {
    return url.split('?')[0]; // Remove query params
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
    const wallpapers = await fetchWallpapers();
    
    if (wallpapers.length === 0) {
      showToast('No wallpapers found. Try a different subreddit or settings.');
      loading.classList.add('hidden');
      return;
    }
    
    // Pick a random wallpaper
    const randomIndex = Math.floor(Math.random() * wallpapers.length);
    const wallpaper = wallpapers[randomIndex];
    
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

// Set the wallpaper (fast version - no preload wait)
function setWallpaperFast(wallpaper) {
  const background = document.getElementById('background');
  
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
    showToast('Image failed to load. Press R to try another.');
  };
  
  testImg.src = wallpaper.url;
}

// Set the wallpaper (with preload)
function setWallpaper(wallpaper) {
  return new Promise((resolve, reject) => {
    const background = document.getElementById('background');
    
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
