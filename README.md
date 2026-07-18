# amp-plugins

Amp plugins for personal use, shared in case they help others.

Amp extends via TypeScript [plugins](https://ampcode.com/manual#plugins).

## Plugins

| Plugin | Description |
|--------|-------------|
| — | No plugins yet |

Each plugin is a single `.ts` file under [`plugins/`](./plugins/).

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

Plugins installed with `--auto-update` refresh when Amp loads plugins, if the file includes an `@amp-plugin` directive pointing at the source URL. Manual update:

```bash
amp plugins update
```

## Layout

```text
amp-plugins/
  plugins/     # one .ts file per plugin
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

For auto-update support after `amp plugins add --auto-update <url>`, include:

```ts
// @amp-plugin updated automatically from https://raw.githubusercontent.com/ben-vargas/amp-plugins/main/plugins/<name>.ts
```

See the [Amp plugin guide](https://ampcode.com/manual#plugins) and [Plugin API reference](https://ampcode.com/manual/plugin-api).

## Security

Plugins run with full local access. Only install plugins you trust; review source before adding third-party files.
