<p align="center">
  <img src="ClaudeWebLatexConverterLogo.png" alt="Claude LaTeX Formatter" width="150">
</p>

<h1 align="center">Claude Web LaTeX Formatter</h1>

<p align="center">A Chrome extension that renders LaTeX formulas in Claude's web chat interface.</p>

## What it does

I'm a big fan of Claude and prefer Claude's explanations when I am doing my engineering homework, however Claude's web interface often outputs incorrect Latex code, which doesn't get rendered correctly. This chrome extension detects LaTeX syntax and renders it correctly using KaTeX.

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the extension folder

## Usage

1. Go to [claude.ai](https://claude.ai)
2. Click the extension icon in your toolbar
3. Either:
   - Click **"Render LaTeX Now"** to manually have incorrect Latex on the current page rendered correct.
   - Toggle **"Auto-render"** to automatically have incorrect Latex on the current page rendered correct.