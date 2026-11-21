package org.rescuemesh.ai.mesh

import android.annotation.SuppressLint
import android.content.Context
import android.net.wifi.p2p.WifiP2pConfig
import android.net.wifi.p2p.WifiP2pDevice
import android.net.wifi.p2p.WifiP2pManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket

class WifiDirectManager(
    context: Context,
    private val onPacketReceived: (String) -> Unit
) {
    private val manager = context.getSystemService(Context.WIFI_P2P_SERVICE) as? WifiP2pManager
    private val channel = manager?.initialize(context, context.mainLooper, null)

    private val _peers = MutableStateFlow<List<WifiP2pDevice>>(emptyList())
    val peers: StateFlow<List<WifiP2pDevice>> = _peers

    @SuppressLint("MissingPermission")
    fun discoverPeers() {
        val m = manager ?: return
        val c = channel ?: return
        m.discoverPeers(c, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                m.requestPeers(c) { peerList ->
                    _peers.value = peerList.deviceList.toList()
                }
            }
            override fun onFailure(reason: Int) {}
        })
    }

    @SuppressLint("MissingPermission")
    fun connectAndSend(deviceAddress: String, payloadJson: String, onSent: () -> Unit) {
        val m = manager ?: return
        val c = channel ?: return
        val config = WifiP2pConfig().apply { this.deviceAddress = deviceAddress }
        m.connect(c, config, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                m.requestConnectionInfo(c) { info ->
                    val host = info.groupOwnerAddress?.hostAddress ?: return@requestConnectionInfo
                    if (!info.isGroupOwner) {
                        Thread {
                            runCatching {
                                Socket().use { socket ->
                                    socket.connect(InetSocketAddress(host, 8988), 4000)
                                    PrintWriter(socket.getOutputStream(), true).println(payloadJson)
                                    onSent()
                                }
                            }
                        }.start()
                    }
                }
            }
            override fun onFailure(reason: Int) {}
        })
    }

    suspend fun startGroupOwnerServer() = withContext(Dispatchers.IO) {
        runCatching {
            ServerSocket(8988).use { server ->
                while (true) {
                    server.accept().use { client ->
                        val line = BufferedReader(InputStreamReader(client.getInputStream())).readLine()
                        if (!line.isNullOrBlank()) {
                            onPacketReceived(line)
                        }
                    }
                }
            }
        }
    }
}
