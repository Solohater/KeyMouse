package com.yosephd.pocketinput

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

class InstallerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private val executor = Executors.newSingleThreadExecutor()
    private var pendingSave: Promise? = null
    private var pendingFileName: String? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "InstallerModule"

    private fun readManifest(): JSONObject {
        val text = reactContext.assets.open("installer/manifest.json")
            .bufferedReader()
            .use { it.readText() }
        return JSONObject(text)
    }

    private fun installerFileName(): String {
        val manifest = readManifest()
        val file = manifest.optString("file", "")
        if (file.isBlank()) throw IllegalStateException("Installer manifest has no file name")
        return file
    }

    @ReactMethod
    fun getInstallerInfo(promise: Promise) {
        try {
            val manifest = readManifest()
            val file = manifest.optString("file")
            val info = Arguments.createMap().apply {
                putString("name", manifest.optString("name", "kimo"))
                putString("version", manifest.optString("version"))
                putString("architecture", manifest.optString("architecture"))
                putString("file", file)
                putDouble("size", manifest.optLong("size", 0L).toDouble())
                putString("sha256", manifest.optString("sha256"))
            }
            promise.resolve(info)
        } catch (error: Exception) {
            promise.reject("INSTALLER_MISSING", "The bundled Ubuntu installer is missing.", error)
        }
    }

    @ReactMethod
    fun saveToDownloads(promise: Promise) {
        if (pendingSave != null) {
            promise.reject("BUSY", "Another save operation is already in progress.")
            return
        }
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "The app is not in the foreground.")
            return
        }

        try {
            val fileName = installerFileName()
            pendingSave = promise
            pendingFileName = fileName
            val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "application/vnd.debian.binary-package"
                putExtra(Intent.EXTRA_TITLE, fileName)
            }
            activity.startActivityForResult(intent, REQUEST_SAVE_TO_DOWNLOADS)
        } catch (error: Exception) {
            pendingSave = null
            pendingFileName = null
            promise.reject("SAVE_FAILED", error.message, error)
        }
    }

    @ReactMethod
    fun shareInstaller(promise: Promise) {
        val fileName = try {
            installerFileName()
        } catch (error: Exception) {
            promise.reject("INSTALLER_MISSING", "The bundled Ubuntu installer is missing.", error)
            return
        }

        executor.execute {
            try {
                val directory = File(reactContext.cacheDir, "installer")
                if (!directory.exists() && !directory.mkdirs()) {
                    throw IllegalStateException("Could not create the installer cache directory")
                }
                val target = File(directory, fileName)
                if (!target.exists() || target.length() == 0L) {
                    reactContext.assets.open("installer/$fileName").use { input ->
                        target.outputStream().use { output -> input.copyTo(output) }
                    }
                }

                val uri = FileProvider.getUriForFile(
                    reactContext,
                    "${reactContext.packageName}.fileprovider",
                    target
                )

                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "application/octet-stream"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    putExtra(Intent.EXTRA_SUBJECT, "kiMo Ubuntu installer")
                    clipData = android.content.ClipData.newUri(
                        reactContext.contentResolver,
                        "kiMo installer",
                        uri
                    )
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                val chooser = Intent.createChooser(send, "Share kiMo installer").apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                reactContext.startActivity(chooser)
                promise.resolve(true)
            } catch (error: Exception) {
                promise.reject("SHARE_FAILED", error.message, error)
            }
        }
    }

    override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        if (requestCode != REQUEST_SAVE_TO_DOWNLOADS) return

        val promise = pendingSave
        val fileName = pendingFileName
        pendingSave = null
        pendingFileName = null

        if (promise == null || fileName == null) return
        if (resultCode != Activity.RESULT_OK || data?.data == null) {
            promise.resolve(Arguments.createMap().apply { putBoolean("cancelled", true) })
            return
        }

        val uri: Uri = data.data!!
        executor.execute {
            try {
                val bytes = reactContext.assets.open("installer/$fileName").use { input ->
                    reactContext.contentResolver.openOutputStream(uri)?.use { output ->
                        input.copyTo(output)
                    } ?: throw IllegalStateException("Could not open the selected destination")
                }
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("cancelled", false)
                    putString("uri", uri.toString())
                    putString("fileName", fileName)
                    putDouble("bytes", bytes.toDouble())
                })
            } catch (error: Exception) {
                promise.reject("SAVE_FAILED", error.message, error)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        // No-op.
    }

    companion object {
        private const val REQUEST_SAVE_TO_DOWNLOADS = 4401
    }
}
