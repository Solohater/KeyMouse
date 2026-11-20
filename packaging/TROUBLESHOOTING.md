# kiMo troubleshooting

## The phone cannot find the computer

- Run `kimo status` on the computer and check the printed IP address.
- Put the phone and computer on the same Wi-Fi network, or connect the computer to
  the phone's hotspot.
- Guest Wi-Fi and some routers enable AP isolation; use the phone hotspot or USB.
- Check the firewall for TCP port 4242 and UDP port 4243.

## USB mode says "tunnel not detected"

1. Use a data-capable USB cable (not charge-only).
2. Enable Developer Options and USB debugging on the phone.
3. Unlock the phone and accept the USB debugging authorization prompt.
4. Install `adb` on the computer: `sudo apt install adb`.
5. Run `kimo doctor` and check the USB/ADB line.
6. Replug the cable or run `adb devices` to verify the phone is `device`, not
   `unauthorized` or `offline`.

## Mouse and keyboard do nothing over Wi-Fi/USB

Run:

```sh
kimo doctor
```

- If `/dev/uinput` is not writable, log out and back in after installing the
  package so the udev `uaccess` rule applies.
- If `uinput` is unavailable, install `ydotool` and make sure `ydotoold` is
  running:
  ```sh
  sudo apt install ydotool
  systemctl --user enable --now ydotool
  ```
- On Wayland, `ydotool` may be required. On X11, `/dev/uinput` is preferred.

## Bluetooth pairing fails

- Android 12+ requires the app's Bluetooth permissions; grant them when prompted.
- Turn Bluetooth off and on, then reopen the app.
- Remove the old pairing on both devices and pair again.
- Make the phone discoverable from the app before pairing on Ubuntu.
- Some Ubuntu Bluetooth adapters do not accept HID device connections reliably;
  use USB or Wi-Fi instead.

## The PIN does not work

The PIN rotates after each successful pairing. Run `kimo status` to get the
current PIN. After five failed attempts from one address, pairing is locked for
60 seconds.

## The app connects but input is delayed

- USB/ADB has the lowest latency.
- For Wi-Fi, prefer the phone hotspot when the router isolates clients.
- Disable power saving for the kiMo app on Android.

## Large APK

The APK includes the Ubuntu installer so it works offline. This makes the APK
larger than a typical remote-control app.
