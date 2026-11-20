# PocketInput 📱⌨🖱
**Wireless Phone Keyboard & Mouse for PC (Ubuntu Linux & Windows)**

PocketInput turns your Android smartphone into a low-latency wireless keyboard, touchpad mouse, and remote input controller for your PC over local Wi-Fi.

---

## 🏗 System Architecture

```
┌─────────────────────────────────┐           WebSocket (JSON Protocol)
│    Android Phone (Client)       │◄──────────────────────────────────────────────┐
│                                 │  - mouse_move (dx, dy)                        │
│ • Full-Screen Landscape Keyboard│  - mouse_click / mouse_button                 │
│ • Multi-Touch Touchpad          │  - key_down / key_up / key_press              │
│ • Gestures (Tap, 2-Finger Scroll│  - shortcuts (Ctrl+C, Ctrl+V, Alt+Tab)        │
│ • Secure PIN & Token Pairing    │  - latency ping/pong                          │
│ • React Native (Expo) & Web App │                                               │
└─────────────────────────────────┘                                               │
                                                                                  │
                                                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          PC Companion (Node.js & TypeScript)                     │
│                                                                                 │
│  ┌──────────────────────┐   ┌──────────────────────┐   ┌─────────────────────┐  │
│  │   PocketServer       │──▶│   PairingManager     │──▶│   MouseCoalescer    │  │
│  │ (HTTP + WebSocket)   │   │ (PIN, Token Auth)    │   │ (~100Hz batching)   │  │
│  └──────────────────────┘   └──────────────────────┘   └─────────────────────┘  │
│                                                                   │             │
│                                                                   ▼             │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                        OS Input Abstraction Layer                         │  │
│  │                                                                           │  │
│  │  • Linux (Ubuntu Wayland / X11): ydotool via kernel /dev/uinput           │  │
│  │  • Windows: SendInput API backend                                         │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Key Highlights for Ubuntu Linux (Wayland & X11)

- **Wayland Compatibility:** Unlike legacy tools (`xdotool` / `robotjs`) that fail under Wayland, PocketInput uses `ydotoold` via Linux kernel `/dev/uinput`. This works seamlessly on **Ubuntu GNOME (Wayland)** as well as X11.
- **Kernel-level Evdev Keys:** Real hardware scan codes and key events are emitted, allowing typing in terminals, code editors (VS Code), and browsers.
- **Auto Modifier Cleanup:** On disconnection or window switch, all held modifier keys (`Ctrl`, `Alt`, `Shift`, `Super`) and mouse buttons are automatically released to prevent stuck keys.
- **Two Ways to Connect from Android:**
  1. **Instant Web Controller:** Open the companion URL / scan the terminal QR code in Chrome on your phone.
  2. **Native Mobile App:** Run the React Native Expo app in Expo Go.

---

## 🚀 Quick Start Guide

### 1. Start the PC Companion Server
In your PC terminal:
```bash
npm run desktop
```

You will see:
- Primary PC IP (e.g. `10.10.4.109:4242`)
- 6-digit secure pairing PIN
- Terminal QR code

### 2. Connect from your Android Phone
Ensure your Android phone is connected to the same Wi-Fi network as your PC.

#### Option A — Instant Mobile Web Controller (Zero installation on phone)
Scan the QR code displayed in the terminal using your phone camera, or open:
```
http://<YOUR_PC_IP>:4242/?pin=<PIN>
```
You can immediately slide your finger to move the mouse cursor, tap to click, scroll with 2 fingers, and use the full keyboard!

#### Option B — Native React Native (Expo) App
In a separate terminal on your PC:
```bash
npm run mobile
```
1. Install **Expo Go** from Google Play Store on your Android phone.
2. Scan the Expo QR code to launch the native PocketInput app.
3. Enter your PC IP and PIN on the Connect screen and press **Connect to PC**.

---

## 🖐 Touchpad Gesture Controls

| Gesture | Action on PC |
| :--- | :--- |
| **1-Finger Slide** | Smooth mouse cursor movement (configurable sensitivity) |
| **1-Finger Tap** | Left click |
| **Double Tap** | Double click |
| **2-Finger Tap** | Right click |
| **2-Finger Drag (Vertical)** | Vertical scroll |
| **Hold / Drag Button** | Click and drag files, text, or windows |
| **Dedicated Buttons** | Left Click, Right Click, and Drag Toggle |

---

## ⌨ Keyboard Features

- **Full-Screen Landscape Layout:** Maximizes typing space on mobile screens.
- **Real Desktop Keys:** QWERTY letter keys, numbers row, Enter, Backspace, Tab, Escape, Delete, Space.
- **Sticky Modifiers:** Ctrl, Alt, Shift, and Super (Windows key) can be toggled to perform keyboard combinations.
- **Function Keys:** Toggleable row for F1 through F12, Home, End, PageUp, PageDown.
- **One-Tap Shortcuts:** Ctrl+C, Ctrl+V, Ctrl+Z, Ctrl+A, Alt+Tab, and quick text sender.

---

## 🧪 Automated Tests

Run the full integration and protocol test suite:
```bash
npm test
```

Tests verify:
- Message protocol validation & payload checks
- Linux evdev key code mappings
- PIN generation, token verification, and authentication
- Real mouse movement and click delivery
- Keyboard event emission and releaseAll cleanup
