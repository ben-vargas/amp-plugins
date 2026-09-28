# Components

Files installed by `scripts/scaffold.sh` from `templates/`. Edit the templates, then run the
scaffold again with `--force` (it refuses to replace files that differ without it); the
repository copies are generated. The generated files must be committed, because Amp runs
`.agents/setup` and `.agents/resume` and reads `.amp/` from the repository before anything could
fetch them. To pick up template changes in a host project: `.agents/cliproxy-host skill`, then
`bash .agents/skills/amp-cli-proxy-api/scripts/scaffold.sh --force .`, then commit and push.

| Repository path | Template | Purpose |
|---|---|---|
| `.agents/setup` | `templates/agents/setup` | Runs for new orbs and project snapshots: `cliproxy-host skill` (installs the published skill; a failure only warns), `cliproxy-host fetch`, installs the Go version from the source's `go.mod` into `/usr/local/go` (symlinked into `/usr/local/bin`), `cliproxy-host build`, npm-installs Claude Code, installs Tailscale from its Debian repository and leaves `tailscaled` disabled with a fresh state. Also writes a systemd drop-in with `TS_ASSUME_NETWORK_UP_FOR_TEST=true`, because E2B orbs expose only a link-local interface and `tailscaled` would otherwise stay in `NeedsLogin`. Idempotent: about 2–3 minutes cold, about 10 seconds warm. |
| `.agents/resume` | `templates/agents/resume` | Runs after every activation and wake; calls `cliproxy-host resume`. |
| `.agents/cliproxy-host` | `templates/agents/cliproxy-host` | Host control script (below). |
| `.amp/services.yaml` | `templates/amp/services.yaml` | Supervised `cliproxy` service on port 8317 with a `/healthz` check, command `cliproxy-host serve`. It also gets an Amp portal, which is sign-in protected and not how Amp reaches the proxy. |
| `.amp/plugins/cliproxy-host-keepalive.ts` | `templates/amp/plugins/cliproxy-host-keepalive.ts` | Every 60 s checks `~/.config/cliproxy-host/enabled`; while it exists, holds `amp.system.executor.keepAlive()`, and releases the lease when it disappears. |
| `.gitignore` entries | written by the scaffold | `/src/`, `/bin/`, `/config.yaml`, `/static/`, `/logs/`, `.amp/portals/`, `/.agents/skills/amp-cli-proxy-api/`. |
| `.agents/skills/amp-cli-proxy-api/` | this skill | Installed by `cliproxy-host skill`, not tracked in Git. The skill is maintained only where it is published. |

## `cliproxy-host` subcommands

| Command | Effect |
|---|---|
| `fetch` | Shallow clone or hard reset of `src/` to `CLIPROXY_REF` of `CLIPROXY_REPO`. |
| `build` | `fetch`, then `go build` to `bin/cli-proxy-api` with version, commit, and build date. |
| `update` | `build`, then restart the `cliproxy` service. |
| `serve` | `exec bin/cli-proxy-api --config config.yaml` (service command). |
| `enable` | Build if needed; write `config.yaml`; join the tailnet; `tailscale funnel --bg 8317`; `amp orb services ensure`; restart the service if the API key changed; create the host marker. |
| `resume` | Only with the host marker: start `tailscaled`, rejoin if not `Running`, re-apply Funnel. |
| `status` | Source commit, marker, Tailscale state, Funnel config, service state. |
| `disable` | Remove the marker, stop the service, then in a separate systemd unit reset Funnel, `tailscale logout` (deletes the ephemeral node, frees the name), and disable `tailscaled`. The unit survives the Tailscale SSH session it cuts. |
| `reclaim` | Rename through `<hostname>-tmp` back to `<hostname>`, `tailscale funnel reset`, re-apply Funnel. For a node that joined as `<hostname>-1` after the old machine is removed. |
| `skill` | Sparse-clone `skills/amp-cli-proxy-api` from `CLIPROXY_SKILL_REF` of `CLIPROXY_SKILL_REPO` and replace `.agents/skills/amp-cli-proxy-api/` with it. |

`enable` and `resume` join with:

```
tailscale up --reset --client-id="$TS_CLIENT_ID?ephemeral=true&preauthorized=true" \
  --id-token="$(amp orb id-token --audience "$TS_AUDIENCE" --subject-scope project)" \
  --advertise-tags="$CLIPROXY_TS_TAG" --hostname="$CLIPROXY_TS_HOSTNAME" --accept-dns=false --ssh
```

The node is ephemeral: Tailscale removes it 30–60 minutes after it goes offline, and `resume`
rejoins after a wake.

## Environment

| Name | Kind | Required | Meaning |
|---|---|---|---|
| `CLIPROXY_API_KEY` | secret | yes | Written into `config.yaml` `api-keys`; Amp sends it as a bearer token. |
| `TS_CLIENT_ID` | env | yes | Trust credential client ID. |
| `TS_AUDIENCE` | env | yes | Trust credential audience. |
| `CLIPROXY_REPO` | env | no | Source repository (default upstream CLIProxyAPI). Must clone without credentials. |
| `CLIPROXY_REF` | env | no | Branch or tag (default `main`). |
| `CLIPROXY_TS_HOSTNAME` | env | no | Tailscale hostname (default `amp-cli-proxy-api`). |
| `CLIPROXY_TS_TAG` | env | no | Tailscale tag (default `tag:amp-cli-proxy-api`). |
| `CLIPROXY_SKILL_REPO` | env | no | Repository holding the published skill at `skills/amp-cli-proxy-api` (default `https://github.com/ben-vargas/amp-plugins`). Must clone without credentials. |
| `CLIPROXY_SKILL_REF` | env | no | Branch or tag of the skill repository (default `main`). |

## Runtime files in the host orb

- `config.yaml` (mode 600): created from `src/config.example.yaml` with `debug: true`; later
  `enable` runs only replace the `api-keys` list and keep other edits.
- `~/.cli-proxy-api/`: provider OAuth credentials from the login command.
- `~/.config/cliproxy-host/enabled`: host marker.
- Logs: systemd journal unit `amp-svc-cliproxy` (no log files by default).
