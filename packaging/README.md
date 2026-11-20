# kiMo Companion for Ubuntu

kiMo turns your Android phone into a keyboard, mouse, and touchpad for Ubuntu.

## What is included

- A background companion server for Ubuntu (no global Node.js required).
- Automatic start at desktop login.
- USB/ADB, Wi-Fi/hotspot, and Bluetooth HID connection modes.
- The `kimo` command for status, pairing PIN, diagnostics, and service management.

## Install

1. Copy `kimo_<version>_amd64.deb` to the Ubuntu computer.
2. Double-click the file and choose **Install**, or run:

   ```sh
   sudo apt install ./kimo_<version>_amd64.deb
   ```

3. Log out and back in once so the `uinput` permission rule is applied.
4. Open the kiMo app on the phone and follow **Install Ubuntu Companion**.

## Pair

```sh
kimo status
```

The output shows the network address, the current 6-digit pairing PIN, the USB/ADB
state, and a QR code for the web controller. The PIN changes after each successful
pairing; run `kimo status` again to see the new one.

## Connection modes

- **USB (ADB, recommended):** enable Developer Options and USB debugging, authorize
  the computer, then choose **Connect USB** in the app. The companion creates the
  adb reverse tunnel automatically. `adb` must be installed on the computer
  (`sudo apt install adb`).
- **Wi-Fi / hotspot:** put the phone and computer on the same network, then use
  Auto-Detect or enter the computer IP manually.
- **Bluetooth HID:** in the app open **Bluetooth**, make the phone discoverable,
  and pair it from the Ubuntu Bluetooth settings. This mode does not need the
  companion server.

## Commands

```sh
kimo start
kimo stop
kimo status
kimo pin
kimo qr
kimo doctor
kimo service install
kimo service uninstall
```

`kimo doctor` checks Python, `/dev/uinput`, `ydotool`, `adb`, the display session,
and whether the companion is running.

## Uninstall

```sh
kimo uninstall
sudo apt remove kimo
```

## Notes

- Ubuntu only. Windows input injection is not implemented.
- The companion never runs as root.
- Rooted USB HID gadgets are not supported; USB mode uses ADB.
