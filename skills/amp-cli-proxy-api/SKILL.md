---
name: amp-cli-proxy-api
description: "Sets up CLIProxyAPI in an always-on Amp orb, exposed publicly through Tailscale Funnel, so Amp threads can route Claude models through the user's Claude subscription with a Custom URL model-routing connection. Shepherds the user through the Amp project, Tailscale tag, OIDC trust credential and policy, secrets, Claude OAuth login, and Amp model routing. Use when asked to set up, rebuild, move, or operate an amp-cli-proxy-api orb host, or to run CLIProxyAPI in an orb for Amp."
---

# amp-cli-proxy-api

Builds an Amp project whose orb runs [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
around the clock and publishes it at `https://<hostname>.<tailnet>.ts.net/v1`. Amp then sends
Claude requests there through a Custom URL connection, and CLIProxyAPI serves them with the
user's Claude subscription (OAuth login).

```
Amp servers ──HTTPS──▶ Tailscale Funnel ──▶ orb: tailscaled ──▶ cli-proxy-api :8317 ──▶ Anthropic
```

Why it is built this way (do not redesign without a reason):

- Amp calls Custom URL connections from its own servers, so the endpoint must be public.
  Orb ports are not public, and orb portals need an Amp sign-in or an expiring "Make Public".
- Tailscale Funnel gives a stable name, real TLS, and streaming. Cloudflare Quick Tunnels do
  not support SSE and change URL on every run.
- Orbs pause when idle and a running service does not keep one awake. A bundled Amp plugin holds
  a keep-alive lease, but only on the one orb marked as the host.
- The orb joins the tailnet with Amp workload identity (OIDC), so no Tailscale key is stored.
- Every orb of the project installs Tailscale, but only the host orb starts it.

## How to guide the user

The user has to click through the Tailscale and Amp consoles. Your job is to make that easy.

- One step per message. Give the exact values to enter in code blocks, then wait. Do not dump
  the whole procedure at once.
- Ask for a screenshot when the user is unsure or a step fails; read it and point at the
  exact field to change.
- Never ask the user to paste a secret into the conversation. Create secrets with
  `manage_amp` (topic `secrets`, operation `set`), which opens a masked dialog. Non-secret
  identifiers (Tailscale client ID and audience) are fine to paste.
- Do everything you can yourself (project creation, repository files, variables, commands,
  verification) and only hand the user what needs their accounts or browser.
- Verify each result with a command before moving on, and say what you verified.
- Surface choices you made for the user (names, orb size, models) so they can veto them.

## Requirements (check first)

1. **Amp Custom URL connections.** Call `manage_amp` topic `model_providers` operation `list`;
   `model_provider_custom_url` must be in `availableTypes`. If it is not, stop: the user's plan
   cannot route to a Custom URL yet.
2. **Amp orbs** for the account.
3. **A Tailscale account** where the user is an admin (the free plan works) with HTTPS
   certificates enabled (admin console → DNS → HTTPS Certificates). MagicDNS must be on.
4. **A Claude Pro or Max subscription** to log in with. Using a subscription through a proxy
   is the user's decision under Anthropic's terms; mention it once, neutrally.
5. **Cost.** The host orb never pauses: about $0.17/hour on `a1.small` (about $124/month).

## Values to collect

Ask only when needed, and propose defaults.

| Value | Default | Where it goes |
|---|---|---|
| Amp project | new personal Amp-hosted project `amp-cli-proxy-api` | step 1 |
| Orb size | `a1.small` | project setting `environment_resource` |
| CLIProxyAPI source | `https://github.com/router-for-me/CLIProxyAPI`, `main` | env `CLIPROXY_REPO`, `CLIPROXY_REF` (only if different; must be publicly clonable) |
| Tailscale hostname | `amp-cli-proxy-api` | env `CLIPROXY_TS_HOSTNAME` (only if different) |
| Tailscale tag | `tag:amp-cli-proxy-api` | env `CLIPROXY_TS_TAG` (only if different) |
| Trust credential client ID and audience | from step 3 | env `TS_CLIENT_ID`, `TS_AUDIENCE` |
| Proxy API key | user generates | secret `CLIPROXY_API_KEY` |
| Models to route | Claude models the proxy lists | Custom URL model mapping |

## Workflow

### 1. Create the project repository

1. Create the project. Strongly prefer a new, dedicated repository: the host files own
   `.agents/setup`, `.agents/resume`, and `.amp/services.yaml`. Use `manage_amp` topic
   `projects` operation `create` with `owner: personal`, `repository_mode: amp-hosted`, and
   `name`; set the orb size with operation `update` and `environment_resource`. Use an existing
   repository only if the user insists.
2. If the user wants a non-default source, hostname, or tag, store those `CLIPROXY_*`
   environment variables now (step 4 has the tool call), before any orb of the project starts.
   Setup builds from whatever source is set when it runs.
3. Clone the repository outside the current one: `amp clone <repository-url> <dir>` for
   Amp-hosted repositories, `git clone` otherwise.
4. Install the host files: `bash <this-skill>/scripts/scaffold.sh <dir>`. It writes
   `.agents/setup`, `.agents/resume`, `.agents/cliproxy-host`, `.amp/services.yaml`,
   `.amp/plugins/cliproxy-host-keepalive.ts`, copies this skill into
   `.agents/skills/amp-cli-proxy-api/`, and adds `.gitignore` entries. If it exits 3, some of
   those files already exist with other content; nothing was changed. Show the user the list.
   Either merge by hand (keep their setup steps and services, add ours) or, only with their
   explicit approval, rerun with `--force` to replace them.
5. Offer to add a short `README.md` for the user's deployment (project, tailnet, hostname,
   URL); fill it in as values become known.
6. Commit. Ask before pushing, then push. Orbs only use files on the default branch.

Read `reference/components.md` if you need to explain or change what these files do.

### 2. Work out the OIDC subject

Run `amp projects get <namespace/name>` for the project ID and owner. The subject Tailscale
must match is:

- personal project: `user:<owner-user-id>:project:<project-id>`
- workspace project: `workspace:<workspace-id>:project:<project-id>`

The owner line of `amp projects get` is `user:<id>` or a workspace. When in doubt, decode
`sub` from `amp orb id-token --audience test --subject-scope project` inside an orb of that
project. An orb started for this is fine to reuse as the host later; step 5 covers it.

### 3. Walk the user through Tailscale

Follow `reference/tailscale-walkthrough.md` step by step: create the tag, create the OIDC trust
credential, allow Funnel for the tag, and optionally allow SSH. Collect the client ID and
audience at the end.

### 4. Store project settings

- `manage_amp` topic `environment_variables` operation `set`, scope `project`: `TS_CLIENT_ID`,
  `TS_AUDIENCE`, and any non-default `CLIPROXY_*` values from the table not already set in
  step 1.
- `manage_amp` topic `secrets` operation `set`, scope `project`, name `CLIPROXY_API_KEY`.
  Before opening the dialog, suggest generating a value with
  `echo "sk-$(openssl rand -hex 20)"` and keeping it for step 8.

### 5. Start the host orb

The host must be an orb thread of this project, started after the files were pushed so setup
ran. If you are not in one, create one with `create_thread` (executor `orb`, the project) and a
prompt asking it to use the `amp-cli-proxy-api` skill and continue from step 5. The skill is in
that repository, so the new thread has it.

In the host orb, from the repository root:

1. If any settings were added or changed after the orb started, run
   `amp orb restart-processes`. If `CLIPROXY_REPO` or `CLIPROXY_REF` changed after the orb
   started, then also run `.agents/setup` so the Go version and binary match the new source
   (`enable` only builds when `bin/cli-proxy-api` is missing).
2. Check the variables exist without printing values:
   `for v in TS_CLIENT_ID TS_AUDIENCE CLIPROXY_API_KEY; do [ -n "${!v:-}" ] && echo "$v set" || echo "$v missing"; done`
3. Run `.agents/cliproxy-host enable`. Success ends with `Custom URL base: https://…/v1` and
   `enabled: this orb is the CLIProxyAPI host and will be kept awake`.
4. On failure, see `reference/troubleshooting.md`. A 403 token exchange almost always means a
   trust-credential field mismatch; ask the user for a screenshot of the credential page, which
   shows the failing claim.

### 6. Log in to Claude

Ask the user to open the thread's **Terminal** tab (it is inside the orb) and run:

```bash
cd ~/workspace/repo && bin/cli-proxy-api --claude-login --no-browser
```

Explain before they start: open the printed claude.ai URL, approve, and the browser will fail
to load `http://localhost:54545/callback?code=…`. Copy that whole URL from the address bar and
paste it at the `Paste the Claude callback URL` prompt. The prompt only appears about 15 seconds
after `Waiting for Claude authentication callback...`; until then the command looks stuck, so
tell the user to wait for it. Ignore the SSH tunnel text. Do not press Ctrl-Z (a suspended
process cannot finish the login); if they already did, `fg` resumes it.

Verify: `ls ~/.cli-proxy-api/claude-*.json` exists, and
`curl -s -H "Authorization: Bearer $CLIPROXY_API_KEY" localhost:8317/v1/models | jq '.data | length'`
is greater than 0. Do not print the auth file.

### 7. Verify the public endpoint

New Funnel names can take about 10 minutes to appear in public DNS. Check with public
resolvers, not the `ts.net` authoritative servers (their direct answers were unreliable):

```bash
H=<hostname>.<tailnet>.ts.net
for r in 8.8.8.8 1.1.1.1; do dig +short @$r $H A; done
curl -s https://$H/healthz                                              # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' https://$H/v1/models           # 401
curl -sN -H "Authorization: Bearer $CLIPROXY_API_KEY" -H 'content-type: application/json' \
  https://$H/v1/messages -d '{"model":"claude-haiku-4-5-20251001","max_tokens":20,"stream":true,"messages":[{"role":"user","content":"Reply with just: ok"}]}'
```

The stream must show `message_start`, an `"ok"` delta, and `message_stop`. Before DNS is ready
you can test the path with `curl --resolve $H:443:<ip>` using an IP that another Funnel name
in the same tailnet resolves to.

### 8. Connect Amp model routing

Ask which Claude models to route. List the proxy's model IDs with `/v1/models`; map each Amp
canonical ID to the same ID, for example:

```
anthropic/claude-opus-5-5 -> claude-opus-5-5
anthropic/claude-haiku-4-5-20251001 -> claude-haiku-4-5-20251001
```

Use `manage_amp` topic `model_providers`:

1. `create` with `type: model_provider_custom_url`, `target: user` (or `workspace` if the user
   wants it for all members), a `name`, and `config` with
   `baseURL: https://<hostname>.<tailnet>.ts.net/v1`, `apiFormat: anthropic-messages`, and
   `modelMapping`. Omit `api_key`; the user enters `CLIPROXY_API_KEY` in the masked dialog.
   Keep the returned connection ID and report any warnings.
2. `test` that connection ID.
3. `activate` it. New connections can start inactive, and inactive ones are skipped.
4. Run `list`. Personal connections are tried before workspace ones, then by priority. If
   another active connection that maps the same models would be tried first, use
   `set_priority` (0 is first) or ask the user whether to change that connection.
5. Run `amp config model-providers check-access --provider-model anthropic/<model>` and confirm
   the connection that served it is the new connection ID, not just that inference worked.

In the host orb, `sudo journalctl -u amp-svc-cliproxy | grep 'Use OAuth'` shows each routed
request with its model (debug logging is on by default).

### 9. Hand over

Tell the user, briefly: the base URL, how to SSH (`ssh user@<hostname>` from a tailnet device,
if the SSH rule was added), where logs are, how to update (`.agents/cliproxy-host update`), the
cost, and that archiving the host thread takes the proxy offline. Point to
`reference/operations.md` for replacing the host.

## Safety rules

- Threads routed through this proxy lose their model while it is down. Never run
  `.agents/cliproxy-host disable`, stop the `cliproxy` service, or stop `tailscaled` from such a
  thread unless the user first deactivated the Custom URL connection.
- Never print `config.yaml`, `~/.cli-proxy-api/*.json`, `CLIPROXY_API_KEY`, or ID tokens.
- Never authenticate anything in `.agents/setup`; its output is shared through snapshots.
- Only one node can hold the hostname. Disable the old host before enabling a new one.
