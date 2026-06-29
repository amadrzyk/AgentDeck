# Stream Deck → new Warp window in the slack repo

`open-warp-slack.sh` opens a **new Warp window** already `cd`'d into
`~/src/slack-github.com/slack`.

It uses Warp's **launch-configuration + URI scheme** (`warp://launch/slack`) instead of
synthesized keystrokes — so there is **no Accessibility permission** and no `delay`/timing
guesswork. The window opens directly in the target directory.

## Run it standalone

```bash
bash scripts/streamdeck-open/open-warp-slack.sh
```

(It writes `~/.warp/launch_configurations/slack.yaml` on first run, then opens the window.)

## Wire it to a Stream Deck key

Stream Deck's **System → Open** action launches a file with its *default app*:
- a `.sh` opens in your editor (does not run),
- a `.command` runs but leaves a lingering Terminal window.

So build the small `.app` wrapper, which runs the script with **no Terminal window** and
no Accessibility permission:

```bash
bash scripts/streamdeck-open/build-app.sh   # → ~/Applications/OpenWarpSlack.app
```

Then in Stream Deck: **System → Open**, set **App/File** to:

```
/Users/<you>/Applications/OpenWarpSlack.app
```

(The Stream Deck file picker does not expand `~`; browse to your home folder →
Applications → OpenWarpSlack.app, or paste the full path.)

## Customize

Edit `TARGET_DIR` in `open-warp-slack.sh` (or the generated
`~/.warp/launch_configurations/slack.yaml`) to change the directory. No need to rebuild
the `.app` — it just calls the script.
