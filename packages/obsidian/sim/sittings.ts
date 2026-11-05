/**
 * Three sittings on the owner's real coursework, the way a student would actually work them:
 * thinking pauses, typos, a wrong answer, a stall, a marked question, a rewrite.
 *
 *   node dist-sim/sittings.mjs "<vault>"
 */
import { Student } from "./simulate";

const vault = process.argv[2];
if (!vault) throw new Error("usage: sittings.mjs <vault>");
const CS410 = "Courses/CS-410 Midterm Practice.md";
const CS325 = "Courses/CS-325 Midterm Practice.md";

// 1 · CS-410, an evening: addressing. Gets the /28 network wrong, stalls, asks, fixes it.
{
  const s = await new Student(vault, CS410, new Date("2026-10-27T19:12:00"), 11).open();
  s.wait(20); // reading the "How to use" block
  s.goTo("**Say it:**", "### Subnet mask")
    .type(
      " a mask says which bits are the network part. /24 = first 24 bits, so 192.168.1.0/24 has hosts .1 to .254.",
    )
    .wait(12);
  s.goTo("**Say it:**", "### Broadcast address")
    .type(" broadcast is the first address in the subnet, so for 10.0.0.0/24 it's 10.0.0.0.")
    .wait(25) // re-reads it, unsure
    .eraseFrom("the first address")
    .wait(6)
    .type("the last address in the subnet (all host bits 1), so for 10.0.0.0/24 it's 10.0.0.255.")
    .wait(15);
  s.goTo("**Say it:**", "### Classless IPv4 (CIDR)")
    .type(
      " CIDR = any prefix length, not just /8 /16 /24. Host bits = 32 - prefix: /24 → 8, /16 → 16, /20 → 12.",
    )
    .wait(8);
  s.goTo("**Missed / notes:**", "### Classless IPv4 (CIDR)")
    .type(
      " 203.0.113.45/28: 4 host bits so blocks of 16. Network is 203.0.113.40 because 45 rounds down to 40.",
    )
    .stall(65) // something's off; staring at it
    .ask("is 203.0.113.40 right for the /28 network? blocks of 16 but 40 isn't a multiple of 16")
    .wait(40) // reading the answer
    .eraseFrom("203.0.113.40")
    .type(
      "203.0.113.32 — blocks start at multiples of 16 and 32 <= 45 < 48. Broadcast 203.0.113.47.",
    )
    .wait(10);
  s.goTo("**Say it:**", "### `traceroute`")
    .type(" traceroute shows each router on the path by sending packets with TTL 1, 2, 3")
    .stall(58); // can't finish the thought; leaves
  console.log(await s.close());
}

// 2 · CS-325, same evening: RAID wrong then right, the dhcpd drill stalls at step 3.
{
  const s = await new Student(vault, CS325, new Date("2026-10-27T20:05:00"), 23).open();
  s.wait(15);
  s.goTo("**Say it:**", "### RAID (0, 1, 1+0)")
    .type(
      " RAID 0 stripes for speed, no redundancy. RAID 1 mirrors, survives one disk. RAID 10 uses parity across all disks so any one disk can be rebuilt.",
    )
    .wait(30)
    .eraseFrom("RAID 10 uses parity")
    .wait(8)
    .type(
      "RAID 10 = a stripe of mirrors: survives one dead disk per mirror pair. No parity — that's RAID 5.",
    )
    .wait(12);
  s.goTo("**Drill:**", "### `systemctl` / `journalctl`")
    .newLine("  1. ")
    .type("systemctl status isc-dhcp-server: is it failed, and the last log lines")
    .newLine("  2. ")
    .type("journalctl -u isc-dhcp-server -n 50 for the full error")
    .newLine("  3. ")
    .type("then check the config")
    .stall(70)
    .ask("what exactly do I check in the dhcpd config? step 3 is vague");
  s.wait(30)
    .backspace("then check the config".length)
    .type(
      "dhcpd -t -cf /etc/dhcp/dhcpd.conf to test the config, and INTERFACESv4 in /etc/default/isc-dhcp-server",
    )
    .wait(10);
  console.log(await s.close());
}

// 3 · CS-410, next afternoon: a quick, confident review — ticks boxes, no stalls.
{
  const s = await new Student(vault, CS410, new Date("2026-10-28T15:30:00"), 37).open();
  s.wait(10);
  s.goTo("**Say it:**", "### ARP / `arp` / `ip neigh`")
    .type(" ARP maps an IP on the local network to a MAC address; ip neigh shows the cache.")
    .wait(5);
  s.tick("Practiced", "### ARP / `arp` / `ip neigh`");
  s.goTo("**Say it:**", "### DNS")
    .type(" DNS turns names into IP addresses; resolv.conf says which server to ask.")
    .wait(5);
  s.tick("Practiced", "### DNS");
  s.tick("Practiced", "### Subnet mask");
  console.log(await s.close());
}
