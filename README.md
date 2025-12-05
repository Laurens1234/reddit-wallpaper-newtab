# Reddit Wallpaper New Tab

A browser extension for Chrome and Brave that replaces your new tab page with stunning wallpapers from Reddit.

![Preview](https://i.imgur.com/placeholder.png)

## Features

### Wallpapers
- 🖼️ Fetches high-quality images, GIFs, and videos from Reddit
- 🔄 Multiple subreddit support - combine your favorites
- ⚙️ Filter by resolution, sort method, and time period
- 🎬 Slideshow mode with configurable intervals
- ❤️ Save favorites for quick access
- 🚫 Blacklist images you don't want to see again
- 🔍 Search within subreddits for specific wallpapers
- 🎨 Filter wallpapers by dominant color
- ⏪ Wallpaper history - go back to previous wallpapers

### Media Types
- 📷 Static images (jpg, png, webp)
- 🎞️ Animated GIFs (including imgur .gifv)
- 🎬 Videos (Reddit hosted, mp4, webm)
- Toggle each type on/off in settings

### New Tab Experience
- ⏰ Customizable clock (12/24 hour, show seconds)
- 📅 Multiple date formats available
- 🌤️ Weather widget (free, no API key required)
- 🔍 Search bar (uses your default search engine)
- 🔗 Quick access shortcuts to your most visited sites
- ✏️ Fully customizable shortcuts - add, edit, or remove

### Customization
- 👁️ Hover-only mode for individual UI elements
- 🌓 Auto-adjusting text based on wallpaper brightness
- 📥 Download wallpapers directly
- ⏰ Scheduled subreddits - different sources at different times
- ⭐ Favorites-only mode for slideshows

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Load new wallpaper |
| `D` | Download current wallpaper |
| `F` | Add/remove from favorites |
| `B` | Blacklist current wallpaper |
| `←` | Go back in history |

## Installation

1. Download or clone this repository
2. Open your browser's extension page:
   - **Brave**: `brave://extensions/`
   - **Chrome**: `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the extension folder
6. Open a new tab and enjoy!

## Settings

Click the ⚙️ icon to customize:

### Wallpaper Settings
| Setting | Description |
|---------|-------------|
| Subreddit | One or more subreddits (comma-separated) |
| Sort | Hot, New, or Top |
| Time | For "Top" - hour, day, week, month, year, all |
| Min Resolution | Filter out low-res images |
| NSFW | Enable/disable NSFW content |
| Media Types | Enable/disable images, GIFs, or videos |

### Slideshow
| Setting | Description |
|---------|-------------|
| Auto-change | Off, 1, 5, 10, 30, 60 minutes |
| Favorites only | Only show favorite wallpapers |

### Clock & Date
| Setting | Description |
|---------|-------------|
| Clock format | 12-hour or 24-hour |
| Show seconds | Display seconds on clock |
| Date format | Long, short, numeric, or ISO |

### Weather
| Setting | Description |
|---------|-------------|
| Enabled | Show/hide weather widget |
| Location | City name (auto-geocoded) |
| Units | Celsius or Fahrenheit |

### Scheduled Subreddits
Set different subreddits for different times of day. Add time slots with start/end times and the subreddit to use during that period.

## Popular Subreddits

- `EarthPorn` - Nature landscapes (default)
- `SpacePorn` - Space and astronomy
- `CityPorn` - Urban photography
- `WaterPorn` - Oceans, lakes, waterfalls
- `SkyPorn` - Sky and cloud photography
- `Wallpapers` - General wallpapers
- `Cinemagraphs` - Subtle animated photos

Combine multiple: `EarthPorn, SpacePorn, CityPorn`

## Permissions

- **storage** - Save settings, favorites, and cache
- **topSites** - Display your most visited sites
- **search** - Use your default search engine

## License

MIT
