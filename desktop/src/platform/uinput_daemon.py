#!/usr/bin/env python3
import os, sys, struct, fcntl, time

# Linux input event constants
EV_SYN = 0x00
EV_KEY = 0x01
EV_REL = 0x02

SYN_REPORT = 0x00
REL_X = 0x00
REL_Y = 0x01
REL_WHEEL = 0x08
REL_HWHEEL = 0x06

BTN_LEFT = 0x110
BTN_RIGHT = 0x111
BTN_MIDDLE = 0x112

UI_SET_EVBIT = 0x40045564
UI_SET_KEYBIT = 0x40045565
UI_SET_RELBIT = 0x40045566
UI_DEV_CREATE = 0x5501
UI_DEV_DESTROY = 0x5502

BUTTON_MAP = {
    'left': BTN_LEFT,
    'right': BTN_RIGHT,
    'middle': BTN_MIDDLE,
    'l': BTN_LEFT,
    'r': BTN_RIGHT,
    'm': BTN_MIDDLE,
}

def main():
    try:
        fd = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
    except Exception as e:
        sys.stderr.write(f'ERROR: Failed to open /dev/uinput: {e}\n')
        sys.stderr.flush()
        sys.exit(1)

    # Enable event types
    fcntl.ioctl(fd, UI_SET_EVBIT, EV_KEY)
    fcntl.ioctl(fd, UI_SET_EVBIT, EV_REL)
    fcntl.ioctl(fd, UI_SET_EVBIT, EV_SYN)

    # Enable mouse buttons
    fcntl.ioctl(fd, UI_SET_KEYBIT, BTN_LEFT)
    fcntl.ioctl(fd, UI_SET_KEYBIT, BTN_RIGHT)
    fcntl.ioctl(fd, UI_SET_KEYBIT, BTN_MIDDLE)

    # Enable all keyboard keys (1 to 255)
    for k in range(1, 255):
        fcntl.ioctl(fd, UI_SET_KEYBIT, k)

    # Enable relative axes
    fcntl.ioctl(fd, UI_SET_RELBIT, REL_X)
    fcntl.ioctl(fd, UI_SET_RELBIT, REL_Y)
    fcntl.ioctl(fd, UI_SET_RELBIT, REL_WHEEL)
    fcntl.ioctl(fd, UI_SET_RELBIT, REL_HWHEEL)

    # Setup device descriptor
    name = b'PocketInput Virtual Controller'
    uinput_user_dev = struct.pack('80sHHHHi', name, 0x03, 0x1234, 0x5678, 1, 0)
    uinput_user_dev += b'\x00' * (4 * 64 * 4)

    os.write(fd, uinput_user_dev)
    fcntl.ioctl(fd, UI_DEV_CREATE)
    time.sleep(0.1)

    held_keys = set()
    held_buttons = set()

    def emit(ev_type, ev_code, ev_val):
        event = struct.pack('qqHHi', 0, 0, ev_type, ev_code, int(ev_val))
        os.write(fd, event)

    def syn():
        emit(EV_SYN, SYN_REPORT, 0)

    # Send ready signal to parent process
    sys.stdout.write('READY\n')
    sys.stdout.flush()

    try:
        for raw_line in sys.stdin:
            line = raw_line.strip()
            if not line:
                continue

            parts = line.split()
            cmd = parts[0]

            if cmd == 'm':  # move <dx> <dy>
                dx = int(float(parts[1]))
                dy = int(float(parts[2]))
                if dx != 0:
                    emit(EV_REL, REL_X, dx)
                if dy != 0:
                    emit(EV_REL, REL_Y, dy)
                if dx != 0 or dy != 0:
                    syn()

            elif cmd == 'c':  # click <button> [double]
                btn_name = parts[1].lower()
                code = BUTTON_MAP.get(btn_name, BTN_LEFT)
                is_double = len(parts) > 2 and parts[2] == '1'
                clicks = 2 if is_double else 1
                for _ in range(clicks):
                    emit(EV_KEY, code, 1)
                    syn()
                    time.sleep(0.01)
                    emit(EV_KEY, code, 0)
                    syn()
                    if is_double:
                        time.sleep(0.04)

            elif cmd == 'b':  # button <button> <down|up>
                btn_name = parts[1].lower()
                code = BUTTON_MAP.get(btn_name, BTN_LEFT)
                action = parts[2].lower()
                val = 1 if action in ('down', '1', 'press') else 0
                if val == 1:
                    held_buttons.add(code)
                else:
                    held_buttons.discard(code)
                emit(EV_KEY, code, val)
                syn()

            elif cmd == 'w':  # wheel <dx> <dy>
                # dy positive = scroll up, negative = scroll down
                dx = int(float(parts[1]))
                dy = int(float(parts[2]))
                if dy != 0:
                    emit(EV_REL, REL_WHEEL, dy)
                if dx != 0:
                    emit(EV_REL, REL_HWHEEL, dx)
                if dx != 0 or dy != 0:
                    syn()

            elif cmd == 'k':  # key <keycode> <down|up>
                code = int(parts[1])
                val = 1 if parts[2] in ('down', '1', 'press') else 0
                if val == 1:
                    held_keys.add(code)
                else:
                    held_keys.discard(code)
                emit(EV_KEY, code, val)
                syn()

            elif cmd == 't':  # type <keycode> <shift:0|1>
                code = int(parts[1])
                use_shift = len(parts) > 2 and parts[2] == '1'
                KEY_LEFTSHIFT = 42
                if use_shift:
                    emit(EV_KEY, KEY_LEFTSHIFT, 1)
                    syn()
                emit(EV_KEY, code, 1)
                syn()
                time.sleep(0.005)
                emit(EV_KEY, code, 0)
                syn()
                if use_shift:
                    emit(EV_KEY, KEY_LEFTSHIFT, 0)
                    syn()
                time.sleep(0.005)

            elif cmd == 'r':  # release all
                for btn in list(held_buttons):
                    emit(EV_KEY, btn, 0)
                held_buttons.clear()
                for key in list(held_keys):
                    emit(EV_KEY, key, 0)
                held_keys.clear()
                syn()

            elif cmd == 'q':  # quit
                break

    except (KeyboardInterrupt, BrokenPipeError):
        pass
    finally:
        # Release all on exit
        for btn in held_buttons:
            emit(EV_KEY, btn, 0)
        for key in held_keys:
            emit(EV_KEY, key, 0)
        syn()
        fcntl.ioctl(fd, UI_DEV_DESTROY)
        os.close(fd)

if __name__ == '__main__':
    main()
