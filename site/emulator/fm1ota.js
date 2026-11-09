// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Leo Kuroshita (@kurogedelic), Hügelton Instruments
//
// The FM-1 USB-MIDI update protocol (M-UPGRADE compatible) over WebMIDI.
// Step 1: the running firmware reads parts of the package and stages the update
// loader. Step 2: the loader reads the whole image and writes it. In both steps
// the device sends cmd 0x30 read requests on the logical image and we answer.

const HS_QUERY = [0xf0, 0x00, 0x32, 0x45, 0x00, 0x00, 0x00, 0x40, 0x7f, 0xf7]
const UPGRADE = [0xf0, 0x22, 0x24, 0x35, 0x7f, 0xf7]
const MAXDATA = 512
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Every wait in the update, in ms. Tests pass shorter ones; the defaults are the ones the
// protocol was proven with on hardware.
export const TIMING = {
  settle: 2000,          // after UPGRADE, before the first read request is expected
  loaderBoot: 3000,      // after staging, before looking for the update loader
  rebootBoot: 3000,      // after the write, before looking for the new firmware
  stageIdle: 8000,       // staging gives up after this long without a request
  writeIdle: 180000,     // the write gives up after this long without a request
  loaderWait: 30000,     // how long the update loader may take to appear
  returnWait: 40000,     // how long the new firmware may take to appear
  poll: 1000,            // read / re-scan interval
  openTimeout: 5000,     // a port that does not open within this is treated as busy
  handshake: 1000,       // identity reply window per attempt
  packetGap: 10,         // pause before each data response
  backoff: 250,          // first retry delay for a failed open or send (doubles each time)
  retries: 3,
}
const within = (promise, ms) => {
  let tm
  return Promise.race([promise, new Promise((_, no) => { tm = setTimeout(() => no(new Error('timeout')), ms) })]).finally(() => clearTimeout(tm))
}
const IS_OTA = (id) => /^ota-/i.test(id.model)
// Names emitted by known FM-1 firmware USB MIDI descriptors — tried first as a fast path.
export const isCandidatePort = (name) => /fm-1|felucca|ota|composite|sinco|usb-midi|hortator/i.test(name || '')
// Community firmwares advertise arbitrary USB product names (e.g. "Matryoshka"), and WebMIDI
// exposes no VID/PID to match on — so any port that is not obviously someone else's gear is also
// worth probing. The identity handshake is the real gate: only an FM-1 answers it, and no package
// is ever written to a port that did not identify as an FM-1. This denylist just spares the user's
// other gear a harmless handshake query and keeps discovery fast.
// Kept deliberately conservative: a false match here would hide a real FM-1 whose firmware happens
// to share a token, so this lists only unmistakable non-FM-1 gear (audio interfaces, brand synths,
// MIDI loopbacks) plus the user's own connected devices. Anything not matched is simply probed —
// the handshake is harmless to gear that isn't an FM-1.
export const isKnownOtherGear = (name) => /motu|fireface|\brme\b|babyface|scarlett|focusrite|clarett|komplete (kontrol|audio)|maschine|launchpad|launchkey|arturia|keylab|minilab|\bmpk\d|novation|\broland\b|yamaha|steinberg|\bkorg\b|behringer|\bumc\d|u-?phoria|m-?audio|midisport|presonus|audiobox|loopbe|loopmidi|rtpmidi|iac driver|gs wavetable|microsoft gs|elektron|model:(cycles|samples)|digitakt|digitone|seed audio|seed midi|\bdaisy\b|pewpew|amyboard/i.test(name || '')

// Every failure carries a distinct `code` so the UI (and the user) can tell exactly what happened:
//   nomidi      - WebMIDI sees no MIDI devices at all (cable/driver/charge-only cable)
//   midiperm    - MIDI/SysEx access was denied (raised by the page, not here)
//   noport      - MIDI devices exist, but all are other gear (no FM-1-like port)
//   busy        - an FM-1-like port exists but could not be opened (another app holds it)
//   notfound    - probed port(s) but nothing answered the FM-1 identity handshake
//   model       - the connected device is a different product than the package is for
//   downloadmode- found, but the running firmware won't enter USB-MIDI update mode (use M-Flasher)
//   stopped     - the device stopped responding mid-transfer
//   lost        - the device was unplugged mid-transfer
//   badreq      - the device asked for data outside the image (corrupt package / protocol error)
//   noloader    - the update loader never appeared after staging
//   noreturn    - the device never re-enumerated after the write (power-cycle it)
//   mismatch    - the write finished but the device reports a different identity (detail: reported id)
//   inupdate    - the unit is already in update mode (an earlier install was interrupted): resume it
// `detail` carries extra context (e.g. the identity the device reported, or the ports probed).
function fail(code, msg, detail = '') {
  const e = new Error(msg)
  e.code = code
  e.detail = detail
  return e
}

export function pack7(data) {
  const out = []
  let acc = 0,
    nb = 0
  for (const b of data) {
    acc |= b << nb
    nb += 8
    while (nb >= 7) {
      out.push(acc & 0x7f)
      acc >>>= 7
      nb -= 7
    }
  }
  if (nb) out.push(acc & 0x7f)
  return out
}

export function unpack7(s) {
  const out = []
  let acc = 0,
    nb = 0
  for (const b of s) {
    acc |= (b & 0x7f) << nb
    nb += 7
    while (nb >= 8) {
      out.push(acc & 0xff)
      acc >>>= 8
      nb -= 8
    }
  }
  return out
}

function response(addr, data, fl = 0) {
  const len = data.length
  const body = [0x00, 0x59, 0x30, (len + 8) & 0xff, ((len + 8) >> 8) & 0xff, 0, fl, addr & 0xff, (addr >>> 8) & 0xff, (addr >>> 16) & 0xff, (addr >>> 24) & 0xff, len & 0xff, (len >> 8) & 0xff, 0, ...data]
  let s = 0
  for (let i = 6; i < body.length; i++) s += body[i]
  body.push(~s & 0xff)
  return [0xf0, ...pack7(body), 0xf7]
}

function parseRequest(pkt) {
  if (pkt[0] !== 0xf0 || pkt[pkt.length - 1] !== 0xf7) return null
  const u = unpack7(pkt.slice(1, -1))
  if (u.length !== 15 || u[0] !== 0 || u[1] !== 0x59 || u[2] !== 0x30) return null
  let s = 0
  for (let i = 6; i < 14; i++) s += u[i]
  if ((~s & 0xff) !== u[14]) return null
  return { fl: u[6], addr: (u[7] | (u[8] << 8) | (u[9] << 16) | (u[10] << 24)) >>> 0, len: u[11] | (u[12] << 8) | (u[13] << 16) }
}

function parseIdentity(pkt) {
  const d = unpack7(pkt.slice(1, -1))
  if (d.length !== 34 || d[0] !== 0 || d[1] !== 0x59 || d[2] !== 0x11) return null
  const txt = String.fromCharCode(...d.slice(6, 33)).replace(/\0+$/, '')
  const m = /^([^_]+)_(\d+)$/.exec(txt)
  return m ? { text: txt, model: m[1], version: parseInt(m[2], 10) } : null
}

// one MIDI in/out pair with a SysEx queue
class Link {
  constructor(input, output) {
    this.input = input
    this.output = output
    this.q = []
    this.waiter = null
    input.onmidimessage = (ev) => {
      if (ev.data[0] !== 0xf0) return
      this.q.push(Array.from(ev.data))
      if (this.waiter) {
        const w = this.waiter
        this.waiter = null
        w()
      }
    }
  }
  get lost() {
    return this.input.state === 'disconnected' || this.output.state === 'disconnected'
  }
  // false when the port is gone (unplugged): WebMIDI throws on a disconnected output
  send(bytes) {
    try {
      this.output.send(bytes)
      return true
    } catch (_) {
      return false
    }
  }
  drain() {
    this.q.length = 0
  }
  // a send that fails while the port is still present is retried with backoff (a busy USB
  // stack); false once the port is gone or every retry failed
  async sendRetry(bytes, t) {
    for (let i = 0; i < t.retries; i++) {
      if (this.send(bytes)) return true
      if (this.lost) return false
      await sleep(t.backoff * 2 ** i)
    }
    return false
  }
  async read(ms) {
    if (!this.q.length) {
      let tm
      await Promise.race([
        new Promise((r) => {
          this.waiter = r
        }),
        new Promise((r) => {
          tm = setTimeout(r, ms)
        })
      ])
      clearTimeout(tm)
      this.waiter = null
    }
    return this.q.shift() || null
  }
  close() {
    this.input.onmidimessage = null
    // Release the OS MIDI ports too. find() probes the user's other gear to locate the FM-1, so
    // leaving ports open would hold those devices' MIDI ports after every probe or failed flash.
    // Fire-and-forget: close() returns a promise we don't need, and may be absent on test doubles.
    try { this.input.close() } catch (_) {}
    try { this.output.close() } catch (_) {}
  }
}

async function handshake(link, tries, t) {
  link.drain()
  for (let n = 0; n < tries; n++) {
    if (n) await sleep(t.backoff * 2 ** (n - 1))
    if (!(await link.sendRetry(HS_QUERY, t))) return null
    const end = Date.now() + t.handshake
    while (Date.now() < end) {
      const p = await link.read(end - Date.now())
      if (!p) break
      const id = parseIdentity(p)
      if (id) return id
    }
  }
  return null
}

export class Updater {
  constructor(access, log, options = {}) {
    this.access = access
    this.log = log || (() => {})
    this.t = { ...TIMING, ...(options.timing || {}) }
  }

  // open both ports, retrying with backoff; an open that never settles counts as a failure
  async open(input, output) {
    const t = this.t
    for (let i = 0; i < t.retries; i++) {
      try {
        await within(Promise.all([input.open(), output.open()]), t.openTimeout)
        return true
      } catch (_) {
        if (input.state === 'disconnected' || output.state === 'disconnected') return false
        await sleep(t.backoff * 2 ** i)
      }
    }
    return false
  }

  // every in/out pair that answers the handshake. Candidate-named ports are tried first; if none
  // answer, any other port that is not known non-FM-1 gear is probed too, so a firmware with an
  // unexpected USB name (e.g. "Matryoshka") is still found. Only an FM-1 passes the handshake.
  // `diag`, when given, collects a one-line outcome per probed port so callers can report exactly
  // what the flasher saw and why it did not find the device.
  async find(filter, diag) {
    const outs = [...this.access.outputs.values()]
    const live = [...this.access.inputs.values()].filter((i) => i.state !== 'disconnected')
    const ordered = [
      ...live.filter((i) => isCandidatePort(i.name)),
      ...live.filter((i) => !isCandidatePort(i.name) && !isKnownOtherGear(i.name)),
    ]
    // Windows can name a device's in/out asymmetrically ("MIDIIN2 (X)" / "MIDIOUT2 (X)"), so when
    // the names don't match exactly, fall back to the output whose normalized device name is the
    // same — but only when that is unambiguous, never guessing which output a port belongs to.
    const norm = (n) => (n || '').toLowerCase().replace(/\bmidi(in|out)\d*\b/g, ' ').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
    for (const input of ordered) {
      let output = outs.find((o) => o.name === input.name)
      if (!output) {
        const key = norm(input.name)
        const same = key ? outs.filter((o) => norm(o.name) === key) : []
        output = same.length === 1 ? same[0] : (outs.length === 1 ? outs[0] : null)
      }
      if (!output) { diag?.push(`${input.name}: no matching MIDI output`); continue }
      if (!(await this.open(input, output))) {
        diag?.push(`${input.name}: port busy (another app has it open?)`); continue
      }
      const link = new Link(input, output)
      const id = await handshake(link, 2, this.t)
      if (id && (!filter || filter(id))) return { link, id, name: input.name }
      diag?.push(`${input.name}: ${id ? `identified as ${id.text}, not the expected one` : 'no FM-1 response'}`)
      link.close()
    }
    return null
  }

  async waitFor(filter, ms) {
    const end = Date.now() + ms
    while (Date.now() < end) {
      const dev = await this.find(filter)
      if (dev) return dev
      await sleep(this.t.poll)
    }
    return null
  }

  // serve read requests until the device asks for one of the finish addresses; stops early
  // when the port disappears (lost: true) instead of waiting out idleMs
  async serve(link, image, finishAddr, idleMs, onProgress) {
    let served = 0,
      last = Date.now()
    for (;;) {
      const pkt = await link.read(this.t.poll)
      if (!pkt) {
        if (link.lost) return { served, finished: false, lost: true }
        if (Date.now() - last > idleMs) return { served, finished: false }
        continue
      }
      const r = parseRequest(pkt)
      if (!r) continue
      last = Date.now()
      if (r.addr === 0xe0000000 || r.addr === 0xf0000000) {
        const ok = await link.sendRetry(response(r.addr, [...new TextEncoder().encode('success'), 0]), this.t)
        if (r.addr === finishAddr) return { served, finished: ok, lost: !ok }
        continue
      }
      if (r.len > MAXDATA || r.addr + r.len > image.length) throw fail('badreq', `bad request ${r.addr.toString(16)}+${r.len}`)
      if (this.t.packetGap) await sleep(this.t.packetGap)
      if (!(await link.sendRetry(response(r.addr, Array.from(image.subarray(r.addr, r.addr + r.len)), r.fl), this.t))) {
        return { served, finished: false, lost: true }
      }
      served++
      if (onProgress) onProgress(served, r.addr)
    }
  }

  // full install: running firmware -> loader -> new firmware
  async install(image, product, onStep) {
    const step = onStep || (() => {})
    const live = [...this.access.inputs.values()].filter((i) => i.state !== 'disconnected')
    if (live.length === 0) {
      throw fail('nomidi', 'No USB-MIDI devices are visible at all. Plug the FM-1 in with a USB DATA cable (not charge-only), try another cable or port, and make sure no other app has exclusive MIDI access. Then press Install again.')
    }
    const other = live.filter((i) => !isCandidatePort(i.name) && isKnownOtherGear(i.name))
    if (!live.some((i) => isCandidatePort(i.name) || !isKnownOtherGear(i.name))) {
      throw fail('noport', `No FM-1-like USB-MIDI port found. The only MIDI devices visible are other gear: ${other.map((i) => i.name).join(', ')}. Connect the FM-1 with a USB data cable. If it is running a firmware with no USB-MIDI update port, use download mode (hold OCT- and OCT+ for 5 seconds) + Device Lab / M-Flasher. Back up the whole flash first.`, other.map((i) => i.name).join(', '))
    }
    const diag = []
    const dev = await this.find(null, diag)
    if (!dev) {
      const busy = diag.filter((d) => /port busy/.test(d))
      if (busy.length) throw fail('busy', `An FM-1 USB-MIDI port is present but could not be opened — another app (a DAW, a MIDI tool, or another copy of this app) is holding it. Close that app and press Install again. Details: ${busy.join('; ')}.`, busy.join('; '))
      throw fail('notfound', `No device answered the FM-1 identity handshake. Use a USB data cable and the right mode, or put the unit in download mode (hold OCT- and OCT+ for 5 seconds) + Device Lab / M-Flasher. Ports probed — ${diag.join('; ') || '(none)'}. Back up the whole flash first.`, diag.join('; '))
    }
    if (IS_OTA(dev.id)) {
      dev.link.close()
      throw fail('inupdate', `The FM-1 is already in update mode (${dev.id.text}): an earlier install did not finish. Press Resume interrupted install to finish it, or roll back to the previous firmware.`, dev.id.text)
    }
    const [model] = product.split('_')
    if (dev.id.model !== model) {
      dev.link.close()
      throw fail('model', `the device is ${dev.id.text}, the package is for ${product}`, dev.id.text)
    }
    const t = this.t
    step('start', dev.id.text)
    if (!(await dev.link.sendRetry(UPGRADE, t))) { dev.link.close(); throw fail('lost', 'the device was disconnected before the install started: nothing was written') }
    await sleep(t.settle)
    let s1
    try { s1 = await this.serve(dev.link, image, 0xe0000000, t.stageIdle, (n) => step('stage', n)) } finally { dev.link.close() }
    if (!s1.finished) {
      // Never got a single read request back: the device answered identity but did
      // not enter update mode — most likely a firmware without in-app OTA. Point at
      // download mode rather than the bare "nothing was written".
      if (!s1.lost && s1.served === 0) throw fail('downloadmode', `${dev.id.text} did not enter update mode, so nothing was written. This firmware may not support in-app USB-MIDI updates — hold OCT- and OCT+ for 5 seconds to enter download mode, then use Device Lab (M-Flasher). Back up the whole flash first.`)
      throw fail(s1.lost ? 'lost' : 'stopped', `the device ${s1.lost ? 'was disconnected' : 'stopped'} after ${s1.served} requests: nothing was written`)
    }
    step('loader')
    await sleep(t.loaderBoot)
    const ota = await this.waitFor(IS_OTA, t.loaderWait)
    if (!ota) throw fail('noloader', 'the update loader did not appear. Replug the USB cable and press Resume interrupted install: the device stays in update mode until it is finished.')
    return this.complete(ota, image, product, step)
  }

  // write through the loader, then wait for the new firmware and check that it reports the
  // package's identity (the protocol has no read-back, so this is the post-write check)
  async complete(ota, image, product, step) {
    const t = this.t
    const s2 = await this.write(ota, image, step)
    if (!s2.finished) throw fail(s2.lost ? 'lost' : 'stopped', `the loader ${s2.lost ? 'was disconnected' : 'stopped'} after ${s2.served} requests. Replug and press Resume interrupted install.`)
    step('reboot')
    await sleep(t.rebootBoot)
    const back = await this.waitFor((id) => !IS_OTA(id), t.returnWait)
    if (!back) throw fail('noreturn', 'the device did not come back: power-cycle it')
    back.link.close()
    if (back.id.text !== product) throw fail('mismatch', `installed, but the device reports ${back.id.text}`, back.id.text)
    step('done', back.id.text)
    return back.id.text
  }

  // step 2 with the loader found by find()/waitFor()
  async write(ota, image, step) {
    if (!(await ota.link.sendRetry(UPGRADE, this.t))) { ota.link.close(); return { served: 0, finished: false, lost: true } }
    await sleep(this.t.settle)
    try { return await this.serve(ota.link, image, 0xf0000000, this.t.writeIdle, (n) => step('write', n)) } finally { ota.link.close() }
  }

  // resume: the device is already in update mode (loader). The loader writes whichever image it
  // is served, so this also rolls back when given the previous package. Resolves to the identity
  // the device reports afterwards, or null when no unit in update mode was found.
  async resume(image, product, onStep) {
    const ota = await this.find(IS_OTA)
    if (!ota) return null
    return this.complete(ota, image, product, onStep || (() => {}))
  }

  // Non-destructive connection probe for a status / connect UI. Finds any FM-1 (running firmware
  // or the update loader), reports its identity, and RELEASES the port immediately — it never
  // sends UPGRADE or writes. Returns the same `code`s install() uses when nothing is found.
  async detect() {
    const diag = []
    const live = [...this.access.inputs.values()].filter((i) => i.state !== 'disconnected')
    const ports = live.map((i) => i.name)
    if (live.length === 0) return { found: false, code: 'nomidi', ports, diag }
    if (!live.some((i) => isCandidatePort(i.name) || !isKnownOtherGear(i.name)))
      return { found: false, code: 'noport', ports, diag: ['all visible MIDI is other gear'] }
    const dev = await this.find(null, diag)   // any FM-1 identity, running fw or update loader
    if (!dev) return { found: false, code: diag.some((d) => /port busy/.test(d)) ? 'busy' : 'notfound', ports, diag }
    const { id, name } = dev
    dev.link.close()                           // detection must never hold the port open
    return { found: true, id: id.text, model: id.model, version: id.version, inUpdateMode: IS_OTA(id), name, ports }
  }
}
