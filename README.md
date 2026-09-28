# amp-plugins

Amp plugins for personal use, shared in case they help others.

Amp extends via TypeScript [plugins](https://ampcode.com/manual#plugins).

## Plugins

| Plugin | Description |
|--------|-------------|
| [copy](./plugins/copy.ts) | Command-palette action that copies the last completed assistant turn to the clipboard as Markdown (macOS; no third-party dependencies) |
| [grok-45-custom-mode](./plugins/grok-45-custom-mode.ts) | Grok 4.5 agent mode with a full system prompt — xAI's Grok Build CLI prompt (action safety, output style) blended with Amp's published mode prompts (tool doctrine, discovery, verification) |

Plugin entry points live under [`plugins/`](./plugins/).

## Skills

| Skill | Description |
|-------|-------------|
| [amp-cli-proxy-api](./skills/amp-cli-proxy-api/SKILL.md) | Sets up [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) in an always-on Amp orb, published through Tailscale Funnel, so Amp can route Claude models through your Claude subscription with a Custom URL model-routing connection. Walks you through the Amp project, Tailscale OIDC trust credential, Claude login, and model routing. |

Install a skill globally, then ask Amp to use it (for example, "set up amp-cli-proxy-api"):

```bash
amp skill add --global ben-vargas/amp-plugins/skills/<name>
```

The `amp-cli-proxy-api` skill includes a keep-alive plugin as a template. Its `scripts/scaffold.sh` installs that plugin into the host project; do not install it with `amp plugins add`.

## Install

Requires the [Amp CLI](https://ampcode.com/manual#get-started) (binary install; plugins need the native CLI).

### One plugin (recommended)

```bash
amp plugins add \
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

Re-run `amp plugins add <url>` or replace the local file with the latest version. Amp currently restricts automatic updates to allowed Amp-hosted plugin URLs, so raw GitHub plugins update manually.

## Layout

```text
amp-plugins/
  plugins/     # plugin entry points
  skills/      # agent skills (SKILL.md plus bundled files)
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
