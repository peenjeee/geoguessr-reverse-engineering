# PNJ GeoGuessr Tools

Chrome extension helper for GeoGuessr.

## Clone

```bash
git clone https://github.com/peenjeee/geoguessr-reverse-engineering.git
cd geoguessr-reverse-engineering
```

## Features

- **Built-in Auto Bot**: Farm EXP seamlessly in the background with auto-guess and auto-next round.
- **Place exact**: Drop the pin on the captured round location.
- **Place nearby**: Choose a score range and place close enough.
- **Refresh map**: Preview the round location for the current round.
- **Browser side panel**: For normal Chrome/Brave tabs.
- **In-page PWA launcher**: Fallback for installed GeoGuessr PWA windows.

## Built-in Auto Bot

No need for external Tampermonkey scripts anymore! The Auto-GeoGuessr Bot is now natively built into the extension. Just click the "AUTO BOT" button in the extension panel to toggle it on.

- **Farms EXP seamlessly** in the background.
- **Auto places the pin & guesses** based on your score range.
- **Automatically plays the next round**.

## Free GeoGuessr Challenge Links

Looking for free challenge links? Check out our companion web containing a curated collection of free GeoGuessr challenge links so you can play without a subscription:

[Browse Free Challenge Links](https://gc.0xpnj.dev)

## Preview

![PNJ GeoGuessr Tools demo](web/public/video.gif)

![PNJ GeoGuessr Tools popup](images/image1.png)

![PNJ GeoGuessr Tools range](images/image2.png)

![PNJ GeoGuessr Tools map](images/image3.png)

![PNJ GeoGuessr Tools PWA launcher](images/pwa1.png)

![PNJ GeoGuessr Tools PWA panel](images/pwa2.png)

## PWA and Browser Modes

### Normal browser tab

When GeoGuessr is opened in Chrome or Brave as a normal tab, PNJ GeoGuessr Tools opens in the browser side panel.

### Installed PWA

When GeoGuessr is opened as an installed desktop PWA, the browser side panel may not be available. In that case, PNJ GeoGuessr Tools appears as an in-page PNJ launcher button.

### Fallback behavior

If the side panel cannot open, the extension automatically falls back to the in-page launcher.

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project folder.
