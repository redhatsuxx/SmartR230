import { ESPLoader, Transport } from "https://cdn.jsdelivr.net/npm/esptool-js@0.7.0/bundle.js";

// The firmware ships as a single merged image (bootloader + partition table +
// boot_app0 + app, all pre-combined by the Arduino IDE's ".ino.merged.bin"
// export) so there is exactly one file to write, at offset 0x0, covering the
// whole flash. flashMode/Freq/Size are left as "keep" so esptool-js doesn't
// try to rewrite the image header - the merged binary already has the
// correct values (dio / 80m / 4MB) baked in from the build.
const FIRMWARE_URL = "firmware.bin";
const FLASH_ADDRESS = 0x0;
const BAUD_RATE = 921600; // matches the Arduino IDE upload speed already proven to work with this board
const EXPECTED_CHIP_SUBSTRING = "ESP32-C3";
const MIN_PLAUSIBLE_FIRMWARE_BYTES = 200000; // guards against flashing the placeholder by mistake

const connectBtn = document.getElementById("connectBtn");
const flashBtn = document.getElementById("flashBtn");
const progressBar = document.getElementById("progressBar");
const logEl = document.getElementById("log");

let transport = null;
let esploader = null;
let chipName = null;

function log(message, level = "info") {
  const line = document.createElement("div");
  line.className = `log-line ${level}`;
  const ts = new Date().toLocaleTimeString();
  line.textContent = `[${ts}] ${message}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function setProgress(percent) {
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

const terminal = {
  clean() {
    logEl.innerHTML = "";
  },
  writeLine(data) {
    log(data, "muted");
  },
  write(data) {
    // esptool-js sends partial-line writes here; treat each as its own log entry
    // since this page uses a plain scrolling log rather than a real terminal.
    if (data && data.trim().length > 0) log(data, "muted");
  },
};

function describeError(err) {
  const msg = (err && err.message) || String(err);

  if (err && err.name === "NotFoundError") {
    return "No device was selected in the port picker.";
  }
  if (/no port selected/i.test(msg)) {
    return "No device was selected in the port picker.";
  }
  if (/failed to open serial port|port is already open|already open/i.test(msg)) {
    return "Could not open the serial port - it may already be in use by another tab, Arduino IDE, or another program. Close that first and try again.";
  }
  if (err && err.name === "SecurityError") {
    return "Browser blocked serial access (page must be loaded over HTTPS, not embedded in an iframe).";
  }
  if (/timed out|timeout/i.test(msg)) {
    return "Timed out waiting for the device to respond. Check the USB cable/port, and that the board isn't stuck in a bad state (try unplugging and reconnecting it).";
  }
  return msg;
}

function requireWebSerialSupport() {
  if (!("serial" in navigator)) {
    log("This browser does not support the Web Serial API. Use desktop Chrome or Edge.", "err");
    return false;
  }
  if (!window.isSecureContext) {
    log("This page must be served over HTTPS for Web Serial to work.", "err");
    return false;
  }
  return true;
}

connectBtn.addEventListener("click", async () => {
  if (!requireWebSerialSupport()) return;

  connectBtn.disabled = true;
  try {
    log("Requesting serial port...");
    const port = await navigator.serial.requestPort();

    transport = new Transport(port, true);

    esploader = new ESPLoader({
      transport,
      baudrate: BAUD_RATE,
      terminal,
      debugLogging: false,
    });

    log("Connecting and detecting chip...");
    chipName = await esploader.main();
    log(`Connected: ${chipName}`, "ok");

    if (!chipName.toUpperCase().includes(EXPECTED_CHIP_SUBSTRING)) {
      log(
        `This firmware is built for ${EXPECTED_CHIP_SUBSTRING}, but the connected device reports "${chipName}". Refusing to enable flashing - reconnect the correct device.`,
        "err"
      );
      connectBtn.disabled = false;
      return;
    }

    connectBtn.textContent = "Connected";
    flashBtn.disabled = false;
  } catch (err) {
    log(`Connect failed: ${describeError(err)}`, "err");
    connectBtn.disabled = false;
  }
});

flashBtn.addEventListener("click", async () => {
  if (!esploader) {
    log("Not connected yet.", "err");
    return;
  }

  connectBtn.disabled = true;
  flashBtn.disabled = true;
  setProgress(0);

  try {
    log(`Fetching ${FIRMWARE_URL}...`);
    const response = await fetch(FIRMWARE_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not fetch ${FIRMWARE_URL} (HTTP ${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    const firmwareBytes = new Uint8Array(buffer);
    log(`Fetched firmware.bin (${firmwareBytes.length.toLocaleString()} bytes)`, "ok");

    if (firmwareBytes.length < MIN_PLAUSIBLE_FIRMWARE_BYTES) {
      log(
        "firmware.bin looks too small to be a real merged firmware image - this may still be the placeholder file. Proceeding anyway, but double-check before relying on this.",
        "warn"
      );
    }

    log("Erasing and writing flash - do not disconnect the device...");
    await esploader.writeFlash({
      fileArray: [{ data: firmwareBytes, address: FLASH_ADDRESS }],
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        const percent = (written / total) * 100;
        setProgress(percent);
        if (written === total) {
          log(`Writing complete (${total.toLocaleString()} bytes)`, "ok");
        }
      },
    });

    log("Verifying / resetting device...");
    await esploader.after();

    setProgress(100);
    log("Done. The device has been flashed and should now reboot into the new firmware.", "ok");
  } catch (err) {
    log(`Flashing failed: ${describeError(err)}`, "err");
  } finally {
    connectBtn.disabled = false;
    flashBtn.disabled = false;
  }
});

if (!requireWebSerialSupport()) {
  connectBtn.disabled = true;
}
