# What an agent reads

Real output of the MCP server after a test sitting in Obsidian (Nov 24, 2026): Claude drove the real app with real keystrokes and a real clock, studying `CS-410 Subnetting Practice.md` as a student would — LaTeX formulas, three subnetting problems, a /20-vs-/21 mistake fixed after a long pause, a broadcast address changed, a marked question, a detour to another note.

## list_sittings

```
- obsidian-96037358-8b04-4f73-adbe-7629af5d27c7 · Nov 24, 12:13 AM · 0:26 · Courses/CS-410 Subnetting Practice.md · 2 edits · 0 questions · longest pause 0s
- obsidian-6f3d3b7d-3c39-4ffb-b047-7f608d141225 · Nov 24, 12:12 AM · 0:22 · Courses/CS-325 Midterm Practice.md · 1 edits · 0 questions · longest pause 12s
- obsidian-b9a61cca-bcd7-4014-9ede-7c073bc57d46 · Nov 24, 12:07 AM · 5:11 · Courses/CS-410 Subnetting Practice.md · 24 edits · 1 questions · longest pause 63s
```

## get_recap

```
## Courses/CS-410 Subnetting Practice.md · Nov 24, 12:07 AM · 5:11 · session obsidian-b9a61cca-bcd7-4014-9ede-7c073bc57d46
[0:00] opened the note (get_notes_at at "0:00" shows it as it was)
[0:00–0:14] the top of the page · 14s without typing · cursor on no line 14s · on screen: “CS-410 · Subnetting practice” to “Misses”
[0:15] “Key formulas” · “Addresses in a /n block:” → “Addresses in a /n block: $2^{32-n}$”
[0:23] “Usable hosts:” → “Usable hosts: $2^{32-n} - 2$ (lose the network + broadcast address)”
[0:36] “Block size:” → “Block size: $256 -$ the mask octet, e.g. /26 → $256 - 192 = 64$”
[0:53] “Problem 1 — 192.168.10.0/26” · wrote “/26 → $32 - 26 = 6$ host bits → $2^6 = 64$ addresses → $64 - 2 = 62$ usable.”
[0:56] ticked “Usable hosts per subnet”
[1:03] wrote “Networks step by 64: .0, .64, .128, .192”
[1:06] ticked “All the network addresses”
[1:17] “Problem 2 — Which subnet holds 172.16.45.200/20?” · wrote “/20 = 255.255.248.0 so block size $256 - 248 = 8$ in the 3rd octet.”
[1:23] wrote “45 sits in 40–47 → network 172.16.40.0”
[1:23–2:26] 63s without typing · cursor on “45 sits in 40–47 → network 172.16.40.0” 63s · on screen: “CS-410 · Subnetting practice” to “Misses”
[2:27] deleted the line “/20 = 255.255.248.0 so block size $256 - 248 = 8$ in the 3rd octet.”
[2:42] wrote “/20 = 20 bits = 8 + 8 + 4 → 3rd octet $11110000_2 = 240$ → 255.255.240.0, block $256 - 240 = 16$.”
[2:46] deleted the line “45 sits in 40–47 → network 172.16.40.0”
[2:51] wrote “45 sits in 32–47 → network 172.16.32.0”
[2:59] wrote “Broadcast = last address in the block: 172.16.47.254”
[3:07] “Broadcast = last address in the block: 172.16.47.254” → “Broadcast = last address in the block: 172.16.47.255”
[3:11] ticked “Network address”
[3:13] ticked “Broadcast address”
[3:25] “Problem 3 — VLSM” · wrote “50 hosts → need $2^h - 2 \ge 50$ → $h = 6$ → /26 (64)”
[3:25–4:15] 50s without typing · cursor on “50 hosts → need $2^h - 2 \ge 50$ → $h = 6$ → /26 (64)” 50s · on screen: “CS-410 · Subnetting practice” to “Misses”
[4:21] wrote “do I always give out the biggest subnet first?”
[4:21] marked a question: “do I always give out the biggest subnet first?”
[4:21–4:36] 15s without typing · cursor on “do I always give out the biggest subnet first?” 15s · on screen: “CS-410 · Subnetting practice” to “Misses”
[4:48] wrote “(yes — biggest first keeps every block aligned)”
[4:48] wrote “10.0.0.0/26 for 50 · 10.0.0.64/27 for 25 · 10.0.0.96/28 for 10”
[5:07] wrote “25 hosts: $2^5 - 2 = 30 \ge 25$ ✓ · 10 hosts: $2^4 - 2 = 14 \ge 10$ ✓”
[5:11] end

## Courses/CS-325 Midterm Practice.md · Nov 24, 12:12 AM · 0:22 · session obsidian-6f3d3b7d-3c39-4ffb-b047-7f608d141225
[0:00] opened the note (get_notes_at at "0:00" shows it as it was)
[0:00–0:12] the top of the page · 12s without typing · cursor on no line 12s · on screen: “**Missed / notes:**” to “| 2026-09-30 | (start here) |…”
[0:19] “Session log” · wrote “review: subnetting shows up in the CS-410 exam too”
[0:22] end

## Courses/CS-410 Subnetting Practice.md · Nov 24, 12:13 AM · 0:26 · session obsidian-96037358-8b04-4f73-adbe-7629af5d27c7
[0:00] opened the note (get_notes_at at "0:00" shows it as it was)
[0:23] “Misses” · wrote “Mixed up /20 and /21: /20 → 240, /21 → 248. Count the bits, do not guess.”
[0:23] wrote “Broadcast is the last address (.255 of the block), not the last host.”
[0:26] end
```

## get_notes_at — 2:20 into the main sitting (Problem 2 while the mistake stood)

```markdown
## Problem 2 — Which subnet holds 172.16.45.200/20?
- [ ] Network address
- [ ] Broadcast address
Work:
/20 = 255.255.248.0 so block size $256 - 248 = 8$ in the 3rd octet. 
45 sits in 40–47 → network 172.16.40.0 

```
