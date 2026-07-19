# amp-plugins

Amp plugins for personal use, shared in case they help others.

Amp extends via TypeScript [plugins](https://ampcode.com/manual#plugins).

## Plugins

| Plugin | Description |
|--------|-------------|
| [copy](./plugins/copy.ts) | Command-palette action that copies the last completed assistant turn to the clipboard as Markdown (macOS; no third-party dependencies) |
| [grok-45-custom-mode](./plugins/grok-45-custom-mode.ts) | Grok 4.5 agent mode with a full system prompt — xAI's Grok Build CLI prompt (action safety, output style) blended with Amp's published mode prompts (tool doctrine, discovery, verification) |

Plugin entry points live under [`plugins/`](./plugins/).

## Install

Requires the [Amp CLI](https://ampcode.com/manual#get-started) (binary install; plugins need the native CLI).

### One plugin (recommended)

```bash
amp plugins add --auto-update \
  https://raw.githubusercontent.com/ben-vargas/amp-plugins/main/plugins/<name>.ts
```

- Default target is system: `~/.config/amp/plugins`
- Project-only: add `--target workspace` (installs to `.amp/plugins`)

Then reload plugins in Amp (`Ctrl+O` → `plugins: reload`) or restart the CLI.

`copy` is macOS-only. It writes through Apple's built-in JXA/AppKit bridge and does not require an npm package, LaunchAgent, or terminal-specific clipboard support.

### Local copy / development

```bash
# system-wide
mkdir -p ~/.config/amp/plugins
cp plugins/<name>.ts ~/.config/amp/plugins/

# or this project only
mkdir -p .amp/plugins
cp plugins/<name>.ts .amp/plugins/
```

### Remove

```bash
amp plugins remove <name>.ts
# or
amp plugins remove https://raw.githubusercontent.com/ben-vargas/amp-plugins/main/plugins/<name>.ts
```

### Update

Plugins installed with `--auto-update` refresh when Amp loads plugins. Trigger an update manually with:

```bash
amp plugins update
```

## Layout

```text
amp-plugins/
  plugins/     # plugin entry points
  README.md
```

## Writing a plugin

Minimal shape:

```ts
import type { PluginAPI } from '@ampcode/plugin'

export default function (amp: PluginAPI) {
  amp.logger.log('plugin initialized')
}
```

See the [Amp plugin guide](https://ampcode.com/manual#plugins) and [Plugin API reference](https://ampcode.com/manual/plugin-api).

## Security

Plugins run with full local access. Only install plugins you trust; review source before adding third-party files.
