package org.rescuemesh.ai.mesh

import org.rescuemesh.ai.data.local.MeshMessageDao
import org.rescuemesh.ai.data.local.MeshMessageEntity
import org.rescuemesh.ai.data.local.RelayHistoryDao
import org.rescuemesh.ai.data.local.RelayHistoryEntity
import java.util.UUID

/**
 * Store-Carry-Forward Mesh Router implementing:
 * 1. Message ID deduplication (prevents loops)
 * 2. TTL decrement & expiration check
 * 3. Priority preemption: 1. SOS > 2. MEDICAL > 3. LOCATION > 4. CHAT
 * 4. Epidemic routing for SOS/MEDICAL; PRoPHET delivery predictability for LOCATION/CHAT
 */
class MeshRouter(
    private val localDeviceId: String,
    private val messageDao: MeshMessageDao,
    private val relayHistoryDao: RelayHistoryDao
) {
    private val prophetPredictability = mutableMapOf<String, Double>()

    fun updatePeerEncounter(peerId: String) {
        val prev = prophetPredictability[peerId] ?: 0.0
        prophetPredictability[peerId] = prev + (1.0 - prev) * 0.75
        // Age other encounters
        prophetPredictability.keys.filter { it != peerId }.forEach { other ->
            prophetPredictability[other] = (prophetPredictability[other] ?: 0.0) * 0.98
        }
    }

    suspend fun receiveIncomingPacket(
        packet: MeshMessageEntity,
        fromNodeId: String,
        transport: String,
        rssi: Int
    ): Boolean {
        val now = System.currentTimeMillis()
        // 1. Validate expiration & TTL
        if (packet.ttl <= 0 || packet.expiresAtEpochMs <= now) {
            return false
        }
        // 2. Deduplication check
        if (messageDao.exists(packet.messageId)) {
            return false
        }
        // 3. Store locally with decremented TTL & incremented hopCount
        val stored = packet.copy(
            ttl = packet.ttl - 1,
            hopCount = packet.hopCount + 1
        )
        messageDao.insertIfNew(stored)
        relayHistoryDao.insert(
            RelayHistoryEntity(
                id = UUID.randomUUID().toString(),
                messageId = packet.messageId,
                fromNodeId = fromNodeId,
                toNodeId = localDeviceId,
                transport = transport,
                hopNumber = stored.hopCount,
                rssi = rssi,
                relayedAtEpochMs = now
            )
        )
        return true
    }

    suspend fun selectPacketsForPeer(peerId: String): List<MeshMessageEntity> {
        val now = System.currentTimeMillis()
        val queue = messageDao.getForwardingQueue(now)
        val predictability = prophetPredictability[peerId] ?: 0.25

        // Priority-sorted queue ensures SOS/MEDICAL preempt CHAT
        return queue.filter { msg ->
            if (msg.messageType == "SOS" || msg.messageType == "MEDICAL") {
                true // Epidemic: always forward SOS/Medical
            } else {
                predictability >= 0.45 // PRoPHET threshold for Location/Chat
            }
        }
    }
}
