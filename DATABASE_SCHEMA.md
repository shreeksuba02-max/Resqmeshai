# RescueMesh AI — Database Schema

## Android Room Entities (`RescueMeshDatabase` v2)
1. `UserEntity` (`users`): `userId` (PK), `name`, `email`, `phone`, `role`, `bloodGroup`, `medicalNotes`, `deviceId`, `createdAt`
2. `EmergencyEntity` (`emergencies`): `messageId` (PK), `userId`, `emergencyType`, `emergencyCategory`, `latitude`, `longitude`, `timestamp`, `severity`, `severityScore`, `priority`, `ttl`, `hopCount`, `status`, `injuryStatus`, `victimCount`, `firePresent`, `floodSeverity`, `medicalUrgency`, `trappedPersonStatus`, `reportedDangerLevel`, `description`, `encryptedPayload`, `synced`, `syncedAt`, `expiresAtEpochMs`
3. `MeshMessageEntity` (`mesh_messages`): `messageId` (PK), `senderId`, `senderName`, `messageType`, `priorityRank`, `routingProtocol`, `encryptedPayload`, `ttl`, `hopCount`, `createdAtEpochMs`, `expiresAtEpochMs`, `synced`
4. `RelayHistoryEntity` (`relay_history`): `id` (PK), `messageId`, `fromNodeId`, `toNodeId`, `transport`, `hopNumber`, `rssi`, `relayedAtEpochMs`
5. `RescueTeamEntity` (`rescue_teams`): `teamId` (PK), `name`, `callSign`, `specialty`, `status`, `latitude`, `longitude`
6. `DispatchEntity` (`dispatches`): `dispatchId` (PK), `emergencyId`, `teamId`, `notes`, `status`, `createdAt`

Indexed columns: `emergencies(synced)`, `emergencies(priority, timestamp)`, `mesh_messages(priorityRank, createdAtEpochMs)`.
Migration `MIGRATION_1_2` safely adds `encryptedPayload` without data loss.
