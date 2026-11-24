#!/bin/bash
# Replays one ~5-minute study sitting in the real Obsidian app, so a change can be checked against
# what a student actually does: real keystrokes over CDP (tagged input.type, like typing), a real
# clock, the plugin as installed. Writes a fresh practice sheet first, then studies it: LaTeX,
# a /20-vs-/21 mistake fixed after a long pause, a changed answer, a marked question, a detour.
#
#   scripts/replay-session.sh "<vault name>"      then read: get_recap over <vault>/.study-trace
#
# Needs Obsidian running with the vault open and the plugin enabled. Don't touch it meanwhile.
set -eo pipefail
VAULT="${1:?usage: replay-session.sh <vault name>}"
O=/Applications/Obsidian.app/Contents/MacOS/obsidian
# The CLI prints, then hangs: give every call a deadline.
w(){ perl -e 'alarm 20; exec @ARGV' "$O" vault="$VAULT" "$@" 2>&1 | grep -vE "Loading updated|installer is out of date" || true; }
log(){ echo "[$(date +%H:%M:%S)] $*"; }
# Put the cursor at the end of the first line containing $1 (after the line containing $2, if given).
goto(){ w eval code="const e=app.workspace.activeEditor.editor; const L=e.getValue().split('\n'); const s=Math.max(0,L.findIndex(l=>l.includes('$2'))); const i=L.findIndex((l,k)=>k>=s&&l.includes('$1')); e.focus(); e.setCursor({line:i,ch:L[i].length}); i" >/dev/null; }
# Type like a person: word by word.
type(){ for word in $1; do w dev:cdp method=Input.insertText params="$(python3 -c 'import json,sys;print(json.dumps({"text":sys.argv[1]+" "}))' "$word")" >/dev/null; sleep 0.$((RANDOM%4+2)); done; }
raw(){ w dev:cdp method=Input.insertText params="$(python3 -c 'import json,sys;print(json.dumps({"text":sys.argv[1]}))' "$1")" >/dev/null; }
enter(){ raw $'\n'; sleep 0.4; }
backspace(){ for ((k=0;k<$1;k++)); do w dev:cdp method=Input.dispatchKeyEvent params='{"type":"rawKeyDown","key":"Backspace","code":"Backspace","windowsVirtualKeyCode":8}' >/dev/null; done; }
# Select from text $1 to end of its line, then delete it with one Backspace.
erase_from(){ w eval code="const e=app.workspace.activeEditor.editor; const c=e.getCursor(); const l=e.getLine(c.line); const a=l.indexOf('$1'); e.setSelection({line:c.line,ch:a},{line:c.line,ch:l.length}); a" >/dev/null; backspace 1; }
tick(){ w eval code="const e=app.workspace.activeEditor.editor; const L=e.getValue().split('\n'); const s=L.findIndex(l=>l.includes('$2')); const i=L.findIndex((l,k)=>k>=s&&l.includes('$1')); const cb=[...document.querySelectorAll('.workspace-leaf.mod-active .task-list-item-checkbox')].find(x=>x.closest('.cm-line')?.textContent.includes('$1')); cb&&cb.click(); String(!!cb)" ; }
think(){ log "thinking $1s"; sleep "$1"; }

ROOT="$(w eval code="app.vault.adapter.basePath" | sed 's/^=> //')"
NOTE="Courses/CS-410 Subnetting Practice.md"
mkdir -p "$ROOT/Courses"
cat > "$ROOT/$NOTE" <<'SHEET'
# CS-410 · Subnetting practice

Exam Wed. No calculator — show the math.

## Key formulas
- Addresses in a /n block:
- Usable hosts:
- Block size:

## Problem 1 — 192.168.10.0/26
- [ ] Usable hosts per subnet
- [ ] All the network addresses

Work:

## Problem 2 — Which subnet holds 172.16.45.200/20?
- [ ] Network address
- [ ] Broadcast address

Work:

## Problem 3 — VLSM
Carve 10.0.0.0/24 into subnets for 50, 25 and 10 hosts.

Work:

## Misses
SHEET
OTHER="Courses/Detour.md"
printf '# Detour\n\nSomething else to look at.\n' > "$ROOT/$OTHER"
sleep 2

# Obsidian only counts stalls while its window has focus; pretend it does.
w dev:cdp method=Emulation.setFocusEmulationEnabled params='{"enabled":true}' >/dev/null
log "open note"; w open path="$NOTE" >/dev/null; sleep 2
think 12   # read the sheet

log "formulas"
goto "Addresses in a /n block:"; raw " "; type '$2^{32-n}$'; sleep 1
goto "Usable hosts:"; raw " "; type '$2^{32-n} - 2$ (lose the network + broadcast address)'; think 6
goto "Block size:"; raw " "; type '$256 -$ the mask octet, e.g. /26 → $256 - 192 = 64$'; think 4

log "problem 1"
goto "Work:" "Problem 1"; enter; type '/26 → $32 - 26 = 6$ host bits → $2^6 = 64$ addresses → $64 - 2 = 62$ usable.'; think 3
tick "Usable hosts per subnet"; sleep 2
goto "62 usable"; enter; type 'Networks step by 64: .0, .64, .128, .192'; think 3
tick "All the network addresses"; sleep 2

log "problem 2 — the /20 vs /21 mistake"
goto "Work:" "Problem 2"; enter; type '/20 = 255.255.248.0 so block size $256 - 248 = 8$ in the 3rd octet.'; sleep 1
enter; type '45 sits in 40–47 → network 172.16.40.0'; think 8
goto "network 172.16.40.0"; think 55     # parked here, unsure — stall
log "realises 248 is /21"
goto "/20 = 255.255.248.0"; erase_from "/20"; sleep 1
type '/20 = 20 bits = 8 + 8 + 4 → 3rd octet $11110000_2 = 240$ → 255.255.240.0, block $256 - 240 = 16$.'; think 4
goto "network 172.16.40.0"; erase_from "45 sits"; sleep 1
type '45 sits in 32–47 → network 172.16.32.0'; think 3
enter; type 'Broadcast = last address in the block: 172.16.47.254'; think 6
goto "172.16.47.254"; backspace 7; sleep 2; type '47.255'; think 2   # change of mind: .254 is the last host, not broadcast
tick "Network address" "Problem 2"; sleep 1; tick "Broadcast address" "Problem 2"; sleep 2

log "problem 3 — VLSM, stuck then asks"
goto "Work:" "Problem 3"; enter; type '50 hosts → need $2^h - 2 \ge 50$ → $h = 6$ → /26 (64)'; think 50
enter; type 'do I always give out the biggest subnet first?'
w eval code="app.commands.executeCommandById('study-trace:ask-here')" >/dev/null; think 15
enter; type '(yes — biggest first keeps every block aligned)'; enter
type '10.0.0.0/26 for 50 · 10.0.0.64/27 for 25 · 10.0.0.96/28 for 10'; think 5
enter; type '25 hosts: $2^5 - 2 = 30 \ge 25$ ✓ · 10 hosts: $2^4 - 2 = 14 \ge 10$ ✓'; think 4

log "detour"
w open path="$OTHER" >/dev/null; sleep 2; think 10
w eval code="const e=app.workspace.activeEditor.editor; e.focus(); e.setCursor({line:e.lastLine(),ch:e.getLine(e.lastLine()).length}); 'ok'" >/dev/null
enter; type 'subnetting shows up in the CS-410 exam too'; sleep 3

log "back to CS-410, misses"
w open path="$NOTE" >/dev/null; sleep 2
goto "## Misses"; enter; type '- Mixed up /20 and /21: /20 → 240, /21 → 248. Count the bits, do not guess.'; enter
type '- Broadcast is the last address (.255 of the block), not the last host.'; sleep 3
log "close"; w open path="$OTHER" >/dev/null; sleep 4
w dev:cdp method=Emulation.setFocusEmulationEnabled params='{"enabled":false}' >/dev/null
w dev:errors | head -3
log done
