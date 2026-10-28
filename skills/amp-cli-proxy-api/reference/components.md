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
| `.agents/resume` | `templates/agents/resume` | Runs after every activation and wake, and also after some executor reconnects without a pause; calls `cliproxy-host resume`. Amp waits for it for up to 10 seconds, then lets it finish in the background. |
| `.agents/cliproxy-host` | `templates/agents/cliproxy-host` | Host control script (below). |
| `.amp/services.yaml` | `templates/amp/services.yaml` | Supervised `cliproxy` service on port 8317 with a `/healthz` check, command `cliproxy-host serve`. It also gets an Amp portal, which is sign-in protected and not how Amp reaches the proxy. |
| `.amp/plugins/cliproxy-host-keepalive.ts` | `templates/amp/plugins/cliproxy-host-keepalive.ts` | While `~/.config/cliproxy-host/enabled` exists, takes a fresh `amp.system.executor.keepAlive()` lease every 60 s and then drops the previous one; a failed or unanswered (30 s) attempt is retried after 10 s. The SDK alone renews every 4 minutes and only logs a failed renewal. Writes `keepalive.json` and lease events to `events.log`, and releases the lease within a minute of the marker disappearing. |
| `.gitignore` entries | written by the scaffold | `/src/`, `/bin/`, `/config.yaml`, `/static/`, `/logs/`, `.amp/portals/`, `/.agents/skills/amp-cli-proxy-api/`. |
| `.agents/skills/amp-cli-proxy-api/` | this skill | Installed by `cliproxy-host skill`, not tracked in Git. The skill is maintained only where it is published. |

## `cliproxy-host` subcommands

| Command | Effect |
|---|---|
| `fetch` | Shallow clone or hard reset of `src/` to `CLIPROXY_REF` of `CLIPROXY_REPO`. `latest` resolves to the highest stable `vX.Y.Z` tag (`git ls-remote`; suffixed tags such as `-rc1` are skipped). |
| `build` | `fetch`, then `go build` to `bin/cli-proxy-api` with the resolved tag or ref as version, commit, and build date. |
| `update` | `build`, then restart the `cliproxy` service. |
| `update-tailscale` | `apt-get install --only-upgrade tailscale`, then, if `tailscaled` still runs an older version, restart it and wait up to 5 minutes for every Funnel relay. The package cannot restart the service in an orb (E2B's `policy-rc.d` refuses), so without this the old daemon keeps running. Records the restart as a repair so the watchdog does not restart again while the second relay catches up (about 3 minutes in practice). |
| `serve` | `exec bin/cli-proxy-api --config config.yaml` (service command). |
| `enable` | Build if needed; write `config.yaml`; join the tailnet; `tailscale funnel --bg 8317`; `amp orb services ensure`; restart the service if the API key changed; create the host marker. |
| `resume` | Only with the host marker: start the watchdog if it is not running; run `connect` if `tailscaled` is stopped or not `Running`; then check `/healthz` through every Funnel relay (2 tries). Healthy: leave `tailscaled` alone. Local proxy down: leave Tailscale alone. Otherwise repair (below). |
| `status` | Source commit, binary version, marker, lease (last successful renewal, failures), watchdog (last check, last repair), last `resume` result, pause counts, Tailscale state, Funnel config, service state. |
| `watchdog` | Command of the ad-hoc supervised service `cliproxy-watchdog` (started by `enable` and `resume`, stopped by `disable`). Every `CLIPROXY_WATCHDOG_INTERVAL` seconds (120): local `/healthz`, then public `/healthz` through every relay. Two public failures in a row while local is healthy trigger a repair, but not within 10 minutes of any earlier repair, including one by `resume`. A check that runs more than 3 minutes late records a `pause` event. |
| `pauses [days]` | Lists pauses (default 7 days) from three signals: gaps over 60 s in the kernel's `clock pairing hypercall` messages (E2B logs one every 4 s, so the VM was stopped), gaps over 6 minutes in the Amp executor log `~/.cache/amp/logs/headless.log*` (the lease renewal writes to it every minute), and the watchdog's `pause` events. Kinds: `pause` (the kernel heartbeat stopped, or the watchdog overslept, which only happens while the VM is frozen; the kernel journal keeps only about 12 hours, the watchdog's events are kept), `unconfirmed` (only the executor log saw it, before the kernel journal starts), `process-gap` (the VM kept running; only the Amp CLI stopped, such as during an update). |
| `disable` | Remove the marker, stop the service, then in a separate systemd unit reset Funnel, `tailscale logout` (deletes the ephemeral node, frees the name), and disable `tailscaled`. The unit survives the Tailscale SSH session it cuts. |
| `reclaim` | Rename through `<hostname>-tmp` back to `<hostname>`, `tailscale funnel reset`, re-apply Funnel. For a node that joined as `<hostname>-1` after the old machine is removed. |
| `skill` | Sparse-clone `skills/amp-cli-proxy-api` from `CLIPROXY_SKILL_REF` of `CLIPROXY_SKILL_REPO` and replace `.agents/skills/amp-cli-proxy-api/` with it. |

A repair (`resume` or the watchdog) holds a lock so only one runs at a time. If `tailscaled`
answers and Funnel is off, it turns Funnel back on. Otherwise it restarts `tailscaled`: after a
pause it can report `Running` while its connections are dead. After a restart it waits up to 5
minutes for every relay to answer: after a long pause Tailscale has deleted the ephemeral node,
`connect` joins as a new node, and the relays took 2–4 minutes to reach it. It writes
`recovered` (with `seconds`), `tailscaled_restart`, or `recovery_failed` to `events.log` and
the repair time to `~/.config/cliproxy-host/last-repair`. A
`tailscaled` that just started reports `NoState` or `Starting` for a few seconds, so `connect`
waits for it to settle before deciding whether to join.

`enable` and `resume` join with:

```
tailscale up --reset --client-id="$TS_CLIENT_ID?ephemeral=true&preauthorized=true" \
  --id-token="$(amp orb id-token --audience "$TS_AUDIENCE" --subject-scope project)" \
  --advertise-tags="$CLIPROXY_TS_TAG" --hostname="$CLIPROXY_TS_HOSTNAME" --accept-dns=false --ssh
```

The node is ephemeral: Tailscale removes it 30–60 minutes after it goes offline, and `resume`
rejoins after a wake when the node is logged out.

## Environment

| Name | Kind | Required | Meaning |
|---|---|---|---|
| `CLIPROXY_API_KEY` | secret | yes | Written into `config.yaml` `api-keys`; Amp sends it as a bearer token. |
| `TS_CLIENT_ID` | env | yes | Trust credential client ID. |
| `TS_AUDIENCE` | env | yes | Trust credential audience. |
| `CLIPROXY_REPO` | env | no | Source repository (default upstream CLIProxyAPI). Must clone without credentials. |
| `CLIPROXY_REF` | env | no | `latest` (default: newest stable `vX.Y.Z` tag), or a tag or branch. A branch builds its tip. |
| `CLIPROXY_TS_HOSTNAME` | env | no | Tailscale hostname (default `amp-cli-proxy-api`). |
| `CLIPROXY_TS_TAG` | env | no | Tailscale tag (default `tag:amp-cli-proxy-api`). |
| `CLIPROXY_SKILL_REPO` | env | no | Repository holding the published skill at `skills/amp-cli-proxy-api` (default `https://github.com/ben-vargas/amp-plugins`). Must clone without credentials. |
| `CLIPROXY_SKILL_REF` | env | no | Branch or tag of the skill repository (default `main`). |
| `CLIPROXY_WATCHDOG_INTERVAL` | env | no | Seconds between watchdog checks (default 120). |

## Runtime files in the host orb

- `config.yaml` (mode 600): created from `src/config.example.yaml` with `debug: true`; later
  `enable` runs only replace the `api-keys` list and keep other edits.
- `~/.cli-proxy-api/`: provider OAuth credentials from the login command.
- `~/.config/cliproxy-host/enabled`: host marker.
- `~/.config/cliproxy-host/keepalive.json`: lease state written by the plugin (`holding`,
  `lastSuccessAt`, `consecutiveFailures`, `lastError`, counters since the plugin started).
- `~/.config/cliproxy-host/watchdog.json`: the watchdog's last check.
- `~/.config/cliproxy-host/events.log`: JSON lines that survive journal and log rotation
  (`lease_acquired`, `renewal_failed`, `renewal_recovered`, `lease_released`, `resume`,
  `public_down`, `tailscaled_restart`, `recovered`, `recovery_failed`, `pause`, `enabled`,
  `disabled`); trimmed to 2000 lines above 1 MB.
- Logs: systemd journal units `amp-svc-cliproxy` and `amp-svc-cliproxy-watchdog` (no log files
  by default).
