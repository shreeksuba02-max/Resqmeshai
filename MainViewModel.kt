package org.rescuemesh.ai.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import org.rescuemesh.ai.data.local.EmergencyEntity
import org.rescuemesh.ai.data.local.MeshMessageEntity
import org.rescuemesh.ai.data.local.RescueMeshDatabase
import org.rescuemesh.ai.mesh.BleMeshManager
import org.rescuemesh.ai.mesh.MeshRouter
import org.rescuemesh.ai.mesh.WifiDirectManager
import org.rescuemesh.ai.security.CryptoManager
import org.rescuemesh.ai.worker.SyncWorker
import java.time.Instant
import java.util.UUID

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val db = RescueMeshDatabase.getInstance(application)
    private val emergencyDao = db.emergencyDao()
    private val messageDao = db.meshMessageDao()
    private val relayDao = db.relayHistoryDao()

    val emergencies = emergencyDao.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val messages = messageDao.observeMessages()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _connectionState = MutableStateFlow("OFFLINE")
    val connectionState: StateFlow<String> = _connectionState

    private val _selectedRole = MutableStateFlow("SURVIVOR")
    val selectedRole: StateFlow<String> = _selectedRole

    private val _shakeDialogActive = MutableStateFlow(false)
    val shakeDialogActive: StateFlow<Boolean> = _shakeDialogActive

    val router = MeshRouter("RM-ANDROID-LOCAL", messageDao, relayDao)
    val bleManager = BleMeshManager(application) { rawJson ->
        // Route incoming BLE GATT packet into Store-Carry-Forward queue
        viewModelScope.launch {
            _connectionState.value = "MESH CONNECTED"
            // Parse & persist via router.receiveIncomingPacket(...)
        }
    }
    val wifiDirectManager = WifiDirectManager(application) { rawJson ->
        viewModelScope.launch {
            _connectionState.value = "MESH CONNECTED"
        }
    }

    fun selectRole(role: String) {
        _selectedRole.value = role
    }

    fun triggerShakeConfirmation() {
        _shakeDialogActive.value = true
    }

    fun cancelShakeConfirmation() {
        _shakeDialogActive.value = false
    }

    fun createAndBroadcastSos(
        userId: String,
        category: String,
        latitude: Double,
        longitude: Double,
        description: String,
        victimCount: Int,
        injured: Boolean,
        trapped: Boolean
    ) {
        _shakeDialogActive.value = false
        viewModelScope.launch {
            val messageId = "SOS-${UUID.randomUUID().toString().take(8).uppercase()}"
            val timestamp = Instant.now().toString()
            val encrypted = runCatching {
                CryptoManager.encrypt("$messageId|$latitude|$longitude|$description")
            }.getOrDefault("")

            val entity = EmergencyEntity(
                messageId = messageId,
                userId = userId,
                emergencyType = "SOS",
                emergencyCategory = category,
                latitude = latitude,
                longitude = longitude,
                timestamp = timestamp,
                severity = if (trapped || injured) "CRITICAL" else "HIGH",
                severityScore = if (trapped) 92 else 74,
                priority = if (trapped || injured) 1 else 2,
                ttl = 10,
                hopCount = 0,
                status = "STORED_LOCALLY",
                injuryStatus = injured,
                victimCount = victimCount,
                trappedPersonStatus = trapped,
                description = description,
                encryptedPayload = encrypted,
                synced = false,
                expiresAtEpochMs = System.currentTimeMillis() + 24 * 3600 * 1000L
            )

            // 1. Always persist locally in Room first
            emergencyDao.insertIfNew(entity)

            // 2. Enqueue Priority-1 Epidemic mesh packet
            messageDao.insertIfNew(
                MeshMessageEntity(
                    messageId = messageId,
                    senderId = userId,
                    senderName = "Survivor",
                    messageType = "SOS",
                    priorityRank = 1,
                    routingProtocol = "EPIDEMIC",
                    encryptedPayload = encrypted,
                    ttl = 10,
                    hopCount = 0,
                    createdAtEpochMs = System.currentTimeMillis(),
                    expiresAtEpochMs = System.currentTimeMillis() + 12 * 3600 * 1000L,
                    synced = false
                )
            )

            // 3. Broadcast to discovered BLE/Wi-Fi Direct peers
            bleManager.peers.value.forEach { peer ->
                bleManager.sendPacketToPeer(peer.address, "{\"messageId\":\"$messageId\"}")
                emergencyDao.updateDeliveryState(messageId, "NEARBY_DEVICE_RECEIVED", 1)
            }

            // 4. Schedule WorkManager cloud sync when internet returns
            SyncWorker.enqueueWhenOnline(getApplication())
        }
    }
}
