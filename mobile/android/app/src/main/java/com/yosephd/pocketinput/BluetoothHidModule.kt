package com.yosephd.pocketinput

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHidDevice
import android.bluetooth.BluetoothHidDeviceAppSdpSettings
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.Executors

@SuppressLint("MissingPermission")
class BluetoothHidModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    private val TAG = "PocketInputHID"
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var hidDevice: BluetoothHidDevice? = null
    private var connectedDevice: BluetoothDevice? = null
    private var isAppRegistered = false
    private val executor = Executors.newSingleThreadExecutor()

    // Current mouse button state (bit 0 = left, bit 1 = right, bit 2 = middle)
    private var currentMouseButtons: Byte = 0

    // Sub-pixel accumulators for high precision cursor and wheel movement
    private var remainderX: Double = 0.0
    private var remainderY: Double = 0.0
    private var remainderWheel: Double = 0.0

    // Current pressed keyboard keys (up to 6) and modifiers
    private var currentModifiers: Byte = 0
    private val pressedKeys = mutableSetOf<Byte>()

    companion object {
        const val NAME = "BluetoothHidModule"
        const val REPORT_ID_KEYBOARD: Byte = 1
        const val REPORT_ID_MOUSE: Byte = 2

        // Standard USB/Bluetooth HID Report Descriptor (Keyboard + Mouse Combo)
        private val HID_REPORT_DESC = byteArrayOf(
            // Keyboard (Report ID 1)
            0x05.toByte(), 0x01.toByte(), // Usage Page (Generic Desktop)
            0x09.toByte(), 0x06.toByte(), // Usage (Keyboard)
            0xA1.toByte(), 0x01.toByte(), // Collection (Application)
            0x85.toByte(), 0x01.toByte(), //   Report ID (1)
            0x05.toByte(), 0x07.toByte(), //   Usage Page (Key Codes)
            0x19.toByte(), 0xE0.toByte(), //   Usage Minimum (224 - LCtrl)
            0x29.toByte(), 0xE7.toByte(), //   Usage Maximum (231 - RGUI)
            0x15.toByte(), 0x00.toByte(), //   Logical Minimum (0)
            0x25.toByte(), 0x01.toByte(), //   Logical Maximum (1)
            0x75.toByte(), 0x01.toByte(), //   Report Size (1)
            0x95.toByte(), 0x08.toByte(), //   Report Count (8)
            0x81.toByte(), 0x02.toByte(), //   Input (Data, Variable, Absolute) - Modifiers
            0x95.toByte(), 0x01.toByte(), //   Report Count (1)
            0x75.toByte(), 0x08.toByte(), //   Report Size (8)
            0x81.toByte(), 0x01.toByte(), //   Input (Constant) - Reserved byte
            0x95.toByte(), 0x05.toByte(), //   Report Count (5)
            0x75.toByte(), 0x01.toByte(), //   Report Size (1)
            0x05.toByte(), 0x08.toByte(), //   Usage Page (LEDs)
            0x19.toByte(), 0x01.toByte(), //   Usage Minimum (1)
            0x29.toByte(), 0x05.toByte(), //   Usage Maximum (5)
            0x91.toByte(), 0x02.toByte(), //   Output (Data, Variable, Absolute)
            0x95.toByte(), 0x01.toByte(), //   Report Count (1)
            0x75.toByte(), 0x03.toByte(), //   Report Size (3)
            0x91.toByte(), 0x01.toByte(), //   Output (Constant) - LED padding
            0x95.toByte(), 0x06.toByte(), //   Report Count (6)
            0x75.toByte(), 0x08.toByte(), //   Report Size (8)
            0x15.toByte(), 0x00.toByte(), //   Logical Minimum (0)
            0x25.toByte(), 0x65.toByte(), //   Logical Maximum (101)
            0x05.toByte(), 0x07.toByte(), //   Usage Page (Key Codes)
            0x19.toByte(), 0x00.toByte(), //   Usage Minimum (0)
            0x29.toByte(), 0x65.toByte(), //   Usage Maximum (101)
            0x81.toByte(), 0x00.toByte(), //   Input (Data, Array) - 6 keycodes
            0xC0.toByte(),               // End Collection

            // Mouse (Report ID 2)
            0x05.toByte(), 0x01.toByte(), // Usage Page (Generic Desktop)
            0x09.toByte(), 0x02.toByte(), // Usage (Mouse)
            0xA1.toByte(), 0x01.toByte(), // Collection (Application)
            0x85.toByte(), 0x02.toByte(), //   Report ID (2)
            0x09.toByte(), 0x01.toByte(), //   Usage (Pointer)
            0xA1.toByte(), 0x00.toByte(), //   Collection (Physical)
            0x05.toByte(), 0x09.toByte(), //     Usage Page (Buttons)
            0x19.toByte(), 0x01.toByte(), //     Usage Minimum (1)
            0x29.toByte(), 0x03.toByte(), //     Usage Maximum (3)
            0x15.toByte(), 0x00.toByte(), //     Logical Minimum (0)
            0x25.toByte(), 0x01.toByte(), //     Logical Maximum (1)
            0x95.toByte(), 0x03.toByte(), //     Report Count (3)
            0x75.toByte(), 0x01.toByte(), //     Report Size (1)
            0x81.toByte(), 0x02.toByte(), //     Input (Data, Variable, Absolute) - 3 Buttons
            0x95.toByte(), 0x01.toByte(), //     Report Count (1)
            0x75.toByte(), 0x05.toByte(), //     Report Size (5)
            0x81.toByte(), 0x01.toByte(), //     Input (Constant) - Button padding
            0x05.toByte(), 0x01.toByte(), //     Usage Page (Generic Desktop)
            0x09.toByte(), 0x30.toByte(), //     Usage (X)
            0x09.toByte(), 0x31.toByte(), //     Usage (Y)
            0x15.toByte(), 0x81.toByte(), //     Logical Minimum (-127)
            0x25.toByte(), 0x7F.toByte(), //     Logical Maximum (127)
            0x75.toByte(), 0x08.toByte(), //     Report Size (8)
            0x95.toByte(), 0x02.toByte(), //     Report Count (2)
            0x81.toByte(), 0x06.toByte(), //     Input (Data, Variable, Relative) - dX, dY
            0x09.toByte(), 0x38.toByte(), //     Usage (Wheel)
            0x15.toByte(), 0x81.toByte(), //     Logical Minimum (-127)
            0x25.toByte(), 0x7F.toByte(), //     Logical Maximum (127)
            0x75.toByte(), 0x08.toByte(), //     Report Size (8)
            0x95.toByte(), 0x01.toByte(), //     Report Count (1)
            0x81.toByte(), 0x06.toByte(), //     Input (Data, Variable, Relative) - Wheel
            0xC0.toByte(),               //   End Collection
            0xC0.toByte()                // End Collection
        )
    }

    override fun getName(): String = NAME

    private fun getSafeDeviceName(device: BluetoothDevice?): String {
        return try {
            device?.name ?: "Unknown"
        } catch (_: SecurityException) {
            "Unknown"
        }
    }

    init {
        try {
            bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
            reactContext.addLifecycleEventListener(this)
            Log.d(TAG, "BluetoothHidModule initialized successfully")
        } catch (e: Exception) {
            Log.w(TAG, "BluetoothHidModule init notice", e)
        }
    }

    override fun onHostResume() {
        Log.d(TAG, "onHostResume: checking HID registration (registered=$isAppRegistered, proxy=${hidDevice != null})")
        if (hidDevice != null && !isAppRegistered) {
            registerHidAppInternal()
        }
    }

    override fun onHostPause() {}

    override fun onHostDestroy() {
        Log.d(TAG, "onHostDestroy: unregistering HID")
        try {
            hidDevice?.unregisterApp()
            if (hidDevice != null && bluetoothAdapter != null) {
                bluetoothAdapter?.closeProfileProxy(BluetoothProfile.HID_DEVICE, hidDevice)
            }
        } catch (_: Exception) {}
    }

    private var lastConnectedAddress: String? = null

    private val hidCallback = object : BluetoothHidDevice.Callback() {
        override fun onAppStatusChanged(pluggedDevice: BluetoothDevice?, registered: Boolean) {
            Log.d(TAG, "onAppStatusChanged: registered=$registered, pluggedDevice=${pluggedDevice?.name} (${pluggedDevice?.address})")
            isAppRegistered = registered
            if (pluggedDevice != null) {
                connectedDevice = pluggedDevice
            }
            val params = Arguments.createMap().apply {
                putString("event", "appStatusChanged")
                putBoolean("registered", registered)
            }
            sendEvent("onBluetoothHidStateChange", params)

            if (!registered && hidDevice != null && bluetoothAdapter?.isEnabled == true) {
                Log.d(TAG, "HID registration dropped by system. Scheduling auto re-registration...")
                executor.submit {
                    try {
                        Thread.sleep(800)
                        registerHidAppInternal()
                    } catch (_: Exception) {}
                }
            }
        }

        override fun onConnectionStateChanged(device: BluetoothDevice?, state: Int) {
            val devName = getSafeDeviceName(device)
            Log.d(TAG, "onConnectionStateChanged: device=$devName (${device?.address}), state=$state")
            val params = Arguments.createMap()
            params.putString("event", "connectionStateChanged")
            params.putString("deviceName", devName)
            params.putString("deviceAddress", device?.address ?: "")

            when (state) {
                BluetoothProfile.STATE_CONNECTED -> {
                    connectedDevice = device
                    if (device != null) lastConnectedAddress = device.address
                    params.putString("state", "connected")
                }
                BluetoothProfile.STATE_CONNECTING -> {
                    params.putString("state", "connecting")
                }
                BluetoothProfile.STATE_DISCONNECTING -> {
                    params.putString("state", "disconnecting")
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    if (connectedDevice?.address == device?.address) {
                        connectedDevice = null
                    }
                    if (device != null) lastConnectedAddress = device.address
                    params.putString("state", "disconnected")
                }
            }
            sendEvent("onBluetoothHidStateChange", params)
        }

        override fun onGetReport(device: BluetoothDevice?, type: Byte, id: Byte, bufferSize: Int) {
            Log.d(TAG, "onGetReport: type=$type, id=$id, bufferSize=$bufferSize")
            val hid = hidDevice
            if (device == null || hid == null) return

            when (id) {
                REPORT_ID_KEYBOARD -> {
                    val report = ByteArray(8)
                    report[0] = currentModifiers
                    report[1] = 0 // reserved
                    val keyArray = pressedKeys.take(6).toByteArray()
                    System.arraycopy(keyArray, 0, report, 2, keyArray.size)
                    hid.replyReport(device, type, id, report)
                }
                REPORT_ID_MOUSE -> {
                    val report = byteArrayOf(currentMouseButtons, 0, 0, 0)
                    hid.replyReport(device, type, id, report)
                }
                else -> {
                    hid.reportError(device, BluetoothHidDevice.ERROR_RSP_UNSUPPORTED_REQ)
                }
            }
        }

        override fun onSetReport(device: BluetoothDevice?, type: Byte, id: Byte, data: ByteArray?) {
            Log.d(TAG, "onSetReport: type=$type, id=$id, dataLen=${data?.size}")
            // Acknowledge report (e.g. keyboard LEDs)
            hidDevice?.reportError(device, BluetoothHidDevice.ERROR_RSP_SUCCESS)
        }

        override fun onSetProtocol(device: BluetoothDevice?, protocol: Byte) {
            Log.d(TAG, "onSetProtocol: protocol=$protocol")
            hidDevice?.reportError(device, BluetoothHidDevice.ERROR_RSP_SUCCESS)
        }

        override fun onVirtualCableUnplug(device: BluetoothDevice?) {
            Log.d(TAG, "onVirtualCableUnplug: device=${device?.address}")
            if (connectedDevice?.address == device?.address) {
                connectedDevice = null
            }
            val params = Arguments.createMap().apply {
                putString("event", "connectionStateChanged")
                putString("state", "disconnected")
            }
            sendEvent("onBluetoothHidStateChange", params)
        }
    }

    private val serviceListener = object : BluetoothProfile.ServiceListener {
        override fun onServiceConnected(profile: Int, proxy: BluetoothProfile?) {
            Log.d(TAG, "onServiceConnected: profile=$profile, proxy=$proxy")
            if (profile == BluetoothProfile.HID_DEVICE) {
                hidDevice = proxy as? BluetoothHidDevice
                Log.d(TAG, "HID proxy obtained: $hidDevice. Calling registerHidAppInternal()...")
                registerHidAppInternal()
            }
        }

        override fun onServiceDisconnected(profile: Int) {
            Log.d(TAG, "onServiceDisconnected: profile=$profile")
            if (profile == BluetoothProfile.HID_DEVICE) {
                hidDevice = null
                isAppRegistered = false
            }
        }
    }

    private fun registerHidAppInternal() {
        val hid = hidDevice
        if (hid == null) {
            Log.w(TAG, "registerHidAppInternal called but hidDevice is null")
            return
        }
        if (isAppRegistered) {
            Log.d(TAG, "registerHidAppInternal: already registered")
            return
        }

        try {
            val sdp = BluetoothHidDeviceAppSdpSettings(
                "PocketInput",
                "Wireless Input",
                "PocketInput",
                BluetoothHidDevice.SUBCLASS1_COMBO,
                HID_REPORT_DESC
            )

            Log.d(TAG, "Calling hid.registerApp...")
            val result = hid.registerApp(sdp, null, null, executor, hidCallback)
            Log.d(TAG, "hid.registerApp call returned: $result")
            if (!result) {
                executor.submit {
                    try {
                        Thread.sleep(800)
                        if (!isAppRegistered && hidDevice != null) {
                            Log.d(TAG, "Retrying hid.registerApp...")
                            val retryResult = hidDevice?.registerApp(sdp, null, null, executor, hidCallback)
                            Log.d(TAG, "hid.registerApp retry returned: $retryResult")
                        }
                    } catch (_: Exception) {}
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Exception during registerApp", e)
            val params = Arguments.createMap().apply {
                putString("event", "error")
                putString("message", e.message ?: "Failed to register HID app")
            }
            sendEvent("onBluetoothHidStateChange", params)
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun addListener(type: String) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }

    @ReactMethod
    fun removeListeners(type: Int) {
        // Keep: Required for RN built-in Event Emitter Calls.
    }

    @ReactMethod
    fun isSupported(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            promise.resolve(false)
            return
        }
        val adapter = bluetoothAdapter
        if (adapter == null) {
            promise.resolve(false)
            return
        }
        promise.resolve(true)
    }

    @ReactMethod
    fun isRegistered(promise: Promise) {
        promise.resolve(isAppRegistered)
    }

    @ReactMethod
    fun startHidService(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            promise.reject("UNSUPPORTED", "Bluetooth HID requires Android 9 (API 28) or higher")
            return
        }

        val adapter = bluetoothAdapter
        if (adapter == null || !adapter.isEnabled) {
            promise.reject("BLUETOOTH_DISABLED", "Bluetooth is disabled or not supported")
            return
        }

        if (hidDevice != null) {
            Log.d(TAG, "startHidService: proxy exists (registered=$isAppRegistered)")
            if (!isAppRegistered) {
                registerHidAppInternal()
            }
            promise.resolve(true)
            return
        }

        try {
            Log.d(TAG, "Requesting HID_DEVICE profile proxy...")
            val success = adapter.getProfileProxy(reactContext, serviceListener, BluetoothProfile.HID_DEVICE)
            Log.d(TAG, "getProfileProxy returned: $success")
            promise.resolve(success)
        } catch (e: Exception) {
            Log.e(TAG, "startHidService error", e)
            promise.reject("START_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stopHidService(promise: Promise) {
        try {
            hidDevice?.unregisterApp()
            if (hidDevice != null && bluetoothAdapter != null) {
                bluetoothAdapter?.closeProfileProxy(BluetoothProfile.HID_DEVICE, hidDevice)
            }
            hidDevice = null
            isAppRegistered = false
            connectedDevice = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getBondedDevices(promise: Promise) {
        try {
            val devices = Arguments.createArray()
            val bonded = bluetoothAdapter?.bondedDevices ?: emptySet()
            for (dev in bonded) {
                val map = Arguments.createMap().apply {
                    putString("name", getSafeDeviceName(dev))
                    putString("address", dev.address)
                    putBoolean("isConnected", connectedDevice?.address == dev.address)
                }
                devices.pushMap(map)
            }
            promise.resolve(devices)
        } catch (e: Exception) {
            promise.reject("GET_BONDED_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun connectToDevice(address: String, promise: Promise) {
        val adapter = bluetoothAdapter
        if (adapter == null || !adapter.isEnabled) {
            promise.reject("BLUETOOTH_DISABLED", "Bluetooth is disabled or not supported")
            return
        }

        val device = try {
            adapter.getRemoteDevice(address)
        } catch (e: Exception) {
            promise.reject("NOT_FOUND", "Invalid Bluetooth address: $address", e)
            return
        }

        executor.submit {
            try {
                if (hidDevice == null) {
                    adapter.getProfileProxy(reactContext, serviceListener, BluetoothProfile.HID_DEVICE)
                    var waitCount = 0
                    while (hidDevice == null && waitCount < 15) {
                        Thread.sleep(100)
                        waitCount++
                    }
                }

                val hid = hidDevice
                if (hid == null) {
                    promise.reject("HID_PROXY_ERROR", "Failed to obtain HID profile proxy")
                    return@submit
                }

                if (!isAppRegistered) {
                    registerHidAppInternal()
                    var waitReg = 0
                    while (!isAppRegistered && waitReg < 25) {
                        Thread.sleep(100)
                        waitReg++
                    }
                }

                Log.d(TAG, "Attempting hid.connect to ${device.name} ($address)...")
                val success = hid.connect(device)
                Log.d(TAG, "hid.connect returned: $success")
                promise.resolve(success)
            } catch (e: Exception) {
                Log.e(TAG, "Error in connectToDevice", e)
                promise.reject("CONNECT_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun makeDiscoverable(durationSeconds: Int, promise: Promise) {
        try {
            val duration = if (durationSeconds in 1..300) durationSeconds else 120
            val intent = android.content.Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE).apply {
                putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, duration)
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "makeDiscoverable error", e)
            promise.reject("DISCOVERABLE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun enableBluetooth(promise: Promise) {
        try {
            val intent = android.content.Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE).apply {
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "enableBluetooth error", e)
            promise.reject("ENABLE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun disconnectDevice(promise: Promise) {
        val hid = hidDevice
        val dev = connectedDevice
        if (hid != null && dev != null) {
            hid.disconnect(dev)
            connectedDevice = null
        }
        promise.resolve(true)
    }

    private fun getActiveDevice(): BluetoothDevice? {
        val dev = connectedDevice ?: hidDevice?.connectedDevices?.firstOrNull()
        if (connectedDevice == null && dev != null) {
            connectedDevice = dev
        }
        return dev
    }

    @ReactMethod
    fun sendMouseMove(dx: Double, dy: Double) {
        val hid = hidDevice ?: return
        val dev = getActiveDevice() ?: return

        // Accumulate fractional sub-pixel deltas
        val totalDx = dx + remainderX
        val totalDy = dy + remainderY

        val intDx = totalDx.toInt()
        val intDy = totalDy.toInt()

        // Keep the fractional leftovers for the next frame
        remainderX = totalDx - intDx
        remainderY = totalDy - intDy

        // Prevent accumulator from drifting too far
        if (remainderX > 2.0 || remainderX < -2.0) remainderX = 0.0
        if (remainderY > 2.0 || remainderY < -2.0) remainderY = 0.0

        if (intDx == 0 && intDy == 0) {
            return
        }

        val clampedDx = intDx.coerceIn(-127, 127).toByte()
        val clampedDy = intDy.coerceIn(-127, 127).toByte()

        val report = byteArrayOf(currentMouseButtons, clampedDx, clampedDy, 0)
        hid.sendReport(dev, REPORT_ID_MOUSE.toInt(), report)
    }

    @ReactMethod
    fun sendMouseButton(button: String, isDown: Boolean) {
        val hid = hidDevice ?: return
        val dev = getActiveDevice() ?: return

        val bit: Byte = when (button.lowercase()) {
            "left" -> 0x01
            "right" -> 0x02
            "middle" -> 0x04
            else -> 0x01
        }

        currentMouseButtons = if (isDown) {
            (currentMouseButtons.toInt() or bit.toInt()).toByte()
        } else {
            (currentMouseButtons.toInt() and bit.toInt().inv()).toByte()
        }

        val report = byteArrayOf(currentMouseButtons, 0, 0, 0)
        hid.sendReport(dev, REPORT_ID_MOUSE.toInt(), report)
    }

    @ReactMethod
    fun sendMouseClick(button: String) {
        sendMouseButton(button, true)
        executor.submit {
            try {
                Thread.sleep(15)
            } catch (_: Exception) {}
            sendMouseButton(button, false)
        }
    }

    @ReactMethod
    fun sendMouseScroll(dy: Double) {
        val hid = hidDevice ?: return
        val dev = getActiveDevice() ?: return

        val totalWheel = dy + remainderWheel
        val intWheel = totalWheel.toInt()
        remainderWheel = totalWheel - intWheel
        if (remainderWheel > 2.0 || remainderWheel < -2.0) remainderWheel = 0.0

        if (intWheel == 0) return

        val clampedWheel = intWheel.coerceIn(-127, 127).toByte()
        val report = byteArrayOf(currentMouseButtons, 0, 0, clampedWheel)
        hid.sendReport(dev, REPORT_ID_MOUSE.toInt(), report)
    }

    @ReactMethod
    fun sendKeyboardKey(hidKeyCode: Int, modifierMask: Int, isDown: Boolean) {
        val hid = hidDevice ?: return
        val dev = getActiveDevice() ?: return

        val keyByte = hidKeyCode.toByte()
        currentModifiers = modifierMask.toByte()

        if (isDown) {
            if (keyByte != 0.toByte()) pressedKeys.add(keyByte)
        } else {
            pressedKeys.remove(keyByte)
        }

        val report = ByteArray(8)
        report[0] = currentModifiers
        report[1] = 0 // reserved

        val keyArray = pressedKeys.take(6).toByteArray()
        System.arraycopy(keyArray, 0, report, 2, keyArray.size)

        hid.sendReport(dev, REPORT_ID_KEYBOARD.toInt(), report)
    }

    @ReactMethod
    fun sendKeyPress(hidKeyCode: Int, modifierMask: Int) {
        sendKeyboardKey(hidKeyCode, modifierMask, true)
        executor.submit {
            try {
                Thread.sleep(20)
            } catch (_: Exception) {}
            sendKeyboardKey(hidKeyCode, modifierMask, false)
        }
    }

    @ReactMethod
    fun releaseAll() {
        val hid = hidDevice ?: return
        val dev = getActiveDevice() ?: return

        currentMouseButtons = 0
        currentModifiers = 0
        pressedKeys.clear()

        // Release mouse
        hid.sendReport(dev, REPORT_ID_MOUSE.toInt(), byteArrayOf(0, 0, 0, 0))
        // Release keyboard
        hid.sendReport(dev, REPORT_ID_KEYBOARD.toInt(), ByteArray(8))
    }
}
