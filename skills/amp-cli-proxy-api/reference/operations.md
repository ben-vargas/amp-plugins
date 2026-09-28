# Operations

Run in the host orb from the repository root (`~/workspace/repo`).

| Task | Command |
|---|---|
| Status | `.agents/cliproxy-host status` |
| Deploy the latest source | `.agents/cliproxy-host update` |
| Refresh the skill from its published source | `.agents/cliproxy-host skill` |
| Apply new skill templates to the host files | `.agents/cliproxy-host skill`, then `bash .agents/skills/amp-cli-proxy-api/scripts/scaffold.sh --force .`, then commit and push |
| Follow logs | `sudo journalctl -u amp-svc-cliproxy -f` |
| Recent logs | `amp orb service logs cliproxy -n 200` |
| Routed requests and models | `sudo journalctl -u amp-svc-cliproxy \| grep 'Use OAuth'` |
| Restart the proxy | `amp orb service restart cliproxy` |
| Resource use | `amp orb system-metrics <thread-id>`, `free -m`, `uptime` |
| Log in another provider | `bin/cli-proxy-api --codex-device-login`, `--xai-login`, … (Amp supports ChatGPT and Grok subscriptions natively, so this is rarely useful) |

Observed on `a1.small` while serving Claude Opus for active Amp threads: load average about
0.07, about 700 MB of 3.9 GB in use (proxy about 125 MB, `tailscaled` about 90 MB, Amp about
230 MB). Request time is dominated by the model, typically 7–15 seconds.

`config.yaml` is hot-reloaded for in-place edits, but an edit that replaces the file (for
example `sed -i`) may not be noticed; restart the service after such edits.

## Replacing or moving the host

Any thread routed through the proxy loses its model while the proxy is down, including the
thread doing the work. Order:

1. The user deactivates the Custom URL connection in Amp Model Routing (threads fall back to
   Amp) or you do it with `manage_amp` `model_providers` `deactivate`.
2. Start a new orb thread in the project and let setup finish.
3. On the old host, run `.agents/cliproxy-host disable`, preferably from its Amp Terminal tab.
   Over Tailscale SSH the session drops as the node leaves (the teardown still finishes). Then
   have the user confirm the old machine is gone from the Tailscale Machines page and remove it
   there if it lingers; otherwise the new node joins as `<hostname>-1`.
4. On the new host, run `enable`, then the Claude login. If the node still came up as
   `<hostname>-1`, remove the old machine and run `.agents/cliproxy-host reclaim`.
5. When `https://<hostname>.<tailnet>.ts.net/healthz` answers from outside, reactivate the
   connection. The URL and key are unchanged.

Moving to another Amp project changes the project ID: update the trust credential's subject and
`project_id` claim, and copy the variables and secret to the new project.
