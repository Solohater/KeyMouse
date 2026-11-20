package com.yosephd.pocketinput

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException
import kotlin.concurrent.thread

/**
 * Exposes the phone's current IPv4 addresses and performs UDP discovery on the
 * companion's beacon port. This lets kiMo find the PC on Wi-Fi, a phone hotspot,
 * or a USB-tethering link without hardcoding 127.0.0.1 or a guessed subnet.
 */
class NetworkDiscoveryModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "NetworkDiscoveryModule"

    @ReactMethod
    fun getLocalIpv4Addresses(promise: Promise) {
        try {
            val result = Arguments.createArray()
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (!iface.isUp || iface.isLoopback) continue
                for (address in iface.inetAddresses) {
                    if (address is Inet4Address && !address.isLoopbackAddress && !address.isLinkLocalAddress) {
                        val host = address.hostAddress ?: continue
                        if (host.isNotBlank() && !host.startsWith("127.")) {
                            result.pushString(host)
                        }
                    }
                }
            }
            promise.resolve(result)
        } catch (error: Exception) {
            promise.reject("LOCAL_IP_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun discover(timeoutMs: Double, promise: Promise) {
        thread(name = "kimo-udp-discovery", isDaemon = true) {
            var socket: DatagramSocket? = null
            try {
                val timeout = timeoutMs.toInt().coerceIn(500, 5000)
                socket = DatagramSocket(null)
                socket.reuseAddress = true
                socket.bind(InetSocketAddress(4243))
                socket.broadcast = true
                socket.soTimeout = 250

                val request = "{\"type\":\"DISCOVER_POCKETINPUT\"}".toByteArray(Charsets.UTF_8)
                val broadcast = InetAddress.getByName("255.255.255.255")
                socket.send(DatagramPacket(request, request.size, broadcast, 4243))

                val deadline = System.currentTimeMillis() + timeout
                val buffer = ByteArray(4096)
                var result: WritableMap? = null

                while (System.currentTimeMillis() < deadline && result == null) {
                    try {
                        val packet = DatagramPacket(buffer, buffer.size)
                        socket.receive(packet)
                        val text = String(packet.data, 0, packet.length, Charsets.UTF_8)
                        val json = JSONObject(text)
                        val type = json.optString("type")
                        if (type != "POCKETINPUT_OFFER" && type != "POCKETINPUT_BEACON") {
                            continue
                        }

                        val hosts = Arguments.createArray()
                        val ips = json.optJSONArray("ips")
                        if (ips != null) {
                            for (index in 0 until ips.length()) {
                                val ip = ips.optString(index)
                                if (ip.isNotBlank()) hosts.pushString(ip)
                            }
                        }

                        val primaryIp = json.optString("primaryIp")
                        if (primaryIp.isNotBlank()) hosts.pushString(primaryIp)
                        // The packet sender is the most reliable address for
                        // tethering and multi-interface PCs.
                        packet.address?.hostAddress?.let { hosts.pushString(it) }

                        result = Arguments.createMap().apply {
                            putArray("hosts", hosts)
                            putString("primaryIp", primaryIp)
                            putInt("port", json.optInt("port", 4242))
                            putString("serverName", json.optString("serverName"))
                        }
                    } catch (_: SocketTimeoutException) {
                        // Keep listening until the deadline.
                    }
                }

                if (result != null) {
                    promise.resolve(result)
                } else {
                    promise.resolve(Arguments.createMap().apply {
                        putArray("hosts", Arguments.createArray())
                        putInt("port", 4242)
                    })
                }
            } catch (error: Exception) {
                promise.reject("DISCOVERY_FAILED", error.message, error)
            } finally {
                try {
                    socket?.close()
                } catch (_: Exception) {
                }
            }
        }
    }
}
